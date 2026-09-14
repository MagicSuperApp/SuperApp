// features/space3d/glTouchShield.gate.test.ts
//
// BỀ MẶT GL NẰM TRONG MỘT THỨ BẤM ĐƯỢC THÌ PHẢI CÓ TẤM CHẮN CHẠM.
//
// ⛔ Lỗi đã xảy ra HAI LẦN, cùng một hình dạng:
//   · nút chọn model trong danh sách model 3D ở màn Không gian 3D — bấm không ăn;
//   · ô "3D" ở màn chi tiết cây — bấm không mở được màn Không gian 3D.
//   Cả hai đều không lỗi, không màn mới: bấm như bấm vào tường.
//
// Nguyên nhân chung: `<Canvas>` bên trong `TreeModelPreview` là một bề mặt GL
// native, và nó TỰ NHẬN quyền xử lý cú chạm (để xoay/kéo model). Cú chạm dừng ở
// đó, không nổi lên tới `TouchableOpacity`/`Pressable` bọc ngoài. Ô càng vẽ kín
// thì càng không bấm được — chính cái làm ô đẹp là cái làm ô chết.
//
// Cách vá: một `View` RỖNG, trong suốt, phủ kín, `zIndex` cao hơn bề mặt GL. Nó
// thành đích của cú chạm, mà nó không có trình xử lý nào nên cú chạm nổi tiếp lên
// nút. Rỗng là phần bản chất, không phải tình cờ: có con thì nó là một lớp nội
// dung, và lớp nội dung thì không ai dám phủ kín ô.
//
// ⚠ Bài này đọc THẲNG MÃ NGUỒN, và đó là phép đo yếu hơn hẳn bài kiểm hành vi —
// nói rõ để không ai đọc nhầm nó thành "nút bấm được". Nó KHÔNG dựng cây view,
// không chạy GL (bộ kiểm chạy trên Node). Nó chỉ chặn đúng một cách viết đã hỏng
// thực địa hai lần, để lần thứ ba không đi qua được mà không ai thấy.

import { readFileSync } from 'fs';
import { join } from 'path';

/** Chỉ giữ MÃ CHẠY: chú thích giải thích lỗi luôn nhắc tên lỗi, bắt trúng nó là báo oan. */
const maChay = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const NOI_DUNG: { ten: string; duong: string }[] = [
  {
    ten: 'màn chi tiết cây — ô 3D',
    duong: join(__dirname, '..', '..', 'modules', 'trace', 'screens', 'TreeDetailScreen.tsx'),
  },
  {
    ten: 'màn Không gian 3D — nút chọn model',
    duong: join(__dirname, '..', '..', 'screens', 'Space3DScreen.tsx'),
  },
];

/**
 * Thẻ `View` RỖNG trong một lát mã, trả về phần khai kiểu của nó.
 *
 * ⛔ Vì sao phải lọc "rỗng", chứ không chỉ tìm một kiểu có `position:'absolute'`
 *    và `zIndex`: bản đầu của bài này làm thế và nó XANH OAN. Huy hiệu "3D" ở
 *    `TreeDetailScreen` cũng tuyệt đối và cũng có `zIndex` (phải có, để không bị
 *    chính tấm chắn phủ lên), nên gỡ hẳn tấm chắn ra thì bài vẫn xanh — tức nó
 *    canh một thứ luôn đúng. Đã kiểm lại bằng cách xoá tấm chắn và thấy nó không
 *    đỏ; ràng buộc "rỗng" là thứ tách được hai thẻ đó ra.
 */
const kieuCuaTheRong = (lat: string): string[] => {
  const ra: string[] = [];
  const mau = /<View\s+style=(\{\{[\s\S]*?\}\}|\{styles\.\w+\})\s*(?:\/>|>\s*<\/View>)/g;
  let m: RegExpExecArray | null;
  while ((m = mau.exec(lat)) !== null) ra.push(m[1]);
  return ra;
};

/**
 * Một khối kiểu có phải tấm chắn không: phủ kín VÀ nổi lên trên bề mặt GL.
 * `zIndex` là phần bắt buộc — thiếu nó thì tấm nằm dưới bề mặt GL trong thứ tự vẽ
 * và không chắn được gì.
 */
const laTamChan = (kieu: string): boolean =>
  /absoluteFillObject|absoluteFill\b|position:\s*["']absolute["']/.test(kieu) &&
  /zIndex/.test(kieu);

describe('mỗi `TreeModelPreview` bấm được đều có tấm chắn chạm', () => {
  it.each(NOI_DUNG)('$ten', ({ duong }) => {
    const ma = maChay(duong);

    const dung = ma.indexOf('<TreeModelPreview');
    expect(dung).toBeGreaterThan(-1);

    // Lát mã TRƯỚC chỗ vẽ model — chỗ duy nhất nút bọc ngoài có thể nằm.
    const truoc = ma.slice(Math.max(0, dung - 1200), dung);
    // Lát QUANH chỗ vẽ model, cho phần tìm tấm chắn. Không ép tấm chắn phải đứng
    // trước: `Space3DScreen` đặt nó trước, `TreeDetailScreen` đặt sau, và cả hai
    // đều đúng — thứ quyết định ai đè ai là `zIndex`, không phải thứ tự gõ. Ép
    // một thứ tự ở đây là canh thói quen gõ chứ không canh tấm chắn.
    const quanh = ma.slice(Math.max(0, dung - 1200), dung + 1200);

    // Có nút bọc ngoài — nếu không thì bài này đang canh một chỗ không cần canh,
    // và nó phải đỏ để người sửa đọc lại chứ không im lặng bỏ qua.
    expect(truoc).toMatch(/<(TouchableOpacity|Pressable|BentoTile)\b/);

    // Phải nhận CẢ HAI cách viết. `Space3DScreen` gõ kiểu thẳng trong thẻ;
    // `TreeDetailScreen` trỏ tới `styles.chanCham3D` nằm dưới cuối tệp. Bài kiểm
    // chỉ nhìn kiểu trong thẻ sẽ đỏ oan ở đúng chỗ VỪA ĐƯỢC VÁ — tức nó canh cách
    // gõ, không canh tấm chắn.
    const kieu = kieuCuaTheRong(quanh).map((k) => {
      if (!k.startsWith('{styles.')) return k;
      const ten = k.slice('{styles.'.length, -1);
      // Cắt theo mốc chuỗi, KHÔNG dựng biểu thức chính quy ghép từ tên: biểu thức
      // ghép phải mang theo dấu thoát, và dấu thoát trong chuỗi mẫu là một cái bẫy
      // im lặng — nó dịch ra ký tự khác chứ không báo lỗi.
      const dau = ma.indexOf(ten + ': {');
      if (dau === -1) return '';
      const cuoi = ma.indexOf('},', dau);
      return cuoi === -1 ? '' : ma.slice(dau, cuoi + 2);
    });

    expect(kieu.some(laTamChan)).toBe(true);
  });
});
