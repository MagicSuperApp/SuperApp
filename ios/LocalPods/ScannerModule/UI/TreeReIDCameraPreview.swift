import UIKit
import AVFoundation
import React
import ScannerModule

/// Proxy yếu cho CADisplayLink: run-loop giữ link, link giữ target. Nếu target = view
/// (target: self) thì view KHÔNG BAO GIỜ dealloc (retain cycle) → deinit không chạy →
/// displayLink tick 15fps mãi mãi kể cả khi đã rời màn. Nhiều lần vào/ra scanner →
/// tích lũy N link chạy nền → CPU/RAM tăng dần → đơ. Proxy giữ view YẾU để cắt cycle.
private final class DisplayLinkProxy {
    weak var target: TreeReIDCameraPreview?
    init(_ t: TreeReIDCameraPreview) { target = t }
    @objc func tick() { target?.tick() }
}

/// Auto-connects to TreeReIDBridgeModule's shared capture session when view appears.
@objc(TreeReIDCameraPreview)
final class TreeReIDCameraPreview: UIView {

    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let boxLayer = CAShapeLayer()   // overlay khung YOLO (trên preview)
    private var displayLink: CADisplayLink?
    private var linkProxy: DisplayLinkProxy?

    override init(frame: CGRect) {
        super.init(frame: frame)
        ScannerRemoteLog.breadcrumb(phase: "treereid_preview_init_frame", detail: [
            "frame_x": frame.origin.x,
            "frame_y": frame.origin.y,
            "frame_w": frame.size.width,
            "frame_h": frame.size.height
        ])
        setupLayer()
        connectToSession()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        ScannerRemoteLog.breadcrumb(phase: "treereid_preview_init_coder", detail: [:])
        setupLayer()
        connectToSession()
    }

    private func setupLayer() {
        let layer = AVCaptureVideoPreviewLayer()
        layer.videoGravity = .resizeAspectFill
        layer.frame = bounds
        self.layer.addSublayer(layer)
        previewLayer = layer

        // Overlay khung YOLO — trên preview, không chặn touch.
        boxLayer.frame = bounds
        boxLayer.fillColor = UIColor.clear.cgColor
        boxLayer.strokeColor = UIColor(red: 0.30, green: 0.69, blue: 0.31, alpha: 1).cgColor
        boxLayer.lineWidth = 2.5
        self.layer.addSublayer(boxLayer)

        backgroundColor = .black
        ScannerRemoteLog.breadcrumb(phase: "treereid_preview_layer_setup", detail: [:])
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
        boxLayer.frame = bounds
    }

    private func connectToSession() {
        // Connect to the TreeReIDBridgeModule's shared capture session.
        // TreeReIDBridgeModule is set as sharedInstance on init.
        let hasShared = TreeReIDBridgeModule.sharedInstance != nil
        ScannerRemoteLog.breadcrumb(phase: "treereid_preview_connect", detail: [
            "hasSharedInstance": hasShared
        ])
        if hasShared {
            previewLayer?.session = TreeReIDBridgeModule.captureSession
            ScannerRemoteLog.breadcrumb(phase: "treereid_preview_connected", detail: [
                "session": TreeReIDBridgeModule.captureSession.description
            ])
        } else {
            ScannerRemoteLog.breadcrumb(phase: "treereid_preview_not_connected_no_instance", detail: [:])
        }
        startBoxOverlay()
    }

    func disconnect() {
        ScannerRemoteLog.breadcrumb(phase: "treereid_preview_disconnect", detail: [:])
        previewLayer?.session = nil
        stopBoxOverlay()
    }

    /// RN không gọi disconnect() khi gỡ view (RCTViewManager không có hook remove).
    /// Bắt thời điểm rời cửa sổ (newWindow == nil) để teardown tất định — mirror
    /// onDetachedFromWindow của Android. KHÔNG dựa vào deinit (đã cắt cycle nhưng
    /// đây là điểm dừng chắc chắn kể cả khi còn ref lạ giữ view).
    override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        if newWindow == nil { disconnect() }
        else if displayLink == nil { startBoxOverlay() }
    }

    deinit { stopBoxOverlay() }

    // MARK: - Overlay khung YOLO
    private func startBoxOverlay() {
        stopBoxOverlay()
        let proxy = DisplayLinkProxy(self)
        let link = CADisplayLink(target: proxy, selector: #selector(DisplayLinkProxy.tick))
        link.preferredFramesPerSecond = 15   // đủ mượt, nhẹ CPU
        link.add(to: .main, forMode: .common)
        displayLink = link
        linkProxy = proxy
    }

    private func stopBoxOverlay() {
        displayLink?.invalidate()
        displayLink = nil
        linkProxy = nil
        boxLayer.path = nil
    }

    fileprivate func tick() {
        guard let (boxes, aspect) = TreeReIDBridgeModule.sharedInstance?.currentYoloBoxes(),
              aspect > 0, !boxes.isEmpty else {
            if boxLayer.path != nil { boxLayer.path = nil }
            return
        }
        let vw = bounds.width, vh = bounds.height
        guard vw > 0, vh > 0 else { return }
        let va = Float(vw / vh)

        // aspect-fill (center-crop) — cùng cách videoGravity=.resizeAspectFill hiển thị.
        let dispW: CGFloat, dispH: CGFloat
        if va > aspect { dispW = vw; dispH = vw / CGFloat(aspect) }
        else { dispH = vh; dispW = vh * CGFloat(aspect) }
        let offX = (vw - dispW) / 2, offY = (vh - dispH) / 2

        let path = UIBezierPath()
        for b in boxes {
            let rect = CGRect(
                x: offX + CGFloat(b.x) * dispW,
                y: offY + CGFloat(b.y) * dispH,
                width: CGFloat(b.w) * dispW,
                height: CGFloat(b.h) * dispH
            )
            path.append(UIBezierPath(roundedRect: rect, cornerRadius: 6))
        }
        CATransaction.begin()
        CATransaction.setDisableActions(true)   // không animate → khỏi nhấp nháy
        boxLayer.path = path.cgPath
        CATransaction.commit()
    }
}