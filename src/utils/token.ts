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
 * CARP: decimals **9** — 1 CARP = 1.000.000.000 **nanothread**.
 *
 * Nguồn là MÃ, không phải thư: `CarpetMint/onchain/lib/examples/magiclamp.ak:33`
 * `sub_unit_scale = 1_000_000_000`. Tên đơn-vị nhỏ nhất chốt ở
 * `CarpetMint-Core-Spec-Vi.md §T1` — **`nanothread`**, không phải `thread` trần
 * (chữ `thread` trần đã dùng cho *thread NFT*, hai nghĩa khác hẳn nhau).
 *
 * Trước đây hằng này là `CARP_DECIMALS_UNKNOWN = 0` với lý do "in thô còn hơn in
 * sai". Lý do đó KHÔNG đứng: hằng số ấy có **0 nơi dùng**, nên nó không bảo vệ
 * gì cả — bốn màn vẫn in thẳng số thô. Ở decimals 9 thì in thô là hiện sai
 * **một tỷ lần**, và hiện sai theo hướng người dùng tưởng mình giàu.
 *
 * CarpetMint xác nhận 13/08 và đề nghị neo decimals theo `policy_id` thay vì hằng
 * toàn cục, vì `sub_unit_scale` là apply-param **nướng vào `policy_id`** ⇒ không
 * tồn tại ca "cùng policy_id, decimals đổi"; policy khác = token khác.
 *
 * Chưa làm, có chủ ý — nhưng lý do phải phát biểu theo ĐƯỜNG DỮ LIỆU, không theo
 * kết quả grep. Bản trước viết "app không bao giờ thấy `policy_id` (`grep -i
 * policy_id src/` = 0)"; câu đó sai hai lần, đo lại 14/08:
 *
 *   grep -i policy_id src/        → 4  (cả 4 là chính đoạn chú thích này)
 *   grep -iE 'policyHex|AssetNameHex' src/ → 9
 *
 * Sai thứ nhất: phép đo tự đếm chính nó, nên nó không thể trả 0 kể cả khi đúng.
 * Sai thứ hai, nặng hơn: nó neo vào CHỮ được viết ra chứ không vào thứ chạy — app
 * CÓ mang policy id, dưới tên `lampPolicyHex` (`sdk/taadEnclave.ts:36`,
 * `services/cardanoTxService.ts:84`).
 *
 * Phát biểu đúng: hai trường đó là tham số tuỳ chọn, mặc định chuỗi rỗng
 * (`taadEnclave.ts:195-196`), và **chưa caller nào truyền giá trị** — app chưa gửi
 * giao dịch LAMP/CARP thật. Số dư CARP là một `number` PhoenixKey trả sẵn
 * (`phoenixKey-api.ts:106,147`), việc lọc UTxO nằm ở đó. Dựng bảng tra theo policy
 * ở đây là dựng thêm một hằng 0 nơi dùng — đúng cái bẫy đoạn trên vừa gỡ. Chỗ phải
 * neo theo policy là PhoenixKey; đã báo sang nhà đó.
 *
 * ⚠ Con số 9 dẫn từ mã testnet (`CarpetMint/onchain/lib/examples/magiclamp.ak:33`).
 * CarpetMint 14/08: **chưa kiểm trên mainnet**, và cặp `(policy_id, asset_name)`
 * canonical chưa có. Khi họ gửi cặp đó thì kiểm lại `sub_unit_scale` mainnet trước
 * khi tin hằng này.
 */
export const CARP_DECIMALS = 9;

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

/** Tiện dụng: CARP từ nanothread thô (1 CARP = 10^9 nanothread). */
export const fmtCarp = (raw: bigint | number | string | null | undefined) =>
  fmtToken(raw, CARP_DECIMALS, 4);

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
