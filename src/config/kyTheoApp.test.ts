/**
 * KÝ THEO APP — luồng phát hành không được gõ cứng tên app nào vào phần KÝ.
 *
 * Vì sao có bài này: trước 2026-08-31, `codemagic.yaml` đã tham số hoá bước DỰNG
 * theo flavor (`bundle${ANDROID_FLAVOR_CAP}Release`) nhưng bước KÝ vẫn gõ cứng
 * `ALADIN_UPLOAD_*`. Đặt `ANDROID_FLAVOR=checkfarm` thì máy dựng CheckFarm rồi
 * nạp khoá Aladin — và lỗi báo ra nói về khoá, không nói về chỗ hỏng thật.
 *
 * Hỏng nửa vời kiểu đó không tự lộ: bản Aladin vẫn chạy đúng, nên mọi lượt dựng
 * hằng ngày vẫn xanh. Nó chỉ lộ vào lần đầu ai đó dựng app thứ hai — tức đúng lúc
 * người ta ít ngờ nhất.
 *
 * ── Bài này KHÔNG đo gì ──────────────────────────────────────────────────────
 * Không đo lượt dựng có chạy được không. Đây là phép đối chiếu văn bản; lượt chạy
 * thật trên Codemagic mới là phép đo cuối, và chưa ai chạy nó cho CheckFarm.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const GOC = join(__dirname, '..', '..');
const doc = (p: string) => readFileSync(join(GOC, p), 'utf8');

const CODEMAGIC = doc('codemagic.yaml');

/** Chỉ giữ MÃ CHẠY: bỏ mọi dòng chú thích YAML. */
const maChay = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');

describe('phép đọc trước đã — hỏng ở đây thì bài dưới xanh giả', () => {
  it('tìm được workflow phát hành AAB và bước nạp kho khoá', () => {
    expect(CODEMAGIC).toContain('android-appstore-aab:');
    expect(CODEMAGIC).toContain('Restore keystore from encrypted env');
  });
});

describe('luồng phát hành Android ký theo ĐÚNG app đang dựng', () => {
  const ma = maChay(CODEMAGIC);

  it('phần ký KHÔNG gõ cứng tên app nào', () => {
    // Đo trên mã chạy, không đo chú thích: chú thích CÓ QUYỀN nhắc tên
    // `ALADIN_UPLOAD_*` để giải thích lịch sử, và đó là chỗ nhắc đúng.
    //
    // Bắt theo TIỀN TỐ chứ không liệt kê bốn hậu tố. Liệt kê thì một biến thứ
    // năm — hoặc cùng bốn cái đó viết thiếu `_B64` — đi lọt, và bài kiểm vẫn
    // xanh vì nó chỉ biết đúng những tên người viết nó nghĩ ra.
    const goCung = ma.match(/[A-Z]+_UPLOAD_[A-Z_]+/g) ?? [];
    const tenApp = goCung.filter((t) => !t.startsWith('$'));
    expect(tenApp.filter((t) => /^(ALADIN|CHECKFARM|ORILIFE)_UPLOAD_/.test(t))).toEqual([]);
  });

  it('tên biến khoá SUY từ ANDROID_FLAVOR', () => {
    expect(ma).toContain("TIEN_TO=$(echo \"$ANDROID_FLAVOR\" | tr '[:lower:]' '[:upper:]')");
    expect(ma).toContain('${TIEN_TO}_UPLOAD_STORE_FILE=keySigning.bin');
  });

  it('bước đối chiếu gradle.properties cũng theo app, không theo hằng', () => {
    // Nếu bước này tìm chuỗi cố định thì nó chạy NGƯỢC: bản CheckFarm ký đúng
    // khoá của nó sẽ trượt, còn bản CheckFarm ký nhầm khoá Aladin lại qua.
    const i = ma.indexOf('Verify gradle.properties signing config');
    expect(i).toBeGreaterThan(-1);
    const than = ma.slice(i, i + 700);
    expect(than).toContain('${TIEN_TO}_UPLOAD_STORE_FILE');
    expect(than).not.toContain('ALADIN_UPLOAD_STORE_FILE');
  });

  it('mỗi bước tự suy lại tiền tố — biến không sống qua khối script', () => {
    // Mỗi `script:` của Codemagic là một shell riêng. Suy một lần rồi dùng ở bước
    // sau thì `TIEN_TO` rỗng, và `${TIEN_TO}_UPLOAD_...` thành `_UPLOAD_...` —
    // một tên biến hợp lệ, rỗng, không ai báo.
    const soLanSuy = (ma.match(/TIEN_TO=\$\(echo "\$ANDROID_FLAVOR"/g) || []).length;
    expect(soLanSuy).toBeGreaterThanOrEqual(3);
  });
});

describe('cổng CI dựng lại khi tệp khai app đổi', () => {
  const APK = doc('.github/workflows/debug-apk.yml');

  it('cả hai bộ lọc paths đều có instances/**', () => {
    // `push` và `pull_request` khai HAI danh sách riêng. Có ở một bên là đủ để
    // tin nhầm rằng đã phủ.
    expect((APK.match(/- 'instances\/\*\*'/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('KHÔNG còn câu nói hai sự kiện dùng chung một bộ lọc', () => {
    expect(APK).not.toContain('khai một lần ở trên là áp cho cả hai sự kiện)');
  });
});
