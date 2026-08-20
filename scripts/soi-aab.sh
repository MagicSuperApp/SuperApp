#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Soi CHÍNH tệp .aab/.apk sắp nộp Play. FAIL=0 mới được nộp.
#
#   bash scripts/soi-aab.sh ./app-release.aab
#
# VÌ SAO CẦN CHẠY TAY: đường dựng Codemagik (`codemagic.yaml`) KHÔNG có bước soi
# gói ra — bốn bước kiểm `.so` của nó (`:940`, `:956`, `:1142`, `:1158`) soi
# `jniLibs`, tức ĐẦU VÀO của gradle, và cũng chỉ soi đúng lát `arm64-v8a`. Cổng
# soi gói ra chỉ có ở `.github/workflows/android-aab.yml`, mà đường GitHub đang
# chết vì sự cố thanh toán Actions (issue #157). Nên với mọi bản dựng bằng
# Codemagic, kịch bản này là cổng DUY NHẤT đứng giữa lỗi và người dùng.
#
# CHUYỆN ĐÃ XẢY RA: bản `app-release.aab` versionCode 87 (15/08 00:24) có chữ ký
# đúng, 25 tệp `.so`, cài chạy bình thường — nhưng THIẾU `libtaad_enclave_core.so`
# và `libchat_mls.so` ở cả bốn lát ABI. Người cài mới vẫn đăng ký được, vẫn dùng
# vườn/cây/quả, nhưng KHÔNG có ví và KHÔNG có cụm 24 từ sao lưu. Lỗi bị nuốt ở
# `phoenixKeyAuthService.ts:92-95` nên app không báo một câu nào. Mất máy là mất
# danh tính vĩnh viễn.
#
# HAI LỖI CỦA CHÍNH KỊCH BẢN NÀY, đã vá — đừng viết lại theo lối cũ:
#  1. Lặp một danh sách ABI viết tay ⇒ mù lát nào không nằm trong danh sách.
#     Nay duyệt theo lát CÓ THẬT trong gói, rồi mới đối chiếu danh sách bắt buộc.
#  2. Dùng `grep -qF` trần cho danh sách PHẢI CÓ. Đo được:
#         printf 'https://staging-api.orilife.io\n' | grep -qF 'api.orilife.io'
#     → KHỚP. Tức gói chỉ chứa host chết `staging-api.orilife.io` vẫn được báo
#     "OK có api.orilife.io". Nay neo hai đầu tên miền bằng lớp ký tự.
#
# Chạy được trên Git Bash (Windows), macOS và Linux: `strings` KHÔNG có sẵn trong
# Git Bash nên có đường lui bằng `grep -aoE`.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

AAB="${1:-./app-release.aab}"

if [ ! -f "$AAB" ]; then
  echo "✗ không thấy tệp: $AAB"
  echo "  dùng: bash scripts/soi-aab.sh <đường-dẫn-tới-.aab-hoặc-.apk>"
  exit 1
fi

W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT

unzip -q -o "$AAB" -d "$W" || { echo "✗ không giải nén được $AAB"; exit 1; }

FAIL=0

# .aab để native ở `base/lib/`, .apk để ở `lib/`.
LIBROOT="$W/base/lib"
[ -d "$LIBROOT" ] || LIBROOT="$W/lib"
if [ ! -d "$LIBROOT" ]; then
  echo "✗ gói không có thư mục native nào (base/lib hoặc lib) — đây có phải AAB/APK không?"
  exit 1
fi

BUNDLE=$(find "$W" -name index.android.bundle | head -1)
if [ -z "$BUNDLE" ]; then
  echo "✗ không thấy index.android.bundle trong gói"
  exit 1
fi

