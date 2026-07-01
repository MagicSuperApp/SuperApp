// ================================================================
// PhoenixKey — Staking + delegation TX builder (ISPO foundation)
//
// Build + sign Cardano staking transactions in rust_core: stake-key
// registration, pool delegation, MULTI-POOL delegation (ISPO core), reward
// withdrawal, Conway vote delegation (DRep) and stake-key deregistration.
//
// ── CỐT LÕI (đọc kỹ trước khi sửa) ──────────────────────────────────────────
//   CARDANO: 1 stake key ⇒ 1 pool. Một stake credential chỉ ủy thác ĐÚNG MỘT
//   pool tại một thời điểm — KHÔNG thể chia 1 stake key cho nhiều pool.
//
//   → ĐA POOL = ĐA ACCOUNT. Mỗi CIP-1852 `account'` có stake key RIÊNG
//     (`m/1852'/1815'/account'/2/0`), mỗi stake key ủy thác 1 pool. Một
//     transaction CÓ THỂ chứa NHIỀU certificate cho các stake credential KHÁC
//     nhau — đó là cách `build_multi_pool_delegation_tx` gộp N ủy thác (mỗi cái
//     một account) vào MỘT tx: N output (nạp vốn về base_addr của mỗi account)
//     + N StakeRegistration + N StakeDelegation, ký bằng MỌI stake key liên
//     quan + payment key của ví nguồn.
//
//   VD ISPO 100k ADA: acct1 50k→poolLAMP, acct2 30k→poolMAGIC, acct3 20k→pool
//   hiện tại. Vốn nằm ở base address của từng account (payment_cred(account) +
//   stake_cred(account)); chỉ khi stake key của account đó được ủy thác thì
//   lovelace tại địa chỉ đó mới sinh reward cho pool tương ứng.
//
// ── Mô hình eUTXO / phí ──────────────────────────────────────────────────────
//   - Vốn chi tiêu: UTxO của ví NGUỒN = base address tại `account = 0` (ví cố
//     định) trừ khi caller chỉ định khác qua `funding_account`. add_inputs_from
//     (CIP-2 LargestFirst) chọn input phủ (Σ output + Σ deposit + fee).
//   - key_deposit (≈2 ADA / stake key) được build_tx_builder nạp vào
//     TransactionBuilderConfig; add_change_if_needed TỰ trừ deposit khỏi change
//     khi có StakeRegistration → không cần tính tay (CSL enforces).
//   - Withdrawal: số reward rút được CỘNG vào input ngầm (implicit input) nên
//     change tự tăng đúng bằng reward − fee; reward_address phải là stake
//     credential ĐÃ đăng ký & có reward.
//
// ── Witness ──────────────────────────────────────────────────────────────────
//   - StakeRegistration KHÔNG cần witness (ledger: reg không cần chữ ký stake).
//   - StakeDelegation / StakeDeregistration / VoteDelegation / Withdrawal CẦN
//     chữ ký của stake key tương ứng.
//   - Mọi tx cần chữ ký payment key của ví nguồn (chi UTxO input).
//   → Ta ký: 1 payment vkey (ví nguồn) + tập DISTINCT stake vkey của các account
//     có cert cần witness. CSL ẩn hash_transaction ở 13.x → BLAKE2b-256 body
//     bytes tự tay (giống transfer.rs / taad_did.rs).
//
// ── 4 trục quyết định (mandate anh Aladin) ───────────────────────────────────
//   * Dài hạn: cùng FFI shape mọi team Cardano lái được; tái dùng
//     build_tx_builder để fee/param single-sourced; đa-account = nền ISPO mở.
//   * First-principles: ủy thác = "đăng ký stake key + trỏ nó tới 1 pool"; đa
//     pool = lặp lại trên nhiều stake key độc lập trong cùng 1 tx.
//   * Tối ưu: gộp N ủy thác trong 1 tx (1 fee, 1 lần ký payment) thay vì N tx;
//     LargestFirst → ít input → tx nhỏ → phí thấp.
//   * User + bền vững: lỗi bất kỳ (seed sai / thiếu UTxO / pool bech32 sai) →
//     trả "" (KHÔNG bao giờ tx hỏng đốt phí trên submit chắc-thất-bại); seed
//     không rời FFI dưới dạng nào ngoài tham số đầu vào.

use crate::cardano;
use crate::taad_did::build_tx_builder;
use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use cardano_serialization_lib as csl;
use cardano_serialization_lib::{
    Address, BigNum, Bip32PrivateKey, Certificate, CertificatesBuilder, CoinSelectionStrategyCIP2,
    Credential, DRep, Ed25519KeyHash, RewardAddress, StakeDelegation, StakeDeregistration,
    StakeRegistration, Transaction, TransactionHash, TransactionInput, TransactionOutput,
    TransactionOutputBuilder, TransactionUnspentOutput, TransactionUnspentOutputs,
    TransactionWitnessSet, Value, VoteDelegation, Vkeywitnesses,
};
use serde::{Deserialize, Deserializer};
use serde_json::Value as JsonValue;

type Blake2b256 = Blake2b<U32>;

use crate::utils;

