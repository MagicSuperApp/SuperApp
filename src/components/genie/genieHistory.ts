// components/genie/genieHistory.ts
//
// GIỮ LẠI các cuộc trò chuyện qua một lần tắt app.
//
// ── Vì sao tách khỏi `genieController.ts` ───────────────────────────────────
// Kho trạng thái phải chạy được trong một bài kiểm mà không cần một cái máy: nó
// là thứ Backend Agent nói chuyện qua (§21). Nhét `AsyncStorage` vào đó là buộc
// mọi bài kiểm của trợ lý phải dựng một kho khoá giả — và một bài kiểm phải dựng
// chừng ấy thứ mới chạy được là một bài kiểm sẽ bị tắt đi.
//
// Nên tệp này đứng NGOÀI và chỉ làm một việc: nghe kho, ghi xuống máy, và nạp
// lại lúc app mở. Không có nó thì trợ lý vẫn chạy đúng như cũ, chỉ là quên sau
// mỗi lần tắt app.
//
// ── Và vì sao lịch sử phải BIẾN MẤT lúc đăng xuất ──────────────────────────
// Ngoài đồng một chiếc máy dùng chung cho cả tổ. Câu hỏi của bác A về vườn nhà
// bác A không được nằm lại cho bác B mở ra đọc. Đây là cùng một luật mà
// `genieAuth.clearGenieAuth()` thi hành cho thẻ danh tính, và hai thứ phải rụng
// cùng lúc — nên `clearGenieAuth()` gọi thẳng sang đây.

import {
  MAX_SECTIONS,
  SECTION_NEW_TITLE,
  getGenieSnapshot,
  hydrateSections,
  subscribeGenie,
  type GenieSection,
} from './genieController';

/** `v1` nằm trong khoá, cố ý: đổi hình dạng bản ghi thì đổi khoá, đừng đọc rác cũ. */
const KEY = 'genie.sections.v1';

/**
 * Chờ bao lâu sau câu cuối mới ghi xuống máy.
 *
 * Mỗi câu trả lời chảy dần làm `updateLastAgentMessage` bắn hàng chục lần một
 * giây. Ghi theo từng nhịp đó là hàng chục lượt vào bộ nhớ máy cho MỘT câu, trên
 * đúng những chiếc máy yếu nhất mà app này phục vụ.
 */
const SAVE_DELAY_MS = 900;

let timer: ReturnType<typeof setTimeout> | null = null;
let off: (() => void) | null = null;
/**
 * Danh sách ở lần ghi gần nhất — so bằng THAM CHIẾU.
 *
 * Kho bắn sự kiện cho mọi thứ, kể cả `setAudioLevel` (~30–60 lần/giây lúc đang
 * nghe). Hẹn lại giờ ghi theo từng nhịp đó thì cái hẹn KHÔNG BAO GIỜ tới: nó bị
 * đẩy lùi mỗi 16 ms suốt cả câu nói, và lịch sử chỉ được ghi sau khi người dùng
 * im lặng — đúng lúc họ có thể đã tắt app.
 *
 * `emit` dựng lại mảng mỗi lần đổi thật, nên so tham chiếu là đủ và rẻ nhất.
 */
let daGhi: unknown = null;

function store(): {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('@react-native-async-storage/async-storage').default;
  } catch {
    // Không có kho (bài kiểm, hoặc máy chưa dựng native) ⇒ trợ lý vẫn chạy, chỉ
    // là quên sau mỗi lần tắt app. Đây là việc phụ; nó không được làm đổ app.
    return null;
  }
}

/**
 * Cuộc nào ĐÁNG ghi.
 *
 * Cuộc trống thì không: nó chỉ là dấu vết của một lần mở lớp rồi đổi ý, và ghi nó
 * xuống là để lần sau mở ra gặp một danh sách toàn dòng trống.
 */
export function worthKeeping(s: GenieSection): boolean {
  return !!s && Array.isArray(s.messages) && s.messages.length > 0;
}

/** Bản ghi đọc từ máy → danh sách dùng được. Rác thì BỎ, không ném. */
export function parseSections(raw: string | null): GenieSection[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.messages))
      .map((s) => ({
        id: String(s.id),
        title: typeof s.title === 'string' && s.title.trim() ? s.title : SECTION_NEW_TITLE,
        at: Number(s.at) || Date.now(),
        touched: Number(s.touched) || Number(s.at) || Date.now(),
        messages: s.messages
          .filter((m: unknown) => !!m && typeof (m as GenieSection['messages'][0]).id === 'string')
          .map((m: GenieSection['messages'][0]) => ({
            id: String(m.id),
            from: m.from === 'user' ? 'user' as const : 'agent' as const,
            text: String(m.text ?? ''),
            at: Number(m.at) || 0,
          })),
      }))
      .filter(worthKeeping)
      .slice(0, MAX_SECTIONS);
  } catch {
    return [];
  }
}

function saveSoon(): void {
  const cur = getGenieSnapshot().sections;
  if (cur === daGhi) return;
  daGhi = cur;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const kho = store();
    if (!kho) return;
    const giu = getGenieSnapshot().sections.filter(worthKeeping).slice(0, MAX_SECTIONS);
    void kho.setItem(KEY, JSON.stringify(giu)).catch(() => {
      // Máy hết chỗ, hoặc kho khoá không mở được. Mất lịch sử thì tiếc, nhưng
      // một ngoại lệ chưa bắt ở đây làm đổ cả app.
    });
  }, SAVE_DELAY_MS);
}

/**
 * Nạp lịch sử rồi bắt đầu ghi. Gọi MỘT LẦN ở `onReady` của navigation.
 *
 * Gọi lại lần nữa không sao — nó tự gỡ lượt nghe cũ trước, nên không có hai lượt
 * cùng ghi vào một khoá.
 */
export function startGenieHistory(): void {
  off?.();
  const kho = store();
  if (kho) {
    void kho
      .getItem(KEY)
      .then((raw) => {
        const list = parseSections(raw);
        if (list.length) hydrateSections(list);
      })
      .catch(() => { /* đọc không được thì bắt đầu từ trang trắng */ });
  }
  off = subscribeGenie(saveSoon);
}

/** Đăng xuất ⇒ xoá khỏi máy. Xem lời dẫn đầu tệp. */
export function clearGenieHistory(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  daGhi = null;
  const kho = store();
  void kho?.removeItem(KEY).catch(() => { /* lần sau ghi đè lên là xong */ });
}

/** Chỉ dùng trong bài kiểm — gỡ lượt nghe để bài sau không dính lượt ghi của bài trước. */
export function __stopGenieHistory(): void {
  off?.();
  off = null;
  daGhi = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
