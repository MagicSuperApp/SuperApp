#!/usr/bin/env bash
# create-test-identity.sh — tạo một danh tính PhoenixKey trên MÁY ẢO iOS, không bấm tay.
#
# Dùng để làm gì: mọi lượt thử luồng cần một danh tính có sẵn (ghép máy, ví, vườn,
# ký giao dịch) đều bắt đầu bằng vài chục giây bấm qua màn đăng ký. Script này bỏ
# quãng đó đi, và bỏ y hệt nhau ở mọi máy của mọi đội.
#
# ── Ranh giới, đọc trước khi sửa ───────────────────────────────────────────────
# Script KHÔNG tự sinh khoá. Nó không làm được: khoá danh tính do
# `PhoenixKeyModule.generateKeypair` sinh THẲNG vào kho khoá của chính tiến trình
# app (`ios/LocalPods/ScannerModule/UI/PhoenixKeyModule.swift`), nên không tiến
# trình nào bên ngoài ghi vào đó được. Script là NGƯỜI ĐIỀU PHỐI: nó vá một tệp
# khởi động vào cây nguồn, để app tự làm việc đó, rồi GỠ tệp ấy ra.
#
# ── Vì sao vá vào rồi gỡ ra, thay vì để sẵn một nhánh `__DEV__` ────────────────
# Xem đầu `bootstrap.template.ts`. Tóm tắt: `__DEV__` cắt ở tầng đóng gói nên mã
# vẫn nằm trong cây nguồn lúc dựng bản phát hành; cách duy nhất chứng minh bản
# phát hành không mang đường tắt là đường tắt không có mặt lúc dựng.
#
# ── Điều script này bắt buộc phải làm, và lý do rất cụ thể ─────────────────────
# Vá xong phải ĐỌC LẠI để xác nhận phép vá ĐÃ ăn; gỡ xong phải BĂM LẠI để xác nhận
# cây nguồn về đúng như cũ. Không phải cẩn thận thừa: một phép thay bằng `perl -0pi`
# đã trượt im lặng trong kho này (15/09/2026) và để lại một kết luận sai suốt nửa
# giờ, vì lệnh trả mã thoát 0 cho một lượt không khớp gì cả.
#
# Cách dùng:
#   scripts/dev-identity/create-test-identity.sh
#   scripts/dev-identity/create-test-identity.sh --app checkfarm --username tho_vuon_02
#   scripts/dev-identity/create-test-identity.sh --reset          # xoá danh tính cũ rồi tạo mới
#   scripts/dev-identity/create-test-identity.sh --check-types    # kèm một lượt tsc trên khuôn
#
# Mã thoát:
#   0  tạo xong (hoặc đã có sẵn và không yêu cầu --reset) — DID in ra stdout
#   1  app chạy tới nơi và BÁO HỎNG — có lý do cụ thể
#   2  KHÔNG ĐO ĐƯỢC — hết giờ chờ mà không có tệp kết quả nào
#   3  sai cách gọi, hoặc tiền đề không thoả (chưa dựng app, cây nguồn đang bẩn…)
#   4  ⛔ GỠ VÁ HỎNG — cây nguồn KHÔNG về như cũ, phải sửa tay

set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HERE="$ROOT/scripts/dev-identity"

APP=aladin
USERNAME=""
DEVICE=""
RESET=false
CHECK_TYPES=false
TIMEOUT=180
BOOT_DELAY_MS=6000

RESULT_FILE="dev-test-identity-result.json"
PATCHED_MODULE="$ROOT/src/devTestIdentityBootstrap.ts"
ENTRY="$ROOT/index.js"
PATCH_LINE="require('./src/devTestIdentityBootstrap'); // dev-identity: vá lúc chạy, gỡ khi xong"

while [ $# -gt 0 ]; do
  case "$1" in
    --app)      APP="${2:-}"; shift 2 ;;
    --username) USERNAME="${2:-}"; shift 2 ;;
    --device)   DEVICE="${2:-}"; shift 2 ;;
    --timeout)  TIMEOUT="${2:-}"; shift 2 ;;
    --reset)       RESET=true; shift ;;
    --check-types) CHECK_TYPES=true; shift ;;
    -h|--help)  sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "⛔ tham số lạ: $1" >&2; exit 3 ;;
  esac
done

