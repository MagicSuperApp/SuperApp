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

export interface DiemDat { lat: number; lng: number }
export interface DiemVe { x: number; y: number }

/** Một điểm trên mặt đất có dùng được không. Toạ độ thiếu/rác bị loại, không đoán. */
export const hopLe = (p: any): boolean =>
  p != null && Number.isFinite(Number(p?.lat)) && Number.isFinite(Number(p?.lng ?? p?.lon));

/** Lọc vòng ranh giới về dạng dùng được. Không đủ ba điểm thì không có mảnh đất nào. */
export const vongRanh = (coordinates: unknown): DiemDat[] =>
  ((coordinates ?? []) as any[])
    .filter(hopLe)
    .map((p: any) => ({ lat: Number(p.lat), lng: Number(p.lng ?? p.lon) }));

/** Vị trí một cây — chấp cả `gps` dạng chuỗi lẫn cặp `lat`/`lon` rời. */
export const viTriCay = (t: any): DiemDat | null => {
  const g = typeof t?.gps === 'string' ? t.gps.split(',') : null;
  const lat = Number(g ? g[0] : t?.lat);
  const lng = Number(g ? g[1] : (t?.lng ?? t?.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
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
