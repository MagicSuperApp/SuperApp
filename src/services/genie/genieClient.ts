// services/genie/genieClient.ts
//
// Đường dây tới service Genie (§11) — chặng G4.
//
// ── CÁI TỆP NÀY ĐỔI ─────────────────────────────────────────────────────────
// Trước nó, trợ lý là một BẢNG TRA: khớp câu với 13 playbook thì mở màn, không
// khớp thì chịu. Đó là lý do người dùng thấy "fake" — cùng một câu từ chối lặp
// lại, vì đằng sau không có ai nghĩ cả.
//
// Tệp này nối phần "nghĩ" vào. Nhưng nó KHÔNG thay đường tắt: đường tắt vẫn chạy
// trước, vì nó tốn 0 token, chạy khi mất sóng, và trả lời trong một nhịp. Mô hình
// chỉ nhận những câu đường tắt không nuốt được — tức là đúng phần việc cần nghĩ.
//
// ── TRỐNG `GENIE_URL` = KHÔNG GỌI, KHÔNG PHẢI LUI VỀ ĐÂU CẢ ────────────────
// Cùng luật với `aladinChat.ts` và `remoteLogger.ts`, và lý do nằm ngay trong
// `aladinChat.ts`: chỗ đó từng viết cứng một tunnel tạm trên máy lập trình viên
// và NHẬN NGUYÊN VĂN câu hỏi của người dùng thật; chuỗi ấy có trong bundle bản
// dựng tay 15/08, đo bằng `strings`. Nên ở đây không có đường lui mặc định, và
// `genieEnabled()` đo chuỗi ĐÃ CẮT khoảng trắng — `GENIE_URL= ` cho ra một dấu
// cách, truthy, lọt cổng, rồi `xhr.open('POST', ' ')` ném "Network request
// failed", đọc như mất mạng chứ không như thiếu cấu hình.
//
// ── VÌ SAO XHR CHỨ KHÔNG `fetch().body.getReader()` ────────────────────────
// `fetch` trên RN 0.84 chưa cho đọc dần thân — chú thích đã có sẵn ở đầu
// `aladinChat.ts`. Đi lại lối đã đo được thì rẻ hơn mở một đường mới.

import { GENIE_URL } from '@env';

const BASE = String(GENIE_URL ?? '').trim().replace(/\/+$/, '');

/** Có service Genie để gọi không. Trống ⇒ chỉ còn đường tắt trên máy. */
export const genieEnabled = (): boolean => BASE.length > 0;

/** Địa chỉ đang dùng — cho màn Cài đặt và cho chẩn đoán. Không bao giờ đoán. */
export const genieBaseUrl = (): string => BASE;

// ── Hình dạng sự kiện §11 ──────────────────────────────────────────────────

export type GenieEvent =
  | { seq?: number; type: 'turn'; turnId: string }
  | { seq: number; type: 'state'; value: 'idle' | 'listening' | 'thinking' | 'speaking' }
  | { seq: number; type: 'say'; text: string; blocked?: boolean; why?: string }
  | { seq: number; type: 'tool_call'; callId: string; name: string; args: Record<string, unknown> }
  | { seq: number; type: 'confirm_request'; callId: string; text: string }
  | { seq: number; type: 'done'; cancelled?: boolean; options?: unknown[] }
  | {
    seq: number; type: 'error'; code: string; message: string; resetAt?: number;
    /** `true` = câu này ĐÃ đi ra bằng một sự kiện `say` — vỏ đừng nói lại. */
    said?: boolean;
  }
  | { seq?: number; type: 'status'; status: string; turnId: string }
  | { seq?: number; type: 'dedupe'; of: string };

export interface GenieSession {
  sessionId: string;
  tools: Array<{ name: string; tier: number; side: 'server' | 'client' }>;
  playbooks: unknown[];
  budget: { turnsLeft?: number; usdLeft?: number } & Record<string, unknown>;
}

export interface GenieContext {
  route?: string | null;
  params?: Record<string, unknown>;
  instance?: string;
  online?: boolean;
  farms?: unknown[];
}

export interface TurnHandle {
  /** Cắt lời (INV-G9). Đóng dây NGAY, rồi mới báo máy chủ. */
  abort: () => void;
}

export class GenieHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'GenieHttpError';
  }
}

