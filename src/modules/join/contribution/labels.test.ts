// modules/join/contribution/labels.test.ts
//
// Kiểm chứng câu chữ tab Join — `Join/Join-Integration.md` §6.7 (quy tắc 4, 5 + ba câu
// bắt buộc) và `Join/LDC-Community.md` §6 (từ cấm, năm quy tắc câu trạng thái).
//
// Đây là lưới chặn đặt ĐÚNG CHỖ đã từng thủng: §6.7 nói thẳng rằng người duyệt cửa
// hàng đọc ảnh chụp màn, và một con số thiếu mẫu số là một con số bịa.

import {
  FORBIDDEN_DISPLAY_TERMS,
  NO_SPACE_STATE,
  REQUIRED_TAB_JOIN_SENTENCES,
  REWARD_NUMBERS_ALLOWED,
  UNMEASURED,
  WRITE_BUDGET_LABEL,
  findForbiddenTerms,
  formatBytes,
  formatCapacity,
  formatDeleting,
  formatPausedNotice,
  formatReleaseNotice,
  formatSliderNumbers,
} from './labels';
import { BYTES_PER_GB } from './quota';

const GB = BYTES_PER_GB;
const MB = 1_000_000;

describe('formatBytes', () => {
  it('GB dùng dấu phẩy thập phân kiểu Việt', () => {
    expect(formatBytes(180 * GB)).toBe('180 GB');
    expect(formatBytes(1.5 * GB)).toBe('1,5 GB');
  });

  it('dưới 1 GB thì đọc bằng MB', () => {
    expect(formatBytes(412 * MB)).toBe('412 MB');
    expect(formatBytes(0)).toBe('0 MB');
  });

  it('làm tròn XUỐNG — không khai nhiều hơn thứ máy thật sự cho', () => {
    expect(formatBytes(1.99 * GB)).toBe('1,9 GB');
  });

  it.each([null, Number.NaN, -1])('chưa đo được (%p) ⇒ nói "chưa đo được", không đoán số', value => {
    expect(formatBytes(value as number | null)).toBe(UNMEASURED);
  });
});

describe('formatCapacity — LDC §6 quy tắc 5: luôn kèm LOẠI và MẪU SỐ', () => {
  const line = formatCapacity(1 * GB, 24 * GB);

  it('có đủ ba phần: con số, loại, mẫu số', () => {
    expect(line).toContain('1 GB');
    expect(line).toContain('chỗ trống trong máy');
    expect(line).toContain('máy bạn còn 24 GB');
  });

  it('luôn phủ định 3G/4G — hiểu nhầm số một của người dùng Việt', () => {
    expect(line).toContain('không phải dung lượng 3G/4G');
  });

  it('chưa đo được chỗ trống thì vẫn phải phủ định 3G/4G, và vẫn không đoán', () => {
    const unmeasured = formatCapacity(1 * GB, null);
    expect(unmeasured).toContain('không phải dung lượng 3G/4G');
    expect(unmeasured).toContain(UNMEASURED);
  });
});

describe('formatSliderNumbers — §6.7 quy tắc 4: phải hiện ĐỦ BA con số', () => {
  const line = formatSliderNumbers({ maxShareBytes: 180 * GB, heldBytes: 0 });

  it('mức dành tối đa · đang giữ thật · tốc độ lấp', () => {
    expect(line).toContain('Dành tối đa 180 GB');
    expect(line).toContain('đang giữ 0 MB');
    expect(line).toContain('lấp dần, tối đa khoảng 1 GB mỗi tháng');
  });

  it('tốc độ lấp suy từ hằng số thật, không gõ tay lại', () => {
    expect(WRITE_BUDGET_LABEL).toBe('1 GB');
    expect(line).toContain(WRITE_BUDGET_LABEL);
  });

  it('thiếu số đo nào thì nói "chưa đo được" ở đúng chỗ đó, không bỏ trống', () => {
    const line2 = formatSliderNumbers({ maxShareBytes: 180 * GB, heldBytes: null });
    expect(line2).toContain(`đang giữ ${UNMEASURED}`);
  });
});

