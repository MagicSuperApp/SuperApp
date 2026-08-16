#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Soi KHOÁ / TOKEN lọt vào diff của một PR. FAIL=0 mới cho merge.
#
#   bash scripts/soi-khoa.sh <sha-goc> <sha-ngon>     # thường là base...head của PR
#   bash scripts/soi-khoa.sh origin/develop HEAD      # chạy tay trước khi mở PR
#   git diff ... | bash scripts/soi-khoa.sh -         # soi một diff đưa qua ống
#
# Đường ống `-` có ở đây để KIỂM CHÍNH CỔNG NÀY được: máy này có sẵn chốt
# pre-commit chặn chuỗi giống khoá, nên không tạo nổi một commit bẩn giả để thử.
# Không có đường này thì không ai chứng minh được cổng có bắt thật hay chỉ luôn xanh.
#
# VÌ SAO CÓ TỆP NÀY: GitHub có sẵn "secret scanning", nhưng nó chỉ bật cho kho
# CÔNG KHAI hoặc gói trả tiền. Kho này riêng tư + org gói free ⇒ tính năng đó
# KHÔNG có. Đo được:
#     GET /repos/MagicLampEcosystem/SuperApp/rulesets
#     → 403 "Upgrade to GitHub Pro or make this repository public..."
# Nên chốt này là thứ DUY NHẤT đứng giữa một khoá bị dán nhầm và lịch sử git —
# mà khoá đã vào lịch sử git thì thu hồi khoá là cách duy nhất, xoá commit không cứu.
#
# BA BẪY CỦA CHÍNH LOẠI KỊCH BẢN NÀY — đã tránh sẵn, đừng viết lại theo lối cũ:
#
#  1. BẮT THEO TỪ ("password", "secret", "token") ⇒ nhiễu tới mức không ai đọc,
#     rồi bị tắt. Đây đúng vết xe của bản siết cũ: chặn mọi dấu `<` trong chuỗi
#     hiển thị và giết luôn câu THẬT cần hiện — "46,3 < 50,0". Nay bắt theo HÌNH
#     DẠNG của chính khoá (tiền tố + độ dài), không bắt theo từ ngữ quanh nó.
#
#  2. Soi CẢ TỆP thay vì soi DÒNG THÊM ⇒ mọi PR đều đỏ vì một khoá cũ nằm sẵn
#     trong lịch sử. Nay chỉ đọc dòng bắt đầu bằng `+` trong diff.
#
#  3. Kịch bản tự bắt chính mình: mẫu regex viết trong tệp này khớp với tệp này.
#     Nay loại chính nó ra khỏi diff (`:(exclude)`), và mẫu được ghép từ mảnh
#     nên không có chuỗi khoá thật nào nằm nguyên văn ở đây.
#
# Chạy được trên macOS, Linux và Git Bash (Windows): chỉ dùng `git`, `grep -E`.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GOC="${1:-origin/develop}"
NGON="${2:-HEAD}"
QUA_ONG=0

FAIL=0
bao() { echo "✗ $1"; FAIL=1; }

if [ "$GOC" = "-" ]; then
  QUA_ONG=1
  DIFF="$(cat | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"
  NGUON="ống vào"
else
  if ! git rev-parse --verify "$GOC" >/dev/null 2>&1; then
    echo "✗ không thấy sha gốc: $GOC"
    exit 1
  fi
  # Chỉ dòng THÊM, bỏ chính kịch bản này ra.
  DIFF="$(git diff --unified=0 "$GOC...$NGON" -- . ':(exclude)scripts/soi-khoa.sh' \
          | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"
  NGUON="$GOC...$NGON"
fi

if [ -z "$DIFF" ]; then
  echo "· diff rỗng ($NGUON) — không có gì để soi"
  exit 0
fi

echo "· soi $(printf '%s' "$DIFF" | wc -l | tr -d ' ') dòng thêm ($NGUON)"

