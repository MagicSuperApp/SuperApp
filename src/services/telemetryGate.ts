/**
 * telemetryGate — chỗ DUY NHẤT dữ liệu đo lường/nhật ký được phép đi ra mạng.
 *
 * ── Vì sao cần một chỗ chung ────────────────────────────────────────────────
 * Trước tệp này, app có bốn cửa ra và không cửa nào đi qua chỗ chung nào:
 * `remoteLogger`, `analyticsService`, `console.*`, và thông điệp lỗi trả về
 * người dùng. Vá từng cửa thì cửa thứ năm mọc ra mà không ai biết — người thêm
 * cửa mới không có nghĩa vụ nào phải nhớ tới ba cửa cũ.
 *
 * ── Vì sao danh sách CHO PHÉP, không phải danh sách CHẶN ────────────────────
 * Bộ lọc cũ (`SENSITIVE_FIELD_HINTS`) là danh sách CHẶN khớp theo TÊN NHÃN, và
 * nó hỏng theo ba đường cùng lúc:
 *
 *   1. Không khớp ⇒ CHO QUA. Nhãn `phrase_input` không có từ nào trong danh
 *      sách 13 mục, nên giá trị đi nguyên. Fail-OPEN.
 *   2. Danh sách đóng, tiếng Việt chỉ có 2/13 mục. Không có "cụm từ", "khôi
 *      phục", "khoá", "ví", "mã pin".
 *   3. Chỉ soi TÊN, không soi GIÁ TRỊ. Một cụm 24 từ BIP39 nhận ra được bằng
 *      hình dạng, nhưng không dòng nào nhìn vào đó.
 *
 * Danh sách CHẶN đòi người viết đoán trước mọi tên xấu — thứ không ai làm được.
 * Danh sách CHO PHÉP đòi khai tên tốt, và tên tốt thì đếm được. Chỗ sai của hai
 * cách khác nhau về CHIỀU: danh sách chặn sai thì bí mật đi ra im lặng; danh
 * sách cho phép sai thì mất một trường chẩn đoán và người gỡ lỗi thấy ngay một
 * chỗ trống CÓ NHÃN.
 *
 * ── Hai tầng, cả hai fail-closed ───────────────────────────────────────────
 * Tầng 1 — TÊN: khoá không có trong `ALLOWED_KEYS` thì bỏ.
 * Tầng 2 — HÌNH DẠNG: khoá được phép vẫn bị soi giá trị. Một chuỗi mang hình
 *          dạng bí mật thì bỏ, dù nó đứng dưới cái tên vô hại nào.
 *
 * Tầng 2 tồn tại vì tầng 1 không đủ: `err` là khoá hợp lệ và cần cho chẩn đoán,
 * nhưng nội dung của nó do THƯ VIỆN BÊN NGOÀI quyết chứ không do kho này quyết
 * — một `JSON.parse` hỏng có thể đính kèm đoạn văn bản đang phân tích, và đoạn
 * đó có thể là chuỗi JSON chứa khoá riêng.
 *
 * ── Bỏ thì phải KÊU, không được im ─────────────────────────────────────────
 * Mỗi trường bị bỏ để lại một dấu `[bỏ:<lý do>]` thay cho giá trị. Bỏ im lặng
 * thì người gỡ lỗi đọc bản ghi thiếu trường và tưởng đường mã không chạy tới đó
 * — tức cổng này sẽ tự biến thành một cái vỏ im lặng kiểu khác.
 */

/**
 * Tên trường được phép rời khỏi máy. Thêm một tên vào đây là MỘT QUYẾT ĐỊNH
 * nhìn thấy được trong diff — đó là toàn bộ giá trị của cách làm này.
 *
 * KHÔNG có trong danh sách, có chủ ý:
 *   · `lat` / `lon`  — toạ độ chính xác đi chung ống với `bootSession`, mà
 *     `bootSession` lại đi chung với tên đăng nhập ở một sự kiện khác. Một câu
 *     `GROUP BY bootSession` là ra bảng "tên người ↔ toạ độ vườn ↔ giờ". Độ
 *     chính xác đó không giúp gỡ lỗi thêm gì.
 *   · `did` / `userId` / `username` / `owner` — định danh người thật.
 *   · `uri` — đường dẫn tệp trên máy mang tên người dùng ở nhiều máy Android.
 */
