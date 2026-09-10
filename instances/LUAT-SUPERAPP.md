<!-- rulesVersion: 3 -->

# Luật SuperApp — thứ mọi app dựng từ kho này phải tuân

**Phiên bản luật: 3.** Con số đó nằm ở dòng đầu tệp và **mỗi `instances/<mã>/instance.json`
phải khai đúng nó** (`superapp.rulesVersion`). Sửa luật là bắt buộc nâng số, và khi ấy mọi app
phải xác nhận lại — bản dựng đỏ cho tới khi có người đọc và ký nhận. Đó là toàn bộ cơ chế: luật
không tự lan, người phải xác nhận.

> **v2 → v3 (2026-09-10)** đổi **§2**, và đổi theo hướng ngược lại với v1/v2: app nay **chọn
> được** tập module, qua lời khai `modules: "all" | [...]`. Chủ sở hữu chốt hướng này vì nền tảng
> sẽ có hàng trăm module và mỗi doanh nghiệp chỉ cần một phần. Chẩn đoán cũ (trường mảng trần
> hỏng câm) **giữ nguyên** — chỉ đổi thuốc, xem §2.
> Hai app hiện tại đều khai `"all"`, nên v3 **không đổi hành vi app nào**.
>
> **v1 → v2 (2026-09-10)** đổi hai mục, cả hai vì chủ sở hữu quyết cho `checkfarm` phát hành
> dưới pháp nhân Aladin rồi chuyển giao sau:
> **§4** iOS chuyển từ *chưa cưỡng chế* sang *cưỡng chế* — mỗi app một bộ `AppIcon.appiconset`
> riêng, có phép kiểm bắt được ca dùng chung ảnh.
> **§6** bỏ vế suy "hai app ⟹ hai pháp nhân ⟹ hai khoá". Khoá ký đi theo pháp nhân **phát hành**;
> dùng chung thì được, nhưng phải KHAI bằng `operator.sharedWith` + `operator.transferTo`.

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

## 2. App CHỌN module, nhưng phải KHAI mình chọn kiểu gì

**Cưỡng chế: CÓ.**

Mỗi app khai `modules` trong `instances/<mã>/instance.json` và trong `InstanceConfig`, đúng một
trong hai dạng:

| khai | nghĩa | module thêm sau |
|---|---|---|
| `"all"` | app **lõi** — lấy cả sổ | **tự có** |
| `["chat", "trace"]` | app **chọn lọc** | **không** tự vào, và đó là đúng ý |

Danh sách để bấm chọn ở `src/navigation/moduleCatalog.ts`, sinh từ chính `module.manifest.json`
của từng module — kèm quyền module đó cần (máy ảnh, vị trí, đọc hồ sơ), vì bật một module là bật
luôn quyền của nó và đó là thứ phải khai trên trang cửa hàng.

### Vì sao có `"all"` thay vì để app khai một mảng trần

Luật v1 và v2 **cấm hẳn** việc bỏ bớt module. Lệnh cấm đó không sai lúc viết: trường
`enabledModules` đời đầu đúng là một mảng trần, và nó hỏng **câm** — `collectModuleScreens` gặp
module vắng chỉ `console.warn` rồi bỏ qua, nên app quên khai module mới lặng lẽ thiếu tính năng
và không phép đo nào kêu.

Chỗ hỏng thật nằm ở chỗ **hai ca cho ra dữ liệu giống hệt nhau**: "app này cố ý không lấy module
mới" và "app này quên khai module mới". Cấm hẳn là một cách chữa; làm hai ca phân biệt được là
cách kia. `"all"` là lời khai tách chúng ra.

Bắt app khai danh sách **bỏ** thì đúng cái hỏng đó quay lại, chỉ đổi dấu: nền tảng sẽ có hàng
trăm module, và danh sách âm bắt mọi app phải sửa mỗi lần sổ dài thêm.

### Chỗ cưỡng chế

