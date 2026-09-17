# CheckFarm — chữ cho trang Google Play (bản dán thẳng)

Soạn 2026-09-17. Chỉ mô tả **thứ app làm được hôm nay**, đo từ mã, không hứa phần chưa chạy.

Ba thứ CỐ Ý không nhắc trong bản dưới, vì chúng chưa chạy và Play đọc mô tả như một lời hứa:
blockchain · truy xuất nguồn gốc cho người mua · ví/điểm thưởng. Bật lên rồi thì bổ sung sau,
đừng hứa trước — mô tả sai lệch là một trong các cớ gỡ ứng dụng.

---

## Tên ứng dụng (tối đa 30 ký tự)

```
CheckFarm
```

## Mô tả ngắn (tối đa 80 ký tự — đây là dòng hiện dưới tên app)

```
Nhận diện từng cây trong vườn bằng ảnh, ghi lại việc đã làm cho từng cây.
```
*(72 ký tự)*

## Mô tả đầy đủ (tối đa 4000 ký tự)

```
CheckFarm giúp nhà vườn nhận ra TỪNG CÂY trong vườn bằng ảnh chụp, rồi ghi lại mọi việc đã làm cho đúng cây đó.

Vườn có hàng trăm cây trông giống nhau. Sổ tay ghi "bón phân lô B" thì sáu tháng sau không ai biết cây nào đã bón, cây nào bỏ sót. CheckFarm giải quyết đúng chỗ đó: mỗi cây có một hồ sơ riêng, mở ra bằng cách giơ điện thoại lên chụp chính cây ấy.

NHẬN DIỆN CÂY BẰNG ẢNH
• Chụp vài góc quanh gốc cây, ứng dụng lập hồ sơ nhận dạng cho cây đó.
• Lần sau ra vườn, chụp lại là ứng dụng tìm đúng cây trong hồ sơ đã có.
• Không cần gắn thẻ, không cần sơn số, không cần que cắm — những thứ rơi mất, phai màu, hoặc bị cắt cỏ nuốt.
• Ứng dụng nói rõ khi nó KHÔNG chắc, thay vì đoán bừa một cây. Chưa chắc thì nó hỏi lại, và bạn là người quyết.
• Chụp thiếu góc thì ứng dụng nhắc còn thiếu góc nào, ngay lúc bạn còn đứng cạnh gốc cây.

ĐẾM QUẢ TRÊN CÂY
• Quay một đoạn clip ngắn quanh cây, ứng dụng ước lượng số quả nhìn thấy được.
• Con số hiện ra kèm lời rào đón rõ ràng: đây là số quả NHÌN THẤY ĐƯỢC trong đoạn clip bạn vừa quay, không phải số quả thật của cả cây — quả khuất sau lá, quả phía trong tán thì không đếm được. Ứng dụng không đưa một con số trần rồi để bạn tưởng đó là sản lượng.
• Ảnh và clip vẫn nằm trong máy bạn.

GHI VIỆC ĐỒNG THEO TỪNG CÂY
• Tưới nước, bón phân, phun thuốc, thu hoạch — chọn việc, quay lại vài giây làm bằng chứng, lưu.
• Bón phân và phun thuốc thì ghi được TÊN trên bao bì và LƯỢNG đã dùng. Đây là phần quan trọng nhất về sau: sáu tháng sau mở ra vẫn biết đã dùng loại gì, bao nhiêu.
• Mỗi việc gắn vào đúng cây đã quét, không phải gắn vào cả lô.

DÒNG THỜI GIAN CỦA MỖI CÂY
• Mở một cây là thấy toàn bộ việc đã làm cho nó, xếp theo thời gian, kèm ảnh và clip đã quay.
• Biết cây nào lâu chưa được chăm, cây nào vừa phun thuốc tuần trước.

LÀM ĐƯỢC KHI SÓNG YẾU
• Vườn thường ở chỗ sóng chập chờn. Ghi chép lưu vào máy trước, gửi lên máy chủ khi có mạng.
• Ứng dụng nói rõ cái gì đã gửi, cái gì còn nằm chờ trong máy. Không có chuyện im lặng rồi mất.
• Khi gửi hỏng, ứng dụng nói đúng nguyên nhân — mất sóng, mạng Wi-Fi chen trang đăng nhập, hay ảnh đã bị máy dọn mất — thay vì một câu "có lỗi xảy ra" không giúp được gì.

QUYỀN RIÊNG TƯ
• Ảnh và clip của bạn là của bạn. Ứng dụng chỉ gửi những gì cần cho việc nhận diện cây mà bạn đã bấm lưu.
• Vị trí GPS dùng để phân biệt hai cây giống hệt nhau ở hai góc vườn. Không bật vị trí thì phần nhận diện kém chính xác hơn, ứng dụng vẫn chạy.
• Chính sách quyền riêng tư đầy đủ: https://checkfarm.com/privacy.html
• Muốn xoá dữ liệu: https://checkfarm.com/privacy.html#xoa-du-lieu

CẦN GÌ ĐỂ DÙNG
• Điện thoại có máy ảnh.
• Kết nối mạng để đồng bộ (không cần lúc đang ghi ngoài vườn).
• Một tài khoản CheckFarm. Mở khoá bằng vân tay hoặc khuôn mặt SẴN CÓ trên máy bạn, để khỏi phải nhớ mật khẩu. Vân tay và khuôn mặt nằm trong chip bảo mật của điện thoại — ứng dụng không đọc được, không gửi đi đâu, không lưu ở máy chủ. Không cần số tài khoản ngân hàng, không cần CMND/CCCD.

CheckFarm đang trong giai đoạn thử cùng nhà vườn thật. Gặp chỗ khó hiểu hoặc chỗ sai, viết cho chúng tôi — phần lớn thay đổi trong ứng dụng này đến từ người trồng cây ngoài vườn, không đến từ phòng họp.
```

