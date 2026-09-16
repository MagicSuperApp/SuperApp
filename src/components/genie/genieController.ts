// components/genie/genieController.ts
//
// API/STATE INTERFACE của Lớp Trợ lý (spec §21).
//
//   > "Overlay cần có API/state interface rõ ràng để Backend Agent và Mobile UI
//      có thể giao tiếp với nhau."
//
// ── VÌ SAO LÀ MỘT KHO NHỎ, KHÔNG PHẢI PROPS ─────────────────────────────────
// Lớp Trợ lý dựng NGOÀI `Stack.Navigator` (nó không phải một trang), nên không
// có cây component nào chảy props xuống nó. Và thứ điều khiển nó không phải một
// màn hình — là service Genie ở xa, nói chuyện qua SSE.
//
// Nên bề mặt điều khiển là một kho nhỏ với vài hàm gọi được từ bất cứ đâu:
//
//     openAssistant()      mở lớp
//     setAgentState()      §15 — đổi trạng thái, đổi animation
//     pushMessage()        §9  — một câu vào dòng tin
//     setAudioLevel()      §8  — biên độ THÔ; lớp tự làm mượt
//     closeAssistant()     đóng
//
// ── `setAudioLevel` NHẬN SỐ THÔ, CỐ Ý ───────────────────────────────────────
// Bên gọi đẩy vào mức tức thời từ bộ ghi âm hoặc từ mốc tiến trình TTS, không
// phải làm mượt trước. Làm mượt là việc của lớp vẽ (`Envelope`, §8), và để nó ở
// một chỗ thì hai nguồn âm thanh — mic của người, giọng của trợ lý — không thể
// có hai độ mượt khác nhau.
//
// ── KHÔNG DÙNG Redux ────────────────────────────────────────────────────────
// `setAudioLevel` bắn ~30–60 lần/giây. Đẩy từng đó action qua Redux là ép cả cây
// selector chạy lại mỗi khung hình, cho một giá trị mà CHỈ một component đọc.
// Kho này gọn hơn đúng một bậc, và biên của nó hẹp tới mức nhìn là hết.

import { useEffect, useState } from 'react';
import type { AgentState } from './edgeWaveMath';

export interface GenieMessage {
  id: string;
  from: 'agent' | 'user';
  text: string;
  /** Mốc thời gian để dòng tin biết cái nào cũ mà mờ đi (§9). */
  at: number;
}

export interface GenieSnapshot {
  open: boolean;
  state: AgentState;
  messages: GenieMessage[];
  /** Mức âm thanh THÔ, chưa làm mượt. */
  audioLevel: number;
  /** Chế độ gõ đang bật (§14) — mặc định TẮT, chỉ hiện khi người dùng chọn. */
  typing: boolean;
}

export interface OpenOptions {
  /** Đặt sẵn vào ô nhập. */
  text?: string;
  /** Mở thẳng chế độ nghe. */
  voice?: boolean;
}

/**
 * Trần số tin giữ lại.
 *
 * Spec §9 nói rõ Trợ lý **không phải một cửa sổ chat**: không danh sách message
 * dài, không lịch sử cuộn mãi. Nhưng chủ sở hữu cũng chốt rằng các câu phải xếp
 * chồng lên nhau chứ không thay nhau.
 *
 * Trần này là chỗ hai yêu cầu gặp nhau: các câu XẾP CHỒNG, nhưng chỉ vài câu gần
 * nhất còn nằm đó. Cũ hơn thì rụng — đó là một DÒNG TIN, không phải một kho lưu.
 */
/**
 * Số câu GIỮ trong kho.
 *
 * Trước là 6, vì dòng tin lúc đó KHÔNG cuộn được — giữ nhiều hơn số vẽ ra là giữ
 * những câu không ai xem được. Giờ hộp tin cuộn được, nên con số này thành "cuộn
 * lên xem lại được bao xa", và 6 là quá ngắn cho một cuộc trao đổi thật.
 *
 * 40 chứ không phải không giới hạn: đây vẫn là bộ nhớ của một phiên trên máy
 * người dùng, và một cuộc nói chuyện dài với ảnh kèm theo thì 40 câu đã là nhiều.
 */
export const MAX_MESSAGES = 40;

let seq = 0;
const nextId = () => `g${(seq += 1)}`;

let snap: GenieSnapshot = {
  open: false,
  state: 'idle',
  messages: [],
  audioLevel: 0,
  typing: false,
};

const listeners = new Set<(s: GenieSnapshot) => void>();

function emit(next: Partial<GenieSnapshot>): void {
  snap = { ...snap, ...next };
  listeners.forEach((f) => f(snap));
}

export function getGenieSnapshot(): GenieSnapshot {
  return snap;
}

export function subscribeGenie(f: (s: GenieSnapshot) => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

// ── Lệnh ────────────────────────────────────────────────────────────────────

export function openAssistant(o?: OpenOptions): void {
  emit({
    open: true,
    // §15: mở ra là `activated` — một nhịp mạnh để người dùng biết lớp đã lên,
    // rồi mới lắng xuống. Vào thẳng `idle` thì lớp hiện ra mà không có gì báo là
    // nó đang sống.
    state: o?.voice ? 'listening' : 'activated',
    messages: [],
    audioLevel: 0,
    typing: !!o?.text,
  });
}

export function closeAssistant(): void {
  emit({ open: false, state: 'idle', audioLevel: 0, typing: false });
}

export function setAgentState(state: AgentState): void {
  emit({ state });
}

export function setTypingMode(typing: boolean): void {
  emit({ typing });
}

/** Mức âm thanh tức thời ∈ [0,1]. Kẹp ở đây để bên gọi không phải nhớ. */
export function setAudioLevel(level: number): void {
  const v = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  if (v === snap.audioLevel) return;
  emit({ audioLevel: v });
}

export function pushMessage(from: GenieMessage['from'], text: string, now = Date.now()): GenieMessage {
  const m: GenieMessage = { id: nextId(), from, text: String(text ?? ''), at: now };
  const keep = [...snap.messages, m].slice(-MAX_MESSAGES);
  emit({ messages: keep });
  return m;
}

/** Thay nội dung câu cuối của trợ lý — để dựng luồng chữ chảy dần (§21). */
export function updateLastAgentMessage(text: string): void {
  const ms = [...snap.messages];
  for (let i = ms.length - 1; i >= 0; i -= 1) {
    if (ms[i].from === 'agent') {
      ms[i] = { ...ms[i], text: String(text ?? '') };
      emit({ messages: ms });
      return;
    }
  }
  pushMessage('agent', text);
}

/** Chỉ dùng trong bài kiểm — dọn kho về trạng thái đầu. */
export function __resetGenie(): void {
  seq = 0;
  snap = { open: false, state: 'idle', messages: [], audioLevel: 0, typing: false };
  listeners.forEach((f) => f(snap));
}

// ── Hook cho phía vẽ ────────────────────────────────────────────────────────

export function useGenie(): GenieSnapshot {
  const [s, setS] = useState<GenieSnapshot>(snap);
  useEffect(() => {
    setS(snap);
    return subscribeGenie(setS);
  }, []);
  return s;
}
