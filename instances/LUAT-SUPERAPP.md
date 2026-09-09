<!-- rulesVersion: 1 -->

# Luật SuperApp — thứ mọi app dựng từ kho này phải tuân

**Phiên bản luật: 1.** Con số đó nằm ở dòng đầu tệp và **mỗi `instances/<mã>/instance.json`
phải khai đúng nó** (`superapp.rulesVersion`). Sửa luật là bắt buộc nâng số, và khi ấy mọi app
phải xác nhận lại — bản dựng đỏ cho tới khi có người đọc và ký nhận. Đó là toàn bộ cơ chế: luật
không tự lan, người phải xác nhận.

Kho này dựng ra **nhiều app** từ **một nền mã**. Người dùng có quyền dùng app nào hoặc không dùng
app nào — đó là lựa chọn của họ. Nhưng một app đã dựng từ kho này thì mang theo những ràng buộc
dưới đây, và một số ràng buộc có **chỗ cưỡng chế thật**: vi phạm là bản dựng đỏ, không phải là một
dòng nhắc trong tài liệu.

> Tệp này **không phải** cái cổng. Cổng nằm ở `android/app/build.gradle` (lúc dựng) và
> `src/config/instanceRules.test.ts` (lúc chạy bộ kiểm). Tệp này chỉ nói vì sao cổng đứng ở đó.
> Chỗ nào dưới đây ghi **CHƯA CƯỠNG CHẾ** thì đúng nghĩa đen: nó là lời hứa, chưa phải phép đo.

---

## 1. Mỗi app một danh tính PhoenixKey riêng — `superapp.phoenixDid`

**Cưỡng chế: CÓ, cho app mới.**

Mỗi instance phải có DID PhoenixKey của **chính nó** — không mượn, không dùng chung. Đây là thứ
phân biệt "một app trong hệ sinh thái" với "một thư mục ai đó thêm vào kho".

| giá trị | nghĩa |
|---|---|
| chuỗi `did:…` | app đã có danh tính riêng |
| `null` | **chưa cấp** — chỉ chấp nhận với hai app dưới đây, và chỉ tạm |

Hai app được miễn tạm thời, ghi thẳng tên trong cổng (`build.gradle`), kèm ngày:

- `aladin` — 2026-08-30, chưa có đường cấp DID cho *instance* (khác DID của **người dùng**, thứ
  đã có sẵn). Nợ.
- `checkfarm` — 2026-08-30, cùng lý do.

**App thứ ba trở đi không được miễn.** Thêm `instances/<mã>/` mà `phoenixDid` là `null` thì
gradle nổ ngay, nêu tên app và nói phải làm gì. Cố ý: chỗ nghẽn phải là *danh tính*, không phải
*người gác* — ai cũng thêm được app, nhưng không ai thêm được một app vô danh.

Hai app không được dùng chung một DID. Trùng là nổ.

> **Còn thiếu:** đường cấp DID cho một instance chưa có trong `PhoenixKeyDID`. Hai dòng miễn ở
> trên tồn tại vì lý do đó, và chỉ được gỡ khi đường cấp có thật — không gỡ bằng cách bịa một
> chuỗi trông giống DID.

## 2. Không app nào được bỏ bớt module

**Cưỡng chế: CÓ.**

Tập module là **hằng dẫn xuất** từ `MODULE_IDS` (`src/navigation/moduleIds.ts`), không phải biến
của instance. Thêm module vào sổ là **cả hai** app có, không ai phải nhớ.

Trước đây có trường `enabledModules` cho mỗi app tự chọn tập module. Trường đó hỏng **câm**:
`collectModuleScreens` gặp module vắng chỉ `console.warn` rồi bỏ qua
(`src/navigation/registry.ts`) — không đỏ, không chặn. Ngày thêm module thứ năm mà một app quên
khai, app đó lặng lẽ thiếu tính năng và không phép đo nào kêu. Nên trường đó đã bị gỡ, và
`tsc` canh hai bên khỏi lệch: `registry.ts` khai `Record<ModuleId, RegistryEntry>` từ đúng kiểu
`MODULE_IDS`.

Cái **được phép** khác nhau giữa các app là lớp trình bày: tên, chủ đề màu, thứ tự và độ nổi bật
của điểm vào. Đẩy một ô ra khỏi thanh tab và không có nó trong app là hai việc khác nhau — chỉ
việc đầu được phép.

## 3. Mỗi app một mã gói riêng, không bao giờ đổi

**Cưỡng chế: CÓ.**

`android.applicationId` và `ios.bundleId` là danh tính của app với cửa hàng. Hai app dùng chung
một mã gói thì cửa hàng coi đó là **một** app và bản sau đè bản trước — gradle nổ nếu trùng.

