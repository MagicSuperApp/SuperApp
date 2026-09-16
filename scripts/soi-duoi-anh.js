#!/usr/bin/env node
/**
 * Soi đuôi tệp ảnh so với định dạng THẬT (đọc magic bytes).
 *
 * VÌ SAO CÓ TỆP NÀY:
 * 16/09/2026 lượt ký bản phát hành Android đỏ ở bước biên dịch tài nguyên:
 *   ERROR: .../drawable-mdpi/assets_images_banners_chatfi.png: AAPT: error: file failed to compile.
 * Hai tấm băng trong `assets/images/banners/` là JPEG nhưng mang đuôi `.png`. AAPT
 * giải mã theo ĐUÔI, gặp byte JPEG thì chết. Bản debug bỏ qua chỗ lệch này, `tsc`
 * và `jest` không nhìn tới ảnh, nên lỗi chỉ hiện ra ở bước MUỘN NHẤT có thể — sau
 * khi đã qua mọi cổng và đang ký bản phát hành.
 *
 * Bản vá hôm đó đổi tên hai tệp cho khớp định dạng, nhưng không dựng gì ngăn lần
 * sau. Tệp này là phần đó.
 *
 * TẬP ĐẦY ĐỦ là `git ls-files` — tệp ĐƯỢC THEO DÕI. Cố ý không quét cây thư mục:
 * tệp không vào git thì không vào bản dựng từ kho, còn `node_modules` và thư mục
 * `build/` thì vừa khổng lồ vừa không phải thứ kho này chịu trách nhiệm. Tệp ảnh
 * nằm ngoài git vẫn được ĐẾM và khai ra, để con số ở đây mang theo phạm vi của nó.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DUOI_ANH = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

/** Đọc định dạng thật từ magic bytes. Trả null khi không nhận ra. */
function dinhDangThat(buf) {
  if (buf.length >= 8 && buf.compare(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 0, 8, 0, 8) === 0) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 6 && buf.toString('ascii', 0, 6).match(/^GIF8[79]a$/)) return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 2 && buf.toString('ascii', 0, 2) === 'BM') return 'bmp';
  return null;
}

/** Đuôi nào chấp nhận định dạng nào. */
const CHAP_NHAN = {
  '.png': ['png'],
  '.jpg': ['jpeg'],
  '.jpeg': ['jpeg'],
  '.gif': ['gif'],
  '.webp': ['webp'],
  '.bmp': ['bmp'],
};

function main() {
  const goc = process.cwd();

  let theoDoi;
  try {
    theoDoi = execFileSync('git', ['ls-files', '-z'], { cwd: goc, maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  } catch (e) {
    // KHÔNG ĐO ĐƯỢC — kêu to hơn "lệch", vì màu xanh lúc này vô nghĩa.
    console.error('::error::Cổng soi đuôi ảnh KHÔNG CHẠY ĐƯỢC: không liệt kê nổi tệp theo dõi của git.');
    console.error(`::error::${e.message}`);
    process.exit(1);
  }

  const anh = theoDoi.filter((f) => DUOI_ANH.includes(path.extname(f).toLowerCase()));

  const lech = [];
  const khongDoDuoc = [];

  for (const f of anh) {
    const duoi = path.extname(f).toLowerCase();
    let buf;
    try {
      const fd = fs.openSync(path.join(goc, f), 'r');
      buf = Buffer.alloc(16);
      const n = fs.readSync(fd, buf, 0, 16, 0);
      fs.closeSync(fd);
      buf = buf.subarray(0, n);
    } catch (e) {
      khongDoDuoc.push({ f, ly_do: `không đọc được: ${e.code || e.message}` });
      continue;
    }

    const that = dinhDangThat(buf);
    if (that === null) {
      khongDoDuoc.push({ f, ly_do: 'không nhận ra định dạng từ magic bytes' });
      continue;
    }
    if (!CHAP_NHAN[duoi].includes(that)) {
      lech.push({ f, duoi, that });
    }
  }

  // Phần nằm NGOÀI tập đã quét — đếm, không mở.
  let ngoaiGit = 0;
  try {
    ngoaiGit = execFileSync('git', ['ls-files', '-o', '--exclude-standard', '-z'], { cwd: goc, maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .filter((f) => DUOI_ANH.includes(path.extname(f).toLowerCase())).length;
  } catch {
    ngoaiGit = -1; // không đếm được
  }

  console.log('── Soi đuôi tệp ảnh so với định dạng thật ──');
  console.log(`Đã soi: ${anh.length} tệp ảnh được git theo dõi.`);
  console.log(
    ngoaiGit < 0
      ? 'Nằm ngoài phạm vi: KHÔNG ĐẾM ĐƯỢC số tệp ảnh chưa vào git.'
      : `Nằm ngoài phạm vi: ${ngoaiGit} tệp ảnh chưa vào git (không soi — tệp ngoài git không vào bản dựng từ kho).`,
  );

  if (khongDoDuoc.length > 0) {
    console.error(`::error::${khongDoDuoc.length} tệp KHÔNG ĐO ĐƯỢC — trạng thái mù, không phải trạng thái tốt:`);
    for (const k of khongDoDuoc) console.error(`::error::  ${k.f} — ${k.ly_do}`);
  }

  if (lech.length > 0) {
    console.error(`::error::${lech.length} tệp mang đuôi KHÔNG khớp định dạng thật:`);
    for (const l of lech) {
      console.error(`::error::  ${l.f} — đuôi ${l.duoi} nhưng nội dung là ${l.that}`);
    }
    console.error('::error::AAPT giải mã theo ĐUÔI. Chỗ lệch này không đỏ ở tsc/jest/bản debug —');
    console.error('::error::nó đỏ ở bước ký bản phát hành, tức muộn nhất có thể. Đổi tên tệp cho khớp');
    console.error('::error::định dạng thật, rồi sửa mọi chỗ require() trỏ tới nó.');
  }

  if (lech.length > 0 || khongDoDuoc.length > 0) process.exit(1);

  console.log('Không tệp nào lệch.');
}

main();
