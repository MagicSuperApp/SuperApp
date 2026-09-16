# Tạo danh tính PhoenixKey trên máy ảo iOS, không bấm tay

Mọi lượt thử luồng cần một danh tính có sẵn — ghép máy, ví, vườn, ký giao dịch —
đều bắt đầu bằng vài chục giây bấm qua màn đăng ký. Bộ này bỏ quãng đó đi, và bỏ
y hệt nhau ở mọi máy của mọi đội.

```bash
scripts/dev-identity/create-test-identity.sh
scripts/dev-identity/create-test-identity.sh --app checkfarm --username tho_vuon_02
scripts/dev-identity/create-test-identity.sh --reset            # xoá danh tính cũ rồi tạo mới
```

Cần trước: một máy ảo đang chạy, và app đã cài lên nó (`npx react-native run-ios`).
Metro thì script tự lo — đang chạy thì dùng lại và **không** tắt, chưa chạy thì tự
khởi rồi tự tắt.

## Nó làm gì

| bước | việc |
|---|---|
| 1 | tìm máy ảo đang chạy, kiểm app đã cài chưa, lấy đường hộp dữ liệu của app |
| 2 | kiểm cây nguồn sạch ở đúng hai chỗ sắp đụng, băm `index.js` lại |
| 3 | chép `bootstrap.template.ts` → `src/devTestIdentityBootstrap.ts`, thêm một dòng nạp vào `index.js`, rồi **đọc lại** để xác nhận phép vá đã ăn |
| 4 | khởi động app; vừa dò tệp kết quả vừa bắn thông báo khớp sinh trắc cho máy ảo |
| 5 | đọc tệp kết quả, in DID |
| 6 | gỡ vá, rồi **băm lại** `index.js` để xác nhận cây nguồn về đúng như cũ |

Bước 3 và bước 6 là hai bước không được bỏ. Xem phần cuối.

## Mã thoát — và vì sao có tới bốn loại hỏng

| mã | nghĩa |
|---|---|
| 0 | xong — DID in ra `stdout` |
| 1 | app chạy tới nơi và **báo hỏng**, kèm lý do thật |
| 2 | **KHÔNG ĐO ĐƯỢC** — hết giờ chờ, không có tệp kết quả nào |
| 3 | sai cách gọi, hoặc tiền đề không thoả |
| 4 | ⛔ **gỡ vá hỏng** — cây nguồn không về như cũ, phải sửa tay |

`1` và `2` là hai thứ khác hẳn nhau, và gộp chúng là cách hỏng phổ biến nhất của
loại script này. `1` nghĩa là app đã chạy, đã thử, và biết mình hỏng ở đâu. `2`
nghĩa là script **không biết gì cả** — app có thể chưa khởi động, bundle có thể
lỗi, Metro có thể chết. Ở trạng thái `2` script không đoán: nó in ra hai chỗ cần
xem tiếp, một là nhật ký máy ảo, một là `/tmp/dev-identity-metro.log`.

## Vì sao là khuôn vá vào rồi gỡ ra, không phải một nhánh `__DEV__`

Tệp bootstrap đi vòng qua đúng lời hứa mà sản phẩm đang neo vào: *khoá danh tính
chỉ sinh ra sau một lượt sinh trắc của chính người dùng*. Nó tạo danh tính mà
không ai chạm vào máy.

`__DEV__` không đủ để giữ lời hứa ấy. Nó cắt ở tầng đóng gói, nên mã vẫn nằm
trong cây nguồn và vẫn đi qua mọi bước dựng. So với nhánh máy ảo ở
`ios/LocalPods/ScannerModule/UI/PhoenixKeyModule.swift` — thứ dùng
`#if targetEnvironment(simulator)` của trình biên dịch nên lát `iphoneos` **không
mang một byte nào** — thì `__DEV__` yếu hơn hẳn một bậc.

Cách duy nhất chứng minh bản phát hành không mang đường tắt này là: lúc dựng,
đường tắt **không có mặt** trong cây nguồn.

Hệ quả phải chấp nhận: khuôn bị loại khỏi `tsconfig.json`, vì ở chỗ nó đang nằm
thì nó không phải TypeScript hợp lệ (ô `__…__` chưa thay, đường `./services/…`
chưa phân giải được). Cửa sổ duy nhất kiểm kiểu được nó là lúc nó đang nằm trong
`src/` — nên có cờ cho đúng việc đó:

```bash
scripts/dev-identity/create-test-identity.sh --check-types
```

## Hai bước xác nhận, và giá đã trả để biết cần chúng

**Vá xong phải đọc lại.** Một phép thay bằng `perl -0pi` đã trượt im lặng trong
kho này (15/09/2026): lệnh trả mã thoát 0 cho một lượt không khớp gì cả, và nửa
giờ sau đó xây trên một tiền đề sai. `sed` cũng thế. Nên sau khi vá, script tự
kiểm: tệp có tồn tại không, `index.js` có mang dòng nạp không, bốn ô `__…__` đã
được thay hết chưa.

**Gỡ xong phải băm lại.** Trap chạy ở mọi đường thoát, kể cả Ctrl-C. Nhưng "trap
đã chạy" không phải "cây nguồn đã sạch" — nên nó băm `index.js` và so với băm lấy
trước khi vá. Lệch thì thoát mã `4`, in cả hai băm, và in sẵn lệnh khôi phục tay.

Cả ba cổng đã được kiểm bằng cách **phá hỏng chúng rồi xem có đỏ không**, chứ
không phải bằng cách chạy thuận rồi thấy xanh:

| cổng | phá bằng | kết quả |
|---|---|---|
| còn sót tệp vá | tạo sẵn `src/devTestIdentityBootstrap.ts` | mã 3, từ chối |
| `index.js` đang bẩn | thêm một dòng vào `index.js` | mã 3, từ chối |
| gỡ vá hỏng | bỏ dòng khôi phục khỏi một bản sao | mã 4, in cả hai băm |

## Một lỗi sản phẩm mà chính script này moi ra, lượt chạy thật đầu tiên

Chạy `--reset` lần đầu thì đăng ký bị bác, và giao diện chỉ nói *"Tạo danh tính
thất bại. Thử lại."* Bộ đệm console trong khuôn cho thấy câu thật:

```
PhoenixKeyApiError(code=3005, http=409):
Public key already registered — TAAD public key đã được bind vào một DID khác
```

Nguyên nhân: `wipeIdentity()` xoá khoá HW, con trỏ alias, DID và thẻ phiên, nhưng
**không** đụng Master_KEK của ví. Khoá TAAD suy ra từ KEK ấy nên nó sống sót, và
máy chủ từ chối gắn nó vào một DID mới. Bản đúng là `wipeLocalIdentity()`
(`src/services/accountDeletionService.ts`), làm đủ bốn việc theo đúng thứ tự.

Phần còn hở, chưa vá trong đợt này: `friendlyRegisterError`
(`src/services/phoenixKeyAuthService.ts`) **không có nhánh cho mã 3005**, nên rơi
vào câu mặc định. Người dùng thật gặp đúng ca này — xoá tài khoản rồi đăng ký lại
trên cùng máy — sẽ đọc một câu bảo họ làm lại đúng việc không bao giờ chạy được.

## Tệp trong thư mục này

- `create-test-identity.sh` — bộ điều phối. Chạy cái này.
- `bootstrap.template.ts` — khuôn. **Không phải mã chạy**, và không nằm trong tầm
  quét của `tsc`. Sửa nó thì chạy lại với `--check-types`.
