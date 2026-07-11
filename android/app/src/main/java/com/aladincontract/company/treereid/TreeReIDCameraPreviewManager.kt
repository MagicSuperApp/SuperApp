package com.aladincontract.company.treereid

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

/**
 * Native view "TreeReIDCameraPreview" — khớp tên iOS để JS dùng chung
 * `requireNativeComponent('TreeReIDCameraPreview')`. Trả wrapper chứa CameraX
 * PreviewView, gắn PreviewView bên trong vào controller dùng chung (TreeReIDCamera).
 */
class TreeReIDCameraPreviewManager : SimpleViewManager<TreeReIDPreviewView>() {

    override fun getName() = "TreeReIDCameraPreview"

    override fun createViewInstance(reactContext: ThemedReactContext): TreeReIDPreviewView {
        val view = TreeReIDPreviewView(reactContext)
        TreeReIDCamera.attachPreview(view.previewView)
        return view
    }

    override fun onDropViewInstance(view: TreeReIDPreviewView) {
        super.onDropViewInstance(view)
        view.previewView.controller = null
    }
}
