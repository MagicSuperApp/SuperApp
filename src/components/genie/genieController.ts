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

/**
 * Một CUỘC trò chuyện.
 *
 * ── Vì sao kho này nay có nhiều cuộc, không phải một dòng tin duy nhất ──────
 * Trước bản này `openAssistant()` xoá sạch tin cũ mỗi lần mở. Đúng với §9 lúc
 * trợ lý mới chỉ là một bảng tra: chẳng có gì đáng giữ.
 *
 * Nhưng từ khi nó trả lời được thật, cái bị xoá là một cuộc trao đổi có nội
 * dung — bác nông dân hỏi ba câu về bệnh trên lá, đóng lớp để nhìn cái cây, mở
 * lại thì mất hết. Nên tin nhắn phải thuộc về một CUỘC, và các cuộc nằm lại
 * trong một danh sách mở ra xem được.
 *
 * §9 vẫn được giữ ở chỗ nó vốn nói: MÀN HÌNH CHÍNH của trợ lý vẫn chỉ có một
 * dòng tin, không có danh sách cuộc nào nằm sẵn ở đó. Danh sách nằm sau nút
 * menu, tức là sau một cú bấm có chủ ý.
 */
export interface GenieSection {
  id: string;
  /** Tên hiện trong danh sách — lấy từ câu hỏi ĐẦU TIÊN của người dùng. */
  title: string;
  /** Lúc tạo. */
  at: number;
  /** Lúc có câu gần nhất — danh sách xếp theo cái này. */
  touched: number;
  messages: GenieMessage[];
}

