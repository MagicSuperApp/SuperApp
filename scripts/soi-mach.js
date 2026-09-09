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

/**
 * Bỏ chú thích TRƯỚC khi bất cứ phép bắt nào chạy.
 *
 * Vì sao phải dùng chung cho MỌI nguồn chứ không riêng Swift: một khai báo bị bọc
 * trong chú thích vẫn khớp regex y hệt một khai báo sống. Ca đã tái hiện được —
 * đổi `private external fun nativeMasterKekToMnemonic(` ở `TaadEnclaveModule.kt`
 * thành `// ĐÃ TẮT TẠM: private external fun nativeMasterKekToMnemonic(` thì cổng
 * vẫn in `✅ Mạch liền` và thoát 0, trong khi lời gọi từ JS sẽ ném
 * `UnsatisfiedLinkError`. Đó đúng là hình dạng vụ 25/06 mà tệp này sinh ra để chặn.
 *
 * Bản trước strip cho ĐÚNG MỘT nguồn (`swiftSrc`) rồi dừng, kèm một chú thích tự
 * nhận ra "cùng bẫy đã ghi hai lần". Đợt vá đó lấy phạm vi bằng phạm vi của
 * TRIỆU CHỨNG, nên bảy nguồn anh em nằm ngay bên cạnh giữ nguyên lỗ.
 *
 * Chiều cắt chọn theo chiều HỎNG, không theo độ chính xác:
 *   · cắt quá tay ⟹ một tên thật biến khỏi tập ⟹ cổng ĐỎ hoặc kêu KHÔNG ĐO ĐƯỢC.
 *     Phiền, nhưng người bị chặn BIẾT mình bị chặn.
 *   · cắt thiếu   ⟹ chú thích được tính là mã ⟹ cổng XANH oan, và không ai biết.
 * Nên ở đây cắt cả đuôi dòng, không chỉ dòng mở đầu bằng `//`.
 *
 * `(^|[^:])` chừa lại `://` của URL trong chuỗi — không có nó thì một dòng mang
 * `https://…` bị cụt và tên hàm đứng sau đó trên cùng dòng biến mất, tức đỏ oan
 * theo một đường không ai đoán ra khi đọc thông điệp lỗi.
 */
const boChuThich = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const bat = (src, re, nhom = 1) => {
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[nhom]);
  return out;
};