# ── 1. Khoá nhận ra được bằng chính hình dạng của nó ────────────────────────
# Ghép từ mảnh để chuỗi mẫu không nằm nguyên văn trong tệp (bẫy 3).
G='gh'; A='AKI'; Z='AIza'; X='xox'; E='eyJ'

soi() { # soi <tên loại> <regex>
  local ten="$1" re="$2" hit
  hit="$(printf '%s\n' "$DIFF" | grep -Eo "$re" | head -3 || true)"
  if [ -n "$hit" ]; then
    bao "$ten — thấy trong dòng thêm:"
    printf '%s\n' "$hit" | sed 's/^/      /'
  fi
}

soi "PAT GitHub"            "${G}[pousr]_[A-Za-z0-9]{36,}"
soi "PAT GitHub (bản mới)"  "${G}ithub_pat_[A-Za-z0-9_]{40,}"
soi "Khoá truy cập AWS"     "${A}A[0-9A-Z]{16}"
soi "Khoá API Google"       "${Z}[0-9A-Za-z_-]{35}"
soi "Token Slack"           "${X}[baprs]-[0-9A-Za-z-]{10,}"
soi "JWT có thân"           "${E}[A-Za-z0-9_-]{20,}\.${E}[A-Za-z0-9_-]{20,}\."
soi "Khoá riêng (PEM)"      "BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY"
soi "Chuỗi kết nối có mật khẩu" "(postgres|postgresql|mysql|mongodb(\+srv)?|redis|amqp)://[^:/[:space:]]+:[^@[:space:]]{6,}@"

# ── 2. Cụm 24 từ / mnemonic — mất là mất danh tính vĩnh viễn ────────────────
# Không bắt theo từ điển BIP39 (nặng, và bản Việt hoá không có). Bắt theo HÌNH:
# một chuỗi ≥12 từ thường, toàn chữ cái a-z, cách nhau đúng một dấu cách, nằm
# trong nháy. Câu tiếng Anh bình thường trong mã hầu như luôn có dấu câu hoặc
# chữ hoa nên không lọt vào đây.
soi "Nghi cụm từ khôi phục (≥12 từ thường liền nhau trong nháy)" \
    "['\"][a-z]{3,8}( [a-z]{3,8}){11,23}['\"]"

# ── 3 + 4. Tệp KHÔNG được thêm mới: .env thật, và kho khoá ký ───────────────
# `.env.example` / `.env.sample` / `.env.template` là mẫu, được phép.
if [ "$QUA_ONG" -eq 0 ]; then
  TEPMOI="$(git diff --name-only --diff-filter=A "$GOC...$NGON" || true)"

  ENVMOI="$(printf '%s\n' "$TEPMOI" | grep -E '(^|/)\.env($|\.)' \
            | grep -Ev '\.(example|sample|template)$' || true)"
  if [ -n "$ENVMOI" ]; then
    bao "tệp .env thật được THÊM vào commit:"
    printf '%s\n' "$ENVMOI" | sed 's/^/      /'
  fi

  KHOMOI="$(printf '%s\n' "$TEPMOI" | grep -Ei '\.(jks|keystore|p12|pfx|mobileprovision|p8)$' || true)"
  if [ -n "$KHOMOI" ]; then
    bao "tệp kho khoá ký được THÊM vào commit:"
    printf '%s\n' "$KHOMOI" | sed 's/^/      /'
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "✓ không thấy khoá/token nào trong dòng thêm"
else
  echo "── ĐỎ. Khoá đã vào lịch sử git thì XOÁ COMMIT KHÔNG CỨU ĐƯỢC:"
  echo "   1. THU HỒI khoá đó ở nơi cấp (GitHub / AWS / Google / máy chủ) — làm trước."
  echo "   2. Rồi mới gỡ khỏi mã, thay bằng biến môi trường."
  echo "   3. Nếu là nhầm (ví dụ chuỗi mẫu trong test): đổi chuỗi đó cho khác hình dạng khoá thật."
fi
exit "$FAIL"
