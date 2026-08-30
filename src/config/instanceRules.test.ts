/**
 * LUẬT SUPERAPP CÓ CHỖ CƯỠNG CHẾ, KHÔNG CHỈ CÓ TÀI LIỆU.
 *
 * `instances/LUAT-SUPERAPP.md` nói mọi app dựng từ kho này phải tuân gì. Một tài
 * liệu tự nó không chặn được ai — nên cổng thật nằm ở hai chỗ:
 *
 *   android/app/build.gradle       lúc DỰNG (nổ trước khi ra gói)
 *   tệp này                        lúc chạy bộ kiểm (chạy được không cần Java)
 *
 * Hai chỗ vì hai lý do khác nhau. Gradle chặn được thứ mà bộ kiểm không chặn
 * được: một bản dựng trên máy người khác, không qua CI. Bộ kiểm bắt được thứ mà
 * gradle không bắt kịp lúc: người sửa `instance.json` trên máy không có Android
 * SDK vẫn thấy đỏ ngay, thay vì biết sau 20 phút chờ CI.
 *
 * ── Nó KHÔNG đo được gì ─────────────────────────────────────────────────────
 *  · Bản dựng có chạy không. Đây là phép đối chiếu văn bản.
 *  · DID khai ở đây có TỒN TẠI trên PhoenixKey không. Không có mạng trong jest,
 *    và một DID đúng hình vẫn có thể là chuỗi bịa. Luật §1 hôm nay chỉ chặn được
 *    "không khai" và "khai trùng nhau", chưa chặn được "khai bừa".
 *  · Luật §6 (khoá ký) và §7 (chia phần tiền) — cả hai tự khai là CHƯA CƯỠNG CHẾ
 *    trong chính tệp luật. Đừng đọc tệp này rồi tưởng cả bảy mục đã được canh.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const GOC = join(__dirname, '..', '..');
const doc = (p: string) => readFileSync(join(GOC, p), 'utf8');

const THU_MUC_APP = join(GOC, 'instances');
const TEP_LUAT = 'instances/LUAT-SUPERAPP.md';
const GRADLE = doc('android/app/build.gradle');

interface KhaiApp {
  id: string;
  displayName: string;
  superapp?: { rulesVersion?: number; phoenixDid?: string | null };
  android: { applicationId: string };
  ios?: { bundleId?: string };
}

/** Đọc mọi `instances/<mã>/instance.json` — đúng nguồn mà gradle đọc. */
const cacApp: KhaiApp[] = readdirSync(THU_MUC_APP)
  .filter((ma) => existsSync(join(THU_MUC_APP, ma, 'instance.json')))
  .map((ma) => JSON.parse(readFileSync(join(THU_MUC_APP, ma, 'instance.json'), 'utf8')));

/** Phiên bản luật, đọc từ chính tệp luật — KHÔNG chép số vào đây. */
const doPhienBanLuat = (): number => {
  const m = doc(TEP_LUAT).match(/rulesVersion:\s*(\d+)/);
  if (!m) throw new Error(`${TEP_LUAT} thiếu dòng \`<!-- rulesVersion: N -->\``);
  return Number(m[1]);
};

