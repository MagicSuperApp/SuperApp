import Foundation
import CoreLocation
// BẮT BUỘC — `RCTEventEmitter`, `RCTPromiseResolveBlock`, `RCTPromiseRejectBlock` đều
// nằm ở đây. Thiếu dòng này thì archive iOS gãy với 10 lỗi đổ theo nhau, mà lỗi đầu
// (`cannot find type 'RCTEventEmitter' in scope`) đọc như hỏng cấu hình pod chứ không
// như thiếu một dòng import. Swift KHÔNG chia sẻ import giữa các file cùng module:
// `TreeReIDBridgeModule.swift` cũng kế thừa `RCTEventEmitter` và vẫn biên dịch sạch
// trong ĐÚNG lượt đó, chỉ vì nó tự khai `import React` ở dòng 2 của nó.
//
// Đừng để cảnh báo `umbrella header for module 'React' does not include header
// 'RCTEventEmitter.h'` trong log đánh lạc hướng: cảnh báo đó có sẵn từ trước và vô
// hại — cùng lượt dựng ấy `TreeReIDBridgeModule` vẫn kế thừa được lớp này.
//
// Cầu Obj-C `CompassHeading.m` đã tự `#import <React/RCTEventEmitter.h>` nên phía đó
// không dính; chỉ phía Swift thiếu.
import React

/// CompassHeading (iOS) — LA BÀN dùng chung, cho màn Dẫn đường.
///
/// ## Vì sao có lớp này khi app đã đọc được la bàn
/// `HeadingCaptureManager` đã đọc la bàn rất kỹ, nhưng nó gắn liền với luồng
/// CHỤP ẢNH CÂY: nó vừa đọc hướng vừa quyết định khi nào bấm máy, và bật nó lên
/// kéo theo cả `CMMotionManager` lẫn phiên camera. Màn Dẫn đường chỉ cần một con
/// số hướng.
///
/// Nên lớp này chỉ dùng `CLLocationManager.startUpdatingHeading` — đúng phần la
/// bàn, không đụng gì tới chuyển động hay camera.
///
/// ## Hợp đồng với JS — TRÙNG với bản Android
///   start(minDeltaDeg)     bắt đầu phát sự kiện
///   stop()                 dừng, nhả cảm biến
///   hasCompass(promise)    máy này có la bàn không
///   sự kiện 'HeadingUpdated' → { heading: Double }   0…360, 0 = Bắc
///
/// Xem `android/.../compass/CompassHeadingModule.kt`. Hai bên phải giữ NGUYÊN
/// một hợp đồng, vì phía JS (`features/wayfind/useHeading.ts`) chỉ có một nhánh.
///
/// ## Dùng hướng THẬT (trueHeading) khi có
/// `magneticHeading` là hướng theo từ trường; `trueHeading` đã bù độ lệch từ
/// thiên. Toạ độ vườn là toạ độ địa lý, nên phải so với hướng THẬT — lấy nhầm
/// hướng từ là kim lệch đều vài độ ở mọi chỗ, thứ sai âm thầm khó phát hiện
/// nhất. `trueHeading` chỉ có khi định vị đang bật; âm nghĩa là chưa có.
@objc(CompassHeading)
final class CompassHeadingModule: RCTEventEmitter, CLLocationManagerDelegate {

    private let locationManager = CLLocationManager()
    private var minDelta: Double = 1.0
    private var lastSent: Double?
    private var listening = false

    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! { ["HeadingUpdated"] }

    @objc(start:)
    func start(_ minDeltaDeg: NSNumber) {
        let d = minDeltaDeg.doubleValue
        minDelta = d > 0 ? d : 1.0
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.listening else { return }
            guard CLLocationManager.headingAvailable() else { return }
            self.lastSent = nil
            self.locationManager.delegate = self
            // Lọc ở tầng hệ điều hành đặt sát 1°, phần lọc rung để `HeadingSensorReader`
            // bên Android và `smoothHeading` bên JS lo — giữ một chỗ lọc, không ba.
            self.locationManager.headingFilter = 1
            self.locationManager.startUpdatingHeading()
            self.listening = true
        }
    }

    @objc
    func stop() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.locationManager.stopUpdatingHeading()
            self.listening = false
            self.lastSent = nil
        }
    }

    @objc(hasCompass:rejecter:)
    func hasCompass(_ resolve: RCTPromiseResolveBlock, rejecter _: RCTPromiseRejectBlock) {
        resolve(CLLocationManager.headingAvailable())
    }

    override func invalidate() {
        stop()
        super.invalidate()
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // trueHeading < 0 = chưa tính được (định vị tắt) → lùi về hướng từ, còn hơn
        // là không chỉ gì cả. Cả hai đều tốt hơn kim đứng im.
        let heading = newHeading.trueHeading >= 0
            ? newHeading.trueHeading
            : newHeading.magneticHeading
        guard heading.isFinite, heading >= 0 else { return }

        if let prev = lastSent {
            // So theo VÒNG TRÒN: 359° và 1° cách nhau 2°, không phải 358°.
            var d = abs(heading - prev)
            if d > 180 { d = 360 - d }
            if d < minDelta { return }
        }
        lastSent = heading
        sendEvent(withName: "HeadingUpdated", body: ["heading": heading])
    }

    func locationManagerShouldDisplayHeadingCalibration(_: CLLocationManager) -> Bool {
        // Để hệ điều hành hiện màn hiệu chỉnh hình số 8 khi từ kế lệch. Chặn nó đi
        // thì người dùng cầm một chiếc kim sai mà không có cách nào biết.
        true
    }
}