export interface GenieSnapshot {
  open: boolean;
  state: AgentState;
  /**
   * Tin của cuộc ĐANG MỞ.
   *
   * SUY RA từ `sections`+`activeId`, không phải một bản sao thứ hai. Giữ hai bản
   * là chuẩn bị sẵn cho ngày một lệnh quên cập nhật một bên, và khi đó màn hình
   * hiện một đằng còn thứ lưu xuống máy là một nẻo.
   */
  messages: GenieMessage[];
  /** Mức âm thanh THÔ, chưa làm mượt. */
  audioLevel: number;
  /** Chế độ gõ đang bật (§14) — mặc định TẮT, chỉ hiện khi người dùng chọn. */
  typing: boolean;
  /** Mọi cuộc còn giữ, MỚI NHẤT ĐỨNG ĐẦU. */
  sections: GenieSection[];
  /** Cuộc đang mở. Luôn trỏ vào một phần tử có thật của `sections`. */
  activeId: string;
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

export const MAX_SECTIONS = 20;

/** Tên một cuộc chưa có câu nào của người dùng. */
export const SECTION_NEW_TITLE = 'Cuộc trò chuyện mới';

let seq = 0;
const nextId = () => `g${(seq += 1)}`;

/**
 * Bộ đếm id phải NHẢY QUA mọi id vừa nạp lại từ máy.
 *
 * Không nhảy thì cuộc mới mang đúng id của một cuộc cũ, và `key` của danh sách
 * trùng nhau — React vẽ nhầm hàng, rồi lệnh xoá xoá nhầm cuộc.
 */
function bumpSeq(id: string): void {
  const n = Number(String(id).replace(/^\D+/, ''));
  if (Number.isFinite(n) && n > seq) seq = n;
}

/** Trạng thái THẬT. `messages` không nằm ở đây — nó được suy ra lúc phát. */
interface GenieState {
  open: boolean;
  state: AgentState;
  audioLevel: number;
  typing: boolean;
  sections: GenieSection[];
  activeId: string;
}

function makeSection(now = Date.now()): GenieSection {
  return { id: nextId(), title: SECTION_NEW_TITLE, at: now, touched: now, messages: [] };
}

function emptyState(): GenieState {
  const s = makeSection();
  return {
    open: false,
    state: 'idle',
    audioLevel: 0,
    typing: false,
    // LUÔN có sẵn một cuộc, kể cả lúc chưa ai hỏi gì. Để `sections` rỗng thì mọi
    // lệnh ghi tin phải tự lo ca "chưa có cuộc nào" — và chỉ cần một chỗ quên là
    // câu của người dùng rơi vào hư vô mà không báo gì.
    sections: [s],
    activeId: s.id,
  };
}

let st: GenieState = emptyState();

function activeOf(x: GenieState): GenieSection | undefined {
  return x.sections.find((s) => s.id === x.activeId);
}

function render(x: GenieState): GenieSnapshot {
  return { ...x, messages: activeOf(x)?.messages ?? [] };
}

let snap: GenieSnapshot = render(st);

const listeners = new Set<(s: GenieSnapshot) => void>();

function emit(next: Partial<GenieState>): void {
  st = { ...st, ...next };
  snap = render(st);
  listeners.forEach((f) => f(snap));
}

/**
 * Đổi cuộc ĐANG MỞ, giữ nguyên mọi cuộc khác.
 *
 * Một hàm cho mọi lệnh ghi tin, vì ba việc luôn phải đi cùng nhau: cập nhật tin,
 * dời `touched`, và giữ cuộc còn nằm trong trần. Tách ra là để một lệnh nào đó
 * làm hai trong ba.
 */
function patchActive(f: (s: GenieSection) => GenieSection, now = Date.now()): void {
  let { sections, activeId } = st;
  if (!sections.some((s) => s.id === activeId)) {
    const moi = makeSection(now);
    sections = [moi, ...sections].slice(0, MAX_SECTIONS);
    activeId = moi.id;
  }
  emit({
    sections: sections.map((s) => (s.id === activeId ? f(s) : s)),
    activeId,
  });
}

/**
 * Tên cuộc, cắt từ câu hỏi đầu tiên.
 *
 * Cắt theo TỪ chứ không theo ký tự: cắt giữa một chữ tiếng Việt cho ra một âm
 * tiết cụt không đọc được, và danh sách đầy những cái tên như thế thì nó không
 * còn là danh sách để nhận ra cuộc nào là cuộc nào.
 */
export function sectionTitle(text: string): string {
  const cau = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!cau) return SECTION_NEW_TITLE;
  if (cau.length <= 42) return cau;
  const cat = cau.slice(0, 42);
  const kho = cat.lastIndexOf(' ');
  return `${(kho > 18 ? cat.slice(0, kho) : cat).trim()}…`;
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
  // ── Mở lớp là MỞ MỘT CUỘC MỚI, không phải xoá cuộc cũ ─────────────────────
  // Bản trước đặt thẳng `messages: []`, tức là mỗi lần mở là một lần xoá không
  // hỏi ai. Giờ cuộc cũ lui vào danh sách và vẫn mở lại được — màn hình vẫn sạch
  // như trước, nhưng thứ biến khỏi màn hình không còn biến khỏi máy.
  //
  // Cuộc đang mở CHƯA có câu nào ⇒ dùng lại. Mở-đóng-mở ba lần mà chưa hỏi gì thì
  // đẻ ra ba cuộc trống, và danh sách thành một cột rác che mất mấy cuộc thật.
  const cur = activeOf(st);
  let { sections, activeId } = st;
  if (!cur || cur.messages.length) {
    const moi = makeSection();
    sections = [moi, ...sections].slice(0, MAX_SECTIONS);
    activeId = moi.id;
  }
  emit({
    open: true,
    // §15: mở ra là `activated` — một nhịp mạnh để người dùng biết lớp đã lên,
    // rồi mới lắng xuống. Vào thẳng `idle` thì lớp hiện ra mà không có gì báo là
    // nó đang sống.
    state: o?.voice ? 'listening' : 'activated',
    audioLevel: 0,
    typing: !!o?.text,
    sections,
    activeId,
  });
}

// ── Danh sách cuộc (panel sau nút menu) ─────────────────────────────────────

/** Mở một cuộc mới và chuyển sang nó. Trả id để nơi gọi bám theo được. */
export function newSection(now = Date.now()): string {
  const moi = makeSection(now);
  emit({ sections: [moi, ...st.sections].slice(0, MAX_SECTIONS), activeId: moi.id });
  return moi.id;
}

