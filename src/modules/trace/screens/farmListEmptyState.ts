/**
 * Màn danh sách vườn đang ở tình huống NÀO — thuần tính, không chạm React.
 *
 * ── Vì sao tách ra khỏi màn ────────────────────────────────────────────────
 * Đây là chỗ đã hỏng, và nó hỏng theo kiểu không phép kiểm nào bắt được: bốn
 * nhánh nằm trong `renderEmpty`, mỗi nhánh một câu `return <StateView …>`, nên
 * muốn đo "ca máy chủ chết ra màn nào" thì phải dựng cả màn — kéo theo bản đồ,
 * máy ảnh, native. Không ai dựng, nên không ai đo, nên ba nhánh đứng đó nhìn
 * rất đúng mà KHÔNG nhánh nào chạy được ở ca chúng sinh ra để xử.
 *
 * Tách thành một hàm thuần thì câu hỏi trở lại đo được bằng một lần gọi.
 *
 * ── Luật, viết thẳng ra vì nó là toàn bộ điểm của tệp này ──────────────────
 * **Danh sách rỗng vì CHƯA CÓ GÌ, và danh sách rỗng vì KHÔNG HỎI ĐƯỢC, là hai
 * tình huống khác nhau và phải ra hai màn khác nhau.**
 *
 * `'empty'` là một KHẲNG ĐỊNH về dữ liệu của người dùng ("bạn chưa có vườn
 * nào") kèm lời mời tạo mới. Nói câu đó khi app chưa hỏi được máy chủ thì
 * người dùng ngoài thực địa đọc ra "dữ liệu của tôi mất rồi", và bấm tạo lại
 * một vườn vốn vẫn nằm nguyên trên máy chủ.
 */

export type FarmListState =
  /** Đang hỏi, chưa có gì để bày. */
  | 'loading'
  /** Máy KHÔNG có mạng — nói đúng nguyên nhân đó, và có nút thử lại. */
  | 'offline'
  /** Có hỏi mà không tới nơi (kể cả khi máy VẪN có mạng). Có nút thử lại. */
  | 'error'
  /** Đã hỏi được, và câu trả lời là: chưa có vườn nào. Mời tạo vườn đầu tiên. */
  | 'empty'
  /** Có vườn, nhưng bộ lọc hiện tại không khớp cái nào. */
  | 'noResults'
  /** Có cái để bày. */
  | 'list';

export interface FarmListSignals {
  /** Số vườn đang cầm (từ máy chủ hoặc từ bộ nhớ đệm). */
  farmCount: number;
  /** Số vườn còn lại sau ô tìm kiếm. */
  matchedCount: number;
  isLoading: boolean;
  /** Trạng thái giao diện mạng của máy. */
  offline: boolean;
  /**
   * Lượt hỏi máy chủ gần nhất KHÔNG tới nơi — lý do, dành cho người dùng.
   *
   * ⛔ Đây là con trỏ đã THIẾU. `loadError` chỉ đến từ đường đọc SQLite cục bộ,
   *    còn `offline` chỉ biết máy có mạng hay không — cả hai đều im ở ca "máy
   *    có mạng, máy chủ chết" (Wi-Fi cổng đăng nhập, sóng yếu có IP nhưng
   *    không có tuyến, 5xx). Ở đúng ca ấy màn rơi thẳng vào `'empty'`.
   */
  syncError: string | null;
  /** Lỗi đọc bộ nhớ đệm cục bộ. */
  loadError: string | null;
}

export function farmListState(s: FarmListSignals): FarmListState {
  if (s.matchedCount > 0) return 'list';
  if (s.isLoading && s.farmCount === 0) return 'loading';
  if (s.farmCount === 0) {
    // Thứ tự CÓ nghĩa: mất mạng thì nói mất mạng (người dùng làm được gì đó với
    // câu đó), rồi mới tới lý do chung "hỏi không tới nơi".
    if (s.offline) return 'offline';
    if (s.syncError || s.loadError) return 'error';
    return 'empty';
  }
  return 'noResults';
}

/**
 * Có nên bày dải "đang xem bản lưu trong máy" không.
 *
 * Tách khỏi hàm trên vì nó KHÔNG loại trừ nhau với việc bày danh sách: dữ liệu
 * vẫn hiện đầy đủ, dòng này chỉ nói nó có thể đã cũ. Không có nó thì một danh
 * sách cũ trông y hệt một danh sách vừa đồng bộ.
 */
export function showStaleNotice(s: Pick<FarmListSignals, 'farmCount' | 'syncError'>): boolean {
  return s.farmCount > 0 && s.syncError !== null;
}
