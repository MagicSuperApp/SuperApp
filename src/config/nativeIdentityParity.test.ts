/**
 * BẤT BIẾN TẦNG NATIVE — bịt đúng lỗ mà `instanceParity.test.ts` tự khai là
 * không đo được:
 *
 *   > **Tầng native**: tên app, biểu tượng, mã gói, scheme. Không mã JS nào đo được.
 *
 * Không mã JS nào đo được **giá trị lúc chạy**, đúng. Nhưng đo được **sự khớp
 * nhau giữa các tệp khai báo** — và đó mới là chỗ hai app trôi khỏi nhau.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────────
 * Danh tính một app nằm ở BỐN tệp khác nhau, ba ngôn ngữ khác nhau:
 *
 *     instances/<mã>/instance.json      applicationId, displayName (JSON — NGUỒN)
 *     src/config/instance.config.ts     instanceId, displayName    (TypeScript)
 *     ios/.../project.pbxproj           PRODUCT_BUNDLE_IDENTIFIER  (định dạng riêng)
 *     codemagic.yaml                    BUNDLE_ID, ANDROID_FLAVOR  (YAML)
 *
 * Không trình biên dịch nào canh bốn tệp đó khớp nhau. Sửa một chỗ quên ba chỗ
 * thì bản dựng vẫn XANH — nó ra một gói mang vỏ app này và chữ của app kia, và
 * chỗ đó chỉ lộ khi có người mở app ra nhìn.
 *
 * ⚠ ĐỔI 2026-08-28: `android/app/build.gradle` KHÔNG còn khai flavor bằng tay —
 * nó đọc `instances/<mã>/instance.json`. Nên bài kiểm này cũng đọc thẳng nguồn
 * đó thay vì bóc gradle bằng biểu thức. Bóc gradle giờ chỉ còn để canh rằng
 * gradle vẫn ĐỌC thư mục, chứ không có ai lén viết tay flavor trở lại.
 *
 * ── Nó vẫn KHÔNG đo được gì ─────────────────────────────────────────────────
 *  · Bản dựng có chạy không. Đây là phép đối chiếu văn bản, không phải lượt dựng.
 *  · Biểu tượng có đúng không. Ảnh thì jest không nhìn.
 *  · Khoá ký thuộc pháp nhân nào. Khoá không nằm trong kho.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { INSTANCES } from './instance.config';

const GOC = join(__dirname, '..', '..');
/**
 * Đọc một tệp khai báo, CHUẨN HOÁ xuống dòng về LF.
 *
 * Không phải chuyện thẩm mỹ. Kho này checkout trên Windows với `core.autocrlf`
 * bật, nên mọi tệp trong cây làm việc mang CRLF. Còn các khẳng định dưới đây
 * viết bằng LF — có biểu thức đòi một dấu xuống dòng ở giữa, có chỗ tách dòng
 * rồi so từng dòng một. Chưa chuẩn hoá thì ba bài đỏ trên máy Windows và xanh
 * trên CI Linux, với CÙNG một cây mã.
 *
 * Loại đỏ đó tệ hơn một bài đỏ thật: nó dạy người ta rằng đỏ ở máy mình là
 * bình thường, và bài đỏ THẬT tiếp theo sẽ bị bỏ qua cùng đám ấy.
 */
const doc = (p: string) => readFileSync(join(GOC, p), 'utf8').replace(/\r\n/g, '\n');

const GRADLE = doc('android/app/build.gradle');
const CODEMAGIC = doc('codemagic.yaml');
const PBXPROJ = doc('ios/SuperApp.xcodeproj/project.pbxproj');
const INFO_PLIST = doc('ios/SuperApp/Info.plist');

const THU_MUC_APP = join(GOC, 'instances');

/** Đọc `instances/<mã>/instance.json` — đúng nguồn mà gradle đọc. */
function docFlavors(): Record<string, { applicationId: string; appName: string }> {
  const ra: Record<string, { applicationId: string; appName: string }> = {};
  for (const ma of readdirSync(THU_MUC_APP)) {
    const tep = join(THU_MUC_APP, ma, 'instance.json');
    if (!existsSync(tep)) continue;
    const khai = JSON.parse(readFileSync(tep, 'utf8'));
    ra[khai.id] = { applicationId: khai.android.applicationId, appName: khai.displayName };
  }
  return ra;
}

const FLAVORS = docFlavors();

