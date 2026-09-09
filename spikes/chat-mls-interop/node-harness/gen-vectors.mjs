// Pha 0 spike — sinh GOLDEN TEST VECTORS từ đúng thư viện web (ts-mls,
// circomlibjs, blakejs, tweetnacl — phiên bản ĐỌC lúc chạy) để Rust khớp byte-for-byte.
//
// Chạy: node gen-vectors.mjs   → ghi rust/chat_mls/vectors/web-vectors.json + mls-sample.json
//
// 3 nhóm vector:
//   T2  message-layer:  HKDF-SHA256(epochSecret, "mls-msg:"+id) → AES-256-GCM (IV cố định)
//   T3  merkle:         Poseidon(BN254) ptCommit/leafHash + Ed25519 session sig
//   MLS self-test:      tạo nhóm alice+bob, khẳng định epochSecret alice == bob
//
// Tất cả input CỐ ĐỊNH để deterministic (trừ MLS dùng randomness nội bộ — ta chỉ
// khẳng định 2 bên đồng thuận epochSecret, và xuất mẫu KeyPackage/Welcome ra file).

import { webcrypto as nodeCrypto } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import blake from 'blakejs';
import nacl from 'tweetnacl';
import { buildPoseidon } from 'circomlibjs';

const subtle = nodeCrypto.subtle;
const CIPHERSUITE = 'MLS_128_DHKEMP256_AES128GCM_SHA256_P256';

// ── `generatedBy` phải ĐỌC phiên bản thật, không được ghi cứng ───────────────
// Trước đây dòng này là một chuỗi literal 'ts-mls@1.5.1 / circomlibjs@0.1.7 / …'.
// Cổng bên Rust khớp cứng chuỗi đó để bắt bên web đổi thư viện — nhưng chuỗi ghi
// cứng thì KHÔNG BAO GIỜ đổi. Nâng circomlibjs lên 0.1.8, sinh lại vector: giá trị
// mong đợi đổi, `generatedBy` vẫn ghi 0.1.7, và cổng vẫn xanh vì nó so chuỗi với
// chuỗi. Một cái ghim mà chính nó ghi ra thứ nó bị so — không ghim được gì.
//
// Nay đọc từ `package.json` của từng gói ĐANG CÀI. Chạy ở kho nào thì nó khai đúng
// phiên bản của kho đó — đây là điều kiện để cổng có nghĩa khi bộ sinh này về chạy
// trong CI của bên web bằng chính `node_modules` của bên web.
const requireCjs = createRequire(import.meta.url);
const GOI_CAN_KHAI = ['ts-mls', 'circomlibjs', 'blakejs', 'tweetnacl'];

function phienBan(ten) {
  // `exports` của một số gói không mở `./package.json`, nên thử hai đường rồi mới bỏ.
  try {
    return requireCjs(`${ten}/package.json`).version;
  } catch {
    const p = requireCjs.resolve(ten);
    const goc = p.slice(0, p.lastIndexOf(`node_modules/${ten}/`) + `node_modules/${ten}/`.length);
    return JSON.parse(readFileSync(goc + 'package.json', 'utf8')).version;
  }
  // KHÔNG có nhánh trả giá trị mặc định: một `generatedBy` đoán mò còn tệ hơn không
  // có nó, vì nó trông y hệt một phép đo thật.
}

const XUAT_XU = GOI_CAN_KHAI.map((t) => `${t}@${phienBan(t)}`).join(' / ');

const b64 = (u8) => Buffer.from(u8).toString('base64');
const hex = (u8) => Buffer.from(u8).toString('hex');
const fromHex = (h) => new Uint8Array(Buffer.from(h, 'hex'));
const enc = (s) => new TextEncoder().encode(s);

// ---------------------------------------------------------------------------
// TẦNG 2 — message-layer crypto (bản sao CHÍNH XÁC của lib/mls-crypto-utils.ts)
// ---------------------------------------------------------------------------
async function deriveMessageKeyBytes(epochSecret, messageId) {
  const keyMaterial = await subtle.importKey('raw', epochSecret, 'HKDF', false, ['deriveBits']);
  const info = enc(`mls-msg:${messageId}`);
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

async function aesGcmEncrypt(rawKey, plaintext, iv) {
  const key = await subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const out = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plaintext),
  );
  return { ciphertext: out.slice(0, -16), tag: out.slice(-16) };
}

