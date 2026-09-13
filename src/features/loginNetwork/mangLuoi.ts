// features/loginNetwork/mangLuoi.ts
//
// MÔ PHỎNG mạng lưới chấm của màn đăng nhập. Không React, không OpenGL, không
// `Dimensions` — chỉ số học trên một mặt phẳng pixel.
//
// ── Vì sao tách hẳn khỏi màn hình ───────────────────────────────────────────
// Thứ dễ hỏng ở một màn như thế này không phải cách vẽ, mà là CÁCH CHUYỂN ĐỘNG:
// chấm bay ra khỏi màn, chấm tụ lại thành một cục rồi đứng im, làn sáng lan
// truyền dừng giữa chừng bỏ lại một nửa mạng lưới tối. Không thứ nào trong số đó
// dựng lại được bằng cách nhìn ảnh chụp, và không thứ nào kiểm được nếu mã của
// chúng nằm lẫn trong một `useFrame` cạnh một ngữ cảnh GL.
//
// ── LƯỚI NHÀ, và vì sao bản trước "quá cứng" ────────────────────────────────
// Bản đầu cho mỗi chấm lang thang theo một hướng rồi DỘI vào mép màn. Hai hệ quả
// nhìn thấy ngay: chấm dồn dần về bốn mép (dội là một phép phản xạ, nó không kéo
// chấm về đâu cả), và mọi chuyển động đều là đường thẳng gãy khúc — không có gì
// tăng tốc, không có gì trôi thêm sau khi ngừng đẩy. Đó là cái "cứng".
//
// Bản này đổi cả hai:
//
//   NHÀ     Màn hình chia thành một lưới ô VÔ HÌNH (mặc định 10×10 = 100 ô, mỗi
//           chấm một ô). Mỗi chấm có một điểm NHÀ cố định trong ô của nó. Chấm
//           luôn có xu hướng về nhà, nên mạng lưới luôn tự dàn đều khắp màn —
//           không cần mép để chặn, và không bao giờ dồn cục.
//
//   LÒ XO   Chuyển động không còn là gán vị trí, mà là LỰC: mỗi khung hình tính
//           gia tốc từ một lò xo có giảm chấn, cộng vào VẬN TỐC, rồi vận tốc mới
//           dời vị trí. Nhờ có vận tốc mà có quán tính: chấm đang bay nhanh thì
//           vọt qua đích rồi lắc về, đúng như một vật có khối lượng.
//
//           Hệ số giảm chấn để DƯỚI mức tới hạn (`zeta < 1`) — đó chính là chỗ
//           sinh ra độ vọt. Đặt `zeta = 1` là hết vọt, và màn cứng trở lại.
//
// Chấm vẫn giữ quỹ đạo và tốc độ riêng: lúc tự do, đích của lò xo không phải là
// điểm nhà mà là một điểm chạy vòng Lissajous QUANH nhà, mỗi chấm một bán kính
// và hai tần số riêng.
//
// ── Trục toạ độ ─────────────────────────────────────────────────────────────
// x sang phải, y XUỐNG DƯỚI, gốc ở góc trên-trái, đơn vị là pixel bố cục — tức
// đúng hệ mà `locationX`/`locationY` của cú chạm trả về. Cố ý: mỗi phép đổi trục
// giữa chỗ nhận cú chạm và chỗ vẽ là một chỗ để lật ngược dấu mà không ai thấy.

/** Nguồn ngẫu nhiên — tham số để bài kiểm bơm một dãy định sẵn. */
export type Ngau = () => number;

/** Một chấm. Mọi trường "riêng của nó" đều bốc thăm lúc sinh, không dùng chung. */
export interface Nut {
  x: number;
  y: number;
  /** Vận tốc (px/s). Đây là chỗ quán tính được cất giữ giữa hai khung hình. */
  vx: number;
  vy: number;

  // ── Ô lưới và điểm nhà ────────────────────────────────────────────────────
  /** Chỉ số ô trên lưới vô hình. Cố định suốt đời chấm. */
  oCot: number;
  oHang: number;
  /** Lệch khỏi TÂM ô, tính theo phần của cạnh ô, trong [-0,3; 0,3]. */
  lechX: number;
  lechY: number;
  /** Điểm nhà, suy từ ba trường trên + kích thước màn. Xem `tinhNha`. */
  nhaX: number;
  nhaY: number;

