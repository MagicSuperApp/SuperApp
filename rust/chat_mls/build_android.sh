#!/bin/bash
# ================================================================
# chat_mls — Android Rust Build → libchat_mls.so per-ABI vào jniLibs.
# Dùng cargo-ndk (giống codemagic). Cần ANDROID_NDK_HOME.
#
# Usage: ./build_android.sh
# Output: android/app/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86_64}/libchat_mls.so
# ================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -z "${ANDROID_NDK_HOME:-}" ] && [ -n "${ANDROID_SDK_ROOT:-}" ]; then
  export ANDROID_NDK_HOME=$(ls -d "$ANDROID_SDK_ROOT"/ndk/*/ 2>/dev/null | sort | tail -1)
fi
[ -n "${ANDROID_NDK_HOME:-}" ] || { echo "❌ ANDROID_NDK_HOME chưa set"; exit 1; }
echo "📦 NDK: $ANDROID_NDK_HOME"

rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android 2>/dev/null || true
command -v cargo-ndk &> /dev/null || cargo install cargo-ndk

JNI_LIBS="$SCRIPT_DIR/../../android/app/src/main/jniLibs"
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -o "$JNI_LIBS" build --release --lib

echo "✅ Android build xong:"
ls -lh "$JNI_LIBS"/*/libchat_mls.so 2>/dev/null
[ -f "$JNI_LIBS/arm64-v8a/libchat_mls.so" ] || { echo "❌ libchat_mls.so (arm64-v8a) chưa build"; exit 1; }
