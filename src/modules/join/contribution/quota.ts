// modules/join/contribution/quota.ts
//
// HỢP ĐỒNG THANH TRƯỢT — lõi logic thuần cho tab Join.
// Nguồn: `Join/Join-Integration.md` §6.1a + §6.3 + §6.7 (v0.5.1), `Join/LDC-Community.md` LDC-2a.
//
// ⚠ TRẠNG THÁI: §6 ghi "CHƯA ĐƯỢC PHÉP SHIP" — 15 điều kiện chặn ở §6.5, đóng 2.
// Tệp này là LÕI TÍNH TOÁN, cố ý KHÔNG nối vào màn hình nào và KHÔNG tự chạy.
// Nó không đọc đĩa, không gọi mạng, không giữ trạng thái — nên dựng nó không
// làm byte nào của người khác vào máy ai. Nối vào UI là việc của lượt sau, sau
// khi điều kiện 1 và 2 đóng.
//
// BA ĐẠI LƯỢNG, BA VAI KHÁC NHAU — §6.1a nói thẳng "đừng gộp":
//   1. TRẦN      `maxShareBytes` = max(0, chỗ trống − dự trữ)   ← tệp này
//   2. ĐẶT SẴN   vị trí thanh trượt lúc mở tab = đúng trần       ← tệp này
//   3. TỐC ĐỘ LẤP ≤1 GB ghi mỗi 30 ngày                          ← `./writeBudget.ts`
// Gộp (1) với (3) là lỗi đã được §6.1a chỉ đích danh: máy còn 200 GB thì trần
// ~180 GB, nhưng ghi 180 GB vào bộ nhớ điện thoại là hao mòn thật, pin thật,
// băng thông thật. Tách ra thì giữ được cử chỉ "kéo sẵn hết cỡ, bấm một cái là
// xong" mà máy vẫn lấp DẦN.
//
// PHÂN BIỆT SỐNG-CÒN — §6.1a, và là chỗ dễ trượt thành vi phạm cửa hàng nhất:
//
//     Số lượng được ĐẶT SẴN. Sự ĐỒNG Ý thì KHÔNG.
//
// `DEFAULT_POSITION_IS_MAX_SHARE = true` (giá trị mặc định — hợp lệ, và là thứ
// anh Aladin muốn) đi CÙNG `DEFAULT_ENABLED = false` (không có đồng ý mặc định).
// Phép thử một câu, phải đúng mãi mãi: *người dùng mở tab Join rồi thoát ra mà
// không bấm gì — máy KHÔNG giữ byte nào của người khác.*
//
// §6.3 — TRẦN NẰM TRONG MÃ CLIENT, MÁY CHỦ KHÔNG NÂNG ĐƯỢC. Đây là ngoại lệ có
// chủ ý với `mergePolicy: server-authoritative` của manifest: người dùng cho
// mượn máy thì phải được bù bằng một trần mà bên vận hành không tự nâng. Hệ quả
// cho tệp này: mọi hằng số dưới đây là `const` trong bundle, và KHÔNG hàm nào
// nhận tham số "trần do máy chủ gửi xuống". `clampShare` cố ý chặn cả khi bên
// gọi truyền vào một con số lớn hơn trần.
//
// ĐO KHÔNG ĐƯỢC THÌ NÓI "CHƯA ĐO ĐƯỢC" — LDC §6 quy tắc 4, tuyệt đối không đoán.
// Mọi giá trị đĩa không hợp lệ (null, NaN, âm, vô cực) đều rơi về `measured: false`
// ⇒ không vẽ thanh trượt. Fail-closed: đoán thừa một con số ở đây là bịa ra một
// lời hứa về máy của người khác.

/**
 * 1 GB = 10^9 byte (thập phân), KHÔNG phải 2^30.
 *
 * Chọn thập phân vì mọi con số người dùng đối chiếu được đều là thập phân: dung
 * lượng ghi trên hộp máy, số trong Cài đặt của Android/iOS, và giá trị byte mà
 * `react-native-device-info` trả về. Dùng 2^30 thì trần hiện trên tab Join lệch
 * ~7% so với màn Cài đặt của chính máy đó — §6.7 quy tắc 4 cấm lệch số giữa hai
 * màn, và người dùng sẽ đọc chênh lệch đó thành "app khai gian".
 */
