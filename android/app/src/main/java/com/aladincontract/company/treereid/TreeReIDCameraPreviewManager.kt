package com.aladincontract.company.treereid

import androidx.camera.view.PreviewView
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

/**
 * Native view "TreeReIDCameraPreview" — khớp tên iOS để JS dùng chung
 * `requireNativeComponent('TreeReIDCameraPreview')`. Tạo CameraX PreviewView và
 * gắn vào controller dùng chung (TreeReIDCamera holder).
 */
class TreeReIDCameraPreviewManager : SimpleViewManager<PreviewView>() {

    override fun getName() = "TreeReIDCameraPreview"

    override fun createViewInstance(reactContext: ThemedReactContext): PreviewView {
        val view = PreviewView(reactContext).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        TreeReIDCamera.attachPreview(view)
        return view
    }

    override fun onDropViewInstance(view: PreviewView) {
        super.onDropViewInstance(view)
        view.controller = null
    }
}
