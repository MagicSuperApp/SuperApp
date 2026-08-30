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
const doc = (p: string) => readFileSync(join(GOC, p), 'utf8');

const GRADLE = doc('android/app/build.gradle');
const CODEMAGIC = doc('codemagic.yaml');
const PBXPROJ = doc('ios/aladin_mobile_fe.xcodeproj/project.pbxproj');
const INFO_PLIST = doc('ios/aladin_mobile_fe/Info.plist');

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
    expect(y).toContain('bundleAladinRelease');
    expect(y).toContain('outputs/bundle/aladinRelease');
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
  const APPDELEGATE = doc('ios/aladin_mobile_fe/AppDelegate.swift');

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
    expect(existsSync(join(GOC, 'ios/aladin_mobile_fe/FirebaseSetup.swift'))).toBe(false);
  });

  it('mọi tệp Swift khởi Firebase đều PHẢI có trong project.pbxproj', () => {
    // Bài kiểm tổng quát cho bài học trên: tệp Swift nào gọi
    // `FirebaseApp.configure` mà không có trong dự án Xcode thì nó là mã chết
    // đội lốt mã sống. Bắt mọi tệp, kể cả tệp chưa ai viết.
    const PBX = doc('ios/aladin_mobile_fe.xcodeproj/project.pbxproj');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readdirSync, statSync } = require('fs');
    const quet = (d: string): string[] =>
      readdirSync(d).flatMap((n: string) => {
        const p = join(d, n);
        return statSync(p).isDirectory() ? quet(p) : n.endsWith('.swift') ? [p] : [];
      });
    const chet: string[] = [];
    for (const tep of quet(join(GOC, 'ios/aladin_mobile_fe'))) {
      if (!readFileSync(tep, 'utf8').includes('FirebaseApp.configure(')) continue;
      const ten = tep.split('/').pop()!;
      if (!PBX.includes(ten)) chet.push(ten);
    }
    expect(chet).toEqual([]);
  });

  it('tệp Firebase đang có trong kho đúng là của Aladin, không phải app khác', () => {
    // Đo để lời tuyên ở chú thích không trôi: tệp trong kho hôm nay khai mã gói
    // của Aladin. Ngày ai đó bỏ tệp của app khác vào đây, bài này gọi tên ra.
    for (const p of [
      'ios/GoogleService-Info.plist',
      'ios/LocalPods/ScannerModule/Resources/GoogleService-Info.plist',
    ]) {
      if (!existsSync(join(GOC, p))) continue;
      expect(doc(p)).toContain('com.aladin.orilife');
    }
  });
});