echo "── Lát ABI CÓ THẬT trong gói ────────────────────────────────────────"
ls "$LIBROOT"
echo
# Duyệt theo lát có thật, KHÔNG theo danh sách viết tay — và ĐÍNH CHÍNH 20/08 về lý
# do: bản trước ghi "chỉ `android/app/build.gradle` abiFilters mới cắt x86". SAI.
# Dựng thật 20/08 với abiFilters KHÔNG có x86 mà `reactNativeArchitectures` CÒN x86:
# .aab ra vẫn có `base/lib/x86/` 25 tệp (ba lát kia 28), thiếu đúng
# libtaad_enclave_core.so, libchat_mls.so, libcardano_serialization_lib. Plugin
# `com.facebook.react` đọc `reactNativeArchitectures` và ghi đè abiFilters.
# Chỗ thật sự cắt lát là `android/gradle.properties`. Ai khai lại `x86` ở ĐÓ thì lát
# hỏng quay lại — mà Rust cố ý không dựng cho x86
# (`.github/actions/rust-android/action.yml:35,76`). Danh sách viết tay không nhìn
# thấy lát nó không biết, nên vòng dưới đây duyệt theo lát CÓ THẬT trong gói.
for D in "$LIBROOT"/*/; do
  ABI=$(basename "$D")
  for L in libtaad_enclave_core.so libchat_mls.so; do
    if [ -f "$D/$L" ]; then
      echo "  OK  $ABI/$L ($(wc -c < "$D/$L" | tr -d ' ') byte)"
    else
      echo "  ✗ THIẾU $ABI/$L  — gốc danh tính PhoenixKey sẽ chết câm trên máy dùng lát này"
      FAIL=1
    fi
  done
done
echo
# Và ba lát BẮT BUỘC phải có mặt. Vòng trên chỉ soi lát đang có — gradle nuốt mất
# nguyên một lát thì vòng trên im lặng.
for ABI in arm64-v8a armeabi-v7a x86_64; do
  if [ ! -d "$LIBROOT/$ABI" ]; then
    echo "  ✗ gói KHÔNG có lát $ABI — thiết bị dùng ABI đó không cài được"
    FAIL=1
  fi
done

# Bundle là Hermes bytecode; chuỗi vẫn đọc được. `strings` không có trong Git Bash
# trên Windows ⇒ giả lập bằng cách bóc các dải ký tự in được, cùng ngữ nghĩa.
if command -v strings >/dev/null 2>&1; then
  strings "$BUNDLE" > "$W/s.txt"
else
  grep -aoE '[ -~]{4,}' "$BUNDLE" > "$W/s.txt"
fi

# HAI DANH SÁCH DÙNG HAI LỐI KHỚP KHÁC NHAU — đừng gộp lại làm một.
#
# PHẢI CÓ → khớp CÓ NEO. Ký tự đứng trước tên miền phải không phải chữ/số/`-`/`.`
# (trong bundle là dấu `/` của `https://`), đứng sau không phải chữ/số/`.`. Nhờ đó
# `staging-api.orilife.io` KHÔNG được tính là đã có `api.orilife.io` — đúng ca mà
# bản 87 lọt qua.
re() { printf '(^|[^-A-Za-z0-9._])%s($|[^-A-Za-z0-9.])' "$(printf '%s' "$1" | sed 's/\./\\./g')"; }
#
# KHÔNG ĐƯỢC CÓ → khớp CHUỖI CON TRẦN (`grep -F`), cố ý KHÔNG neo.
# Vì đây là mẫu TÊN MIỀN, phải bắt mọi tên miền con: ngrok luôn hiện ra dưới dạng
# `<ngẫu-nhiên>.ngrok-free.dev`. Dùng chung hàm `re()` ở trên thì ký tự đứng trước
# là dấu `.` — mà `.` nằm trong lớp bị loại ⇒ cổng cấm ngrok KHÔNG BAO GIỜ nổ.
# Đã đo: gói giả chứa `https://xyz.ngrok-free.dev/logs` vẫn được báo "không có
# ngrok-free.dev". Đó là lý do hai danh sách phải tách lối khớp.

echo
echo "── Địa chỉ máy chủ nướng trong bundle JS ────────────────────────────"
for M in api.orilife.io api.aladin.work api.proofchat.me api.phoenixkey.me; do
  if grep -qE "$(re "$M")" "$W/s.txt"; then
    echo "  OK  có $M"
  else
    echo "  ✗ THIẾU $M — biến @env tương ứng là undefined, module rơi về mock/localhost"
    FAIL=1
  fi
done
echo
for B in staging-api.orilife.io localhost:8001 localhost:3000 ngrok-free.dev ngrok.io mock-local-api-key; do
  if grep -qF "$B" "$W/s.txt"; then
    echo "  ✗ CÓ $B — bản này dựng từ tệp .env sai (máy cá nhân?), không phải từ đường dựng của kho"
    FAIL=1
  else
    echo "  OK  không có $B"
  fi
done

echo
echo "────────────────────────────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo "FAIL=0  — gói đạt cả hai nhóm kiểm, được nộp."
else
  echo "FAIL=1  — ĐỪNG NỘP PLAY. Xem các dòng ✗ ở trên."
fi
exit "$FAIL"
