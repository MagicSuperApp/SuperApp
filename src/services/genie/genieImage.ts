// services/genie/genieImage.ts
//
// Ảnh vào lượt trợ lý (§9.6) — chặng G6.
//
// ── VÌ SAO PHẢI RÚT GỌN TRÊN MÁY, KHÔNG GỬI ẢNH GỐC ────────────────────────
// Một tấm ảnh 12 MP gửi thẳng lên là ~2 000 token vào, và nó KHÔNG mua thêm được
// gì: mô hình đọc một chiếc lá vàng trên ảnh 1024 px cũng như trên ảnh 4032 px.
// Nhưng người trả tiền là bác nông dân, và người trả 4G cũng là bác ấy — ngoài
// vườn, bằng sóng yếu.
//
// Nên rút gọn NGAY TRÊN MÁY, trước khi một byte nào rời khỏi điện thoại.
//
// ── TRẦN LÀ TRẦN CỨNG, KHÔNG PHẢI GỢI Ý ───────────────────────────────────
// Tối đa 3 tấm một lượt. Không phải vì mô hình không đọc nổi hơn, mà vì mỗi tấm
// là tiền và là thời gian chờ — và ba tấm đã đủ để tả một cái cây bị bệnh. Trần
// này lặp lại ở `guard/intake.js` phía máy chủ: chỗ này để tiết kiệm, chỗ kia để
// bảo vệ. Cái nào bỏ đi thì cái còn lại vẫn đứng.

/** [PARAM] Cạnh dài nhất sau khi rút gọn, tính bằng pixel. */
export const MAX_EDGE = 1024;
/** [PARAM] Chất lượng JPEG. 0.7 — dưới mức này thì lá bệnh bắt đầu nhoè thành nhiễu. */
export const QUALITY = 0.7;
/** Trần số ảnh một lượt. Khớp `guard/intake.js` phía máy chủ. */
export const MAX_IMAGES = 3;

export interface GenieImage {
  mediaType: string;
  /** base64 KHÔNG kèm tiền tố `data:` — API nhận chuỗi trần. */
  data: string;
}

type Manipulator = {
  manipulateAsync: (
    uri: string,
    actions: Array<Record<string, unknown>>,
    opts: Record<string, unknown>,
  ) => Promise<{ uri: string; base64?: string; width: number; height: number }>;
  SaveFormat: { JPEG: unknown };
};

let probed = false;
let mod: Manipulator | null = null;

/**
 * Dò `expo-image-manipulator` bằng `require` ĐỒNG BỘ trong `try/catch`.
 *
 * KHÔNG `import()` động. Bài học đã trả giá ở `EdgeWaveGL.tsx`: một module native
 * vắng mặt nạp qua đường động làm bản release chết bằng SIGABRT thay vì rơi êm.
 */
function load(): Manipulator | null {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const m = require('expo-image-manipulator');
    mod = (m?.default ?? m) as Manipulator;
    if (typeof mod?.manipulateAsync !== 'function') mod = null;
  } catch {
    mod = null;
  }
  return mod;
}

export function imageSupportAvailable(): boolean {
  return load() != null;
}

/**
 * Tính cạnh cần co về, GIỮ TỈ LỆ.
 *
 * Xuất ra để kiểm được mà không cần module native — đây là chỗ dễ sai nhất trong
 * cả tệp, và sai thì ảnh méo, mà ảnh méo thì mô hình đọc sai hình cái lá.
 */
export function fitEdge(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: max, height: max };
  }
  // Ảnh đã nhỏ hơn trần ⇒ ĐỂ NGUYÊN. Phóng to lên cho "đủ chuẩn" là thêm byte mà
  // không thêm một chi tiết nào.
  if (w <= max && h <= max) return { width: Math.round(w), height: Math.round(h) };
  const k = max / Math.max(w, h);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/**
 * Một `uri` ảnh trên máy → một `GenieImage` đã rút gọn.
 *
 * Trả `null` khi không làm được, KHÔNG ném: nơi gọi là luồng hội thoại, và một
 * ngoại lệ chưa bắt ở đó nuốt luôn câu trả lời.
 */
export async function prepareImage(
  uri: string,
  size?: { width?: number; height?: number },
): Promise<GenieImage | null> {
  const m = load();
  if (!m || !uri) return null;
  try {
    const fit = fitEdge(Number(size?.width) || MAX_EDGE, Number(size?.height) || MAX_EDGE);
    const out = await m.manipulateAsync(
      uri,
      // Chỉ truyền `width`: thư viện tự suy chiều còn lại theo tỉ lệ. Truyền cả
      // hai là tự tay ép méo mỗi khi phép làm tròn của mình lệch với của nó.
      [{ resize: { width: fit.width } }],
      { compress: QUALITY, format: m.SaveFormat.JPEG, base64: true },
    );
    if (!out.base64) return null;
    return { mediaType: 'image/jpeg', data: out.base64 };
  } catch {
    return null;
  }
}

/** Nhiều ảnh → đã rút gọn, đã CẮT THEO TRẦN, bỏ những tấm hỏng. */
export async function prepareImages(
  items: Array<{ uri: string; width?: number; height?: number }>,
): Promise<GenieImage[]> {
  // Cắt trần TRƯỚC khi xử, không sau: xử mười tấm rồi vứt bảy là mười lần giải mã
  // JPEG trên một máy yếu, và người dùng ngồi nhìn màn hình đơ suốt chừng ấy.
  const dau = (items || []).slice(0, MAX_IMAGES);
  const out: GenieImage[] = [];
  for (const it of dau) {
    // Tuần tự chứ không `Promise.all`: ba lần giải mã JPEG cùng lúc trên máy phổ
    // thông là ba lần tranh nhau bộ nhớ, và ca xấu nhất là app bị hệ điều hành
    // giết giữa chừng.
    // eslint-disable-next-line no-await-in-loop
    const g = await prepareImage(it.uri, { width: it.width, height: it.height });
    if (g) out.push(g);
  }
  return out;
}
