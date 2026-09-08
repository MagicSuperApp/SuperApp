#!/usr/bin/env node
/**
 * soi-mach.js — cổng soi MẠCH DỌC của cầu native.
 *
 * Vì sao có tệp này: ngày 25/06/2026, commit `5ab0635` đổ 13.579 dòng vào repo —
 * riêng Rust là 46 hàm `extern "C"`, còn cầu chỉ có 3 (JNI) / 4 (Kotlin) / 6 (Swift) /
 * 3 (ObjC). Tức 40-hơn hàm Rust không có đường nào gọi được từ app. Không có gì đỏ:
 * `cargo test` xanh (Rust tự đủ), `tsc` + `jest` xanh (TS không biết Rust tồn tại).
 * Đứt gãy nằm ở KHE GIỮA hai tầng, mà mọi cổng đang có đều chỉ soi TRONG một tầng.
 * Gần hai tháng sau mới có người phát hiện `mintLampViaDid` chưa từng gọi được.
 *
 * Tệp này soi đúng cái khe đó. Hai phép kiểm độc lập:
 *
 *   NGANG — một phương thức lộ ra JS phải có mặt ở CẢ BỐN: Kotlin @ReactMethod,
 *           Swift @objc, ObjC RCT_EXTERN_METHOD, và interface TS. Thiếu một chỗ
 *           nghĩa là hoặc một nền tảng chạy còn nền kia sập, hoặc TS gọi vào hư không.
 *
 *   DỌC   — mỗi phương thức phải chạm tới Rust thật: Kotlin → `external fun native*`
 *           → `Java_..._native*` trong android_jni.rs; Swift → một symbol `taad_*`
 *           có `#[no_mangle]` trong crate.
 *
 * Chạy: node scripts/soi-mach.js        (thoát != 0 khi có đứt gãy)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = {
  kt: 'android/app/src/main/java/com/aladincontract/company/TaadEnclaveModule.kt',
  swift: 'ios/LocalPods/ScannerModule/Core/Enclave/TaadEnclaveModule.swift',
  objc: 'ios/LocalPods/ScannerModule/Core/Enclave/TaadEnclaveModule.m',
  ts: 'src/sdk/taadEnclave.ts',
  jni: 'rust/taad_enclave_core/src/android_jni.rs',
  rustDir: 'rust/taad_enclave_core/src',
};

/**
 * Phương thức CỐ Ý chỉ có ở một phía. Thêm vào đây phải kèm lý do đo được —
 * danh sách này là chỗ duy nhất được phép "biết mà bỏ qua", nên nó phải mỏng.
 */
const MIEN_TRU = {
  // Ba hàm này CỐ Ý không đi qua Rust: mỗi nền tảng dùng kho khoá của hệ điều hành.
  // Android = Keystore + AES/GCM (TaadEnclaveModule.kt:243-251); iOS = Keychain
  // (TaadEnclaveModule.swift:271-296). Đưa xuống Rust là mất chính cái bảo chứng phần cứng.
  secureStore: 'kho khoá hệ điều hành — Keystore/Keychain, không phải Rust',
  secureLoad: 'kho khoá hệ điều hành — Keystore/Keychain, không phải Rust',
  secureDelete: 'kho khoá hệ điều hành — Keystore/Keychain, không phải Rust',
};

/**
 * Danh sách hàm Rust `extern "C"` HIỆN CHƯA có đường gọi nào từ app — món nợ để lại
 * từ commit 5ab0635. Cổng này chỉ ĐỎ khi danh sách PHÌNH RA: thêm một hàm Rust mới mà
 * quên cầu là đỏ ngay hôm đó. Nối được hàm nào thì XOÁ dòng đó đi — tệp ngắn lại là
 * tiến độ đo được. Chỉ được thêm dòng khi có lý do ghi ngay trong commit.
 */
const BASELINE = 'scripts/soi-mach.chua-noi.txt';

const doc = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const bat = (src, re, nhom = 1) => {
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[nhom]);
  return out;
};