  // ── Quỹ đạo riêng quanh nhà ───────────────────────────────────────────────
  /** Bán kính vòng lượn quanh nhà (px). */
  luonX: number;
  luonY: number;
  /** Hai tần số lệch nhau → đường đi là hình Lissajous, không phải vòng tròn. */
  tanSoX: number;
  tanSoY: number;
  phaX: number;
  phaY: number;

  // ── Xoay quanh điểm chạm ──────────────────────────────────────────────────
  /** Bán kính quỹ đạo quanh ngón tay (px). */
  banKinh: number;
  gocQuay: number;
  /** Tốc độ góc (rad/s), CÓ DẤU → chấm quay cả hai chiều, không thành bánh xe. */
  tocDoQuay: number;

  // ── Làn sáng lan truyền ───────────────────────────────────────────────────
  /** Giây (đồng hồ của mạng) lúc chấm này được thắp; `-1` là chưa. */
  moc: number;
  /** Độ sáng do làn sáng, 0..1. Suy từ `moc`, giữ sẵn để khỏi tính lại lúc vẽ. */
  sang: number;
}

export interface MangLuoi {
  nut: Nut[];
  rong: number;
  cao: number;
  /** Số ô của lưới vô hình. */
  cot: number;
  hang: number;
  /** Đồng hồ riêng, tính bằng GIÂY. Không đọc `Date.now()` — bài kiểm cần tua. */
  t: number;
  /** Ngón tay đang đặt ở đâu; `null` là đã thả tay và các chấm đang về nhà. */
  cham: { x: number; y: number } | null;
  /** Nguồn phát làn sáng (tâm nút sinh trắc); `null` là chưa kích hoạt. */
  lan: { x: number; y: number; tu: number } | null;
}

// ── Các hằng đã chỉnh tay ───────────────────────────────────────────────────

/** Hai chấm gần hơn mức này thì nối. Cũng là bán kính lan của làn sáng. */
export const BAN_KINH_NOI = 108;

/** Chấm nào nằm trong bán kính này quanh nút sinh trắc là NGÒI của làn sáng. */
export const BAN_KINH_NGOI = 96;

/** Giữ chậm cỡ này thì làn sáng đi hết ~100 chấm trong khoảng 1,5–2,5 giây. */
const TRE_LAN = 0.075;

/** Thời gian một chấm sáng dần lên sau khi được thắp (giây). */
const LEN_SANG = 0.28;

/**
 * Độ cứng lò xo (1/s²) và hệ số giảm chấn (0..1, dưới 1 là có độ vọt).
 *
 * Hai chế độ, hai bộ số, và khác nhau là cố ý:
 *
 *   VỀ NHÀ  mềm và hơi vọt. Lúc lang thang thì đích chạy chậm nên không ai thấy
 *           độ vọt; nhưng lúc vừa THẢ TAY, chấm đang ở xa nhà và bay nhanh —
 *           `zeta = 0,58` cho nó trôi qua nhà một chút rồi lắc về. Đó đúng là
 *           "quán tính khi đến vị trí mới" mà yêu cầu nói tới, và nó chỉ xuất
 *           hiện khi chấm đi nhanh, tự nhiên đúng lúc cần.
 *
 *   THEO TAY cứng hơn nhiều, để mạng lưới bám kịp ngón tay đang kéo. Vẫn để dưới
 *           mức tới hạn, nếu không thì chấm dán chặt vào quỹ đạo và lại hoá cứng.
 */
const CUNG_NHA = 4.2;
const CHAN_NHA = 0.58;
const CUNG_CHAM = 14;
const CHAN_CHAM = 0.72;

/**
 * Trần tốc độ (px/s).
 *
 * Lò xo là một hệ có thể tự bơm năng lượng khi `dt` giật: một khung hình dài bất
 * thường cho ra một gia tốc lớn, gia tốc ấy lại kéo dài khung sau. Trần này là
 * cái chặn cuối, và nó rộng hơn mọi chuyển động thật của màn (kéo tay nhanh nhất
 * cũng chỉ quanh 2000 px/s) nên không bao giờ cắt vào chuyển động bình thường.
 */
