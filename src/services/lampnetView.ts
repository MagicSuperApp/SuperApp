// services/lampnetView.ts
//
// CỔNG XEM TỆP THEO CID — `lampnet_view`.
//
// VÌ SAO CÓ TỆP NÀY: `media[]` trong dòng thời gian chỉ mang `{cid, sha256, kind}`,
// KHÔNG mang URL (`media_attach.py:72-88` ép buộc đúng ba trường đó). Muốn vẽ được
// một tấm ảnh hay mở được một clip từ `cid`, app phải biết TIỀN TỐ xem. Tiền tố đó
// là trường của MÁY CHỦ, không phải hằng số của app:
//
//   • hồ sơ xuất xứ công khai trả nó kèm theo (`server.py:1072`) — đường mà
//     `features/traceResult/provenanceView.ts` đang dùng, và dùng đúng;
//   • `GET /api/health` cũng trả nó (`server.py:3870`) — đường DUY NHẤT dùng được
//     cho dòng thời gian, vì `/timeline` không trả trường này và màn dòng thời gian
//     không có hồ sơ xuất xứ trong tay.
//
// KHÔNG đóng cứng `https://lampnet.cloud`. `provenanceView.ts:15` đã ghi lý do:
// ngày cổng đổi (hoặc trỏ sang cổng riêng của một tổ chức) thì MỌI tệp phải đi
// theo, không phải một nửa. Đóng cứng ở đây là tự tạo ra cái "một nửa" đó.
//
// KHÔNG gửi `Authorization`: `/api/health` là cửa công khai, và tiền tố trả về
// thường trỏ sang HOST KHÁC — gắn token vào một yêu cầu sang host khác là rò token
// (cùng lý do `RemoteImage.shouldAttachAuth` chỉ gắn cho đúng origin OriLife).

/** Hạn chờ. Ngắn: đây là thứ phụ trợ, không được giữ màn hình chờ. */
const HEALTH_TIMEOUT_MS = 5_000;

/** Đệm ÂM ngắn — máy chủ chết thì đừng hỏi lại mỗi lần vẽ một dải ảnh. */
const NEGATIVE_TTL_MS = 60_000;

type Entry = { value: string | null; at: number };

const _cache = new Map<string, Entry>();

/** Xoá đệm — cho test, và cho lúc đổi máy chủ/đăng xuất. */
export function resetLampnetViewCache(): void {
  _cache.clear();
}

/** Tiền tố hợp lệ = http(s), đã cắt gạch chéo cuối. Khác thì coi như KHÔNG có. */
function normalise(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^/?#\s]+/i.test(v) ? v : null;
}

/**
 * Tiền tố xem tệp theo CID, hoặc `null` khi CHƯA BIẾT.
 *
 * `null` phải được nơi gọi đọc là "chưa biết", KHÔNG phải "không có tệp". Nơi gọi
 * bỏ phần tử `cid` đi thay vì dựng một URL đoán — xem `timelineView.mediaUrls`.
 *
 * KHÔNG ném trong mọi trường hợp: một dải ảnh không được làm sập màn.
 */
export async function getLampnetViewBase(baseUrl: string): Promise<string | null> {
  const key = (baseUrl ?? '').replace(/\/+$/, '');
  if (!key) return null;

  const hit = _cache.get(key);
  // Giá trị ĐÚNG thì giữ cả phiên (tiền tố không đổi giữa chừng). Giá trị null thì
  // chỉ giữ 60 giây — mạng vườn chập chờn, hỏi lại là đúng.
  if (hit && (hit.value !== null || Date.now() - hit.at < NEGATIVE_TTL_MS)) {
    return hit.value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  let value: string | null = null;
  try {
    const resp = await fetch(`${key}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (resp.ok) {
      const body = await resp.json().catch(() => null);
      value = normalise((body as Record<string, unknown> | null)?.lampnet_view);
    }
  } catch {
    // Mạng rớt / quá hạn / thân không phải JSON — đều là "chưa biết".
    value = null;
  } finally {
    clearTimeout(timer);
  }

  _cache.set(key, { value, at: Date.now() });
  return value;
}
