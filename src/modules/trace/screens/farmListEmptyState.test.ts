/**
 * Bốn nhánh của màn danh sách vườn — có nhánh nào CHẠY được ở ca nó sinh ra để
 * xử không.
 *
 * Bài này tồn tại vì lỗi cũ KHÔNG phải "thiếu nhánh xử lý". Ba nhánh
 * (`loading` · `offline` · `error`) đã có sẵn trong mã và nhìn thì đúng; cái
 * thiếu là ĐIỀU KIỆN vào được chúng. Ở ca "máy vẫn có mạng nhưng máy chủ chết",
 * cả ba điều kiện đều im và màn rơi thẳng vào lời mời tạo vườn mới.
 *
 * Nên mỗi ca dưới đây kiểm một TÍN HIỆU, và ca then chốt là ca mà mọi tín hiệu
 * cũ đều im: `offline === false`, `loadError === null`, `farmCount === 0`.
 */
import { farmListState, showStaleNotice } from './farmListEmptyState';

const BASE = {
  farmCount: 0,
  matchedCount: 0,
  isLoading: false,
  offline: false,
  syncError: null as string | null,
  loadError: null as string | null,
};

describe('rỗng vì CHƯA CÓ ≠ rỗng vì KHÔNG HỎI ĐƯỢC', () => {
  it('hỏi được, máy chủ nói không có vườn nào → mời tạo vườn', () => {
    expect(farmListState({ ...BASE })).toBe('empty');
  });

  it('MÁY CÓ MẠNG mà máy chủ chết → màn LỖI, không phải màn mời tạo vườn', () => {
    // ⛔ Đây là ca đã lọt. Ba tín hiệu cũ đều im:
    //      offline   = false  (máy thật sự có mạng)
    //      loadError = null   (đường đọc SQLite cục bộ không hỏng)
    //      farmCount = 0      (đệm rỗng)
    //    Thứ duy nhất phân biệt được là `syncError`.
    expect(farmListState({ ...BASE, syncError: 'Máy chủ đang bận.' })).toBe('error');
  });

  it('hai ca trên KHÁC nhau — nếu bằng nhau thì bản vá không làm gì cả', () => {
    expect(farmListState({ ...BASE })).not.toBe(
      farmListState({ ...BASE, syncError: 'Máy chủ đang bận.' }),
    );
  });

  it('mất mạng thật thì nói mất mạng, không gộp vào lỗi chung', () => {
    // Hai câu dẫn tới hai việc khác nhau cho người dùng: bật lại mạng, hay chờ
    // máy chủ. Gộp làm một là đưa lời khuyên sai ở một trong hai ca.
    expect(farmListState({ ...BASE, offline: true })).toBe('offline');
    expect(farmListState({ ...BASE, offline: true, syncError: 'Máy chủ đang bận.' }))
      .toBe('offline');
  });

  it('lỗi đọc đệm cục bộ cũng vào màn lỗi', () => {
    expect(farmListState({ ...BASE, loadError: 'database is locked' })).toBe('error');
  });
});

describe('các nhánh còn lại không bị nhánh mới nuốt mất', () => {
  it('đang nạp lần đầu', () => {
    expect(farmListState({ ...BASE, isLoading: true })).toBe('loading');
  });

  it('đang nạp nhưng ĐÃ có vườn trong tay → bày danh sách, đừng che bằng skeleton', () => {
    expect(farmListState({ ...BASE, isLoading: true, farmCount: 3, matchedCount: 3 }))
      .toBe('list');
  });

  it('có vườn nhưng bộ lọc không khớp cái nào', () => {
    expect(farmListState({ ...BASE, farmCount: 5, matchedCount: 0 })).toBe('noResults');
  });

  it('lọc rỗng KHÁC chưa có vườn nào', () => {
    expect(farmListState({ ...BASE, farmCount: 5, matchedCount: 0 }))
      .not.toBe(farmListState({ ...BASE }));
  });

  it('có kết quả thì bày danh sách, kể cả khi đồng bộ hỏng', () => {
    expect(farmListState({ ...BASE, farmCount: 2, matchedCount: 2, syncError: 'hỏng' }))
      .toBe('list');
  });
});

describe('dải "bản lưu trong máy"', () => {
  it('CÓ dữ liệu và đồng bộ hỏng → bày dải', () => {
    expect(showStaleNotice({ farmCount: 2, syncError: 'Máy chủ đang bận.' })).toBe(true);
  });

  it('đồng bộ được thì KHÔNG bày — dải thường trực thì không ai đọc nữa', () => {
    expect(showStaleNotice({ farmCount: 2, syncError: null })).toBe(false);
  });

  it('không có dữ liệu thì KHÔNG bày — lúc đó cả màn đã là màn lỗi', () => {
    expect(showStaleNotice({ farmCount: 0, syncError: 'Máy chủ đang bận.' })).toBe(false);
  });
});

/**
 * Luật ở trên phải là luật MÀN ĐANG CHẠY, không phải một hàm đẹp nằm một mình.
 *
 * Tách một quyết định ra thành hàm thuần rồi để màn tự dựng lại chuỗi `if` của
 * nó là cách sinh ra một bộ bài kiểm xanh trên một đường không ai đi. Bài dưới
 * đo bằng thứ duy nhất đo được từ nguồn: màn có GỌI hàm đó không, và nó có còn
 * giữ bản chép tay nào không.
 */
describe('màn thật dùng ĐÚNG luật này', () => {
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const SRC = readFileSync(join(__dirname, 'FarmListScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const RUNTIME = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('gọi `farmListState` và `showStaleNotice`', () => {
    expect(RUNTIME).toContain('farmListState({');
    expect(RUNTIME).toContain('showStaleNotice({');
  });

  it('đọc `farmsSyncError` từ store — con trỏ đã THIẾU', () => {
    expect(RUNTIME).toContain('s.farm.farmsSyncError');
  });

  it('không còn chuỗi `if` chép tay quyết định lại chuyện đó', () => {
    // Cụ thể là điều kiện cũ đã rơi thẳng vào lời mời tạo vườn.
    expect(RUNTIME).not.toContain('farms.length === 0 && offline');
    expect(RUNTIME).not.toContain('farms.length === 0 && loadError');
  });
});

describe('màn chi tiết vườn đã theo cùng luật', () => {
  const { readFileSync } = require('fs') as typeof import('fs');
  const { join } = require('path') as typeof import('path');
  const SRC = readFileSync(join(__dirname, 'FarmDetailScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const RUNTIME = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('đọc `treesSyncError` và có nhánh lỗi RIÊNG trước nhánh "chưa có cây nào"', () => {
    expect(RUNTIME).toContain('state.farm.treesSyncError');
    expect(RUNTIME).toContain('trees.length === 0 && treesSyncError');
    // Thứ tự là phần quan trọng: nhánh lỗi phải đứng TRƯỚC, nếu không nó không
    // bao giờ chạy.
    const iLoi = RUNTIME.indexOf('trees.length === 0 && treesSyncError');
    const iRong = RUNTIME.indexOf('Chưa có cây nào trong vườn');
    expect(iLoi).toBeGreaterThan(-1);
    expect(iRong).toBeGreaterThan(iLoi);
  });

  it('nhánh lỗi có nút thử lại nối vào lượt đồng bộ thật', () => {
    expect(RUNTIME).toContain('onRetry={onRetryTrees}');
    expect(RUNTIME).toContain('onRetryTrees={() => { if (farm_id) dispatch(syncTreesFromBackend(farm_id)); }}');
  });
});
