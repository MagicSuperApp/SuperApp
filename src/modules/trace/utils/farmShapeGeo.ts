/**
 * farmShapeGeo — phép chiếu cho hình bóng mảnh vườn (`components/layered/FarmShape`).
 *
 * Tách khỏi component vì đây là TOÁN, và toán thì đo được. Ba chỗ trượt ở đây
 * đều hỏng theo kiểu không ai thấy trên máy mình:
 *
 *   · Kéo giãn hai trục cho vừa hộp ⇒ mọi vườn ra hình vuông. Hình hết là hình
 *     của vườn này, nó thành hình của cái hộp — mà lỗi đó chỉ lộ khi đặt hai
 *     vườn khác dạng cạnh nhau.
 *   · Quên lật trục y ⇒ vườn hiện ngược bắc-nam so với mọi bản đồ từng thấy.
 *     Vườn dạng gần vuông thì nhìn không ra.
 *   · Vườn suy biến (mọi điểm cùng một chỗ) ⇒ chia cho 0 ⇒ `NaN`. `NaN` trong
 *     thuộc tính `points` của SVG là một hình KHÔNG vẽ gì mà cũng KHÔNG báo gì.
 *
 * ⚠ Coi kinh-vĩ độ như toạ độ phẳng. Sai số hình dạng ở vĩ độ Việt Nam
 * (~10-23°B) cỡ vài phần trăm bề ngang — mắt không thấy trên một ô bằng bàn
 * tay. Đây là hàm để NHÌN, không phải để đo đạc.
 */

import { isValidLatLon } from '../../../features/wayfind/wayfind';

export interface DiemDat { lat: number; lng: number }
export interface DiemVe { x: number; y: number }

/**
 * Đổi sang số CHỈ khi đầu vào thật sự mang một con số.
 *
 * `Number()` trần KHÔNG dùng được ở đây: `Number(null)`, `Number('')` và
 * `Number([])` đều ra `0` — một số hữu hạn, hợp lệ với mọi phép kiểm sau đó, và
 * nằm ở Vịnh Guinea. Tức một trường VẮNG tự biến thành một toạ độ có thật.
 */
const toFiniteNumber = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
};

/**
 * Một điểm trên mặt đất có dùng được không. Toạ độ thiếu/rác bị loại, không đoán.
 *
 * ⛔ Bản trước chỉ hỏi "có phải số hữu hạn không". `0` là số hữu hạn, và `0/0`
 *    chính là thứ máy sinh ra khi chưa bắt được GPS: điểm đó rơi ra Vịnh Guinea,
 *    khung nhìn phải giãn ra để chứa nó, nên toàn bộ cây thật co lại thành một
 *    chấm. `999` / `-5000` cũng là số hữu hạn và cũng lọt.
 *
 * Luật nay mượn NGUYÊN `isValidLatLon` (`features/wayfind/wayfind.ts`) thay vì
 * viết bản thứ tư: kho này từng có bốn phép kiểm toạ độ gần giống nhau, mỗi bản
 * thiếu một ràng buộc khác nhau, nên cùng một cái cây được màn này nhận và màn
 * kia loại — lệch kiểu không ai đọc ra được.
 */
export const hopLe = (p: any): boolean =>
  p != null && isValidLatLon({ lat: toFiniteNumber(p?.lat), lon: toFiniteNumber(p?.lng ?? p?.lon) });

/** Lọc vòng ranh giới về dạng dùng được. Không đủ ba điểm thì không có mảnh đất nào. */
export const vongRanh = (coordinates: unknown): DiemDat[] =>
  ((coordinates ?? []) as any[])
    .filter(hopLe)
    .map((p: any) => ({ lat: toFiniteNumber(p.lat), lng: toFiniteNumber(p.lng ?? p.lon) }));

/**
 * Bao nhiêu điểm bị loại khỏi một vòng ranh.
 *
 * Điểm rác biến mất IM LẶNG là chỗ hỏng thứ hai của bản trước: ranh giới hụt
 * một đỉnh trông y hệt một ranh giới người ta vẽ thiếu. Nơi gọi đếm được thì
 * nói ra được.
 */
export const droppedPointCount = (coordinates: unknown): number => {
  const tho = ((coordinates ?? []) as any[]).length;
  return tho - vongRanh(coordinates).length;
};