describe('phép đọc trước đã — hỏng ở đây thì mọi bài dưới xanh giả', () => {
  it('đọc được đủ hai app từ instances/', () => {
    expect(cacApp.map((a) => a.id).sort()).toEqual(['aladin', 'checkfarm']);
  });

  it('tệp luật có mặt và khai được phiên bản', () => {
    expect(existsSync(join(GOC, TEP_LUAT))).toBe(true);
    expect(doPhienBanLuat()).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Luật §1 — mỗi app một danh tính PhoenixKey RIÊNG.
// ─────────────────────────────────────────────────────────────────────────────
describe('luật §1 — danh tính riêng', () => {
  // Hai app ra đời TRƯỚC luật này, và chưa có đường cấp DID cho một *instance*.
  // Danh sách chỉ được RÚT NGẮN. Thêm tên vào đây để một app mới đi lọt là gỡ
  // luôn cái cổng — bài kiểm ngay dưới canh đúng chuyện đó.
  const MIEN_TAM = ['aladin', 'checkfarm'];

  it.each(cacApp.map((a) => a.id))('%s khai khối `superapp`', (id) => {
    const app = cacApp.find((a) => a.id === id)!;
    expect(`${id}:${app.superapp !== undefined}`).toBe(`${id}:true`);
  });

  it.each(cacApp.map((a) => a.id))('%s khai đúng phiên bản luật hiện hành', (id) => {
    const app = cacApp.find((a) => a.id === id)!;
    expect(`${id}:${app.superapp?.rulesVersion}`).toBe(`${id}:${doPhienBanLuat()}`);
  });

  it('app KHÔNG nằm trong danh sách miễn thì phải có DID thật', () => {
    const thieu = cacApp
      .filter((a) => !MIEN_TAM.includes(a.id))
      .filter((a) => a.superapp?.phoenixDid == null)
      .map((a) => a.id);
    expect(thieu).toEqual([]);
  });

  it('DID nào đã khai thì phải đúng hình một DID', () => {
    const sai = cacApp
      .filter((a) => a.superapp?.phoenixDid != null)
      .filter((a) => !/^did:[a-z0-9]+:[A-Za-z0-9._:-]+$/.test(a.superapp!.phoenixDid!))
      .map((a) => `${a.id}=${a.superapp!.phoenixDid}`);
    expect(sai).toEqual([]);
  });

  it('không hai app nào dùng chung một DID', () => {
    const dids = cacApp.map((a) => a.superapp?.phoenixDid).filter((d): d is string => d != null);
    expect(new Set(dids).size).toBe(dids.length);
  });

  // Danh sách miễn là NỢ, không phải mặc định. Nó dài ra là luật §1 rỗng dần.
  it('danh sách miễn KHÔNG dài thêm — chỉ được rút ngắn', () => {
    expect(MIEN_TAM.length).toBeLessThanOrEqual(2);
    expect(MIEN_TAM.sort()).toEqual(['aladin', 'checkfarm']);
  });

  it('danh sách miễn ở gradle và ở đây là MỘT — lệch nhau là hai luật khác nhau', () => {
    const m = GRADLE.match(/def MIEN_TAM_DID = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const oGradle = m![1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();
    expect(oGradle).toEqual([...MIEN_TAM].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cổng lúc DỰNG còn nguyên.
//
// Mọi bài ở trên vẫn XANH sau khi ai đó xoá sạch khối kiểm trong gradle — và lúc
// đó một bản dựng trên máy cá nhân, không qua CI, sẽ ra gói bất chấp luật. Bốn
// phép dưới đọc thẳng `build.gradle` nên gỡ cổng là đỏ.
// ─────────────────────────────────────────────────────────────────────────────
describe('cổng lúc dựng còn nguyên', () => {
  it('gradle ĐỌC tệp luật, không chép cứng số phiên bản', () => {
    expect(GRADLE).toContain('LUAT-SUPERAPP.md');
    // Số bóc ra từ tệp luật. Chép cứng `LUAT_HIEN_TAI = 1` vào gradle là hai
    // nguồn khai luật, và nâng số ở tệp luật sẽ KHÔNG làm app nào đỏ.
    expect(GRADLE).toContain('tepLuat.text =~');
    expect(GRADLE).not.toMatch(/LUAT_HIEN_TAI\s*=\s*\d/);
  });

  it('gradle nổ khi thiếu khối `superapp`', () => {
    expect(GRADLE).toContain('khai.superapp == null');
    expect(GRADLE).toContain('thiếu khối `superapp`');
  });

  it('gradle nổ khi rulesVersion lệch', () => {
    expect(GRADLE).toContain('khai.superapp.rulesVersion != LUAT_HIEN_TAI');
  });

  it('gradle nổ khi app KHÔNG được miễn mà thiếu DID, và khi hai app trùng DID', () => {
    expect(GRADLE).toContain('MIEN_TAM_DID.contains(khai.id)');
    expect(GRADLE).toContain('Hai app dùng chung phoenixDid');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tệp luật phải NÓI THẬT về chỗ nó chưa canh được.
//
// Đây không phải phép kiểm chính tả. Lớp lỗi đắt nhất trong kho này là một nhãn
// nghe chắc mà không ai đo — người sau đọc rồi dựng quyết định lên trên nó. Nên
// hai mục tự khai "CHƯA CƯỠNG CHẾ" phải giữ nguyên chữ đó cho tới ngày có cổng
// thật; xoá chữ đó mà không dựng cổng là đỏ.
// ─────────────────────────────────────────────────────────────────────────────
describe('tệp luật không tự khen', () => {
  const LUAT = doc(TEP_LUAT);

  it('§6 khoá ký và §7 chia phần tiền vẫn ghi rõ là CHƯA CƯỠNG CHẾ', () => {
    expect((LUAT.match(/CHƯA CƯỠNG CHẾ/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('nói rõ cổng nằm ở đâu, để người đọc kiểm được chứ không phải tin', () => {
    expect(LUAT).toContain('android/app/build.gradle');
    expect(LUAT).toContain('src/config/instanceRules.test.ts');
  });
});
