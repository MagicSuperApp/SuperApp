#!/usr/bin/env bash
#
# Dựng Android trên máy bất kỳ — không phụ thuộc một người.
#
# Vì sao có tệp này. Trên máy đã dựng được app, `java -version` vẫn báo
# "Unable to locate a Java Runtime": JDK có cài nhưng không nằm trên PATH mặc
# định của macOS. Người khác gặp đúng chỗ đó thì kết luận "máy tôi thiếu Java"
# rồi đi cài thêm bản thứ hai, và Gradle chọn nhầm bản. Script này ghim ĐÚNG
# các phiên bản mà `android/build.gradle` khai, rồi tự đối chiếu lại.
#
#   bash scripts/build-android.sh              # chỉ KIỂM, không đụng gì
#   bash scripts/build-android.sh --cai        # kiểm, rồi cài phần còn thiếu
#   bash scripts/build-android.sh --dung aladin-aab      # kiểm rồi dựng
#   bash scripts/build-android.sh --dung checkfarm-apk
#
# Script này KHÔNG đụng tới khoá ký. Xem mục "Khoá ký" ở cuối khi nó báo thiếu.

set -uo pipefail

GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$GOC"

# ── Phiên bản đọc THẲNG từ gradle, không gõ cứng ────────────────────────────
# Gõ cứng ở đây nghĩa là ngày ai đó nâng NDK trong gradle thì script vẫn xanh
# trong khi Gradle đã đòi bản khác. Đọc từ nguồn thì hai bên không lệch được.
# awk, KHÔNG sed: `\s` không phải cú pháp POSIX, và sed của macOS không hiểu nó.
# Dùng `\s` ở đây thì biểu thức không khớp mà cũng KHÔNG báo lỗi — nó trả về cả
# dòng làm "phiên bản", rồi mọi phép kiểm thư mục bên dưới trượt, và script đổ
# lỗi cho máy người dùng thay vì cho chính nó.
doc_gradle() { awk -v k="$1" '$1==k && $2=="=" { v=$3; gsub(/"/,"",v); print v; exit }' android/build.gradle; }

NDK_CAN="$(doc_gradle ndkVersion)"
BUILDTOOLS_CAN="$(doc_gradle buildToolsVersion)"
COMPILESDK_CAN="$(doc_gradle compileSdkVersion)"
NODE_CAN="$(grep -oE '"node":[[:space:]]*">=[[:space:]]*[0-9]+' package.json | grep -oE '[0-9]+$')"

# Kiểm HÌNH DẠNG, không chỉ kiểm rỗng. Một chuỗi rác vẫn khác rỗng, và nếu chỉ
# chặn rỗng thì rác đi thẳng xuống dưới và biến thành "máy bạn thiếu NDK".
loi_hinh_dang=""
[[ "$NDK_CAN"        =~ ^[0-9]+(\.[0-9]+)+$ ]] || loi_hinh_dang+=" ndkVersion='$NDK_CAN'"
[[ "$BUILDTOOLS_CAN" =~ ^[0-9]+(\.[0-9]+)+$ ]] || loi_hinh_dang+=" buildToolsVersion='$BUILDTOOLS_CAN'"
[[ "$COMPILESDK_CAN" =~ ^[0-9]+$ ]]            || loi_hinh_dang+=" compileSdkVersion='$COMPILESDK_CAN'"
[[ "$NODE_CAN"       =~ ^[0-9]+$ ]]            || loi_hinh_dang+=" node='$NODE_CAN'"
if [ -n "$loi_hinh_dang" ]; then
  echo "⛔ Đọc phiên bản ra thứ không đúng hình dạng — android/build.gradle hoặc package.json đổi cấu trúc."
  echo "   Sai:$loi_hinh_dang"
  echo "   Đây là lỗi của script này, KHÔNG phải máy bạn thiếu gì."
  exit 1
fi

CHE_DO="kiem"
MUC_TIEU=""
while [ $# -gt 0 ]; do
  case "$1" in
    --cai)  CHE_DO="cai" ;;
    --dung) CHE_DO="dung"; MUC_TIEU="${2:-}"; shift ;;
    *) echo "Không hiểu tham số: $1"; exit 1 ;;
  esac
  shift
done

THIEU=()
ghi_thieu() { THIEU+=("$1"); printf '  ✗ %s\n' "$1"; }
ghi_du()    { printf '  ✓ %s\n' "$1"; }

echo "══ Cần gì (đọc từ android/build.gradle + package.json) ══"
echo "   NDK $NDK_CAN · build-tools $BUILDTOOLS_CAN · compileSdk $COMPILESDK_CAN · Node >= $NODE_CAN"
echo
echo "══ Máy này đang có gì ══"