case "$APP" in
  # Hai mã gói này là dữ kiện của kho, không phải lựa chọn của script. Bước kiểm
  # ở dưới đối chiếu lại với `simctl listapps`, nên gõ sai thì dừng chứ không chạy
  # nhầm sang app khác.
  aladin)    BUNDLE_ID="vn.aladinapp" ;;
  checkfarm) BUNDLE_ID="com.checkfarm.app" ;;
  *) echo "⛔ --app chỉ nhận 'aladin' hoặc 'checkfarm', nhận được: $APP" >&2; exit 3 ;;
esac

[ -n "$USERNAME" ] || USERNAME="dev_test_$(date +%H%M%S)"

say()  { printf '  %s\n' "$*"; }
step() { printf '\n▸ %s\n' "$*"; }
die()  { printf '\n⛔ %s\n' "$*" >&2; exit "${2:-3}"; }

# ── 1. Máy ảo ─────────────────────────────────────────────────────────────────
step "Máy ảo"
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun simctl list devices booted -j \
    | /usr/bin/python3 -c 'import json,sys
d=json.load(sys.stdin)["devices"]
for v in d.values():
  for x in v:
    print(x["udid"]); raise SystemExit' 2>/dev/null || true)
  [ -n "$DEVICE" ] || die "không có máy ảo nào đang chạy. Mở Simulator, hoặc truyền --device <tên|UDID>."
fi
DEVICE_NAME=$(xcrun simctl list devices | grep -F "$DEVICE" | head -1 | sed -E 's/^ *//; s/ \(.*//') || true
say "dùng: ${DEVICE_NAME:-?} ($DEVICE)"

# ── 2. App đã cài chưa ────────────────────────────────────────────────────────
step "App trên máy ảo"
# KHÔNG viết `xcrun … | grep -q`. Với `set -o pipefail` thì cách đó SAI, và sai im
# lặng: `grep -q` khớp được là thoát ngay và đóng ống, `xcrun` nhận SIGPIPE nên trả
# khác 0, `pipefail` lấy mã của `xcrun` làm mã của cả ống ⟹ "đã cài" bị đọc thành
# "chưa cài". Cùng họ với lỗi đọc mã thoát của `tail` trong một đường ống. Hứng ra
# biến trước rồi mới so thì không có ống nào để mà hỏng.
APPS=$(xcrun simctl listapps "$DEVICE" 2>/dev/null || true)
case "$APPS" in
  *"\"$BUNDLE_ID\""*) ;;
  *) die "chưa cài '$BUNDLE_ID' trên máy ảo này. Dựng trước:  npx react-native run-ios --simulator '${DEVICE_NAME:-iPhone}'" ;;
esac
CONTAINER=$(xcrun simctl get_app_container "$DEVICE" "$BUNDLE_ID" data)
say "$BUNDLE_ID  →  $CONTAINER"

# ── 3. Cây nguồn phải SẠCH ở đúng hai chỗ script sắp đụng ─────────────────────
step "Tiền đề cây nguồn"
[ -f "$PATCHED_MODULE" ] && die "'$PATCHED_MODULE' đã tồn tại — một lượt chạy trước chưa gỡ sạch. Xoá tay rồi chạy lại."
[ -f "$ENTRY" ] || die "không thấy '$ENTRY'. \$ROOT suy ra từ vị trí của chính script ($ROOT) — chạy một BẢN SAO đặt ngoài kho thì nó trỏ sai chỗ."

# Ba trạng thái, không hai. `git diff --quiet` trả 0 = sạch, 1 = bẩn, >1 = KHÔNG
# CHẠY ĐƯỢC (ngoài kho, git hỏng, quyền đọc). Gộp hai cái sau lại — hoặc nuốt lỗi
# bằng `2>/dev/null` — là để một lượt không đo được đội lốt một lượt đo ra "bẩn",
# và người đọc đi sửa nhầm thứ. Đã dính đúng thế khi chạy một bản sao từ thư mục
# tạm: git báo "not a git repository", script in ra "index.js đang bẩn".
set +e
git -C "$ROOT" diff --quiet -- index.js 2>/tmp/dev-identity-git.err
GIT_MA=$?
set -e
case "$GIT_MA" in
  0) ;;
  1) die "index.js đang có sửa đổi chưa commit. Script phải khôi phục nguyên trạng tệp này nên nó từ chối chạy đè lên việc đang dở." ;;
  *) die "KHÔNG ĐO ĐƯỢC trạng thái index.js — git thoát mã $GIT_MA tại '$ROOT'. Đây KHÔNG phải 'tệp bẩn'. Lý do git nói: $(head -1 /tmp/dev-identity-git.err 2>/dev/null)" ;;