`src/config/moduleSelection.test.ts` — lời khai hợp lệ · hai nguồn JSON/TS không trôi khỏi nhau ·
`"all"` thật sự là cả sổ chứ không phải ảnh chụp · **không tab hay `slotPriority` nào trỏ tới
module app đã tắt** · danh mục khớp manifest · không hai module trùng route.

Hàng in đậm là đường hỏng đắt nhất và nó **không** đi qua bảng `tabs`: `slotPriority` là bảng thứ
tự route, không biết gì về module. App tắt `work` mà bảng còn liệt `WorkHome` thì cổng xoè vẫn vẽ
đúng mục đó, người dùng bấm, và điều hướng tới một route chưa đăng ký — không màn nào hiện, không
lỗi nào ném. `resolveGateItems` lọc lúc chạy; phép kiểm canh tầng cấu hình.

### Cái tắt là ĐƯỜNG TỚI, không phải mã

`registry.ts` vẫn import tĩnh mọi màn của mọi module (INV-SEC: không tải động, offline-first),
nên **mã của module tắt vẫn nằm trong gói**. Tắt module bỏ đi tab, mục cổng xoè và việc đăng ký
route — không làm gói nhẹ đi. Muốn gói nhẹ theo cấu hình thì phải sinh `registry.ts` lúc dựng;
đó là việc khác và **chưa làm**.

## 3. Mỗi app một mã gói riêng, không bao giờ đổi

**Cưỡng chế: CÓ.**

`android.applicationId` và `ios.bundleId` là danh tính của app với cửa hàng. Hai app dùng chung
một mã gói thì cửa hàng coi đó là **một** app và bản sau đè bản trước — gradle nổ nếu trùng.

`defaultConfig` cố ý **không** khai `applicationId`: để lại một giá trị mặc định ở đó là dựng sẵn
một đường rơi câm cho app nào quên khai, và cái rơi đó ra đúng mã gói của app khác.

Sau lần tải bản dựng đầu tiên lên cửa hàng thì mã gói **không đổi được nữa**.

## 4. Mỗi app tự mang bộ biểu tượng của mình

**Cưỡng chế: CÓ trên Android · CÓ trên iOS (từ luật v2).**

Android: `src/main/res` không còn bộ `ic_launcher` dùng chung. App quên biểu tượng thì bản dựng
đỏ ngay (`resource mipmap/ic_launcher not found`), thay vì lặng lẽ mượn biểu tượng của app đứng
trước rồi đi thẳng lên cửa hàng.

iOS **từng** ngược hẳn, và chỗ này là chỗ dễ đọc nhầm nhất trong cả tệp: câu giải thích Android ở
trên nói về một triệu chứng chỉ có ở Android. Đo 2026-09-09: không app nào có thư mục `ios/`, và
`ios/SuperApp/Images.xcassets/AppIcon.appiconset` là bộ **duy nhất** — bộ của Aladin. Một bản iOS
của app khác `aladin` mang biểu tượng Aladin, **dựng được và ký được**, không cổng nào đỏ. Chặn
tạm lúc ấy là `exit 1` cho mọi app khác `aladin`.

Nay mỗi app giữ bộ của mình ở `instances/<mã>/ios/AppIcon.appiconset/`, và bước dựng **chép** bộ
đúng app vào chỗ Xcode đọc, rồi **đo lại chính tệp vừa chép**. Thứ tự đó là phần quan trọng: một
bản trước đo bộ ảnh trước khi chép, nên nó luôn đo bộ của lượt dựng trước — vẫn ra dấu ✅, vẫn
không nói gì về bản đang dựng.

Ba chỗ hỏng, ba cách kêu khác nhau, nên đo riêng từng chỗ
(`src/config/nativeIdentityParity.test.ts`):

| hỏng | ai kêu, kêu lúc nào |
|---|---|
| thiếu bộ | máy chủ dựng đỏ — muộn, nhưng có kêu |
| **trùng bộ với app khác** | **không ai kêu**; chỉ lộ khi có người nhìn màn hình máy |
| còn kênh alpha | Apple từ chối ở bước **nộp**, sau cả một lượt dựng trả tiền |

Hàng giữa là hàng đắt nhất, và là lý do có bài `KHÔNG hai app nào dùng chung một ảnh biểu tượng`.