/**
 * Vị trí một cây. BỐN hình dạng, vì trong kho này cây có bốn hình dạng thật.
 *
 * ⛔ Bản đầu chỉ đọc `gps` / `lat` / `lon` — ba khoá lấy từ `forTree` bên
 *    `features/wayfind`, tức hình dạng của bản ghi TỪ MÁY CHỦ. Nhưng kiểu `Tree`
 *    trong `modules/trace/types` lưu ở `latitude`/`longitude`, hoặc ở dạng cặp
 *    `location: { lat, lng }`. Không khoá nào trùng.
 *
 *    Hệ quả: hàm trả `null` cho MỌI cây, nên hai ô xem trước vẽ mảnh đất không
 *    có một chấm nào — đúng như báo về từ thực địa, hai lượt liền.
 *
 *    Bài kiểm cũ không bắt được vì nó dựng dữ liệu giả theo ĐÚNG giả định sai
 *    của hàm: cả hai cùng sinh ra từ một chỗ đọc thiếu, nên chúng đồng ý với
 *    nhau. Nay các ca kiểm lấy hình dạng từ `interface Tree` chứ không từ đầu.
 *
 * Thứ tự đọc đi từ hình dạng CỤ THỂ nhất ra ngoài, để một bản ghi có nhiều khoá
 * không bị đọc bằng khoá kém tin cậy hơn.
 */
export const viTriCay = (t: any): DiemDat | null => {
  // Cùng luật với `hopLe` — một cây bị hình thửa loại mà bản đồ vẫn nhận (hoặc
  // ngược lại) là hai màn nói hai chuyện về cùng một cái cây.
  const thu = (lat: unknown, lng: unknown): DiemDat | null => {
    const a = toFiniteNumber(lat);
    const b = toFiniteNumber(lng);
    return isValidLatLon({ lat: a, lon: b }) ? { lat: a, lng: b } : null;
  };

  // 1. Kiểu `Tree` của module: `latitude` / `longitude`.
  const day = thu(t?.latitude, t?.longitude);
  if (day) return day;

  // 2. Dạng cặp: `location: { lat, lng }`.
  const cap = thu(t?.location?.lat, t?.location?.lng ?? t?.location?.lon);
  if (cap) return cap;

  // 3. Bản ghi máy chủ: chuỗi `gps` "vĩ, kinh".
  if (typeof t?.gps === 'string') {
    const [a, b] = t.gps.split(',');
    const chuoi = thu(a, b);
    if (chuoi) return chuoi;
  }

  // 4. Cặp rời `lat` / `lon`|`lng`.
  return thu(t?.lat, t?.lng ?? t?.lon);
};

/**
 * Đưa cả vườn về hộp 0..1, GIỮ TỈ LỆ.
 *
 * Hai trục chia CÙNG một số (cạnh dài nhất), rồi canh giữa phần thừa. Nhờ vậy
 * một mảnh dài gấp ba vẫn hiện ra dài gấp ba.
 */
export const chuanHoa = (ring: readonly DiemDat[]): ((p: DiemDat) => DiemVe) => {
  const xs = ring.map((p) => p.lng);
  const ys = ring.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Vườn suy biến thành một điểm hoặc một đường: cạnh dài nhất bằng 0. Thay
  // bằng một số dương cực nhỏ để mọi điểm rơi về giữa hộp, thay vì ra `NaN`.
  const canh = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const buX = (canh - (maxX - minX)) / 2;
  const buY = (canh - (maxY - minY)) / 2;
  return (p: DiemDat): DiemVe => ({
    x: (p.lng - minX + buX) / canh,
    // Vĩ độ lớn là về phía BẮC, mà trục y của SVG hướng XUỐNG.
    y: 1 - (p.lat - minY + buY) / canh,
  });
};

/**
 * Xoay nhẹ quanh TÂM hộp 0..1, trước khi chiếu.
 *
 * Vì sao xoay quanh tâm chứ không quanh gốc: xoay quanh gốc (0,0) đẩy cả hình
 * lệch ra một góc, nên phải bù lại bằng một phép dời — hai phép cho một việc, và
 * chỗ bù đó là chỗ sai khi ai đó đổi góc.
 *
 * "Nhẹ" là một góc nhỏ có chủ ý: đủ để mảnh đất thôi nằm thẳng hàng với mép ô
 * (thứ làm nó đọc ra "một hình vẽ"), chưa đủ để người ta phải nghiêng đầu.
 */
export const xoayNhe = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return (d: DiemVe): DiemVe => {
    const x = d.x - 0.5;
    const y = d.y - 0.5;
    return { x: 0.5 + x * c - y * s, y: 0.5 + x * s + y * c };
  };
};

/** Trải phẳng hộp 0..1 vào khung `viewBox` 100×100, chừa lề 8. */
export const phang = (d: DiemVe): DiemVe => ({ x: 8 + d.x * 84, y: 8 + d.y * 84 });

/** Nghiêng hộp 0..1 thành hình thoi, trong cùng khung 100×100. */
export const nghieng = (d: DiemVe): DiemVe => ({
  x: 50 + (d.x - d.y) * 34,
  y: 26 + (d.x + d.y) * 20,
});

/** Nối các điểm thành thuộc tính `points` của `<Polygon>`. */
export const noiDiem = (ds: readonly DiemVe[]): string =>
  ds.map((d) => `${d.x},${d.y}`).join(' ');
