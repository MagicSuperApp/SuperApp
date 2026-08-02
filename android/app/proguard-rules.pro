# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ✅ TensorFlow Lite - Keep all classes (required for model loading)
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.gpu.** { *; }
-keep class org.tensorflow.lite.nnapi.** { *; }
-keep class org.tensorflow.lite.support.** { *; }

# ✅ TensorFlow Lite GPU - Suppress warnings for optional classes
-dontwarn org.tensorflow.lite.gpu.GpuDelegateFactory$Options$GpuBackend
-dontwarn org.tensorflow.lite.gpu.GpuDelegateFactory$Options
-dontwarn org.tensorflow.lite.gpu.**

# ✅ Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# ══════════════════════════════════════════════════════════════════════════════
# expo-gl (nền 3D: Space3D / FruitPlace3D) — CRASH NGAY khi mở màn 3D ở bản
# release/AAB, còn debug thì không (debug KHÔNG bật R8).
#
# GỐC RỄ: gói `expo-gl` KHÔNG ship consumerProguardFiles nào (khác expo và
# expo-modules-core — hai gói đó có sẵn rules và tự áp vào app), mà C++ của nó
# lại tra cứu phương thức Java THEO TÊN:
#
#   expo-gl/android/src/main/cpp/EXGLJniApi.cpp — EXGLContextPrepare():
#       jclass  GLContextClass  = env->GetObjectClass(glContext);
#       jmethodID flushMethodRef = env->GetMethodID(GLContextClass, "flush", "()V");
#       ... threadLocalEnv->CallVoidMethod(glContextRef, flushMethodRef);
#
# `expo.modules.gl.GLContext` là class Java THƯỜNG — không extends Module,
# không implements ExpoView/Record, không @DoNotStrip → không rule nào (của RN,
# của expo-modules-core, hay của app) giữ tên `flush()`. R8 đổi tên/nội-tuyến nó
# → GetMethodID trả NULL (+ pending NoSuchMethodError) → CallVoidMethod với
# jmethodID NULL → JNI abort (SIGABRT) ngay lần flush đầu tiên, tức ĐÚNG lúc
# ngữ-cảnh GL được dựng = khoảnh khắc <Canvas> gắn vào cây.
#
# Giữ cả gói cho chắc: chỉ có 5 class (GLContext, GLView, GLModule, GLObject,
# GLCameraObject) + cpp/EXGL, giữ hết cũng gần như không tăng kích thước.
# ══════════════════════════════════════════════════════════════════════════════
-keep class expo.modules.gl.** { *; }
