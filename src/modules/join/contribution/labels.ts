// modules/join/contribution/labels.ts
//
// CÂU CHỮ CỦA TAB JOIN — dựng chuỗi hiển thị từ SỐ ĐO, và chặn từ cấm.
// Nguồn: `Join/Join-Integration.md` §6.7 (sáu quy tắc + ba câu bắt buộc),
//        `Join/LDC-Community.md` §6 (ngôn ngữ hiển thị, năm quy tắc câu trạng thái).
//
// VÌ SAO CÂU CHỮ NẰM TRONG MÃ CÓ TEST, KHÔNG NẰM RẢI TRONG JSX. Ba trong sáu quy
// tắc của §6.7 là quy tắc về NỘI DUNG CHUỖI, không phải về bố cục: phải hiện đủ ba
// con số, mọi con số phải là số đo trên máy này, và mỗi lần viết dung lượng phải
// kèm loại + mẫu số. Ba thứ đó kiểm được bằng test — mà chỉ kiểm được nếu chuỗi
// sinh ra từ một chỗ. Rải chuỗi trong JSX thì lần sửa giao diện thứ ba là mất một
// con số, và không ai biết cho tới lúc người duyệt cửa hàng đọc ảnh chụp màn.
//
// "1 GB" TRẦN TRỤI BỊ ĐỌC THÀNH DUNG LƯỢNG 3G/4G — LDC §6 quy tắc 5 gọi đây là
// hiểu nhầm số một, và nó làm người dùng từ chối TRƯỚC CẢ KHI hiểu mình đang từ
// chối cái gì. Nên `formatCapacity` bắt buộc có mẫu số, và không có đường tắt nào
// trả về mỗi con số trần.
//
// DANH SÁCH TỪ CẤM ĐÃ ĐỔI CHIỀU 2026-08-05 (§6.7). Bản trước cấm "mạng LampNet"
// và "đóng góp" vì khi ấy có một lớp bật sẵn không hỏi — nói ít là cách giảm rủi
// ro. Nay người dùng TỰ BẤM, và cửa hàng đòi TIẾT LỘ NỔI BẬT: nói tránh chính là
// thứ bị phạt. Hai từ đó nay BẮT BUỘC phải nói, nên chúng không có mặt trong danh
// sách dưới đây.

import { BYTES_PER_GB } from './quota';
import { WRITE_BUDGET_BYTES } from './writeBudget';

/** Câu dùng khi chưa đo được — LDC §6 quy tắc 4: không bỏ trống, và tuyệt đối không đoán. */
export const UNMEASURED = 'chưa đo được';

/** §6.7 quy tắc 5 — `maxShare = 0` thì KHÔNG vẽ thanh trượt, hiện câu này thay vào. */
export const NO_SPACE_STATE = 'Máy bạn đang thiếu chỗ';

const BYTES_PER_MB = 1_000_000;

/** Dấu thập phân tiếng Việt là dấu phẩy. "1.5 GB" đọc như một con số khác. */
const withVietnameseDecimal = (value: string): string => value.replace('.', ',');

/**
 * Byte → chuỗi người đọc được. LÀM TRÒN XUỐNG.
 *
 * Tròn xuống ở cả hai vai: trần thì không hứa nhiều hơn thứ máy cho, số đang giữ
 * thì không khai nhiều hơn thứ máy thật sự giữ. Tròn lên ở đây là bịa theo chiều
 * bất lợi cho người dùng.
 */
export const formatBytes = (bytes: number | null): string => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return UNMEASURED;
  if (bytes >= BYTES_PER_GB) {
    const gb = Math.floor((bytes / BYTES_PER_GB) * 10) / 10;
    return `${withVietnameseDecimal(String(gb))} GB`;
  }
  return `${Math.floor(bytes / BYTES_PER_MB)} MB`;
};

/**
 * Dung lượng kèm LOẠI và MẪU SỐ — LDC §6 quy tắc 5.
 * Đúng: *"1 GB chỗ trống trong máy (máy bạn còn 24 GB) — không phải dung lượng 3G/4G"*.
 *
 * `freeBytes = null` (chưa đo được) vẫn phải nói đủ loại và vẫn phải phủ định
 * 3G/4G: người dùng hiểu nhầm ngay cả khi ta chưa đo được máy họ.
 */
export const formatCapacity = (bytes: number | null, freeBytes: number | null): string => {
  const amount = formatBytes(bytes);
  const denominator =
    typeof freeBytes === 'number' && Number.isFinite(freeBytes) && freeBytes >= 0
      ? `máy bạn còn ${formatBytes(freeBytes)}`
      : `chỗ trống của máy ${UNMEASURED}`;
  return `${amount} chỗ trống trong máy (${denominator}) — không phải dung lượng 3G/4G`;
};

/**
 * Trần ghi ở dạng hiển thị. Suy TỪ hằng số thật (`WRITE_BUDGET_BYTES`), không gõ tay
 * lại chuỗi "1 GB" — đổi trần mà quên sửa chuỗi là hiện một con số không còn đúng,
 * đúng loại lỗi §6.7 quy tắc 4 cấm.
 */
export const WRITE_BUDGET_LABEL = formatBytes(WRITE_BUDGET_BYTES);

export interface SliderNumbers {
  /** Mức người dùng đang chọn (mặc định = trần), byte. */
  maxShareBytes: number | null;
  /** Số byte máy ĐANG giữ thật — số đo trên máy này, không phải số máy chủ báo về. */
  heldBytes: number | null;
}