/** Chuyển sang một cuộc đã có. Id lạ thì KHÔNG làm gì — không tự đẻ cuộc ma. */
export function selectSection(id: string): void {
  if (id === st.activeId || !st.sections.some((s) => s.id === id)) return;
  emit({ activeId: id });
}

/**
 * Xoá một cuộc.
 *
 * Xoá đúng cuộc đang mở thì phải có cuộc khác thế chỗ NGAY: để `activeId` trỏ vào
 * hư vô là để màn hình chính rơi vào một trạng thái không tên, và lệnh ghi tin
 * kế tiếp lặng lẽ đẻ ra một cuộc thứ hai mà người dùng không hiểu ở đâu ra.
 */
export function deleteSection(id: string): void {
  const sections = st.sections.filter((s) => s.id !== id);
  if (id !== st.activeId) {
    emit({ sections });
    return;
  }
  if (!sections.length) {
    const moi = makeSection();
    emit({ sections: [moi], activeId: moi.id });
    return;
  }
  emit({ sections, activeId: sections[0].id });
}

/**
 * Xoá SẠCH mọi cuộc.
 *
 * Gọi lúc đăng xuất, và đó không phải việc dọn dẹp cho gọn: ngoài đồng một chiếc
 * máy dùng chung cho cả tổ, nên cuộc trò chuyện của người trước phải đi khỏi máy
 * cùng lúc với phiên của họ — cùng lý do `clearGenieAuth()` tồn tại.
 */
export function clearSections(): void {
  const moi = makeSection();
  emit({ sections: [moi], activeId: moi.id });
}

/** Nạp lại danh sách từ máy. Chỉ dùng bởi `genieHistory.ts`. */
export function hydrateSections(list: GenieSection[]): void {
  const sach = (Array.isArray(list) ? list : []).filter(
    (s) => s && typeof s.id === 'string' && Array.isArray(s.messages),
  );
  if (!sach.length) return;
  sach.forEach((s) => {
    bumpSeq(s.id);
    s.messages.forEach((m) => bumpSeq(m.id));
  });
  const giu = sach.slice(0, MAX_SECTIONS);
  // Nạp lại KHÔNG chuyển cuộc đang mở sang cuộc cũ: lúc này người dùng có thể đã
  // gõ xong một câu rồi. Cuộc đang mở đứng đầu, lịch sử xếp sau.
  const cur = activeOf(st);
  const dau = cur && !giu.some((s) => s.id === cur.id) ? [cur] : [];
  emit({
    sections: [...dau, ...giu].slice(0, MAX_SECTIONS),
    activeId: cur ? cur.id : giu[0].id,
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
  patchActive((s) => ({
    ...s,
    touched: now,
    // Tên cuộc đặt bằng câu hỏi ĐẦU TIÊN của người dùng, và chỉ một lần. Đặt lại
    // theo câu mới nhất thì cái tên chạy dưới tay người dùng, và một danh sách có
    // tên tự đổi là danh sách không nhớ được.
    title: s.title === SECTION_NEW_TITLE && from === 'user' ? sectionTitle(m.text) : s.title,
    messages: [...s.messages, m].slice(-MAX_MESSAGES),
  }), now);
  return m;
}

/** Thay nội dung câu cuối của trợ lý — để dựng luồng chữ chảy dần (§21). */
export function updateLastAgentMessage(text: string): void {
  const ms = [...(activeOf(st)?.messages ?? [])];
  for (let i = ms.length - 1; i >= 0; i -= 1) {
    if (ms[i].from === 'agent') {
      ms[i] = { ...ms[i], text: String(text ?? '') };
      patchActive((s) => ({ ...s, messages: ms }));
      return;
    }
  }
  pushMessage('agent', text);
}

/** Chỉ dùng trong bài kiểm — dọn kho về trạng thái đầu. */
export function __resetGenie(): void {
  seq = 0;
  st = emptyState();
  snap = render(st);
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
