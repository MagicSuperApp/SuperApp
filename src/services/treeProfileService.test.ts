/**
 * Ghim BA TRẠNG THÁI của thân gửi lên cửa hồ sơ cây.
 *
 * Vì sao đáng một tệp riêng: chỗ hỏng ở đây không kêu. Gửi thừa một khoá thì máy
 * chủ ghi đè bằng đúng giá trị cũ — không ai thấy gì. Gửi THIẾU một khoá vừa bị
 * người dùng xoá thì máy chủ giữ nguyên giá trị cũ, trên máy thì mất, và hai bên
 * lệch nhau vĩnh viễn từ đó. Cả hai đường đều trả 200.
 *
 * Mỗi ca dưới đây phân biệt được HAI cực: có đúng một cách viết hàm làm nó xanh.
 */
import {
  buildTreeProfilePatch,
  buildTreeProfileBody,
  DECLARED_KEYS,
} from './treeProfileService';
import type { TreeMetadata } from '../modules/trace/types';

const base = (patch: Partial<TreeMetadata> = {}): TreeMetadata => ({
  updated_at: '2026-09-08T00:00:00.000Z',
  schema_version: 'tree_metadata/1.0',
  ...patch,
});

describe('buildTreeProfilePatch — vắng / null / giá trị', () => {
  it('trường KHÔNG đổi thì VẮNG MẶT, không gửi lại giá trị cũ', () => {
    const patch = buildTreeProfilePatch(
      base({ variety: 'ri6', age_years: 7 }),
      base({ variety: 'ri6', age_years: 7 }),
    );
    expect(Object.keys(patch)).toEqual([]);
    // Ca đối chứng: khoá vắng KHÁC khoá bằng undefined — `in` phân biệt được.
    expect('variety' in patch).toBe(false);
  });

  it('trường vừa bị XOÁ thì gửi `null`, không gửi chuỗi rỗng', () => {
    const patch = buildTreeProfilePatch(
      base({ notes: 'cây góc vườn' }),
      base({}), // màn nhập bỏ hẳn khoá khi ô trống
    );
    expect(patch.notes).toBeNull();
    expect(patch.notes).not.toBe('');
  });

  it('ô bị xoá mà màn nhập gửi chuỗi rỗng cũng thành `null` — `""` là 400', () => {
    const patch = buildTreeProfilePatch(
      base({ notes: 'cây góc vườn' }),
      base({ notes: '' }),
    );
    expect(patch.notes).toBeNull();
  });

  it('trường vừa ĐỔI thì gửi giá trị mới', () => {
    const patch = buildTreeProfilePatch(base({ age_years: 7 }), base({ age_years: 8 }));
    expect(patch.age_years).toBe(8);
  });

  it('cây chưa khai gì, nay khai lần đầu → chỉ gửi phần vừa khai', () => {
    const patch = buildTreeProfilePatch(undefined, base({ variety: 'ri6' }));
    expect(patch).toEqual({ variety: 'ri6' });
  });

  it('không sinh ra khoá nào ngoài sáu khoá NGƯỜI KHAI', () => {
    const patch = buildTreeProfilePatch(
      undefined,
      base({ variety: 'ri6', voice_memo_path: 'file:///a.m4a', voice_memo_duration_s: 3 }),
    );
    for (const key of Object.keys(patch)) {
      expect(DECLARED_KEYS).toContain(key as any);
    }
    // Ca đối chứng: danh sách sáu khoá không rỗng, nên vòng lặp trên có kiểm thật.
    expect(DECLARED_KEYS.length).toBe(6);
  });
});

describe('buildTreeProfileBody — ghi âm', () => {
  it('KHÔNG gửi đường tệp trên máy người dùng', () => {
    const body = buildTreeProfileBody(
      undefined,
      base({
        variety: 'ri6',
        voice_memo_path: 'file:///data/user/0/com.aladin/memo.m4a',
        voice_memo_duration_s: 12,
        voice_memo_recorded_at: '2026-09-08T01:00:00.000Z',
      }),
    );
    expect(body).not.toHaveProperty('voice_memo_path');
    expect(JSON.stringify(body)).not.toContain('file://');
    // Nhưng CÓ nhắc tới ghi âm — đó là điều kiện để máy chủ trả `voice_memo.reason`,
    // câu duy nhất nói thật với người dùng rằng đoạn ghi âm chưa lên máy chủ.
    expect(body).toHaveProperty('voice_memo_duration_s', 12);
    expect(body).toHaveProperty('voice_memo_recorded_at');
  });

  it('không có ghi âm thì KHÔNG nhắc tới ghi âm', () => {
    const body = buildTreeProfileBody(undefined, base({ variety: 'ri6' }));
    expect(Object.keys(body)).toEqual(['variety']);
  });
});
