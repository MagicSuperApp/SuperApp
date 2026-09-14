# Ảnh băng trượt Trang chủ

Ba tấm băng ở đầu Trang chủ (`src/screens/homeBanners.ts`) dựng theo bố cục
**ảnh → màu**: ảnh phủ từ mép trái, một dải chuyển sắc kéo nó tan vào màu của
module ở nửa phải, chữ nằm trên phần đã đặc màu.

## Đang dùng ảnh nào

| Tấm | Ảnh hiện tại | Ghi chú |
|---|---|---|
| Truy xuất | ảnh **của tin mới nhất** (RSS Dân Việt) | `assets/images/trace/backdrop-home.jpg` chỉ là đường lùi khi chưa có tin, hoặc tin không kèm ảnh |
| Trò chuyện | `assets/images/banners/chat-fi.jpg` | **tạm mượn** hình minh hoạ của module |
| Việc làm | `assets/images/banners/job-fi.jpg` | **tạm mượn** — chờ ảnh của bạn |

⚠️ Đuôi phải khớp BYTE trong tệp. Hai tấm trên vào kho lần đầu dưới tên `.png`
trong khi chúng mang byte JPEG; bản debug dựng xanh vì nó không nghiền ảnh, còn
bản phát hành đỏ ở `aapt2` với câu `file failed to compile`. Nay có bài canh:
`src/config/assetExtensionMatchesBytes.test.ts`.

Hai tấm dưới đang mượn hình minh hoạ nền trong suốt của module. Chúng ghép được
(nền trong suốt để lộ đúng màu thẻ nằm dưới) nhưng chúng là hình vẽ vuông, không
phải ảnh chụp ngang — tức là chưa đúng thứ bố cục này được thiết kế cho.

## Thay ảnh

1. Đặt tệp vào thư mục này, ví dụ `work.jpg`.
2. Sửa **hai dòng** trong `src/screens/homeBanners.ts` — đường dẫn ảnh, và
   `kieu` của tấm đó (`'hinh'` → `'anh'`, xem mục dưới):

```ts
export const ANH_BANG = {
  trace: require('../../assets/images/trace/backdrop-home.jpg'),
  chat:  require('../../assets/images/modules/chat-fi.png'),
  work:  require('../../assets/images/banners/work.jpg'),   // ← đổi đường dẫn
};

// …và trong `dungBang()`, ở tấm 'b3':
  kieu: 'anh',   // ← đổi từ 'hinh' sang 'anh' vì nay là ảnh chụp
```

3. Khởi động lại Metro (`npx react-native start --reset-cache`) — Metro đọc danh
   sách asset lúc khởi động, thêm tệp mới mà không nạp lại thì nó báo *unable to
   resolve module*.

## `kieu: 'anh'` hay `'hinh'`

Khung ảnh của băng nằm ngang, tỉ lệ quãng **2:1**. Hai loại ảnh lấp khung theo
hai cách khác hẳn nhau, và khai sai thì hỏng thấy rõ:

| `kieu` | Lấp khung | Dùng cho |
|---|---|---|
| `'anh'` | `cover` — lấp đầy, cắt phần thừa | ảnh **chụp**, ngang |
| `'hinh'` | `contain` — vào trọn khung, phần thừa để lộ màu thẻ | hình **vẽ**, nền trong suốt |

Hình minh hoạ của module là ảnh **vuông** (2000×2000). Lấp một khung 2:1 bằng
`cover` là phóng nó lên gấp đôi rồi cắt mất nửa chiều cao — nhân vật bị cắt
ngang ngực, và cái đọc ra là *"ảnh bị zoom quá mức"*. Nên hai tấm đang mượn hình
vẽ khai `'hinh'`.

**Thay bằng ảnh chụp ngang thì phải đổi sang `'anh'`**, nếu không ảnh sẽ co lại
giữa khung và để hở hai mảng màu hai bên.

## Ảnh nên như thế nào

- **Ảnh chụp nằm ngang**, tỉ lệ từ 16:9 trở lên. Thẻ cao 140 px và rộng gần hết
  màn, ảnh vuông sẽ bị cắt mất phần trên và dưới.
- **Chừa trống phần bên phải.** Dải chuyển sắc bắt đầu nuốt ảnh từ khoảng 20%
  bề ngang và đặc hẳn ở 50%; mọi chi tiết đặt bên phải mốc đó sẽ bị phủ mất.
  Chủ thể nên nằm ở khoảng một phần ba bên trái.
- **Đừng để chữ trong ảnh.** Chữ của tấm băng là chữ thật, nằm bên phải; chữ in
  sẵn trong ảnh vừa không dịch được sang bốn thứ tiếng vừa chồng lên phần đang
  bị dải chuyển sắc làm mờ.
- Bề ngang **1200–1600 px** là đủ cho màn `@3x`; to hơn chỉ làm nặng bản dựng.
