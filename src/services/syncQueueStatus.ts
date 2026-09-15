// services/syncQueueStatus.ts
//
// ĐỌC một dòng hàng đợi đồng bộ thành thứ người dùng nhìn được. Tách khỏi
// `syncService` có chủ ý: tệp này là LÁ — nó chỉ nhập KIỂU từ `syncDispatch`,
// không chạm store, CSDL hay mạng, nên bài kiểm đo được nó mà không phải dựng cả
// React Native.
//
// ⚠ Tệp này KHÔNG bù dữ liệu. Chỗ nào kho không giữ thì trả `null` và màn hình
// nói thẳng là không có — một mốc thời gian đệm hay một số `0` giả sẽ đi tiếp
// vào chỗ khác và ở đó nó KHÔNG còn tự khai được là thiếu.

import type { SyncFailureClass } from './syncDispatch';

/**
 * Gắn trước `error_code` khi một mục đã quá trần thử lại.
 *
 * Định nghĩa nằm ở ĐÂY chứ không ở `syncService` để tránh vòng nhập: màn hàng
 * đợi cần đọc nhãn này, mà nhập `syncService` là kéo theo store + CSDL.
 * `syncService` nhập từ đây rồi xuất lại nguyên tên, nên mọi chỗ gọi cũ
 * (`import { NEEDS_ATTENTION_PREFIX } from './syncService'`) vẫn chạy.
 */
export const NEEDS_ATTENTION_PREFIX = '[cần xem lại] ';

/**
 * Trạng thái mà vòng quét còn nhặt lên gửi. Mọi trạng thái khác — `'error'` là ca
 * duy nhất sinh ra được hôm nay — là dòng CHẾT: nó còn nằm trong bảng nhưng không
 * lượt gửi nào chạm tới nó nữa.
 *
 * Định nghĩa ở đây, MỘT chỗ, vì hai bên đọc nó theo hai mục đích ngược nhau và
 * lệch nhau là hỏng im: vòng quét dùng nó để CHỌN việc, còn nút "gửi lại tất cả"
 * dùng nó để ĐẾM kết quả. Đếm theo số dòng thay vì theo tập này thì một mục vừa
 * chết được báo là "còn chờ".
 */
const RETRIABLE_STATUSES: readonly string[] = ['pending', 'sending'];

export const isRetriableRow = (row: any): boolean =>
  RETRIABLE_STATUSES.includes(row?.status);

export const countRetriable = (rows: readonly any[]): number =>
  rows.filter(isRetriableRow).length;

/**
 * Hạng của lượt gửi hỏng GẦN NHẤT của một mục.
 *
 * `'unsupported'` không phải một hạng lỗi mạng: nó là "app chưa có đường gọi cho
 * loại việc này" (xem `classifySyncItem` trả `kind: 'unsupported'`). Gộp nó vào
 * `blocked` thì hai nguyên nhân khác hẳn nhau đọc ra một câu.
 */
export type SyncAttemptClass = SyncFailureClass | 'unsupported';

/**
 * Thứ `syncService` giữ TRONG BỘ NHỚ về một mục. Mất khi tắt app — đó là tính
 * chất của nguồn, không phải thiếu sót của màn hình, nên màn hình phải nói rõ
 * "trong phiên này" chứ đừng trình nó như số đếm trọn đời của mục.
 */
export interface SyncQueueDiagnostic {
  /** Số lượt hạng `retryable` đã đếm. Hạng `offline`/`auth`/`blocked` KHÔNG đếm. */
  retryCount: number;
  /** Mốc epoch ms sớm nhất được thử lại. */
  nextAttemptAt: number;
  lastFailure?: SyncAttemptClass;
}

/**
 * Nhóm hiển thị. Nhiều hơn ba nhóm vì kho thật sự giữ nhiều hơn ba tình trạng —
 * gộp `auth` với `offline` là nói sai việc người dùng phải làm (một đằng đăng
 * nhập lại, một đằng đi tìm sóng).
 */
export type SyncQueueGroup =
  | 'stopped'
  | 'needsAttention'
  | 'sessionExpired'
  | 'waitingNetwork'
  | 'serverBusy'
  | 'serverNotReady'
  | 'sending'
  | 'queued';

