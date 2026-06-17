import UIKit
import AVFoundation

/// UIView subclass that hosts AVCaptureVideoPreviewLayer for camera preview.
final class CameraPreviewView: UIView {

    // MARK: - Properties

    private var previewLayer: AVCaptureVideoPreviewLayer?

    /// The camera session to display.
    var session: AVCaptureSession? {
        didSet {
            previewLayer?.session = session
        }
    }

    // MARK: - Layout

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    // MARK: - Init

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupPreviewLayer()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupPreviewLayer()
    }

    // MARK: - Private

    private func setupPreviewLayer() {
        let layer = AVCaptureVideoPreviewLayer()
        layer.videoGravity = .resizeAspectFill
        layer.frame = bounds
        self.layer.addSublayer(layer)
        previewLayer = layer
        backgroundColor = .black
    }

    // MARK: - Session Connection

    /// Connect a capture session to this preview view.
    func connect(to session: AVCaptureSession) {
        previewLayer?.session = session
    }
}
