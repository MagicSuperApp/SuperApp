/**
 * Cụm nhận diện — ba chốt mà bộ kiểm dựng-màn KHÔNG với tới.
 *
 * ── Vì sao bài này đọc MÃ NGUỒN và ĐỌC TỆP ẢNH, chứ không dựng màn ───────────
 * Cả ba thứ cần ghim đều là thứ preset jest của React Native không chở được:
 *
 *  1. `accessible` trên `<Image>`. Trên iOS `<Text>` mặc định LÀ phần tử trợ năng
 *     (`Libraries/Text/Text.js` — `Platform.select({ ios: accessible !== false })`)
 *     còn `<Image>` thì KHÔNG (`Image.ios.js` chỉ bật khi có `alt` hoặc
 *     `accessible`), và `accessibilityRole` không bật hộ. Nhưng preset jest thay
 *     HẲN cả `Image` lẫn `Text` bằng mock (`react-native/jest/setup.js`), nên
 *     trong bài kiểm cả hai đều trả `accessible: undefined` — mock LỎNG HƠN thật
 *     ở đúng trục đang đo, và mọi bài kiểm trợ năng dựng màn sẽ xanh giả.
 *
 *  2. HÌNH HỌC của cụm. Máy ảo jest không có bố cục Yoga, nên không đo được
 *     `cao(chữ hiệu) + khe + cao(khẩu hiệu)` có bằng `cao(dấu hiệu)` không. Cái
 *     ghim được — và là cái thật sự quyết — là ba TỈ LỆ cộng lại bằng 1.
 *
 *  3. KÍCH THƯỚC HAI TỆP ẢNH. Hai mảnh là bản CẮT từ `lockup-on-dark.png` theo
 *     hai hộp mực đo được. Cắt lại lệch vài điểm ảnh thì mọi tỉ lệ ở trên vẫn
 *     đúng về mặt số học nhưng cụm vẽ ra sai — và không màu nào đỏ.
 *
 * ── Bài này KHÔNG ghim gì ───────────────────────────────────────────────────
 * Nó không chứng minh VoiceOver đọc được tên app, và không chứng minh cụm không
 * chồng lên nút đổi ngôn ngữ. Nó chặn được lần XOÁ, không chặn được lần nền tảng
 * đổi luật. Phép đo thật cho cả ba chốt là chạy trên máy 360dp có bật trình đọc
 * màn hình.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  SLOGAN_SHARE,
  WORDMARK_SHARE,
  WORDMARK_TO_SLOGAN_GAP,
} from '../config/brandLockup';
import { CHECKFARM_INSTANCE } from '../config/instance.config';

const SCREENS = [
  'LanguageSelectScreen.tsx',
  'OnboardingScreen.tsx',
  'LoginNetworkScreen.tsx',
] as const;

const sourceOf = (name: string): string =>
  readFileSync(join(__dirname, name), 'utf8');

/** Rộng × cao đọc thẳng từ khối IHDR của một tệp PNG (byte 16..24, big-endian). */
const pngSize = (path: string): { width: number; height: number } => {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
};

const BRAND_DIR = join(__dirname, '..', '..', 'instances', 'checkfarm', 'brand');

