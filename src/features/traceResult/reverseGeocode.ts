/**
 * reverseGeocode — đổi toạ độ thành MỘT DÒNG ĐỊA CHỈ đọc được.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────────
 * Hồ sơ công khai trả `gps: [20.989, 105.944]` và **không** trả địa chỉ. Hai con
 * số ấy không nói gì với người mua đang đứng ở sạp. Bản đồ vốn đã có sẵn dữ liệu
 * hành chính của chỗ đó, nên lấy tên chỗ từ chính nền bản đồ mà dùng — đo được
 * 19/08 với đúng toạ độ trên:
 *
 *   GET https://nominatim.openstreetmap.org/reverse
 *       ?format=jsonv2&lat=20.989&lon=105.944&zoom=16&accept-language=vi
 *   → { display_name: "Vinhomes Ocean Park, Xã Gia Lâm, Hà Nội, 17710, Việt Nam",
 *       address: { residential, city_district, city, postcode, country, … } }
 *
 * ── Vì sao KHÔNG dùng thẳng `display_name` ──────────────────────────────────
 * Nó kèm mã bưu chính và tên nước — hai mẩu không ai đọc trong một dòng "nơi
 * trồng", và chúng đẩy phần có nghĩa (xã, tỉnh) ra khỏi chỗ hiển thị trên máy
 * hẹp. `shortAddressVi` gắp lại từ `address` theo thứ tự hành chính Việt Nam.
 *
 * ── Ba giới hạn của Nominatim, và cách tệp này sống chung ────────────────────
 *  1. **Tối đa 1 lượt/giây, và phải khai `User-Agent`.** Nếu không họ chặn IP.
 *     Nên: mỗi toạ độ hỏi ĐÚNG MỘT LẦN rồi nhớ lại (bộ nhớ + đĩa), và các lượt
 *     hỏi cùng một toạ độ đang bay thì dùng chung một lời hứa.
 *  2. **Nó có thể chặn, hỏng, hoặc chậm.** Đây là thứ TRANG SỨC — thiếu nó thì
 *     màn vẫn phải hiện được toạ độ. Vì vậy hàm KHÔNG ném và có hạn chờ ngắn.
 *  3. **Nó là bên thứ ba.** Chỉ gửi đi hai con số máy chủ đã CÔNG KHAI, không
 *     gửi kèm mã cây, không gửi token — xem `traceResult` gọi nó thế nào.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Nominatim đòi khai danh tính ứng dụng. Thiếu là bị chặn — và bị chặn thì mọi
 * máy dùng app đều mất dòng địa chỉ cùng lúc, im lặng.
 */
const USER_AGENT = 'AladinSuperApp/1.0 (+https://orilife.io)';

/** Chờ ngắn: đây là trang sức, không đáng để người dùng nhìn ô quay 20 giây. */
const TIMEOUT_MS = 8_000;

/** Nhớ trên đĩa 30 ngày. Ranh hành chính đổi rất chậm; cây thì không tự đi đâu. */
const DISK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DISK_PREFIX = 'revgeo:';

export type ReverseGeocodeResult =
  | { kind: 'ok'; line: string; full: string }
  | { kind: 'none' }
  | { kind: 'error'; detail: string };

/**
 * Khoá đệm: toạ độ làm tròn 4 chữ số (~11m).
 *
 * Làm tròn để hai lượt xem cùng một cây không thành hai lượt hỏi chỉ vì con số
 * lệch nhau ở chữ số thứ mười. Không làm tròn thô hơn: 3 chữ số (~111m) sẽ gộp
 * hai cây ở hai đầu một cánh đồng vào cùng một địa chỉ.
 */
export function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Gắp một dòng địa chỉ gọn từ khối `address` của Nominatim.
 *
 * Thứ tự lấy đi từ HẸP ra RỘNG, và dừng ở ba mẩu: người mua cần biết "xã nào,
 * tỉnh nào", không cần mã bưu chính. Bỏ hẳn `postcode`, `country`, `country_code`
 * — chúng luôn có mặt và luôn vô ích ở đây.
 *
 * Trả `null` khi không gắp được mẩu nào; chỗ gọi tự lùi về toạ độ thô.
 */
