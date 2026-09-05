internal import Expo
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import FirebaseAnalytics

// ── Bắt uncaught ObjC exception (native) ─────────────────────────────────────
// Bản signed crash EXC_CRASH/SIGABRT do NSException không bắt (ObjCTurboModule
// performVoidMethodInvocation rethrow) — crash log .ips KHÔNG ghi reason. Hàm này
// ghi name+reason+stack ra nhật ký hệ thống TRƯỚC khi app chết, để biết ĐÚNG
// module/lý do. (_objc_terminate gọi handler này cho ObjC exception trước abort.)
//
// KHÔNG gửi đi đâu cả. Bản trước POST thẳng về một tên miền ngrok tạm viết cứng
// trong mã: đo được chuỗi đó nằm trong nhị phân bản phát hành 94 (`strings` trên
// chính tệp .app đã ký). Tên miền ngrok miễn phí hết hạn là ai cũng giành lại
// được, và từ giây đó mọi tên module + lý do lỗi + dấu vết ngăn xếp của máy người
// dùng thật chảy về tay người lạ — không cờ tắt, không ai đồng ý.
//
// Cần lại đường gửi từ xa thì đi qua `REMOTE_LOG_URL` (biến môi trường, mặc định
// rỗng = tắt) như `src/services/remoteLogger.ts` đã làm — đừng viết cứng lần nữa.
private func aladinReportNativeException(_ name: String, _ reason: String, _ stack: [String]) {
  NSLog("[NATIVE-CRASH] %@: %@\n%@", name, reason, stack.prefix(40).joined(separator: "\n"))
}

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // PHẢI đặt SỚM NHẤT — bắt NSException gây SIGABRT lúc khởi động (bản signed).
    // LƯU vào UserDefaults NGAY (không phụ thuộc mạng) rồi POST. Nếu POST lúc crash
    // không kịp, lần mở SAU sẽ gửi lại (dưới) — bulletproof kể cả crash-loop.
    NSSetUncaughtExceptionHandler { exception in
      let text = "\(exception.name.rawValue): \(exception.reason ?? "nil")\n"
        + exception.callStackSymbols.prefix(30).joined(separator: "\n")
      UserDefaults.standard.set(text, forKey: "aladin_native_crash")
      UserDefaults.standard.synchronize()
      aladinReportNativeException(
        exception.name.rawValue,
        exception.reason ?? "nil",
        exception.callStackSymbols
      )
    }

    // Gửi lại crash lần trước (nếu POST lúc crash chưa kịp) — chạy TRƯỚC startReactNative
    // nên kể cả app crash mỗi lần mở, lần mở kế vẫn đẩy được lý do lên server.
    if let saved = UserDefaults.standard.string(forKey: "aladin_native_crash") {
      UserDefaults.standard.removeObject(forKey: "aladin_native_crash")
      UserDefaults.standard.synchronize()
      aladinReportNativeException("native_crash_recovered", saved, [])
    }

    // ── PRE-WARM UIKit text/font trên MAIN THREAD (fix crash Fabric off-main) ──────
    // NGUYÊN NHÂN GỐC màn trắng→crash bản signed: RN New Architecture (Fabric) đo &
    // layout text trên BACKGROUND thread. Lần ĐẦU chạm UIFont/NSAttributedString,
    // ObjC gọi `+initialize` của các class UIKit (UIFont, NSAttributeDictionary,
    // NSParagraphStyle) — trên MÁY THẬT, `+initialize` chạy lần đầu NGOÀI main thread
    // gây SIGABRT (crash log build 73: `+[UIFont systemFontOfSize:]`; build 74:
    // `+[NSAttributeDictionary initialize]` — đều trên dispatch worker/JS thread).
    // Giả lập timing khác nên không lộ. Chạm trước TRÊN MAIN để `+initialize` hoàn
    // tất an toàn TRƯỚC khi Fabric đo text ở background.
    let warmFont = UIFont.systemFont(ofSize: 14)
    _ = UIFont.boldSystemFont(ofSize: 14)
    _ = NSParagraphStyle.default
    let warm = NSMutableAttributedString(string: "warmup")
    warm.addAttribute(.font, value: warmFont, range: NSRange(location: 0, length: warm.length))
    warm.addAttribute(.paragraphStyle, value: NSParagraphStyle.default, range: NSRange(location: 0, length: warm.length))
    _ = warm.size()

    // ── Firebase init via GoogleService-Info.plist (native-side only) ────────────
    // Firebase Analytics for tracking user experience
    // ⛔ CHỈ khởi Firebase khi tệp cấu hình khai ĐÚNG app đang chạy.
    //
    //    `ScannerModule.podspec` từng khai `Resources/GoogleService-Info.plist`
    //    trong `s.resources`, mà `s.resources` chép vào gói của MỌI bản dựng —
    //    không có nhánh theo app. Tệp đó khai một mã gói NHÁP của dev và
    //    `PROJECT_ID aladin-3599c`. Nên mọi app sinh từ nền mã này — kể cả app
    //    của pháp nhân khác — đều có tệp Firebase của Aladin Contract trong gói.
    //    Tệp đó đã gỡ khỏi kho; cổng dưới đây vẫn giữ, vì nó chặn MỌI đường tệp
    //    lọt vào gói chứ không chỉ đường podspec.
    //
    //    Bên Android lớp lỗi này đã bịt bằng cách tắt bước Firebase cho flavor
    //    không có tệp riêng. iOS không có cơ chế theo flavor tương đương, nên
    //    chặn ở đây: so mã gói trong tệp cấu hình với mã gói THẬT đang chạy.
    //    Lệch nghĩa là tệp thuộc app khác ⇒ KHÔNG khởi.
    //
    //    Chặn kiểu này đúng bất kể tệp lọt vào gói bằng đường nào — kể cả đường
    //    chưa ai nghĩ ra — vì nó đo thứ quyết định hành vi, không đo cách dựng.
    if FirebaseApp.app() == nil {
      configureFirebaseIfOwned()
    }

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider() as! any RCTDependencyProvider

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "SuperApp",
      in: window,
      launchOptions: launchOptions
    )

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // Giữ entry "index" của RN CLI (KHÔNG dùng ".expo/.virtual-metro-entry" mà
    // install-expo-modules tự đặt) — app vẫn chạy metro RN gốc, expo chỉ để expo-gl.
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}


