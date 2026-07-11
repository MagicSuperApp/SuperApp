//! Tầng 1 — MLS RFC 9420 (OpenMLS fork, ciphersuite P-256).
//!
//! Bọc OpenMLS (bản fork vendored đã patch expose `epoch_secret`) thành API gọn cho
//! chat: sinh KeyPackage, tạo/join nhóm, xử lý commit, lấy epoch_secret để nuôi tầng 2.
//! Mọi object wire (KeyPackage/Welcome/Commit) đi ra/vào dưới dạng base64 để bắc cầu RN.
//!
//! ⚠️ epoch_secret của fork nằm trong RAM, mất khi `MlsGroup::load`. Session này giữ
//! nhóm trong RAM nên ổn khi app còn sống; khôi phục sau restart xử lý ở tầng store (pha sau).

use std::collections::HashMap;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use serde::{Deserialize, Serialize};
use tls_codec::{Deserialize as _, Serialize as _};

use crate::{ChatMlsError, Result};

const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMP256_AES128GCM_SHA256_P256;

fn err<E: std::fmt::Display>(e: E) -> ChatMlsError {
    ChatMlsError::Crypto(e.to_string())
}

/// Kết quả tạo/join nhóm — trả về cho lớp trên (đủ để publish epoch-sync + nuôi tầng 2).
#[derive(Debug, Clone)]
pub struct GroupState {
    pub epoch: u64,
    pub epoch_secret_hex: Option<String>,
    /// Có khi tạo nhóm + add thành viên (gửi cho người mới join).
    pub welcome_b64: Option<String>,
    /// Commit gửi cho thành viên hiện hữu xử lý (epoch-sync).
    pub commit_b64: Option<String>,
}

/// Blob trạng thái để persist (JSON). Byte thô mã hoá base64.
#[derive(Serialize, Deserialize)]
struct StatePayload {
    version: u32,
    stake_address: String,
    /// Khoá ký public (private nằm sẵn trong `storage` do `signer.store()`).
    signer_public_b64: String,
    /// OpenMLS storage KV (base64 key, base64 value).
    storage: Vec<(String, String)>,
    epoch_secrets: Vec<EpochSecretEntry>,
    /// group_id (=utf8 conversationId) base64 — để mở lại nhóm khi import.
    conversations_b64: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct EpochSecretEntry {
    conv_b64: String,
    epoch: u64,
    secret_b64: String,
}

/// Một danh tính MLS trên thiết bị (một stakeAddress + một device). Giữ provider,
/// khoá ký, credential và các nhóm đang mở.
pub struct MlsIdentity {
    provider: OpenMlsRustCrypto,
    signer: SignatureKeyPair,
    credential_with_key: CredentialWithKey,
    stake_address: String,
    groups: HashMap<Vec<u8>, MlsGroup>,
    /// Cache epoch_secret theo (group_id, epoch) — như store `mls-epoch-keys` của web.
    /// Cần thiết vì fork OpenMLS chỉ giữ epoch_secret trong RAM (mất khi `MlsGroup::load`),
    /// và để giải mã tin cũ ở epoch trước sau khi nhóm đổi epoch.
    epoch_secrets: HashMap<(Vec<u8>, u64), Vec<u8>>,
}

impl MlsIdentity {
    /// Tạo danh tính mới cho `stake_address` (sinh khoá ký P-256, lưu vào provider).
    pub fn new(stake_address: &str) -> Result<Self> {
        let provider = OpenMlsRustCrypto::default();
        let signer = SignatureKeyPair::new(CIPHERSUITE.signature_algorithm()).map_err(err)?;
        signer.store(provider.storage()).map_err(err)?;

        let credential = BasicCredential::new(stake_address.as_bytes().to_vec());
        let credential_with_key = CredentialWithKey {
            credential: credential.into(),
            signature_key: signer.public().into(),
        };
        Ok(Self {
            provider,
            signer,
            credential_with_key,
            stake_address: stake_address.to_string(),
            groups: HashMap::new(),
            epoch_secrets: HashMap::new(),
        })
    }

    /// Sinh KeyPackage (wire `mls_key_package`) base64 để publish lên BE `/mls/keypackage`.
    pub fn generate_key_package(&self) -> Result<String> {
        let bundle = KeyPackage::builder()
            .build(CIPHERSUITE, &self.provider, &self.signer, self.credential_with_key.clone())
            .map_err(err)?;
        let wire = MlsMessageOut::from(bundle.key_package().clone())
            .tls_serialize_detached()
            .map_err(err)?;
        Ok(B64.encode(wire))
    }

