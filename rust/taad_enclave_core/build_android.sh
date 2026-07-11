#!/bin/bash
# ================================================================
# PhoenixKey — Android Rust Build Script
# Compiles Rust Core → Android .so libraries (JNI)
#
# Usage:
#   ./build_android.sh [path/to/android/ndk]
#
# Requirements:
#   - Rust:    rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
#   - NDK:     Android NDK (download from Android Studio SDK Manager)
#   - cargo-ndk: cargo install cargo-ndk (optional, simplifies setup)
#
# Output:
#   rust_core/android/libs/{arm64-v8a,armeabi-v7a,x86_64,x86}/
#     └── libtaad_enclave_core.so
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Detect NDK path — check multiple env vars
if [ -n "${ANDROID_NDK_HOME:-}" ]; then
    NDK_PATH="$ANDROID_NDK_HOME"
elif [ -n "${ANDROID_NDK_PATH:-}" ]; then
    NDK_PATH="$ANDROID_NDK_PATH"
elif [ -n "${ANDROID_SDK_ROOT:-}" ] && [ -d "$ANDROID_SDK_ROOT/ndk" ]; then
    NDK_PATH=$(ls -d "$ANDROID_SDK_ROOT/ndk"/*/ 2>/dev/null | tail -1 | tr -d '/')
else
    NDK_PATH="${1:-}"
    if [ -z "$NDK_PATH" ] || [ ! -d "$NDK_PATH" ]; then
        echo "❌ Error: NDK path not found."
        echo "   Checked: ANDROID_NDK_HOME, ANDROID_NDK_PATH, ANDROID_SDK_ROOT/ndk"
        echo "   Set via: export ANDROID_NDK_HOME=/path/to/ndk"
        exit 1
    fi
fi

echo "📦 NDK Path: $NDK_PATH"

# Add Rust targets if not already present
echo "🔧 Adding Rust targets..."
rustup target add aarch64-linux-android 2>/dev/null || true
rustup target add armv7-linux-androideabi 2>/dev/null || true
rustup target add x86_64-linux-android 2>/dev/null || true
rustup target add i686-linux-android 2>/dev/null || true

# Output directories
OUTPUT_DIR="$SCRIPT_DIR/android/libs"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/arm64-v8a" "$OUTPUT_DIR/armeabi-v7a" "$OUTPUT_DIR/x86_64" "$OUTPUT_DIR/x86"

# Build for each target
declare -a TARGETS=(
    "aarch64-linux-android"
    "armv7-linux-androideabi"
    "x86_64-linux-android"
    "i686-linux-android"
)

for TARGET in "${TARGETS[@]}"; do
    case "$TARGET" in
        aarch64-linux-android)  OUTPUT_SUBDIR="arm64-v8a" ;;
        armv7-linux-androideabi) OUTPUT_SUBDIR="armeabi-v7a" ;;
        x86_64-linux-android)   OUTPUT_SUBDIR="x86_64" ;;
        i686-linux-android)     OUTPUT_SUBDIR="x86" ;;
    esac

    echo "🔨 Building for $TARGET → $OUTPUT_SUBDIR..."

    # Find NDK toolchain for this target
    NDK_TOOLCHAIN=""
    for TOOLCHAIN in "$NDK_PATH/toolchains/llvm/prebuilt/"*/; do
        if [ -d "$TOOLCHAIN" ]; then
            NDK_TOOLCHAIN="$TOOLCHAIN"
            break
        fi
    done

    if [ -z "$NDK_TOOLCHAIN" ]; then
        echo "⚠️  Warning: Could not find NDK toolchain, trying cargo-ndk..."
        # cargo-ndk sets CC/AR automatically, but we need --target-dir
        if command -v cargo-ndk &> /dev/null; then
            cargo ndk -t "$TARGET" -o "$SCRIPT_DIR/target-android/$TARGET/release" build --release --lib 2>/dev/null || \
            cargo build --release --target "$TARGET" --lib --target-dir "$SCRIPT_DIR/target-android"
        else
            echo "❌ Error: NDK toolchain not found and cargo-ndk not installed."
            echo "   Install NDK: Android Studio → SDK Manager → Android NDK"
            echo "   Or: cargo install cargo-ndk"
            exit 1
        fi
    else
        # Set environment for cross-compilation
        export CC="$NDK_TOOLCHAIN/bin/clang"
        export AR="$NDK_TOOLCHAIN/bin/llvm-ar"

        cargo build --release \
            --target "$TARGET" \
            --lib \
            --target-dir "$SCRIPT_DIR/target-android"
    fi

    # Copy .so to output directory
    cp "$SCRIPT_DIR/target-android/$TARGET/release/libtaad_enclave_core.so" \
       "$OUTPUT_DIR/$OUTPUT_SUBDIR/libtaad_enclave_core.so" 2>/dev/null || true
done

# Summary
echo ""
echo "✅ Android build complete!"
echo "   Output: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"/*/

# Verify .so files exist
SHAS_OK=true
for SUBDIR in arm64-v8a armeabi-v7a x86_64 x86; do
    if [ ! -f "$OUTPUT_DIR/$SUBDIR/libtaad_enclave_core.so" ]; then
        echo "⚠️  Warning: Missing $SUBDIR library"
        SHAS_OK=false
    fi
done

if [ "$SHAS_OK" = true ]; then
    echo ""
    echo "📋 Next steps:"
    echo "   1. Copy libs/ to android/app/src/main/"
    echo "   2. Update MainActivity.kt to load Rust library via JNI"
    echo "   3. Build APK: flutter build apk --release"
fi