# ── 1. Homebrew ─────────────────────────────────────────────────────────────
# Homebrew là TRÌNH CÀI, không phải thứ Gradle cần. Nó chỉ bắt buộc ở nhánh
# `--cai`, và chỉ trên macOS — đó cũng là chỗ duy nhất script gọi `brew`
# (dòng 157-161).
#
# Trước bản này nó bị tính vào `THIEU`, tức cổng cuối `[ ${#THIEU[@]} -gt 0 ]`
# CHẶN CỨNG mọi lượt dựng trên Windows và Linux — nơi Homebrew không có và
# không bao giờ có. Đo được trên máy Windows 10/09: JDK 21 ✓, Node ✓, SDK ✓,
# NDK ✓, build-tools ✓, platform ✓, node_modules ✓ — đủ hết — mà script vẫn
# in "⛔ Thiếu 1 thứ, chưa dựng được" rồi khuyên chạy `--cai`, và `--cai` lại
# thoát ngay ở dòng 157 vì không có brew. Ngõ cụt, và câu lỗi chỉ sang một
# thứ không liên quan tới cái đang thiếu.
#
# `sdkmanager` ngay dưới đã ở đúng mức này rồi (○, không tính vào THIEU). Đây
# là đưa Homebrew về cùng mức, chứ không phải nới cổng: những thứ Gradle THẬT
# SỰ cần vẫn chặn y nguyên.
if command -v brew >/dev/null 2>&1; then
  ghi_du "Homebrew $(brew --version | head -1 | awk '{print $2}')"
elif [ "$(uname -s)" = "Darwin" ]; then
  ghi_thieu "Homebrew — cài tay: https://brew.sh (script này không tự cài trình cài gói)"
else
  printf '  ○ Homebrew không có — trên nền này không cần; chỉ `--cai` (macOS) mới dùng tới\n'
fi

# ── 2. JDK 17 ───────────────────────────────────────────────────────────────
# Đo bằng đường dẫn thật, KHÔNG bằng `java -version`: trên macOS lệnh đó có thể
# đỏ trong khi JDK vẫn có, vì nó không nằm trên PATH.
JDK_DUONG=""
if command -v brew >/dev/null 2>&1 && brew --prefix openjdk@17 >/dev/null 2>&1; then
  UNG_VIEN="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
  [ -x "$UNG_VIEN/bin/javac" ] && JDK_DUONG="$UNG_VIEN"
