#!/usr/bin/env bash
#
# Dựng Android TRÊN TIGER — máy dùng chung, không dựng trên máy của từng người.
#
#   ssh tiger-cloud
#   cd <bản làm việc của bạn>
#   bash scripts/build-android-on-tiger.sh                    # chỉ KIỂM
#   bash scripts/build-android-on-tiger.sh --install          # kiểm rồi cài phần thiếu
#   bash scripts/build-android-on-tiger.sh --build aladin-apk
#   bash scripts/build-android-on-tiger.sh --build checkfarm-apk
#   bash scripts/build-android-on-tiger.sh --build aladin-aab
#
# ── VÌ SAO CÓ TỆP NÀY, KHÁC GÌ `scripts/build-android.sh` ──────────────────────
#
# `build-android.sh` dựng trên MÁY CỦA BẠN và cài mọi thứ bằng Homebrew ⇒ chỉ
# chạy trên macOS. Tệp này dựng trên Tiger (Ubuntu 22.04, 24 nhân, 62 GB), nơi bộ
# SDK nặng đã cài sẵn MỘT bản dùng chung:
#
#     /srv/lampnet/android-sdk       ~5 GB, root sở hữu, ai cũng đọc được
#
# Dev thứ tám không phải tải lại 2,5 GB, và không ai giữ được một bản SDK lệch
# phiên bản trong nhà riêng. Cùng lối với `/srv/lampnet/bin/run-app` mà
# TigerServer dựng 11/08/2026.
#
# ⛔ KHÔNG dựng được iOS ở đây, và đừng đi tìm cách. Đo 04/09/2026 trên Tiger:
#    `xcodebuild` và `swift` đều không có, máy là Linux x86_64. Xcode chỉ chạy
#    trên macOS — ràng buộc của Apple, không phải thiếu gói. Đường iOS thật:
#    Codemagic (đang dùng), một máy Mac đặt làm runner, hoặc Mac thuê.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHARED_SDK="/srv/lampnet/android-sdk"

# ── Phiên bản đọc THẲNG từ gradle, không gõ cứng ────────────────────────────
# Gõ cứng ở đây nghĩa là ngày ai đó nâng NDK trong gradle thì script vẫn xanh
# trong khi Gradle đã đòi bản khác. Đọc từ nguồn thì hai bên không lệch được.
read_gradle() { awk -v k="$1" '$1==k && $2=="=" { v=$3; gsub(/"/,"",v); print v; exit }' android/build.gradle; }

WANT_NDK="$(read_gradle ndkVersion)"
WANT_BUILDTOOLS="$(read_gradle buildToolsVersion)"
WANT_COMPILESDK="$(read_gradle compileSdkVersion)"

# Kiểm HÌNH DẠNG, không chỉ kiểm rỗng. Một chuỗi rác vẫn khác rỗng, và nếu chỉ
# chặn rỗng thì rác đi thẳng xuống dưới rồi biến thành "máy bạn thiếu NDK".
shape_error=""
[[ "$WANT_NDK"        =~ ^[0-9]+(\.[0-9]+)+$ ]] || shape_error+=" ndkVersion='$WANT_NDK'"
[[ "$WANT_BUILDTOOLS" =~ ^[0-9]+(\.[0-9]+)+$ ]] || shape_error+=" buildToolsVersion='$WANT_BUILDTOOLS'"
[[ "$WANT_COMPILESDK" =~ ^[0-9]+$ ]]            || shape_error+=" compileSdkVersion='$WANT_COMPILESDK'"
if [ -n "$shape_error" ]; then
  echo "⛔ Đọc phiên bản ra thứ không đúng hình dạng — android/build.gradle đổi cấu trúc."
  echo "   Sai:$shape_error"
  echo "   Đây là lỗi của script này, KHÔNG phải máy thiếu gì."
  exit 1
fi

MODE="check"
TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install) MODE="install" ;;
    --build)   MODE="build"; TARGET="${2:-}"; shift ;;
    *) echo "Không hiểu tham số: $1"; exit 1 ;;
  esac
  shift
done

MISSING=()
note_missing() { MISSING+=("$1"); printf '  ✗ %s\n' "$1"; }
note_ok()      { printf '  ✓ %s\n' "$1"; }

