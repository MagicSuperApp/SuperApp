/**
 * qrMatrix — dựng LƯỚI Ô của một mã QR, và nói rõ ô nào không được vẽ thành chấm.
 *
 * Tệp THUẦN TÍNH (không react, không svg) nên `jest` chạy thẳng.
 *
 * ══ VÌ SAO TỰ DỰNG LƯỚI, TRONG KHI MÁY CHỦ ĐÃ CÓ `/qr/{code}` ══════════════
 * Cửa đó trả một tấm SVG **đã vẽ xong** — ô vuông đen, nền trắng. Không có chỗ
 * nào chen vào để đổi thành chấm tròn hay đặt ảnh nền. Muốn cái nhìn khác thì
 * phải có LƯỚI, không phải có ẢNH.
 *
 * Đổi lại: app phải tự sinh mã. Điều đó AN TOÀN ở đây vì thứ nhúng vào QR là một
 * URL công khai mà chính app dựng (`publicTraceUrl`) — không phải bí mật nào của
 * máy chủ, và hai bên dựng ra cùng một chuỗi. Nếu ngày nào máy chủ đổi khuôn URL
 * thì `treeQrService` là chỗ đổi, không phải tệp này.
 *
 * ══ MỨC SỬA LỖI: CAO (H), KHÔNG PHẢI MẶC ĐỊNH ═════════════════════════════
 * QR có bốn mức sửa lỗi: L (~7%) · M (~15%) · Q (~25%) · H (~30%). Chọn **H**
 * vì tấm này CỐ Ý có ảnh nền và chấm tròn — hai thứ đều ăn vào phần "sạch" của
 * mã: ảnh lộ ra ở khe giữa các chấm, và chấm tròn thì mỗi ô mất bốn góc so với ô
 * vuông. Mức H cho phép hỏng tới ~30% mà máy vẫn đọc được; mức M thì một cái tem
 * dán lệch hay một vệt nắng loá là mất mã.
 *
 * Cái giá của H: lưới dày hơn (nhiều ô hơn cho cùng một chuỗi) ⇒ mỗi ô nhỏ đi.
 * Đó là đánh đổi ĐÚNG cho một cái tem đem dán ngoài vườn.
 *
 * ══ Ô NÀO PHẢI GIỮ VUÔNG ══════════════════════════════════════════════════
 * Ba ô định vị ở ba góc (finder pattern, 7×7). Máy quét tìm mã bằng cách dò đúng
 * tỉ lệ 1:1:3:1:1 của ba ô đó khi quét ngang/dọc. Vẽ chúng thành chấm tròn là
 * phá chính cái mốc dùng để tìm mã — mã vẫn "trông giống QR" mà máy không thấy.
 * Đây là chỗ duy nhất trong tệp này không được phép làm đẹp.
 */

/** Một lưới ô: `true` = ô tối. Hàng ngoài, cột trong (`m[y][x]`). */
export type QrMatrix = boolean[][];

/** Cạnh của ô định vị, tính bằng ô. Hằng của chuẩn QR, không phải lựa chọn. */
export const FINDER_SIZE = 7;

/**
 * Ô này có nằm trong một ô ĐỊNH VỊ không.
 *
 * Ba góc: trên-trái, trên-phải, dưới-trái. Góc dưới-phải KHÔNG có ô định vị —
 * đó chính là cách máy quét biết mã đang xoay hướng nào.
 */
export function isFinderZone(x: number, y: number, size: number): boolean {
  if (x < FINDER_SIZE && y < FINDER_SIZE) return true;
  if (x >= size - FINDER_SIZE && y < FINDER_SIZE) return true;
  if (x < FINDER_SIZE && y >= size - FINDER_SIZE) return true;
  return false;
}

/**
 * Dựng lưới từ một chuỗi. `null` khi chuỗi rỗng hoặc thư viện không dựng nổi.
 *
 * `null` chứ không phải lưới rỗng: lưới rỗng vẽ ra một ô trắng trông y như một
 * mã QR đang tải, còn `null` thì nơi gọi buộc phải nói ra là chưa có mã.
 */
