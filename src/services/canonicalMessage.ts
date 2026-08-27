// services/canonicalMessage.ts
//
// ĐÓNG KHUNG THEO ĐỘ DÀI CHO CHUỖI KÝ — bản TS đối ứng `CanonicalMessage.build`
// của máy chủ PhoenixKey.
//
// ══ Vì sao nối bằng ':' là hỏng ═══════════════════════════════════════════════
// Nhà PhoenixKey dựng được một va chạm THẬT ở `/org/create` (thư `ma:pk-canon-len`,
// 2026-08-27) — không phải hình dạng đáng ngờ, mà là hai thân gửi khác nhau cho ra
// ĐÚNG cùng chuỗi byte:
//
//   khuôn cũ: PREFIX + ownerDid + ":" + name + ":" + registrationNumber + ":" + nonce
//
//     (name="A",   reg="B:C")  →  "…:A:B:C:" + nonce
//     (name="A:B", reg="C"  )  →  "…:A:B:C:" + nonce
//
// `name` và `registrationNumber` là hai trường VĂN BẢN TỰ DO nằm cạnh nhau, chỉ
// ràng buộc `@Size`, không cấm ký tự nào. Một chữ ký nhận cả hai cách đọc ⇒ tên tổ
// chức hiện ra khác tên đã ký.
//
// Máy chủ CỐ Ý không cấm `':'` trong tên tổ chức, và lý do đó đúng: cấm ký tự là
// đẩy chi phí sang người dùng thật (tên tiếng Việt, tên có dấu hai chấm) để bù cho
// một khuôn ký sai. Đóng ở khuôn thì đóng hẳn.
//
// ══ Khuôn ════════════════════════════════════════════════════════════════════
//   tiền tố (byte thô, KHÔNG đóng khung)
//   ++ với mỗi field: 4 byte độ dài BIG-ENDIAN ++ field UTF-8
//
// Vector cố định do nhà PhoenixKey ghim (`CanonicalChallengeAmbiguityTest`):
//
//   build("P:", "ab")  =  50 3a 00 00 00 02 61 62
//                         └P┘└:┘└─ len=2 ─┘└ab┘
//
// Độ dài là **4 byte big-endian**, KHÔNG phải varint, KHÔNG phải LEB128. Bài kiểm
// dựng lại đúng tám byte này — lệch là đỏ ngay ở đây chứ không đỏ ở luồng thật của
// người dùng.
//
// ⚠️ Độ dài đếm BYTE UTF-8, không đếm ký tự. Tên tiếng Việt có dấu là chỗ hai con
// số đó tách nhau, và cũng là chỗ người dùng thật đứng.
//
// ══ Bốn luồng CỐ Ý không đổi ══════════════════════════════════════════════════
// `GENESIS_`, `RESOLVE_`, `LOOKUP_` và bản CLI đối ứng vẫn nối `':'`. Ở đó trường
// đứng trước dấu phân tách là HEX — bảng chữ cái hẹp, không chứa `':'` được — nên
// ranh giới không dời được, và nonce là field CUỐI nên không có gì sau nó để nuốt.
// Đổi chúng chỉ phá hợp đồng dây mà không đóng thêm lỗ nào. Ghi ra đây để lượt sau
// đừng "đổi cho đều".

/** Byte UTF-8 của một chuỗi. Tự dựng để không phụ thuộc `TextEncoder`. */
export function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const code = s.codePointAt(i)!;
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f),
      );
      i += 1; // cặp surrogate chiếm hai đơn vị mã
    }
  }
  return out;
}

const hex = (b: number): string => b.toString(16).padStart(2, '0');

/** 4 byte độ dài, big-endian. Máy chủ đọc đúng bốn byte — không co giãn. */
function lenBE(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/**
 * Dựng chuỗi ký chuẩn, trả **hex** (đó là dạng `signRaw` nhận).
 *
 * `prefix` đi vào dạng byte THÔ, kể cả dấu `':'` cuối nếu máy chủ khai có — nó là
 * tiền tố miền, không phải một field. `fields` mỗi cái được đóng khung riêng.
 *
 * Field rỗng vẫn là một field: nó vào thành `00 00 00 00`, KHÁC hẳn với việc bỏ
 * field đó đi. Máy chủ khai `granteeDid|""` ở luồng `/org/lamp-grant` chính là ca
 * này — truyền `''`, đừng bỏ qua.
 */
export function buildCanonicalHex(prefix: string, ...fields: string[]): string {
  const out: number[] = [...utf8Bytes(prefix)];
  for (const f of fields) {
    const b = utf8Bytes(f);
    out.push(...lenBE(b.length), ...b);
  }
  return out.map(hex).join('');
}