echo "══ Cần gì (đọc từ android/build.gradle) ══"
echo "   NDK $WANT_NDK · build-tools $WANT_BUILDTOOLS · compileSdk $WANT_COMPILESDK"
echo
echo "══ Máy này đang có gì ══"

# ── 1. Đúng máy chưa ────────────────────────────────────────────────────────
if [ "$(uname -s)" != "Linux" ]; then
  echo "  ⛔ Đây không phải Tiger — script này dành cho máy dùng chung Linux."
  echo "     Dựng trên máy của bạn thì dùng: bash scripts/build-android.sh"
  exit 1
fi
note_ok "Linux $(uname -m)"

# ── 2. JDK ──────────────────────────────────────────────────────────────────
if command -v javac >/dev/null 2>&1; then
  detected_java_home="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
  export JAVA_HOME="${JAVA_HOME:-$detected_java_home}"
  note_ok "JDK $(javac -version 2>&1 | awk '{print $2}') tại $JAVA_HOME"
else
  note_missing "JDK 17 — việc toàn máy, nhắn TigerServer (apt không có đường vòng)"
fi

# ── 3. Node ─────────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  note_ok "Node $(node --version)"
else
  note_missing "Node — việc toàn máy, nhắn TigerServer"
fi

# ── 4. SDK dùng chung ───────────────────────────────────────────────────────
# Đo bằng THƯ MỤC PHIÊN BẢN, không đo bằng `sdkmanager --list_installed`: lệnh
# đó gọi mạng và mất vài giây mỗi lượt, còn thứ gradle thật sự tìm là thư mục.
if [ -d "$SHARED_SDK" ]; then
  note_ok "SDK dùng chung $SHARED_SDK"
  export ANDROID_HOME="$SHARED_SDK"
  export ANDROID_SDK_ROOT="$SHARED_SDK"
  [ -d "$SHARED_SDK/ndk/$WANT_NDK" ] \
    && note_ok "NDK $WANT_NDK" \
    || note_missing "NDK $WANT_NDK trong SDK dùng chung — nhắn TigerServer, đừng cài bản riêng"
  [ -d "$SHARED_SDK/build-tools/$WANT_BUILDTOOLS" ] \
    && note_ok "build-tools $WANT_BUILDTOOLS" \
    || note_missing "build-tools $WANT_BUILDTOOLS trong SDK dùng chung — nhắn TigerServer"
  [ -d "$SHARED_SDK/platforms/android-$WANT_COMPILESDK" ] \
    && note_ok "platform android-$WANT_COMPILESDK" \
    || note_missing "platform android-$WANT_COMPILESDK trong SDK dùng chung — nhắn TigerServer"
  # Thư viện bên thứ ba đòi platform/build-tools CŨ hơn app. Đo 04/09/2026 khi
  # dựng thật: `:expo` đòi `build-tools;35.0.0`, `:react-native-camera-kit` đòi
  # `platforms;android-34`. SDK dùng chung là CHỈ ĐỌC nên gradle không tự tải
  # được, và nó báo "The SDK directory is not writable" — câu đó nghe như lỗi
  # quyền, mà thật ra là "thiếu gói". Kiểm sẵn ở đây để không phải đọc nhầm.
  for extra in build-tools/33.0.1 build-tools/34.0.0 build-tools/35.0.0 \
               platforms/android-33 platforms/android-34 platforms/android-35; do
    [ -d "$SHARED_SDK/$extra" ] \
      || note_missing "$extra (thư viện bên thứ ba đòi) — nhắn TigerServer"
  done
else
  note_missing "SDK dùng chung chưa có ở $SHARED_SDK — nhắn TigerServer"
fi

# ── 5. Rust + cargo-ndk (phần RIÊNG của mỗi người) ──────────────────────────
# Vì sao riêng chứ không dùng chung như SDK: cargo cần GHI vào kho gói và thư
# mục target khi dựng. Một bản dùng chung chỉ-đọc thì dựng đỏ; một bản dùng
# chung cho-ghi thì hai người dựng cùng lúc giẫm lên nhau.
export PATH="$HOME/.cargo/bin:$PATH"
if command -v rustc >/dev/null 2>&1; then
  note_ok "Rust $(rustc --version | awk '{print $2}')"
  all_targets=1
  for t in aarch64-linux-android armv7-linux-androideabi x86_64-linux-android; do
    rustup target list --installed 2>/dev/null | grep -qx "$t" || { all_targets=0; note_missing "target Rust $t"; }
  done
  [ "$all_targets" = 1 ] && note_ok "3 target Android"