esac
ENTRY_SHA_TRUOC=$(shasum -a 256 "$ENTRY" | cut -d' ' -f1)
say "băm index.js trước khi vá = ${ENTRY_SHA_TRUOC:0:16}…"

# ── 4. Gỡ vá — đăng ký TRƯỚC khi vá, để mọi đường thoát đều đi qua đây ─────────
GO_VA() {
  local ma=$?
  printf '\n▸ Gỡ vá\n'
  rm -f "$PATCHED_MODULE"
  if [ -f "$ENTRY.dev-identity-backup" ]; then
    mv "$ENTRY.dev-identity-backup" "$ENTRY"
  fi
  local sau
  sau=$(shasum -a 256 "$ENTRY" 2>/dev/null | cut -d' ' -f1 || echo "KHÔNG-ĐỌC-ĐƯỢC")
  if [ "$sau" != "$ENTRY_SHA_TRUOC" ]; then
    printf '\n⛔ GỠ VÁ HỎNG — index.js KHÔNG về như cũ.\n   trước: %s\n   sau  : %s\n   Khôi phục tay:  git -C %s checkout -- index.js\n' \
      "$ENTRY_SHA_TRUOC" "$sau" "$ROOT" >&2
    exit 4
  fi
  if [ -f "$PATCHED_MODULE" ]; then
    printf '\n⛔ GỠ VÁ HỎNG — %s vẫn còn. Xoá tay.\n' "$PATCHED_MODULE" >&2
    exit 4
  fi
  say "cây nguồn về đúng như cũ (băm khớp, tệp vá đã mất)"
  exit "$ma"
}
trap GO_VA EXIT INT TERM

# ── 5. Vá ─────────────────────────────────────────────────────────────────────
step "Vá tệp khởi động"
cp "$ENTRY" "$ENTRY.dev-identity-backup"
sed -e "s|__RESULT_FILE__|$RESULT_FILE|g" \
    -e "s|__USERNAME__|$USERNAME|g" \
    -e "s|__RESET__|$RESET|g" \
    -e "s|__BOOT_DELAY_MS__|$BOOT_DELAY_MS|g" \
    "$HERE/bootstrap.template.ts" > "$PATCHED_MODULE"
printf '\n%s\n' "$PATCH_LINE" >> "$ENTRY"

# ĐỌC LẠI. Đây là bước mà một lượt vá trượt sẽ lộ ra — không đọc lại thì lệnh vẫn
# trả mã thoát 0 và cả phần còn lại của script chạy trên một tiền đề sai.
[ -f "$PATCHED_MODULE" ] || die "vá trượt: không tạo được $PATCHED_MODULE"
grep -qF "devTestIdentityBootstrap" "$ENTRY" || die "vá trượt: index.js không mang dòng nạp"
for o in __RESULT_FILE__ __USERNAME__ __RESET__ __BOOT_DELAY_MS__; do
  if grep -qF "$o" "$PATCHED_MODULE"; then die "vá trượt: ô $o chưa được thay"; fi
done
say "đã vá, và đã đọc lại để xác nhận (không tin mã thoát của sed)"
say "tên đăng nhập = $USERNAME · xoá danh tính cũ = $RESET"

# Khuôn bị loại khỏi `tsconfig.json` vì lúc nằm ở `scripts/` nó KHÔNG hợp lệ (ô
# `__…__` chưa thay, đường `./services/…` chưa phân giải được). Ngay lúc này thì
# nó hợp lệ — nó đang nằm trong `src/`. Đây là cửa sổ DUY NHẤT kiểm kiểu được nó,
# nên cửa đó phải mở ra được bằng một cờ, không thì khuôn thành vùng mù vĩnh viễn.
if [ "$CHECK_TYPES" = true ]; then
  step "Kiểm kiểu khuôn (chỉ làm được trong lúc đang vá)"
  if ( cd "$ROOT" && npx tsc --noEmit ); then
    say "tsc sạch"
  else
    die "khuôn không qua được tsc — sửa bootstrap.template.ts rồi chạy lại"
  fi
fi

# ── 6. Metro ──────────────────────────────────────────────────────────────────
step "Metro"
METRO_TU_KHOI=false
if curl -sf -m 2 'http://localhost:8081/status' >/dev/null 2>&1; then
  say "đã chạy sẵn — dùng lại, script sẽ KHÔNG tắt nó"