describe('câu trạng thái', () => {
  it('nhả chỗ thì NÓI RA, kèm số đã trả lại (LDC-2a điều 8)', () => {
    expect(formatReleaseNotice(1 * GB)).toBe(
      'Máy bạn sắp đầy — ứng dụng đã tự nhả 1 GB trả lại cho bạn.',
    );
  });

  it('tạm dừng phải nói KHI NÀO tự chạy lại (LDC §6 quy tắc 1)', () => {
    expect(formatPausedNotice('lúc 14:30 ngày mai')).toContain('Tự chạy lại lúc 14:30 ngày mai');
  });

  it('đang xoá thì hiện tiến trình về 0, KHÔNG hiện số cũ đứng yên (§6.8)', () => {
    expect(formatDeleting(232 * MB)).toBe('Đang xoá… 232 MB → 0 MB');
  });

  it('trần 0 thì không mời kéo thanh trượt (§6.7 quy tắc 5)', () => {
    expect(NO_SPACE_STATE).toBe('Máy bạn đang thiếu chỗ');
  });
});

describe('ba câu bắt buộc — §6.7, không được rút gọn', () => {
  it('có đủ ba câu', () => {
    expect(REQUIRED_TAB_JOIN_SENTENCES).toHaveLength(3);
  });

  it('có câu đối xứng — trả lời trước câu "vậy ảnh vườn của tôi nằm trong máy ai?"', () => {
    expect(REQUIRED_TAB_JOIN_SENTENCES[1]).toContain('dữ liệu của bạn cũng nằm trên máy người khác');
  });

  it('có câu bảo vệ app trước cửa hàng: chỉ trả dữ liệu khi app đang mở', () => {
    expect(REQUIRED_TAB_JOIN_SENTENCES[2]).toContain('khi bạn đang mở ứng dụng');
  });
});

describe('findForbiddenTerms — LDC §6 danh sách từ cấm', () => {
  it('bắt được từ cấm', () => {
    expect(findForbiddenTerms('Máy bạn đang giữ 3 mảnh')).toContain('mảnh');
    expect(findForbiddenTerms('Đang đồng bộ với node')).toEqual(
      expect.arrayContaining(['node', 'đồng bộ']),
    );
    expect(findForbiddenTerms('Dữ liệu được mã hoá đầu cuối')).toContain('mã hoá đầu cuối');
  });

  it('không kêu oan: "kỹ thuật" không phải "ký", "bậc thang" mới là "bậc"', () => {
    expect(findForbiddenTerms('Hỗ trợ kỹ thuật')).toEqual([]);
    expect(findForbiddenTerms('bậc thang')).toContain('bậc');
  });

  it('"mạng" và "đóng góp" KHÔNG còn cấm — §6.7 đổi chiều 2026-08-05', () => {
    expect(findForbiddenTerms('Đóng góp cho mạng LampNet')).toEqual([]);
    expect(FORBIDDEN_DISPLAY_TERMS).not.toContain('đóng góp');
    expect(FORBIDDEN_DISPLAY_TERMS).not.toContain('mạng lampnet');
  });

  it('MỌI chuỗi tệp này sinh ra đều sạch từ cấm', () => {
    const produced = [
      ...REQUIRED_TAB_JOIN_SENTENCES,
      NO_SPACE_STATE,
      UNMEASURED,
      formatCapacity(1 * GB, 24 * GB),
      formatSliderNumbers({ maxShareBytes: 180 * GB, heldBytes: 0 }),
      formatSliderNumbers({ maxShareBytes: null, heldBytes: null }),
      formatReleaseNotice(1 * GB),
      formatPausedNotice('lúc 14:30 ngày mai'),
      formatDeleting(232 * MB),
    ];
    for (const text of produced) {
      expect({ text, forbidden: findForbiddenTerms(text) }).toEqual({ text, forbidden: [] });
    }
  });
});

describe('con số thưởng', () => {
  it('còn CẤM cho tới khi §7 chốt đơn vị — lõi đang trả µLAMP và MAGIC, cộng CARP là ba', () => {
    expect(REWARD_NUMBERS_ALLOWED).toBe(false);
  });
});
