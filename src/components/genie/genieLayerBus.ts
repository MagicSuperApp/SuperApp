// components/genie/genieLayerBus.ts
//
// Mở LỚP TRỢ LÝ từ bất kỳ đâu.
//
// ── TỆP NÀY NAY CHỈ LÀ MỘT CÁI TÊN CŨ ──────────────────────────────────────
// Trước đây nó là một bus sự kiện `DeviceEventEmitter` riêng. Từ khi có
// `genieController.ts` (API/state interface theo spec §21), cả trạng thái lẫn
// lệnh đều ở đó — hai cơ chế cho cùng một việc thì đến ngày ai đó gọi nhầm cái
// còn lại, và lớp không phản ứng mà cũng không báo gì.
//
// Giữ tệp lại để nơi gọi sẵn có (`AssistantBubble`, trang Tổng quan) không phải
// đổi; nó chỉ chuyển tiếp. Ngày không còn ai import thì xoá.

export { openAssistant as openGenieLayer, closeAssistant as closeGenieLayer } from './genieController';
export type { OpenOptions as GenieLayerOpenPayload } from './genieController';
