#!/bin/bash
# ================================================================
# PhoenixKey — iOS Rust Build Script
# Compiles Rust Core → iOS Static Library (.a) for device + simulator
#
# Usage:
#   ./build_ios.sh [universal|device|simulator]
#
# Requirements:
#   - Rust: rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim
#   - cargo-lipo: cargo install cargo-lipo (recommended for universal libs)
#
# Output:
#   rust_core/ios/
#     ├── libtaad_enclave_core.a          (universal, arm64 + x86_64)
#     └── taad_enclave_core.h             (C header for FFI)
# ================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD_MODE="${1:-universal}"
OUTPUT_DIR="$SCRIPT_DIR/ios"
# NOTE: KHÔNG `rm -rf "$OUTPUT_DIR"` — thư mục ios/ chứa taad_enclave_core.podspec
# (committed). Chỉ dọn build-output (.a/.h) bên dưới, giữ podspec.
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/*.a "$OUTPUT_DIR"/taad_enclave_core.h

echo "📦 iOS Rust Build — Mode: $BUILD_MODE"

# Add Rust targets
echo "🔧 Adding iOS Rust targets..."
rustup target add aarch64-apple-ios 2>/dev/null || true
rustup target add x86_64-apple-ios 2>/dev/null || true
rustup target add aarch64-apple-ios-sim 2>/dev/null || true

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$SCRIPT_DIR/target-ios"
rm -rf "$OUTPUT_DIR"/*.a

# Generate C header from Rust
echo "📄 Generating C header (cbindgen)..."
if command -v cbindgen &> /dev/null; then
    # Create cbindgen.toml for proper config
    cat > "$SCRIPT_DIR/cbindgen.toml" << 'EOF'
language = "C"
autogen_warning = "/* DO NOT EDIT */"
include_guard = "TAAD_ENCLAVE_CORE_H"
namespace = "taad_enclave_core"
EOF
    cbindgen --config "$SCRIPT_DIR/cbindgen.toml" --crate taad_enclave_core -o "$OUTPUT_DIR/taad_enclave_core.h" || true
fi

case "$BUILD_MODE" in
    device)
        echo "📱 Building for iOS Device (arm64)..."
        cargo build --release \
            --target aarch64-apple-ios \
            --lib \
            --target-dir "$SCRIPT_DIR/target-ios"
        cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios/release/libtaad_enclave_core.a" "$OUTPUT_DIR/"
        ;;

    simulator)
        echo "🖥️  Building for iOS Simulator (arm64 + x86_64)..."
        cargo build --release \
            --target aarch64-apple-ios-sim \
            --lib \
            --target-dir "$SCRIPT_DIR/target-ios"
        cargo build --release \
            --target x86_64-apple-ios \
            --lib \
            --target-dir "$SCRIPT_DIR/target-ios"
        cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios-sim/release/libtaad_enclave_core.a" "$OUTPUT_DIR/"
        ;;

    universal|*)
        echo "🔨 Building Universal Library (Device + Simulator)..."

        # Build for device
        echo "  → arm64 (device)..."
        cargo build --release \
            --target aarch64-apple-ios \
            --lib \
            --target-dir "$SCRIPT_DIR/target-ios"

        # Build for simulator (both archs)
        echo "  → arm64 (simulator)..."
        cargo build --release \
            --target aarch64-apple-ios-sim \
            --lib \
            --target-dir "$SCRIPT_DIR/target-ios"

        echo "  → x86_64 (simulator)..."
        cargo build --release \
            --target x86_64-apple-ios \
            --lib \
            --target-dir "$SCRIPT_DIR/target-ios"

        # LipO into universal binary (if available)
        if command -v cargo-lipo &> /dev/null; then
            echo "  → Combining with cargo-lipo..."
            cargo lipo \
                --targets "aarch64-apple-ios,aarch64-apple-ios-sim,x86_64-apple-ios" \
                --release \
                --lib
            cp "$SCRIPT_DIR/target-ios/universal/release/libtaad_enclave_core.a" "$OUTPUT_DIR/" || \
            cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios/release/libtaad_enclave_core.a" "$OUTPUT_DIR/"
        else
            echo "  ⚠️  cargo-lipo not installed — using device binary only"
            echo "  Install with: cargo install cargo-lipo"
            cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios/release/libtaad_enclave_core.a" "$OUTPUT_DIR/"
        fi
        ;;
esac

# List output
echo ""
echo "✅ iOS build complete!"
echo "   Output: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR"/*

echo ""
echo "📋 Integration Steps:"
echo "   1. Add .a file to Xcode project (Link Binary With Libraries)"
echo "   2. Add taad_enclave_core.h to project"
echo "   3. Link libSystem.tbd (for JNI-equivalent calls)"
echo "   Or use CocoaPods: create ios/taad_enclave_core.podspec"
