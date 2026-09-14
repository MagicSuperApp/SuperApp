import { tk } from '../i18n/keys';

/**
 * Đổi một lần mở máy ảnh HỎNG thành câu nói ĐÚNG NGUYÊN NHÂN.
 *
 * `react-native-image-picker` trả về `errorCode` thuộc đúng ba giá trị
 * (`node_modules/react-native-image-picker/lib/typescript/types.d.ts:48`):
 * `camera_unavailable` · `permission` · `others`. Ba ca đó cần ba câu khác nhau vì
 * việc người dùng phải làm ở ba ca là khác nhau — và ở ca đầu thì KHÔNG có việc gì
 * để làm cả, nên nói rõ thế còn hơn chỉ họ đi mở Cài đặt.
 *
 * Vì sao là hàm dùng chung chứ không phải hai khối `if` chép sang nhau: cùng điều
 * kiện này có mặt ở `ActivityScreen` (quay việc đồng) và `FruitVideoScreen` (quay
 * quả), và mỗi lần thêm một màn quay nữa là thêm một chỗ có thể quên. Cùng một lý
 * do đã làm `routeIsReachable` phải dọn lên `moduleCatalog` ngày 14/09/2026 — khi
 * đó ba lối vào chép tay một điều kiện và đúng một lối quên.
 *
 * Đo trên máy ảo iPhone 17 ngày 14/09/2026: quyền máy ảnh vừa được cấp (**Allow**),
 * chọn "Tưới nước" ở `ActivityScreen`, màn hiện "Kiểm tra lại quyền dùng máy ảnh".
 * Quyền có; máy ảnh không. Câu đó tiêu thời gian của người dùng vào đúng chỗ không
 * có gì để sửa.
 *
 * ⚠ Số đo trên là số đo trên MÁY ẢO, và máy ảo không đại diện cho máy thật ở đúng
 * chuyện quyền: `ImagePickerManager.mm:70-73` trả `camera_unavailable` ngay dòng
 * đầu khi chạy máy ảo, TRƯỚC mọi nhánh quyền. Nên nó chứng minh được điều nó được
 * dẫn ra để chứng minh — ba mã lỗi cần ba câu khác nhau — và không chứng minh được
 * gì về đường quyền. Đường quyền trên iOS hỏng theo một kiểu khác hẳn, không máy ảo
 * nào chạm tới được; xem `utils/cameraPermission.ts`.
 *
 * ── ĐÍNH CHÍNH 14/09/2026: `errorMessage` KHÔNG phải câu cho người dùng ─────────
 * Bản đầu của hàm này cho `errorMessage` quyền ưu tiên cao nhất, với lý do "máy ảnh
 * nói được thành câu thì để NÓ nói" (Forall §Cái vỏ im lặng mục 2). Nguyên tắc đúng,
 * dữ kiện sai — và sai ở chỗ kiểm được bằng một lệnh, nên đây là lỗi không đo:
 *
 *   · `node_modules/react-native-image-picker/README.md:136` — *"errorMessage …
 *     Description of the error, **use it for debug purpose only**"*.
 *   · Một giá trị thật của nó: `android/.../Utils.java:56` = *"This library does not
 *     require Manifest.permission.CAMERA, if you add this permission in manifest then
 *     you have to obtain the same."*
 *   · Các giá trị còn lại là `e.getMessage()` thô (`ImagePickerModuleImpl.java:110`,
 *     `:167`, `:179`, `:202`) và `"Activity error"`.
 *
 * Tức nhánh ưu tiên đó đưa một câu tiếng Anh nói về tệp khai báo Android ra trước
 * mặt người làm vườn — thay đúng ba câu tiếng Việt vừa viết ra để tránh việc ấy.
 *
 * Mục 2 của §Cái vỏ im lặng nói **"máy chủ có CÂU cho người dùng thì hiện câu đó"**,
 * và cũng chính mục đó nói lỗi hệ thống THÔ thì hiện **mã tham chiếu**. `errorMessage`
 * ở thư viện này thuộc loại thứ hai. Nên nó đi vào ô `{code}`, không làm cả câu.
 *
 * Nguồn sự thật về nguyên nhân là `errorCode` — ba giá trị, có hợp đồng kiểu, và
 * mỗi giá trị ứng với một việc khác nhau mà người dùng phải làm.
 */
export function cameraErrorBody(response: {
  errorCode?: string;
  errorMessage?: string;
}): string {
  switch (response.errorCode) {
    case 'camera_unavailable':
      return tk('trace.activity.cameraErrUnavailable');
    case 'permission':
      return tk('trace.activity.cameraErrPermission');
    default:
      // Kể cả `errorCode` rỗng: nói "không rõ" là đúng, và mã đó tra ngược được ở
      // log. Đừng lấp bằng một trong hai câu trên — chúng là hai khẳng định về
      // trạng thái máy, và ở đây mình không đo được trạng thái nào.
      //
      // `errorMessage` đi kèm vào đây chứ không bị bỏ: nó là thứ duy nhất nói được
      // ca `others` là ca gì, và người thử chỉ cần CHÉP LẠI đúng, không cần hiểu.
      return tk('trace.activity.cameraErrOther', {
        code: [response.errorCode || 'unknown', response.errorMessage]
          .filter(Boolean)
          .join(' · '),
      });
  }
}
