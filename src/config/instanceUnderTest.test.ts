/**
 * App ĐANG ĐƯỢC THỬ có đúng là app CI yêu cầu không.
 *
 * ── Ca hỏng bài này sinh ra để chặn ─────────────────────────────────────────
 * Tới 2026-09-10, `.github/workflows/verify-pr.yml:101` chạy `npx jest` MỘT lượt
 * và không có bước sinh tệp biến môi trường nào. `APP_INSTANCE` rỗng ⟹
 * `resolveInstance` trả `ALADIN_INSTANCE` (`instance.config.ts:524`). Nghĩa là
 * toàn bộ 171 bộ bài trên MỌI lần duyệt yêu cầu gộp mã, từ trước tới nay, chỉ
 * chứng minh được MỘT app. Đường mã riêng của app kia — bảng thứ tự ô ở màn
 * chính, nhánh "app chưa khai trang web" — chưa lần nào chạy trong CI.
 *
 * ── Vì sao chạy hai lượt thôi thì CHƯA đủ, và đó mới là điểm của bài này ────
 * `react-native-dotenv` là bộ chuyển mã của Babel: nó nướng giá trị vào lúc
 * BIẾN ĐỔI MÃ, không phải lúc chạy. Jest giữ bộ đệm kết quả biến đổi. Nên hai
 * lượt `jest` trong cùng một lượt chạy CI, dùng chung một bộ đệm, có thể cho ra
 * cùng MỘT app — lượt sau ăn lại mã đã nướng giá trị của lượt trước.
 *
 * Hỏng kiểu đó KHÔNG có triệu chứng: cả hai lượt xanh, báo cáo in ra hai tên
 * app khác nhau, và người đọc thấy đúng thứ mình muốn thấy. Đây đúng là dạng
 * "cổng chờ điều kiện đã đúng sẵn" — có tên như cổng mà nhả hết.
 *
 * Bài này là chỗ duy nhất phân biệt được hai bên: nó so ĐIỀU CI YÊU CẦU với
 * ĐIỀU MÃ THẬT SỰ NHẬN ĐƯỢC. Bộ đệm nhiễm bẩn ⟹ hai giá trị lệch ⟹ đỏ.
 *
 * ── Vì sao KHÔNG đọc `APP_INSTANCE` để biết "CI yêu cầu gì" ─────────────────
 * Bản đầu của bài này so `process.env.APP_INSTANCE` với `DEFAULT_INSTANCE`. Đo
 * ra là cổng RỖNG ở một nửa: chạy `CI=true APP_INSTANCE= npx jest --no-cache`
 * vẫn xanh 4/4, vì tầng nạp tệp biến môi trường BƠM LẠI giá trị vào biến rỗng.
 * Tức `APP_INSTANCE` không bao giờ rỗng được ở máy có tệp đó, và mục "CI phải
 * khai rõ app nào" không bao giờ đỏ được.
 *
 * Gốc của cái sai không phải phép đo mà là thiết kế: một nguồn duy nhất được
 * đem ra đóng vai hai bên của phép so. Hai bên như thế thì chỉ lệch nhau được
 * do bộ đệm — mọi kiểu hỏng khác đều lọt.
 *
 * Nên CI khai RIÊNG bằng `EXPECTED_APP_INSTANCE`: biến này không nằm trong tệp
 * biến môi trường, không nhánh mã nào bơm lại, nên rỗng thì rỗng thật. Giờ hai
 * bên của phép so là hai lời khai độc lập thật sự.
 */
import { DEFAULT_INSTANCE, INSTANCES } from './instance.config';

/**
 * Máy chạy CI đặt `CI=true`. Dùng nó để đòi hỏi KHẮT KHE HƠN trên CI so với máy
 * lập trình viên: ở máy cá nhân, chạy `npx jest` trần là việc bình thường và
 * không nên bắt ai phải khai biến trước.
 */
const onCI = !!process.env.CI;

/**
 * App mà NGƯỜI GỌI khai là mình đang muốn thử. Rỗng = không khai.
 *
 * ĐỘC LẬP với `APP_INSTANCE` — cố ý. Xem khối trên.
 */
const requested = (process.env.EXPECTED_APP_INSTANCE ?? '').trim();

describe('app đang thử đúng là app được yêu cầu', () => {
  it('trên CI, lượt chạy PHẢI khai rõ app nào đang được thử', () => {
    // Không có mục này thì lượt CI mất biến sẽ lặng lẽ bỏ qua mục dưới, và cả
    // cổng hai lượt trở thành hai lượt giống hệt nhau mà không ai biết.
    if (!onCI) return;
    expect(requested).not.toEqual('');
  });

  it('app mã NHẬN ĐƯỢC trùng app người gọi YÊU CẦU', () => {
    if (requested === '') return;
    expect(DEFAULT_INSTANCE.instanceId).toEqual(requested);
  });

  it('ĐỐI CHỨNG — tên app được yêu cầu là tên có thật trong bảng', () => {
    // Gõ sai tên app (`checkfam`) thì `resolveInstance` đã ném, nên mục này chỉ
    // còn canh ca biến mang giá trị rác mà đường ném bị nới ra sau này.
    if (requested === '') return;
    expect(Object.keys(INSTANCES)).toContain(requested);
  });

  it('ĐỐI CHỨNG — bảng app có ít nhất hai app, nếu không cổng hai lượt vô nghĩa', () => {
    // Bảng còn một app thì mọi lượt chạy đều cho cùng kết quả, và cổng hai lượt
    // ở `verify-pr.yml` tốn phút chạy mà không chứng minh gì thêm.
    expect(Object.keys(INSTANCES).length).toBeGreaterThanOrEqual(2);
  });
});