export const BYTES_PER_GB = 1_000_000_000;

/** Dự trữ = max(10% dung lượng máy, 5 GB) — §6.1a. */
export const RESERVE_RATIO = 0.1;
export const RESERVE_FLOOR_BYTES = 5 * BYTES_PER_GB;

/**
 * Thanh trượt nằm sẵn ở đúng `maxShareBytes` khi mở tab — anh Aladin chốt
 * 2026-08-05: *"để sẵn thanh trượt với tài nguyên tối đa của thiết bị đó để
 * người dùng tiện tay bấm"*. Đây là GIÁ TRỊ mặc định.
 */
export const DEFAULT_POSITION_IS_MAX_SHARE = true;

/**
 * Chưa bấm thì chưa bật. Đây là SỰ ĐỒNG Ý — và nó không bao giờ được đặt sẵn.
 * Hằng số này tồn tại để bất kỳ ai định đổi nó phải đọc §6.1a trước.
 */
export const DEFAULT_ENABLED = false;

/** Số đo đĩa lấy từ hệ điều hành. `null` = chưa đo được (không đoán). */
export interface DiskReading {
  /** Chỗ trống còn lại, byte. */
  freeBytes: number | null;
  /** Tổng dung lượng máy, byte — cần cho vế 10% của dự trữ. */
  totalBytes: number | null;
}

export interface QuotaPlan {
  /** false = chưa đo được đĩa ⇒ hiện "chưa đo được", KHÔNG vẽ thanh trượt. */
  measured: boolean;
  /** Trần kéo được, byte. 0 khi máy thiếu chỗ hoặc chưa đo được. */
  maxShareBytes: number;
  /** Phần chỗ trống giữ lại cho người dùng, byte. `null` khi chưa đo được. */
  reserveBytes: number | null;
  /**
   * §6.7 quy tắc 5 — `maxShare = 0` ⇒ KHÔNG vẽ thanh trượt, hiện trạng thái
   * "máy bạn đang thiếu chỗ". Hỏi mượn chỗ của người sắp hết chỗ là hỏi sai người.
   */
  showSlider: boolean;
  /** Vị trí đặt sẵn của thanh trượt lúc mở tab, byte (= trần). */
  defaultPositionBytes: number;
}

const isUsableByteCount = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Kế hoạch "chưa đo được" — dùng chung cho mọi nhánh fail-closed. */
const UNMEASURED_PLAN: QuotaPlan = {
  measured: false,
  maxShareBytes: 0,
  reserveBytes: null,
  showSlider: false,
  defaultPositionBytes: 0,
};

/**
 * Dự trữ = max(10% dung lượng máy, 5 GB).
 *
 * Vế 10% giữ tỉ lệ cho máy lớn; vế sàn 5 GB giữ cho máy nhỏ — máy 32 GB mà chỉ
 * dự trữ 3,2 GB thì người dùng hết chỗ chụp ảnh trước khi kịp hiểu vì sao.
 */
export const computeReserveBytes = (totalBytes: number): number =>
  Math.max(totalBytes * RESERVE_RATIO, RESERVE_FLOOR_BYTES);

/**
 * Tính trần + vị trí đặt sẵn từ một lần đo đĩa.
 *
 * Chỉ nhận `DiskReading`. KHÔNG có tham số nào cho phép bên ngoài (máy chủ,
 * cấu hình từ xa, cờ A/B) nâng trần — §6.3.
 */
export const planQuota = (reading: DiskReading): QuotaPlan => {
  const { freeBytes, totalBytes } = reading;
  if (!isUsableByteCount(freeBytes) || !isUsableByteCount(totalBytes)) {
    return UNMEASURED_PLAN;
  }

  const reserveBytes = computeReserveBytes(totalBytes);
  const maxShareBytes = Math.max(0, Math.floor(freeBytes - reserveBytes));

  return {
    measured: true,
    maxShareBytes,
    reserveBytes,
    showSlider: maxShareBytes > 0,
    defaultPositionBytes: DEFAULT_POSITION_IS_MAX_SHARE ? maxShareBytes : 0,
  };
};