    /// Tạo nhóm cho `conversation_id` (group_id = utf8(conversation_id), khớp ts-mls),
    /// tuỳ chọn add luôn danh sách KeyPackage (base64 wire) của thành viên khác.
    pub fn create_group(
        &mut self,
        conversation_id: &str,
        member_key_packages_b64: &[String],
    ) -> Result<GroupState> {
        let cfg = MlsGroupCreateConfig::builder()
            .ciphersuite(CIPHERSUITE)
            .use_ratchet_tree_extension(true) // nhúng ratchet tree vào Welcome (như ts-mls)
            .build();

        let mut group = MlsGroup::new_with_group_id(
            &self.provider,
            &self.signer,
            &cfg,
            GroupId::from_slice(conversation_id.as_bytes()),
            self.credential_with_key.clone(),
        )
        .map_err(err)?;

        let mut welcome_b64 = None;
        let mut commit_b64 = None;

        if !member_key_packages_b64.is_empty() {
            let kps = self.decode_key_packages(member_key_packages_b64)?;
            let (commit, welcome, _group_info) =
                group.add_members(&self.provider, &self.signer, &kps).map_err(err)?;
            group.merge_pending_commit(&self.provider).map_err(err)?;
            welcome_b64 = Some(B64.encode(welcome.tls_serialize_detached().map_err(err)?));
            commit_b64 = Some(B64.encode(commit.tls_serialize_detached().map_err(err)?));
        }

        let state = self.snapshot(&group, welcome_b64, commit_b64);
        self.cache_epoch_secret(conversation_id.as_bytes(), &group);
        self.groups.insert(conversation_id.as_bytes().to_vec(), group);
        Ok(state)
    }

    /// Join nhóm từ Welcome (base64 wire) do người khác gửi.
    pub fn join_from_welcome(&mut self, welcome_b64: &str) -> Result<GroupState> {
        let bytes = B64.decode(welcome_b64).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
        let msg = MlsMessageIn::tls_deserialize_exact(&bytes).map_err(err)?;
        let welcome = match msg.extract() {
            MlsMessageBodyIn::Welcome(w) => w,
            other => return Err(err(format!("kỳ vọng Welcome, nhận: {other:?}"))),
        };
        let staged = StagedWelcome::new_from_welcome(
            &self.provider,
            &MlsGroupJoinConfig::default(),
            welcome,
            None, // ratchet tree nằm trong Welcome extension
        )
        .map_err(err)?;
        let group = staged.into_group(&self.provider).map_err(err)?;

        let state = self.snapshot(&group, None, None);
        let conv = group.group_id().as_slice().to_vec();
        self.cache_epoch_secret(&conv, &group);
        self.groups.insert(conv, group);
        Ok(state)
    }

    /// Xử lý một Commit (base64 wire) đến từ thành viên khác (epoch-sync).
    pub fn process_commit(&mut self, conversation_id: &str, commit_b64: &str) -> Result<GroupState> {
        let bytes = B64.decode(commit_b64).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
        let msg = MlsMessageIn::tls_deserialize_exact(&bytes).map_err(err)?;
        let protocol_msg: ProtocolMessage = msg
            .try_into_protocol_message()
            .map_err(|e| err(format!("không phải protocol message: {e:?}")))?;

        let (epoch, es_opt) = {
            let group = self
                .groups
                .get_mut(conversation_id.as_bytes())
                .ok_or_else(|| err("chưa mở nhóm này"))?;
            let processed = group.process_message(&self.provider, protocol_msg).map_err(err)?;
            if let ProcessedMessageContent::StagedCommitMessage(staged) = processed.into_content() {
                group.merge_staged_commit(&self.provider, *staged).map_err(err)?;
            }
            (group.epoch().as_u64(), group.epoch_secret().map(|s| s.to_vec()))
        };
        if let Some(es) = &es_opt {
            self.epoch_secrets.insert((conversation_id.as_bytes().to_vec(), epoch), es.clone());
        }
        Ok(GroupState { epoch, epoch_secret_hex: es_opt.map(hex::encode), welcome_b64: None, commit_b64: None })
    }

    /// `epoch_secret` (hex) của nhóm ở epoch HIỆN TẠI — nuôi tầng 2 khi gửi tin.
    /// Đọc từ cache nên vẫn có sau `import_state` (khác `MlsGroup::epoch_secret()` = None sau load).
    pub fn epoch_secret_hex(&self, conversation_id: &str) -> Option<String> {
        let epoch = self.groups.get(conversation_id.as_bytes())?.epoch().as_u64();
        self.epoch_secret_for(conversation_id, epoch)
    }

    /// `epoch_secret` (hex) của một epoch cụ thể — để giải mã tin cũ (tin mang epoch của nó).
    pub fn epoch_secret_for(&self, conversation_id: &str, epoch: u64) -> Option<String> {
        self.epoch_secrets
            .get(&(conversation_id.as_bytes().to_vec(), epoch))
            .map(hex::encode)
    }