// ---- gom tên phương thức ở từng tầng ------------------------------------
const ktSrc = boChuThich(doc(P.kt));
const kotlin = bat(ktSrc, /@ReactMethod[\s\S]{0,80}?\bfun\s+([A-Za-z0-9_]+)\s*\(/g);
const ktNative = bat(ktSrc, /\bexternal\s+fun\s+([A-Za-z0-9_]+)\s*\(/g);

const swiftSrc = boChuThich(doc(P.swift));
const swift = bat(swiftSrc, /@objc\([^)]*\)[\s\S]{0,40}?\bfunc\s+([A-Za-z0-9_]+)\s*\(/g);

const objc = bat(boChuThich(doc(P.objc)), /RCT_EXTERN_METHOD\(\s*([A-Za-z0-9_]+)\s*:/g);

const tsSrc = boChuThich(doc(P.ts));
const tsKhop = tsSrc.match(/interface TaadEnclaveNativeBridge \{([\s\S]*?)\n\}/);
const tsBlock = tsKhop ? tsKhop[1] : '';
const ts = bat(tsBlock, /^\s{2}([A-Za-z0-9_]+)\s*\(/gm);

// ---- gom phía Rust -------------------------------------------------------
const jniSrc = boChuThich(doc(P.jni));
const jniFns = bat(jniSrc, /Java_com_aladincontract_company_TaadEnclaveModule_([A-Za-z0-9_]+)/g);

let rustSrc = '';
for (const f of fs.readdirSync(path.join(ROOT, P.rustDir))) {
  if (f.endsWith('.rs')) rustSrc += boChuThich(doc(path.join(P.rustDir, f))) + '\n';
}
const rustSymbols = bat(rustSrc, /#\[no_mangle\][\s\S]{0,120}?extern\s+"C"\s+fn\s+([A-Za-z0-9_]+)/g);

// ---- trạng thái thứ BA: KHÔNG ĐO ĐƯỢC -----------------------------------
// Mọi phép kiểm dưới đây suy ra từ bốn tập trên. Một tập RỖNG không làm phép kiểm
// nào đỏ — nó làm phép kiểm đó ngừng chạy, im lặng. Bốn tập cùng rỗng thì mọi vòng
// lặp không chạy lần nào và cổng in ra câu khẳng định mạnh nhất nó có:
//
//     ✅ Mạch liền: 0 phương thức đủ cả 4 phía và đều chạm Rust.
//
// rồi thoát 0. Đó không phải "ổn", đó là "tôi không biết" nói bằng giọng của "ổn".
//
// Và nó KHÔNG cần ai phá hoại mới xảy ra: mỗi tập được gom bằng một regex khớp một
// cách viết cụ thể. Di trú sang TurboModule là `@ReactMethod` biến mất khỏi Kotlin,
// `@objc(...)` biến mất khỏi Swift, `RCT_EXTERN_METHOD` biến mất khỏi ObjC, interface
// TS đổi tên theo codegen — bốn tệp vẫn còn đó nên `readFileSync` không ném, không
// nhánh lỗi nào chạy. Đổi `tabWidth` 2→4 trong Prettier là đủ làm tập TS rỗng.
//
// Ca một tầng còn khó thấy hơn ca bốn tầng: chỉ Kotlin rỗng thì phép kiểm ĐỨT DỌC
// (vòng lặp trên `kotlin`) tắt câm, trong khi ĐỨT NGANG vẫn đỏ vì "thiếu Kotlin" —
// người ta sửa cái đỏ họ thấy, không ai biết phép kiểm JNI đã ngừng chạy.
//
// Mã thoát 2 chứ không phải 1: trạng thái MÙ phải kêu TO HƠN trạng thái LỆCH.
const nguon = [
  ['Kotlin @ReactMethod', kotlin.size],
  ['Swift @objc func', swift.size],
  ['ObjC RCT_EXTERN_METHOD', objc.size],
  ['TS interface TaadEnclaveNativeBridge', ts.size],
  ['Rust #[no_mangle] extern "C"', rustSymbols.size],
  ['JNI Java_..._TaadEnclaveModule_', jniFns.size],
];
const mu = nguon.filter(([, n]) => n === 0);
if (mu.length) {
  console.error('⛔ KHÔNG ĐO ĐƯỢC — cổng này không kết luận được gì về mạch cầu.');
  console.error('');
  for (const [ten] of mu) {
    console.error(`   ${ten} → 0 mục. Tệp đọc được, nhưng không mẫu nào khớp.`);
  }
  console.error('');
  console.error('   Tệp còn đó nên không có lỗi đọc nào để bắt. Nguyên nhân hầu như luôn là');
  console.error('   CÁCH VIẾT đã đổi (di trú TurboModule, đổi tabWidth, đổi tên interface),');
  console.error('   chứ không phải mã bị xoá. Sửa mẫu khớp trong scripts/soi-mach.js, ĐỪNG');
  console.error('   đọc màu xanh của lượt chạy trước như một bằng chứng.');
  process.exit(2);
}

// ---- phép kiểm ----------------------------------------------------------
const tang = { Kotlin: kotlin, Swift: swift, ObjC: objc, TS: ts };
const tatCa = new Set([...kotlin, ...swift, ...objc, ...ts]);
const dutNgang = [];
for (const ten of [...tatCa].sort()) {
  if (Object.hasOwn(MIEN_TRU, ten)) continue; // `in` đi qua cả chuỗi nguyên mẫu
  const thieu = Object.entries(tang).filter(([, s]) => !s.has(ten)).map(([k]) => k);
  if (thieu.length) dutNgang.push({ ten, thieu, co: Object.keys(tang).filter((k) => tang[k].has(ten)) });
}

const hoa = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dutDoc = [];
for (const ten of [...kotlin].sort()) {
  if (Object.hasOwn(MIEN_TRU, ten)) continue; // `in` đi qua cả chuỗi nguyên mẫu
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
  if (Object.hasOwn(MIEN_TRU, ten)) continue; // `in` đi qua cả chuỗi nguyên mẫu
  const goi = [...bat(khoi, /\b(taad_[a-z0-9_]+)\s*\(/g)].filter((s) => s !== 'taad_free_string');
  if (!goi.length) { dutDoc.push(`Swift \`${ten}\` không gọi symbol \`taad_*\` nào`); continue; }
  const ma = goi.filter((s) => !rustSymbols.has(s));
  if (ma.length) dutDoc.push(`Swift \`${ten}\` gọi \`${ma.join(', ')}\` — Rust không có \`#[no_mangle] extern "C"\` tên đó, link sẽ hỏng`);
}

// Phép kiểm 3: hàm Rust `extern "C"` nào KHÔNG tầng nào chạm tới. Đây đúng là hình dạng
// của vụ 25/06 — Rust có hàm, không ai gọi được, và không cổng nào đỏ. "Chạm tới" nghĩa là
// Swift gọi thẳng symbol đó. Cầu Android không đi qua C FFI (android_jni.rs gọi `crate::`
// trực tiếp), nên phía Android đã được phép kiểm ĐỨT DỌC ở trên lo.
// Chỉ soi MÃ: một dòng `// TODO: sau này gọi taad_x(...)` đủ để một hàm Rust chưa
// có cầu tự rơi khỏi danh sách nợ — cổng xanh cho đúng thứ nó sinh ra để bắt. Cùng
// bẫy đã ghi hai lần ở `src/screens/SeedExportScreen.gate.test.ts`: phép đo văn bản
// không tự phân biệt được mã với lời bàn về mã.
// `swiftSrc` nay đã qua `boChuThich` ngay lúc đọc, cùng lối với mọi nguồn khác —
// bản trước strip riêng ở dòng này, và chính chỗ strip riêng ấy là dấu hiệu rằng
// bảy nguồn còn lại chưa được quét.
const chuaNoi = [...rustSymbols].filter((s) => s !== 'taad_free_string' && !swiftSrc.includes(s + '('));
// `split(/\r?\n/)` và `/#.*/` (không `$`) — HAI sửa cho HAI nguyên nhân, đừng bỏ một:
// `split('\n')` để lại `\r` cuối dòng, mà trong regex JS dấu `.` KHÔNG khớp `\r` và
// `$` không có cờ `m` chỉ khớp cuối chuỗi ⟹ `#.*$` không cắt được chú thích trên tệp
// CRLF. Máy dựng chính đặt `core.autocrlf=true` (xem `.gitattributes`) và tệp nợ là
// `.txt` không được ghim `eol`, nên nó checkout ra CRLF trên máy đó: đếm ra 40 thay
// vì 35, và 5 dòng chú thích đầu tệp bị báo là "5 hàm đã nối xong".
const noBaseline = new Set(
  doc(BASELINE).split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean),
);
const moiDut = chuaNoi.filter((s) => !noBaseline.has(s));
// Một tên rời khỏi `chuaNoi` vì HAI lý do ngược hẳn nhau, và gộp lại thì dòng báo
// nói sai theo đúng chiều dễ tin nhất:
//   · tên VẪN CÒN trong rustSymbols ⟹ Swift đã gọi tới ⟹ nối xong thật.
//   · tên KHÔNG CÒN trong rustSymbols ⟹ hàm bị xoá, bị đổi tên, hoặc regex dòng
//     `#[no_mangle]` không khớp nữa (thêm một `#[cfg]` xen giữa là vượt cửa sổ 120
//     ký tự). Không có cái nào là tiến độ.
// Bản trước in cả hai dưới nhãn "đã nối xong — xoá khỏi tệp nợ", tức xoá một hàm
// Rust và nối cầu cho nó cho ra CÙNG một dòng chữ, kèm cùng một lời khuyên.
const daNoiLai = [...noBaseline].filter((s) => !chuaNoi.includes(s) && rustSymbols.has(s));
const daBienMat = [...noBaseline].filter((s) => !rustSymbols.has(s));

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
if (daBienMat.length) {
  console.log(`⚠️  ${daBienMat.length} tên trong ${BASELINE} KHÔNG còn là hàm \`#[no_mangle] extern "C"\`:`);
  console.log(`      ${daBienMat.join(', ')}`);
  console.log('    Đây KHÔNG phải "đã nối xong". Ba khả năng, phải phân biệt trước khi xoá dòng nợ:');
  console.log('      · hàm bị xoá thật      → xoá dòng nợ là đúng');
  console.log('      · hàm bị đổi tên       → đổi dòng nợ theo tên mới, đừng xoá');
  console.log('      · regex không khớp nữa → SỬA scripts/soi-mach.js, hàm vẫn còn và vẫn chưa nối');
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