// ── CỔNG FIREBASE: chỉ khởi khi tệp cấu hình khai ĐÚNG app đang chạy ────────
//
// `ios/LocalPods/ScannerModule/ScannerModule.podspec` từng khai
// `Resources/GoogleService-Info.plist` trong `s.resources`. `s.resources` chép
// vào gói của MỌI bản dựng — podspec không có nhánh theo app. Tệp đó khai một
// mã gói NHÁP của dev và `PROJECT_ID aladin-3599c`.
//
// Nền mã này sinh nhiều app cho nhiều PHÁP NHÂN khác nhau. Trước bản này, mọi
// app iOS dựng từ đây đều mang tệp Firebase của Aladin Contract trong gói — số
// liệu phiên và Crashlytics của app pháp nhân khác có đường chảy vào console
// của Aladin.
//
// ĐO ĐƯỢC KHI GỠ (04/09/2026): tệp đó khai mã gói nháp, còn app Aladin iOS chạy
// bằng `vn.aladinapp`. Hai chuỗi không bằng nhau ⇒ `guard` dưới đây luôn trượt
// ⇒ Firebase iOS **chưa từng khởi** ở bản Aladin. Nên việc gỡ tệp KHÔNG đổi
// hành vi: trước gỡ dừng ở `guard` mã gói, sau gỡ dừng ở `guard` không có tệp.
//
// Không phải lỗi kỹ thuật đơn thuần: bên phát triển làm theo đơn đặt hàng và
// KHÔNG giữ quyền kiểm soát thông tin của bên đặt hàng. Dòng dữ liệu này đúng
// thứ câu đó cấm. Và nó KHÔNG CÓ TRIỆU CHỨNG — mọi thứ chạy, chỉ là chạy vào
// nhà người ta.
//
// Android đã bịt lớp lỗi này ở `android/app/build.gradle` (tắt bước Firebase cho
// flavor không có `google-services.json` của chính nó). iOS không có cơ chế theo
// flavor tương đương, nên chặn ở tầng chạy.
//
// VÌ SAO CHẶN Ở TẦNG CHẠY CHỨ KHÔNG CHỈ SỬA HỆ DỰNG: sửa podspec bịt MỘT đường
// tệp lọt vào gói. Phép so này bịt MỌI đường — kể cả đường chưa ai nghĩ ra — vì
// nó đo thứ quyết định hành vi (mã gói thật), không đo cách dựng. Hai việc bổ
// sung nhau, không thay nhau.
//
// NGÀY MỘT APP CÓ DỰ ÁN FIREBASE RIÊNG: bỏ `GoogleService-Info.plist` của dự án
// ĐỨNG TÊN pháp nhân đó vào gói, `BUNDLE_ID` khớp mã gói của app. Hàm này tự
// nhận và khởi — không phải sửa dòng nào ở đây.
//
// ⛔ ĐỪNG "tạm chấp nhận" tệp lệch mã gói cho Firebase chạy. Đó là mở lại đúng
//    lỗ vừa vá, và lần này có một hàm tên `configureFirebaseIfOwned` đứng cạnh
//    làm bằng chứng giả rằng đã canh.
//
// GHI CHÚ CHO NGƯỜI SAU: hàm này từng nằm ở `FirebaseSetup.swift`. Tệp đó KHÔNG
// có trong `project.pbxproj`, tức chưa bao giờ được biên dịch — mà hai lượt rà
// soát độc lập vẫn trích nó như một đường khởi Firebase đang chạy. Mã chết đọc
// giống hệt mã sống. Đã xoá tệp đó; cổng nằm ở đây, trong tệp CÓ biên dịch.
func configureFirebaseIfOwned() {
  if FirebaseApp.app() != nil {
    print("[Firebase] Đã cấu hình trước đó, bỏ qua.")
    return
  }

  guard let maGoiThat = Bundle.main.bundleIdentifier else {
    print("[Firebase] ⛔ Không đọc được mã gói của app — KHÔNG khởi Firebase.")
    return
  }

  guard let duong = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") else {
    // KHÔNG phải lỗi. App chưa cần đẩy tin nền thì không có lý do gì phải mở tài
    // khoản ở bên thứ ba trước khi dựng được — cùng lý lẽ với Android.
    print("[Firebase] Không có GoogleService-Info.plist trong gói — app chạy không Firebase.")
    return
  }

  guard let cauHinh = FirebaseOptions(contentsOfFile: duong) else {
    print("[Firebase] ⛔ Đọc được tệp nhưng không dựng được FirebaseOptions — KHÔNG khởi.")
    return
  }

  guard cauHinh.bundleID == maGoiThat else {
    print("[Firebase] ⛔ TỆP CẤU HÌNH THUỘC APP KHÁC — KHÔNG khởi Firebase.")
    print("[Firebase]    app đang chạy : \(maGoiThat)")
    print("[Firebase]    tệp khai      : \(cauHinh.bundleID)")
    print("[Firebase]    dự án         : \(cauHinh.projectID ?? "không rõ")")
    print("[Firebase]    Khởi tiếp là đẩy số liệu app này vào dự án của pháp nhân khác.")
    return
  }

  FirebaseApp.configure(options: cauHinh)
  print("[Firebase] ✅ Đã cấu hình cho \(maGoiThat), dự án \(cauHinh.projectID ?? "không rõ")")
}
