// services/genie/genieAgent.ts
//
// NGƯỜI LÁI phía vỏ: ghép đường tắt trên máy với vòng ReAct trên máy chủ.
//
// ── HAI TẦNG, VÀ THỨ TỰ LÀ CÓ LÝ DO ────────────────────────────────────────
//
//   1. ĐƯỜNG TẮT (`fastPath`) — trên máy, 0 token, chạy khi mất sóng, trả lời
//      trong một nhịp. Nuốt được câu nào thì nuốt.
//   2. MÔ HÌNH (service Genie §11) — chỉ nhận phần đường tắt KHÔNG nuốt được.
//
// Đảo thứ tự này là hỏng cả hai đầu: "thêm vườn" — câu phổ biến nhất — sẽ mất
// một vòng mạng và một khoản tiền để ra đúng cái kết quả mà một bảng tra đã cho
// ngay lập tức, và ngoài vườn mất sóng thì nó không ra gì cả.
//
// ── CÂU NÀO ĐI ĐÂU, NÓI RÕ ─────────────────────────────────────────────────
//   · `hit`       → mở màn ngay, không gọi mô hình
//   · `ambiguous` → hỏi lại ngay, không gọi mô hình (đã biết đủ để hỏi)
//   · `near`/`miss` → ĐÂY mới là phần cần nghĩ. Có `GENIE_URL` thì đưa lên mô
//     hình; không có thì rơi về câu từ chối của `handle()`.
//
// Nghĩa là tiền chỉ tiêu cho những câu thật sự cần nghĩ — và cũng chính những
// câu đó là chỗ trợ lý đang lộ ra là một cái máy.

import { matchFastPath } from './fastPath';
import { genieOpenScreen } from './genieNav';
import { handle, type GenieOutcome } from './index';
import { GENIE_SCOPES } from './playbooks.generated';
import {
  genieEnabled,
  genieBaseUrl,
  genieHealth,
  SESSION_TIMEOUT_MS,
  openGenieSession,
  postGenieTurn,
  postObservation,
  postConfirm,
  postCancel,
  type GenieContext,
  type GenieEvent,
  type GenieSession,
  type TurnHandle,
  GenieHttpError,
} from './genieClient';
import type { GenieImage } from './genieImage';