/** [PARAM] Trần chờ một lượt. Dài hơn `aladinChat` vì một lượt ReAct có nhiều bước. */
const TURN_TIMEOUT_MS = 90_000;
/**
 * Trần cho MỞ PHIÊN.
 *
 * Dài hơn các lời gọi khác vì cái bắt tay này còn đi thêm một chặng NỮA: máy chủ
 * gọi `GET /api/me` của OriLife để kiểm thẻ. Đo 15/09: chặng đó ~0,4s và cả bắt
 * tay ~0,25–0,5s từ máy cùng mạng — nhưng qua 4G ngoài vườn thì khác hẳn.
 *
 * 12 giây là trần cho MỘT LẦN duy nhất: phiên được mở SẴN lúc khởi động
 * (`warmGenie`), nên người dùng không ngồi chờ nó.
 */
export const SESSION_TIMEOUT_MS = 12_000;

/**
 * Trần cho lời gọi JSON ngắn: gật, báo kết quả tool.
 *
 * Những lượt này PHẢI nhanh — chúng không đi thêm chặng nào, và chúng nằm giữa
 * lúc người dùng đang chờ.
 */
const JSON_TIMEOUT_MS = 6_000;

function url(path: string): string {
  return BASE + path;
}

async function postJson<T>(path: string, token: string, body: unknown, timeoutMs?: number): Promise<T> {
  if (!BASE) throw new GenieHttpError(0, 'NO_ENDPOINT', 'Genie chưa được cấu hình ở bản dựng này');
  const res = await fetch(url(path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Token đi ở HEADER, không ở query: query đi vào log truy cập và lịch sử
      // proxy, và ở đó nó nằm lại rất lâu.
      authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
    signal: timeoutSignal(timeoutMs || JSON_TIMEOUT_MS),
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    throw new GenieHttpError(res.status, 'BAD_JSON', 'Genie trả về thứ không đọc được');
  }
  if (!res.ok) {
    const e = (j.error || {}) as { code?: string; message?: string };
    throw new GenieHttpError(res.status, e.code || 'ERR', e.message || 'Genie lỗi ' + res.status);
  }
  return j as T;
}

/** `AbortSignal.timeout` chưa có trên mọi engine RN — dựng tay, một chỗ. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  try {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), ms);
    return ac.signal;
  } catch {
    return undefined;
  }
}

/** Mở phiên. Trả sổ tool ĐÃ LỌC và sổ playbook để chạy offline (§7.7). */
export function openGenieSession(opts: {
  token: string;
  deviceId: string;
  scopes: string[];
  modules?: string[];
  online?: boolean;
}): Promise<GenieSession> {
  return postJson<GenieSession>('/genie/sessions', opts.token, {
    deviceId: opts.deviceId,
    scopes: opts.scopes,
    modules: opts.modules || [],
    online: opts.online !== false,
  }, SESSION_TIMEOUT_MS);
}

/**
 * Gửi một lượt và đọc dòng sự kiện.
 *
 * `onEvent` được gọi cho TỪNG sự kiện, theo đúng thứ tự máy chủ sinh ra. Nơi gọi
 * không phải tự gom, không phải tự sắp.
 */
export function postGenieTurn(opts: {
  token: string;
  sessionId: string;
  utterance: string;
  images?: Array<{ mediaType: string; data: string }>;
  context?: GenieContext;
  onEvent: (ev: GenieEvent) => void;
  onError?: (e: Error) => void;
  onDone?: () => void;
}): TurnHandle {
  if (!BASE) {
    opts.onError?.(new Error('Genie chưa được cấu hình ở bản dựng này'));
    return { abort: () => {} };
  }

  const xhr = new XMLHttpRequest();
  let seen = 0;
  let aborted = false;
  let finished = false;

  const finish = (e?: Error): void => {
    if (finished) return;
    finished = true;
    if (e) opts.onError?.(e);
    else opts.onDone?.();
  };

  xhr.open('POST', url('/genie/turns'), true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Authorization', 'Bearer ' + opts.token);
  xhr.timeout = TURN_TIMEOUT_MS;

  xhr.onreadystatechange = () => {
    if (aborted) return;
    // 3 = LOADING (đang nhận), 4 = DONE.
    if (xhr.readyState !== 3 && xhr.readyState !== 4) return;

    const text = xhr.responseText || '';
    // Chỉ đọc phần MỚI, và chỉ tới sự kiện HOÀN CHỈNH cuối cùng. `responseText`
    // lớn dần, nên cắt lại từ đầu mỗi nhịp là O(n²) trên một dòng dài — và trên
    // máy yếu (đúng loại máy nông dân dùng) nó thành giật hình thấy được.
    const tail = text.slice(seen);
    const cut = tail.lastIndexOf('\n\n');
    if (cut >= 0) {
      const ready = tail.slice(0, cut + 2);
      seen += cut + 2;
      for (const ev of parseSse(ready)) {
        try {
          opts.onEvent(ev);
        } catch {
          // Một chỗ vẽ hỏng KHÔNG được làm đứt dòng: những sự kiện sau nó vẫn có
          // ích, và một trong số đó có thể là `error` mà người dùng cần thấy.
        }
      }
    }

    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) finish();
      else finish(new Error('Genie HTTP ' + xhr.status));
    }
  };

  xhr.onerror = () => {
    if (!aborted) finish(new Error('Mất kết nối tới trợ lý'));
  };
  xhr.ontimeout = () => {
    if (!aborted) finish(new Error('Trợ lý phản hồi quá lâu'));
  };

  try {
    xhr.send(JSON.stringify({
      sessionId: opts.sessionId,
      utterance: opts.utterance,
      images: opts.images || [],
      context: opts.context || {},
    }));
  } catch (e) {
    finish(new Error((e as Error)?.message || 'Không gửi được câu hỏi tới trợ lý'));
  }

  return {
    abort: () => {
      aborted = true;
      finished = true;
      try {
        xhr.abort();
      } catch {
        /* đã đóng */
      }
    },
  };
}

