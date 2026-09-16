// services/genie/asr.ts
//
// Cổng NGHE (§10) — chặng G3.
//
// ── TRẠNG THÁI HÔM NAY, NÓI THẲNG ──────────────────────────────────────────
// Kho này CHƯA CÀI module nhận giọng nói nào. Đo bằng `package.json`: không có
// `@react-native-voice/voice`, không `expo-av`, không `expo-speech`, không
// `react-native-audio-record`. Nên `asrAvailable()` trả `false`, và nút mic nói
// đúng sự thật đó thay vì bấm vào rồi không có gì xảy ra.
//
// ── VÌ SAO VẪN VIẾT TỆP NÀY BÂY GIỜ ────────────────────────────────────────
// Vì cái tốn công ở G3 không phải lời gọi module — nó là HÌNH DẠNG: ai giữ
// quyền mic, biên độ đi đường nào tới chỗ vẽ, cắt lời xử ra sao. Chốt hình dạng
// đó bây giờ thì lúc cài module chỉ còn điền một thân hàm, và `GenieLayer` không
// phải sửa một dòng nào.
//
// ── DÒ BẰNG `require` ĐỒNG BỘ TRONG `try/catch` ────────────────────────────
// KHÔNG dùng `React.lazy`/`import()` động. Bài học đã trả giá trong kho này
// (xem `EdgeWaveGL.tsx`): `React.lazy` cho một module native vắng mặt làm bản
// release chết bằng SIGABRT, chứ không rơi êm xuống nhánh dự phòng. `require`
// đồng bộ trong `try/catch` thì hỏng ĐÚNG như mong đợi: bắt được, và lui.

/** Biên độ 0..1, đẩy ~60 lần/giây trong lúc nghe. */
export type LevelSink = (level: number) => void;

export interface AsrPort {
  /** Có nhận giọng nói được không. Hỏi TRƯỚC khi vẽ nút mic ở trạng thái bật. */
  available: () => boolean;
  /**
   * Bắt đầu nghe. Trả hàm DỪNG.
   *
   * `onPartial` chạy liên tục trong lúc nói; `onFinal` chạy đúng một lần. Tách
   * hai cái này chứ không gộp: chữ tạm dùng để vẽ cho người dùng thấy máy đang
   * nghe, còn chữ chốt mới được đem đi hỏi — trộn chúng lại là gửi đi một câu
   * chưa nói xong.
   */
  start: (cb: {
    onPartial?: (text: string) => void;
    onFinal: (text: string) => void;
    onLevel?: LevelSink;
    onError?: (e: Error) => void;
  }) => () => void;
}

type VoiceModule = {
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  removeAllListeners: () => void;
  onSpeechResults?: ((e: { value?: string[] }) => void) | null;
  onSpeechPartialResults?: ((e: { value?: string[] }) => void) | null;
  onSpeechVolumeChanged?: ((e: { value?: number }) => void) | null;
  onSpeechError?: ((e: { error?: { message?: string } }) => void) | null;
};

/** Tiếng Việt. Không đoán theo máy: người dùng của app này nói tiếng Việt. */
const LOCALE = 'vi-VN';

let probed = false;
let mod: VoiceModule | null = null;

function load(): VoiceModule | null {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const m = require('@react-native-voice/voice');
    mod = (m?.default ?? m) as VoiceModule;
    // Có module mà thiếu hàm ⇒ coi như KHÔNG có. Một module nửa vời còn tệ hơn
    // không có: nó qua được cổng kiểm rồi ném ở giữa lúc người dùng đang nói.
    if (typeof mod?.start !== 'function' || typeof mod?.stop !== 'function') mod = null;
  } catch {
    mod = null;
  }
  return mod;
}

export function asrAvailable(): boolean {
  return load() != null;
}

/**
 * `-2..10` dB của `@react-native-voice` → `0..1`.
 *
 * Thang gốc không tuyến tính và không cùng đơn vị giữa hai hệ điều hành, nên chỗ
 * này là một phép NẮN, không phải một phép đổi đơn vị. Nó nằm ở đây — một chỗ —
 * để `edgeWaveMath.Envelope` chỉ phải biết về 0..1.
 */
export function normLevel(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const v = (raw + 2) / 12;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const asr: AsrPort = {
  available: asrAvailable,

  start(cb) {
    const m = load();
    if (!m) {
      cb.onError?.(new Error('Máy này chưa có phần nhận giọng nói'));
      return () => {};
    }

    let stopped = false;
    // Chữ CHỐT chỉ được gửi MỘT lần. Android bắn `onSpeechResults` rồi đôi khi
    // bắn thêm một lần nữa lúc `stop()` — không chặn thì người dùng nói một câu
    // mà trợ lý nhận hai lượt, và tính tiền hai lần.
    let sentFinal = false;

    const finish = (text: string): void => {
      if (sentFinal || stopped) return;
      const s = text.trim();
      if (!s) return;
      sentFinal = true;
      cb.onFinal(s);
    };

    m.onSpeechPartialResults = (e) => {
      if (stopped) return;
      const s = e?.value?.[0];
      if (s) cb.onPartial?.(s);
    };
    m.onSpeechResults = (e) => finish(e?.value?.[0] || '');
    m.onSpeechVolumeChanged = (e) => {
      if (!stopped) cb.onLevel?.(normLevel(Number(e?.value)));
    };
    m.onSpeechError = (e) => {
      if (stopped) return;
      cb.onError?.(new Error(e?.error?.message || 'Không nghe được'));
    };

    m.start(LOCALE).catch((e: Error) => {
      if (!stopped) cb.onError?.(e);
    });

    return () => {
      if (stopped) return;
      stopped = true;
      // Gỡ tai nghe TRƯỚC khi dừng: `stop()` bắn thêm sự kiện, và sự kiện đó rơi
      // vào một lượt đã đóng.
      try {
        m.removeAllListeners?.();
      } catch { /* module có thể đã tháo */ }
      m.stop().catch(() => {});
      cb.onLevel?.(0);
    };
  },
};
