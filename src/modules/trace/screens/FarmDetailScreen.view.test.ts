/**
 * Ghim MỘT ràng buộc: **màn CHI TIẾT vườn không được tự biến thành màn TẠO VƯỜN.**
 *
 * Bản trước quyết định bằng đúng một dòng: `if (!farm) return <AddFarmMode …/>`.
 * Dòng đó gộp hai tình huống hoàn toàn khác nhau vào một màn hình:
 *
 *   a) người dùng bấm "Thêm vườn" — KHÔNG có `farm_id`, tạo mới là đúng ý họ;
 *   b) người dùng mở một vườn ĐÃ CÓ (bấm từ danh sách, hoặc quét QR) — có
 *      `farm_id`, nhưng vườn chưa nạp xong, hoặc kho máy không có nó.
 *
 * Ở ca (b) người dùng thấy một biểu mẫu trống ở đúng chỗ họ chờ vườn của mình.
 * Việc hợp lý nhất để làm với một biểu mẫu trống là điền nó — nên họ vẽ lại ranh,
 * đặt lại tên, và app sinh ra vườn TRÙNG. Không lỗi nào hiện ra, không dòng log
 * nào đỏ: một nhánh phòng thủ nguỵ trang thành đường đi bình thường.
 *
 * Bài này gọi thẳng hàm quyết định (`resolveFarmDetailView`) thay vì dựng nguyên
 * màn hơn 3.000 dòng, và thay vì dò mã nguồn bằng biểu thức chính quy — cách đo
 * đó xanh với mọi cách viết lại dù hành vi đảo ngược.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { resolveFarmDetailView } from './FarmDetailScreen';

const FARM = { id: 'f1', name: 'Vườn Bưởi' };

describe('resolveFarmDetailView', () => {
  it('có vườn trong tay → màn CHI TIẾT, bất kể trạng thái nạp', () => {
    expect(resolveFarmDetailView({ farmId: 'f1', farm: FARM, loadState: 'loaded' })).toBe('detail');
    expect(resolveFarmDetailView({ farmId: 'f1', farm: FARM, loadState: 'loading' })).toBe('detail');
    expect(resolveFarmDetailView({ farmId: 'f1', farm: FARM, loadState: 'failed' })).toBe('detail');
  });

  it('KHÔNG có farm_id → màn TẠO MỚI (đây là lối vào "Thêm vườn", không phải lỗi)', () => {
    expect(resolveFarmDetailView({ farmId: null, farm: null, loadState: 'idle' })).toBe('create');
    expect(resolveFarmDetailView({ farmId: undefined, farm: null, loadState: 'idle' })).toBe('create');
    // `TreeEnrollScreen.tsx:783` điều hướng với `{ farm_id: null }` — chuỗi rỗng
    // và null phải cùng nghĩa "chưa chọn vườn nào".
    expect(resolveFarmDetailView({ farmId: '', farm: null, loadState: 'idle' })).toBe('create');
  });

  // ⛔ BA CA DƯỚI ĐÂY LÀ TOÀN BỘ LÝ DO TỆP NÀY TỒN TẠI.
  // Cả ba trước đây đều trả về màn TẠO MỚI.
  it('CÓ farm_id mà chưa nạp xong → màn ĐANG TẢI, KHÔNG phải màn tạo', () => {
    expect(resolveFarmDetailView({ farmId: 'f1', farm: null, loadState: 'idle' })).toBe('loading');
    expect(resolveFarmDetailView({ farmId: 'f1', farm: null, loadState: 'loading' })).toBe('loading');
  });

  it('CÓ farm_id, nạp xong mà kho máy không có vườn → màn KHÔNG TẢI ĐƯỢC', () => {
    expect(resolveFarmDetailView({ farmId: 'f1', farm: null, loadState: 'loaded' })).toBe('unavailable');
  });

  it('CÓ farm_id, lần nạp hỏng → màn KHÔNG TẢI ĐƯỢC (có nút thử lại)', () => {
    expect(resolveFarmDetailView({ farmId: 'f1', farm: null, loadState: 'failed' })).toBe('unavailable');
  });

  it('KHÔNG có ĐẦU VÀO NÀO dẫn tới màn tạo khi đã có farm_id', () => {
    const states = ['idle', 'loading', 'loaded', 'failed'] as const;
    for (const loadState of states) {
      expect(resolveFarmDetailView({ farmId: 'f1', farm: null, loadState })).not.toBe('create');
      expect(resolveFarmDetailView({ farmId: 'f1', farm: FARM, loadState })).not.toBe('create');
    }
  });
});

// ---------------------------------------------------------------------------
// Hàm trên đúng KHÔNG có nghĩa là màn hình dùng nó
// ---------------------------------------------------------------------------
//
// Nhóm dưới đây đo MÃ NGUỒN, và nói rõ nó đo được gì: bắt được ca "ai đó tách hàm
// ra rồi để màn hình đi đường cũ", KHÔNG bắt được ca "màn gọi hàm nhưng truyền sai
// tham số". Dựng nguyên `FarmDetailScreen` (hơn 3.000 dòng, kéo theo bản đồ + máy
// ảnh + native) chỉ để đọc một nhánh render là việc khác hẳn về giá.
//
// Không có nhóm này thì cả tệp rơi đúng vào mẫu "bài kiểm xanh trên con đường
// không ai đi được": hàm thuần xanh 6/6, mà `AddFarmMode` vẫn hiện ra như cũ.
const SRC = readFileSync(join(__dirname, 'FarmDetailScreen.tsx'), 'utf8');

describe('màn hình thật sự đi qua resolveFarmDetailView', () => {
  it('có gọi hàm quyết định, kèm ĐỦ ba đầu vào', () => {
    expect(SRC).toContain(
      'resolveFarmDetailView({ farmId: farm_id, farm, loadState: farmLoadState })',
    );
  });

  it('`AddFarmMode` chỉ hiện dưới nhánh `create`', () => {
    const guard = SRC.indexOf("if (view === 'create') {");
    expect(guard).toBeGreaterThan(-1);
    // Lượt trả về `AddFarmMode` phải nằm SAU cổng đó, không đứng một mình.
    const render = SRC.indexOf('<AddFarmMode', guard);
    expect(render).toBeGreaterThan(guard);
    // Và KHÔNG còn lượt DỰNG `AddFarmMode` nào khác trong tệp. Đếm theo dạng thẻ
    // JSX đứng riêng một dòng, để chú thích có nhắc tên thẻ cũng không đội số lên —
    // phép đếm trần từng bắt trúng chính câu chú thích giải thích nó.
    expect(SRC.match(/^\s*<AddFarmMode$/gm)).toHaveLength(1);
  });

  it('cổng render cũ `if (!farm) {` đã biến mất khỏi phần render', () => {
    // Dòng cũ này là toàn bộ cái lỗi. Nó quay lại là lỗi quay lại.
    // (`if (!farm) return;` trong `handleAddTree` là chuyện khác — nó thoát sớm
    // khỏi một hàm xử lý, không đổi màn hình — nên phép khớp kèm dấu `{`.)
    expect(SRC).not.toContain('if (!farm) {');
  });

  it('trạng thái nạp được ghi lại thật, không suy từ `farm === null`', () => {
    expect(SRC).toContain("const [farmLoadState, setFarmLoadState] = useState<FarmLoadState>('idle')");
    expect(SRC).toContain("setFarmLoadState('loading')");
    expect(SRC).toContain("setFarmLoadState('failed')");
    expect(SRC).toContain("setFarmLoadState(action?.error ? 'failed' : 'loaded')");
  });
});
