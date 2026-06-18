// services/aladinChat.ts
//
// Client cho API trợ lý Aladin (text streaming).
// Endpoint trả về body kiểu text/plain stream — đọc dần qua XHR vì
// fetch().body.getReader() chưa ổn định trên React Native 0.84.

const ALADIN_CHAT_URL =
  'https://overmelodiously-skylike-phillip.ngrok-free.dev/chat';

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
