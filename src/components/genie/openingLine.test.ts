/**
 * Câu mở của Genie.
 *
 * Bài đắt nhất ở đây là bài ĐỐI CHIẾU PLAYBOOK. Mọi bài còn lại kiểm chữ; bài đó
 * kiểm một lời hứa: lời mời nào cũng dẫn tới một màn mở được. Nó là bài duy nhất
 * sẽ đỏ vào cái ngày ai đó thêm một lời mời cho tính năng chưa dựng xong — và đó
 * đúng là ngày người dùng MỚI gặp một nút chết ở câu chào đầu tiên.
 */
import { GENIE_PLAYBOOKS } from '../../services/genie/playbooks.generated';
import { MODULE_IDS, type ModuleId } from '../../navigation/moduleIds';
import { INVITATIONS, buildOpeningLine } from './openingLine';

/** Hai cực thật, chép từ `instance.config.ts`. Aladin khai `'all'`. */
const ALADIN: readonly ModuleId[] = MODULE_IDS;
const CHECKFARM: readonly ModuleId[] = ['trace', 'join'];

describe('bảng lời mời — mỗi mục phải dẫn tới chỗ có thật', () => {
  it('🔴 CHỐT — mọi `playbookId` đều có trong sổ playbook', () => {
    const known = new Set(GENIE_PLAYBOOKS.map(p => p.id));
    const chet = INVITATIONS.filter(i => !known.has(i.playbookId));
    expect(chet.map(i => `${i.key} → ${i.playbookId}`)).toEqual([]);
  });

  it('ca đối chứng — phép đối chiếu trên có thật sự mở được sổ playbook', () => {
    // Không có ca này thì bài trên xanh y hệt khi sổ rỗng vì lỗi nhập tệp.
    expect(GENIE_PLAYBOOKS.length).toBeGreaterThan(0);
    expect(INVITATIONS.length).toBeGreaterThan(0);
  });

  it('mọi `needs` là một module có thật', () => {
    for (const i of INVITATIONS) expect(MODULE_IDS).toContain(i.needs);
  });

  it('khoá không trùng nhau', () => {
    expect(new Set(INVITATIONS.map(i => i.key)).size).toBe(INVITATIONS.length);
  });

  it('nhãn là một VIỆC, không phải một danh từ trơ — mỗi nhãn có ít nhất hai từ', () => {
    for (const i of INVITATIONS) expect(i.label.trim().split(/\s+/).length).toBeGreaterThan(1);
  });
});

describe('lọc theo app đang dựng', () => {
  /**
   * ⚠️ Bản ĐẦU của bài này chỉ gọi `buildOpeningLine` MỘT lần cho mỗi cực rồi soi
   * ba lời mời nhận được — và nó XANH khi gỡ hẳn bộ lọc module. Lý do: hàm chỉ
   * trả `HOW_MANY` mục, mà ba mục đầu bảng đều thuộc `trace`, tức module mà CẢ
   * HAI cực đều bật. Mục `work` không bao giờ nổi lên để mà bị bắt.
   *
   * Đo bằng đột biến 2026-09-19: thay `INVITATIONS.filter(…)` bằng
   * `INVITATIONS.slice()` → chỉ 1/16 bài đỏ, và bài mang dấu 🔴 này nằm trong số
   * xanh. Đúng ca `Forall §Kỷ luật phát ngôn` mục 6: *"đầu vào của ca này có phân
   * biệt được hai bên đột biến không?"* — lúc ấy là KHÔNG.
   *
   * Nên bài quét ĐỦ seed để mọi mục trong bảng đều có lượt nổi lên.
   */
  it('🔴 CHỐT — lời mời nào hiện ra thì module của nó phải đang bật', () => {
    for (const mods of [ALADIN, CHECKFARM]) {
      const thay = new Set<string>();
      for (let seed = 0; seed < INVITATIONS.length * 2; seed++) {
        const { invitations } = buildOpeningLine({ name: null, returning: true, modules: mods, seed });
        for (const i of invitations) {
          thay.add(i.key);
          expect(mods).toContain(i.needs);
        }
      }
      // Và phép quét phải THẬT SỰ chạm tới mọi mục hợp lệ — không thì nó lại chỉ
      // đang soi đúng ba mục đầu bảng bằng một vòng lặp dài hơn.
      const hopLe = INVITATIONS.filter(i => mods.includes(i.needs)).map(i => i.key);
      expect([...thay].sort()).toEqual(hopLe.sort());
    }
  });

  it('HAI CỰC phân biệt được — CheckFarm không có việc của `work`, Aladin thì có', () => {
    // Bài chỉ đọc MỘT cực thì xanh cả khi hàm bỏ qua `modules` hoàn toàn.
    const workKeys = INVITATIONS.filter(i => i.needs === 'work').map(i => i.key);
    expect(workKeys.length).toBeGreaterThan(0);

    const cfPool = INVITATIONS.filter(i => CHECKFARM.includes(i.needs)).map(i => i.key);
    const alPool = INVITATIONS.filter(i => ALADIN.includes(i.needs)).map(i => i.key);
    for (const k of workKeys) {
      expect(cfPool).not.toContain(k);
      expect(alPool).toContain(k);
    }
  });

  it('app không khai module nào — không mời việc nào, và KHÔNG quay về câu chung chung', () => {
    const r = buildOpeningLine({ name: 'Cường', returning: false, modules: [] });
    expect(r.invitations).toEqual([]);
    expect(r.greeting).not.toMatch(/giúp gì cho bạn/);
    expect(r.greeting).toContain('Cường');
  });
});

