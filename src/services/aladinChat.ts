// services/aladinChat.ts
//
// Client cho API trợ lý Aladin (text streaming).
// Endpoint trả về body kiểu text/plain stream — đọc dần qua XHR vì
// fetch().body.getReader() chưa ổn định trên React Native 0.84.

import { ALADIN_CHAT_URL } from '@env';

// ⛔ KHÔNG có đường lui mặc định — cùng lý do với `remoteLogger.ts` và
// `analytics/analyticsApi.ts`. Chỗ này từng viết cứng
// `https://overmelodiously-skylike-phillip.ngrok-free.dev/chat`: một tunnel tạm trên
// máy lập trình viên, nhận NGUYÊN VĂN câu hỏi của người dùng thật. Tunnel tắt là địa chỉ
// đó ai giành cũng được. Chuỗi này CÓ trong bundle bản dựng tay 15/08 (đo bằng `strings`).
// Chưa có endpoint phát hành ⇒ để trống ⇒ trợ lý tắt hẳn (xem `chatEnabled` dưới),
// KHÔNG phải im lặng gửi đi chỗ khác.
// Không đặt bí danh `import { X as Y }`: cổng đối chiếu ở
// `.github/actions/rn-env/action.yml` bóc tên biến bằng grep, và dạng bí danh làm nó
// đọc ra "X as Y" rồi báo thiếu biến. Cổng đã được vá để cắt phần `as …`, nhưng cứ
// nhập thẳng cho khỏi phụ thuộc vào bản vá đó.
const CHAT_URL = String(ALADIN_CHAT_URL ?? '').trim();

/** Có endpoint trợ lý để gọi không. Dùng ở `AssistantBubble` để ẩn hẳn bong bóng. */
export const chatEnabled = (): boolean => CHAT_URL.length > 0;

const DEFAULT_MODE = 'QA';
const DEFAULT_MODEL = 'llama3.2:1b-instruct-q8_0';

export type ChatRole = 'user' | 'assistant';
export type ChatHistoryEntry = [string, ChatRole];

export interface StreamChatOptions {
  message: string;
  history: ChatHistoryEntry[];
  mode?: string;
  modelName?: string;
  onChunk: (delta: string, full: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: Error) => void;
}

export interface StreamChatHandle {
  abort: () => void;
}

export function streamChat({
  message,
  history,
  mode = DEFAULT_MODE,
  modelName = DEFAULT_MODEL,
  onChunk,
  onDone,
  onError,
}: StreamChatOptions): StreamChatHandle {
  // Chưa cấu hình endpoint ⇒ báo lỗi rõ ràng ngay, KHÔNG mở kết nối đi đâu cả.
  // Bình thường `AssistantBubble` đã ẩn nhờ `chatEnabled()` nên nhánh này không tới;
  // giữ ở đây để một caller khác gọi thẳng cũng không lọt ra mạng.
  if (!ALADIN_CHAT_URL) {
    onError?.(new Error('Trợ lý Aladin chưa được cấu hình ở bản dựng này'));
    return { abort: () => {} };
  }

  const xhr = new XMLHttpRequest();
  let lastIndex = 0;
  let aborted = false;

  xhr.open('POST', ALADIN_CHAT_URL, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/plain');

  xhr.onreadystatechange = () => {
    if (aborted) return;

    // readyState 3 = LOADING (đang nhận chunks); 4 = DONE
    if (xhr.readyState === 3 || xhr.readyState === 4) {
      const text = xhr.responseText || '';
      if (text.length > lastIndex) {
        const delta = text.slice(lastIndex);
        lastIndex = text.length;
        try {
          onChunk(delta, text);
        } catch {}
      }

      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          onDone?.(text);
        } else {
          onError?.(
            new Error(
              `Aladin chat HTTP ${xhr.status}${text ? `: ${text}` : ''}`,
            ),
          );
        }
      }
    }
  };

  xhr.onerror = () => {
    if (aborted) return;
    onError?.(new Error('Lỗi mạng khi gọi trợ lý Aladin'));
  };

  xhr.ontimeout = () => {
    if (aborted) return;
    onError?.(new Error('Trợ lý Aladin phản hồi quá lâu'));
  };

  try {
    xhr.send(
      JSON.stringify({
        message,
        mode,
        model_name: modelName,
        history,
      }),
    );
  } catch (e: any) {
    onError?.(new Error(e?.message || 'Không gửi được yêu cầu tới Aladin'));
  }

  return {
    abort: () => {
      aborted = true;
      try {
        xhr.abort();
      } catch {}
    },
  };
}
