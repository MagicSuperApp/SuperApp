# SuperApp

Một nền mã, nhiều app. Thêm một app là thêm **một thư mục** trong
[`instances/`](instances/README.md) — không fork, không sửa gradle, không sửa Xcode, và không phải
nhờ ai.

Hôm nay kho này dựng ra hai app:

| app | dành cho | mã gói Android |
|---|---|---|
| **Aladin** | việc làm — người làm tự do, nội trợ, văn phòng | `com.aladincontract.company` |
| **CheckFarm** | ngành nông — nông dân, ngư dân, người làm vườn, thương lái, nhà máy | `com.checkfarm.app` |

Hai app **dùng chung 100% màn hình, module và logic**. Khác nhau ở tên, chủ đề màu, thứ tự ô trên
thanh dưới, và danh tính native. Đó là toàn bộ khoảng cách được phép — xem
[`instances/LUAT-SUPERAPP.md`](instances/LUAT-SUPERAPP.md).

## Module

Tập module là **hằng**, không phải biến của từng app. Nguồn duy nhất:
`src/navigation/moduleIds.ts`.

| module | làm gì |
|---|---|
| `trace` | định danh cây và vật nuôi, quét ReID, bản đồ vườn, truy xuất nguồn gốc |
| `chat` | nhắn tin mã hoá đầu-cuối (MLS) |
| `work` | đăng việc, nhận việc |
| `join` | tham gia mạng LampNet |

Thêm module vào sổ là **cả hai app có**, không ai phải nhớ khai lại. `tsc` canh hai bên khỏi
lệch: `src/navigation/registry.ts` khai `Record<ModuleId, RegistryEntry>` từ đúng kiểu
`MODULE_IDS`, nên thêm một id mà quên khai màn là **đỏ**, và ngược lại.

Sổ module hôm nay là sổ **tĩnh**: bốn module biên dịch sẵn, import tĩnh, không có đường đăng ký
lúc chạy. Ràng buộc `INV-SEC` ở `src/navigation/registry.ts:7-13` cấm import động và `eval` —
cấu hình là **giá trị thuần**, không phải mã. Trạng thái đích (đăng ký mở cho bên thứ ba) mô tả ở
[`Integration-Standard.md`](Integration-Standard.md) và `Specs/Platform-Math-Spec.md`, và cả hai
tệp đó nói rõ chúng đang tả ngày mai chứ không phải hôm nay.

## Bất biến

Phát biểu chốt ở [`Integration-Standard.md`](Integration-Standard.md) §3 — đây chỉ là bản rút gọn,
mâu thuẫn thì tin tệp kia:

- **INV-1** — store DID là nguồn chân lý duy nhất; **mọi** host, kể cả app native này, là *client*
  ghi qua API có khoá idempotency. Client không bao giờ ghi thẳng tầng dữ liệu (§3.2).
- **INV-2** — cái khác nhau giữa các app **chỉ** nằm ở lớp trải nghiệm. Cấu hình nào chạm tầng dữ
  liệu là vi phạm (§3.3).
- **INV-3** — trên chuỗi **chỉ** có hash/cam kết/con trỏ. PII và sinh trắc nằm ngoài chuỗi, trong
  kho đặt tại Việt Nam, **xoá được thật**. Đồng thuận theo từng host, không kế thừa (§3.4).
- **INV-SEC** — cấu hình khai báo thuần, không có đường thực thi mã từ cấu hình.

## Danh tính người dùng

PhoenixKey DID, sinh trắc trên máy, khoá không rời khỏi vùng an toàn phần cứng (Keychain trên
iOS, Keystore trên Android).

**Một PhoenixKey dùng cho mọi app.** Không có chuyện mỗi app một danh tính riêng cho người dùng —
người dùng là một người, và khôi phục bằng 24 từ ở app này sẽ **đăng xuất mọi app khác đang dùng
cùng danh tính đó**, kể cả trên máy khác. Màn khôi phục nói thẳng điều đó trước khi làm
(`src/screens/RestoreIdentityScreen.tsx`).

Danh tính của **app** (một `phoenixDid` cho mỗi instance) là chuyện khác, và nó ở
[`instances/LUAT-SUPERAPP.md`](instances/LUAT-SUPERAPP.md) §1.

## Nền kỹ thuật

- React Native 0.84.1 · TypeScript 5.8.3 · Kiến trúc Mới (Fabric + TurboModules)
- React Navigation v7 · Redux Toolkit 2 · SQLite ưu tiên ngoại tuyến
- Lõi Rust: `rust/taad_enclave_core` (khoá, ký, kho an toàn), `rust/chat_mls` (mã hoá nhóm MLS)
- Cardano L1 · LAMP/MAGIC

## Nhánh

```
main       ← bản phát hành (CI: AAB đã ký → Play Store)
  └── develop   ← nhánh tích hợp (CI: APK debug để cài thẳng máy thật)
        └── feat/**, claude/**   → PR vào develop
```

`branch-policy.yml` chặn mọi PR vào `main` không đến từ `develop`.

## Dựng trên máy

```bash
npm install --legacy-peer-deps
```

Android — **luôn gọi flavor tường minh**. `assembleDebug` không kèm flavor sẽ dựng **cả hai** app:

```bash
cd android && ./gradlew assembleAladinDebug
```

```bash
cd android && ./gradlew assembleCheckfarmDebug
```

iOS:

```bash
cd ios && bundle exec pod install && cd .. && npx react-native run-ios
```

## Kiểm trước khi đẩy

```bash
npx tsc --noEmit -p tsconfig.json && npx jest
```

## CI

| Workflow | Chạy khi | Ra cái gì |
|---|---|---|
| `verify-pr.yml` | PR vào `develop` / `main` | `tsc` + `jest` + `cargo test`, soi khoá lọt vào diff, soi mạch dọc cầu native |
| `debug-apk.yml` | đẩy lên `develop`, `feat/**` | APK debug của Aladin (artifact `superapp-debug-apk`) **và** một bản dựng CheckFarm để chứng minh dựng được khi không có Firebase |
| `android-aab.yml` | đẩy lên `main` | AAB đã ký cho Play Store |
| `branch-policy.yml` | PR vào `main` | chặn nếu không đến từ `develop` |

Bản phát hành cửa hàng dựng ở Codemagic (`codemagic.yaml`). **Hôm nay ở đó chỉ có Aladin**: cả hai
luồng Android (`android-debug-apk`, `android-appstore-aab`) đều khai `ANDROID_FLAVOR: aladin`, và
ba luồng iOS đều dựng gói của Aladin. CheckFarm mới có bản dựng debug ở `debug-apk.yml` — chưa có
đường lên cửa hàng.

## Tài liệu trong kho

| tệp | nội dung |
|---|---|
| [`instances/LUAT-SUPERAPP.md`](instances/LUAT-SUPERAPP.md) | luật mọi app phải tuân, và **chỗ nào có cổng cưỡng chế thật** |
| [`instances/README.md`](instances/README.md) | thêm một app mới, sinh biểu tượng |
| [`Integration-Standard.md`](Integration-Standard.md) | chuẩn tích hợp, bất biến, checklist |
| [`VersionChecklist.md`](VersionChecklist.md) | việc phải làm trước mỗi bản phát hành |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | quy ước đóng góp |
| [`AI_LOG.md`](AI_LOG.md) | nhật ký thay đổi có ghi lý do |
