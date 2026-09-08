/**
 * Ghim MỘT ràng buộc, và nó là ràng buộc giữa HAI tệp:
 *
 *   chừng nào `saveTreeMetadata` chưa gọi mạng, câu báo thành công phải nói ra
 *   rằng dữ liệu chỉ nằm trên máy này.
 *
 * Vì sao phải ghim: hai nửa nằm ở hai tệp khác nhau, và mỗi nửa tự nó trông đều
 * đúng. Thunk chỉ ghi AsyncStorage — hợp lý, vì cửa máy chủ chưa lên. Câu báo ghi
 * "Đã lưu" — cũng hợp lý, vì thao tác đã xong. Cái sai chỉ hiện ra khi đọc cả hai
 * cùng lúc, và không có gì bắt ai phải đọc cả hai cùng lúc.
 *
 * Đây là bài kiểm ĐỌC NGUỒN. Nó không dựng màn nào — nó canh cho hai nửa không
 * trôi khỏi nhau. Ngày cửa `POST /api/tree/{tree_id}/profile` lên máy và thunk gọi
 * nó thật, bài này TỰ NHẢ: điều kiện đầu không còn thoả, nên câu báo được đổi.
 */
import fs from 'fs';
import path from 'path';

const SLICE = fs.readFileSync(path.join(__dirname, 'farmSlice.ts'), 'utf8');
const KEYS = fs.readFileSync(
  path.join(__dirname, '../../../i18n/keys/trace.ts'),
  'utf8',
);

/** Thân của `saveTreeMetadata`, cắt từ chỗ khai tới dấu đóng `);` đầu tiên. */
const thunkBody = (): string => {
  const khoi = SLICE.indexOf("export const saveTreeMetadata = createAsyncThunk(");
  expect(khoi).toBeGreaterThan(-1); // ca đối chứng: cắt được thật, không ra chuỗi rỗng
  const het = SLICE.indexOf('\n);', khoi);
  expect(het).toBeGreaterThan(khoi);
  return SLICE.slice(khoi, het);
};

describe('hồ sơ cây — chỉ trên máy này, và câu báo phải nói ra điều đó', () => {
  it('thunk hôm nay KHÔNG gọi mạng', () => {
    const than = thunkBody();
    expect(than).toContain('AsyncStorage.setItem');
    // Ba hình dạng gọi mạng đang dùng trong kho này.
    expect(than).not.toMatch(/\bfetch\s*\(/);
    expect(than).not.toMatch(/\bapi\w*\.\w+\s*\(/);
    expect(than).not.toMatch(/Service\.\w+\s*\(/);
  });

  it('vì chưa gọi mạng, câu báo nói rõ dữ liệu chỉ nằm trên máy này', () => {
    const than = thunkBody();
    const chuaGoiMang = !/\bfetch\s*\(|\bapi\w*\.\w+\s*\(|Service\.\w+\s*\(/.test(than);
    // Điều kiện, không phải khẳng định vô điều kiện: ngày thunk gọi mạng thật thì
    // ràng buộc này TỰ NHẢ, và bài kiểm không chặn việc đổi câu báo cho đúng lúc đó.
    if (!chuaGoiMang) return;

    const dong = (khoa: string): string => {
      const i = KEYS.indexOf(`'${khoa}':`);
      expect(i).toBeGreaterThan(-1);
      return KEYS.slice(i, KEYS.indexOf('\n', i));
    };

    // Bản tiếng Việt và bản tiếng Anh — hai bản người dùng thật đang đọc hôm nay.
    expect(dong('trace.meta.saved')).toContain('trên máy này');
    expect(dong('trace.meta.saved')).toContain('on this device');
    expect(dong('trace.meta.savedBody')).toContain('Máy chủ chưa nhận');
    expect(dong('trace.meta.savedBody')).toContain('server has not received');
  });
});
