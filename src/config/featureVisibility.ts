// config/featureVisibility.ts
//
// LỐI VÀO có được VẼ RA hay không. Tách hẳn khỏi câu hỏi tính năng có CHẠY được
// hay không — hai câu khác nhau, và gộp chúng là cách một nút chết được vẽ ra.
//
// Vì sao tệp này tồn tại: tới 18/09/2026 app vẽ năm lối vào hai tính năng chưa
// nối xong. Bốn lối dẫn tới màn nói "chưa mở", một lối dẫn tới màn hiện "—".
// Người dùng bấm vào một thứ không làm được gì, và người soát của Apple/Google
// đọc đúng hình dạng đó là "app chưa hoàn chỉnh".
//
// ⛔ HAI CỜ Ở ĐÂY ĐỀU LÀ SUY RA, KHÔNG PHẢI GÕ TAY. Đó là điểm chính của tệp.
// Một cờ `WAKEME_VISIBLE = false` gõ tay thì ngày mở khoá có người đổi nó thành
// `true` mà không ai nhắc rằng đường ký vẫn chết — và lúc đó nút sáng trở lại
// trên một luồng vẫn ném ở bước cuối. Suy ra từ chính các cờ sẵn-sàng thì hình
// dạng đó KHÔNG dựng được: muốn thấy nút thì phải làm cho tính năng chạy trước.

import {
  WAKEME_CLAIM_READY,
  WAKEME_SIGNING_READY,
  WAKEME_TX_REVIEW_READY,
} from '../services/wakemeService';
import { getMagicVaultConfig } from './magicVault';

/**
 * Có vẽ lối vào Wakeme (nhận LAMP khởi tạo) không.
 *
 * SUY RA từ cả ba chốt của luồng đó. Mỗi chốt hôm nay là `false`, và mỗi chốt
 * nằm ở một nhà khác nhau — nên cái ngày cả ba cùng `true` là cái ngày luồng
 * thật sự đi được từ đầu tới cuối, không sớm hơn.
 *
 *   CLAIM_READY      — máy chủ đã nhận được giao dịch nhận LAMP chưa
 *   SIGNING_READY    — cầu nối native đã ký được bằng hai khoá chưa
 *   TX_REVIEW_READY  — đã có màn duyệt nội dung giao dịch chưa
 *
 * Chốt thứ ba là chốt duy nhất trong ba cái mà bỏ qua thì hệ VẪN CHẠY — chạy
 * thẳng vào một đường rút ví, vì `wakeme_sign` cố ý không diễn giải nội dung
 * giao dịch và uỷ thác việc đó cho một màn duyệt. Nó không nằm sau hai chốt
 * kia, nó nằm song song. Để nó trong cùng biểu thức này để nó không thành thứ
 * bị nhớ ra sau.
 */
export const WAKEME_VISIBLE: boolean =
  WAKEME_CLAIM_READY && WAKEME_SIGNING_READY && WAKEME_TX_REVIEW_READY;

/**
 * Có vẽ lối vào màn điểm MAGIC không.
 *
 * Hàm chứ không phải hằng, và đọc cấu hình THẬT chứ không đọc một cờ: màn MAGIC
 * không chờ mã nào cả, nó chờ ba biến môi trường (`MAGIC_VAULT_API_URL`,
 * `MAGIC_VAULT_OWNER_PKH`, `MAGIC_VAULT_API_TOKEN`). Ngày ba biến đó được điền
 * thì lối vào tự mở ở lần dựng kế tiếp — không ai phải nhớ quay lại đổi một
 * dòng, và không có dòng nào để quên.
 *
 * `getMagicVaultConfig()` trả `null` khi thiếu biến HOẶC khi `owner_pkh` sai
 * dạng — cả hai đều là "chưa dùng được", và đó đúng là câu hỏi ở đây.
 */
export function magicVisible(): boolean {
  return getMagicVaultConfig() !== null;
}