const TRAN_TOC = 2600;

const PI2 = Math.PI * 2;

/** Bốc một số trong [a, b). */
const trong = (r: Ngau, a: number, b: number) => a + r() * (b - a);

/** Bốc một số trong [a, b) rồi lật dấu ngẫu nhiên. */
const traiPhai = (r: Ngau, a: number, b: number) => (r() < 0.5 ? -1 : 1) * trong(r, a, b);

/**
 * Tính lại điểm nhà của mọi chấm từ lưới + kích thước màn hiện tại.
 *
 * Nhà KHÔNG được lưu bằng pixel tuyệt đối mà suy lại từ ô lưới, nên xoay máy hay
 * đổi khung thì lưới tự dàn lại cho khớp màn mới — chứ không giữ một bộ toạ độ
 * tính cho màn cũ rồi dồn hết chấm về một phía.
 */
function tinhNha(m: MangLuoi): void {
  const oRong = m.rong / m.cot;
  const oCao = m.cao / m.hang;
  for (const n of m.nut) {
    n.nhaX = (n.oCot + 0.5 + n.lechX) * oRong;
    n.nhaY = (n.oHang + 0.5 + n.lechY) * oCao;
  }
}

export function taoMangLuoi(
  rong: number,
  cao: number,
  soNut: number,
  r: Ngau = Math.random,
): MangLuoi {
  // Lưới vuông nhất có thể chứa đủ số chấm: 100 chấm → 10×10, đúng "một lưới
  // 100 dàn trải toàn màn hình". Số khác thì hàng cuối hụt vài ô, không sao —
  // ô trống chỉ nghĩa là chỗ đó không có chấm nào nhận làm nhà.
  const cot = Math.max(1, Math.round(Math.sqrt(soNut)));
  const hang = Math.max(1, Math.ceil(soNut / cot));

  const nut: Nut[] = [];
  for (let i = 0; i < soNut; i++) {
    nut.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      oCot: i % cot,
      oHang: Math.floor(i / cot),
      // Lệch khỏi tâm ô để lưới không ra một bàn cờ. Giữ trong ±0,3 cạnh ô: quá
      // nửa cạnh là chấm lấn sang ô bên, và lưới thôi dàn đều.
      lechX: trong(r, -0.3, 0.3),
      lechY: trong(r, -0.3, 0.3),
      nhaX: 0,
      nhaY: 0,
      // Vòng lượn quanh nhà. Hai bán kính khác nhau → quỹ đạo dẹt theo một phía.
      luonX: trong(r, 12, 42),
      luonY: trong(r, 12, 42),
      /**
       * Tần số vòng lượn (vòng/giây). Hai tần số KHÁC nhau và không phải bội của
       * nhau → hình Lissajous không khép kín, nên đường đi không lặp lại thấy được.
       *
       * ── Vì sao CHẬM tới vậy, và con số đến từ đâu ────────────────────────
       * Yêu cầu: lúc không có tác động thì chấm phải đi chậm lại. Tốc độ tiếp
       * tuyến của một vòng lượn là `2π · bán kính · tần số`, nên với bán kính
       * lớn nhất (42 px) thì:
       *
       *     tần số 0,38  →  100 px/s   ← bản trước, nhanh gấp bảy lần cần thiết
       *     tần số 0,055 →   14 px/s   ← bản này
       *
       * 14 px/s là đúng dải của bản lang-thang đầu tiên (4–13 px/s), tức dải đã
       * được mô tả là "nhẹ nhàng chậm rãi". Bản trước vô tình bỏ mất nó khi đổi
       * sang mô hình lò xo: tôi chọn tần số cho ĐẸP đường Lissajous mà không
       * tính lại nó ra px/s.
       *
       * Chấm vẫn đi NHANH khi có tác động — lúc theo tay, đích không còn là vòng
       * lượn này mà là quỹ đạo quanh ngón tay, với `tocDoQuay` gấp vài chục lần.
       */
      tanSoX: traiPhai(r, 0.018, 0.055),
      tanSoY: traiPhai(r, 0.018, 0.055),
      phaX: r() * PI2,
      phaY: r() * PI2,
      banKinh: trong(r, 34, 172),
      gocQuay: r() * PI2,
      // NHANH — yêu cầu ghi rõ. Gấp khoảng bốn lần bản trước (0,22–0,85), nên
      // vòng nhanh nhất quay hết một vòng trong khoảng một giây rưỡi.
      tocDoQuay: traiPhai(r, 0.9, 3.6),
      moc: -1,
      sang: 0,
    });
  }

  const m: MangLuoi = { nut, rong, cao, cot, hang, t: 0, cham: null, lan: null };
  tinhNha(m);
  // Bắt đầu ĐÚNG TẠI NHÀ: khung hình đầu tiên là lưới đã dàn đều, không phải một
  // đám chấm ngẫu nhiên đang trôi về chỗ của chúng.
  for (const n of m.nut) {
    n.x = n.nhaX;
    n.y = n.nhaY;
  }
  return m;
}