else
  note_missing "Rust (rustup)"
fi
if command -v cargo-ndk >/dev/null 2>&1; then
  note_ok "cargo-ndk $(cargo ndk --version 2>/dev/null | awk '{print $2}')"
else
  note_missing "cargo-ndk"
fi

# ── 6. Gói npm ──────────────────────────────────────────────────────────────
[ -d node_modules ] && note_ok "node_modules" || note_missing "node_modules (npm ci)"

# ── 7. Hai tệp cấu hình BỊ GITIGNORE ────────────────────────────────────────
# `android/gradle.properties` (.gitignore:54) và `android/app/secrets.properties`
# không có trong git — CI tự sinh chúng. Ai lấy mã về bằng `git clone` hay
# `git archive` thì KHÔNG có hai tệp này, và triệu chứng không nói ra điều đó:
#
#   Đo 04/09/2026, thiếu `android/gradle.properties`:
#     Could not get unknown property 'hermesEnabled' for project ':app'
#     → kéo theo: A problem occurred configuring project ':expo'.
#                 SoftwareComponent with name 'release' not found.
#
# Người đọc thấy lỗi ở `:expo` rồi đi sửa expo, trong khi chỗ thiếu nằm ở một
# tệp hoàn toàn khác. Kiểm ở đây để lỗi tự khai đúng tên.
[ -f android/gradle.properties ] \
  && note_ok "android/gradle.properties" \
  || note_missing "android/gradle.properties (gitignore) — lấy bộ giá trị ở codemagic.yaml, bước 'Create Android config'"
[ -f android/app/secrets.properties ] \
  && note_ok "android/app/secrets.properties" \
  || note_missing "android/app/secrets.properties (gitignore) — cùng bước codemagic.yaml đó"

echo