export interface AskCallbacks {
  /** Trợ lý nói một câu. Gọi nhiều lần trong một lượt là chuyện bình thường. */
  onSay: (text: string) => void;
  /** Đổi dáng sóng viền theo trạng thái (§8). */
  onState?: (s: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
  /** Trợ lý vừa mở một màn — lớp phủ đóng lại để người dùng thấy màn đó. */
  onOpened?: (route: string) => void;
  /**
   * Trợ lý xin phép ghi (T2). Trả `true`/`false`.
   *
   * KHÔNG có mặc định, và không có hết-giờ-thì-coi-như-đồng-ý: im lặng không phải
   * đồng ý (§4.6). Nơi gọi PHẢI hỏi người dùng thật.
   */
  onConfirm?: (text: string, callId: string) => Promise<boolean>;
  /** Lượt kết thúc — vì xong, vì lỗi, hay vì bị cắt. */
  onDone?: () => void;
}

export interface AskHandle {
  abort: () => void;
}

/** Nguồn thẻ phiên + id máy. Tiêm vào để bài kiểm không phải dựng cả PhoenixKey. */
export interface AuthPort {
  token: () => Promise<string | null>;
  deviceId: () => Promise<string>;
  /** Vứt thẻ đang giữ — gọi khi máy chủ bác nó (401). Không bắt buộc. */
  forget?: () => void;
}

let authPort: AuthPort | null = null;
let cached: { session: GenieSession; token: string } | null = null;

export function setGenieAuth(p: AuthPort | null): void {
  authPort = p;
  cached = null;
}

/** Quên phiên — gọi khi đổi danh tính hoặc đăng xuất. */
export function resetGenieSession(): void {
  cached = null;
}

/**
 * Scope Genie xin lúc mở phiên.
 *
 * ⛔ SINH TỰ ĐỘNG từ `src/genie/tools/registry.js` bên Wish — **đừng gõ tay lại**.
 * Bản trước của tệp này gõ tay `farm.read`/`care.write`/`animal.read`… và không
 * một chữ nào khớp tên thật (`read:trace.record`, `write:trace.record`, …). Hệ
 * quả: máy chủ lọc sổ tool theo scope, app nhìn thấy đúng **5 tool `ui.*`**, còn
 * 17 tool máy chủ thì vô hình. Trợ lý mở được màn mà **không đọc nổi một cái
 * vườn** — và nó hỏng CÂM: phiên vẫn mở, vẫn 200, sổ tool vẫn trả về, chỉ ngắn đi.
 *
 * Sinh lại: `cd D:/ALADIN_PROJECT/Wish && npm run export:playbooks`.
 *
 * KHÔNG có scope nào chạm tiền/khoá — T3 không có tool nào, và đó là tính chất
 * CẤU TRÚC chứ không phải một dòng cấm (§4.5).
 */
const SCOPES = GENIE_SCOPES;

/**
 * Vì sao lần nối gần nhất hỏng. `null` = chưa hỏng lần nào.
 *
 * ⛔ Bản trước nuốt sạch lỗi (`catch { ses = null }`), và hệ quả đúng bằng thứ
 * người dùng báo: bấm gửi → "đang xử lý" một lúc LÂU → rồi nhận một câu từ bảng
 * tra, y như chưa từng nối gì. Không ai biết chỗ nào hỏng, và trợ lý thì trông
 * như vẫn đang chạy bình thường.
 *
 * Giữ lý do lại để làm được hai việc: nói đúng câu cho người dùng, và không trả
 * giá timeout ở MỌI câu tiếp theo.
 */
let lastFail: { at: number; why: string; noiLai: boolean } | null = null;

/** [PARAM] Hỏng rồi thì nghỉ bao lâu trước khi thử nối lại. */
const RETRY_AFTER_MS = 30_000;

/** Cho màn Cài đặt và cho chẩn đoán: lần nối gần nhất hỏng vì gì. */
export function genieLastError(): string | null {
  return lastFail ? lastFail.why : null;
}

export type SessionFail =
  /** Bản dựng này không có `GENIE_URL` — trợ lý chỉ có đường tắt trên máy. */
  | { kind: 'chua-cau-hinh' }
  /** Chưa đăng nhập, hoặc kho khoá không mở được. */
  | { kind: 'chua-dang-nhap' }
  /** Có địa chỉ, có thẻ, nhưng không nối được / máy chủ từ chối. */
  | { kind: 'khong-noi-duoc'; why: string };

async function session(): Promise<
  { ok: true; session: GenieSession; token: string } | { ok: false; fail: SessionFail }
> {
  if (!genieEnabled()) return { ok: false, fail: { kind: 'chua-cau-hinh' } };
  if (!authPort) return { ok: false, fail: { kind: 'chua-dang-nhap' } };
  if (cached) return { ok: true, ...cached };

  // Vừa hỏng xong thì ĐỪNG thử lại ngay. Không có chỗ này thì mỗi câu người dùng
  // gõ đều phải chờ hết trần mạng một lần nữa — và họ sẽ gõ tiếp, vì lần trước
  // trông như chỉ chậm.
  if (lastFail && Date.now() - lastFail.at < RETRY_AFTER_MS) {
    // ⛔ NÓI RÕ đây là lỗi NHỚ LẠI. Bản trước trả nguyên văn lý do cũ, nên người
    // dùng thấy "hết 12s không có đáp" bật ra NGAY LẬP TỨC — một câu tự mâu
    // thuẫn, và nó làm mất tin vào cả phần chẩn đoán. Cái nhanh là đúng (đã hỏng
    // thì đừng bắt chờ thêm 12 giây nữa); cái sai là không nói ra mình đang
    // nhắc lại.
    const giay = Math.round((Date.now() - lastFail.at) / 1000);
    return {
      ok: false,
      fail: { kind: 'khong-noi-duoc', why: `${lastFail.why}  [nhớ lại từ lần thử ${giay}s trước]` },
    };
  }

  let token: string | null = null;
  try {
    token = await authPort.token();
  } catch {
    token = null;
  }
  if (!token) return { ok: false, fail: { kind: 'chua-dang-nhap' } };

  try {
    const deviceId = await authPort.deviceId();
    const s = await openGenieSession({ token, deviceId, scopes: [...SCOPES] });
    cached = { session: s, token };
    lastFail = null;
    return { ok: true, ...cached };
  } catch (e) {
    let why = moTaLoi(e);

    // Hỏng rồi thì đi HỎI THÊM MỘT CÂU RẺ: `/health` có trả lời không?
    //
    // Nó tách được hai ca mà một lần hết giờ KHÔNG tách nổi:
    //   · `/health` cũng câm  → app không tới được máy chủ (địa chỉ/đường mạng)
    //   · `/health` trả lời   → tới được; vấn đề nằm ở CỬA PHIÊN, không ở đường
    // Thiếu câu hỏi này thì mọi lần hỏng đều đọc như nhau, và người đi sửa phải
    // đoán — đúng chỗ đã đoán trượt hai lần.
    try {
      const h = await genieHealth();
      why += h.ok
        ? ' · nhưng /health TRẢ LỜI ⇒ tới được máy chủ, hỏng ở cửa mở phiên'
        : ' · /health cũng không trả lời ⇒ app KHÔNG tới được máy chủ';
    } catch { /* hỏi thêm không được thì thôi, đừng để nó che mất lỗi gốc */ }

    // In NGAY, không đợi ai đi tìm. `console.warn` chứ không `rLog`: lỗi này xảy
    // ra lúc đang ráp dây, và lúc đó nhật ký từ xa cũng chưa chắc gửi đi được.
    // eslint-disable-next-line no-console
    console.warn('[genie] mở phiên hỏng:', why, '· địa chỉ:', genieBaseUrl() || '(trống)');

    // ⛔ 401 KHÔNG phải "không gọi được máy chủ" — máy chủ đã trả lời, nó chỉ từ
    // chối cái thẻ. Hai thứ đó dẫn tới hai việc khác nhau: một cái là chờ, một
    // cái là ĐĂNG NHẬP LẠI. Bản trước gộp cả hai vào `khong-noi-duoc`, nên người
    // dùng đọc "em chưa gọi được máy chủ" trong khi máy chủ đang chạy ngon lành —
    // đúng thứ vừa báo.
    if (e instanceof GenieHttpError && e.status === 401) {
      // Và vứt luôn thẻ OriLife đang giữ: nó vừa bị máy chủ bác. Không vứt thì
      // lần sau `ensureOrilifeToken` thấy thẻ còn đó, trả `true`, và mình lại
      // đem đúng cái thẻ hỏng đi một vòng nữa.
      try {
        authPort?.forget?.();
      } catch { /* bỏ được thì tốt, không thì thôi */ }
      lastFail = null; // cho thử lại NGAY sau khi đăng nhập lại
      return { ok: false, fail: { kind: 'chua-dang-nhap' } };
    }

    lastFail = { at: Date.now(), why, noiLai: false };
    return { ok: false, fail: { kind: 'khong-noi-duoc', why } };
  }
}

/** Lỗi kỹ thuật → một dòng CHẨN ĐOÁN (cho nhật ký), không phải câu cho người dùng. */
function moTaLoi(e: unknown): string {
  if (e instanceof GenieHttpError) {
    if (e.status === 401) return 'máy chủ từ chối thẻ (401) — thẻ OriLife hết hạn?';
    if (e.status === 0) return e.message;
    // Kèm cả CÂU máy chủ trả về: `code` là mã nhà, còn `message` thường nói rõ
    // hơn hẳn — và không có nó thì "HTTP 500 ERR" là một dòng không dẫn tới đâu.
    return `HTTP ${e.status} ${e.code} — ${e.message}`;
  }
  const s = String((e as Error)?.message || e || '');
  // RN ném đúng chuỗi này khi KHÔNG MỞ NỔI kết nối: sai địa chỉ, máy chủ chưa
  // chạy, hoặc bản dựng chặn HTTP trần (release đặt `usesCleartextTraffic=false`,
  // và khi đó mọi `http://` bị chặn ngay tại chỗ).
  if (/Network request failed/i.test(s)) {
    return 'không mở nổi kết nối — sai địa chỉ, máy chủ chưa chạy, '
      + 'hoặc bản dựng đang chặn HTTP trần (bản release chặn)';
  }
  if (/abort/i.test(s)) {
    // ⛔ ĐỪNG nói "mở được kết nối nhưng máy chủ trả lời chậm". Một lần hết giờ
    // KHÔNG chứng minh được điều đó — nó chỉ chứng minh **không có đáp trong
    // ngần ấy giây**. Bản trước khẳng định vế kia, và nó dẫn đi soi nhầm chỗ:
    // đo lại thì cái bắt tay chỉ mất 0,25–0,5 giây.
    //
    // Cái hay xảy ra thật là ĐỊA CHỈ KHÔNG TỚI ĐƯỢC, và nó biểu hiện đúng như
    // thế này — im lặng, không "Network request failed":
    //   · nối tới máy KHÔNG CÓ AI NGHE  → bị từ chối NGAY → "Network request failed"
    //   · nối tới địa chỉ KHÔNG ĐỊNH TUYẾN ĐƯỢC → gói tin rơi → TREO tới hết giờ
    // `10.0.2.2` chỉ có nghĩa với Android emulator. Trên MÁY THẬT nó là một địa
    // chỉ không tới đâu cả, nên gói tin rơi im lặng và mình chờ hết giờ.
    return `hết ${Math.round(SESSION_TIMEOUT_MS / 1000)}s không có đáp — `
      + 'hay gặp nhất là địa chỉ không tới được từ chỗ app đang chạy '
      + '(10.0.2.2 chỉ đúng với Android emulator; máy thật cần IP LAN + GENIE_HOST=0.0.0.0)';
  }
  return s || 'không rõ';
}

/**
 * Câu NÓI RA khi không nối được. Mỗi ca một câu, vì mỗi ca một việc phải làm.
 *
 * Gộp cả ba thành một câu chung là bắt người dùng đoán — và đoán sai thì họ gõ
 * lại đúng câu đó thêm mười lần.
 */
function cauKhiHong(f: SessionFail): string {
  if (f.kind === 'chua-dang-nhap') {
    return 'Dạ bác đăng nhập lại giúp em rồi em làm tiếp ngay ạ.';
  }
  if (f.kind === 'khong-noi-duoc') {
    const cho = 'Dạ em chưa gọi được máy chủ nên chưa nghĩ được câu này ạ. '
      + 'Em vẫn mở giúp bác các tính năng trong máy được bình thường.';
    // Ở BẢN DỰNG THỬ, nói luôn chẩn đoán ra màn hình.
    //
    // Đây là lỗi chỉ xảy ra lúc đang ráp dây — sai địa chỉ, quên chạy máy chủ,
    // bản dựng chặn HTTP trần. Người đi sửa thì cần biết CHỖ NÀO đứt, mà họ lại
    // là người duy nhất nhìn thấy màn hình này lúc đó. Giấu chẩn đoán đi là bắt
    // họ đoán — và đoán sai thì đi sửa nhầm chỗ.
    //
    // Bản phát hành KHÔNG hiện: bác nông dân không đọc được "HTTP 500", và một
    // dòng như thế chỉ làm họ sợ.
    return __DEV__ && f.why ? `${cho}

[thử] ${f.why}` : cho;
  }
  // `chua-cau-hinh`: bản dựng này cố ý không có mô hình. KHÔNG hứa "thử lại sau" —
  // thử lại bao nhiêu lần cũng thế.
  return '';
}

/**
 * Mở phiên SẴN, ngay lúc app khởi động.
 *
 * ⛔ Không có chỗ này thì cái bắt tay nằm trên đường đi của CÂU HỎI ĐẦU TIÊN:
 * người dùng gõ xong, bấm gửi, rồi ngồi nhìn "đang xử lý" suốt cả lượt bắt tay —
 * và nếu nó hỏng thì họ chờ hết trần mới biết. Đúng thứ đã xảy ra.
 *
 * Gọi rồi QUÊN. Hỏng cũng không sao: `session()` sẽ thử lại lúc có câu hỏi thật,
 * và lúc đó nó có câu trả lời cho người dùng. Ở đây thì chưa có ai để nói.
 */
export function warmGenie(): void {
  if (!genieEnabled() || !authPort) return;
  void session().then((r) => {
    // Nói ra NGAY lúc khởi động, cả khi được lẫn khi hỏng. Không có dòng này thì
    // người đi sửa phải chat một câu mới biết đường dây có sống không — mà lúc
    // chat thì cái đang hiện lại là lỗi NHỚ LẠI, khó đọc gấp đôi.
    // eslint-disable-next-line no-console
    if (r.ok) console.log('[genie] phiên sẵn sàng ·', genieBaseUrl());
  }).catch(() => {});
}

/**
 * Xử một câu, trọn vẹn.
 *
 * KHÔNG ném — mọi đường ra đều là một câu nói được. Đây là một luồng hội thoại,
 * và ở đó một ngoại lệ chưa bắt biến thành sự im lặng, mà im lặng thì người dùng
 * đọc thành "máy hỏng".
 */
export function ask(text: string, cb: AskCallbacks, images?: GenieImage[]): AskHandle {
  let stream: TurnHandle | null = null;
  let stopped = false;
  // `turnId` và `authToken` phải sống ở ĐÂY, không trong hàm async bên dưới: khi
  // người dùng cắt lời thì máy chủ cần biết cắt lượt NÀO, và cái biết đó không
  // được nằm trong một phạm vi mà `abort()` không với tới.
  let turnId: string | null = null;
  let authToken: string | null = null;
  const stop = (): void => {
    stopped = true;
    stream?.abort();
  };

  // ── Tầng 1: đường tắt ────────────────────────────────────────────────────
  //
  // CÓ ẢNH thì BỎ QUA đường tắt, kể cả khi câu chữ khớp một playbook. Đường tắt
  // chỉ đọc chữ — nó không nhìn được tấm ảnh, nên một câu "cây này bị gì" kèm ảnh
  // sẽ bị nó nuốt thành "mở màn nhận diện cây" và tấm ảnh rơi mất. Người dùng
  // chụp một tấm ảnh là họ đang hỏi VỀ tấm ảnh đó.
  const anh = images && images.length ? images : null;
  const m = matchFastPath(text);
  if (!anh && (m.kind === 'hit' || m.kind === 'ambiguous')) {
    const out: GenieOutcome = handle(text);
    cb.onSay(out.say);
    if (out.kind === 'opened') cb.onOpened?.(out.route);
    cb.onDone?.();
    return { abort: () => {} };
  }

  // ── Tầng 2: mô hình ──────────────────────────────────────────────────────
  void (async () => {
    const r = await session();
    if (stopped) return;

    if (!r.ok) {
      // ⛔ KHÔNG im lặng rơi về bảng tra. Đó là bản trước, và nó cho ra đúng thứ
      // người dùng báo: chờ lâu rồi nhận một câu y như chưa nối gì.
      //
      // Đường tắt vẫn chạy — nó là thứ có ích thật, kể cả khi mất mạng. Nhưng
      // câu nói ra phải NÓI RÕ là em chưa nghĩ được, chứ không được để một câu
      // từ chối của bảng tra đi qua như thể mô hình vừa trả lời.
      if (anh) {
        cb.onSay('Dạ ảnh thì em phải nhờ máy chủ xem giúp, mà giờ em chưa nối được ạ. '
          + 'Bác thử lại sau một lát nhé.');
        cb.onDone?.();
        return;
      }

      const bao = cauKhiHong(r.fail);
      const out = handle(text);

      if (out.kind === 'opened') {
        // Đường tắt MỞ ĐƯỢC màn — việc đã làm xong thật, không cần xin lỗi gì.
        cb.onSay(out.say);
        cb.onOpened?.(out.route);
      } else if (bao) {
        // Nối hỏng: nói ra. Và với câu `near`, vẫn nêu việc gần nhất — nó là
        // thứ giúp được người dùng NGAY, không phải một lời an ủi.
        cb.onSay(bao);
        if (out.kind === 'ask') cb.onSay(out.say);
      } else {
        // Bản dựng cố ý không có mô hình ⇒ câu của `handle()` đã đúng và đủ.
        cb.onSay(out.say);
      }
      cb.onDone?.();
      return;
    }

    const ses = { session: r.session, token: r.token };
    const { token, session: s } = ses;
    authToken = token;

    stream = postGenieTurn({
      token,
      sessionId: s.sessionId,
      utterance: text,
      images: anh || undefined,
      context: buildContext(),
      onEvent: (ev) => {
        if (stopped) return;
        void onEvent(ev);
      },
      onError: (e) => {
        if (stopped) return;
        cb.onSay(friendly(e));
        cb.onDone?.();
      },
      onDone: () => {
        if (!stopped) cb.onDone?.();
      },
    });

    /**
     * Nói MỘT câu, và không nói lại câu vừa nói.
     *
     * Máy chủ có thể phát cùng một câu qua hai đường (`say` rồi `error`), và đã
     * phát thật. Cờ `said` chặn được ca đã biết; chỗ này chặn cả những ca CHƯA
     * biết — vì một câu lặp đôi trong hộp tin đọc ra thành "máy bị lắp", và
     * người dùng mất tin vào cả những câu đúng.
     */
    let cauTruoc = '';
    function noiMot(c: AskCallbacks, text: string, ma?: string): void {
      const t = String(text || '').trim();
      if (!t || t === cauTruoc) return;
      cauTruoc = t;
      c.onSay(__DEV__ && ma ? `${t}

[thử] mã lỗi: ${ma}` : t);
    }

    async function onEvent(ev: GenieEvent): Promise<void> {
      switch (ev.type) {
        case 'turn':
          turnId = ev.turnId;
          break;

        case 'state':
          cb.onState?.(ev.value);
          break;

        case 'say':
          // `blocked` nghĩa là cổng nội dung (INV-G13) đã chặn câu gốc và thay
          // bằng một câu an toàn. Vẫn nói ra — im lặng ở đây thì người dùng ngồi
          // nhìn màn hình trống, không biết mình vừa hỏi phải chỗ cấm.
          noiMot(cb, ev.text);
          break;

        case 'tool_call':
          await runClientTool(ev);
          break;

        case 'confirm_request': {
          if (!turnId) return;
          // Không có người hỏi ⇒ LẮC, không phải gật. Thiếu chỗ hỏi là thiếu sự
          // đồng ý, và một lời ghi không ai đồng ý là một lời ghi sai.
          const granted = cb.onConfirm ? await cb.onConfirm(ev.text, ev.callId) : false;
          if (stopped) return;
          await postConfirm({ token, turnId, callId: ev.callId, granted }).catch(() => {});
          break;
        }

        case 'error':
          // ⛔ `said: true` nghĩa là máy chủ ĐÃ nói câu này bằng một sự kiện
          // `say` ngay trước đó. Nói lại là ra HAI bong bóng y hệt nhau —
          // đúng thứ vừa xảy ra trên máy thật.
          //
          // Vẫn đọc `error` chứ không bỏ qua: nó mang MÃ, và bản dựng thử cần
          // mã đó để biết hỏng ở đâu.
          if (!ev.said) noiMot(cb, ev.message, ev.code);
          else if (__DEV__ && ev.code) cb.onSay(`[thử] mã lỗi: ${ev.code}`);
          break;

        default:
          break;
      }
    }

    /**
     * Tool phía vỏ. Hôm nay chỉ có `ui.openScreen` — và đó là CÓ Ý: mỗi tool phía
     * vỏ là một nút mà trợ lý bấm hộ, nên thêm một cái là thêm một thứ có thể bị
     * bấm nhầm.
     */
    async function runClientTool(ev: Extract<GenieEvent, { type: 'tool_call' }>): Promise<void> {
      if (!turnId) return;
      if (ev.name !== 'ui.openScreen') {
        await postObservation({
          token, turnId, callId: ev.callId, ok: false,
          error: { code: 'TOOL_UNAVAILABLE', detail: ev.name + ' chưa có ở bản vỏ này' },
        }).catch(() => {});
        return;
      }
      const route = String((ev.args || {}).route || '');
      const params = ((ev.args || {}).params || {}) as Record<string, unknown>;
      const r = genieOpenScreen(route, params);
      if (r.ok) cb.onOpened?.(route);
      // Báo lại SỰ THẬT, kể cả khi hỏng: mô hình phải biết màn chưa mở để nó nói
      // lại cho đúng. Báo `ok` bừa thì nó sẽ tiếp tục như thể người dùng đang
      // đứng ở một màn mà họ không hề ở đó.
      await postObservation({
        token, turnId, callId: ev.callId, ok: r.ok,
        data: r.ok ? { route } : undefined,
        error: r.ok ? undefined : { code: r.reason === 'denied' ? 'FORBIDDEN' : 'NOT_READY', detail: route },
      }).catch(() => {});
    }
  })();

  return {
    abort: () => {
      stop();
      // Cắt dây trước, báo máy chủ sau — và chỉ báo khi thật sự có một lượt đang
      // chạy. Báo huỷ một lượt không tồn tại là một lời gọi thừa và một dòng lỗi
      // trong nhật ký mà không ai đọc ra nghĩa gì.
      if (authToken && turnId) void postCancel(authToken, turnId).catch(() => {});
    },
  };
}

/**
 * Phong bì ngữ cảnh (§3.4) — CÓ TRẦN.
 *
 * Bản này mới gửi màn đang mở. Danh sách vườn chưa gửi, và đó là một khoảng
 * trống CÓ CHỦ Ý ở G4: nó là dữ liệu riêng, nó làm phong bì phình theo số vườn,
 * và nó chỉ có ích khi tool T2 đã bật (G5). Thêm sớm là trả tiền token cho một
 * thứ chưa dùng tới.
 */
function buildContext(): GenieContext {
  // Nhập trễ để tệp này kiểm được mà không phải dựng cả cây điều hướng.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { getGenieRoute } = require('./genieNav') as { getGenieRoute: () => string | null };
  return { route: getGenieRoute(), online: true };
}

/** Lỗi kỹ thuật → một câu bác nông dân đọc được. Không rò mã, không rò địa chỉ. */
function friendly(e: Error): string {
  const s = String(e?.message || '');
  if (/quá lâu|timeout/i.test(s)) {
    return 'Dạ em nghĩ lâu quá mà chưa ra ạ. Bác thử hỏi lại giúp em nhé.';
  }
  return 'Dạ em đang mất liên lạc với máy chủ ạ. Bác thử lại sau một chút giúp em nhé.';
}