/**
 * Tách các sự kiện SSE hoàn chỉnh trong một mẩu chữ.
 *
 * Xuất ra để kiểm được mà không cần XHR. Bỏ qua sự kiện hỏng thay vì ném: một
 * mẩu hỏng không được làm mất những mẩu lành đi sau nó.
 */
export function parseSse(chunk: string): GenieEvent[] {
  const out: GenieEvent[] = [];
  for (const blk of chunk.split('\n\n')) {
    const line = blk.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const j = line.slice(5).trim();
    if (!j || j === '[DONE]') continue;
    try {
      out.push(JSON.parse(j) as GenieEvent);
    } catch {
      /* mẩu hỏng — bỏ, không làm đứt phần còn lại */
    }
  }
  return out;
}

/** Vỏ báo kết quả một tool phía vỏ (§11). */
export function postObservation(opts: {
  token: string;
  turnId: string;
  callId: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; detail?: string };
}): Promise<unknown> {
  return postJson('/genie/turns/' + encodeURIComponent(opts.turnId) + '/observations', opts.token, {
    callId: opts.callId,
    ok: opts.ok,
    data: opts.data,
    error: opts.error,
  });
}

/** Người dùng gật / lắc (§4.6). Im lặng KHÔNG phải đồng ý — không có mặc định. */
export function postConfirm(opts: {
  token: string;
  turnId: string;
  callId: string;
  granted: boolean;
}): Promise<unknown> {
  return postJson('/genie/turns/' + encodeURIComponent(opts.turnId) + '/confirm', opts.token, {
    callId: opts.callId,
    granted: opts.granted === true,
  });
}

/** Cắt lời. */
export function postCancel(token: string, turnId: string): Promise<unknown> {
  return postJson('/genie/turns/' + encodeURIComponent(turnId) + '/cancel', token, {});
}

/**
 * Service còn sống không, và hôm nay nó CÓ mô hình không.
 *
 * `hasModel` là câu trả lời thật cho câu hỏi "sao con bot này fake thế": máy chủ
 * chạy mà không có khoá thì nó cũng chỉ là bảng tra. Đọc được cờ này thì vỏ nói
 * đúng sự thật với người dùng thay vì để họ tự đoán.
 */
export async function genieHealth(): Promise<{ ok: boolean; hasModel: boolean; model?: string }> {
  if (!BASE) return { ok: false, hasModel: false };
  try {
    const res = await fetch(url('/health'), { signal: timeoutSignal(5000) });
    if (!res.ok) return { ok: false, hasModel: false };
    const j = (await res.json()) as { ok?: boolean; hasModel?: boolean; model?: string };
    return { ok: j.ok === true, hasModel: j.hasModel === true, model: j.model };
  } catch {
    return { ok: false, hasModel: false };
  }
}
