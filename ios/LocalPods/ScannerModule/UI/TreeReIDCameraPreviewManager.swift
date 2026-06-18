import UIKit
import AVFoundation
import React

/// ViewManager for TreeReIDCameraPreview — lets React Native render the camera preview.
@objc(TreeReIDCameraPreviewManager)
final class TreeReIDCameraPreviewManager: RCTViewManager {

    override func view() -> UIView! {
        return TreeReIDCameraPreview()
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
}