describe('cụm nhận diện ở ba màn trước-đăng-nhập', () => {
  it.each(SCREENS)('%s — dùng `BrandLockup`, KHÔNG tự dựng cụm', name => {
    const src = sourceOf(name);
    expect(src).toMatch(/<BrandLockup\b/);
    // Ba màn không được đụng thẳng vào hai mảnh ảnh: mọi tỉ lệ và mọi phép căn
    // nằm ở MỘT chỗ. Chạm thẳng vào đây là dựng bản sao thứ hai của bố cục, và
    // bản sao đó sẽ trôi khỏi bản gốc mà không gì báo.
    expect(src).not.toMatch(/brandMarkOnDark|brandWordmarkOnDark/);
    // Và không được chép tỉ lệ ảnh vào tệp màn — tỉ lệ SINH từ bản kê tài sản
    // lúc chạy (`config/brandLockup.ts`). Khớp theo PHÉP CHIA chứ không theo con
    // số trơ: `856` một mình còn là một mã màu, một cỡ ảnh, một mốc thời gian —
    // bắt nó là bắt nhầm, và bài kiểm đỏ vì lý do sai thì nó bị nới ra, không
    // được sửa. (Đã dính đúng một lần: `#56...` trong bảng màu của màn ngôn ngữ.)
    expect(src).not.toMatch(/\b(856|136)\s*\/\s*(136|856)\b/);
    expect(src).not.toMatch(/\b(649|99|157)\s*\/\s*(99|649|136|157)\b/);
  });

  it('`BrandLockup` khai `accessible`, không chỉ `accessibilityRole`', () => {
    const src = readFileSync(
      join(__dirname, '..', 'components', 'BrandLockup.tsx'),
      'utf8',
    );
    // `accessibilityLabel` một mình KHÔNG đủ trên iOS: nó là nhãn cho một phần tử
    // mà hệ điều hành chưa coi là phần tử trợ năng.
    expect(src).toMatch(/accessibilityLabel=\{DEFAULT_INSTANCE\.displayName\}/);
    expect(src).toMatch(/(^|\s)accessible(\s|$)/m);
    // Nhãn đặt ở CHỮ HIỆU (nó ĐÚNG LÀ tên app); dấu hiệu là hình trang trí, phải
    // bị ẩn khỏi trình đọc — không thì tên app bị đọc hai lần.
    expect(src).toMatch(/accessibilityElementsHidden/);
  });

  it('ba phần của cột chữ cộng lại bằng ĐÚNG cạnh vuông ngoại tiếp dấu hiệu', () => {
    // Ràng buộc số 3 của chủ dự án, viết lại thành một đẳng thức kiểm được: cột
    // [chữ hiệu | khe | khẩu hiệu] cao bằng CẠNH HÌNH VUÔNG ngoại tiếp dấu hiệu.
    // Đơn vị của cả ba tỉ lệ vì thế là cạnh ấy, nên tổng phải ra đúng 1.
    //
    // Neo nhầm đơn vị vào chiều CAO dấu hiệu (nhỏ hơn `136/158`) là lỗi đã mắc
    // một lần: cụm vẫn dựng ra, vẫn cân đối, và không phép kiểm nào đỏ.
    const tong = WORDMARK_SHARE + WORDMARK_TO_SLOGAN_GAP + SLOGAN_SHARE;
    expect(tong).toBeCloseTo(1, 10);
  });

  it('khẩu hiệu CheckFarm giữ ĐỦ HAI VẾ', () => {
    // Chuỗi chuẩn là hằng `TAG` của bộ sinh nhận diện bên kho CheckFarm — chính
    // nó là ràng buộc số 1, và mọi cỡ chữ trong cụm là nghiệm giải ra TỪ nó. Cắt
    // bớt một vế thì bố cục vẫn giải được và cụm vẫn cân đối, nên chỗ sai này
    // không tự lộ ra ở đâu ngoài mắt người đọc thương hiệu.
    expect(CHECKFARM_INSTANCE.slogan.vi).toBe(
      'Truy xuất nguồn gốc - Nâng tầm nông sản',
    );
  });

  it('hai mảnh ảnh đúng hộp mực đã đo từ ảnh gộp', () => {
    // Hai hộp mực đo bằng kênh alpha của `lockup-on-dark.png` (856×136) ngày
    // 19/09/2026: dấu hiệu `(0,0,157,136)`, chữ hiệu `(207,18,856,117)`. Cắt lại
    // bằng mắt thì số học vẫn chạy còn cụm thì sai — nên ghim bằng số.
    expect(pngSize(join(BRAND_DIR, 'mark-on-dark.png'))).toEqual({
      width: 157,
      height: 136,
    });
    expect(pngSize(join(BRAND_DIR, 'wordmark-on-dark.png'))).toEqual({
      width: 649,
      height: 99,
    });
    // Ảnh gộp vẫn là NGUỒN của hai mảnh, nên nó phải còn và còn nguyên cỡ.
    expect(pngSize(join(BRAND_DIR, 'lockup-on-dark.png'))).toEqual({
      width: 856,
      height: 136,
    });
  });
});