/** Thứ tự bày: việc cần người làm lên trước, việc tự xong xuống sau. */
export const SYNC_QUEUE_GROUP_ORDER: SyncQueueGroup[] = [
  'stopped',
  'needsAttention',
  'sessionExpired',
  'waitingNetwork',
  'serverBusy',
  'serverNotReady',
  'sending',
  'queued',
];

export interface SyncQueueGroupText {
  /** Nhãn ngắn — phân biệt nhóm bằng CHỮ, không chỉ bằng màu. */
  label: string;
  /** Một câu nói rõ chuyện gì đang xảy ra và ai gỡ được nó. */
  detail: string;
}

/**
 * Câu chữ của từng nhóm.
 *
 * ⚠ KHÔNG gõ con số nào của `syncService` (trần thử lại, nhịp chờ) vào đây: số
 * gõ tay sẽ trôi khỏi hằng số thật mà không gì báo. Nhịp chờ thật hiện ở từng
 * dòng dưới dạng mốc "thử lại lúc", sinh từ `nextAttemptAt`.
 */
export const SYNC_QUEUE_GROUP_TEXT: Record<SyncQueueGroup, SyncQueueGroupText> = {
  stopped: {
    label: 'Đã dừng',
    detail: 'Máy chủ từ chối nội dung mục này. Mục KHÔNG tự gửi lại nữa.',
  },
  needsAttention: {
    label: 'Cần người xử',
    detail: 'Đã quá số lần thử cho phép. Mục vẫn tự thử lại ở nhịp chậm nhất, nhưng nên xem vì sao.',
  },
  sessionExpired: {
    label: 'Phiên đăng nhập hết hạn',
    detail: 'Cần đăng nhập lại rồi gửi tiếp. Dữ liệu còn nguyên trong máy.',
  },
  waitingNetwork: {
    label: 'Đang chờ sóng',
    detail: 'Máy chưa nối được tới máy chủ. Lần hỏng này KHÔNG tính là một lần thử.',
  },
  serverBusy: {
    label: 'Máy chủ đang bận',
    detail: 'Máy chủ có trả lời nhưng bảo chờ. Mục sẽ tự gửi lại.',
  },
  serverNotReady: {
    label: 'Máy chủ chưa nhận',
    detail: 'Điều kiện phía máy chủ chưa đủ cho mục này. Mục nằm chờ, không mất.',
  },
  sending: {
    label: 'Đang gửi',
    detail: 'Mục đang trên đường lên máy chủ.',
  },
  queued: {
    label: 'Đang chờ gửi',
    detail: 'Chưa có lượt gửi nào hỏng trong phiên này.',
  },
};

/** Loại việc (mã trong `payload.type`) → chữ người đọc hiểu. */
const TYPE_LABEL: Record<string, string> = {
  activity: 'Nhật ký đồng áng',
  activity_log: 'Nhật ký đồng áng',
  tree_identification: 'Cây mới ghi nhận',
  fruit_identification: 'Quả đã chụp',
  farm_update: 'Thông tin vườn',
};

/** Câu dùng khi `payload` không mở ra được — KHÔNG thay bằng một nhãn loại giả. */
export const UNREADABLE_TYPE_LABEL = 'Không đọc được nội dung mục';
/** Câu dùng khi mở được `payload` nhưng mã loại nằm ngoài bảng trên. */
export const UNKNOWN_TYPE_LABEL = 'Mục chưa rõ loại';