async function tier2Vector() {
  // epochSecret CỐ ĐỊNH (32 byte) — độc lập với randomness của MLS
  const epochSecret = fromHex(
    '00112233445566778899aabbccddeeff102132435465768798a9bacbdcedfe0f',
  );
  const messageId = 'b3f1c0de-0000-4000-8000-000000000001';
  const iv = fromHex('a0a1a2a3a4a5a6a7a8a9aaab'); // 12 byte cố định
  const plainContent = { salt: 'ab'.repeat(32), nonce: '', plaintext: 'xin chào 🌱' };
  const plainContentJson = JSON.stringify(plainContent);

  const messageKey = await deriveMessageKeyBytes(epochSecret, messageId);
  const { ciphertext, tag } = await aesGcmEncrypt(messageKey, enc(plainContentJson), iv);

  return {
    _desc: 'HKDF-SHA256(salt=empty, info="mls-msg:"+id, L=32) → AES-256-GCM(iv=12B, tag=128b, no AAD). plaintext = utf8(JSON.stringify({salt,nonce,plaintext}))',
    input: {
      epochSecret_hex: hex(epochSecret),
      messageId,
      iv_hex: hex(iv),
      plainContentJson,
    },
    expect: {
      messageKey_hex: hex(messageKey),
      ciphertext_b64: b64(ciphertext),
      tag_b64: b64(tag),
      // Đúng shape body mà FE gửi lên WS
      body_b64: Buffer.from(
        JSON.stringify({
          epoch: 3,
          messageId,
          iv: b64(iv),
          ciphertext: b64(ciphertext),
          tag: b64(tag),
        }),
      ).toString('base64'),
    },
  };
}

// ---------------------------------------------------------------------------
// TẦNG 3 — Merkle Poseidon (bản sao CHÍNH XÁC của lib/merkle-crypto.ts)
// ---------------------------------------------------------------------------
function strToFieldForPoseidon(value) {
  const h = blake.blake2b(value, undefined, 32); // blake2b-256, key rỗng
  const hx = hex(h);
  return BigInt(`0x${hx.slice(0, 62)}`); // 31 byte đầu
}

async function tier3Vector() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const plaintext = 'xin chào 🌱';
  const saltHex = 'ab'.repeat(32); // 32 byte
  const conversationId = 'conv-direct-0001';
  const senderId = 'stake1uxyztestsenderaddress';
  const timestamp = 1700000000000n;

  const contentField = strToFieldForPoseidon(plaintext);
  const saltBytesHex = hex(fromHex(saltHex)); // round-trip như FE
  const saltField = BigInt(`0x${saltBytesHex.slice(0, 62)}`);
  const ptCommit = F.toObject(poseidon([contentField, saltField]));

  const convField = strToFieldForPoseidon(conversationId);
  const senderField = strToFieldForPoseidon(senderId);
  const leafHash = F.toObject(poseidon([convField, senderField, timestamp, ptCommit]));

  // Ed25519 session sig (tweetnacl) từ seed CỐ ĐỊNH
  const seed = fromHex('11'.repeat(32));
  const kp = nacl.sign.keyPair.fromSeed(seed); // secretKey 64B, publicKey 32B
  const leafHashHex = leafHash.toString(16).padStart(64, '0');
  const signature = nacl.sign.detached(fromHex(leafHashHex), kp.secretKey);
  const sigOk = nacl.sign.detached.verify(fromHex(leafHashHex), signature, kp.publicKey);

  return {
    _desc: 'Poseidon BN254 (circomlibjs). ptCommit=Poseidon(strToField(plaintext), first31(salt)). leafHash=Poseidon(strToField(convId), strToField(senderId), timestamp, ptCommit). strToField=first31bytes(blake2b256(utf8)). sig=Ed25519(leafHashHex bytes).',
    field_modulus_dec: F.p.toString(),
    input: { plaintext, saltHex, conversationId, senderId, timestamp: timestamp.toString() },
    expect: {
      contentField_dec: contentField.toString(),
      saltField_dec: saltField.toString(),
      ptCommit_hex: ptCommit.toString(16).padStart(64, '0'),
      leafHash_hex: leafHashHex,
      ed25519_seed_hex: hex(seed),
      ed25519_pub_hex: hex(kp.publicKey),
      signature_hex: hex(signature),
      selfVerify: sigOk,
    },
  };
}