/**
 * Ba con số của thanh trượt — §6.7 quy tắc 4, phải hiện ĐỦ BA, cùng lúc.
 * Mẫu: *"Dành tối đa 180 GB · đang giữ 0 MB · lấp dần, tối đa khoảng 1 GB mỗi tháng"*.
 *
 * Thiếu con số thứ ba thì con số thứ nhất là con số bịa: thanh trượt nói 180 GB
 * trong khi máy chỉ lấp ~1 GB mỗi tháng — người dùng đọc "mất 180 GB ngay bây giờ".
 */
export const formatSliderNumbers = ({ maxShareBytes, heldBytes }: SliderNumbers): string =>
  [
    `Dành tối đa ${formatBytes(maxShareBytes)}`,
    `đang giữ ${formatBytes(heldBytes)}`,
    `lấp dần, tối đa khoảng ${WRITE_BUDGET_LABEL} mỗi tháng`,
  ].join(' · ');

/**
 * Câu báo tự nhả chỗ — LDC-2a điều 8.
 * Cùng một sự kiện, khác nhau ở đúng một câu: nói ra thì đây là chỗ ăn điểm lớn
 * nhất của tính năng; không nói thì đây là chỗ mất niềm tin nặng nhất.
 */
export const formatReleaseNotice = (releasedBytes: number): string =>
  `Máy bạn sắp đầy — ứng dụng đã tự nhả ${formatBytes(releasedBytes)} trả lại cho bạn.`;

/**
 * Câu tạm dừng phải nói KHI NÀO TỰ CHẠY LẠI — LDC §6 quy tắc 1. Đó là câu trả lời
 * cho "tôi có phải làm gì không", câu người dùng không bao giờ hỏi thành lời.
 */
export const formatPausedNotice = (resumeLabel: string): string =>
  `Tạm dừng. Tự chạy lại ${resumeLabel}.`;

/**
 * §6.8 — trong lúc xoá, TUYỆT ĐỐI không hiện số cũ. Người dùng bấm Tắt, quay lại
 * vẫn thấy "232 MB", họ bấm lại, rồi lại, rồi gỡ app. Hành động tắt không có tác
 * dụng cảm nhận được thì Apple 5.1.1(ii) coi như không đạt trên thực tế, dù mã chạy đúng.
 */
export const formatDeleting = (remainingBytes: number): string =>
  `Đang xoá… ${formatBytes(remainingBytes)} → 0 MB`;

/**
 * BA CÂU BẮT BUỘC CÓ, KHÔNG ĐƯỢC RÚT GỌN — §6.7.
 * Câu thứ hai là câu ĐỐI XỨNG: người dùng đọc "máy tôi giữ hộ nhóm" thì câu tiếp
 * theo trong đầu họ không phải "tôi giúp nhóm" mà là *"vậy ảnh vườn của tôi đang
 * nằm trong máy ai?"*. Không trả lời trước thì họ vừa từ chối vừa mất niềm tin.
 */
export const REQUIRED_TAB_JOIN_SENTENCES: readonly string[] = [
  'Đây là chỗ trống trong máy — KHÔNG phải dung lượng 3G/4G.',
  'Ngược lại, dữ liệu của bạn cũng nằm trên máy người khác trong nhóm — họ cũng không mở ra được.',
  'Phần này chỉ trả lại dữ liệu khi bạn đang mở ứng dụng.',
];

/**
 * Từ CẤM trong mọi câu hiển thị cho người dùng phổ thông — LDC §6.
 * Thay bằng: *phần dữ liệu · máy bạn · giữ hộ · trả lại · khoá · mạng*.
 *
 * "mã hoá đầu cuối" cấm vì lý do KHÁC các từ còn lại: người dùng phổ thông đọc nó
 * thành "mã hoá lúc gửi", không hiểu là "đã khoá lúc lưu". Đây là vấn đề hiểu nhầm,
 * không phải vấn đề pháp lý — nên nó vẫn cấm cả sau khi danh sách đổi chiều.
 */
export const FORBIDDEN_DISPLAY_TERMS: readonly string[] = [
  'mảnh',
  'shard',
  'node',
  'mirage',
  'lease',
  'kiểm chứng mật mã',
  'mã hoá đầu cuối',
  'mã hóa đầu cuối',
  'bậc',
  'tier',
  'đồng bộ',
  'xác thực',
  'khoá riêng tư',
  'khóa riêng tư',
  'ký',
];

// Ký tự chữ tiếng Việt — dùng để dò ranh giới từ. KHÔNG dùng `\p{L}`: engine JS của
// bản dựng phát hành không đảm bảo có property escape, và một regex ném lúc chạy ở
// đây sẽ làm sập đúng màn đang cần hiển thị.
const VN_LETTER = 'a-zA-ZÀ-ỹ';

const hasStandaloneTerm = (haystack: string, term: string): boolean =>
  new RegExp(`(^|[^${VN_LETTER}])${term}([^${VN_LETTER}]|$)`, 'i').test(haystack);

/**
 * Dò từ cấm trong một câu sắp hiển thị. Trả danh sách từ đã tìm thấy (rỗng = sạch).
 *
 * Cụm nhiều từ dò bằng chuỗi con; từ đơn dò theo ranh giới từ — nếu không, "ký"
 * sẽ khớp vào "kỹ thuật", "bậc" khớp vào "bậc thang" trong một câu hoàn toàn hợp lệ,
 * và cái lưới này bị tắt đi vì kêu oan quá nhiều.
 */
export const findForbiddenTerms = (text: string): string[] => {
  const lower = text.toLowerCase();
  return FORBIDDEN_DISPLAY_TERMS.filter(term =>
    term.includes(' ') ? lower.includes(term) : hasStandaloneTerm(lower, term),
  );
};

/** Con số thưởng còn CẤM cho tới khi §7 chốt đơn vị — lõi đang trả µLAMP và MAGIC, cộng CARP là ba. */
export const REWARD_NUMBERS_ALLOWED = false;
