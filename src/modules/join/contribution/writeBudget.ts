// modules/join/contribution/writeBudget.ts
//
// PHANH TỐC ĐỘ LẤP — ≤1 GB ghi mỗi 30 ngày, đếm bền phía client.
// Nguồn: `Join/Join-Integration.md` §6.1a (đại lượng thứ ba) + §6.1b (hao mòn bộ nhớ).
//
// VÌ SAO CÓ TỆP NÀY. Trần thanh trượt (`./quota.ts`) trả lời "được phép chiếm bao
// nhiêu chỗ"; nó KHÔNG trả lời "được phép ghi bao nhanh". Máy còn 200 GB thì trần
// ~180 GB — ghi 180 GB vào bộ nhớ điện thoại là hao mòn thật, pin thật, băng thông
// thật. §6.1b đo ra: ghi 1 GB MỘT LẦN trên máy 128 GB là không đáng kể; nguy hiểm
// nằm ở GHI LẠI LẶP. Một cái phanh này vừa xoá phản đối hao mòn, vừa giết bão sửa
// chữa từ phía thiết bị — và **không cần máy chủ hợp tác**, đúng tinh thần §6.3.
//
// CỬA SỔ TRƯỢT, KHÔNG PHẢI CỬA SỔ LẬT. Cách rẻ hơn là đếm dồn rồi reset mỗi 30
// ngày; nhưng như vậy ghi 1 GB vào ngày cuối cửa sổ rồi 1 GB vào ngày đầu cửa sổ
// sau = 2 GB trong hai ngày, đúng thứ cái phanh sinh ra để chặn. Nên sổ giữ theo
// TỪNG NGÀY và cộng 30 ngày gần nhất. Chi phí: tối đa 30 con số.
//
// THỨ TỰ GỌI — ĐẾM TRƯỚC, GHI SAU. `recordWrite` phải chạy (và được lưu xuống)
// TRƯỚC khi byte thật chạm đĩa. Đếm nhầm một lần ghi không xảy ra = phanh chặt hơn
// một chút, vô hại. Bỏ sót một lần ghi đã xảy ra = phanh hở, và app bị giết giữa
// chừng là chuyện thường trên điện thoại. Fail-closed nghiêng về phía người dùng.
//
// KHÔNG DÙNG `Date.now()` BÊN TRONG. Mọi hàm nhận `nowMs` từ bên gọi: thời gian là
// đầu vào, không phải hiệu ứng lề. Nhờ vậy test kiểm được đúng ranh giới ngày 29/30/31
// mà không phải giả lập đồng hồ.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { BYTES_PER_GB } from './quota';

/** Trần ghi: 1 GB mỗi 30 ngày — §6.1a. Nằm trong mã client, máy chủ không nâng được. */
export const WRITE_BUDGET_BYTES = 1 * BYTES_PER_GB;
export const WRITE_WINDOW_DAYS = 30;

const MS_PER_DAY = 86_400_000;
const STORAGE_KEY = '@join/contribution/writeBudget';

/**
 * Sổ ghi: số byte đã ghi, gộp theo NGÀY.
 * Khoá = chỉ số ngày (`Math.floor(epochMs / 86_400_000)`) dạng chuỗi.
 */
export interface WriteLedger {
  buckets: Record<string, number>;
}

export const EMPTY_LEDGER: WriteLedger = { buckets: {} };

const dayIndex = (nowMs: number): number => Math.floor(nowMs / MS_PER_DAY);

const isUsableBytes = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Bỏ mọi ngày đã rơi ra khỏi cửa sổ 30 ngày.
 * Giữ đúng 30 ngày gần nhất kể cả hôm nay: `day > today - 30`.
 */
export const pruneLedger = (ledger: WriteLedger, nowMs: number): WriteLedger => {
  if (!Number.isFinite(nowMs)) return ledger;
  const oldest = dayIndex(nowMs) - WRITE_WINDOW_DAYS + 1;
  const buckets: Record<string, number> = {};
  for (const [key, bytes] of Object.entries(ledger.buckets)) {
    const day = Number(key);
    if (Number.isFinite(day) && day >= oldest && isUsableBytes(bytes)) {
      buckets[key] = bytes;
    }
  }
  return { buckets };
};