    /// Epoch hiện tại của nhóm.
    pub fn current_epoch(&self, conversation_id: &str) -> Option<u64> {
        self.groups.get(conversation_id.as_bytes()).map(|g| g.epoch().as_u64())
    }

    // ---- persistence (xuất/nhập toàn bộ trạng thái cho lớp native lưu mã hoá) ----

    /// Xuất toàn bộ trạng thái (OpenMLS storage + cache epoch_secret + khoá ký) thành bytes.
    /// Lớp native lưu blob này (nên mã hoá qua Keychain/Keystore của TAAD Enclave).
    pub fn export_state(&self) -> Result<Vec<u8>> {
        let storage = {
            let values = self
                .provider
                .storage()
                .values
                .read()
                .map_err(|_| err("không đọc được storage"))?;
            values.iter().map(|(k, v)| (B64.encode(k), B64.encode(v))).collect()
        };
        let epoch_secrets = self
            .epoch_secrets
            .iter()
            .map(|((conv, epoch), secret)| EpochSecretEntry {
                conv_b64: B64.encode(conv),
                epoch: *epoch,
                secret_b64: B64.encode(secret),
            })
            .collect();
        let conversations_b64 = self.groups.keys().map(|k| B64.encode(k)).collect();

        let payload = StatePayload {
            version: 1,
            stake_address: self.stake_address.clone(),
            signer_public_b64: B64.encode(self.signer.to_public_vec()),
            storage,
            epoch_secrets,
            conversations_b64,
        };
        serde_json::to_vec(&payload).map_err(|e| ChatMlsError::Encoding(e.to_string()))
    }

    /// Khôi phục danh tính từ blob [`export_state`]. Nạp lại OpenMLS storage, khoá ký,
    /// cache epoch_secret và mở lại các nhóm.
    pub fn import_state(bytes: &[u8]) -> Result<Self> {
        let payload: StatePayload =
            serde_json::from_slice(bytes).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;

        let provider = OpenMlsRustCrypto::default();
        {
            let mut values = provider
                .storage()
                .values
                .write()
                .map_err(|_| err("không ghi được storage"))?;
            for (k, v) in &payload.storage {
                let key = B64.decode(k).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
                let val = B64.decode(v).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
                values.insert(key, val);
            }
        }

        let public = B64.decode(&payload.signer_public_b64).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
        // Private key nằm trong storage vừa nạp (do signer.store() lúc tạo) → đọc lại.
        let signer = SignatureKeyPair::read(provider.storage(), &public, CIPHERSUITE.signature_algorithm())
            .ok_or_else(|| err("không đọc được signature keypair từ storage đã nạp"))?;
        let credential_with_key = CredentialWithKey {
            credential: BasicCredential::new(payload.stake_address.as_bytes().to_vec()).into(),
            signature_key: signer.public().into(),
        };

        let mut epoch_secrets = HashMap::new();
        for e in &payload.epoch_secrets {
            let conv = B64.decode(&e.conv_b64).map_err(|er| ChatMlsError::Encoding(er.to_string()))?;
            let secret = B64.decode(&e.secret_b64).map_err(|er| ChatMlsError::Encoding(er.to_string()))?;
            epoch_secrets.insert((conv, e.epoch), secret);
        }

        let mut groups = HashMap::new();
        for conv_b64 in &payload.conversations_b64 {
            let conv = B64.decode(conv_b64).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
            if let Some(group) =
                MlsGroup::load(provider.storage(), &GroupId::from_slice(&conv)).map_err(err)?
            {
                groups.insert(conv, group);
            }
        }

        Ok(Self {
            provider,
            signer,
            credential_with_key,
            stake_address: payload.stake_address,
            groups,
            epoch_secrets,
        })
    }

    // ---- nội bộ ----
    fn cache_epoch_secret(&mut self, conv: &[u8], group: &MlsGroup) {
        if let Some(es) = group.epoch_secret() {
            self.epoch_secrets.insert((conv.to_vec(), group.epoch().as_u64()), es.to_vec());
        }
    }

    fn decode_key_packages(&self, list_b64: &[String]) -> Result<Vec<KeyPackage>> {
        let mut out = Vec::with_capacity(list_b64.len());
        for kp_b64 in list_b64 {
            let bytes = B64.decode(kp_b64).map_err(|e| ChatMlsError::Encoding(e.to_string()))?;
            let msg = MlsMessageIn::tls_deserialize_exact(&bytes).map_err(err)?;
            let kp_in = match msg.extract() {
                MlsMessageBodyIn::KeyPackage(kp) => kp,
                other => return Err(err(format!("kỳ vọng KeyPackage, nhận: {other:?}"))),
            };
            let kp = kp_in
                .validate(self.provider.crypto(), ProtocolVersion::Mls10)
                .map_err(err)?;
            out.push(kp);
        }
        Ok(out)
    }

