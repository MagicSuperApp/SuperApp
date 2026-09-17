/**
 * Cụm nhận diện — hai chốt KHAI BÁO ở cả ba màn trước-đăng-nhập.
 *
 * ── Vì sao bài này đọc MÃ NGUỒN chứ không dựng màn ──────────────────────────
 * Hai thứ cần ghim đều là thứ preset jest của React Native KHÔNG chở được:
 *
 *  1. `accessible` trên `<Image>`. Trên iOS `<Text>` mặc định LÀ phần tử trợ năng
 *     (`Libraries/Text/Text.js` — `Platform.select({ ios: accessible !== false })`)
 *     còn `<Image>` thì KHÔNG (`Image.ios.js` chỉ bật khi có `alt` hoặc
 *     `accessible`), và `accessibilityRole` không bật hộ. Nhưng preset jest thay
 *     HẲN cả `Image` lẫn `Text` bằng mock (`react-native/jest/setup.js`), nên
 *     trong bài kiểm cả hai đều trả `accessible: undefined` — mock LỎNG HƠN thật
 *     ở đúng trục đang đo, và mọi bài kiểm trợ năng dựng màn sẽ xanh giả.
 *
 *  2. Bề rộng CO ĐƯỢC. `flexShrink` mặc định của RN là 0, nên một con rộng cố
 *     định tràn khỏi lề và vẽ đè (`overflow` mặc định của `View` là `visible`).
 *     Máy ảo jest không có bố cục Yoga nên không đo được chuyện đó.
 *
 * ── Bài này KHÔNG ghim gì ───────────────────────────────────────────────────
 * Nó không chứng minh VoiceOver đọc được tên app, và không chứng minh cụm không
 * chồng lên nút đổi ngôn ngữ. Nó chỉ chứng minh lời khai còn nguyên — tức nó
 * chặn được lần XOÁ, không chặn được lần nền tảng đổi luật. Phép đo thật cho cả
 * hai chốt là chạy trên máy 360dp có bật trình đọc màn hình.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SCREENS = [
  'LanguageSelectScreen.tsx',
  'OnboardingScreen.tsx',
  'LoginNetworkScreen.tsx',
] as const;

const sourceOf = (name: string): string =>
  readFileSync(join(__dirname, name), 'utf8');

/** Khối JSX của `<Image ... brandLockupOnDark ... />` trong một tệp màn. */
const lockupImageBlock = (src: string): string => {
  const start = src.indexOf('source={DEFAULT_INSTANCE.brandLockupOnDark}');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('/>', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('khai báo cụm nhận diện ở ba màn trước-đăng-nhập', () => {
  it.each(SCREENS)('%s — ảnh cụm khai `accessible`, không chỉ `accessibilityRole`', name => {
    const block = lockupImageBlock(sourceOf(name));
    // `accessibilityLabel` một mình KHÔNG đủ trên iOS: nó là nhãn cho một phần tử
    // mà hệ điều hành chưa coi là phần tử trợ năng.
    expect(block).toMatch(/accessibilityLabel=\{DEFAULT_INSTANCE\.displayName\}/);
    expect(block).toMatch(/(^|\s)accessible(\s|$)/);
  });

  it.each(SCREENS)('%s — bề rộng cụm CO ĐƯỢC, chặn trên bằng maxWidth', name => {
    const src = sourceOf(name);
    const style = src.match(/^\s*lockup: \{[^}]*\}/m);
    expect(style).not.toBeNull();
    const text = style![0];
    // `width: '100%'` + `maxWidth` — KHÔNG phải một con số trần.
    expect(text).toMatch(/width: '100%'/);
    expect(text).toMatch(/maxWidth: \d+/);
    expect(text).not.toMatch(/(^|[^x])width: \d/);
  });

  it.each(SCREENS)('%s — KHÔNG chép tỉ lệ ảnh vào tệp màn', name => {
    const src = sourceOf(name);
    const style = src.match(/^\s*lockup: \{[^}]*\}/m)!;
    // Tỉ lệ phải SINH từ tệp ảnh (`config/brandLockup.ts`). Gõ `136 / 856` ở đây
    // là dựng một bản sao sẽ chết im lặng ngày ai đó thay ảnh bằng tỉ lệ khác:
    // `resizeMode: 'contain'` lồng mực vào khung chứ không kêu.
    expect(style[0]).not.toMatch(/height:/);
    expect(src).toMatch(/BRAND_LOCKUP_ASPECT/);
  });
});
