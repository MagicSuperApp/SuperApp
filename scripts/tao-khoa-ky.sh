#!/usr/bin/env bash
# Sinh kho khoá TẢI LÊN (upload key) cho MỘT app trong `instances/`.
#
# ⛔ ĐỌC TRƯỚC KHI CHẠY — thứ này không sửa lại được:
#
#   Khoá tải lên gắn vĩnh viễn với mục ứng dụng trên Google Play kể từ bản ĐẦU
#   TIÊN được tải lên. Mất khoá hoặc ký nhầm bằng khoá của app khác thì:
#     · app đã phát hành KHÔNG cập nhật được nữa, và
#     · mục ứng dụng đó KHÔNG chuyển giao được cho pháp nhân khác.
#   Cách gỡ duy nhất là bỏ mục cũ, dựng mục mới — mất hết lượt cài và đánh giá.
#
#   Vì vậy: mỗi app MỘT khoá, đứng tên ĐÚNG pháp nhân sở hữu app đó. CheckFarm
#   thuộc Công ty Cổ phần CheckFarm, không thuộc Aladin Contract — nên khoá
#   CheckFarm phải do phía CheckFarm giữ, kể cả khi Aladin Contract dựng app hộ.
#
# Script này KHÔNG tự đặt mật khẩu và KHÔNG ghi mật khẩu ra đâu cả. `keytool`
# tự hỏi, và câu trả lời chỉ nằm trong kho khoá vừa sinh.
#
# Dùng:  bash scripts/tao-khoa-ky.sh <mã-app>
# Ví dụ: bash scripts/tao-khoa-ky.sh checkfarm

set -euo pipefail

MA="${1:-}"
if [ -z "$MA" ]; then
  echo "Thiếu mã app. Dùng: bash scripts/tao-khoa-ky.sh <mã-app>" >&2
  echo "Các app đang khai:" >&2
  ls -1 instances/*/instance.json 2>/dev/null | sed 's|instances/||; s|/instance.json||; s|^|  |' >&2
  exit 1
fi

KHAI="instances/${MA}/instance.json"
if [ ! -f "$KHAI" ]; then
  echo "Không có app '${MA}' — thiếu ${KHAI}" >&2
  exit 1
fi

MA_GOI=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['android']['applicationId'])" "$KHAI")
TEN=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['displayName'])" "$KHAI")
DICH="${MA}-upload.jks"
BIDANH="${MA}-upload"

if [ -e "$DICH" ]; then
  echo "⛔ ${DICH} ĐÃ TỒN TẠI. Không ghi đè." >&2
  echo "   Ghi đè một kho khoá là mất khoá cũ, và mất khoá cũ là mất quyền" >&2
  echo "   cập nhật app đã phát hành. Đổi tên hoặc dời tệp cũ đi trước." >&2
  exit 1
fi

echo "Sinh khoá tải lên cho: ${TEN}  (${MA_GOI})"
echo "  tệp    : ${DICH}"
echo "  bí danh: ${BIDANH}"
echo "  hạn    : 10000 ngày (~27 năm — Play yêu cầu khoá còn hạn tới 2033+)"
echo
echo "keytool sẽ hỏi mật khẩu và thông tin pháp nhân."
echo "Mục 'CN' (tên) điền ĐÚNG tên pháp nhân SỞ HỮU app, không phải tên bên dựng hộ."
echo

keytool -genkeypair -v \
  -keystore "$DICH" \
  -alias "$BIDANH" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000

echo
echo "✅ Xong: ${DICH}"
echo
echo "Ba việc tiếp theo, KHÔNG bỏ bước nào:"
echo
echo "  1. SAO LƯU tệp này ra chỗ ngoài máy (két, trình quản lý bí mật)."
echo "     Mất tệp = mất quyền cập nhật app vĩnh viễn."
echo
echo "  2. Nạp làm biến bí mật CI, đúng bốn cái, tên suy từ mã app:"
MA_HOA=$(printf '%s' "$MA" | tr '[:lower:]' '[:upper:]')
echo "       ${MA_HOA}_UPLOAD_STORE_FILE_B64   ← base64 -i ${DICH}"
echo "       ${MA_HOA}_UPLOAD_STORE_PASSWORD"
echo "       ${MA_HOA}_UPLOAD_KEY_ALIAS        ← ${BIDANH}"
echo "       ${MA_HOA}_UPLOAD_KEY_PASSWORD"
echo
echo "  3. XOÁ tệp .jks khỏi thư mục làm việc sau khi đã sao lưu và nạp xong."
echo "     .gitignore đã chặn *.jks, nhưng đừng dựa vào một hàng rào duy nhất."