    fn snapshot(&self, group: &MlsGroup, welcome_b64: Option<String>, commit_b64: Option<String>) -> GroupState {
        snapshot_of(group, welcome_b64, commit_b64)
    }
}

fn snapshot_of(group: &MlsGroup, welcome_b64: Option<String>, commit_b64: Option<String>) -> GroupState {
    GroupState {
        epoch: group.epoch().as_u64(),
        epoch_secret_hex: group.epoch_secret().map(hex::encode),
        welcome_b64,
        commit_b64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// alice tạo nhóm + add bob → bob join → hai bên PHẢI cùng epoch_secret.
    /// Chứng minh fork OpenMLS expose epoch_secret hoạt động trong crate production.
    #[test]
    fn alice_bob_agree_epoch_secret() {
        let mut alice = MlsIdentity::new("alice-stake").unwrap();
        let mut bob = MlsIdentity::new("bob-stake").unwrap();

        let bob_kp = bob.generate_key_package().unwrap();
        let created = alice.create_group("conv-1", &[bob_kp]).unwrap();
        assert!(created.welcome_b64.is_some(), "phải có welcome khi add bob");
        let alice_es = created.epoch_secret_hex.clone().expect("alice epoch_secret");

        let joined = bob.join_from_welcome(created.welcome_b64.as_ref().unwrap()).unwrap();
        let bob_es = joined.epoch_secret_hex.clone().expect("bob epoch_secret");

        assert_eq!(created.epoch, joined.epoch, "epoch phải bằng nhau");
        assert_eq!(alice_es, bob_es, "epoch_secret alice và bob PHẢI khớp");
    }

    /// Tích hợp tầng 1 → tầng 2: dùng epoch_secret thật để mã hoá & giải mã một tin.
    #[test]
    fn end_to_end_encrypt_with_real_epoch_secret() {
        use crate::message_layer::{decrypt, encrypt_new, PlainContent};

        let mut alice = MlsIdentity::new("alice-stake").unwrap();
        let mut bob = MlsIdentity::new("bob-stake").unwrap();
        let bob_kp = bob.generate_key_package().unwrap();
        let created = alice.create_group("conv-1", &[bob_kp]).unwrap();
        bob.join_from_welcome(created.welcome_b64.as_ref().unwrap()).unwrap();

        let es_hex = alice.epoch_secret_hex("conv-1").unwrap();
        let es = hex::decode(&es_hex).unwrap();

        let plain = PlainContent { salt: "ab".repeat(32), nonce: String::new(), plaintext: "chào bob".into() };
        let body = encrypt_new(&es, created.epoch, &plain).unwrap();

        // bob dùng epoch_secret của mình (bằng của alice) để giải mã
        let bob_es = hex::decode(bob.epoch_secret_hex("conv-1").unwrap()).unwrap();
        let got = decrypt(&bob_es, &body).unwrap();
        assert_eq!(got.plaintext, "chào bob");
    }

    /// Persist: export → import PHẢI giữ nguyên nhóm + epoch_secret (qua reload/restart).
    #[test]
    fn export_import_preserves_group_and_epoch_secret() {
        use crate::message_layer::{decrypt, encrypt_new, PlainContent};

        let mut alice = MlsIdentity::new("alice-stake").unwrap();
        let mut bob = MlsIdentity::new("bob-stake").unwrap();
        let bob_kp = bob.generate_key_package().unwrap();
        let created = alice.create_group("conv-1", &[bob_kp]).unwrap();
        bob.join_from_welcome(created.welcome_b64.as_ref().unwrap()).unwrap();

        let es_before = alice.epoch_secret_hex("conv-1").unwrap();

        // alice mã hoá 1 tin TRƯỚC khi "restart"
        let plain = PlainContent { salt: "cd".repeat(32), nonce: String::new(), plaintext: "tin trước restart".into() };
        let es = hex::decode(&es_before).unwrap();
        let body = encrypt_new(&es, created.epoch, &plain).unwrap();

        // "restart": export rồi import lại (fork mất epoch_secret khi load — cache phải cứu)
        let blob = alice.export_state().unwrap();
        let alice2 = MlsIdentity::import_state(&blob).unwrap();

        // epoch_secret vẫn còn sau import
        let es_after = alice2.epoch_secret_hex("conv-1").expect("epoch_secret phải sống qua import");
        assert_eq!(es_before, es_after, "epoch_secret lệch sau import");
        assert_eq!(alice2.current_epoch("conv-1"), Some(created.epoch), "nhóm phải mở lại đúng epoch");

        // giải mã được tin đã mã hoá trước restart
        let es2 = hex::decode(&es_after).unwrap();
        let got = decrypt(&es2, &body).unwrap();
        assert_eq!(got.plaintext, "tin trước restart");
    }
}
