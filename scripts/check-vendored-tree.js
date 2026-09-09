#!/usr/bin/env node
/**
 * check-vendored-tree.js — ghim NỘI DUNG của các cây vendored trong kho này.
 *
 * ── Vấn đề nó giải ────────────────────────────────────────────────────────────
 * `rust/vendor/openmls` (468 tệp) và `rust/chat_mls/src` là BẢN CHÉP từ một kho
 * khác. Bản chép không có đường về nguồn, và không ai biết khi nó đã chết — đó là
 * dạng hỏng tệ hơn thiếu thông tin, vì người đọc TIN nó.
 *
 * ── Vì sao ghim bằng băm tree của git, không phải bằng phép so hai cây ────────
 * Cách hiển nhiên là chạy `diff -rq` giữa cây ở đây và cây ở kho nguồn, hằng ngày.
 * Cách đó KHÔNG chạy được trên CI: máy chạy phải lấy được cây kia, mà kho nguồn là
 * kho riêng tư. Nó không rẻ hơn việc cấp khoá đọc — nó LÀ việc cấp khoá đọc, cộng
 * thêm một bước.
 *
 * Băm đối tượng tree của git là băm NỘI DUNG, và không mã hoá đường dẫn cha của
 * chính nó. Nên cùng một nội dung nằm ở `vendor/openmls` bên kho nguồn và ở
 * `rust/vendor/openmls` bên này vẫn ra cùng một chuỗi 40 ký tự.
 *
 * ⟹ Không chuyển CÂY, chuyển một CON SỐ. Bên giữ nguồn chạy một lệnh và gửi hai
 *   chuỗi; cổng này cần đúng không thứ gì ngoài kho của chính nó.
 *
 * ── Nó bắt được gì, và KHÔNG bắt được gì ─────────────────────────────────────
 *   bắt được  : bản chép trong kho này trôi khỏi giá trị đã chốt.
 *   KHÔNG bắt : kho nguồn đổi mà bên này chưa biết.
 *
 * Nửa thứ hai không quy được về một cổng máy, và tệp này không giả vờ ngược lại —
 * nó IN RA lời rào đó mỗi lượt chạy. Một cổng để người đọc hiểu nhầm phạm vi của
 * nó thì tệ hơn không có cổng: không có cổng thì người ta còn đi kiểm tay.
 *
 * ── Ba trạng thái, không phải hai ────────────────────────────────────────────
 * Mã thoát 0 khớp · 1 lệch · 2 KHÔNG ĐO ĐƯỢC. Trạng thái thứ ba có mã riêng vì
 * một phép đo trả giá trị hợp lệ đúng lúc nó không đo được gì thì màu xanh của nó
 * vô nghĩa: nó không nói "khớp", nó nói "tôi không biết" bằng giọng của "khớp".
 * Ca thật đã dính ở nơi khác: `shasum` hỏng trả băm rỗng ⟹ hai lần hỏng so ra
 * "KHỚP"; và thư mục RỖNG cũng cho ra một băm hợp lệ.
 *
 * Chạy: node scripts/check-vendored-tree.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PIN = path.join(__dirname, 'vendored-tree-pin.json');

const STATE = { OK: 'OK', DRIFTED: 'LỆCH', UNMEASURABLE: 'KHÔNG ĐO ĐƯỢC' };

/** Băm tree của git cho một đường dẫn ở HEAD. Trả `{ok:false, reason}` thay vì ném. */
function treeHashAt(relPath) {
  try {
    const out = execFileSync('git', ['-C', ROOT, 'rev-parse', `HEAD:${relPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    // Hình dạng lạ thì NÉM, đừng nuốt: một chuỗi rỗng hay một chuỗi không phải băm
    // mà lọt xuống phép so sẽ thành "lệch" hoặc "khớp" tuỳ may rủi, và cả hai đều
    // là kết luận rút ra từ chỗ không đo được gì.
    if (!/^[0-9a-f]{40}$/.test(out)) {
      return { ok: false, reason: `git trả chuỗi không phải băm 40 ký tự: ${JSON.stringify(out)}` };
    }
    return { ok: true, hash: out };
  } catch (e) {
    const err = (e.stderr || e.message || '').toString().trim().split('\n')[0];
    return { ok: false, reason: err || 'git rev-parse thất bại' };
  }
}

function main() {
  let pin;
  try {
    pin = JSON.parse(fs.readFileSync(PIN, 'utf8'));
  } catch (e) {
    console.log(`❓ ${STATE.UNMEASURABLE} — không đọc được tệp ghim: ${e.message}`);
    process.exit(2);
  }

  const trees = Array.isArray(pin.trees) ? pin.trees : null;
  if (!trees || trees.length === 0) {
    // Danh sách rỗng KHÔNG được đi qua thành "mọi thứ khớp" — đó đúng là cái xanh rỗng.
    console.log(`❓ ${STATE.UNMEASURABLE} — tệp ghim không có mục nào để đối chiếu.`);
    process.exit(2);
  }

  console.log('check-vendored-tree — ghim nội dung cây vendored\n');

  const rows = [];
  for (const t of trees) {
    const got = treeHashAt(t.path);
    if (!got.ok) {
      rows.push({ ...t, state: STATE.UNMEASURABLE, note: got.reason });
      continue;
    }
    rows.push({
      ...t,
      state: got.hash === t.tree ? STATE.OK : STATE.DRIFTED,
      note: got.hash === t.tree ? got.hash : `ghim ${t.tree}\n        đo   ${got.hash}`,
      got: got.hash,
    });
  }

  for (const r of rows) {
    const dau = r.state === STATE.OK ? '✓' : r.state === STATE.DRIFTED ? '✗' : '?';
    console.log(`  ${dau} [${r.state}]  ${r.path}  (${r.files} tệp)`);
    console.log(`        ${r.note}`);
    console.log(`        nguồn: ${r.source} @ ${r.sourceRef}`);
  }
  console.log('');

  // LỆCH thắng KHÔNG-ĐO-ĐƯỢC: hạ một cái đã biết là sai xuống thành "không rõ" là giấu nó.
  let tong;
  if (rows.some((r) => r.state === STATE.DRIFTED)) tong = STATE.DRIFTED;
  else if (rows.some((r) => r.state === STATE.UNMEASURABLE)) tong = STATE.UNMEASURABLE;
  else tong = STATE.OK;

  const conChoNguon = trees.filter((t) => t.sourceTreePending);
  if (conChoNguon.length) {
    console.log(
      `⚠  Cổng này mới ghim được NỬA: "bản chép bên này không trôi". Nửa còn lại —\n`
      + `   "kho nguồn chưa đổi" — CHƯA đo được, vì ${conChoNguon.length}/${trees.length} mục chưa có băm\n`
      + `   phía nguồn để đối chiếu. Nửa ấy đang dựa vào cam kết gửi thư của bên giữ\n`
      + `   nguồn, tức một lời hứa của người, KHÔNG phải một cổng của máy.\n`
      + `   ⟹ Màu xanh dưới đây KHÔNG có nghĩa là hai cây còn khớp.\n`,
    );
  }

  if (tong === STATE.OK) {
    console.log('✅ Bản chép trong kho này đúng bằng giá trị đã chốt.');
    process.exit(0);
  }
  if (tong === STATE.DRIFTED) {
    console.log('❌ LỆCH — bản chép đã đổi mà tệp ghim thì chưa.');
    console.log('   Đổi CỐ Ý thì cập nhật `scripts/vendored-tree-pin.json` trong cùng commit,');
    console.log('   và nói trong commit là đổi theo cái gì. Sửa băm cho cổng thôi đỏ, mà không');
    console.log('   biết vì sao nó đỏ, là gỡ chính cái cổng này.');
    process.exit(1);
  }
  console.log('❓ KHÔNG ĐO ĐƯỢC — và đây KHÔNG phải là đạt: phép đo mù, không phải bản chép đúng.');
  process.exit(2);
}

main();