describe('câu mở', () => {
  it('có tên thì gọi tên', () => {
    const r = buildOpeningLine({ name: 'huucuong', returning: true, modules: ALADIN });
    expect(r.greeting).toContain('huucuong');
  });

  it('CHƯA có tên thì KHÔNG bịa một cái tên', () => {
    const r = buildOpeningLine({ name: null, returning: true, modules: ALADIN });
    expect(r.greeting).not.toMatch(/undefined|null|\{|\}/);
  });

  it('tên chỉ có khoảng trắng được coi như chưa có', () => {
    const r = buildOpeningLine({ name: '   ', returning: true, modules: ALADIN });
    expect(r.greeting).not.toMatch(/^\s*ơi/);
    expect(r.greeting).not.toMatch(/undefined/);
  });

  it('🔴 CHỐT — câu mở NÊU RA việc, không hỏi chung chung', () => {
    // Phép thử của chủ sở hữu: bà cụ 70 tuổi đọc xong có biết làm gì không. Câu
    // phải chứa ít nhất một cụm việc lấy từ chính bảng lời mời.
    for (const returning of [true, false]) {
      const r = buildOpeningLine({ name: null, returning, modules: CHECKFARM });
      expect(r.invitations.length).toBeGreaterThan(0);
      expect(r.greeting).toContain(r.invitations[0].phrase);
    }
  });

  it('người MỚI và người CŨ nhận hai câu khác nhau', () => {
    const moi = buildOpeningLine({ name: 'Cường', returning: false, modules: ALADIN });
    const cu = buildOpeningLine({ name: 'Cường', returning: true, modules: ALADIN });
    expect(moi.greeting).not.toBe(cu.greeting);
  });
});

describe('xoay vòng — mở hai lần liền không ra cùng một bộ', () => {
  it('seed kề nhau cho bộ khác nhau khi bảng còn dư mục', () => {
    const mods = ALADIN;
    const pool = INVITATIONS.filter(i => mods.includes(i.needs));
    expect(pool.length).toBeGreaterThan(3); // tiền đề của bài này

    const bo = (seed: number) =>
      buildOpeningLine({ name: null, returning: true, modules: mods, seed })
        .invitations.map(i => i.key).join(',');
    expect(bo(0)).not.toBe(bo(1));
  });

  it('KHÔNG seed thì tất định — hai lần gọi ra đúng một kết quả', () => {
    const goi = () => buildOpeningLine({ name: 'A', returning: true, modules: ALADIN });
    expect(goi()).toEqual(goi());
  });

  it('seed âm hay rất lớn vẫn ra bộ hợp lệ, không rơi ra ngoài bảng', () => {
    for (const seed of [-7, -1, 0, 999999]) {
      const r = buildOpeningLine({ name: null, returning: true, modules: ALADIN, seed });
      expect(r.invitations.length).toBeGreaterThan(0);
      for (const i of r.invitations) expect(INVITATIONS).toContain(i);
      expect(new Set(r.invitations.map(i => i.key)).size).toBe(r.invitations.length);
    }
  });
});