/** Một dòng hàng đợi đã đọc xong, đủ để vẽ ra màn. */
export interface SyncQueueEntry {
  transactionId: string;
  group: SyncQueueGroup;
  /** Mã loại đọc từ `payload`. `null` = không mở được `payload`. */
  typeCode: string | null;
  typeLabel: string;
  /** Mốc tạo (epoch ms). `null` = kho không giữ, hoặc giữ một chuỗi không đọc được. */
  createdAtMs: number | null;
  /** Chuỗi thô của cột `created_at`, giữ lại để hiện khi không phân giải được. */
  createdAtRaw: string | null;
  /** Số lần đã thử TRONG PHIÊN NÀY. `null` = không có số liệu (vd vừa mở lại app). */
  attempts: number | null;
  /** Mốc epoch ms sớm nhất được thử lại. `null` = không có số liệu. */
  nextAttemptAt: number | null;
  /**
   * Câu NGUYÊN VĂN mà máy chủ (hoặc lớp gọi) đã ghi lại, đã gỡ tiền tố nhãn.
   * `null` = kho không giữ câu nào — KHÔNG bịa một câu chung chung để lấp.
   */
  serverMessage: string | null;
  /**
   * Trạng thái thô trong CSDL. `null` = cột rỗng hoặc không phải chuỗi.
   *
   * KHÔNG đệm `''`: chuỗi rỗng không lọt nhánh nào của `classifyQueueEntry` nên nó
   * rơi xuống nhóm êm ái nhất, và ở đó nó không còn tự khai được là thiếu.
   */
  status: string | null;
  /**
   * Nội dung NGƯỜI DÙNG đã ghi, nguyên văn như kho đang giữ. `null` = kho không
   * giữ gì.
   *
   * Có mặt ở đây vì màn bảo người dùng *"hãy ghi lại việc này"* cho một mục đã
   * dừng hẳn — mà bảo người ta chép lại một thứ không cho họ nhìn thì đó là một
   * lời khuyên không thực hiện được. Trường này là thứ duy nhất trên máy còn giữ
   * việc họ đã làm.
   */
  payloadRaw: string | null;
}

interface NormalizedRow {
  transactionId: string;
  status: string | null;
  errorCode: string | null;
  createdAtRaw: string | null;
  payload: string | null;
}

/**
 * Đưa một dòng thô về một hình dạng.
 *
 * Hàng đợi nạp từ SQLite trả nguyên cột `snake_case`, còn `syncSlice.SyncItem`
 * khai `camelCase` — hai hình dạng cùng chảy qua một chỗ (xem `syncService.txIdOf`,
 * cùng lý do). Đọc một bên thôi thì bên kia ra `undefined` mà không ai kêu.
 *
 * NÉM khi không có mã giao dịch: một dòng như thế không gửi lại được, không xoá
 * được, và bày nó ra như một mục bình thường là nói dối về thứ người dùng bấm
 * được. Hàng đợi hỏng KHÔNG PHẢI hàng đợi rỗng.
 */
export function normalizeQueueRow(row: any): NormalizedRow {
  const transactionId = row?.transaction_id ?? row?.transactionId;
  if (typeof transactionId !== 'string' || transactionId.trim() === '') {
    throw new Error('Dòng hàng đợi thiếu mã giao dịch (transaction_id)');
  }
  const errorCode = row?.error_code ?? row?.errorCode;
  const createdAtRaw = row?.created_at ?? row?.createdAt;
  const payload = row?.payload;
  return {
    transactionId,
    status: typeof row?.status === 'string' && row.status !== '' ? row.status : null,
    errorCode: typeof errorCode === 'string' && errorCode !== '' ? errorCode : null,
    createdAtRaw: typeof createdAtRaw === 'string' && createdAtRaw !== '' ? createdAtRaw : null,
    payload: typeof payload === 'string' ? payload : null,
  };
}

/**
 * Đọc mốc thời gian của cột `created_at`.
 *
 * Cột đó mặc định `CURRENT_TIMESTAMP` của SQLite: `'YYYY-MM-DD HH:MM:SS'` theo
 * giờ UTC và KHÔNG mang hậu tố múi giờ. Thả thẳng vào `Date.parse` thì mỗi máy
 * hiểu một kiểu (có máy coi là giờ địa phương) — lệch bảy tiếng mà vẫn ra một
 * mốc trông hợp lý. Nên khớp đúng hình dạng đó rồi mới gắn `Z`.
 *
 * Không khớp hình dạng nào ⇒ `null`, để chỗ gọi hiện chuỗi thô thay vì một mốc
 * bịa.
 */
export function parseQueueTimestamp(raw: string | null): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === '') return null;
  const sqliteShape = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s);
  const ms = Date.parse(sqliteShape ? `${s.replace(' ', 'T')}Z` : s);
  return Number.isNaN(ms) ? null : ms;
}

/** Đọc mã loại từ `payload`. `null` = mở không ra (JSON hỏng, hoặc thiếu `type`). */
function readTypeCode(payload: string | null): string | null {
  if (payload == null) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(payload);
  } catch {
    // Nuốt CÓ CHỦ Ý và có chỗ lộ: một mục không đọc được nội dung vẫn là một mục
    // thật đang nằm chờ, nên nó phải hiện ra — chỉ là hiện với đúng câu
    // `UNREADABLE_TYPE_LABEL`, không phải với một nhãn loại đoán bừa.
    return null;
  }
  const type = parsed?.type;
  return typeof type === 'string' && type !== '' ? type : null;
}

