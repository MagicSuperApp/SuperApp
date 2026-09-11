#!/usr/bin/env bash
#
# In ra BỐN thứ cần dán vào máy chủ dựng để một app ký được bản phát hành Android.
#
#     bash scripts/load-signing-key.sh checkfarm /đường/tới/kho-khoá
#
# Vì sao là một script chứ không phải bốn dòng ghi trong tài liệu: giá trị thứ
# nhất là chuỗi base64 dài vài nghìn ký tự, và giá trị thứ hai nằm BÊN TRONG kho
# khoá chứ không đọc được bằng mắt. Gõ tay là bốn cơ hội sai, và kiểu sai nguy
# nhất — nạp nhầm kho khoá của app kia — không có triệu chứng nào cho tới lúc
# Google Play từ chối tệp đã tải lên.
#
# ⛔ Script này KHÔNG hỏi mật khẩu và KHÔNG đọc mật khẩu từ đâu cả. Nó in TÊN của
#    bốn biến, chuỗi base64 của kho khoá, và vân tay để đối chiếu. Hai mật khẩu
#    thì người chạy tự điền thẳng vào máy chủ dựng. Cố ý: một script biết mật
#    khẩu là một script có thể làm lộ mật khẩu, và ở đây nó không cần biết để
#    làm xong việc.
#
# ⛔ Chuỗi base64 in ra LÀ kho khoá. Ai có nó thì ký được bản cập nhật cho ứng
#    dụng. Đừng dán đầu ra của script này vào chỗ nhiều người đọc được.
set -euo pipefail

MA_APP="${1:-}"
KHO_KHOA="${2:-}"

if [ -z "$MA_APP" ] || [ -z "$KHO_KHOA" ]; then
  cat >&2 <<'HUONG_DAN'
dùng: bash scripts/load-signing-key.sh <mã app> <đường dẫn kho khoá>

  <mã app>       tên thư mục trong instances/ — vd `aladin`, `checkfarm`
  <đường dẫn>    tệp kho khoá (.jks / .keystore / không đuôi đều được)

Chưa có kho khoá thì sinh: bash scripts/tao-khoa-ky.sh <mã app>
HUONG_DAN
  exit 2
fi

GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$GOC/instances/$MA_APP" ]; then
  echo "❌ '$MA_APP' không phải app nào trong instances/:" >&2
  find "$GOC/instances" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sed 's/^/     /' >&2
  exit 1
fi

if [ ! -f "$KHO_KHOA" ]; then
  echo "❌ không thấy kho khoá: $KHO_KHOA" >&2
  exit 1
fi

TIEN_TO="$(echo "$MA_APP" | tr '[:lower:]' '[:upper:]')_UPLOAD_"

# ── base64 ────────────────────────────────────────────────────────────────────
# Bản GNU cần `-w0` để không tự xuống dòng; bản macOS không có cờ đó và mặc định
# đã không xuống dòng. Dò theo HÀNH VI của lệnh đang có, không theo tên hệ điều
# hành — cùng một máy có thể cài cả hai.
if base64 --help 2>&1 | grep -q -- '-w'; then
  B64="$(base64 -w0 "$KHO_KHOA")"
else
  B64="$(base64 < "$KHO_KHOA" | tr -d '\n')"
fi

# ── Vân tay để đối chiếu ──────────────────────────────────────────────────────
# Bước này CẦN mật khẩu, nên nó chỉ chạy khi người dùng chủ động đặt biến
# `STORE_PASSWORD` ở ngay trước lệnh:
#
#     STORE_PASSWORD=... bash scripts/load-signing-key.sh checkfarm <đường dẫn>
#
# Đặt kiểu đó thì mật khẩu sống trong đúng một tiến trình và không đi qua tệp
# nào. Không đặt cũng xong việc — chỉ là mất bước đối chiếu, nên script nói
# THẲNG là đã bỏ bước đó, thay vì im lặng rồi để người đọc tưởng đã kiểm.
echo "── Kho khoá: $KHO_KHOA  ($(wc -c < "$KHO_KHOA" | tr -d ' ') byte)"
if [ -z "${STORE_PASSWORD:-}" ]; then
  echo "   ⚠ BỎ QUA bước đối chiếu vân tay — chưa có mật khẩu kho khoá."
  echo "     Đây là trạng thái KHÔNG ĐO ĐƯỢC, không phải trạng thái đạt: nạp nhầm"
  echo "     kho khoá của app kia thì mọi bước sau vẫn xanh."
  echo "     Muốn đo: STORE_PASSWORD=... bash scripts/load-signing-key.sh $MA_APP $KHO_KHOA"
elif ! command -v keytool >/dev/null 2>&1; then
  echo "   ⚠ KHÔNG ĐO ĐƯỢC vân tay: máy không có keytool (cài JDK, hoặc dùng"
  echo "     keytool trong Android Studio)."
else
  keytool -list -v -keystore "$KHO_KHOA" -storepass "$STORE_PASSWORD" 2>/dev/null \
    | grep -E "Alias name|SHA-256:|Valid from" | sed 's/^/   /' \
    || echo "   ⚠ keytool không đọc được — mật khẩu sai, hoặc tệp không phải kho khoá."
  echo "   ↑ So SHA-256 trên đây với vân tay khoá tải lên mà cửa hàng đang ghi."
  echo "     Lệch = kho khoá này KHÔNG phải kho của mục ứng dụng đó. Dừng lại."
fi
echo

cat <<HUONG_DAN
════════════════════════════════════════════════════════════════════════════
Nạp vào: Codemagic → ứng dụng → Environment variables
Nhóm   : android_signing_${MA_APP}
         ⚠ MỘT nhóm cho MỘT app, không gộp. Khai một nhóm là máy chạy nạp TOÀN
           BỘ biến của nhóm đó trước bước đầu tiên — gộp lại thì lượt dựng của
           app này mang theo khoá của app kia suốt cả lượt, và không bước nào
           để lộ điều đó.
Đánh dấu **Secure** cho cả bốn biến.
════════════════════════════════════════════════════════════════════════════

  1. ${TIEN_TO}STORE_FILE_B64   ← chuỗi ở cuối trang này (${#B64} ký tự, dán TRỌN)
  2. ${TIEN_TO}KEY_ALIAS        ← dòng "Alias name" ở trên
  3. ${TIEN_TO}STORE_PASSWORD   ← tự điền
  4. ${TIEN_TO}KEY_PASSWORD     ← tự điền (thường trùng mật khẩu kho)

⚠ ĐỦ BỐN, không phải chỉ cái thứ nhất. Nạp thiếu hẳn một cái thì Gradle dừng và
  nêu đúng tên còn thiếu. Nhưng một biến ĐẶT RỒI MÀ RỖNG đi tới đúng chỗ đó với
  cùng một lời báo, còn danh sách tên biến trên màn hình thì trông y hệt lúc đủ.
  Danh sách tên chỉ chứng minh biến TỒN TẠI; chỉ log của một lượt chạy thật mới
  chứng minh nó CÓ GIÁ TRỊ.

Nạp xong, chạy tay luồng:  Android Signed AAB — ${MA_APP}
Cả hai luồng AAB đều không tự kích hoạt theo nhánh — phải bấm.

──────────── ${TIEN_TO}STORE_FILE_B64 ────────────
${B64}
──────────── hết ────────────
HUONG_DAN