export const ALLOWED_KEYS: readonly string[] = [
  // khung của bản ghi
  'event', 'level', 'jsSeq', 'bootSession', 'platform', 'timestamp',
  'device', 'osVersion', 'appVersion', 'screen', 'type', 'action', 'target',
  // số đo, không mang nội dung
  'ok', 'status', 'count', 'index', 'size', 'exists', 'round', 'round1Count',
  'totalCaptures', 'captureCount', 'similarity', 'durationMs', 'latencyMs',
  'clientTs', 'httpStatus', 'attempt', 'elapsedMs', 'queueLength',
  // `hasFix` thay cho `lat`/`lon`: trả lời "máy có định vị được không" mà không
  // chở theo người dùng đang đứng ở đâu.
  'hasFix',
  // định danh nghiệp vụ, không phải định danh người
  'farmId', 'treeId', 'queryId', 'confidence', 'verdict', 'correctTid',
  // khoá `metadata` đang dùng thật — đo trên cây: đúng 3 nơi gọi, 3 khoá.
  // `biometryType`/`kind` là LOẠI cảm biến (vân tay / khuôn mặt), không phải
  // dữ liệu sinh trắc; `from` là tên màn hình nguồn.
  'biometryType', 'kind', 'from',
  // chẩn đoán — QUA TẦNG 2, không đi thẳng
  'err', 'errCode', 'baseUrl', 'stackTrace', 'message', 'componentStack',
];

const ALLOWED = new Set(ALLOWED_KEYS);

/** Cắt ngắn chuỗi chẩn đoán. Vết ngăn xếp dài không giúp thêm, chỉ chở thêm. */
const MAX_LEN = 300;

/**
 * Hình dạng KHÔNG BAO GIỜ được rời máy, soi trên GIÁ TRỊ chứ không trên tên.
 * Mỗi mẫu kèm lý do, vì một mẫu không có lý do thì người sau sẽ nới nó ra.
 */
const FORBIDDEN_SHAPES: readonly { name: string; pattern: RegExp }[] = [
  // 12 từ thường trở lên, cách nhau bởi khoảng trắng — hình dạng cụm BIP39.
  // Không đối chiếu wordlist: đối chiếu thì phải NHÚNG wordlist vào đây, và một
  // cụm sai chính tả một từ vẫn là cụm cần chặn.
  { name: 'recovery-phrase', pattern: /\b(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\b/ },
  // did:phoenix:<13>:<64 hex> — định danh người, đuôi là khoá công khai
  { name: 'did', pattern: /did:[a-z]+:[a-z0-9]+:[0-9a-f]{16,}/i },
  // 64 ký tự hex liền = Master_KEK, khoá riêng, hoặc băm định danh
  { name: 'hex-64', pattern: /\b[0-9a-f]{64}\b/i },
  // base64url dài — chứng thực, phiếu, khoá đã mã hoá
  { name: 'long-base64', pattern: /\b[A-Za-z0-9_-]{60,}\b/ },
  // địa chỉ ví Cardano
  { name: 'wallet-address', pattern: /\b(?:addr|addr_test|stake|stake_test)1[a-z0-9]{20,}\b/i },
];

/** Giá trị này có mang hình dạng bí mật không; trả tên mẫu đã khớp. */
export function forbiddenShape(value: string): string | null {
  for (const s of FORBIDDEN_SHAPES) {
    if (s.pattern.test(value)) return s.name;
  }
  return null;
}

export interface FilterResult {
  /** Bản đã lọc, an toàn để gửi đi. */
  safe: Record<string, unknown>;
  /** Tên các trường đã bị bỏ — để bài kiểm và người gỡ lỗi đối chiếu. */
  dropped: string[];
}

/**
 * Lọc một bản ghi trước khi nó rời khỏi máy.
 *
 * Gọi ở TẦNG GHI, không ở tầng gọi: đặt ở tầng gọi thì mỗi nơi gọi phải nhớ,
 * và chỗ quên thì không gì báo.
 */
export function filterBeforeSend(
  input: Record<string, unknown> | null | undefined,
): FilterResult {
  const safe: Record<string, unknown> = {};
  const dropped: string[] = [];
  if (!input) return { safe, dropped };

  for (const [key, value] of Object.entries(input)) {
    // TẦNG 1 — tên không khai thì không đi.
    if (!ALLOWED.has(key)) {
      safe[key] = '[bỏ:tên-chưa-khai]';
      dropped.push(key);
      continue;
    }

    if (value === null || value === undefined) {
      safe[key] = null;
      continue;
    }
    // Số và luận lý không chở được bí mật dạng chuỗi.
    if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
      continue;
    }

    const text = typeof value === 'string' ? value : safeStringify(value);

    // TẦNG 2 — tên hợp lệ vẫn phải qua phép soi hình dạng.
    const hit = forbiddenShape(text);
    if (hit) {
      safe[key] = `[bỏ:hình-dạng-${hit}]`;
      dropped.push(key);
      continue;
    }

    safe[key] = text.length > MAX_LEN ? text.slice(0, MAX_LEN) + '…' : text;
  }

  return { safe, dropped };
}

/**
 * `JSON.stringify` ném với tham chiếu vòng. Ở đây ném là mất cả bản ghi, nên
 * bắt lại — nhưng KHÔNG trả về chuỗi rỗng: chuỗi rỗng lẫn với "trường này vốn
 * rỗng", còn dấu dưới đây thì tự khai là đã hỏng ở đâu.
 */
function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return '[bỏ:không-tuần-tự-hoá-được]';
  }
}