/** Đổi khung hình (xoay máy). Lưới dàn lại theo khung mới, chấm đi theo. */
export function doiKhung(m: MangLuoi, rong: number, cao: number): void {
  if (rong <= 0 || cao <= 0) return;
  const kx = m.rong > 0 ? rong / m.rong : 1;
  const ky = m.cao > 0 ? cao / m.cao : 1;
  for (const n of m.nut) {
    n.x *= kx;
    n.y *= ky;
    n.vx *= kx;
    n.vy *= ky;
  }
  m.rong = rong;
  m.cao = cao;
  tinhNha(m);
}

/**
 * Ngón tay đang ở đâu. Gọi lúc đặt tay VÀ mỗi lần ngón tay dịch — các chấm bám
 * theo vị trí thật của ngón, không đứng lại ở chỗ chạm đầu tiên.
 */
export function datCham(m: MangLuoi, x: number, y: number): void {
  const moi = !m.cham;
  m.cham = { x, y };
  if (moi) {
    // Vào quỹ đạo từ ĐÚNG góc chấm đang đứng, để nó trượt vào vòng chứ không nhảy.
    for (const n of m.nut) {
      n.gocQuay = Math.atan2(n.y - y, n.x - x);
    }
  }
}

/** Thả tay — các chấm lập tức hướng về nhà. */
export function buongCham(m: MangLuoi): void {
  m.cham = null;
}

/**
 * Bật làn sáng từ một điểm (tâm nút sinh trắc). Gọi SAU khi xác thực xong.
 *
 * Gọi lại khi đang chạy thì không làm gì — một làn sáng thứ hai chồng lên làn
 * đầu sẽ thắp gần hết mạng ngay lập tức, mất cả hiệu ứng lan.
 */
export function batLanTruyen(m: MangLuoi, x: number, y: number): void {
  if (m.lan) return;
  m.lan = { x, y, tu: m.t };
  let ngoi = 0;
  for (const n of m.nut) {
    if (Math.hypot(n.x - x, n.y - y) <= BAN_KINH_NGOI) {
      n.moc = m.t;
      ngoi++;
    }
  }
  // Không chấm nào đủ gần (màn quá hẹp, hoặc chấm vừa dạt đi hết) → thắp chấm
  // GẦN NHẤT. Bỏ trống nhánh này là làn sáng không bao giờ khởi động, và người
  // dùng đứng nhìn một màn đã xác thực xong mà không có gì xảy ra.
  if (ngoi === 0 && m.nut.length > 0) {
    let gan = m.nut[0];
    let d = Infinity;
    for (const n of m.nut) {
      const k = Math.hypot(n.x - x, n.y - y);
      if (k < d) {
        d = k;
        gan = n;
      }
    }
    gan.moc = m.t;
  }
}

/** Đã thắp hết chưa — nơi gọi dùng nó để biết lúc nào mở màn chính. */
export function daSangHet(m: MangLuoi): boolean {
  if (!m.lan) return false;
  for (const n of m.nut) if (n.moc < 0) return false;
  return true;
}

/**
 * Tiến mô phỏng `dt` giây.
 *
 * `dt` bị CHẶN TRẦN ở 1/20 giây. Khi app về lại tiền cảnh sau một lúc nằm nền,
 * khung hình đầu tiên mang một `dt` khổng lồ; với một hệ lò xo thì một bước dài
 * không chỉ dời chấm đi xa, nó còn bơm năng lượng vào hệ và làm cả mạng dao động
 * mãi không tắt.
 */
