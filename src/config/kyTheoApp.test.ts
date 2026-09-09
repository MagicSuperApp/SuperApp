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
  it('tìm được hai luồng phát hành AAB và bước nạp kho khoá', () => {
    expect(CODEMAGIC).toContain('android-aab-aladin:');
    expect(CODEMAGIC).toContain('android-aab-checkfarm:');
    expect(CODEMAGIC).toContain('Restore keystore from encrypted env');
  });
});

describe('khoá của hai pháp nhân KHÔNG chung một nhóm biến', () => {
  // Vì sao đo ở đây chứ không tin mắt: `groups:` là danh sách tĩnh, Codemagic nạp
  // MỌI nhóm được khai vào máy chạy trước khi bước đầu tiên chạy. Gộp hai nhóm cho
  // tiện thì lượt dựng Aladin mang theo khoá CheckFarm suốt cả lượt, và không có
  // bước nào để lộ ra điều đó — lượt dựng vẫn xanh, tệp ra vẫn đúng.
  //
  // Bài này ghim ĐIỀU KIỆN TÁCH, không ghim tên nhóm cho đẹp: nó đọc cấu trúc YAML
  // đã phân giải, nên một lần dán nhầm cả hai nhóm vào một luồng là đỏ ngay.
  const luong = (ten: string) => {
    const i = CODEMAGIC.indexOf(`\n  ${ten}:\n`);
    expect(i).toBeGreaterThan(-1);
    const sau = CODEMAGIC.slice(i + 1);
    const ket = sau.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
    return ket === -1 ? sau : sau.slice(0, ket + 1);
  };

  it('mỗi luồng chỉ khai nhóm khoá của CHÍNH app đó', () => {
    const aladin = luong('android-aab-aladin');
    const checkfarm = luong('android-aab-checkfarm');
    expect(aladin).toContain('- android_signing_aladin');
    expect(aladin).not.toContain('- android_signing_checkfarm');
    expect(checkfarm).toContain('- android_signing_checkfarm');
    expect(checkfarm).not.toContain('- android_signing_aladin');
  });

  it('KHÔNG còn nhóm gộp `android_signing` ở bất kỳ luồng nào', () => {
    // Tên cũ là tên hợp lệ với Codemagic, nên để sót một dòng là nạp lại đúng thứ
    // vừa tách ra — mà không lệnh nào báo.
    expect(maChay(CODEMAGIC)).not.toMatch(/- android_signing\s*(#|$)/m);
  });

  it('ba biến chọn app của luồng CheckFarm khớp nhau', () => {
    // `_CAP` là tên tác vụ Gradle. Gradle chỉ viết hoa CHỮ ĐẦU của tên flavor, nên
    // `CheckFarm` (hai chữ hoa) là một tác vụ không tồn tại — và lượt dựng đỏ SAU
    // khi đã nạp khoá thật vào máy.
    const checkfarm = luong('android-aab-checkfarm');
    expect(checkfarm).toContain('ANDROID_FLAVOR: checkfarm');
    expect(checkfarm).toContain('ANDROID_FLAVOR_CAP: Checkfarm');
    expect(checkfarm).toContain('APP_INSTANCE: checkfarm');
    expect(checkfarm).not.toContain('ANDROID_FLAVOR_CAP: CheckFarm');
  });

  it('hai luồng dùng CHUNG bộ bước qua neo YAML — không chép đôi', () => {
    // Chép đôi thì hai bản trôi khỏi nhau lặng lẽ: vá một bên, bên kia giữ nguyên
    // lỗi, và cả hai vẫn xanh.
    expect(CODEMAGIC).toContain('scripts: &android_aab_scripts');
    expect(CODEMAGIC).toContain('scripts: *android_aab_scripts');
    expect(CODEMAGIC).toContain('artifacts: &android_aab_artifacts');
    expect(CODEMAGIC).toContain('artifacts: *android_aab_artifacts');
  });
});

describe('tệp AAB ra mang tên app đang dựng', () => {
  it('không gõ cứng `aladin-release.aab`', () => {
    // Gõ cứng thì bản CheckFarm ra một tệp mang tên Aladin và lượt dựng báo xanh.
    // Cái sai chỉ lộ ở người cầm tệp đi nộp — muộn nhất có thể, và đắt nhất.
    const ma = maChay(CODEMAGIC);
    expect(ma).not.toContain('dist/aladin-release.aab');
    expect(ma).toContain('${ANDROID_FLAVOR}-release.aab');
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
