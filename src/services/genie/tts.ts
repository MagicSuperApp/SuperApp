// services/genie/tts.ts
//
// Cổng NÓI (§10) — chặng G3.
//
// Cùng khuôn `asr.ts`: dò bằng `require` đồng bộ trong `try/catch`, không có
// module thì `available()` trả `false` và lớp phủ chỉ HIỆN CHỮ. Trợ lý im tiếng
// vẫn dùng được; trợ lý nói dối thì không.
//
// ── VÌ SAO CỔNG NÓI PHẢI ĐẨY BIÊN ĐỘ RA ───────────────────────────────────
// Spec §8: sóng viền nhấp nhô THEO NHỊP LOA của trợ lý. Không có biên độ thật
// thì sóng chỉ là một hoạt ảnh chạy vòng — đẹp, nhưng nói dối: nó nhấp nhô cả
// lúc trợ lý đang im.
//
// `expo-speech` KHÔNG cho đọc biên độ. Nên cho tới khi có một module đọc được,
// tệp này ƯỚC LƯỢNG từ tiến độ đọc: một đường bao chậm, dâng lúc bắt đầu câu và
// hạ về 0 lúc dứt. Nói rõ đây là ƯỚC LƯỢNG chứ không phải đo — [NEEDS-EVIDENCE]
// là chỗ này, và nó phải được thay bằng biên độ thật ở G3 hoàn chỉnh.

export interface TtsPort {
  available: () => boolean;
  /** Đọc một câu. Trả hàm DỪNG (cho barge-in). */
  speak: (text: string, cb?: {
    onLevel?: (level: number) => void;
    onDone?: () => void;
  }) => () => void;
  /** Dừng mọi thứ đang đọc. Gọi khi người dùng cắt lời. */
  stopAll: () => void;
}

type SpeechModule = {
  speak: (text: string, opts?: Record<string, unknown>) => void;
  stop: () => void;
};

const LANG = 'vi-VN';
/** [PARAM] Nhịp cập nhật đường bao ước lượng. 16 ms ≈ 60 fps. */
const TICK_MS = 16;
/** [NEEDS-EVIDENCE] Tốc độ đọc ước chừng, âm tiết/giây. Đo trên máy thật rồi chốt. */
const SYLLABLES_PER_SEC = 4.6;

let probed = false;
let mod: SpeechModule | null = null;

function load(): SpeechModule | null {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const m = require('expo-speech');
    mod = (m?.default ?? m) as SpeechModule;
    if (typeof mod?.speak !== 'function') mod = null;
  } catch {
    mod = null;
  }
  return mod;
}

export function ttsAvailable(): boolean {
  return load() != null;
}

/**
 * Ước lượng thời gian đọc một câu, tính bằng mili-giây.
 *
 * Đếm theo ÂM TIẾT chứ không theo ký tự: tiếng Việt là ngôn ngữ đơn âm, nên số
 * âm tiết gần đúng số khoảng trắng cộng một — và nó ổn định hơn hẳn số ký tự,
 * vốn phình ra vì dấu.
 */
export function estimateMs(text: string): number {
  const syl = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (!syl) return 0;
  return Math.round((syl / SYLLABLES_PER_SEC) * 1000);
}

export const tts: TtsPort = {
  available: ttsAvailable,

  speak(text, cb) {
    const m = load();
    const total = estimateMs(text);
    if (!m || !total) {
      cb?.onDone?.();
      return () => {};
    }

    let stopped = false;
    const t0 = Date.now();

    // Đường bao ƯỚC LƯỢNG — xem lời dẫn đầu tệp. Dâng nhanh ở đầu, giữ, rồi hạ
    // về 0 ở cuối; cộng một gợn nhỏ để sóng không phẳng lì như một thanh tiến độ.
    const timer = setInterval(() => {
      if (stopped) return;
      const u = Math.min(1, (Date.now() - t0) / total);
      const bell = Math.sin(Math.PI * u);
      const gon = 0.12 * Math.sin(u * 37);
      cb?.onLevel?.(Math.max(0, Math.min(1, 0.55 * bell + gon + 0.18)));
      if (u >= 1) {
        clearInterval(timer);
        cb?.onLevel?.(0);
        cb?.onDone?.();
      }
    }, TICK_MS);

    try {
      m.speak(text, { language: LANG, onDone: undefined });
    } catch {
      // Module có mà đọc không được (thiếu giọng tiếng Việt trên máy) ⇒ vẫn để
      // đường bao chạy hết. Chữ đã hiện trên màn rồi; sóng tắt giữa chừng chỉ
      // làm người dùng tưởng trợ lý bị ngắt.
    }

    return () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      cb?.onLevel?.(0);
      try {
        m.stop();
      } catch { /* đã tháo */ }
    };
  },

  stopAll() {
    const m = load();
    try {
      m?.stop();
    } catch { /* đã tháo */ }
  },
};