// ---------------------------------------------------------------------------
// MLS self-test — tạo nhóm alice + bob, kiểm epochSecret đồng thuận
// ---------------------------------------------------------------------------
async function mlsSelfTest() {
  const m = await import('ts-mls');
  const impl = await m.getCiphersuiteImpl(m.getCiphersuiteFromName(CIPHERSUITE));

  const mkCred = (id) => ({ credentialType: 'basic', identity: enc(id) });
  const genKP = async (id) =>
    m.generateKeyPackage(mkCred(id), m.defaultCapabilities(), m.defaultLifetime, [], impl);

  const alice = await genKP('alice-stake');
  const bob = await genKP('bob-stake');

  const groupId = enc('conv-selftest');
  let aliceState = await m.createGroup(groupId, alice.publicPackage, alice.privatePackage, [], impl);

  const commit = await m.createCommit(
    { state: aliceState, cipherSuite: impl },
    { extraProposals: [{ proposalType: 'add', add: { keyPackage: bob.publicPackage } }], ratchetTreeExtension: true },
  );
  aliceState = commit.newState;

  const bobState = await m.joinGroup(
    commit.welcome, bob.publicPackage, bob.privatePackage, m.emptyPskIndex, impl,
  );

  const aliceEs = aliceState.keySchedule?.epochSecret;
  const bobEs = bobState.keySchedule?.epochSecret;
  const agree = aliceEs && bobEs && hex(aliceEs) === hex(bobEs);

  // Xuất mẫu KeyPackage/Welcome (base64 wire) cho bước Rust interop consume
  const bobKpWire = m.encodeMlsMessage({ keyPackage: bob.publicPackage, wireformat: 'mls_key_package', version: 'mls10' });
  const welcomeWire = m.encodeMlsMessage({ welcome: commit.welcome, wireformat: 'mls_welcome', version: 'mls10' });

  return {
    ciphersuite: CIPHERSUITE,
    aliceEpoch: Number(aliceState.groupContext?.epoch ?? -1),
    bobEpoch: Number(bobState.groupContext?.epoch ?? -1),
    epochSecret_alice_hex: aliceEs ? hex(aliceEs) : null,
    epochSecret_bob_hex: bobEs ? hex(bobEs) : null,
    epochSecretsAgree: !!agree,
    sample_bob_keyPackage_b64: b64(bobKpWire),
    sample_welcome_b64: b64(welcomeWire),
  };
}

// ---------------------------------------------------------------------------
async function main() {
  const t2 = await tier2Vector();
  const t3 = await tier3Vector();

  let mls;
  try {
    mls = await mlsSelfTest();
  } catch (e) {
    mls = { error: String(e && e.stack ? e.stack : e) };
  }

  const vectors = { ciphersuite: CIPHERSUITE, generatedBy: XUAT_XU, tier2_message: t2, tier3_merkle: t3 };
  // ⛔ GHI THẲNG VÀO TỆP MÀ TEST RUST ĐỌC — chỉ MỘT bản duy nhất trong kho.
  // Trước đây tệp này nằm cạnh harness (`./vectors.json`) còn bên Rust là các hằng
  // `const` chép tay, nên "sinh lại vector" KHÔNG làm đỏ được gì: hai bên không
  // đọc chung thứ gì cả. Ghi thẳng vào crate thì mỗi lần sinh lại là một lần đối
  // chiếu thật — giá trị đổi ⇒ `git diff` bẩn ⇒ `cargo test` đỏ.
  // Đổi đường này thì phải đổi `include_str!` ở rust/chat_mls/src/golden.rs cùng lúc.
  writeFileSync(new URL('../../../rust/chat_mls/vectors/web-vectors.json', import.meta.url), JSON.stringify(vectors, null, 2) + '\n');
  writeFileSync(new URL('./mls-sample.json', import.meta.url), JSON.stringify(mls, null, 2));

  console.log('=== TẦNG 2 (message-layer) ===');
  console.log('messageKey_hex :', t2.expect.messageKey_hex);
  console.log('ciphertext_b64 :', t2.expect.ciphertext_b64);
  console.log('tag_b64        :', t2.expect.tag_b64);
  console.log('\n=== TẦNG 3 (Merkle/Poseidon) ===');
  console.log('ptCommit_hex   :', t3.expect.ptCommit_hex);
  console.log('leafHash_hex   :', t3.expect.leafHash_hex);
  console.log('ed25519_pub    :', t3.expect.ed25519_pub_hex);
  console.log('signature_hex  :', t3.expect.signature_hex, '(selfVerify=' + t3.expect.selfVerify + ')');
  console.log('\n=== MLS self-test ===');
  console.log(JSON.stringify(mls.error ? mls : {
    aliceEpoch: mls.aliceEpoch, bobEpoch: mls.bobEpoch,
    epochSecretsAgree: mls.epochSecretsAgree,
    epochSecret_alice_hex: mls.epochSecret_alice_hex,
  }, null, 2));
  console.log('\n✅ đã ghi rust/chat_mls/vectors/web-vectors.json + mls-sample.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