/**
 * Kẹp mức người dùng chọn về [0, trần].
 *
 * Cố ý kẹp cả khi con số đến từ nơi khác (trạng thái cũ lưu trên máy, giá trị
 * máy chủ gửi xuống, mức người dùng đã kéo trên MÁY KHÁC). §6.3 + LDC-2a điều 9:
 * mức neo ở từng máy, máy thứ hai hỏi lại — không kế thừa con số của máy cũ.
 *
 * HAI LOẠI "quá lớn", HAI CÁCH XỬ KHÁC NHAU:
 *   - Số HỮU HẠN mà vượt trần (vd trạng thái lưu từ hồi máy còn nhiều chỗ) → kẹp
 *     về trần. Đây đúng là §6.4: "máy yếu → hạ trần, và con số hiển thị phải là
 *     con số ĐÃ HẠ".
 *   - `Infinity` / `NaN` → 0, KHÔNG kẹp về trần. Một giá trị rác không được phép
 *     đổi thành quyền lấy mức tối đa; nếu kẹp, thì "máy chủ gửi xuống Infinity"
 *     trở thành đường ép máy người dùng nhận hết cỡ — đúng thứ §6.3 sinh ra để chặn.
 */
export const clampShare = (requestedBytes: number, plan: QuotaPlan): number => {
  if (!plan.measured || !Number.isFinite(requestedBytes) || requestedBytes <= 0) return 0;
  return Math.min(Math.floor(requestedBytes), plan.maxShareBytes);
};

/**
 * Quy mức đã chọn sang `hw_disk_gb` để khai lên daemon — §4 và §6.3.
 * Giao thức đã có sẵn trường này, không cần đổi gì để khai 1 GB.
 *
 * LÀM TRÒN XUỐNG: khai thừa là hứa với mạng nhiều hơn thứ máy thật sự dành ra.
 */
export const toHwDiskGb = (shareBytes: number): number => {
  if (!Number.isFinite(shareBytes) || shareBytes <= 0) return 0;
  return Math.floor(shareBytes / BYTES_PER_GB);
};

export interface ReleaseDecision {
  /** Nhả toàn bộ về 0. */
  releaseAll: boolean;
  /** Số byte đang giữ sẽ được trả lại — dùng để dựng câu báo. */
  releasedBytes: number;
  /**
   * LDC-2a điều 8: nhả thì PHẢI NÓI RA. Không nói thì người dùng đi xoá ảnh con
   * để nhường chỗ cho một thứ họ không biết là đang tồn tại. Đây là chỗ mất niềm
   * tin nặng nhất của cả tính năng — và cũng là chỗ ăn điểm lớn nhất.
   */
  mustAnnounce: boolean;
}

const NO_RELEASE: ReleaseDecision = { releaseAll: false, releasedBytes: 0, mustAnnounce: false };

/**
 * Chỗ trống tụt xuống dưới dự trữ SAU KHI đã bật ⇒ tự nhả xuống 0, và nói ra.
 * §6.1a + §6.4 ("nhường máy… xuống tới 0 nếu cần") + LDC-2a điều 8.
 *
 * Chưa đo được đĩa thì KHÔNG nhả: nhả vì một phép đo hỏng là tự xoá dữ liệu của
 * mạng mà không có lý do thật. Fail-closed ở đây nghĩa là giữ nguyên và chờ lần
 * đo sau, không phải xoá.
 */
export const decideRelease = (reading: DiskReading, heldBytes: number): ReleaseDecision => {
  const { freeBytes, totalBytes } = reading;
  if (!isUsableByteCount(freeBytes) || !isUsableByteCount(totalBytes)) return NO_RELEASE;
  if (!Number.isFinite(heldBytes) || heldBytes <= 0) return NO_RELEASE;

  if (freeBytes >= computeReserveBytes(totalBytes)) return NO_RELEASE;

  return { releaseAll: true, releasedBytes: Math.floor(heldBytes), mustAnnounce: true };
};