// ---- gom tên phương thức ở từng tầng ------------------------------------
const ktSrc = doc(P.kt);
const kotlin = bat(ktSrc, /@ReactMethod[\s\S]{0,80}?\bfun\s+([A-Za-z0-9_]+)\s*\(/g);
const ktNative = bat(ktSrc, /\bexternal\s+fun\s+([A-Za-z0-9_]+)\s*\(/g);

const swiftSrc = doc(P.swift);
const swift = bat(swiftSrc, /@objc\([^)]*\)[\s\S]{0,40}?\bfunc\s+([A-Za-z0-9_]+)\s*\(/g);

const objc = bat(doc(P.objc), /RCT_EXTERN_METHOD\(\s*([A-Za-z0-9_]+)\s*:/g);

const tsSrc = doc(P.ts);
const tsKhop = tsSrc.match(/interface TaadEnclaveNativeBridge \{([\s\S]*?)\n\}/);
const tsBlock = tsKhop ? tsKhop[1] : '';
const ts = bat(tsBlock, /^\s{2}([A-Za-z0-9_]+)\s*\(/gm);

// ---- gom phía Rust -------------------------------------------------------
const jniSrc = doc(P.jni);
const jniFns = bat(jniSrc, /Java_com_aladincontract_company_TaadEnclaveModule_([A-Za-z0-9_]+)/g);

let rustSrc = '';
for (const f of fs.readdirSync(path.join(ROOT, P.rustDir))) {
  if (f.endsWith('.rs')) rustSrc += doc(path.join(P.rustDir, f)) + '\n';
}
const rustSymbols = bat(rustSrc, /#\[no_mangle\][\s\S]{0,120}?extern\s+"C"\s+fn\s+([A-Za-z0-9_]+)/g);

// ---- phép kiểm ----------------------------------------------------------
const tang = { Kotlin: kotlin, Swift: swift, ObjC: objc, TS: ts };
const tatCa = new Set([...kotlin, ...swift, ...objc, ...ts]);
const dutNgang = [];
for (const ten of [...tatCa].sort()) {
  if (ten in MIEN_TRU) continue;
  const thieu = Object.entries(tang).filter(([, s]) => !s.has(ten)).map(([k]) => k);
  if (thieu.length) dutNgang.push({ ten, thieu, co: Object.keys(tang).filter((k) => tang[k].has(ten)) });
}

const hoa = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dutDoc = [];
for (const ten of [...kotlin].sort()) {
  if (ten in MIEN_TRU) continue;
  const native = 'native' + hoa(ten);
  if (!ktNative.has(native)) dutDoc.push(`Kotlin \`${ten}\` không có \`external fun ${native}\``);
  else if (!jniFns.has(native)) dutDoc.push(`\`${native}\` khai báo ở Kotlin nhưng android_jni.rs không có \`Java_..._${native}\` — gọi tới là app sập UnsatisfiedLinkError`);
}

// Swift: mỗi @objc func phải gọi ít nhất một symbol taad_* có thật trong Rust.
// Cắt theo từng khối `@objc(...)`; khối đầu là chú thích của class (không có `func`) nên bị bỏ.
for (const khoi of swiftSrc.split(/@objc\([^)]*\)/).slice(1)) {
  const dau = khoi.match(/^\s*func\s+([A-Za-z0-9_]+)\s*\(/);
  if (!dau) continue;
  const ten = dau[1];
  if (ten in MIEN_TRU) continue;
  const goi = [...bat(khoi, /\b(taad_[a-z0-9_]+)\s*\(/g)].filter((s) => s !== 'taad_free_string');
  if (!goi.length) { dutDoc.push(`Swift \`${ten}\` không gọi symbol \`taad_*\` nào`); continue; }
  const ma = goi.filter((s) => !rustSymbols.has(s));
  if (ma.length) dutDoc.push(`Swift \`${ten}\` gọi \`${ma.join(', ')}\` — Rust không có \`#[no_mangle] extern "C"\` tên đó, link sẽ hỏng`);
}

// Phép kiểm 3: hàm Rust `extern "C"` nào KHÔNG tầng nào chạm tới. Đây đúng là hình dạng
// của vụ 25/06 — Rust có hàm, không ai gọi được, và không cổng nào đỏ. "Chạm tới" nghĩa là
// Swift gọi thẳng symbol đó. Cầu Android không đi qua C FFI (android_jni.rs gọi `crate::`
// trực tiếp), nên phía Android đã được phép kiểm ĐỨT DỌC ở trên lo.
const chuaNoi = [...rustSymbols].filter((s) => s !== 'taad_free_string' && !swiftSrc.includes(s + '('));
const noBaseline = new Set(
  doc(BASELINE).split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean),
);
const moiDut = chuaNoi.filter((s) => !noBaseline.has(s));
const daNoiLai = [...noBaseline].filter((s) => !chuaNoi.includes(s));

// Con số "chưa nối" gộp HAI thứ khác hẳn nhau, và gộp lại thì nó không nói được
// thứ duy nhất đáng hỏi: hàm nào đã đi được nửa đường.
//
//   dở dang — phía TS ĐÃ có tên tương ứng, nhưng Swift chưa gọi symbol Rust.
//             Đây là nợ THẬT: có người bắt đầu nối rồi dừng, và phía TS đang mang
//             một cái tên gọi vào là hỏng.
//   nội bộ  — không phía nào có tên tương ứng. Phần lớn là hàm nội bộ của crate,
//             chưa từng định thành cầu. Nó nằm trong danh sách để đếm, không phải
//             để ai đó thấy áy náy.
//
// Tính TẠI ĐÂY thay vì ghi nhãn tay vào tệp nợ: một nhãn viết tay già đi lặng lẽ
// đúng vào ngày ai đó nối xong nửa còn lại, và không có gì báo. Con số này thì
// sinh lại mỗi lượt chạy.
const sangLacDa = (s) => s.replace(/^taad_/, '').replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const doDang = chuaNoi.filter((s) => new RegExp(`\\b${sangLacDa(s)}\\b`).test(tsSrc));
const noiBo = chuaNoi.filter((s) => !doDang.includes(s));

// ---- báo cáo ------------------------------------------------------------
console.log('soi-mach — cầu native TaadEnclave');
console.log(`  Kotlin @ReactMethod : ${kotlin.size}`);
console.log(`  Swift  @objc func   : ${swift.size}`);
console.log(`  ObjC   RCT_EXTERN   : ${objc.size}`);
console.log(`  TS     bridge iface : ${ts.size}`);
console.log(`  Rust   no_mangle    : ${rustSymbols.size}   JNI: ${jniFns.size}`);
if (Object.keys(MIEN_TRU).length) console.log(`  miễn trừ            : ${Object.keys(MIEN_TRU).join(', ')}`);
console.log('');

console.log(`  Rust chưa nối      : ${chuaNoi.length}/${rustSymbols.size} (nợ ghi trong ${BASELINE}: ${noBaseline.size})`);
console.log(`     ├ dở dang       : ${doDang.length}${doDang.length ? '  ' + doDang.join(', ') : ''}`);
console.log(`     └ nội bộ crate  : ${noiBo.length}`);
console.log('');

if (daNoiLai.length) {
  console.log(`ℹ️  ${daNoiLai.length} hàm đã nối xong — xoá khỏi ${BASELINE}: ${daNoiLai.join(', ')}`);
  console.log('');
}
if (!dutNgang.length && !dutDoc.length && !moiDut.length) {
  console.log(`✅ Mạch liền: ${tatCa.size} phương thức đủ cả 4 phía và đều chạm Rust.`);
  console.log(`   ${chuaNoi.length} hàm Rust còn chưa nối, đúng bằng nợ đã ghi — không phát sinh thêm.`);
  process.exit(0);
}
if (dutNgang.length) {
  console.log(`❌ ĐỨT NGANG — ${dutNgang.length} phương thức không có đủ ở cả 4 phía:`);
  for (const d of dutNgang) console.log(`   ${d.ten}\n      có: ${d.co.join(', ') || '(không đâu cả)'}\n      THIẾU: ${d.thieu.join(', ')}`);
  console.log('');
}
if (dutDoc.length) {
  console.log(`❌ ĐỨT DỌC — ${dutDoc.length} chỗ không chạm tới Rust:`);
  for (const d of dutDoc) console.log(`   ${d}`);
  console.log('');
}
if (moiDut.length) {
  console.log(`❌ HÀM RUST MỚI KHÔNG CÓ CẦU — ${moiDut.length} hàm không tầng nào gọi được:`);
  for (const d of moiDut) console.log(`   ${d}`);
  console.log('   Viết cầu (JNI + Kotlin + Swift + .m + TS), hoặc ghi vào ' + BASELINE + ' kèm lý do trong commit.');
  console.log('');
}
console.log('Sửa cho liền, hoặc thêm vào MIEN_TRU trong scripts/soi-mach.js KÈM lý do đo được.');
process.exit(1);