/**
 * Xếp một mục vào nhóm.
 *
 * Thứ tự quyết định, và LÝ DO của thứ tự:
 *   1. `status === 'error'` — hạng duy nhất đã chết hẳn, thắng mọi thứ khác.
 *   2. nhãn quá-trần — nhãn này nằm trong CSDL nên sống qua lần mở lại app;
 *      để nó thua trạng thái nhất thời `'sending'` thì số đếm "cần người xử"
 *      nhảy lung tung giữa hai vòng quét.
 *   3. `'sending'` — đang trên đường đi, câu đúng nhất lúc này.
 *   4. hạng hỏng gần nhất (chỉ có trong bộ nhớ phiên).
 *   5. còn lại: đang chờ tới lượt.
 */
export function classifyQueueEntry(
  row: NormalizedRow,
  diagnostic?: SyncQueueDiagnostic,
): SyncQueueGroup {
  if (row.status === 'error') return 'stopped';
  if (row.errorCode != null && row.errorCode.startsWith(NEEDS_ATTENTION_PREFIX)) {
    return 'needsAttention';
  }
  if (row.status === 'sending') return 'sending';
  switch (diagnostic?.lastFailure) {
    case 'offline':
      return 'waitingNetwork';
    case 'retryable':
      return 'serverBusy';
    case 'auth':
      return 'sessionExpired';
    case 'blocked':
    case 'unsupported':
      return 'serverNotReady';
    case 'permanent':
      // Hạng này đáng lẽ đã thành `status: 'error'` ở nhánh 1. Tới được đây
      // nghĩa là lệnh ghi trạng thái đã trượt — nói đúng tên nó, đừng xếp vào
      // "đang chờ" cho gọn.
      return 'stopped';
    default:
      return 'queued';
  }
}

/** Dựng một mục hiển thị từ dòng thô + số liệu trong bộ nhớ (nếu có). */
export function buildSyncQueueEntry(row: any, diagnostic?: SyncQueueDiagnostic): SyncQueueEntry {
  const normalized = normalizeQueueRow(row);
  const typeCode = readTypeCode(normalized.payload);
  const typeLabel =
    typeCode == null
      ? UNREADABLE_TYPE_LABEL
      : (TYPE_LABEL[typeCode] ?? UNKNOWN_TYPE_LABEL);

  // Gỡ tiền tố nhãn để câu còn lại đúng là câu của máy chủ. Nhãn đã được nhóm
  // nói ra rồi; in kèm lần nữa là bắt người đọc tự lọc.
  const serverMessage =
    normalized.errorCode == null
      ? null
      : normalized.errorCode.startsWith(NEEDS_ATTENTION_PREFIX)
        ? normalized.errorCode.slice(NEEDS_ATTENTION_PREFIX.length)
        : normalized.errorCode;

  return {
    transactionId: normalized.transactionId,
    group: classifyQueueEntry(normalized, diagnostic),
    typeCode,
    typeLabel,
    createdAtMs: parseQueueTimestamp(normalized.createdAtRaw),
    createdAtRaw: normalized.createdAtRaw,
    attempts: diagnostic ? diagnostic.retryCount : null,
    nextAttemptAt: diagnostic ? diagnostic.nextAttemptAt : null,
    serverMessage: serverMessage === '' ? null : serverMessage,
    status: normalized.status,
    payloadRaw: normalized.payload,
  };
}

/** Một dòng nội dung đã ghi, đã tách thành nhãn và giá trị để bày ra màn. */
export interface RecordedField {
  label: string;
  value: string;
}

/**
 * Kết quả đọc nội dung đã ghi. BA trạng thái, không phải hai — trạng thái thứ ba
 * (`unreadable`) phải kêu to hơn trạng thái thứ hai (`none`), vì nó là trạng thái
 * MÙ: kho có giữ một thứ gì đó, chỉ là ở đây không mở ra được. Gộp nó vào `none`
 * là nói "bạn không ghi gì" cho một người đã ghi.
 */
export type RecordedPayload =
  | { kind: 'none' }
  | { kind: 'unreadable'; raw: string }
  | { kind: 'fields'; fields: RecordedField[] };