# ── Cài phần thiếu ──────────────────────────────────────────────────────────
if [ "$MODE" != "check" ] && [ ${#MISSING[@]} -gt 0 ]; then
  echo "══ Cài phần thiếu (chỉ phần RIÊNG của bạn — SDK dùng chung thì nhắn TigerServer) ══"
  if ! command -v rustc >/dev/null 2>&1; then
    echo "── rustup ──"
    curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
    export PATH="$HOME/.cargo/bin:$PATH"
  fi
  if command -v rustup >/dev/null 2>&1; then
    echo "── target Android ──"
    rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
  fi
  command -v cargo-ndk >/dev/null 2>&1 || { echo "── cargo-ndk ──"; cargo install cargo-ndk --locked; }
  [ -d node_modules ] || { echo "── npm ci ──"; npm ci --no-audit --no-fund; }
  echo
fi

if [ "$MODE" != "build" ]; then
  if [ ${#MISSING[@]} -eq 0 ]; then
    echo "✅ Đủ để dựng. Chạy: bash scripts/build-android-on-tiger.sh --build aladin-apk"
  else
    echo "Còn thiếu ${#MISSING[@]} thứ. Chạy lại với --install (phần riêng), hoặc nhắn TigerServer (phần dùng chung)."
  fi
  exit 0
fi

# ── DỰNG ────────────────────────────────────────────────────────────────────
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⛔ Còn thiếu ${#MISSING[@]} thứ — không dựng. Chạy --install trước."
  exit 1
fi

# Tệp biến môi trường cho react-native-dotenv: KIỂM, không tự sinh.
#
# Nội dung tệp đó đã có HAI bản trong kho — `codemagic.yaml` và
# `.github/actions/rn-env/action.yml` — và chính hai bản ấy đã một lần lệch
# nhau, cho ra hai ứng dụng khác nhau từ cùng một commit (bản Codemagic nối máy
# chủ thật, bản GitHub nối localhost). Sinh thêm bản thứ ba ở đây là dựng lại
# đúng cái bẫy vừa gỡ, nên script này TỪ CHỐI đoán, và chỉ nói chỗ lấy.
#
# `assembleDebug` của React Native KHÔNG gói JS vào apk (app nạp từ Metro), nên
# thiếu tệp này chưa chặn bản debug — nhưng bản release thì nướng JS vào gói, và
# thiếu nó thì mọi `import … from '@env'` thành `undefined` LẶNG LẼ.
ENV_FILE="$ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  case "$TARGET" in
    *-aab|*-release)
      echo "⛔ Không có tệp biến môi trường, mà đích '$TARGET' nướng JS vào gói."
      echo "   Thiếu nó thì mọi biến '@env' thành undefined KHÔNG BÁO LỖI, và app"
      echo "   rơi về localhost trên máy người dùng."
      echo "   Lấy đúng bộ giá trị ở một trong hai chỗ (giữ hai chỗ đó khớp nhau):"
      echo "     codemagic.yaml — bước 'Create .env for React Native'"
      echo "     .github/actions/rn-env/action.yml"
      exit 1 ;;
    *)
      echo "⚠ Không có tệp biến môi trường. Bản debug không nướng JS nên vẫn dựng được."
      echo "  Bản release thì BẮT BUỘC có — xem codemagic.yaml / .github/actions/rn-env/." ;;
  esac
fi

echo "══ Dựng Rust → jniLibs ══"
# `.so` của taad_enclave_core và chat_mls KHÔNG có trong git và gradle không tự
# dựng chúng. Thiếu chúng thì app vẫn cài được và vẫn mở được — chỉ toàn bộ tầng
# danh tính PhoenixKey và chat mã hoá đầu-cuối là im lặng không dùng được.
# Nguồn: .github/actions/rust-android/action.yml
ANDROID_NDK_HOME="$(ls -d "$ANDROID_SDK_ROOT"/ndk/*/ 2>/dev/null | sort | tail -1)"
export ANDROID_NDK_HOME
echo "   NDK: $ANDROID_NDK_HOME"
for crate in taad_enclave_core chat_mls; do
  echo "── $crate ──"
  ( cd "rust/$crate" && cargo ndk \
      -t arm64-v8a -t armeabi-v7a -t x86_64 \
      -o ../../android/app/src/main/jniLibs \
      build --release --lib ) || { echo "⛔ dựng $crate đỏ"; exit 1; }
done

# Kiểm SAU khi dựng. Thiếu .so mà vẫn cho qua thì lỗi chỉ lộ trên máy người dùng,
# dưới dạng "tính năng không khả dụng" chứ không phải dưới dạng build đỏ.
echo "── kiểm .so ──"
missing_lib=0
for abi in arm64-v8a armeabi-v7a x86_64; do
  for lib in libtaad_enclave_core.so libchat_mls.so; do
    f="android/app/src/main/jniLibs/$abi/$lib"
    if [ -f "$f" ]; then echo "  ok  $f ($(stat -c%s "$f") byte)"; else echo "  ✗  thiếu $f"; missing_lib=1; fi
  done
done
[ "$missing_lib" -eq 0 ] || { echo "⛔ thiếu .so — dừng"; exit 1; }

# Gọi flavor TƯỜNG MINH. `assembleDebug` (không flavor) dựng CẢ HAI app, và
# `codemagic.yaml` đã bỏ hẳn dạng đó vì đúng lý do ấy.
case "$TARGET" in
  aladin-apk)    TASK="assembleAladinDebug" ;;
  aladin-aab)    TASK="bundleAladinRelease" ;;
  checkfarm-apk) TASK="assembleCheckfarmDebug" ;;
  checkfarm-aab) TASK="bundleCheckfarmRelease" ;;
  *) echo "⛔ Đích không hợp lệ: '$TARGET'"
     echo "   Chọn: aladin-apk · aladin-aab · checkfarm-apk · checkfarm-aab"; exit 1 ;;
esac

echo
echo "══ Gradle $TASK ══"
( cd android && ./gradlew "$TASK" ) || { echo "⛔ gradle đỏ"; exit 1; }

echo
echo "══ Tệp ra ══"
find android/app/build/outputs \( -name '*.apk' -o -name '*.aab' \) 2>/dev/null | while read -r f; do
  echo "  $f  ($(stat -c%s "$f") byte)"
done

# Khoá ký: script này KHÔNG đụng tới. Bản release cần khoá của ĐÚNG pháp nhân
# (Aladin và CheckFarm là hai pháp nhân, hai khoá) và khoá không nằm trong kho.
