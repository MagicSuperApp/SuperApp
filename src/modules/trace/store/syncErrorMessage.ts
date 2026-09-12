/**
 * Câu nói với người dùng khi một lượt ĐỌC từ máy chủ không tới nơi.
 *
 * ── Vì sao không dùng thẳng `fieldErrorMessage` ────────────────────────────
 * `fieldErrorMessage` là câu của đường GỬI ẢNH, và nó nói đúng việc của đường
 * đó: *"…thường là kết nối bị đứt giữa lúc đang gửi ảnh — thử lại một lần
 * nữa."* Dán câu ấy lên một lượt đọc danh sách vườn thì người dùng đọc được
 * một lời khuyên về việc họ không hề làm — tức app lại đang nói một thứ nó
 * không biết, chỉ theo một kiểu khác.
 *
 * ── Ba luật, theo đúng thứ tự ──────────────────────────────────────────────
 * 1. **Máy chủ có câu dành cho người dùng thì hiện ĐÚNG câu đó.** `reason` là
 *    câu máy chủ viết cho người đọc; nó nói được người dùng phải làm gì, câu
 *    chung chung của app thì không.
 * 2. **Lỗi hệ thống thô thì hiện MÃ THAM CHIẾU, không hiện nguyên văn.** Dùng
 *    lại `errRefCode` chứ không chép: đường dẫn nội bộ và thông tin phiên đi ra
 *    ngoài theo traceback là chuyện đã xảy ra thật.
 * 3. **Không có gì để nói thì nói là không hỏi được** — chứ không im, và tuyệt
 *    đối không quy về "chưa có dữ liệu".
 */
import { tk } from '../../../i18n/keys';
import { errRefCode, type APIError } from '../../../services/treeReIDService';
import { authSyncMessage } from '../../../services/orilifeAuthMessage';

/** Ba nhãn thuộc tầng KẾT NỐI — chúng là chỗ mã tham chiếu có giá trị. */
const CONNECTION_LEVEL: ReadonlySet<APIError['type']> = new Set([
  'network_error',
  'timeout',
  'bad_response',
]);

const KEY_BY_TYPE: Partial<Record<APIError['type'], string>> = {
  network_error: 'trace.sync.network',
  timeout: 'trace.sync.timeout',
  bad_response: 'trace.sync.badResponse',
  auth_error: 'trace.sync.authError',
  rate_limited: 'trace.sync.rateLimited',
  server_error: 'trace.sync.serverError',
};

export function syncErrorMessage(err?: APIError): string {
  if (!err) return tk('trace.sync.unknown');
  if (err.reason && err.reason.trim()) return err.reason;
  if (err.type === 'auth_error') return authSyncMessage();

  const key = KEY_BY_TYPE[err.type];
  const cau = key ? tk(key) : tk('trace.sync.unknown');
  return CONNECTION_LEVEL.has(err.type) ? cau + errRefCode(err) : cau;
}
