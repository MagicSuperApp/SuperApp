#!/usr/bin/env bash
# Sinh kho khoá TẢI LÊN (upload key) cho MỘT app trong `instances/`.
#
# ⛔ ĐỌC TRƯỚC KHI CHẠY — mỗi app MỘT khoá, đứng tên ĐÚNG pháp nhân sở hữu app đó.
#
#   CheckFarm thuộc Công ty Cổ phần CheckFarm, không thuộc Aladin Contract — nên
#   khoá CheckFarm phải do phía CheckFarm giữ, kể cả khi Aladin Contract dựng app
#   hộ. Lý do là PHẠM VI THIỆT HẠI: ai cầm khoá thì ký được bản cập nhật cho MỌI
#   app khoá đó ký. Một khoá dùng chung hai app nghĩa là pháp nhân này phát hành
#   được bản cập nhật đứng tên pháp nhân kia, và không có cách nào tách ra sau.
#
#   ── Đính chính: khoá TẢI LÊN mất thì lấy lại được ─────────────────────────
#   Bản trước của khối này viết "mất khoá thì app KHÔNG cập nhật được nữa" và
#   "mục ứng dụng KHÔNG chuyển giao được". Cả hai đều sai với app dùng Play App
#   Signing. Tài liệu Google (support.google.com/googleplay/android-developer/
#   answer/9842756) nói thẳng: *"If you lose your upload key or suspect that it
#   was compromised, you are not locked out of your app."* Cách gỡ là sinh khoá
#   tải lên mới, xuất chứng thư dạng PEM rồi xin đặt lại trong Play Console.
#   Phần chuyển giao mục ứng dụng thì trang đó không nói tới — nên cũng đừng
#   khẳng định chiều ngược lại.
#
#   Cái THẬT SỰ không lấy lại được là khoá KÝ ỨNG DỤNG khi tự quản (không bật
#   Play App Signing): *"This key cannot be reset if you manage it yourself."*
#   Với Play App Signing thì khoá đó nằm ở Google, không nằm trong tệp này.
#
#   Nói quá một mức nguy hiểm phải trả giá thật: câu cũ từng thành lý do hoãn
#   việc dựng app thứ hai, trong khi rào chắn thật chỉ là "đừng dùng chung khoá".
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
  echo "   Ghi đè là mất khoá cũ. Lấy lại được (xin đặt lại khoá tải lên trong" >&2
  echo "   Play Console), nhưng đi qua bộ phận hỗ trợ và không nhanh — và trong" >&2
  echo "   lúc chờ thì không nộp được bản cập nhật nào." >&2
  echo "   Đổi tên hoặc dời tệp cũ đi trước." >&2
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
echo "     Mất tệp thì phải xin đặt lại khoá tải lên — làm được, nhưng app đứng"
echo "     im không cập nhật được cho tới lúc xong."
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