/** Tổng byte đã ghi trong 30 ngày gần nhất. */
export const usedBytes = (ledger: WriteLedger, nowMs: number): number =>
  Object.values(pruneLedger(ledger, nowMs).buckets).reduce((sum, bytes) => sum + bytes, 0);

/** Hạn ngạch còn lại trong cửa sổ, byte (không bao giờ âm). */
export const remainingBytes = (ledger: WriteLedger, nowMs: number): number =>
  Math.max(0, WRITE_BUDGET_BYTES - usedBytes(ledger, nowMs));

/**
 * Còn chỗ trong hạn ngạch để ghi thêm `bytes` không?
 *
 * Số byte không hợp lệ (0, âm, NaN) → `false`: bên gọi đang hỏi sai câu, và
 * trả `true` cho một câu hỏi sai là mở phanh.
 */
export const canWrite = (ledger: WriteLedger, nowMs: number, bytes: number): boolean => {
  if (!isUsableBytes(bytes)) return false;
  return bytes <= remainingBytes(ledger, nowMs);
};

/**
 * Ghi nhận một lần ghi. Trả sổ MỚI (thuần, không sửa sổ cũ tại chỗ).
 *
 * Cố ý KHÔNG từ chối khi vượt trần: việc quyết định thuộc `canWrite`, việc của
 * hàm này là ghi đúng sự thật. Một lần ghi lỡ vượt trần vẫn phải vào sổ — giấu
 * nó đi là làm cửa sổ sau tính sai theo chiều dễ dãi.
 */
export const recordWrite = (ledger: WriteLedger, nowMs: number, bytes: number): WriteLedger => {
  if (!isUsableBytes(bytes) || !Number.isFinite(nowMs)) return ledger;
  const pruned = pruneLedger(ledger, nowMs);
  const key = String(dayIndex(nowMs));
  return {
    buckets: { ...pruned.buckets, [key]: (pruned.buckets[key] ?? 0) + Math.floor(bytes) },
  };
};

/**
 * Đọc sổ từ chuỗi đã lưu. Rác/hỏng/sai kiểu → sổ RỖNG.
 *
 * ⚠ Sổ rỗng là hướng DỄ DÃI (coi như chưa ghi gì tháng này) chứ không phải chặt.
 * Chấp nhận có ý thức: một sổ hỏng là sự cố hiếm, còn từ chối mọi lần ghi vì
 * không đọc nổi sổ thì tính năng chết im lặng — LDC-1 cấm đúng kiểu chết đó.
 * Đổi lại, mọi giá trị lạ trong sổ bị loại từng mục ở `pruneLedger`.
 */
export const parseLedger = (raw: string | null): WriteLedger => {
  if (!raw) return EMPTY_LEDGER;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return EMPTY_LEDGER;
    const buckets = (parsed as { buckets?: unknown }).buckets;
    if (!buckets || typeof buckets !== 'object') return EMPTY_LEDGER;
    const clean: Record<string, number> = {};
    for (const [key, bytes] of Object.entries(buckets as Record<string, unknown>)) {
      if (Number.isFinite(Number(key)) && isUsableBytes(bytes)) clean[key] = bytes;
    }
    return { buckets: clean };
  } catch {
    return EMPTY_LEDGER;
  }
};

export const serializeLedger = (ledger: WriteLedger): string => JSON.stringify(ledger);

// ── Lớp bền (AsyncStorage) ────────────────────────────────────────────
// Tách khỏi phần thuần ở trên: lõi tính toán không biết gì về nơi lưu.

/** Nạp sổ đã lưu. Lỗi đọc → sổ rỗng (xem ghi chú ở `parseLedger`). */
export const loadLedger = async (): Promise<WriteLedger> => {
  try {
    return parseLedger(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return EMPTY_LEDGER;
  }
};

/**
 * Lưu sổ. Ném lỗi ra ngoài — bên gọi PHẢI biết là chưa lưu được.
 *
 * Đây là chỗ duy nhất trong tệp không nuốt lỗi, và cố ý: "đếm bền" mà nuốt lỗi
 * lưu thì cái phanh chỉ tồn tại tới lần khởi động lại kế tiếp. Bên gọi thấy ném
 * thì KHÔNG được tiến hành ghi byte thật (thứ tự đếm-trước-ghi-sau ở đầu tệp).
 */
export const saveLedger = async (ledger: WriteLedger): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, serializeLedger(ledger));
};
