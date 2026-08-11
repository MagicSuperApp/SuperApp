/**
 * token.ts — đổi số lượng THÔ trên chuỗi sang chuỗi hiển thị cho người đọc.
 *
 * VÌ SAO CÓ FILE NÀY: trên Cardano, số lượng native asset trong UTxO LUÔN là số
 * nguyên ở đơn vị nhỏ nhất. Phoenix `/wallet/{did}/all` trả THÔ, đồng khuôn với
 * `lovelace` (bằng chứng: `WalletV2ServiceImplTest.java:241-243` — `lamp = 800`
 * nghĩa là 800 oildrop = 0,0008 LAMP). App trước đây in thẳng con số đó ra màn ví
 * nên hiện GẤP 1.000.000 LẦN. Nguồn chốt: LAMP agent 2026-07-29.
 *
 * QUY TẮC: chia là việc của TẦNG HIỂN THỊ, và chỉ ở tầng hiển thị. Không chia ở
 * tầng API hay tầng lưu trữ — chia sớm là mất chính xác và không quay lại được.
 *
 * ⚠ TRÀN SỐ: tổng cung LAMP là 3,6×10¹⁶ oildrop, VƯỢT `Number.MAX_SAFE_INTEGER`
 * (9,007×10¹⁵). Nếu API trả JSON number thì ví lớn sẽ sai ÂM THẦM ngay từ lúc
 * `JSON.parse`, trước khi tới đây — đó là lỗi phía Phoenix, không sửa được ở app
 * (đã báo). Vì vậy hàm dưới nhận cả `string`/`bigint` để khi Phoenix đổi sang trả
 * chuỗi thì app dùng được ngay, không phải sửa chỗ gọi.
 */

/** LAMP: decimals 6 — 1 LAMP = 1.000.000 oildrop (LAMP agent chốt 2026-07-29). */
export const LAMP_DECIMALS = 6;

/** ADA: decimals 6 — 1 ADA = 1.000.000 lovelace. */
export const ADA_DECIMALS = 6;

/**
 * CARP: CHƯA CHỐT. LAMP agent nói rõ "hỏi CARP agent, đừng giả định 6".
 * Đang để 0 (in nguyên số thô) để KHÔNG bịa ra một con số sai — thà hiện thô còn
 * hơn hiện sai. Khi CARP agent trả lời thì đổi đúng một hằng số này.
 */
export const CARP_DECIMALS_UNKNOWN = 0;

/**
 * Đổi số lượng thô → chuỗi hiển thị. KHÔNG dùng phép chia của Number.
 *
 * @param raw      số lượng ở đơn vị nhỏ nhất (oildrop / lovelace)
 * @param decimals số chữ số thập phân của token
 * @param maxFrac  cắt tối đa bao nhiêu chữ số thập phân khi hiện (mặc định 6)
 */
export function fmtToken(
  raw: bigint | number | string | null | undefined,
  decimals: number,
  maxFrac = 6,
): string {
  if (raw == null) return '—';

  let v: bigint;
  try {
    // Number có thể đã là số lẻ (do backend trả float hoặc do tràn) — cắt phần
    // thập phân trước khi sang BigInt, nếu không BigInt() sẽ ném.
    v = typeof raw === 'number' ? BigInt(Math.trunc(raw)) : BigInt(raw);
  } catch {
    return '—';
  }

  const neg = v < 0n;
  if (neg) v = -v;

  if (decimals <= 0) {
    return (neg ? '-' : '') + v.toLocaleString('en-US');
  }

  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base)
    .toString()
    .padStart(decimals, '0')
    .slice(0, Math.max(0, maxFrac))
    .replace(/0+$/, '');

  const body = frac ? `${whole.toLocaleString('en-US')}.${frac}` : whole.toLocaleString('en-US');
  return (neg ? '-' : '') + body;
}

/** Tiện dụng: LAMP từ oildrop thô. */
export const fmtLamp = (raw: bigint | number | string | null | undefined) =>
  fmtToken(raw, LAMP_DECIMALS);

/** Tiện dụng: ADA từ lovelace thô. */
export const fmtAda = (raw: bigint | number | string | null | undefined) =>
  fmtToken(raw, ADA_DECIMALS, 6);

/**
 * `true` khi ví có LƯỢNG LAMP đáng kể (≥ 1 oildrop). Dùng cho các phép kiểm
 * "đã kích hoạt chưa" — giữ ngưỡng ở đơn vị THÔ, đừng so sánh với số đã chia.
 */
export function hasAnyLamp(raw: bigint | number | string | null | undefined): boolean {
  if (raw == null) return false;
  try {
    return (typeof raw === 'number' ? BigInt(Math.trunc(raw)) : BigInt(raw)) > 0n;
  } catch {
    return false;
  }
}