/// Deserialize a u64 quantity sent as a JSON string OR number (lovelace can pass
/// Dart `int` range). Mirrors `transfer::de_u64_str` so the FFI quantity contract
/// is identical across builders.
fn de_u64_str<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::Error;
    let v = JsonValue::deserialize(deserializer)?;
    match v {
        JsonValue::String(s) => s
            .parse::<u64>()
            .map_err(|_| D::Error::custom("quantity string is not a valid u64")),
        JsonValue::Number(n) => n
            .as_u64()
            .ok_or_else(|| D::Error::custom("quantity number does not fit u64")),
        _ => Err(D::Error::custom("quantity must be a u64 string or number")),
    }
}

/// One UTxO of the funding wallet — same shape as `transfer::TransferUtxo` but
/// staking spends are ADA-only on the funding side, so `assets` is tolerated but
/// the builders never emit asset outputs.
#[derive(Deserialize, Debug, Clone)]
struct StakeUtxo {
    tx_hash: String,
    index: u32,
    #[serde(deserialize_with = "de_u64_str")]
    lovelace: u64,
    #[serde(default)]
    assets: Vec<StakeAsset>,
}

#[derive(Deserialize, Debug, Clone)]
struct StakeAsset {
    policy: String,
    name: String,
    #[serde(deserialize_with = "de_u64_str")]
    quantity: u64,
}

/// One allocation for `build_multi_pool_delegation_tx`: route `lovelace` to the
/// base address of CIP-1852 `account`, register that account's stake key, and
/// delegate it to `pool_bech32`. N allocations = N independent stake keys.
#[derive(Deserialize, Debug, Clone)]
struct Allocation {
    account: u32,
    #[serde(deserialize_with = "de_u64_str")]
    lovelace: u64,
    pool_bech32: String,
}

// ── Internal derivation helpers ──────────────────────────────────────────────

/// Derive the STAKE `Bip32PrivateKey` for a CIP-1852 account index.
/// Path `m/1852'/1815'/account'/2/0`. The stake key is what a delegation /
/// withdrawal / vote-delegation cert is keyed on (NOT the payment key). Returns
/// `None` on invalid seed length. Crate-local — never crosses FFI.
fn derive_stake_xprv_account(seed_hex: &str, account: u32) -> Option<Bip32PrivateKey> {
    let entropy = match utils::hex_to_bytes(seed_hex) {
        Ok(b) if b.len() == 32 => b,
        _ => return None,
    };
    let root = Bip32PrivateKey::from_bip39_entropy(&entropy, &[]);
    Some(
        root.derive(cardano::harden(1852))
            .derive(cardano::harden(1815))
            .derive(cardano::harden(account))
            .derive(2)
            .derive(0),
    )
}

/// Stake `Credential` (keyhash) for a CIP-1852 account index — the credential
/// every staking cert + the reward address are keyed on.
fn stake_credential_account(seed_hex: &str, account: u32) -> Option<Credential> {
    let xprv = derive_stake_xprv_account(seed_hex, account)?;
    Some(Credential::from_keyhash(&xprv.to_raw_key().to_public().hash()))
}

/// Build CSL `TransactionUnspentOutputs` from the caller's funding UTxO list at
/// `funding_addr`. Carries any native assets so multiasset UTxO can still fund
/// the spend (the selector returns the assets as change). Mirrors
/// `transfer::build_unspent_outputs`.
fn build_unspent_outputs(
    utxos: &[StakeUtxo],
    funding_addr: &Address,
) -> Result<TransactionUnspentOutputs, &'static str> {
    use cardano_serialization_lib::{AssetName, MultiAsset, ScriptHash};
    let mut outs = TransactionUnspentOutputs::new();
    for u in utxos {
        let tx_in = TransactionInput::new(
            &TransactionHash::from_hex(&u.tx_hash)
                .map_err(|_| "utxo tx_hash is not valid 32-byte hex")?,
            u.index,
        );
        let value = if u.assets.is_empty() {
            Value::new(&BigNum::from(u.lovelace))
        } else {
            let mut ma = MultiAsset::new();
            for a in &u.assets {
                let policy_bytes =
                    hex::decode(&a.policy).map_err(|_| "utxo asset policy is not valid hex")?;
                if policy_bytes.len() != 28 {
                    return Err("utxo asset policy must decode to 28 bytes");
                }
                let policy = ScriptHash::from_bytes(policy_bytes)
                    .map_err(|_| "utxo asset policy is not a valid script hash")?;
                let name_bytes =
                    hex::decode(&a.name).map_err(|_| "utxo asset name is not valid hex")?;
                let asset_name =
                    AssetName::new(name_bytes).map_err(|_| "utxo asset name exceeds 32 bytes")?;
                ma.set_asset(&policy, &asset_name, &BigNum::from(a.quantity));
            }
            Value::new_with_assets(&BigNum::from(u.lovelace), &ma)
        };
        let output = TransactionOutput::new(funding_addr, &value);
        outs.add(&TransactionUnspentOutput::new(&tx_in, &output));
    }
    Ok(outs)
}

