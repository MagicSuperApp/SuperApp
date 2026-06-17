# Analytics — thu thập hành vi người dùng

Hệ thống đo hành vi người dùng trong app. Gửi sự kiện theo batch lên
**Aladin Analytics Server** (`../../../../aladin_analytics_server` — Express + Prisma +
PostgreSQL). Cấu hình URL/key qua `.env`: `ANALYTICS_API_URL`, `ANALYTICS_API_KEY`.

## Thu thập gì

| Yêu cầu | Cách hệ thống đáp ứng |
|---|---|
| Thời gian một màn hình được mở/xem | **Tự động** — `screen_view.durationMs`, đo qua `NavigationContainer.onStateChange`. |
| Nhấn nút → bao lâu màn hình hiển thị | **Tự động khi dùng `trackPress`** — `screen_open_latency.latencyMs`. |
| Ghi lại các lần nhấn vào màn hình | `trackTap(target)` / `<TrackedButton>`. `target=null` = "không có nút". |
| Nhập những gì | `trackInput(target, value)` — giá trị nhạy cảm tự ẩn. |
| Dùng chức năng gì | `trackAction(actionName)`. |
| Mỗi thao tác ở màn hình nào | Mọi event đều mang `screen` (truyền qua `useAnalytics('TênMàn')`). |

## Tự động (đã wire sẵn)

- `App.tsx` → `analytics.init()` + quản lý phiên theo `AppState`.
- `navigation/index.tsx` → `onStateChange={handleNavigationStateChange}` đo
  thời gian xem màn hình và độ trễ mở màn hình.

Không cần làm gì thêm để có `screen_view` cho mọi màn hình.

## Thủ công

```tsx
import { useAnalytics } from '../services/analytics';

const MyScreen = () => {
  const { trackTap, trackInput, trackAction, trackPress } = useAnalytics('MyScreen');

  return (
    <>
      {/* Nút thường: chỉ ghi lần nhấn */}
      <Button onPress={() => { trackTap('save_button', { action: 'save_form' }); save(); }} />

      {/* Nút điều hướng: ghi nhấn + đo độ trễ tới màn kế tiếp */}
      <Button onPress={() => { trackPress('open_detail_button'); nav.navigate('Detail'); }} />

      {/* Ô nhập: ghi nội dung (password/otp/seed… tự ẩn) */}
      <TextInput onChangeText={t => { setName(t); trackInput('name_input', t); }} />

      {/* Dùng chức năng */}
      <Button onPress={() => { trackAction('start_3d_scan'); startScan(); }} />
    </>
  );
};
```

Hoặc dùng component dựng sẵn:

```tsx
import { TrackedButton } from '../services/analytics';

<TrackedButton screen="Home" target="scan_button" action="open_scanner" navigates
  onPress={() => nav.navigate('Capture3DEntry')} style={...}>
  <Text>Quét cây</Text>
</TrackedButton>
```

## Cơ chế

- Sự kiện được **đệm trong bộ nhớ + lưu bền vào AsyncStorage**, đẩy lên server
  theo batch mỗi 15s (hoặc khi đủ ngưỡng / app vào background).
- **Offline-safe**: mất mạng thì giữ trong hàng đợi và tự retry; không mất dữ liệu
  tới khi gửi thành công. Hàng đợi giới hạn 1000 event (drop cũ nhất).
- **Không bao giờ làm crash UI**: mọi lỗi nội bộ đều được nuốt.
- Tắt toàn bộ: đặt `ANALYTICS_CONFIG.ENABLED = false` trong `config.ts`.

Xem định nghĩa sự kiện ở [`types.ts`](./types.ts), cấu hình ở [`config.ts`](./config.ts).