Sinh bộ mới: `python3 scripts/sinh-bieu-tuong.py <mã app>` — sinh cả Android lẫn iOS từ **một**
tệp `instances/<mã>/brand/icon-1024.png`, rồi commit kết quả. ⚠ Đừng chạy lại cho app đã phát
hành: bộ sinh ra khác byte với bộ đang trên cửa hàng, và ở cỡ 20×20 · 29×29 thì khác thật, không
phải khác mã hoá. Bộ iOS của `aladin` vì vậy là bản **chép** từ bộ đang phát hành.

## 5. Mỗi app một dự án Firebase riêng — hoặc không có

**Cưỡng chế: MỘT PHẦN.**

Tệp cấu hình Firebase của một app nằm trong đường tìm **riêng** của app đó
(`android/app/src/<mã>/google-services.json`), không ở gốc `app/`. App không có tệp đó thì gradle
tự tắt bước Firebase cho app đó — dựng bình thường, chỉ là không nhận tin đẩy khi app tắt.

Bẫy nguy hiểm nhất là chép tệp của app này sang thư mục app kia: mọi thứ dựng được, chạy được, và
dữ liệu của app này chảy vào dự án của pháp nhân khác. `src/config/nativeIdentityParity.test.ts`
canh đúng chỗ đó.

## 6. Khoá ký đi theo PHÁP NHÂN PHÁT HÀNH, không đi theo tên app

**CHƯA CƯỠNG CHẾ ở tầng khoá · CƯỠNG CHẾ ở tầng lời khai (từ luật v2).**

Luật cũ viết "mỗi app một khoá ký riêng", suy từ "hai app = hai pháp nhân". Vế suy đó **không còn
đúng**: chủ sở hữu quyết ngày 2026-09-10 rằng `checkfarm` phát hành dưới pháp nhân **Aladin**,
chuyển giao cho CheckFarm Inc sau. Nên hai app hôm nay dùng chung một chứng chỉ phân phối iOS
(đội Apple `3666KPJX5R`) — đúng và cố ý.

Luật đúng là: **khoá ký thuộc về pháp nhân đứng tên phát hành**. Hai app cùng pháp nhân thì dùng
chung được; hai app khác pháp nhân thì tuyệt đối không.

Chỗ khó là hai ca có **trạng thái dữ liệu giống hệt nhau**: dùng chung có chủ ý, và chép nhầm
khối `operator` của app cũ sang app mới. Nới phép kiểm thành "cho trùng" thì ca chép nhầm đi lọt;
giữ "cấm trùng" thì ca hợp lệ đỏ và người sửa sẽ nới phép kiểm — đường nào cũng về chỗ mất phép
canh. Nên phép đo không hỏi *"có trùng không"* mà hỏi *"trùng này có được KHAI không"*:

- `operator.sharedWith` — mã app đang cho mượn pháp nhân. Không cho bắc cầu.
- `operator.transferTo` — pháp nhân sẽ nhận chuyển giao, kèm ngày bắt đầu mượn.

Bản chép nhầm không mang hai lời khai đó, nên nó vẫn đỏ. Và `transferTo` là chỗ **ghi nợ nằm
trong dữ liệu chứ không trong chú thích**: một dòng chú thích "tạm thời, chuyển giao sau" già đi
lặng lẽ và không phép kiểm nào đọc được nó.

Riêng **Android** thì hai app vẫn giữ hai khoá tải lên riêng (`<MÃ>_UPLOAD_*`), kể cả khi cùng
pháp nhân. Không phải vì luật đòi, mà vì Google Play khoá mục ứng dụng vĩnh viễn theo khoá của
tệp đầu tiên tải lên: tách sẵn thì ngày chuyển giao không phải đụng gì tới khoá.

Vẫn **chưa cưỡng chế** được phần cốt lõi: không phép đo nào trong kho nói được một bản dựng đã ký
bằng khoá của ai — khoá không nằm trong kho, và `nativeIdentityParity.test.ts` tự khai điều đó.

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
