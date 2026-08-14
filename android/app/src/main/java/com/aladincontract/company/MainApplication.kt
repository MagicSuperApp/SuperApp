package com.aladincontract.company

import android.app.Application
import android.content.res.Configuration
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
// expo-modules-core: cần cho expo-gl (nền 3D three.js / @react-three/fiber).
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Add custom packages here
          add(PhoenixKeyPackage())
          add(com.aladincontract.company.treereid.TreeReIDPackage())
          // La bàn dùng chung (màn Dẫn đường). Bọc lại HeadingSensorReader vốn
          // nằm trong TreeReID — đọc hướng mà không phải mở camera.
          add(com.aladincontract.company.compass.CompassHeadingPackage())
        },
      // BẮT BUỘC ghi rõ "index". getDefaultReactHost của Expo mặc định
      // jsMainModulePath = ".expo/.virtual-metro-entry" — entry ảo của Expo CLI.
      // App này chạy metro RN gốc (index.js), không có đường dẫn ảo đó → dev server
      // trả 404: "Unable to resolve module ./.expo/.virtual-metro-entry".
      jsMainModulePath = "index",
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