export function shortAddressVi(address: Record<string, unknown> | null | undefined): string | null {
  if (!address || typeof address !== 'object') return null;
  const pick = (k: string): string | null => {
    const v = address[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };

  // BỐN bậc, hẹp → rộng, xếp theo đúng thang hành chính Việt Nam. Mỗi bậc có
  // nhiều khoá vì Nominatim đặt tên khác nhau tuỳ vùng — và cùng một cấp đổi tên
  // giữa thành thị với nông thôn:
  //
  //   thôn/khu    hamlet · residential · neighbourhood · suburb · quarter
  //   xã/phường   village · town · municipality · city_district
  //   huyện/quận  county · district · city_district
  //   tỉnh/TP     city · state · province
  //
  // Gộp bậc xã với bậc huyện làm một (bản trước) là bỏ mất một cấp: ca nông thôn
  // `village + county + state` chỉ ra được "Xã Cẩm Sơn, Tiền Giang" — mất huyện,
  // mà ở Việt Nam có nhiều xã trùng tên trong cùng một tỉnh.
  const tiers: string[][] = [
    ['hamlet', 'residential', 'neighbourhood', 'suburb', 'quarter'],
    ['village', 'town', 'municipality', 'city_district'],
    ['county', 'district', 'city_district'],
    ['city', 'state', 'province'],
  ];

  const parts: string[] = [];
  for (const tier of tiers) {
    for (const k of tier) {
      const v = pick(k);
      // Chống lặp: ở Hà Nội thì `city` và `state` cùng là "Hà Nội", và
      // `city_district` có thể trúng ở cả hai bậc xã lẫn huyện.
      if (v && !parts.includes(v)) { parts.push(v); break; }
    }
  }

  if (parts.length === 0) return null;
  // Trần BA mẩu: dài hơn là tràn dòng trên máy hẹp. Khi đủ cả bốn bậc thì bỏ bậc
  // huyện — hai mẩu hẹp nhất là thứ người ta nhận ra, và tỉnh là thứ định vị.
  const kept = parts.length > 3 ? [parts[0], parts[1], parts[parts.length - 1]] : parts;
  return kept.join(', ');
}

/** Toạ độ thô, để hiện khi chưa có (hoặc không có) địa chỉ. */
export function formatLatLon(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// Đệm
// ---------------------------------------------------------------------------

const memory = new Map<string, ReverseGeocodeResult>();
/** Lượt hỏi ĐANG BAY. Hai chỗ cùng hỏi một toạ độ thì dùng chung, không hỏi hai lần. */
const inflight = new Map<string, Promise<ReverseGeocodeResult>>();

/** Xoá đệm — dùng trong test, và khi cần ép hỏi lại. */
export function resetReverseGeocodeCache(): void {
  memory.clear();
  inflight.clear();
}

async function readDisk(key: string): Promise<ReverseGeocodeResult | null> {
  try {
    const raw = await AsyncStorage.getItem(DISK_PREFIX + key);
    if (!raw) return null;
    const o = JSON.parse(raw) as { at?: number; line?: string; full?: string };
    if (typeof o?.at !== 'number' || Date.now() - o.at > DISK_TTL_MS) return null;
    if (typeof o.line !== 'string' || !o.line) return null;
    return { kind: 'ok', line: o.line, full: typeof o.full === 'string' ? o.full : o.line };
  } catch {
    return null;
  }
}

async function writeDisk(key: string, r: ReverseGeocodeResult): Promise<void> {
  // CHỈ ghi ca thành công. Ghi cả ca hỏng là khoá luôn một toạ độ vào trạng thái
  // "không có địa chỉ" chỉ vì một lần mất sóng.
  if (r.kind !== 'ok') return;
  try {
    await AsyncStorage.setItem(
      DISK_PREFIX + key,
      JSON.stringify({ at: Date.now(), line: r.line, full: r.full }),
    );
  } catch { /* hết chỗ / kho hỏng: mất đệm thôi, không hỏng tính năng */ }
}

// ---------------------------------------------------------------------------

async function fetchOnce(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // `zoom=16` ≈ mức đường/khu dân cư. Nhỏ hơn thì chỉ ra tên tỉnh; lớn hơn thì
    // trả về số nhà của một công trình gần đó, mà cây thì không có số nhà.
    const url =
      `${ENDPOINT}?format=jsonv2&lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lon))}&zoom=16&accept-language=vi`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return { kind: 'error', detail: `HTTP ${resp.status}` };

    const body = (await resp.json()) as {
      address?: Record<string, unknown>;
      display_name?: unknown;
      error?: unknown;
    };
    // Nominatim trả 200 kèm `{error: "Unable to geocode"}` cho điểm giữa biển.
    if (body?.error) return { kind: 'none' };

    const line = shortAddressVi(body?.address);
    if (!line) return { kind: 'none' };
    const full = typeof body?.display_name === 'string' ? body.display_name : line;
    return { kind: 'ok', line, full };
  } catch (err: any) {
    clearTimeout(timer);
    const timedOut = err?.name === 'AbortError';
    return { kind: 'error', detail: timedOut ? 'Quá hạn chờ' : (err?.message ?? String(err)) };
  }
}

/**
 * Địa chỉ của một toạ độ. KHÔNG ném — mọi lỗi ra một nhánh để màn tự lùi về
 * toạ độ thô.
 *
 * Ba tầng đệm theo thứ tự: bộ nhớ → lượt đang bay → đĩa → mạng.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { kind: 'error', detail: 'Toạ độ không hợp lệ' };
  }
  const key = cacheKey(lat, lon);

  const hit = memory.get(key);
  if (hit) return hit;

  const flying = inflight.get(key);
  if (flying) return flying;

  const job = (async (): Promise<ReverseGeocodeResult> => {
    const disk = await readDisk(key);
    if (disk) { memory.set(key, disk); return disk; }

    const r = await fetchOnce(lat, lon);
    // Nhớ trong bộ nhớ cả ca hỏng, để một màn hỏng mạng không bắn liên tiếp mỗi
    // lần vẽ lại. Đĩa thì chỉ nhớ ca thành công — xem `writeDisk`.
    memory.set(key, r);
    await writeDisk(key, r);
    return r;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

/** Đường mở chỉ đường Google Maps tới một toạ độ. */
export function googleDirectionsUrl(lat: number, lon: number): string {
  // Đường "universal" của Google: trên máy có app Google Maps thì hệ điều hành
  // bắt lấy và mở thẳng app; không có thì mở trình duyệt. Dùng `geo:` thay thế
  // sẽ mở một bộ chọn ứng dụng và trên iOS thì không có gì nhận.
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}