export function buoc(m: MangLuoi, dt: number): void {
  const b = Math.min(Math.max(dt, 0), 1 / 20);
  if (b === 0) return;
  m.t += b;

  const cham = m.cham;
  const cung = cham ? CUNG_CHAM : CUNG_NHA;
  const zeta = cham ? CHAN_CHAM : CHAN_NHA;
  // Giảm chấn tới hạn là 2·√k; nhân `zeta < 1` để hệ ở DƯỚI mức tới hạn, tức có
  // độ vọt. Đây là một dòng, và nó là toàn bộ khác biệt giữa "mềm" và "cứng".
  const chan = 2 * Math.sqrt(cung) * zeta;

  for (const n of m.nut) {
    let tx: number;
    let ty: number;

    if (cham) {
      // ── Xoay quanh ngón tay ───────────────────────────────────────────────
      n.gocQuay += n.tocDoQuay * b;
      tx = cham.x + Math.cos(n.gocQuay) * n.banKinh;
      ty = cham.y + Math.sin(n.gocQuay) * n.banKinh;
    } else {
      // ── Lượn quanh NHÀ ────────────────────────────────────────────────────
      // Pha vẫn chạy kể cả lúc đang theo tay (ở nhánh trên nó không chạy) —
      // không cần: đích tự do được tính lại từ `m.t`, nên nó không bao giờ
      // "đứng chờ" và chấm về nhà là bắt kịp ngay dòng chảy cũ.
      tx = n.nhaX + Math.cos(n.phaX + n.tanSoX * m.t * PI2) * n.luonX;
      ty = n.nhaY + Math.sin(n.phaY + n.tanSoY * m.t * PI2) * n.luonY;
    }

    // ── Lò xo có giảm chấn ──────────────────────────────────────────────────
    n.vx += ((tx - n.x) * cung - n.vx * chan) * b;
    n.vy += ((ty - n.y) * cung - n.vy * chan) * b;

    const toc = Math.hypot(n.vx, n.vy);
    if (toc > TRAN_TOC) {
      const k = TRAN_TOC / toc;
      n.vx *= k;
      n.vy *= k;
    }

    n.x += n.vx * b;
    n.y += n.vy * b;
  }

  if (m.lan) lanToi(m);
}

/** Một nhịp lan của làn sáng, kèm việc tính lại `sang` cho mọi chấm đã thắp. */
function lanToi(m: MangLuoi): void {
  const nut = m.nut;
  const r2 = BAN_KINH_NOI * BAN_KINH_NOI;
  for (let i = 0; i < nut.length; i++) {
    const a = nut[i];
    if (a.moc < 0) continue;
    a.sang = Math.min((m.t - a.moc) / LEN_SANG, 1);
    // Chỉ chấm đã sáng ĐỦ LÂU mới truyền tiếp — đó là thứ làm ra làn sóng. Bỏ
    // độ trễ này đi thì cả mạng sáng trong đúng một khung hình.
    if (m.t - a.moc < TRE_LAN) continue;
    for (let j = 0; j < nut.length; j++) {
      const c = nut[j];
      if (c.moc >= 0) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      if (dx * dx + dy * dy <= r2) c.moc = m.t;
    }
  }
}

/**
 * Duyệt mọi cặp chấm đủ gần để nối.
 *
 * `manh` là 0..1 theo khoảng cách (càng gần càng đậm); `sang` lấy theo đầu TỐI
 * HƠN trong hai đầu — dây chỉ sáng khi CẢ HAI đầu đã sáng, nên mắt đọc ra làn
 * sáng chạy dọc dây chứ không thấy dây loé lên trước cả chấm.
 */
export function duyetCanh(
  m: MangLuoi,
  nhan: (a: Nut, c: Nut, manh: number, sang: number) => void,
): void {
  const nut = m.nut;
  const r2 = BAN_KINH_NOI * BAN_KINH_NOI;
  for (let i = 0; i < nut.length; i++) {
    const a = nut[i];
    for (let j = i + 1; j < nut.length; j++) {
      const c = nut[j];
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      nhan(a, c, 1 - Math.sqrt(d2) / BAN_KINH_NOI, Math.min(a.sang, c.sang));
    }
  }
}