export function buildQrMatrix(text: string): QrMatrix | null {
  const s = (text ?? '').trim();
  if (!s) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qrcode = require('qrcode-generator');
    // `0` = tự chọn phiên bản nhỏ nhất chứa đủ chuỗi ở mức sửa lỗi đã cho.
    const qr = qrcode(0, 'H');
    qr.addData(s);
    qr.make();
    const size: number = qr.getModuleCount();
    const out: QrMatrix = [];
    for (let y = 0; y < size; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x++) row.push(qr.isDark(y, x) === true);
      out.push(row);
    }
    return out;
  } catch {
    // Chuỗi quá dài cho mức H, hoặc thiếu thư viện. Cả hai đều là "không có mã
    // để vẽ" chứ không phải "mã rỗng".
    return null;
  }
}

/** Một chấm sẽ vẽ ra màn: toạ độ tâm và bán kính, đơn vị PIXEL của tấm ảnh. */
export interface QrDot {
  cx: number;
  cy: number;
  r: number;
  dark: boolean;
}

/** Một ô vuông đặc (dùng cho ô định vị). */
export interface QrSquare {
  x: number;
  y: number;
  size: number;
}

export interface QrLayout {
  /** Cạnh tấm ảnh, pixel. */
  canvas: number;
  /** Cạnh một ô, pixel. */
  cell: number;
  /** Số ô mỗi cạnh của lưới (chưa tính lề). */
  modules: number;
  dots: QrDot[];
  /** Ô định vị — vẽ VUÔNG, xem chú thích đầu tệp. */
  finders: QrSquare[];
}

/**
 * Lề trắng quanh mã, tính bằng Ô.
 *
 * Chuẩn QR đòi 4 ô. Nhiều thư viện rút xuống 1–2 cho gọn, và đó là lý do quen
 * thuộc khiến một mã "đẹp" không quét được khi dán sát mép nhãn: máy quét cần
 * vùng trống để tách mã khỏi nền. Giữ 4.
 */
export const QUIET_ZONE = 4;

/**
 * Quy lưới → danh sách hình cần vẽ.
 *
 * Tách khỏi phần vẽ để test được: kiểm được số chấm, bán kính, vị trí ô định vị
 * mà không cần dựng một cây React nào.
 *
 * `dotScale` là tỉ lệ đường kính chấm so với cạnh ô. `1` = chấm chạm mép ô (khe
 * hở chỉ còn bốn góc — đúng kiểu của bản mẫu web). Nhỏ hơn thì ảnh nền lộ ra
 * nhiều hơn nhưng mã yếu đi; đừng hạ dưới 0,8.
 */
export function layoutQr(
  matrix: QrMatrix | null,
  canvas: number,
  dotScale = 1,
): QrLayout | null {
  if (!matrix || matrix.length === 0) return null;
  const modules = matrix.length;
  if (!Number.isFinite(canvas) || canvas <= 0) return null;

  const cell = canvas / (modules + QUIET_ZONE * 2);
  const r = (cell / 2) * Math.max(0.5, Math.min(1, dotScale));
  const off = QUIET_ZONE * cell;

  const dots: QrDot[] = [];
  const finders: QrSquare[] = [];

  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      const px = off + x * cell;
      const py = off + y * cell;
      if (isFinderZone(x, y, modules)) {
        // Ô định vị: chỉ vẽ phần TỐI, và vẽ vuông. Phần sáng của nó do nền lo —
        // nền dưới ô định vị phải là nền trơn, không phải ảnh (xem `TreeQrCode`).
        if (matrix[y][x]) finders.push({ x: px, y: py, size: cell });
        continue;
      }
      dots.push({ cx: px + cell / 2, cy: py + cell / 2, r, dark: matrix[y][x] });
    }
  }
  return { canvas, cell, modules, dots, finders };
}

/**
 * Hình vuông bao ba ô định vị, đã cộng lề trắng một ô mỗi phía.
 *
 * Dùng để lót nền TRƠN dưới ba góc: ảnh nền chạy qua ô định vị là cách chắc chắn
 * nhất phá mốc dò mã. Trả mảng rỗng khi không có lưới.
 */
export function finderShields(layout: QrLayout | null): QrSquare[] {
  if (!layout) return [];
  const { cell, modules } = layout;
  const off = QUIET_ZONE * cell;
  const pad = cell; // một ô trắng quanh ô định vị — chính là vạch tách chuẩn QR
  const side = FINDER_SIZE * cell + pad * 2;
  const at = (mx: number, my: number): QrSquare => ({
    x: off + mx * cell - pad,
    y: off + my * cell - pad,
    size: side,
  });
  return [
    at(0, 0),
    at(modules - FINDER_SIZE, 0),
    at(0, modules - FINDER_SIZE),
  ];
}