**Đếm: ~2.560 ký tự** — còn dư trần 4000, cố ý. Trang Play cắt ở khoảng 3 dòng đầu trên điện thoại, nên phần nặng đặt ở đầu; viết thêm cho kín trần chỉ làm loãng.

---

## Khai "Nội dung ứng dụng" — trả lời từng mục

| Mục Play hỏi | Trả lời | Neo |
|---|---|---|
| Chính sách quyền riêng tư | `https://checkfarm.com/privacy.html` | đo 2026-09-17: trả `200` |
| Quyền truy cập ứng dụng | **Có phần bị hạn chế** → cấp cho Play một tài khoản thử | app bắt đăng nhập sinh trắc trước khi vào luồng chính |
| Quảng cáo | **Không có quảng cáo** | không có SDK quảng cáo nào trong `package.json` |
| Xếp hạng nội dung | Làm bảng hỏi → ra **3+ / Everyone** | app công cụ, không nội dung nhạy cảm |
| Đối tượng mục tiêu | **18 tuổi trở lên** | ⚠ xem ghi chú dưới |
| Ứng dụng tin tức | Không | |
| Tính năng tài chính | **Không có** | `PHOENIX_WALLET_ENABLED=false` ở `.github/actions/rn-env/action.yml:114` — bản Android do GitHub Actions dựng không bật ví |
| Ứng dụng chính phủ | Không | |
| An toàn dữ liệu | Theo `Compliance/google-play-data-safety.md` | bản khai đã đo từ mã |

### ⚠ Hai chỗ đừng chọn nhầm

**Đối tượng mục tiêu — KHÔNG chọn nhóm có trẻ em.** Chọn bất kỳ nhóm tuổi dưới 18 là app rơi
vào **Families policy**: thêm một vòng duyệt riêng, thêm ràng buộc về SDK, và app dùng máy ảnh
cộng vị trí sẽ bị soi kỹ hơn nhiều. Đây là app công cụ cho nhà vườn — chọn **18+**, đúng bản
chất và tránh cả một tầng thủ tục.

**Tính năng tài chính — câu trả lời "Không" chỉ đúng CHỪNG NÀO ví còn tắt.** Ngày bật
`PHOENIX_WALLET_ENABLED=true`, bản khai này sai, và khai sai mục tài chính là mục Play xử nặng.
Ai bật cờ đó thì phải sửa khai trước khi nộp bản tiếp theo.