/// Finalize: build body, BLAKE2b-256 the body bytes (CSL 13 hides
/// hash_transaction), sign with EVERY supplied xprv (dedup'd by the caller),
/// return signed-tx CBOR hex. `signers` = payment key of the funding wallet +
/// each DISTINCT stake key whose cert needs a witness.
fn finalize_and_sign(
    tb: &mut csl::TransactionBuilder,
    funding_addr: &Address,
    signers: Vec<Bip32PrivateKey>,
) -> Result<String, &'static str> {
    // Change (incl. auto-deducted cert deposits) back to the funding wallet.
    tb.add_change_if_needed(funding_addr)
        .map_err(|_| "add_change_if_needed failed — insufficient input for deposit + fee + change")?;

    let tx_body = tb
        .build()
        .map_err(|_| "TransactionBuilder.build failed (coin selection / min fee)")?;

    let mut h = Blake2b256::new();
    h.update(tx_body.to_bytes());
    let tx_hash_bytes = h.finalize();
    let tx_hash = TransactionHash::from_bytes(tx_hash_bytes.to_vec())
        .map_err(|_| "TransactionHash::from_bytes failed (length mismatch)")?;

    let mut witnesses = TransactionWitnessSet::new();
    let mut vkeys = Vkeywitnesses::new();
    for xprv in &signers {
        let vkey_witness = csl::make_vkey_witness(&tx_hash, &xprv.to_raw_key());
        vkeys.add(&vkey_witness);
    }
    witnesses.set_vkeys(&vkeys);

    let tx = Transaction::new(&tx_body, &witnesses, None);
    Ok(hex::encode(tx.to_bytes()))
}

/// Parse + validate the funding wallet context (payment xprv, funding address,
/// protocol params, UTxO set). Shared preamble for every builder.
struct FundingCtx {
    payment_xprv: Bip32PrivateKey,
    funding_addr: Address,
    available: TransactionUnspentOutputs,
    params: JsonValue,
}