describe('mỗi instance JS có một flavor Android tương ứng', () => {
  it('đọc được app từ instances/ (phép đọc hỏng thì mọi bài dưới xanh giả)', () => {
    expect(Object.keys(FLAVORS).sort()).toEqual(['aladin', 'checkfarm']);
  });

  // Nếu ai đó viết tay `aladin { ... }` trở lại vào gradle thì có HAI nguồn khai
  // flavor, và bài kiểm này đọc nguồn kia — tức mọi bài dưới đo nhầm tệp.
  it('gradle ĐỌC thư mục, không ai viết tay flavor trở lại', () => {
    expect(GRADLE).toContain('instance.json');
    expect(GRADLE).toContain('productFlavors');
    expect(GRADLE).not.toMatch(/productFlavors\s*\{\s*\n\s*[a-z]+\s*\{\s*\n\s*dimension/);
  });

  it('không instance nào thiếu flavor', () => {
    const thieu = Object.keys(INSTANCES).filter((id) => !FLAVORS[id]);
    expect(thieu).toEqual([]);
  });

  it('không flavor nào thừa ra ngoài bảng instance', () => {
    const thua = Object.keys(FLAVORS).filter((f) => !INSTANCES[f]);
    expect(thua).toEqual([]);
  });

  it('tên hiện dưới biểu tượng khớp displayName của instance', () => {
    for (const [id, inst] of Object.entries(INSTANCES)) {
      expect(`${id}:${FLAVORS[id]?.appName}`).toBe(`${id}:${inst.displayName}`);
    }
  });

  it('hai app KHÔNG dùng chung một mã gói', () => {
    const ids = Object.values(FLAVORS).map((f) => f.applicationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mã gói CheckFarm đúng cái đã chốt và không đổi được sau lần tải đầu', () => {
    expect(FLAVORS.checkfarm.applicationId).toBe('com.checkfarm.app');
  });

  it('defaultConfig KHÔNG còn applicationId — không có đường rơi câm', () => {
    // Còn một giá trị ở `defaultConfig` thì flavor nào quên khai sẽ lặng lẽ
    // nhận mã gói của app kia.
    const dc = GRADLE.match(/defaultConfig\s*\{([\s\S]*?)\n    \}/);
    expect(dc).not.toBeNull();
    expect(dc![1]).not.toMatch(/^\s*applicationId\s/m);
  });

  it('strings.xml KHÔNG khai lại app_name (trùng resource là đỏ lúc dựng)', () => {
    expect(doc('android/app/src/main/res/values/strings.xml')).not.toMatch(
      /<string name="app_name">/,
    );
  });
});

describe('iOS — danh tính đến từ biến dựng, không ghi cứng', () => {
  it('CFBundleDisplayName là biến, không phải chuỗi cứng', () => {
    expect(INFO_PLIST).toContain('<string>$(APP_DISPLAY_NAME)</string>');
    expect(INFO_PLIST).not.toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>Aladin<\/string>/);
  });

  it('project.pbxproj khai APP_DISPLAY_NAME cho CẢ HAI cấu hình', () => {
    expect((PBXPROJ.match(/APP_DISPLAY_NAME = /g) || []).length).toBe(2);
    expect((PBXPROJ.match(/PRODUCT_BUNDLE_IDENTIFIER = /g) || []).length).toBe(2);
  });
});

describe('codemagic — không luồng nào dựng vỏ app này với chữ app kia', () => {
  it('mọi ANDROID_FLAVOR khai trong tệp đều là flavor có thật', () => {
    const khai = [...CODEMAGIC.matchAll(/^\s*ANDROID_FLAVOR:\s*(\S+)/gm)].map((m) => m[1]);
    expect(khai.length).toBeGreaterThan(0);
    expect(khai.filter((f) => !FLAVORS[f])).toEqual([]);
  });

  it('mọi APP_INSTANCE khai trong tệp đều có trong bảng INSTANCES', () => {
    const khai = [...CODEMAGIC.matchAll(/^\s*APP_INSTANCE:\s*(\S+)/gm)].map((m) => m[1]);
    expect(khai.length).toBeGreaterThan(0);
    expect(khai.filter((i) => !INSTANCES[i])).toEqual([]);
  });

  it('ANDROID_FLAVOR và ANDROID_FLAVOR_CAP luôn đi thành cặp khớp nhau', () => {
    const hoa = (s: string) => s[0].toUpperCase() + s.slice(1);
    const cap = [...CODEMAGIC.matchAll(/ANDROID_FLAVOR:\s*(\S+)\n\s*ANDROID_FLAVOR_CAP:\s*(\S+)/g)];
    expect(cap.length).toBeGreaterThan(0);
    for (const m of cap) expect(m[2]).toBe(hoa(m[1]));
  });

  it('mọi BUNDLE_ID khai trong tệp đều là mã gói của một app có thật', () => {
    const hopLe = new Set([
      ...Object.values(FLAVORS).map((f) => f.applicationId),
      'vn.aladinapp', // mã gói iOS của Aladin — khác Android, đã lên cửa hàng từ v1.0
    ]);
    const khai = [...CODEMAGIC.matchAll(/^\s*BUNDLE_ID:\s*(\S+)/gm)].map((m) => m[1]);
    expect(khai.length).toBeGreaterThan(0);
    expect(khai.filter((b) => !hopLe.has(b))).toEqual([]);
  });

  it('mọi APP_DISPLAY_NAME khai trong tệp đều là displayName của một app có thật', () => {
    // Chiều `BUNDLE_ID` đã được bài ngay trên canh. Chiều `APP_DISPLAY_NAME` thì
    // KHÔNG — đo được: đổi `APP_DISPLAY_NAME: Aladin` thành một chuỗi bất kỳ và
    // chạy trọn bộ kiểm thì 98/98 vẫn xanh. Chỗ duy nhất bắt được là bước "Soát
    // danh tính app iOS" trong `codemagic.yaml`, và bước đó chỉ chạy trên runner
    // macOS tính tiền, sau khi PR đã merge. Bài này kéo phép bắt về tầng PR.
    const hopLe = new Set(Object.values(FLAVORS).map((f) => f.appName));
    const khai = [...CODEMAGIC.matchAll(/^\s*APP_DISPLAY_NAME:\s*(.+?)\s*$/gm)].map((m) => m[1]);
    expect(khai.length).toBeGreaterThan(0);
    expect(khai.filter((n) => !hopLe.has(n))).toEqual([]);
  });

  it('BUNDLE_ID và APP_DISPLAY_NAME trong cùng một luồng phải cùng nói về MỘT app', () => {
    // Hai bài trên soi từng trường riêng, nên `BUNDLE_ID: vn.aladinapp` đứng cạnh
    // `APP_DISPLAY_NAME: CheckFarm` vẫn qua được cả hai — mỗi giá trị đều "của một
    // app có thật", chỉ là hai app khác nhau. Đó đúng là hình dạng của bản dựng
    // mang vỏ app này với chữ app kia, tức thứ khối `describe` này mang tên.
    // Đọc thẳng `instance.json` chứ không dùng `INSTANCES` (bảng TypeScript, không
    // mang mã gói) hay `FLAVORS` (chỉ mang mã gói Android). Mã gói iOS của Aladin
    // KHÁC mã Android (`vn.aladinapp` vs `com.aladincontract.company`), nên bảng
    // thiếu một chiều là bài này đo hụt đúng app đang chạy.
    const tenTheoBundle: Record<string, string> = {};
    for (const ma of readdirSync(THU_MUC_APP)) {
      const tep = join(THU_MUC_APP, ma, 'instance.json');
      if (!existsSync(tep)) continue;
      const khai = JSON.parse(readFileSync(tep, 'utf8'));
      if (khai.ios?.bundleId) tenTheoBundle[khai.ios.bundleId] = khai.displayName;
      tenTheoBundle[khai.android.applicationId] = khai.displayName;
    }
    // Ca đối chứng: bảng dựng được và có cả hai chiều mã gói. Bảng rỗng thì vòng
    // lặp dưới không chạy lần nào và bài này xanh mà không đo gì.
    expect(Object.keys(tenTheoBundle).length).toBeGreaterThanOrEqual(3);
    const cap = [...CODEMAGIC.matchAll(/BUNDLE_ID:\s*(\S+)\n\s*APP_DISPLAY_NAME:\s*(.+?)\s*$/gm)];
    expect(cap.length).toBeGreaterThan(0);
    for (const m of cap) expect(`${m[1]} → ${m[2]}`).toBe(`${m[1]} → ${tenTheoBundle[m[1]]}`);
  });

  it('lệnh gradle luôn gọi flavor tường minh', () => {
    // `assembleDebug` / `bundleRelease` (không flavor) dựng CẢ HAI app.
    expect(CODEMAGIC).not.toMatch(/gradlew\s+assembleDebug\b/);
    expect(CODEMAGIC).not.toMatch(/gradlew\s+bundleRelease\b/);
  });

  it('không chỗ nào dò tệp ra bằng đường dẫn KHÔNG có flavor', () => {
    // Đường cũ `outputs/apk/debug` nay không tồn tại; `outputs/apk` kèm head -1
    // thì nhặt gói của app đứng trước theo thứ tự chữ cái.
    expect(CODEMAGIC).not.toContain('outputs/bundle/release');
    expect(CODEMAGIC).not.toMatch(/find\s+android\/app\/build\/outputs\/apk\s/);
  });
});

describe('cổng CI GitHub cũng gọi flavor tường minh', () => {
  it('debug-apk.yml', () => {
    const y = doc('.github/workflows/debug-apk.yml');
    expect(y).not.toMatch(/gradlew\s+assembleDebug\b/);
    expect(y).toContain('assembleAladinDebug');
    expect(y).toContain('outputs/apk/aladin/debug');
  });

  it('android-aab.yml', () => {
    const y = doc('.github/workflows/android-aab.yml');
    expect(y).not.toMatch(/gradlew\s+bundleRelease\b/);
    // Từ 2026-08-31 luồng này dựng ĐƯỢC app thứ hai, nên flavor không còn là
    // một chuỗi gõ cứng mà là biến suy từ app đang dựng. Yêu cầu gốc giữ
    // nguyên — task và đường tệp phải TƯỜNG MINH theo flavor, không bao giờ là
    // `bundleRelease` trần. Chi tiết đối chiếu với `instances/`: `aabTheoApp.test.ts`.
    expect(y).toMatch(/gradlew "bundle\$\{CAP\}Release"/);
    expect(y).toContain('bundle/${FLAVOR}Release');
  });
});

describe('Firebase — có điều kiện theo app, và cái bẫy đi kèm', () => {
  const RIENG = 'android/app/src/checkfarm/google-services.json';
  const CUA_ALADIN = 'android/app/src/aladin/google-services.json';

  // Gốc `app/` nằm trong đường tìm của MỌI variant. Để tệp Aladin ở đó thì dựng
  // CheckFarm sẽ nhặt đúng tệp ấy rồi đỏ vì sai gói — nên nó phải nằm trong
  // đường tìm RIÊNG của flavor aladin.
  it('tệp Firebase của Aladin nằm trong src/aladin, KHÔNG ở gốc app', () => {
    expect(existsSync(join(GOC, CUA_ALADIN))).toBe(true);
    expect(existsSync(join(GOC, 'android/app/google-services.json'))).toBe(false);
  });

  it('tệp Firebase của Aladin chỉ khai gói Aladin', () => {
    const j = JSON.parse(doc(CUA_ALADIN));
    const goi = j.client.map((c: any) => c.client_info.android_client_info.package_name);
    expect(goi).toContain(FLAVORS.aladin.applicationId);
    // Khai thêm gói CheckFarm vào ĐÂY là sai chỗ: nó trỏ thông báo đẩy và số
    // liệu của CheckFarm về dự án Firebase của pháp nhân Aladin.
    expect(goi).not.toContain(FLAVORS.checkfarm.applicationId);
  });

  it('gradle tắt bước Firebase cho flavor không có tệp cấu hình của chính nó', () => {
    const g = doc('android/app/build.gradle');
    expect(g).toContain('android.applicationVariants.all');
    expect(g).toContain('src/${flavor}/google-services.json');
    expect(g).toContain('GoogleServices');
    expect(g).toContain('enabled = false');
  });

  it('CheckFarm gỡ FirebaseInitProvider — không có gì tự khởi Firebase', () => {
    const m = doc('android/app/src/checkfarm/AndroidManifest.xml');
    expect(m).toContain('com.google.firebase.provider.FirebaseInitProvider');
    expect(m).toContain('tools:node="remove"');
  });

  // Hai nửa phải đi cùng nhau. Có tệp cấu hình mà vẫn gỡ provider thì Firebase
  // im lặng không chạy — dựng xanh, cài được, và tin đẩy không bao giờ tới.
  it('có tệp cấu hình CheckFarm thì phải BỎ manifest gỡ provider', () => {
    const coCauHinh = existsSync(join(GOC, RIENG));
    const coManifest = existsSync(join(GOC, 'android/app/src/checkfarm/AndroidManifest.xml'));
    if (coCauHinh) expect(coManifest).toBe(false);
  });

  it('nếu đã có tệp Firebase riêng thì nó phải khai ĐÚNG gói CheckFarm', () => {
    // Bẫy nguy hiểm nhất: chép tệp của Aladin sang thư mục checkfarm. Mọi thứ
    // dựng được, chạy được, và dữ liệu của CheckFarm chảy vào nhà người khác.
    if (!existsSync(join(GOC, RIENG))) return;
    const j = JSON.parse(doc(RIENG));
    const goi = j.client.map((c: any) => c.client_info.android_client_info.package_name);
    expect(goi).toContain(FLAVORS.checkfarm.applicationId);
    expect(goi).not.toContain(FLAVORS.aladin.applicationId);
  });

  // Lời khẳng định "CheckFarm dựng được khi KHÔNG có Firebase" chỉ đáng tin nếu
  // có chỗ dựng thật. Không có bước này thì nó là lời hứa, không phải phép đo.
  it('CI dựng THẬT bản CheckFarm', () => {
    expect(doc('.github/workflows/debug-apk.yml')).toContain('assembleCheckfarmDebug');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Biểu tượng — thứ trước đây bài kiểm này tự khai là "ảnh thì jest không nhìn".
//
// Vẫn đúng: jest không nói được biểu tượng ĐẸP hay ĐÚNG nhận diện. Nhưng nói
// được nó CÓ MẶT và ĐỦ MẬT ĐỘ — và đó mới là chỗ hỏng câm. Thiếu một mật độ thì
// Android tự phóng to ảnh mật độ khác: biểu tượng rỗ, không ai đỏ.
// ─────────────────────────────────────────────────────────────────────────────
describe('mỗi app tự mang bộ biểu tượng của mình', () => {
  const MAT_DO = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  const TEP = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

  it.each(Object.keys(FLAVORS))('%s có đủ 5 mật độ × 3 tệp', (ma) => {
    const thieu: string[] = [];
    for (const md of MAT_DO) {
      for (const t of TEP) {
        const d = join(THU_MUC_APP, ma, 'android/res', `mipmap-${md}`, t);
        if (!existsSync(d)) thieu.push(`mipmap-${md}/${t}`);
      }
    }
    expect(thieu).toEqual([]);
  });

  it.each(Object.keys(FLAVORS))('%s có lớp thích ứng + màu nền', (ma) => {
    const res = join(THU_MUC_APP, ma, 'android/res');
    expect(existsSync(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'))).toBe(true);
    expect(existsSync(join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'))).toBe(true);
    expect(existsSync(join(res, 'values/ic_launcher_background.xml'))).toBe(true);
  });

  it.each(Object.keys(FLAVORS))('%s giữ ảnh gốc 1024 để sinh lại được', (ma) => {
    expect(existsSync(join(THU_MUC_APP, ma, 'brand/icon-1024.png'))).toBe(true);
  });

  // Chỗ này mới là cái bẫy thật. Còn một bộ `ic_launcher` trong `src/main/res`
  // thì app mới quên biểu tượng KHÔNG đỏ — nó lặng lẽ mượn biểu tượng của app
  // đứng trước rồi đi thẳng lên cửa hàng.
  it('src/main/res KHÔNG còn bộ biểu tượng dùng chung', () => {
    const con: string[] = [];
    for (const md of [...MAT_DO, 'anydpi-v26']) {
      for (const t of [...TEP, 'ic_launcher.xml', 'ic_launcher_round.xml']) {
        const d = join(GOC, 'android/app/src/main/res', `mipmap-${md}`, t);
        if (existsSync(d)) con.push(`mipmap-${md}/${t}`);
      }
    }
    expect(con).toEqual([]);
    expect(existsSync(join(GOC, 'android/app/src/main/res/values/ic_launcher_background.xml'))).toBe(false);
  });

  it('màu nền biểu tượng khớp instance.json', () => {
    for (const ma of Object.keys(FLAVORS)) {
      const khai = JSON.parse(readFileSync(join(THU_MUC_APP, ma, 'instance.json'), 'utf8'));
      const xml = readFileSync(join(THU_MUC_APP, ma, 'android/res/values/ic_launcher_background.xml'), 'utf8');
      expect(`${ma}:${xml.includes(khai.android.iconBackground)}`).toBe(`${ma}:true`);
    }
  });

  it('bộ sinh biểu tượng có mặt — người thêm app không phải tự dựng', () => {
    expect(existsSync(join(GOC, 'scripts/sinh-bieu-tuong.py'))).toBe(true);
    expect(existsSync(join(GOC, 'instances/README.md'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KHOÁ KÝ — mỗi app một khoá, và không app nào mượn được khoá của app khác.
//
// Vì sao đây là nhóm bài kiểm đáng có: hỏng ở đây KHÔNG SỬA ĐƯỢC SAU. Khoá tải
// lên gắn vĩnh viễn với mục ứng dụng trên Google Play kể từ bản đầu tiên. Một
// bản CheckFarm trót ký bằng khoá Aladin rồi tải lên là một mục CheckFarm mà
// pháp nhân CheckFarm không bao giờ nộp bản của họ lên được nữa, và cũng không
// chuyển giao được. Bản dựng thì vẫn xanh — không có triệu chứng nào ở máy dựng.
//
// Trước 2026-08-29 lỗi này ĐANG SỐNG: một khối `signingConfigs.release` duy nhất
// mang bốn biến `ORILIFE_UPLOAD_*`, và `buildTypes.release` gán nó cho MỌI flavor.
// ─────────────────────────────────────────────────────────────────────────────
describe('khoá ký — mỗi app một bộ, không dùng chung', () => {
  const AAB_CI = doc('.github/workflows/android-aab.yml');

  it('buildTypes.release KHÔNG gán signingConfig — buildType đè flavor', () => {
    // Đây là bài kiểm quan trọng nhất của nhóm. buildType có ĐỘ ƯU TIÊN CAO HƠN
    // flavor, nên chỉ cần một dòng `signingConfig` sống lại ở đây là mọi app
    // quay về ký chung một khoá, và bốn bài kiểm dưới vẫn xanh hết.
    const khoiRelease = GRADLE.match(/buildTypes\s*\{[\s\S]*?\n        release \{([\s\S]*?)\n        \}/);
    expect(khoiRelease).not.toBeNull();
    expect(khoiRelease![1]).not.toMatch(/^\s*signingConfig\s/m);
  });

  it('tên biến khoá SUY từ mã app, không gõ cứng tên app nào', () => {
    // `khai.id.toUpperCase() + '_UPLOAD_'` — đối tác thêm `instances/<mã>/` là có
    // ngay vùng khoá riêng, không phải nhờ ai sửa gradle. Cùng lý do với việc
    // gradle đọc thư mục thay vì khai tay flavor.
    expect(GRADLE).toContain("toUpperCase() + '_UPLOAD_'");
    expect(GRADLE).toMatch(/signingConfigs\s*\{[\s\S]*?cacApp\.each/);
  });

  it('KHÔNG còn khối signingConfig dùng chung mang tên OriLife', () => {
    expect(GRADLE).not.toMatch(/hasProperty\(\s*'ORILIFE_UPLOAD_STORE_FILE'\s*\)/);
    expect(GRADLE).not.toMatch(/^\s*storeFile file\(ORILIFE_UPLOAD_STORE_FILE\)/m);
  });

  it('mỗi flavor tự gắn khoá của chính nó', () => {
    const khoiFlavor = GRADLE.match(/productFlavors\s*\{([\s\S]*?)\n    \}/);
    expect(khoiFlavor).not.toBeNull();
    expect(khoiFlavor![1]).toContain('signingConfigs.getByName(khai.id)');
  });

  it('thiếu khoá thì bản PHÁT HÀNH nổ, không ra gói không ký', () => {
    // Không có cổng này, `assembleCheckfarmRelease` thiếu khoá vẫn chạy tới cùng
    // và ra một gói KHÔNG KÝ — không lỗi ở máy dựng, chỉ lỗi ở cửa Play Console
    // sau khi người ta đã tải lên và tưởng là xong.
    expect(GRADLE).toContain('gradle.taskGraph.whenReady');
    expect(GRADLE).toMatch(/assemble\|bundle\)\(\[A-Z\]\[A-Za-z0-9\]\*\)Release/);
    expect(GRADLE).toMatch(/throw new GradleException\([\s\S]{0,400}KHÔNG có khoá ký của chính app đó/);
  });

  it('cổng chặn phải NÉM, không được chỉ cảnh báo rồi chạy tiếp', () => {
    // Cảnh báo rồi chạy tiếp là đúng khuôn hỏng vừa gỡ: có vẻ đã canh, thật ra
    // vẫn ra gói sai. Đo trên chính khối cổng.
    const cong = GRADLE.match(/gradle\.taskGraph\.whenReady[\s\S]*$/);
    expect(cong).not.toBeNull();
    expect(cong![0]).toContain('throw new GradleException');
    expect(cong![0]).not.toMatch(/logger\.(warn|lifecycle)\(/);
  });

  it('CI Android truyền đủ bộ khoá, và bộ đó SUY theo app đang dựng', () => {
    // Trước 2026-08-31 luồng này gõ cứng `ALADIN_UPLOAD_*`, và bài kiểm này ghi
    // đúng chuỗi đó — tức nó đang canh cho một luồng chỉ dựng nổi MỘT app.
    // Nay tên khoá suy từ `TIEN_TO`, nên phép đo đúng là: đủ bốn hậu tố, và
    // tiền tố phải là biến chứ không phải tên một app.
    expect(AAB_CI).toMatch(/gradlew "bundle\$\{CAP\}Release"/);
    for (const hau of ['STORE_FILE', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']) {
      expect(AAB_CI).toContain(`\${TIEN_TO}_UPLOAD_${hau}`);
    }
    // và KHÔNG còn tên app nào bị gõ cứng vào tên khoá ở mã chạy.
    const maChay = AAB_CI.split('\n').filter((d) => !d.trim().startsWith('#'));
    expect(maChay.filter((d) => /ALADIN_UPLOAD|CHECKFARM_UPLOAD/.test(d))).toEqual([]);
    // Đo việc DÙNG, không đo việc NHẮC TÊN: lời báo lỗi trong workflow có nhắc tên
    // cũ để người đọc biết phải đổi tên secret nào, và đó là chỗ nhắc ĐÚNG.
    expect(AAB_CI).not.toMatch(/secrets\.ORILIFE_UPLOAD/);
    expect(AAB_CI).not.toMatch(/-PORILIFE_UPLOAD/);
    expect(AAB_CI).not.toMatch(/\$ORILIFE_UPLOAD/);
    expect(AAB_CI).not.toMatch(/^\s*ORILIFE_UPLOAD_[A-Z_]+:/m);
  });

  it('không luồng CI nào truyền khoá của app này cho bản dựng của app kia', () => {
    // Đo trực tiếp: mọi dòng gradle có `-P<TÊN>_UPLOAD_` phải nằm cùng lệnh với
    // flavor mang đúng tên đó. Bắt được cả trường hợp ai đó chép khối build của
    // Aladin ra rồi chỉ đổi tên flavor mà quên đổi tên biến khoá.
    for (const [ten, noiDung] of [['android-aab.yml', AAB_CI], ['codemagic.yaml', CODEMAGIC]] as const) {
      const lenh = noiDung.match(/(?:assemble|bundle)([A-Z][A-Za-z0-9]*)Release[\s\S]{0,600}?(?=\n\s*\n|$)/g) ?? [];
      for (const khoi of lenh) {
        const flavor = /(?:assemble|bundle)([A-Z][A-Za-z0-9]*)Release/.exec(khoi)![1].toUpperCase();
        const bienKhoa = khoi.match(/-P([A-Z][A-Z0-9]*)_UPLOAD_/g) ?? [];
        for (const b of bienKhoa) {
          const chuKhoa = /-P([A-Z][A-Z0-9]*)_UPLOAD_/.exec(b)![1];
          expect(`${ten}: ${khoi.slice(0, 40)} → ${chuKhoa}`).toBe(`${ten}: ${khoi.slice(0, 40)} → ${flavor}`);
        }
      }
    }
  });

  it('script sinh khoá tồn tại, và từ chối ghi đè kho khoá đã có', () => {
    const sc = doc('scripts/tao-khoa-ky.sh');
    expect(sc).toContain('ĐÃ TỒN TẠI. Không ghi đè');
    expect(sc).toContain('keytool -genkeypair');
    // Script KHÔNG được tự đặt mật khẩu: `-storepass`/`-keypass` trên dòng lệnh
    // là ghi mật khẩu vào lịch sử shell và vào bảng tiến trình của máy.
    expect(sc).not.toContain('-storepass');
    expect(sc).not.toContain('-keypass');
  });

  it('.gitignore chặn kho khoá ở MỌI đường, không chỉ dưới android/app', () => {
    // Script ghi ra thư mục gốc kho. Trước 2026-08-29 `.gitignore` chỉ chặn
    // `android/app/*.jks`, nên một `git add` lỡ tay là đẩy khoá Play Store lên kho.
    const gi = doc('.gitignore');
    for (const duoi of ['*.jks', '*.p12', '*.p8']) {
      expect(gi.split('\n')).toContain(duoi);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE iOS — không app nào khởi Firebase bằng cấu hình của app khác.
//
// Đây là nửa iOS của việc đã làm bên Android. Android tắt bước Firebase cho
// flavor không có `google-services.json` của chính nó. iOS KHÔNG có cơ chế theo
// flavor tương đương: `ScannerModule.podspec` khai `GoogleService-Info.plist`
// trong `s.resources`, mà `s.resources` chép vào gói của MỌI bản dựng.
//
// Nên iOS chặn ở tầng CHẠY: so mã gói trong tệp cấu hình với mã gói thật. Lệch
// nghĩa là tệp thuộc app khác ⇒ không khởi. Cách đó bịt mọi đường tệp lọt vào
// gói, kể cả đường chưa ai nghĩ ra.
// ─────────────────────────────────────────────────────────────────────────────
describe('Firebase iOS — không khởi bằng cấu hình của app khác', () => {
  const APPDELEGATE = doc('ios/SuperApp/AppDelegate.swift');

  it('AppDelegate KHÔNG gọi thẳng FirebaseApp.configure', () => {
    // Gọi thẳng là bỏ qua cổng. Đo trên mã chạy để không bắt nhầm chú thích.
    const ma = APPDELEGATE.split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    const goiThang = ma.match(/FirebaseApp\.configure\(/g) ?? [];
    // Đúng MỘT chỗ, và chỗ đó phải nằm trong hàm cổng.
    expect(goiThang.length).toBe(1);
    const trongCong = ma.slice(ma.indexOf('func configureFirebaseIfOwned'));
    expect(trongCong).toContain('FirebaseApp.configure(');
  });

  it('cổng so mã gói của tệp cấu hình với mã gói THẬT', () => {
    expect(APPDELEGATE).toContain('func configureFirebaseIfOwned');
    expect(APPDELEGATE).toContain('Bundle.main.bundleIdentifier');
    expect(APPDELEGATE).toMatch(/guard\s+cauHinh\.bundleID == maGoiThat else/);
  });

  it('lệch mã gói thì DỪNG, không phải chỉ ghi nhật ký rồi chạy tiếp', () => {
    // Cảnh báo rồi chạy tiếp là đúng khuôn hỏng vừa gỡ: trông như đã canh, thật
    // ra dữ liệu vẫn chảy sang dự án của pháp nhân khác.
    const i = APPDELEGATE.indexOf('guard cauHinh.bundleID == maGoiThat else');
    const j = APPDELEGATE.indexOf('FirebaseApp.configure(', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(APPDELEGATE.slice(i, j)).toContain('return');
  });

  it('KHÔNG còn tệp khởi Firebase thứ hai không được biên dịch', () => {
    // `FirebaseSetup.swift` từng tồn tại với một bản `FirebaseApp.configure`
    // riêng, KHÔNG có trong `project.pbxproj` — tức chưa bao giờ được biên dịch.
    // Hai lượt rà soát độc lập vẫn trích nó như một đường khởi Firebase đang
    // chạy. Mã chết đọc giống hệt mã sống; giữ nó là giữ một đường dẫn sai cho
    // mọi người đọc sau.
    expect(existsSync(join(GOC, 'ios/SuperApp/FirebaseSetup.swift'))).toBe(false);
  });

  it('mọi tệp Swift khởi Firebase đều PHẢI có trong project.pbxproj', () => {
    // Bài kiểm tổng quát cho bài học trên: tệp Swift nào gọi
    // `FirebaseApp.configure` mà không có trong dự án Xcode thì nó là mã chết
    // đội lốt mã sống. Bắt mọi tệp, kể cả tệp chưa ai viết.
    const PBX = doc('ios/SuperApp.xcodeproj/project.pbxproj');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readdirSync, statSync } = require('fs');
    const quet = (d: string): string[] =>
      readdirSync(d).flatMap((n: string) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? quet(p) : n.endsWith('.swift') ? [p] : [];
      });
    const chet: string[] = [];
    for (const tep of quet(join(GOC, 'ios/SuperApp'))) {
      if (!readFileSync(tep, 'utf8').includes('FirebaseApp.configure(')) continue;
      // Tách bằng CẢ HAI dấu. `join` trả dấu chéo ngược trên Windows, nên tách
      // riêng dấu chéo xuôi không cắt được gì: `ten` thành nguyên đường dẫn
      // tuyệt đối, `PBX.includes(ten)` luôn sai, và bài kết tội MỌI tệp Swift là
      // mã chết — một lời buộc tội sai, chỉ xảy ra trên máy Windows.
      const ten = tep.split(/[\\/]/).pop()!;
      if (!PBX.includes(ten)) chet.push(ten);
    }
    expect(chet).toEqual([]);
  });

  it('không tệp Firebase nào nằm ở chỗ chép vào gói của MỌI app', () => {
    // Bài trước ở đây đo rằng tệp Firebase trong kho "đúng là của Aladin". Phép
    // đo đó nhận sai tiền đề: tệp ấy khai một mã gói NHÁP của dev
    // (`com.aladin` + `.orilife`), còn app Aladin iOS chạy bằng `vn.aladinapp`.
    // Hai chuỗi không bằng nhau ⇒ `configureFirebaseIfOwned` luôn trượt ⇒
    // Firebase iOS chưa từng khởi. Bài kiểm cũ canh cho một tệp CHẾT nằm yên,
    // và đọc như thể nó đang sống.
    //
    // Đã gỡ tệp đó (04/09/2026) cùng dòng `s.resources` trong podspec. Bài này
    // canh nó đừng quay lại: `s.resources` chép vào gói của MỌI bản dựng, nên
    // một tệp Firebase đặt ở đó là tệp của một pháp nhân đi vào gói của mọi
    // pháp nhân còn lại.
    const PODSPEC = doc('ios/LocalPods/ScannerModule/ScannerModule.podspec');
    const dongResources = PODSPEC.split('\n').filter((l) => /^\s*s\.resources\s*=/.test(l));
    expect(dongResources.length).toBe(1);
    expect(dongResources[0]).not.toContain('GoogleService-Info');

    expect(
      existsSync(join(GOC, 'ios/LocalPods/ScannerModule/Resources/GoogleService-Info.plist')),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MÃ GÓI NHÁP — cổng chặn toàn kho.
//
// `com.aladin` + `.orilife` là mã gói một dev tạo lúc dựng thử, KHÔNG phải mã
// của app nào đang sống. Chủ nhân chốt 04/09/2026: chỉ còn hai app, và mã gói
// của chúng là `com.aladincontract.company` (Aladin, Android) và
// `com.checkfarm.app` (CheckFarm) — cộng `vn.aladinapp` cho Aladin bản iOS, đã
// lên App Store từ v1.0 nên KHÔNG đổi được.
//
// Vì sao cần cổng chứ không chỉ cần một lượt xoá: mã nháp ấy sống lâu được vì
// nó nằm trong tệp SINH RA (`google-services.json`, `GoogleService-Info.plist`)
// và trong VÍ DỤ ở tài liệu — hai chỗ không ai đọc lại. Một lượt xoá tay không
// ngăn lượt tải tệp mới về mang nó trở lại. Cổng thì ngăn.
//
// Cổng này ĐỎ sau ngày ai đó tải lại `google-services.json` mà app iOS nháp vẫn
// còn trong console Firebase `aladin-3599c`. Đó là câu trả lời đúng, không phải
// phiền nhiễu: nó nói rằng chỗ phải dọn nằm ở console, không nằm trong kho.
// ─────────────────────────────────────────────────────────────────────────────
describe('mã gói nháp không được quay lại kho', () => {
  // Ghép chuỗi, KHÔNG viết liền: viết liền thì chính tệp này trúng cổng của nó.
  const DRAFT_BUNDLE_ID = ['com', 'aladin', 'orilife'].join('.');

  const SKIPPED_DIRS = new Set([
    'node_modules',
    '.git',
    // Thư từ giữa các nhà agent. Đó là bản GHI CHÉP một sự việc — thư kể lại
    // rằng mã nháp từng có ở đâu. Cấm nhắc tới nó trong bản ghi chép là xoá
    // luôn lời giải thích vì sao phải xoá. Cổng này canh MÃ và tệp cấu hình.
    '_Agents',
    'Pods',
    'build',
    '.gradle',
    '.expo',
    'coverage',
    'DerivedData',
    'target',
  ]);
  // Tệp nhị phân: đọc bằng utf8 ra rác, và không ai gõ mã gói vào ảnh.
  const SKIPPED_EXTENSIONS =
    /\.(png|jpg|jpeg|gif|webp|ico|icns|tflite|pt|onnx|ttf|otf|woff2?|zip|jar|aar|apk|aab|ipa|keystore|jks|p12|mp4|mov|mp3|wav|pdf|so|dylib|bin|lock)$/i;

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return SKIPPED_DIRS.has(e.name) ? [] : walk(join(dir, e.name));
      return SKIPPED_EXTENSIONS.test(e.name) ? [] : [join(dir, e.name)];
    });

  it('không tệp nào trong kho còn nhắc mã gói nháp', () => {
    const hits: string[] = [];
    for (const file of walk(GOC)) {
      let content: string;
      try {
        content = readFileSync(file, 'utf8');
      } catch {
        continue; // tệp không đọc được bằng utf8 — bỏ, không phải chỗ gõ mã gói
      }
      if (content.includes(DRAFT_BUNDLE_ID)) hits.push(file.slice(GOC.length + 1));
    }
    expect(hits).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PHÁP NHÂN VẬN HÀNH — khai ở HAI chỗ, nên phải có cổng canh hai chỗ không lệch.
//
// `instances/<mã>/instance.json` là bản đối tác sửa (không cần biết TypeScript).
// `src/config/instance.config.ts` là bản mã chạy đọc. Lệch nhau thì bản đối tác
// sửa không có tác dụng, và không có triệu chứng nào — họ sửa, dựng lại, và app
// vẫn nói tên cũ.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Bỏ chú thích, chỉ giữ MÃ CHẠY.
 *
 * Cổng cấm một chuỗi thì nó cấm luôn dòng chú thích giải thích vì sao cấm — và
 * dòng chú thích đó lại là thứ đáng giữ nhất cho người sửa sau. Đo mã chạy thì
 * cấm được cái đáng cấm mà không cấm nhầm lời giải thích.
 */
const maChay = (p: string) =>
  doc(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

// ─────────────────────────────────────────────────────────────────────────────
// BIỂU TƯỢNG iOS — mỗi app một bộ, và bộ đó phải NỘP ĐƯỢC
//
// Trước bản này, biểu tượng iOS là MỘT bộ dùng chung ở
// `ios/SuperApp/Images.xcassets/AppIcon.appiconset` — bộ của Aladin. Một bản iOS
// của app khác dựng được, ký được, và mang biểu tượng Aladin: không cổng nào đỏ,
// vì không có gì để so. Nay mỗi app giữ bộ của mình trong `instances/<mã>/ios/`
// và bước dựng chép bộ đúng app vào chỗ Xcode đọc.
//
// Ba điều dưới đây hỏng theo ba cách khác nhau, nên đo riêng từng điều:
//   thiếu bộ      → bản dựng đỏ ở máy chủ dựng, muộn nhưng có kêu
//   trùng bộ      → KHÔNG ai kêu, chỉ lộ khi có người nhìn màn hình máy
//   còn kênh alpha→ Apple từ chối ở bước NỘP, sau cả một lượt dựng trả tiền
//
// Đọc PNG bằng tay thay vì kéo thêm thư viện: bốn byte cạnh nằm ở đầu khối IHDR
// và kiểu màu ở byte 25 — đủ để trả lời cả ba câu, và một phép kiểm về biểu
// tượng không nên tự nó thêm một phụ thuộc mới vào cây dựng.
const docPng = (p: string) => {
  const b = readFileSync(p);
  const chuKy = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!b.subarray(0, 8).equals(chuKy)) return null;
  const kieuMau = b[25];
  return {
    rong: b.readUInt32BE(16),
    cao: b.readUInt32BE(20),
    // Kiểu 4 = xám + alpha, 6 = màu thật + alpha. Khối `tRNS` cũng tạo phần
    // trong suốt cho kiểu bảng màu, nên dò luôn tên khối đó.
    coAlpha: kieuMau === 4 || kieuMau === 6 || b.includes(Buffer.from('tRNS')),
  };
};

describe('biểu tượng iOS — mỗi app một bộ của chính nó', () => {
  const boCua = (id: string) => join(THU_MUC_APP, id, 'ios', 'AppIcon.appiconset');

  it('mọi app đều có bộ AppIcon.appiconset riêng, kèm Contents.json', () => {
    for (const id of Object.keys(FLAVORS)) {
      const d = boCua(id);
      expect(existsSync(d) ? `${id}: có bộ iOS` : `${id}: THIẾU ${d}`).toBe(`${id}: có bộ iOS`);
      expect(existsSync(join(d, 'Contents.json'))).toBe(true);
    }
  });

  it('mọi app có ĐỦ cùng một danh sách tệp — không app nào thiếu cỡ nào', () => {
    // So theo danh sách chứ không theo số lượng: hai bộ cùng 19 tệp mà lệch tên
    // thì Xcode nhận một bộ khuyết và KHÔNG báo gì.
    const ids = Object.keys(FLAVORS);
    const chuan = readdirSync(boCua(ids[0])).sort();
    for (const id of ids) {
      expect(`${id}: ${readdirSync(boCua(id)).sort().join(',')}`).toBe(`${id}: ${chuan.join(',')}`);
    }
  });

  it('icon-1024 của mỗi app: 1024×1024 và KHÔNG kênh alpha', () => {
    for (const id of Object.keys(FLAVORS)) {
      const anh = docPng(join(boCua(id), 'icon-1024.png'));
      expect(anh ? `${id}: đọc được PNG` : `${id}: KHÔNG phải PNG`).toBe(`${id}: đọc được PNG`);
      expect(`${id}: ${anh!.rong}×${anh!.cao}`).toBe(`${id}: 1024×1024`);
      expect(anh!.coAlpha ? `${id}: CÓ alpha` : `${id}: không alpha`).toBe(`${id}: không alpha`);
    }
  });

  it('KHÔNG hai app nào dùng chung một ảnh biểu tượng', () => {
    // Đây là bài đắt nhất của nhóm, vì nó là bài DUY NHẤT bắt được ca chép bộ
    // của app khác sang. Ca đó cho ra một bản dựng xanh hoàn toàn.
    const ids = Object.keys(FLAVORS);
    for (const id of ids) {
      for (const khac of ids) {
        if (khac === id) continue;
        const a = readFileSync(join(boCua(id), 'icon-1024.png'));
        const b = readFileSync(join(boCua(khac), 'icon-1024.png'));
        expect(a.equals(b) ? `${id} TRÙNG ảnh với ${khac}` : `${id} khác ${khac}`).toBe(
          `${id} khác ${khac}`,
        );
      }
    }
  });
});

describe('pháp nhân vận hành — tệp khai và mã chạy phải khớp', () => {
  it('mỗi instance.json khai operator, và khớp bản trong instance.config.ts', () => {
    for (const id of Object.keys(FLAVORS)) {
      const khai = JSON.parse(readFileSync(join(THU_MUC_APP, id, 'instance.json'), 'utf8'));
      const op = khai.operator as Record<string, unknown> | undefined;
      expect(op ? `${id}: có operator` : `${id}: THIẾU operator`).toBe(`${id}: có operator`);
      const ts = INSTANCES[id].operator;
      expect(op!.name).toBe(ts.name);
      expect(op!.address ?? null).toBe(ts.address);
      expect(op!.addressEn ?? null).toBe(ts.addressEn);
      expect(op!.contact ?? null).toBe(ts.contact);
      // Hai trường khai việc MƯỢN pháp nhân cũng phải khớp hai bên. Bỏ chúng ra
      // khỏi phép so là để mở đúng một đường: sửa `instance.json` cho hết đỏ ở
      // `instanceParity` mà bản mã chạy vẫn mang lời khai cũ — và trang chính
      // sách người dùng đọc là bản mã chạy, không phải tệp khai.
      expect(op!.sharedWith ?? null).toBe(ts.sharedWith ?? null);
      expect(JSON.stringify(op!.transferTo ?? null)).toBe(JSON.stringify(ts.transferTo ?? null));
    }
  });

  it('policyContent KHÔNG còn hằng pháp nhân viết cứng', () => {
    // Bài kiểm hàm thuần không bắt được ca này: `policyFor()` vẫn chạy đúng khi
    // ai đó trả `OPERATOR` về thành hằng — nó chỉ in ra tên sai. Nên phải quét
    // nguồn.
    const pc = maChay('src/legal/policyContent.ts');
    expect(pc).toContain('DEFAULT_INSTANCE.operator');
    expect(pc).not.toMatch(/export const OPERATOR = \{/);
    expect(pc).not.toContain("name: 'Aladin'");
  });

  it('tên app trên màn hình lấy từ instance, không ghi cứng', () => {
    const login = maChay('src/screens/LoginScreen.tsx');
    expect(login).toContain('DEFAULT_INSTANCE.displayName');
    expect(login).not.toContain('ALADIN · DANH TÍNH SỐ');

    const header = maChay('src/components/AppHeader.tsx');
    expect(header).toContain('DEFAULT_INSTANCE.displayName');
    expect(header).not.toMatch(/ctx\.title \?\? 'Aladin'/);

    const onboard = maChay('src/screens/OnboardingScreen.tsx');
    expect(onboard).toContain('DEFAULT_INSTANCE.displayName');
    expect(onboard).not.toContain("tk('onboarding.title')");
  });

  it('mã kênh thông báo mang mã app, không ghi cứng aladin', () => {
    const ln = maChay('src/services/localNotify.ts');
    expect(ln).toContain('DEFAULT_INSTANCE.instanceId');
    expect(ln).not.toContain("'aladin-farm-alerts'");
  });
});
