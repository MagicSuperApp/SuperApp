# Ảnh loài vật nuôi (PNG xoá nền)

Sáu ô chọn loài ở bước một của luồng vật nuôi
(`src/modules/trace/components/animal/AnimalWizard.tsx`) hiện **ảnh con vật
thật**. Thư mục này là chỗ đặt ảnh; bảng tra là
`src/modules/trace/components/animal/speciesPhoto.ts`.

Loài nào chưa có tệp thì ô của nó rơi về biểu tượng (`speciesFa.ts`) — không có
ô rỗng nào.

## ⚠ Còn nợ: hai ảnh có watermark

`chicken.png` và `cattle.png` là **ảnh xem trước của Dreamstime** — chữ chìm in
đè lên thân con vật, và nó hiện lên trong app ở ô chọn Gà và ô chọn Bò. Ảnh xem
trước là ảnh **chưa mua**, nên để nguyên tới lúc phát hành vừa xấu vừa là rủi ro
bản quyền.

Chủ dự án đã biết và sẽ thay hai tệp này. Thay xong thì xoá mục này, xoá hai
dòng `⚠` trong `speciesPhoto.ts`, và ghi nguồn vào bảng cuối trang.

Bốn tệp còn lại (`pig` · `goat` · `duck` · `dog`) sạch.

## Vì sao không tự tải được

Lượt đi tìm tự động đã chạy và không ra kết quả dùng được. Wikimedia Commons là
nguồn duy nhất vừa khai giấy phép rõ ràng vừa tải được bằng máy, và chuyên mục
sát nhất của nó — `Category:Animals on transparent background` (272 mục) — chỉ
có chó, mèo, cá, khủng long. Lọc theo sáu loài cần dùng thì còn lại một con bò
rừng đã tuyệt chủng (`Bos primigenius.png`) và vài cái sọ.

Thứ duy nhất suýt dùng được là `File:202103 Pig.png` (CC BY 4.0) — nhưng đó là
tranh vẽ kỹ thuật số chứ không phải ảnh chụp.

## Cách điền

1. Đặt tệp vào chính thư mục này (ghi đè tệp cũ nếu thay), tên theo **khoá máy
   chủ** (`animal_config.py`), không theo tiếng Việt:

   | Loài | Tên tệp |
   |------|---------|
   | Gà   | `chicken.png` |
   | Lợn  | `pig.png` |
   | Dê   | `goat.png` |
   | Bò   | `cattle.png` |
   | Vịt  | `duck.png` |
   | Chó  | `dog.png` |

2. Chỉ **thay** tệp đã có thì xong ở bước 1 — bảng tra đã trỏ sẵn. **Thêm** một
   loài mới thì mở `src/modules/trace/components/animal/speciesPhoto.ts` và thêm
   một dòng:

   ```ts
   chicken: require('../../../../../assets/images/animals/chicken.png'),
   ```

   ⚠ Đặt tệp **trước**, thêm dòng **sau**. `require` của React Native là **hằng
   văn bản**, Metro đọc lúc đóng gói chứ không phải lúc chạy — không dựng được
   đường dẫn động từ khoá loài, và `require` một tệp chưa có thì **hỏng cả bản
   dựng**, chứ không phải chỉ mất một ô ảnh. `AnimalWizard.gate.test.ts` đếm số
   `require` so với số tệp PNG thật trong thư mục, nên làm sai thứ tự là đỏ ở CI
   trước khi kịp hỏng lúc đóng gói.

3. Khởi động lại Metro có xoá cache — tệp mới thêm hay bị bỏ sót trên Windows:

   ```
   npm start -- --reset-cache
   ```

## Ảnh nên như thế nào

- **PNG có kênh alpha**, nền đã xoá sạch tới mép — ô hiện trên nền nâu nhạt, nên
  một viền trắng sót lại là thấy ngay.
- **Cạnh vuông**, khoảng **512×512**. Ô vẽ ảnh ở ~64 điểm, `resizeMode="contain"`;
  512 là đủ cho màn hình 3x mà không phình gói cài.
- **Cả con, chụp ngang**, con vật chiếm gần hết khung, chừa một hơi lề để nó
  không chạm mép ô.
- **Cùng một lối** cho cả sáu: cùng là ảnh chụp, hoặc cùng là tranh vẽ. Trộn hai
  lối thì lưới sáu ô trông như ghép từ hai bộ khác nhau.
- **Giấy phép dùng được cho app thương mại**, và ghi lại nguồn ở đây khi thêm.

## Nguồn

| Tệp | Nguồn | Giấy phép |
|-----|-------|-----------|
| `chicken.png` | Dreamstime (ảnh xem trước) | ⚠ **chưa mua — cần thay** |
| `cattle.png` | Dreamstime (ảnh xem trước) | ⚠ **chưa mua — cần thay** |
| `pig.png` | _(chủ dự án cung cấp)_ | _(cần ghi rõ)_ |
| `goat.png` | _(chủ dự án cung cấp)_ | _(cần ghi rõ)_ |
| `duck.png` | _(chủ dự án cung cấp)_ | _(cần ghi rõ)_ |
| `dog.png` | _(chủ dự án cung cấp)_ | _(cần ghi rõ)_ |

Ghi nguồn và giấy phép cho từng tệp khi thêm hoặc thay — bảng này là chỗ duy
nhất trả lời được câu "ảnh này lấy ở đâu ra" sáu tháng sau.
