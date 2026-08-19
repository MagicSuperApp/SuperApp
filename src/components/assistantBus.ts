/**
 * assistantBus — mở TRỢ LÝ từ bất kỳ màn nào.
 *
 * Trợ lý (`AssistantBubble`) là một bong bóng nổi trên mọi màn, không phải một
 * trang trong bộ điều hướng — nên không có route nào để `navigate` tới. Nơi
 * muốn mở nó thì phát một sự kiện; chính bong bóng lắng nghe và tự mở.
 *
 * Tên sự kiện để ở tệp RIÊNG chứ không viết thẳng hai nơi: gõ lệch một chữ là
 * nút bấm im lặng không làm gì, và không có lỗi nào nổ ra để lần ra.
 */
import { DeviceEventEmitter } from 'react-native';

export const ASSISTANT_OPEN_EVENT = 'assistant:open';

/** Mở trợ lý. `text` có thì đặt sẵn vào ô nhập cho người dùng gõ tiếp. */
export function openAssistant(text?: string): void {
  DeviceEventEmitter.emit(ASSISTANT_OPEN_EVENT, text ? { text } : undefined);
}
