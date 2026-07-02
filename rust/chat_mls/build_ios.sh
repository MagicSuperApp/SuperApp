#!/bin/bash
# ================================================================
# chat_mls — iOS Rust Build (static lib .a cho device / simulator).
# Header ios/chat_mls.h do build.rs (cbindgen) tự sinh khi cargo build.
#
# Usage: ./build_ios.sh [device|simulator|universal]   (mặc định device)
# Output: rust/chat_mls/ios/libchat_mls.a (+ chat_mls.h)
# ================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-device}"
OUT="$SCRIPT_DIR/ios"
mkdir -p "$OUT"
# KHÔNG xoá cả thư mục ios/ (chứa chat_mls.podspec + module_shim.c committed).
rm -f "$OUT"/*.a

rustup target add aarch64-apple-ios 2>/dev/null || true
rustup target add aarch64-apple-ios-sim x86_64-apple-ios 2>/dev/null || true

build() { # $1 = target
  echo "🔨 cargo build --release --lib --target $1"
  cargo build --release --lib --target "$1" --target-dir "$SCRIPT_DIR/target-ios"
}

case "$MODE" in
  simulator)
    build aarch64-apple-ios-sim
    cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios-sim/release/libchat_mls.a" "$OUT/"
    ;;
  universal)
    build aarch64-apple-ios
    build aarch64-apple-ios-sim
    if command -v cargo-lipo &> /dev/null; then
      cargo lipo --release --lib --targets "aarch64-apple-ios,aarch64-apple-ios-sim" \
        --target-dir "$SCRIPT_DIR/target-ios"
      cp "$SCRIPT_DIR/target-ios/universal/release/libchat_mls.a" "$OUT/" || \
      cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios/release/libchat_mls.a" "$OUT/"
    else
      echo "⚠️ cargo-lipo chưa cài — dùng bản device."
      cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios/release/libchat_mls.a" "$OUT/"
    fi
    ;;
  device|*)
    build aarch64-apple-ios
    cp "$SCRIPT_DIR/target-ios/aarch64-apple-ios/release/libchat_mls.a" "$OUT/"
    ;;
esac

echo "✅ iOS build xong:"
ls -lh "$OUT"/*.a "$OUT"/chat_mls.h 2>/dev/null
[ -f "$OUT/chat_mls.h" ] || { echo "❌ chat_mls.h chưa sinh (build.rs cbindgen?)"; exit 1; }