fi
if [ -z "$JDK_DUONG" ] && [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/javac" ]; then
  JDK_DUONG="$JAVA_HOME"
fi
if [ -n "$JDK_DUONG" ]; then
  ghi_du "JDK $("$JDK_DUONG/bin/javac" -version 2>&1 | awk '{print $2}') tại $JDK_DUONG"
else
  ghi_thieu "JDK 17 (brew install openjdk@17)"
fi

# ── 3. Node ─────────────────────────────────────────────────────────────────
if command -v node >/dev/null 2>&1; then
  NODE_CO="$(node -v | tr -d 'v' | cut -d. -f1)"
  if [ "$NODE_CO" -ge "$NODE_CAN" ]; then
    ghi_du "Node $(node -v)"
  else
    ghi_thieu "Node $(node -v) quá cũ, cần >= $NODE_CAN"
  fi
else
  ghi_thieu "Node >= $NODE_CAN (brew install node)"
fi

# ── 4. Android SDK ──────────────────────────────────────────────────────────
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [ -d "$SDK" ]; then
  ghi_du "Android SDK tại $SDK"
else
  ghi_thieu "Android SDK — cài Android Studio, hoặc brew install --cask android-commandlinetools"
fi

SDKMANAGER=""
for d in "$SDK/cmdline-tools/latest/bin/sdkmanager" "$SDK/cmdline-tools"/*/bin/sdkmanager "$SDK/tools/bin/sdkmanager"; do
  [ -x "$d" ] && { SDKMANAGER="$d"; break; }
done
# sdkmanager KHÔNG phải điều kiện để dựng — nó chỉ cần cho chế độ `--cai`.
# Máy đã dựng được AAB mà không có nó. Xếp nó vào THIẾU sẽ chặn đúng những máy
# đang chạy tốt, và đó là cổng chặn nhầm chỗ.
if [ -n "$SDKMANAGER" ]; then
  ghi_du "sdkmanager"
else
  printf '  ○ sdkmanager (cmdline-tools) chưa có — dựng vẫn được, nhưng --cai sẽ không tự cài gói SDK\n'
  printf '     Cần thì: brew install --cask android-commandlinetools\n'
fi

# Ba gói SDK: đo bằng THƯ MỤC CÓ THẬT, không hỏi sdkmanager (nó chậm và cần mạng).
[ -d "$SDK/ndk/$NDK_CAN" ]                  && ghi_du "NDK $NDK_CAN"                  || ghi_thieu "NDK $NDK_CAN"
[ -d "$SDK/build-tools/$BUILDTOOLS_CAN" ]   && ghi_du "build-tools $BUILDTOOLS_CAN"   || ghi_thieu "build-tools $BUILDTOOLS_CAN"
[ -d "$SDK/platforms/android-$COMPILESDK_CAN" ] && ghi_du "platform android-$COMPILESDK_CAN" || ghi_thieu "platform android-$COMPILESDK_CAN"

# ── 5. Phụ thuộc JS ─────────────────────────────────────────────────────────
[ -d node_modules ] && ghi_du "node_modules" || ghi_thieu "node_modules (npm ci)"

# ── 6. Khoá ký — CHỈ báo có/không, KHÔNG in giá trị ─────────────────────────
# `aladin` dựng được bản ký vì android/gradle.properties (không theo git) đang
# giữ bốn khoá ALADIN_UPLOAD_*. `checkfarm` chưa có → chỉ dựng nổi bản debug.
for app in ALADIN CHECKFARM; do
  du=1
  for hau in STORE_FILE STORE_PASSWORD KEY_ALIAS KEY_PASSWORD; do
    grep -q "^${app}_UPLOAD_${hau}=" android/gradle.properties 2>/dev/null || du=0
  done
  if [ "$du" = 1 ]; then ghi_du "khoá ký $app (đủ 4 phần)"
  else printf '  ○ khoá ký %s chưa đủ — chỉ dựng được bản debug cho app này\n' "$app"; fi
done

echo

# ── Cài phần thiếu ──────────────────────────────────────────────────────────
if [ "$CHE_DO" = "cai" ]; then
  if [ ${#THIEU[@]} -eq 0 ]; then
    echo "Không thiếu gì. Không cài gì cả."
  else
    echo "══ Cài ${#THIEU[@]} thứ còn thiếu ══"
    command -v brew >/dev/null 2>&1 || { echo "⛔ Chưa có Homebrew. Cài nó trước: https://brew.sh"; exit 1; }
    [ -n "$JDK_DUONG" ] || brew install openjdk@17
    command -v node >/dev/null 2>&1 || brew install node
    if [ -z "$SDKMANAGER" ]; then
      brew install --cask android-commandlinetools
      for d in "$SDK/cmdline-tools/latest/bin/sdkmanager" "$SDK/cmdline-tools"/*/bin/sdkmanager; do
        [ -x "$d" ] && { SDKMANAGER="$d"; break; }
      done
    fi
    if [ -n "$SDKMANAGER" ]; then
      yes | "$SDKMANAGER" --licenses >/dev/null 2>&1
      "$SDKMANAGER" "platform-tools" \
                    "platforms;android-$COMPILESDK_CAN" \
                    "build-tools;$BUILDTOOLS_CAN" \
                    "ndk;$NDK_CAN"
    else
      echo "⛔ Vẫn không có sdkmanager — không cài được gói SDK. Dùng Android Studio → SDK Manager."
    fi
    [ -d node_modules ] || npm ci
    echo
    echo "Cài xong. CHẠY LẠI script ở chế độ kiểm để xác nhận — đừng tin bước cài này."
    exit 0
  fi
fi

# ── Cổng: thiếu thì DỪNG. Đây là chỗ script phải chặn thật. ─────────────────
if [ ${#THIEU[@]} -gt 0 ]; then
  echo "⛔ Thiếu ${#THIEU[@]} thứ, chưa dựng được. Chạy: bash scripts/build-android.sh --cai"
  exit 1
fi

echo "✓ Đủ điều kiện dựng."

[ "$CHE_DO" = "dung" ] || exit 0

# ── Dựng ────────────────────────────────────────────────────────────────────
export JAVA_HOME="$JDK_DUONG"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export PATH="$JAVA_HOME/bin:$PATH"

case "$MUC_TIEU" in
  aladin-aab)     LENH="bundleAladinRelease";   RA="android/app/build/outputs/bundle/aladinRelease/app-aladin-release.aab" ;;
  aladin-apk)     LENH="assembleAladinDebug";   RA="android/app/build/outputs/apk/aladin/debug/app-aladin-debug.apk" ;;
  checkfarm-aab)  LENH="bundleCheckfarmRelease";RA="android/app/build/outputs/bundle/checkfarmRelease/app-checkfarm-release.aab" ;;
  checkfarm-apk)  LENH="assembleCheckfarmDebug";RA="android/app/build/outputs/apk/checkfarm/debug/app-checkfarm-debug.apk" ;;
  *) echo "⛔ --dung cần một trong: aladin-aab · aladin-apk · checkfarm-aab · checkfarm-apk"; exit 1 ;;
esac

# Luôn gọi flavor tường minh. `assembleDebug` trần dựng CẢ HAI app (README:89).
echo "══ ./gradlew $LENH ══"
( cd android && ./gradlew "$LENH" ) || { echo "⛔ Gradle đỏ."; exit 1; }

[ -f "$RA" ] || { echo "⛔ Gradle xanh mà KHÔNG có tệp ra tại $RA — đừng tin lượt dựng này."; exit 1; }
echo
echo "✓ $RA"
ls -la "$RA"