/**
 * Đọc nội dung đã ghi thành các dòng bày được ra màn.
 *
 * KHÔNG dịch tên trường sang tiếng Việt và KHÔNG bỏ trường lạ: hàm này phục vụ
 * đúng một việc — cho người dùng chép lại thứ họ đã ghi. Một bảng dịch sẽ im lặng
 * nuốt mọi trường chưa có trong bảng, và trường bị nuốt đúng là trường mới thêm,
 * tức thứ chưa ai biết là quan trọng hay không.
 *
 * Bỏ đúng một khoá: `type`. Nó đã được bày ra ở nhãn loại phía trên thẻ.
 */
export function describeRecordedPayload(payloadRaw: string | null): RecordedPayload {
  if (payloadRaw == null || payloadRaw === '') return { kind: 'none' };
  let parsed: any;
  try {
    parsed = JSON.parse(payloadRaw);
  } catch {
    return { kind: 'unreadable', raw: payloadRaw };
  }
  // Mở ra được nhưng không phải một khối có trường (số, chuỗi, mảng, `null`):
  // vẫn là thứ không bày thành dòng được, nên đi đường thô — đừng ép nó thành
  // một trường tên `value` mà người đọc không tra ngược được về đâu.
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'unreadable', raw: payloadRaw };
  }
  const fields: RecordedField[] = [];
  for (const [label, value] of Object.entries(parsed)) {
    if (label === 'type') continue;
    if (value == null) continue;
    fields.push({
      label,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    });
  }
  // Khối rỗng (hoặc chỉ có mỗi `type`) là một dữ kiện thật: mục này không mang
  // nội dung nào. Đó KHÁC với `none` — ở đây kho có giữ, và giữ một khối rỗng.
  if (fields.length === 0) return { kind: 'unreadable', raw: payloadRaw };
  return { kind: 'fields', fields };
}

export interface SyncQueueBuildResult {
  entries: SyncQueueEntry[];
  /**
   * Số dòng KHÔNG dựng được thành một mục (thiếu `transaction_id`).
   *
   * Trả về một con số thay vì ném cả lượt: ném thì một dòng rác xoá sạch mọi mục
   * lành khỏi màn, và xoá luôn đường gửi tay duy nhất mà người dùng có. Nhưng bỏ
   * qua im lặng cũng không được — cổng gác đòi ĐẾM phần bị loại, không chỉ khai
   * rằng có loại. Cùng tệp này đã xử `payload` không mở được theo đúng lối đó
   * (giữ dòng, gắn nhãn thật); chỗ này nay theo cùng lối.
   */
  unreadableRows: number;
}

export function buildSyncQueueEntries(
  rows: any[],
  diagnostics: Record<string, SyncQueueDiagnostic>,
): SyncQueueBuildResult {
  const entries: SyncQueueEntry[] = [];
  let unreadableRows = 0;
  for (const row of rows) {
    const id = row?.transaction_id ?? row?.transactionId;
    try {
      entries.push(buildSyncQueueEntry(row, typeof id === 'string' ? diagnostics[id] : undefined));
    } catch {
      unreadableRows += 1;
    }
  }
  return { entries, unreadableRows };
}

// ── Kết quả một lượt gửi lại do NGƯỜI DÙNG bấm ──────────────────────────────
//
// Kiểu nằm ở tệp lá này (chứ không ở `syncService`) để câu chữ mô tả chúng cũng
// nằm cùng chỗ và đo được bằng bài kiểm thuần. `syncService` nhập rồi xuất lại.

export type SyncRetryOutcome =
  | { kind: 'cleared' }
  | { kind: 'stillQueued'; status: string | null; message: string | null }
  | { kind: 'notAttempted'; reason: 'database-not-ready' | 'another-pass-running' };

export type SyncRetryAllOutcome =
  | {
      kind: 'done';
      /** Số mục CÒN GỬI ĐƯỢC trước lượt này — không phải số dòng trong bảng. */
      before: number;
      /** Số mục còn gửi được sau lượt này. */
      remaining: number;
      /** Số mục CHUYỂN sang không-gửi-lại-nữa trong đúng lượt này. */
      newlyStopped: number;
    }
  | { kind: 'notAttempted'; reason: 'database-not-ready' | 'another-pass-running' };