else
  say "chưa chạy — script tự khởi, và sẽ tự tắt khi xong"
  # `exec` để tiến trình nền CHÍNH LÀ Metro, không phải một vỏ bọc quanh nó —
  # giết vỏ bọc thì Metro sống tiếp và chiếm cổng 8081 cho mọi lượt sau.
  ( cd "$ROOT" && exec npx react-native start --reset-cache ) >/tmp/dev-identity-metro.log 2>&1 &
  echo $! > /tmp/dev-identity-metro.pid
  METRO_TU_KHOI=true
  for _ in $(seq 1 60); do
    curl -sf -m 2 'http://localhost:8081/status' >/dev/null 2>&1 && break
    sleep 1
  done
  curl -sf -m 2 'http://localhost:8081/status' >/dev/null 2>&1 \
    || die "Metro không lên sau 60 giây — xem /tmp/dev-identity-metro.log"
fi

# ── 7. Dọn tệp kết quả cũ, rồi khởi động app ──────────────────────────────────
step "Khởi động app"
rm -f "$CONTAINER/Documents/$RESULT_FILE"
[ -f "$CONTAINER/Documents/$RESULT_FILE" ] && die "không xoá được tệp kết quả cũ — kết quả đọc được sau đó sẽ là của lượt TRƯỚC"
# Ghi danh sinh trắc: khoá sinh với cờ `.biometryCurrentSet` KHÔNG tạo được trên
# máy chưa ghi danh, và lỗi trả về lúc đó nói về keychain chứ không nói về vân tay.
xcrun simctl spawn "$DEVICE" notifyutil -s com.apple.BiometricKit.enrollmentChanged 1 >/dev/null 2>&1 || true
xcrun simctl spawn "$DEVICE" notifyutil -p com.apple.BiometricKit.enrollmentChanged >/dev/null 2>&1 || true
xcrun simctl terminate "$DEVICE" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$DEVICE" "$BUNDLE_ID" >/dev/null
say "đã khởi động, chờ tối đa ${TIMEOUT}s"

# ── 8. Chờ — vừa bắn sinh trắc vừa dò tệp kết quả ─────────────────────────────
step "Chờ kết quả"
DICH="$CONTAINER/Documents/$RESULT_FILE"
HET_GIO=$(( $(date +%s) + TIMEOUT ))
while [ "$(date +%s)" -lt "$HET_GIO" ]; do
  [ -f "$DICH" ] && break
  # Bắn cả hai họ thông báo: máy ảo mô phỏng Face ID hay Touch ID là do kiểu máy
  # quyết định, và script không cần biết là kiểu nào.
  xcrun simctl spawn "$DEVICE" notifyutil -p com.apple.BiometricKit_Sim.pearl.match      >/dev/null 2>&1 || true
  xcrun simctl spawn "$DEVICE" notifyutil -p com.apple.BiometricKit_Sim.fingerTouch.match >/dev/null 2>&1 || true
  sleep 2
done

if [ ! -f "$DICH" ]; then
  printf '\n⚠ KHÔNG ĐO ĐƯỢC — hết %ss mà app chưa ghi tệp kết quả nào.\n' "$TIMEOUT" >&2
  printf '  Đây KHÔNG phải "tạo danh tính hỏng": ở trạng thái này script không biết\n' >&2
  printf '  app đã chạy tới bước nào. Chỗ xem tiếp, theo thứ tự:\n' >&2
  printf '    xcrun simctl spawn %s log stream --level debug --predicate '"'"'processImagePath CONTAINS "%s"'"'"'\n' "$DEVICE" "$BUNDLE_ID" >&2
  printf '    /tmp/dev-identity-metro.log\n' >&2
  [ "$METRO_TU_KHOI" = true ] && kill "$(cat /tmp/dev-identity-metro.pid 2>/dev/null)" 2>/dev/null || true
  exit 2
fi

OK=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ok"])' "$DICH")
[ "$METRO_TU_KHOI" = true ] && kill "$(cat /tmp/dev-identity-metro.pid 2>/dev/null)" 2>/dev/null || true

if [ "$OK" != "True" ]; then
  printf '\n⛔ App báo hỏng:\n' >&2
  cat "$DICH" >&2
  exit 1
fi

DID=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["did"])' "$DICH")
REUSED=$(/usr/bin/python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["reused"])' "$DICH")
printf '\n✓ %s\n' "$([ "$REUSED" = True ] && echo 'Máy đã có sẵn danh tính — dùng lại, KHÔNG tạo thêm (muốn tạo mới thì chạy với --reset)' || echo 'Đã tạo danh tính mới')"
printf '  tên đăng nhập : %s\n' "$USERNAME"
printf '  DID           : %s\n' "$DID"
printf '  chi tiết      : %s\n' "$DICH"
exit 0
