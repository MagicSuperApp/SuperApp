// modules/work/services/signWorkChallenge.ts
//
// Nối signChallenge AladinWork vào KHOÁ PHẦN CỨNG PhoenixKey (thay TODO "PhoenixKey native cấp").
// Server verify ECDSA P-256 (secp256r1) / SHA-256, chữ ký DER hex trên
// message = "<challenge>:<domain>:<timestamp>" (SPEC §2). signRaw của PhoenixKey
// (Secure Enclave/StrongBox) nhận HEX bytes → tự SHA-256 + ký P-256 → trả DER hex —
// KHỚP đúng thứ AladinWork cần (cùng cơ chế orilifeDidAuth đã dùng cho field-reid).

import { signRaw } from '../../../sdk/phoenixKey';
import type { SignChallengeFn } from '../hooks/useWorkAuth';

// UTF-8 → hex (message toàn ASCII trong thực tế, nhưng mã hoá UTF-8 cho chắc).
const utf8ToHex = (s: string): string => {
  let hex = '';
  for (const ch of s) {
    let cp = ch.codePointAt(0) as number;
    const bytes: number[] = [];
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  }
  return hex;
};

export const signWorkChallenge: SignChallengeFn = ({ message }) =>
  signRaw(
    utf8ToHex(message),
    'Đăng nhập Aladin Work',
    'Ký bằng khoá phần cứng để mở phiên làm việc',
  );