fn funding_ctx(
    seed_hex: &str,
    funding_account: u32,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> Result<FundingCtx, &'static str> {
    let utxos: Vec<StakeUtxo> =
        serde_json::from_str(utxos_json).map_err(|_| "utxos_json is not a valid JSON array")?;
    if utxos.is_empty() {
        return Err("utxos_json is empty — no funds to spend");
    }
    let params: JsonValue =
        serde_json::from_str(protocol_params_json).map_err(|_| "protocol_params_json invalid")?;

    let payment_xprv = cardano::derive_payment_xprv_account(seed_hex, funding_account)
        .ok_or("seed_hex invalid (must be 32-byte hex)")?;

    let funding_addr_bech32 =
        cardano::derive_address_account(seed_hex.to_string(), funding_account, network);
    if funding_addr_bech32.is_empty() {
        return Err("could not derive funding address");
    }
    let funding_addr = Address::from_bech32(&funding_addr_bech32)
        .map_err(|_| "derived funding address is not valid bech32 (unreachable)")?;

    let available = build_unspent_outputs(&utxos, &funding_addr)?;
    Ok(FundingCtx {
        payment_xprv,
        funding_addr,
        available,
        params,
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Single-account stake registration + delegation
// ─────────────────────────────────────────────────────────────────────────────

/// Build + sign a tx that registers the stake key of CIP-1852 `account` and
/// delegates it to `pool_bech32` (one `StakeRegistration` + one
/// `StakeDelegation`). Funded from the SAME account's base address. Returns
/// signed-tx CBOR hex, or "" on any error.
///
/// Deposit (~2 ADA key_deposit) + fee + min-ada change are handled by CSL via
/// `add_change_if_needed` (build_tx_builder seeds key_deposit). Witnesses: the
/// account's payment key (spends inputs) + its stake key (authorises the
/// delegation cert).
pub fn build_stake_delegation_tx(
    seed_hex: &str,
    account: u32,
    pool_bech32: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> String {
    build_stake_delegation_inner(
        seed_hex,
        account,
        pool_bech32,
        utxos_json,
        protocol_params_json,
        network,
    )
    .unwrap_or_default()
}

fn build_stake_delegation_inner(
    seed_hex: &str,
    account: u32,
    pool_bech32: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> Result<String, &'static str> {
    let ctx = funding_ctx(seed_hex, account, utxos_json, protocol_params_json, network)?;

    let pool_keyhash = Ed25519KeyHash::from_bech32(pool_bech32)
        .map_err(|_| "pool_bech32 is not a valid pool id (expected pool1...)")?;
    let stake_cred = stake_credential_account(seed_hex, account)
        .ok_or("seed_hex invalid for stake key derivation")?;
    let stake_xprv =
        derive_stake_xprv_account(seed_hex, account).ok_or("seed_hex invalid (stake)")?;

    let mut certs = CertificatesBuilder::new();
    certs
        .add(&Certificate::new_stake_registration(
            &StakeRegistration::new(&stake_cred),
        ))
        .map_err(|_| "add StakeRegistration cert failed")?;
    certs
        .add(&Certificate::new_stake_delegation(&StakeDelegation::new(
            &stake_cred,
            &pool_keyhash,
        )))
        .map_err(|_| "add StakeDelegation cert failed")?;

    let mut tb = build_tx_builder(&ctx.params)?;
    tb.set_certs_builder(&certs);
    tb.add_inputs_from(&ctx.available, CoinSelectionStrategyCIP2::LargestFirst)
        .map_err(|_| "coin selection failed — insufficient UTxO for deposit + fee")?;

    finalize_and_sign(
        &mut tb,
        &ctx.funding_addr,
        vec![ctx.payment_xprv, stake_xprv],
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MULTI-POOL delegation (ISPO core) — N accounts, N pools, ONE tx
// ─────────────────────────────────────────────────────────────────────────────

/// Build + sign ONE tx that, for each allocation `{account, lovelace,
/// pool_bech32}`:
///   - emits an output `(base_addr(account), lovelace)` (nạp vốn vào account đó),
///   - registers that account's stake key (`StakeRegistration`),
///   - delegates that stake key to its pool (`StakeDelegation`).
///
/// Result: N outputs + N StakeRegistration + N StakeDelegation in a single tx.
/// Funded from `funding_account`'s base address (default the account-0 wallet);
/// the funding wallet pays Σlovelace + Σdeposit + fee, change returns to it.
///
/// 1 stake key ⇒ 1 pool → each allocation MUST use a distinct account; a repeated
/// account is rejected (duplicate stake credential would make the second
/// registration cert invalid). Witnesses: funding payment key + each account's
/// stake key.
///
/// `allocations_json` = `[{"account":1,"lovelace":"50000000000","pool_bech32":"pool1..."}, ...]`.
pub fn build_multi_pool_delegation_tx(
    seed_hex: &str,
    funding_account: u32,
    allocations_json: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> String {
    build_multi_pool_inner(
        seed_hex,
        funding_account,
        allocations_json,
        utxos_json,
        protocol_params_json,
        network,
    )
    .unwrap_or_default()
}

fn build_multi_pool_inner(
    seed_hex: &str,
    funding_account: u32,
    allocations_json: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> Result<String, &'static str> {
    let allocations: Vec<Allocation> =
        serde_json::from_str(allocations_json).map_err(|_| "allocations_json invalid")?;
    if allocations.is_empty() {
        return Err("allocations_json is empty — nothing to delegate");
    }

    let ctx = funding_ctx(
        seed_hex,
        funding_account,
        utxos_json,
        protocol_params_json,
        network,
    )?;

    let mut tb = build_tx_builder(&ctx.params)?;
    let mut certs = CertificatesBuilder::new();

    // Funding payment key always signs (spends inputs); collect each account's
    // stake key for witnessing. Dedup the funding key vs a stake key only by
    // role — different paths, so they never collide.
    let mut signers: Vec<Bip32PrivateKey> = vec![ctx.payment_xprv];
    let mut seen_accounts: Vec<u32> = Vec::new();

    for alloc in &allocations {
        // 1 stake key ⇒ 1 pool: a repeated account = a duplicate stake
        // credential; the second StakeRegistration would be invalid on-chain.
        if seen_accounts.contains(&alloc.account) {
            return Err("duplicate account in allocations — 1 stake key delegates 1 pool");
        }
        seen_accounts.push(alloc.account);

        let pool_keyhash = Ed25519KeyHash::from_bech32(&alloc.pool_bech32)
            .map_err(|_| "an allocation pool_bech32 is not a valid pool id (pool1...)")?;

        // Destination base address = payment_cred(account) + stake_cred(account).
        // Funding the address whose stake key we delegate is what makes the
        // lovelace count toward that pool's stake.
        let dest_bech32 =
            cardano::derive_address_account(seed_hex.to_string(), alloc.account, network);
        if dest_bech32.is_empty() {
            return Err("could not derive an allocation destination address");
        }
        let dest_addr = Address::from_bech32(&dest_bech32)
            .map_err(|_| "derived allocation address invalid (unreachable)")?;

        // Output: nạp vốn vào account này.
        let out = TransactionOutputBuilder::new()
            .with_address(&dest_addr)
            .next()
            .map_err(|_| "allocation output builder.next failed")?
            .with_coin(&BigNum::from(alloc.lovelace))
            .build()
            .map_err(|_| "allocation output build failed (below min-ada?)")?;
        tb.add_output(&out)
            .map_err(|_| "add allocation output failed (below min-ada?)")?;

        let stake_cred = stake_credential_account(seed_hex, alloc.account)
            .ok_or("seed_hex invalid for an allocation stake key")?;
        let stake_xprv = derive_stake_xprv_account(seed_hex, alloc.account)
            .ok_or("seed_hex invalid (stake) for an allocation")?;

        certs
            .add(&Certificate::new_stake_registration(
                &StakeRegistration::new(&stake_cred),
            ))
            .map_err(|_| "add StakeRegistration cert failed (duplicate account?)")?;
        certs
            .add(&Certificate::new_stake_delegation(&StakeDelegation::new(
                &stake_cred,
                &pool_keyhash,
            )))
            .map_err(|_| "add StakeDelegation cert failed")?;

        signers.push(stake_xprv);
    }

    tb.set_certs_builder(&certs);
    tb.add_inputs_from(&ctx.available, CoinSelectionStrategyCIP2::LargestFirst)
        .map_err(|_| "coin selection failed — insufficient UTxO for Σalloc + Σdeposit + fee")?;

    finalize_and_sign(&mut tb, &ctx.funding_addr, signers)
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Reward withdrawal
// ─────────────────────────────────────────────────────────────────────────────

/// Build + sign a tx withdrawing `reward_lovelace` from the reward (stake)
/// account of CIP-1852 `account`. Funded from the same account's base address.
/// The withdrawn reward is an implicit input → change to the funding address
/// rises by reward − fee. Witnesses: payment key (inputs) + stake key (reward).
pub fn build_withdraw_reward_tx(
    seed_hex: &str,
    account: u32,
    reward_lovelace: u64,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> String {
    build_withdraw_inner(
        seed_hex,
        account,
        reward_lovelace,
        utxos_json,
        protocol_params_json,
        network,
    )
    .unwrap_or_default()
}

fn build_withdraw_inner(
    seed_hex: &str,
    account: u32,
    reward_lovelace: u64,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> Result<String, &'static str> {
    let ctx = funding_ctx(seed_hex, account, utxos_json, protocol_params_json, network)?;

    let stake_cred = stake_credential_account(seed_hex, account)
        .ok_or("seed_hex invalid for stake key derivation")?;
    let stake_xprv =
        derive_stake_xprv_account(seed_hex, account).ok_or("seed_hex invalid (stake)")?;

    let net_id = if network == 1 { 1u8 } else { 0u8 };
    let reward_addr = RewardAddress::new(net_id, &stake_cred);

    let mut wb = csl::WithdrawalsBuilder::new();
    wb.add(&reward_addr, &BigNum::from(reward_lovelace))
        .map_err(|_| "add withdrawal failed (script credential?)")?;

    let mut tb = build_tx_builder(&ctx.params)?;
    tb.set_withdrawals_builder(&wb);
    tb.add_inputs_from(&ctx.available, CoinSelectionStrategyCIP2::LargestFirst)
        .map_err(|_| "coin selection failed — insufficient UTxO for fee")?;

    finalize_and_sign(
        &mut tb,
        &ctx.funding_addr,
        vec![ctx.payment_xprv, stake_xprv],
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Conway vote delegation (DRep)
// ─────────────────────────────────────────────────────────────────────────────

/// Build + sign a Conway `VoteDelegation` tx: delegate the voting power of
/// `account`'s (already-registered) stake key to a DRep. `drep_id` accepts a
/// bech32 `drep1...` / `drep_script1...`, or the literals `abstain` /
/// `no_confidence` for the predefined DReps. Funded from the same account.
/// Witnesses: payment key + stake key.
///
/// NOTE: this does NOT register the stake key — the stake credential must
/// already be registered (e.g. via `build_stake_delegation_tx`). Vote delegation
/// is orthogonal to pool delegation (a stake key can delegate stake to a pool
/// AND voting power to a DRep independently).
pub fn build_vote_delegation_tx(
    seed_hex: &str,
    account: u32,
    drep_id: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> String {
    build_vote_delegation_inner(
        seed_hex,
        account,
        drep_id,
        utxos_json,
        protocol_params_json,
        network,
    )
    .unwrap_or_default()
}

fn parse_drep(drep_id: &str) -> Result<DRep, &'static str> {
    match drep_id {
        "abstain" => Ok(DRep::new_always_abstain()),
        "no_confidence" => Ok(DRep::new_always_no_confidence()),
        s => DRep::from_bech32(s).map_err(|_| "drep_id is not a valid DRep (drep1.../abstain/no_confidence)"),
    }
}

fn build_vote_delegation_inner(
    seed_hex: &str,
    account: u32,
    drep_id: &str,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> Result<String, &'static str> {
    let ctx = funding_ctx(seed_hex, account, utxos_json, protocol_params_json, network)?;

    let drep = parse_drep(drep_id)?;
    let stake_cred = stake_credential_account(seed_hex, account)
        .ok_or("seed_hex invalid for stake key derivation")?;
    let stake_xprv =
        derive_stake_xprv_account(seed_hex, account).ok_or("seed_hex invalid (stake)")?;

    let mut certs = CertificatesBuilder::new();
    certs
        .add(&Certificate::new_vote_delegation(&VoteDelegation::new(
            &stake_cred,
            &drep,
        )))
        .map_err(|_| "add VoteDelegation cert failed")?;

    let mut tb = build_tx_builder(&ctx.params)?;
    tb.set_certs_builder(&certs);
    tb.add_inputs_from(&ctx.available, CoinSelectionStrategyCIP2::LargestFirst)
        .map_err(|_| "coin selection failed — insufficient UTxO for fee")?;

    finalize_and_sign(
        &mut tb,
        &ctx.funding_addr,
        vec![ctx.payment_xprv, stake_xprv],
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Stake-key deregistration (refund deposit)
// ─────────────────────────────────────────────────────────────────────────────

/// Build + sign a `StakeDeregistration` tx for `account`'s stake key. The
/// ~2 ADA key deposit is refunded (CSL folds it as an implicit input via
/// add_change_if_needed → change rises by deposit − fee). Witnesses: payment key
/// + stake key. The stake key must be currently registered.
pub fn build_stake_deregistration_tx(
    seed_hex: &str,
    account: u32,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> String {
    build_deregistration_inner(seed_hex, account, utxos_json, protocol_params_json, network)
        .unwrap_or_default()
}

fn build_deregistration_inner(
    seed_hex: &str,
    account: u32,
    utxos_json: &str,
    protocol_params_json: &str,
    network: u8,
) -> Result<String, &'static str> {
    let ctx = funding_ctx(seed_hex, account, utxos_json, protocol_params_json, network)?;

    let stake_cred = stake_credential_account(seed_hex, account)
        .ok_or("seed_hex invalid for stake key derivation")?;
    let stake_xprv =
        derive_stake_xprv_account(seed_hex, account).ok_or("seed_hex invalid (stake)")?;

    let mut certs = CertificatesBuilder::new();
    certs
        .add(&Certificate::new_stake_deregistration(
            &StakeDeregistration::new(&stake_cred),
        ))
        .map_err(|_| "add StakeDeregistration cert failed")?;

    let mut tb = build_tx_builder(&ctx.params)?;
    tb.set_certs_builder(&certs);
    tb.add_inputs_from(&ctx.available, CoinSelectionStrategyCIP2::LargestFirst)
        .map_err(|_| "coin selection failed — insufficient UTxO for fee")?;

    finalize_and_sign(
        &mut tb,
        &ctx.funding_addr,
        vec![ctx.payment_xprv, stake_xprv],
    )
}

// ═════════════════════════════════════════════════════════════════════════════
#[cfg(test)]
mod tests {
    use super::*;
    use cardano_serialization_lib::CertificateKind;

    const SEED: &str = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    // Real-shape preprod params (key_deposit 2 ADA, pool_deposit 500 ADA).
    fn preprod_params() -> String {
        r#"{
            "min_fee_a": 44,
            "min_fee_b": 155381,
            "coins_per_utxo_size": "4310",
            "pool_deposit": "500000000",
            "key_deposit": "2000000",
            "max_tx_size": 16384,
            "max_val_size": "5000"
        }"#
        .to_string()
    }

    // Deterministic 28-byte pool key hashes encoded as bech32 `pool1...`.
    fn pool_bech32(byte: u8) -> String {
        let kh = Ed25519KeyHash::from_bytes(vec![byte; 28]).unwrap();
        kh.to_bech32("pool").unwrap()
    }

    // A funding UTxO with `lovelace` (ADA-only), tx_hash byte-filled.
    fn utxos(lovelace: u64) -> String {
        format!(
            r#"[{{"tx_hash":"{}","index":0,"lovelace":"{}"}}]"#,
            "11".repeat(32),
            lovelace
        )
    }

    fn parse_tx(hex_str: &str) -> Transaction {
        let bytes = hex::decode(hex_str).expect("signed tx must be valid hex");
        Transaction::from_bytes(bytes).expect("signed tx must decode")
    }

    fn count_certs(tx: &Transaction) -> (usize, usize, usize, usize, usize) {
        // (reg, deleg, dereg, vote, total)
        let body = tx.body();
        let certs = body.certs().expect("tx must carry certs");
        let (mut reg, mut deleg, mut dereg, mut vote) = (0, 0, 0, 0);
        for i in 0..certs.len() {
            match certs.get(i).kind() {
                CertificateKind::StakeRegistration => reg += 1,
                CertificateKind::StakeDelegation => deleg += 1,
                CertificateKind::StakeDeregistration => dereg += 1,
                CertificateKind::VoteDelegation => vote += 1,
                _ => {}
            }
        }
        (reg, deleg, dereg, vote, certs.len())
    }

    // ── 1. single stake registration + delegation ────────────────
    #[test]
    fn stake_delegation_has_reg_and_deleg() {
        let pool = pool_bech32(0xAB);
        let hex_tx = build_stake_delegation_tx(
            SEED, 0, &pool, &utxos(10_000_000), &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty(), "stake delegation must build");
        let tx = parse_tx(&hex_tx);
        let (reg, deleg, _, _, total) = count_certs(&tx);
        assert_eq!(reg, 1, "exactly one StakeRegistration");
        assert_eq!(deleg, 1, "exactly one StakeDelegation");
        assert_eq!(total, 2, "exactly two certs");

        // The delegation must point at the supplied pool keyhash.
        let certs = tx.body().certs().unwrap();
        let mut matched = false;
        let expected = Ed25519KeyHash::from_bech32(&pool).unwrap();
        for i in 0..certs.len() {
            if let Some(d) = certs.get(i).as_stake_delegation() {
                assert_eq!(d.pool_keyhash().to_bytes(), expected.to_bytes());
                matched = true;
            }
        }
        assert!(matched, "a StakeDelegation cert must exist");

        // Two witnesses: payment + stake key of account 0.
        let vkeys = tx.witness_set().vkeys().expect("vkeys present");
        assert_eq!(vkeys.len(), 2, "payment + stake witness");
    }

    // ── 2. MULTI-POOL: N alloc → N reg + N deleg + N output ───────
    #[test]
    fn multi_pool_n_certs_and_outputs() {
        let allocs = format!(
            r#"[
              {{"account":1,"lovelace":"50000000","pool_bech32":"{}"}},
              {{"account":2,"lovelace":"30000000","pool_bech32":"{}"}},
              {{"account":3,"lovelace":"20000000","pool_bech32":"{}"}}
            ]"#,
            pool_bech32(0x01),
            pool_bech32(0x02),
            pool_bech32(0x03),
        );
        // Funding wallet (account 0) holds 200 ADA — covers Σ100 ADA alloc +
        // 3×2 ADA deposit + fee + change.
        let hex_tx = build_multi_pool_delegation_tx(
            SEED, 0, &allocs, &utxos(200_000_000), &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty(), "multi-pool tx must build");
        let tx = parse_tx(&hex_tx);

        let (reg, deleg, _, _, total) = count_certs(&tx);
        assert_eq!(reg, 3, "3 allocations → 3 StakeRegistration");
        assert_eq!(deleg, 3, "3 allocations → 3 StakeDelegation");
        assert_eq!(total, 6, "6 certs total");

        // N=3 allocation outputs must be present (plus a change output).
        let outs = tx.body().outputs();
        let acct1 = cardano::derive_address_account(SEED.to_string(), 1, 0);
        let acct2 = cardano::derive_address_account(SEED.to_string(), 2, 0);
        let acct3 = cardano::derive_address_account(SEED.to_string(), 3, 0);
        let (mut a1, mut a2, mut a3) = (0u64, 0u64, 0u64);
        for i in 0..outs.len() {
            let o = outs.get(i);
            let addr = o.address().to_bech32(None).unwrap();
            let coin: u64 = o.amount().coin().to_str().parse().unwrap();
            if addr == acct1 {
                a1 = coin;
            } else if addr == acct2 {
                a2 = coin;
            } else if addr == acct3 {
                a3 = coin;
            }
        }
        assert_eq!(a1, 50_000_000, "acct1 funded 50 ADA");
        assert_eq!(a2, 30_000_000, "acct2 funded 30 ADA");
        assert_eq!(a3, 20_000_000, "acct3 funded 20 ADA");

        // Each delegation targets the matching pool (distinct stake keys).
        let certs = tx.body().certs().unwrap();
        let mut pools: Vec<Vec<u8>> = Vec::new();
        for i in 0..certs.len() {
            if let Some(d) = certs.get(i).as_stake_delegation() {
                pools.push(d.pool_keyhash().to_bytes());
            }
        }
        assert!(pools.contains(&Ed25519KeyHash::from_bech32(&pool_bech32(0x01)).unwrap().to_bytes()));
        assert!(pools.contains(&Ed25519KeyHash::from_bech32(&pool_bech32(0x02)).unwrap().to_bytes()));
        assert!(pools.contains(&Ed25519KeyHash::from_bech32(&pool_bech32(0x03)).unwrap().to_bytes()));

        // Witnesses: 1 payment (account 0) + 3 distinct stake keys = 4.
        let vkeys = tx.witness_set().vkeys().expect("vkeys present");
        assert_eq!(vkeys.len(), 4, "payment + 3 stake witnesses");
    }

    // ── 2b. value conservation incl. deposits ─────────────────────
    #[test]
    fn multi_pool_conserves_value_with_deposits() {
        let allocs = format!(
            r#"[
              {{"account":1,"lovelace":"50000000","pool_bech32":"{}"}},
              {{"account":2,"lovelace":"30000000","pool_bech32":"{}"}}
            ]"#,
            pool_bech32(0x01),
            pool_bech32(0x02),
        );
        let in_total = 200_000_000u64;
        let hex_tx = build_multi_pool_delegation_tx(
            SEED, 0, &allocs, &utxos(in_total), &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty());
        let tx = parse_tx(&hex_tx);
        let body = tx.body();

        let fee: u64 = body.fee().to_str().parse().unwrap();
        let mut out_total = 0u64;
        let outs = body.outputs();
        for i in 0..outs.len() {
            out_total += outs.get(i).amount().coin().to_str().parse::<u64>().unwrap();
        }
        // Σin = Σout + fee + Σdeposit (2 registrations × 2 ADA = 4 ADA).
        let deposits = 2 * 2_000_000u64;
        assert_eq!(
            in_total,
            out_total + fee + deposits,
            "Σin must equal Σout + fee + Σdeposit"
        );
    }

    // ── 2c. duplicate account rejected (1 stake key ⇒ 1 pool) ─────
    #[test]
    fn multi_pool_duplicate_account_rejected() {
        let allocs = format!(
            r#"[
              {{"account":1,"lovelace":"50000000","pool_bech32":"{}"}},
              {{"account":1,"lovelace":"30000000","pool_bech32":"{}"}}
            ]"#,
            pool_bech32(0x01),
            pool_bech32(0x02),
        );
        let hex_tx = build_multi_pool_delegation_tx(
            SEED, 0, &allocs, &utxos(200_000_000), &preprod_params(), 0,
        );
        assert!(
            hex_tx.is_empty(),
            "duplicate account must be rejected (1 stake key delegates 1 pool)"
        );
    }

    // ── 3. reward withdrawal ──────────────────────────────────────
    #[test]
    fn withdraw_reward_has_withdrawal() {
        let hex_tx = build_withdraw_reward_tx(
            SEED, 0, 5_000_000, &utxos(10_000_000), &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty(), "withdrawal tx must build");
        let tx = parse_tx(&hex_tx);
        let w = tx.body().withdrawals().expect("withdrawals present");
        assert_eq!(w.len(), 1, "exactly one withdrawal");

        // The withdrawal must be keyed on account-0's reward address.
        let stake_cred = stake_credential_account(SEED, 0).unwrap();
        let reward_addr = RewardAddress::new(0, &stake_cred);
        let amt = w.get(&reward_addr).expect("withdrawal for our reward addr");
        assert_eq!(amt.to_str(), "5000000", "withdrawal amount = 5 ADA");

        // payment + stake witness.
        assert_eq!(tx.witness_set().vkeys().unwrap().len(), 2);
    }

    // ── 4. Conway vote delegation ─────────────────────────────────
    #[test]
    fn vote_delegation_has_vote_cert() {
        // abstain predefined DRep — no external bech32 needed.
        let hex_tx = build_vote_delegation_tx(
            SEED, 0, "abstain", &utxos(10_000_000), &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty(), "vote delegation (abstain) must build");
        let tx = parse_tx(&hex_tx);
        let (_, _, _, vote, total) = count_certs(&tx);
        assert_eq!(vote, 1, "one VoteDelegation cert");
        assert_eq!(total, 1, "only the vote cert (no registration)");
        assert_eq!(tx.witness_set().vkeys().unwrap().len(), 2, "payment + stake");
    }

    #[test]
    fn vote_delegation_drep_bech32() {
        // A keyhash DRep encoded as drep1...
        let drep_kh = Ed25519KeyHash::from_bytes(vec![0x42; 28]).unwrap();
        let drep_bech = DRep::new_key_hash(&drep_kh).to_bech32().unwrap();
        let hex_tx = build_vote_delegation_tx(
            SEED, 0, &drep_bech, &utxos(10_000_000), &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty(), "vote delegation (drep1...) must build");
        let tx = parse_tx(&hex_tx);
        let certs = tx.body().certs().unwrap();
        let mut found = false;
        for i in 0..certs.len() {
            if let Some(v) = certs.get(i).as_vote_delegation() {
                assert_eq!(
                    v.drep().to_key_hash().unwrap().to_bytes(),
                    drep_kh.to_bytes(),
                    "vote cert must target the supplied DRep keyhash"
                );
                found = true;
            }
        }
        assert!(found, "a VoteDelegation cert must exist");
    }

    // ── 5. stake deregistration ───────────────────────────────────
    #[test]
    fn deregistration_has_dereg_cert_and_refunds() {
        let in_total = 10_000_000u64;
        let hex_tx = build_stake_deregistration_tx(
            SEED, 0, &utxos(in_total), &preprod_params(), 0,
        );
        assert!(!hex_tx.is_empty(), "deregistration must build");
        let tx = parse_tx(&hex_tx);
        let (_, _, dereg, _, total) = count_certs(&tx);
        assert_eq!(dereg, 1, "one StakeDeregistration");
        assert_eq!(total, 1);

        // Refund: Σout + fee = Σin + key_deposit (2 ADA back).
        let body = tx.body();
        let fee: u64 = body.fee().to_str().parse().unwrap();
        let outs = body.outputs();
        let mut out_total = 0u64;
        for i in 0..outs.len() {
            out_total += outs.get(i).amount().coin().to_str().parse::<u64>().unwrap();
        }
        let refund = 2_000_000u64;
        assert_eq!(
            out_total + fee,
            in_total + refund,
            "Σout + fee must equal Σin + key_deposit refund"
        );
        assert_eq!(tx.witness_set().vkeys().unwrap().len(), 2, "payment + stake");
    }

    // ── error paths ───────────────────────────────────────────────
    #[test]
    fn bad_pool_bech32_returns_empty() {
        let hex_tx = build_stake_delegation_tx(
            SEED, 0, "not_a_pool", &utxos(10_000_000), &preprod_params(), 0,
        );
        assert!(hex_tx.is_empty(), "invalid pool id must return empty");
    }

    #[test]
    fn insufficient_funds_returns_empty() {
        // 1 ADA cannot cover a 2 ADA deposit + fee.
        let pool = pool_bech32(0x05);
        let hex_tx = build_stake_delegation_tx(
            SEED, 0, &pool, &utxos(1_000_000), &preprod_params(), 0,
        );
        assert!(hex_tx.is_empty(), "insufficient funds must return empty");

        let empty = build_stake_delegation_tx(SEED, 0, &pool, "[]", &preprod_params(), 0);
        assert!(empty.is_empty(), "empty UTxO list must return empty");
    }

    #[test]
    fn bad_seed_returns_empty() {
        let pool = pool_bech32(0x06);
        let hex_tx =
            build_stake_delegation_tx("zzzz", 0, &pool, &utxos(10_000_000), &preprod_params(), 0);
        assert!(hex_tx.is_empty(), "invalid seed must return empty");
    }

    // Distinct accounts → distinct stake credentials (the ISPO invariant).
    #[test]
    fn distinct_accounts_distinct_stake_creds() {
        let c0 = stake_credential_account(SEED, 0).unwrap();
        let c1 = stake_credential_account(SEED, 1).unwrap();
        let c2 = stake_credential_account(SEED, 2).unwrap();
        assert_ne!(c0.to_keyhash().unwrap().to_bytes(), c1.to_keyhash().unwrap().to_bytes());
        assert_ne!(c1.to_keyhash().unwrap().to_bytes(), c2.to_keyhash().unwrap().to_bytes());
    }
}
