/**
 * Ghim MỘT ràng buộc, và nó là ràng buộc giữa HAI tệp:
 *
 *   thunk gọi máy chủ hay không, và câu báo thành công nói gì, phải khớp nhau.
 *
 * Bản trước của tệp này ghim chiều NGƯỢC LẠI: chừng nào thunk chưa gọi mạng thì
 * câu báo phải nói "chỉ nằm trên máy này". Nó viết dạng ĐIỀU KIỆN đúng để hôm nay
 * tự nhả — cửa `POST /api/tree/{tree_id}/profile` đã lên máy sản xuất và thunk đã
 * gọi nó, nên vế đầu không còn thoả.
 *
 * Đo, không suy (2026-09-08, hai cực để phân biệt "sống" với "không tồn tại"):
 *
 *   POST https://api.orilife.io/api/tree/x/profile          → 401
 *   POST https://api.orilife.io/api/tree/x/khong-co-cua-nay → 404
 *
 * 401 là "cửa có, đòi đăng nhập"; 404 là "không có cửa". Đo một cực thì 401 đọc
 * thành gì cũng được.
 *
 * Bài này không dựng màn nào — nó canh cho hai nửa không trôi khỏi nhau, và nó
 * ghim cả hai chiều nên ngày cửa kia chết thì nó lại đỏ.
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
  const start = SLICE.indexOf('export const saveTreeMetadata = createAsyncThunk(');
  expect(start).toBeGreaterThan(-1); // ca đối chứng: cắt được thật, không ra chuỗi rỗng
  const end = SLICE.indexOf('\n);', start);
  expect(end).toBeGreaterThan(start);
  return SLICE.slice(start, end);
};

const line = (key: string): string => {
  const i = KEYS.indexOf(`'${key}':`);
  expect(i).toBeGreaterThan(-1);
  return KEYS.slice(i, KEYS.indexOf('\n', i));
};

/** Thunk có đường đi tới máy chủ không — đo bằng lời gọi, không bằng chú thích. */
const callsServer = (body: string): boolean => /\bsaveTreeProfile\s*\(/.test(body);

describe('hồ sơ cây — thunk và câu báo phải nói cùng một chuyện', () => {
  it('thunk gọi cửa máy chủ, và gọi TRƯỚC khi ghi xuống kho máy', () => {
    const body = thunkBody();
    expect(callsServer(body)).toBe(true);
    expect(body).toContain('AsyncStorage.setItem');
    // Máy chủ TRƯỚC, kho máy SAU. Ngược thứ tự là ghi cục bộ rồi báo xong trong
    // khi máy chủ có thể đã chối — đúng cái vỏ im lặng bản này gỡ.
    expect(body.indexOf('saveTreeProfile')).toBeLessThan(body.indexOf('AsyncStorage.setItem'));
  });

  it('máy chủ trượt thì thunk BỊ TỪ CHỐI, không âm thầm ghi cục bộ rồi báo xong', () => {
    const body = thunkBody();
    expect(body).toContain('rejectWithValue');
  });

  it('vì đã gọi máy chủ, câu báo KHÔNG được nói dữ liệu chỉ nằm trên máy này', () => {
    const body = thunkBody();
    // Điều kiện, không phải khẳng định vô điều kiện — hai chiều đều được canh:
    // ngày thunk thôi gọi máy chủ thì ca dưới nhả, và ca đầu tệp này đỏ thay.
    if (!callsServer(body)) return;

    expect(line('trace.meta.saved')).not.toContain('trên máy này');
    expect(line('trace.meta.savedBody')).not.toContain('Máy chủ chưa nhận');
    expect(line('trace.meta.savedBody')).not.toContain('server has not received');
    // Ca đối chứng: cắt được đúng dòng, không phải đang so với chuỗi rỗng.
    expect(line('trace.meta.savedBody')).toContain('máy chủ');
  });

  it('phần ghi âm vẫn chỉ nằm trên máy, và có sẵn câu nói ra điều đó', () => {
    // Ghi âm KHÔNG có đường lên máy chủ. Câu ưu tiên là câu của máy chủ
    // (`voice_memo.reason`); khoá này là chỗ dựa khi máy chủ không nói gì.
    expect(line('trace.meta.savedVoiceLocal')).toContain('chỉ nằm trên máy này');
  });
});
