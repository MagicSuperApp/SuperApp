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
 */
export function cameraErrorBody(response: {
  errorCode?: string;
  errorMessage?: string;
}): string {
  // Máy ảnh nói được thành câu thì để NÓ nói — Forall §Cái vỏ im lặng mục 2. Chỉ khi
  // nó im mới tới lượt mình đoán, và lúc đó đoán theo `errorCode` chứ không đoán khơi.
  if (response.errorMessage) return response.errorMessage;

  switch (response.errorCode) {
    case 'camera_unavailable':
      return tk('trace.activity.cameraErrUnavailable');
    case 'permission':
      return tk('trace.activity.cameraErrPermission');
    default:
      // Kể cả `errorCode` rỗng: nói "không rõ" là đúng, và mã đó tra ngược được ở
      // log. Đừng lấp bằng một trong hai câu trên — chúng là hai khẳng định về
      // trạng thái máy, và ở đây mình không đo được trạng thái nào.
      return tk('trace.activity.cameraErrOther', {
        code: response.errorCode || 'unknown',
      });
  }
}