/**
 * Câu báo sau một lượt gửi lại.
 *
 * `text` là câu CỐ ĐỊNH (vào được từ điển dịch); `detail` là phần động — câu
 * nguyên văn của máy chủ hoặc con số đếm — nên nó không đi qua từ điển và cũng
 * không được phép bị thay bằng một câu chung chung.
 */
export interface SyncRetryNote {
  tone: 'ok' | 'bad';
  text: string;
  detail: string | null;
}

const NOT_ATTEMPTED_TEXT: Record<'database-not-ready' | 'another-pass-running', string> = {
  // Chưa thử ≠ đã thử và hỏng. Gộp hai cái thì người dùng đi sửa nhầm chỗ.
  'database-not-ready': 'Chưa thử gửi được: kho dữ liệu trên máy chưa mở.',
  'another-pass-running': 'Chưa thử gửi được: một lượt đồng bộ khác đang chạy. Chờ vài giây rồi bấm lại.',
};

export function describeRetryOutcome(outcome: SyncRetryOutcome): SyncRetryNote {
  switch (outcome.kind) {
    case 'cleared':
      return { tone: 'ok', text: 'Đã gửi xong — mục đã rời hàng đợi.', detail: null };
    case 'stillQueued':
      return outcome.message == null
        ? {
            tone: 'bad',
            text: 'Chưa gửi được. Mục vẫn nằm trong hàng đợi và máy chủ không để lại câu nào.',
            detail: null,
          }
        : { tone: 'bad', text: 'Chưa gửi được. Mục vẫn nằm trong hàng đợi.', detail: outcome.message };
    case 'notAttempted':
      return { tone: 'bad', text: NOT_ATTEMPTED_TEXT[outcome.reason], detail: null };
  }
}

export function describeRetryAllOutcome(outcome: SyncRetryAllOutcome): SyncRetryNote {
  if (outcome.kind === 'notAttempted') {
    return { tone: 'bad', text: NOT_ATTEMPTED_TEXT[outcome.reason], detail: null };
  }
  const { before, remaining, newlyStopped } = outcome;
  const sent = Math.max(0, before - remaining - newlyStopped);

  // Mục vừa CHẾT phải được nói ra trước mọi thứ khác, kể cả khi cùng lượt đó có mục
  // gửi được. Đây là hệ quả không lấy lại được của đúng lần bấm vừa rồi, và nó là
  // thứ duy nhất trong ba con số đòi người dùng làm một việc khác (ghi lại).
  if (newlyStopped > 0) {
    return {
      tone: 'bad',
      text: 'Có mục không gửi được nữa — cần xem lại từng mục.',
      detail: sent > 0
        ? `${sent} mục đã gửi · ${newlyStopped} mục đã dừng hẳn · còn ${remaining} mục chờ`
        : `${newlyStopped} mục đã dừng hẳn · còn ${remaining} mục chờ`,
    };
  }

  // `before === 0` ⇒ không có mục nào gửi được để mà thử. KHÔNG được đọc thành "đã
  // gửi xong": hàng đợi chỉ còn mục đã dừng hẳn cũng cho `remaining === 0`, và câu
  // "đã gửi xong" ở đó là câu trấn an cho một việc chưa xảy ra.
  if (before === 0) {
    return {
      tone: 'bad',
      text: 'Không có mục nào đang chờ để gửi.',
      detail: null,
    };
  }
  if (remaining === 0) {
    return { tone: 'ok', text: 'Đã gửi xong cả hàng đợi.', detail: null };
  }
  if (remaining < before) {
    return {
      tone: 'bad',
      text: 'Gửi được một phần, vẫn còn mục chưa gửi được.',
      detail: `${sent} mục đã gửi · còn ${remaining} mục`,
    };
  }
  return {
    tone: 'bad',
    text: 'Không mục nào gửi được trong lượt này.',
    detail: `còn ${remaining} mục`,
  };
}

/** Đếm theo nhóm. Nhóm không có mục nào thì KHÔNG xuất hiện — 0 không phải tin. */
export function countByGroup(entries: SyncQueueEntry[]): Array<{ group: SyncQueueGroup; count: number }> {
  return SYNC_QUEUE_GROUP_ORDER.map((group) => ({
    group,
    count: entries.filter((e) => e.group === group).length,
  })).filter((g) => g.count > 0);
}
