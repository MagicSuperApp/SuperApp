/**
 * `200 {"ok": false}` — lời TỪ CHỐI của máy chủ đội lốt lời đồng ý.
 *
 * ── Vì sao có tệp này ──────────────────────────────────────────────────────
 * Máy chủ OriLife field-reid từ chối ở vài đường bằng **HTTP 200 kèm
 * `{"ok": false, "error": "..."}`**. `timelineService.ts` đã tự vá tại chỗ
 * ("chỉ đọc `resp.ok` là bỏ sót"), nhưng sáu cửa khác thì không — và ở đó cái
 * `ok` của THÂN được khai trong kiểu trả về rồi **không nơi nào đọc**.
 *
 * Hậu quả đo được bằng PoC với thân `{ok:false, error:"Tài khoản của bạn đang
 * bị tạm khoá quyền xem vườn."}` trả kèm HTTP 200:
 *
 *     listFarms       → {"ok":true,"farms":[]}
 *     getFarm         → {"ok":false}                ← mất luôn câu `error`
 *     fetchTreeViews  → {"ok":true,"data":{...,"views":[]}}
 *
 * `syncFarmsFromBackend` đọc `res.ok && res.farms` ⟹ ghi `source:'server'`,
 * `syncError: null`. App khẳng định *"đã đồng bộ xong và bạn có 0 vườn"*, người
 * dùng bấm "Tạo vườn", và trên máy chủ có bản ghi thứ hai. Đúng hình dạng "cái
 * vỏ im lặng": **danh sách rỗng và lần gọi hỏng phải ra hai trạng thái khác
 * nhau**.
 *
 * ── Vì sao MỘT tệp chứ không sáu lần chép ─────────────────────────────────
 * Phép đọc này là một sự thật về hợp đồng máy chủ. Chép sáu lần thì ngày máy
 * chủ đổi tên trường (`error` → `message`) có sáu chỗ phải nhớ, và chỗ quên
 * không kêu lên — nó chỉ lặng lẽ quay về nói "bạn không có gì".
 *
 * ── Giữ NGUYÊN VĂN câu của máy chủ ────────────────────────────────────────
 * "Tài khoản của bạn đang bị tạm khoá quyền xem vườn." nói được người dùng phải
 * làm gì; "Có lỗi xảy ra" thì không. Chỉ khi máy chủ từ chối mà không nói lý do
 * mới dùng câu đệm — và câu đệm đó phải tự khai rằng máy chủ đã im.
 */

/**
 * Lỗi dựng từ một lần từ chối. Nhãn `server_error` cố ý: nó là thành viên chung
 * của CẢ HAI kiểu `APIError` trong kho (`treeReIDService` và `fruitReIDService`),
 * nên đối tượng này gán được vào cả hai mà không cần ép kiểu.
 */
export interface ServerRejection {
  type: 'server_error';
  detail: string;
  http_status: number;
  /**
   * Câu máy chủ viết CHO NGƯỜI ĐỌC, nguyên văn. Chỉ có khi máy chủ thật sự nói
   * một câu — im lặng thì trường này vắng, và chỗ gọi được phép dùng câu chung.
   *
   * Vì sao phải có trường này chứ không chỉ `detail`: `syncErrorMessage` (và
   * `fieldErrorMessage`) đọc `reason` TRƯỚC, rồi mới rơi về một câu chung theo
   * nhãn — nhãn `server_error` dịch ra *"Máy chủ đang bận, thử lại sau"*. Nếu chỉ
   * đặt `detail`, câu *"Tài khoản của bạn đang bị tạm khoá quyền xem vườn."* bị
   * thay bằng lời mời thử lại vô hạn cho một ca thử lại không giúp được gì.
   */
  reason?: string;
}

/** Ba tên trường máy chủ dùng để nói lý do, theo thứ tự ưu tiên đã đo. */
const REASON_KEYS = ['error', 'detail', 'message'] as const;

/**
 * Máy chủ có đang từ chối trong thân này không.
 *
 * So NGHIÊM với `false`: trường vắng mặt (`undefined`) KHÔNG phải một lời từ
 * chối — phần lớn cửa không trả `ok` trong thân, và đọc `!body.ok` sẽ biến mọi
 * phản hồi hợp lệ thành lỗi.
 */
export function isServerRejection(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return (body as { ok?: unknown }).ok === false;
}

/**
 * Câu máy chủ vừa nói, NGUYÊN VĂN. `null` khi nó từ chối mà không nói gì.
 */
export function serverRejectionReason(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  for (const key of REASON_KEYS) {
    const v = b[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * `null` = máy chủ KHÔNG từ chối, chỗ gọi đi tiếp như thường.
 * Ngược lại là lỗi đã dựng sẵn, mang nguyên văn câu của máy chủ.
 *
 * `httpStatus` giữ đúng mã thật (thường là 200) chứ không bịa thành 4xx: mã đó
 * là thứ người sửa đọc trong nhật ký, và đổi nó là xoá đúng manh mối nói rằng
 * cửa này từ chối bằng 200.
 */
export function serverRejectionOf(body: unknown, httpStatus: number): ServerRejection | null {
  if (!isServerRejection(body)) return null;
  const said = serverRejectionReason(body);
  return {
    type: 'server_error',
    detail: said ?? 'Máy chủ từ chối yêu cầu nhưng không nói lý do.',
    http_status: httpStatus,
    // KHÔNG đặt `reason` khi máy chủ im: `reason` nghĩa là "máy chủ đã nói câu
    // này với người dùng", và dựng ra một câu rồi gắn nhãn đó là bịa lời máy chủ.
    ...(said ? { reason: said } : {}),
  };
}
