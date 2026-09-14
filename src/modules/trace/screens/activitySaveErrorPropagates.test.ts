/**
 * Ghim MỘT điều: một lượt ghi việc đồng HỎNG phải đi tới được nhánh lỗi của màn.
 *
 * Lỗi đã có: `ActivityScreen.handleSave` viết `await dispatch(saveActivity(...))` trần.
 * `saveActivity` là `createAsyncThunk`, và một thunk như thế KHÔNG BAO GIỜ ném — payload
 * creator ném thì RTK bắt lấy, đổi thành action `…/rejected`, rồi cho promise **resolve**.
 * Nên `catch` của màn không bao giờ chạy: `addSyncItem` chạy tiếp, `showSuccess('Đã lưu')`
 * hiện, `goBack()` đóng màn — trong khi không có bản ghi nào trên máy. Người ghi việc
 * ngoài vườn đọc "đã lưu" rồi đi sang cây kế tiếp, và không có gì kêu lên.
 * Áp cho cả ba việc: tưới nước · bón phân · xịt thuốc.
 *
 * Hai bài dưới đây đo ở HAI TẦNG KHÁC NHAU, cố ý:
 *  1. tầng HÀNH VI — dựng store thật, cho tầng đĩa ném, rồi hỏi promise có bị từ chối.
 *     Bài này phân biệt được `.unwrap()` với không `.unwrap()`: bỏ `.unwrap()` đi thì
 *     `await` trần resolve và bài đỏ.
 *  2. tầng NGUỒN — đọc chính dòng mã trong màn. Cần bài này vì bài (1) kiểm `saveActivity`
 *     + `.unwrap()`, KHÔNG kiểm được rằng MÀN có gọi `.unwrap()`; ai đó gỡ `.unwrap()`
 *     khỏi màn thì bài (1) vẫn xanh nguyên. Đó đúng là ca "bài trượt xuống chốt kế tiếp"
 *     mà Forall §Kỷ luật phát ngôn mục 6 nói tới.
 */
import { configureStore } from '@reduxjs/toolkit';
import fs from 'fs';
import path from 'path';

const DISK_ERROR = 'SQLITE_FULL: database or disk is full';

jest.mock('../../../utils/database', () => ({
  database: { saveActivity: jest.fn(async () => { throw new Error(DISK_ERROR); }) },
}));

jest.mock('../../../services/databaseManager', () => ({
  databaseManager: { ensureReady: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { saveActivity, default: farmReducer } = require('../store/farmSlice');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { database } = require('../../../utils/database');

describe('ghi việc đồng — lượt ghi hỏng phải NÉM, không được resolve êm', () => {
  // Cấu hình jest của kho này đặt lại mock giữa các bài, nên thân mock khai ở
  // `jest.mock` chỉ sống qua ĐÚNG một bài. Bài thứ hai trở đi sẽ thấy một hàm rỗng
  // trả `undefined` — tức "ghi thành công" — và bài đo đường HỎNG tự xanh ở đúng ca
  // nó phải đỏ. Đặt lại thân ở đây để mọi bài trong khối này đo cùng một sự việc.
  beforeEach(() => {
    (database.saveActivity as jest.Mock).mockImplementation(async () => {
      throw new Error(DISK_ERROR);
    });
  });

  const makeStore = () => configureStore({
    reducer: { farm: farmReducer },
    middleware: (get: any) => get({ serializableCheck: false }),
  });

  it('`await dispatch(...)` TRẦN resolve dù đĩa hỏng — đây là cái bẫy, giữ lại làm đối chứng', async () => {
    const store = makeStore();
    const action: any = await store.dispatch(saveActivity({ id: 'a1' } as any) as any);
    // Không ném. Promise resolve, và action mang dấu `rejected` mà màn không đọc.
    expect(action.type).toBe('farm/saveActivity/rejected');
    expect(action.error?.message).toBe(DISK_ERROR);
  });

  it('`.unwrap()` NÉM lại lỗi gốc — đây là thứ làm `catch` của màn chạm tới được', async () => {
    const store = makeStore();
    let caught: any = null;
    try {
      await (store.dispatch(saveActivity({ id: 'a2' } as any) as any) as any).unwrap();
    } catch (e) {
      caught = e;
    }
    // KHÔNG dùng `rejects.toThrow`: `unwrap()` ném thứ RTK đã tuần tự hoá
    // (`{ name, message, stack }`), tức một object THƯỜNG chứ không phải `Error`, nên
    // `toThrow` báo "hàm không ném" đúng lúc nó đã ném. Đây là ca cổng đo sai đại
    // lượng — nó hỏi "có ném Error không", còn câu cần hỏi là "có tới được `catch`
    // của màn không".
    expect(caught).not.toBeNull();
    expect(caught.message).toBe(DISK_ERROR);
  });

  it('kho KHÔNG giữ bản ghi nào sau lượt hỏng — nên màn là chỗ DUY NHẤT nói ra được', async () => {
    const store = makeStore();
    await store.dispatch(saveActivity({ id: 'a3' } as any) as any);
    expect((store.getState() as any).farm.activities).toHaveLength(0);
  });
});

describe('MÀN ghi việc gọi `.unwrap()` — đo ở nguồn, vì bài hành vi không canh được chỗ này', () => {
  // BỎ CHÚ THÍCH trước khi khớp. Màn này cố ý ghi lại NGUYÊN VĂN đoạn mã đã gỡ để
  // người sau biết vì sao nó bị gỡ — nên một phép khớp trên tệp thô sẽ tìm thấy đoạn
  // đó trong chú thích và báo đỏ đúng lúc mã đã đúng. Đo MÃ thì phải bỏ chú thích.
  const raw = fs.readFileSync(path.join(__dirname, 'ActivityScreen.tsx'), 'utf8');
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');

  it('lượt dispatch `saveActivity` có `.unwrap()`', () => {
    // Khớp cả khi đối số trải nhiều dòng.
    expect(src).toMatch(/dispatch\(\s*saveActivity\([\s\S]*?\)\s*\)\.unwrap\(\)/);
  });

  it('nhánh `catch` KHÔNG bỏ trắng nguyên nhân — phải giữ một mã tra ngược được', () => {
    // `catch (_)` ném nguyên nhân đi: một ảnh chụp màn hình từ vườn không nói được gì
    // để mà lần lại trong nhật ký.
    expect(src).not.toMatch(/catch\s*\(\s*_\s*\)\s*\{\s*\n\s*showError/);
    expect(src).toMatch(/mã: \$\{ref\}/);
  });

  it('KHÔNG dựng vườn giả từ tên cây — object giả luôn truthy nên nó vô hiệu hoá `contextReady`', () => {
    expect(src).not.toMatch(/\{\s*id:\s*tree\.farmId,\s*name:\s*tree\.name/);
    expect(src).toMatch(/const contextReady = !!farm && !!user;/);
  });
});