`defaultConfig` cố ý **không** khai `applicationId`: để lại một giá trị mặc định ở đó là dựng sẵn
một đường rơi câm cho app nào quên khai, và cái rơi đó ra đúng mã gói của app khác.

Sau lần tải bản dựng đầu tiên lên cửa hàng thì mã gói **không đổi được nữa**.

## 4. Mỗi app tự mang bộ biểu tượng của mình

**Cưỡng chế: CÓ trên Android · KHÔNG trên iOS.**

Android: `src/main/res` không còn bộ `ic_launcher` dùng chung. App quên biểu tượng thì bản dựng
đỏ ngay (`resource mipmap/ic_launcher not found`), thay vì lặng lẽ mượn biểu tượng của app đứng
trước rồi đi thẳng lên cửa hàng.

iOS thì ngược hẳn, và đây là chỗ dễ đọc nhầm nhất trong cả tệp: câu giải thích ở trên nói về một
triệu chứng **chỉ có ở Android**. Đo 2026-09-09 (`find instances -type d`): không app nào có thư
mục `ios/`, và `ios/SuperApp/Images.xcassets/AppIcon.appiconset` là bộ **duy nhất** — bộ của
Aladin. Nên một bản iOS của app khác `aladin` sẽ mang biểu tượng Aladin, **dựng được và ký
được**, không cổng nào đỏ.

Chặn tạm: luồng iOS trong `codemagic.yaml` `exit 1` khi `APP_INSTANCE != aladin`, và soi bộ ảnh
đang thật sự đóng gói bằng `sips` (cỡ 1024×1024, không kênh alpha). Mở khoá thì cần một bước
**sinh `AppIcon.appiconset` theo app** — đặt tệp vào chỗ là chưa đủ.

## 5. Mỗi app một dự án Firebase riêng — hoặc không có

**Cưỡng chế: MỘT PHẦN.**

Tệp cấu hình Firebase của một app nằm trong đường tìm **riêng** của app đó
(`android/app/src/<mã>/google-services.json`), không ở gốc `app/`. App không có tệp đó thì gradle
tự tắt bước Firebase cho app đó — dựng bình thường, chỉ là không nhận tin đẩy khi app tắt.

Bẫy nguy hiểm nhất là chép tệp của app này sang thư mục app kia: mọi thứ dựng được, chạy được, và
dữ liệu của app này chảy vào dự án của pháp nhân khác. `src/config/nativeIdentityParity.test.ts`
canh đúng chỗ đó.

## 6. Mỗi app một khoá ký riêng

**CHƯA CƯỠNG CHẾ.**

Hai pháp nhân riêng thì hai khoá ký riêng. Hôm nay chưa có phép đo nào trong kho nói được một bản
dựng đã ký bằng khoá của ai — khoá không nằm trong kho, và `nativeIdentityParity.test.ts` tự khai
điều đó.

## 7. Tiền: chia phần giữa các app

**CHƯA CƯỠNG CHẾ — và đây là món nợ lớn nhất trong tệp này.**

Ba trường tiền của nền tảng (`governance_ref`, `accepted_assets`, `cut_bps`) nằm ở sổ đăng ký
chung của hệ sinh thái và đã được khoá vào nhóm cần đồng thuận. Nhưng việc chia phần **giữa các
app dựng từ kho này** xảy ra **bên trong** phạm vi quản trị của SuperApp — sổ đăng ký chung không
nhìn thấy nó.

Hôm nay `instance.json` không có trường nào về tiền, và không có chỗ nào trong mã đọc một quy tắc
chia phần. Nghĩa là câu "app tuân luật SuperApp" **ở trục tiền** hiện chưa có chỗ cưỡng chế nào.

Ghi ra đây để không ai đọc mục 1–5 rồi tưởng cả tệp đã được canh.

---

## Thêm một app mới

Xem `instances/README.md`. Ba việc bắt buộc, thiếu việc nào cũng đỏ:

1. `instances/<mã>/instance.json` — gồm khối `superapp` với `rulesVersion` đúng và `phoenixDid`
   **không** `null`;
2. `instances/<mã>/brand/icon-1024.png` rồi chạy `python3 scripts/sinh-bieu-tuong.py <mã>` — đó
   là bộ **Android**. Cho iOS đặt thêm `instances/<mã>/ios/AppIcon-1024.png` (1024×1024, **không**
   kênh alpha; `codemagic.yaml` đo bằng `sips`). Đặt tệp KHÔNG đủ: chưa có bước sinh
   `AppIcon.appiconset` từ nó, nên luồng iOS vẫn chặn mọi app khác `aladin` — xem mục 4;
3. một entry trong `src/config/instance.config.ts`.
