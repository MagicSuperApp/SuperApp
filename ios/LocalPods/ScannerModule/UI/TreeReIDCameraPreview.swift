import UIKit
import AVFoundation
import React
import ScannerModule

/// Auto-connects to TreeReIDBridgeModule's shared capture session when view appears.
@objc(TreeReIDCameraPreview)
final class TreeReIDCameraPreview: UIView {

    private var previewLayer: AVCaptureVideoPreviewLayer?

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
        backgroundColor = .black
        ScannerRemoteLog.breadcrumb(phase: "treereid_preview_layer_setup", detail: [:])
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
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
    }

    func disconnect() {
        ScannerRemoteLog.breadcrumb(phase: "treereid_preview_disconnect", detail: [:])
        previewLayer?.session = nil
    }
}