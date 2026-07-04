// Milestone A — phía ts-mls (alice) cho interop test.
// Đọc 1 KeyPackage (MLSMessage wire, base64) do Rust/OpenMLS sinh ra, đóng vai alice:
//   tạo nhóm → add KeyPackage của Rust → xuất Welcome (base64) + epochSecret của alice.
// Rust sau đó join Welcome này; nếu join OK = khớp wire hoàn toàn.
//
// Dùng:  node make-welcome.mjs <path-to-rust-keypackage-b64>
// Ra:    welcome-for-rust.json  { welcome_b64, aliceEpoch, aliceEpochSecret_hex }
//        và in JSON ra stdout.

import { readFileSync, writeFileSync } from 'node:fs';

const CIPHERSUITE = 'MLS_128_DHKEMP256_AES128GCM_SHA256_P256';
const enc = (s) => new TextEncoder().encode(s);
const hex = (u8) => Buffer.from(u8).toString('hex');
const b64 = (u8) => Buffer.from(u8).toString('base64');
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function main() {
  const kpPath = process.argv[2];
  if (!kpPath) { console.error('cần path tới file KeyPackage base64 của Rust'); process.exit(2); }
  const rustKpB64 = readFileSync(kpPath, 'utf8').trim();

  const m = await import('ts-mls');
  const impl = await m.getCiphersuiteImpl(m.getCiphersuiteFromName(CIPHERSUITE));

  // alice
  const aliceCred = { credentialType: 'basic', identity: enc('alice-stake') };
  const alice = await m.generateKeyPackage(aliceCred, m.defaultCapabilities(), m.defaultLifetime, [], impl);

  // Decode KeyPackage của Rust (kỳ vọng wireformat mls_key_package)
  const decoded = m.decodeMlsMessage(fromB64(rustKpB64), 0)?.[0];
  if (!decoded) throw new Error('decodeMlsMessage trả null — wire không hợp lệ');
  if (decoded.wireformat !== 'mls_key_package') {
    throw new Error(`kỳ vọng mls_key_package, nhận: ${decoded.wireformat}`);
  }
  const rustKeyPackage = decoded.keyPackage;
  if (!rustKeyPackage) throw new Error('decoded.keyPackage undefined');

  // Tạo nhóm + add KeyPackage của Rust
  const groupId = enc('conv-interop-A');
  let aliceState = await m.createGroup(groupId, alice.publicPackage, alice.privatePackage, [], impl);
  const commit = await m.createCommit(
    { state: aliceState, cipherSuite: impl },
    { extraProposals: [{ proposalType: 'add', add: { keyPackage: rustKeyPackage } }], ratchetTreeExtension: true },
  );
  aliceState = commit.newState;
  if (!commit.welcome) throw new Error('không có welcome sau commit');

  const welcomeWire = m.encodeMlsMessage({ welcome: commit.welcome, wireformat: 'mls_welcome', version: 'mls10' });
  const out = {
    ok: true,
    welcome_b64: b64(welcomeWire),
    aliceEpoch: Number(aliceState.groupContext?.epoch ?? -1),
    aliceEpochSecret_hex: aliceState.keySchedule?.epochSecret ? hex(aliceState.keySchedule.epochSecret) : null,
    groupId_utf8: 'conv-interop-A',
  };
  writeFileSync(new URL('./welcome-for-rust.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
}

main().catch((e) => { console.error('ERR', e?.stack || String(e)); process.exit(1); });
