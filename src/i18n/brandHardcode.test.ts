/**
 * Chuỗi HIỂN THỊ không được gọi tên một app cụ thể — trừ danh sách ĐÓNG dưới đây.
 *
 * ── Vì sao cần cổng này, trong khi `{brand}` đã có từ 2026-08-29 ────────────
 * Chỗ thay `{brand}` chỉ chữa những chuỗi ai đó NHỚ RA mà sửa. Đo 2026-09-11 —
 * hơn hai tuần sau đợt ấy — trong từ điển vẫn còn 21 mục gọi thẳng "Aladin",
 * trong đó bảy mục là bản CŨ nằm cạnh chính bản `{brand}` đã thay nó, và sáu
 * mục là chữ ĐANG hiện trên màn của bản CheckFarm:
 *
 *   "Bảo vệ Aladin" · "Hướng dẫn đăng việc trên Aladin" · "Mọi giao dịch trên
 *   Aladin…" · "Trao đổi qua Aladin Chat…" · "Đăng nhập Aladin Work" ·
 *   "Có CMND đã xác thực Aladin"
 *
 * Không phép kiểm nào đỏ, vì `brandSlot.test.ts` canh chiều NGƯỢC LẠI: nó bắt
 * `{brand}` phải biến mất trước khi ra màn hình. Một chuỗi KHÔNG hề có `{brand}`
 * thì với nó là hoàn hảo.
 *
 * ── Cổng siết lên dữ liệu cũ thì phải ĐÓNG BĂNG tập cũ ──────────────────────
 * Chặn cứng mọi chỗ là đỏ cả kho trong một lượt; cho qua là không canh gì. Nên
 * danh sách dưới đây ĐÓNG và ĐẾM ĐƯỢC: mục mới xuất hiện là đỏ, mục cũ biến mất
 * cũng đỏ (để không ai vá xong rồi quên rút tên khỏi danh sách miễn).
 */
import { DICTIONARY } from './dictionary';
import { ALL_STRINGS } from './keys';

/** Tên app sinh ra từ nền mã này. Thêm app là thêm một tên phải canh. */
const APP_NAMES = ['Aladin', 'CheckFarm'];

/**
 * Mục được phép còn gọi tên app, kèm LÝ DO. Ba loại, và chúng khác nhau về
 * cách xử tiếp — đừng gộp:
 *
 *   `nhà cung cấp` — `AladinWork` là tên MÁY CHỦ thật, không phải tên app đang
 *     cầm. Thay bằng `{brand}` là khai sai. Đường đúng là viết lại câu để nói
 *     việc người dùng phải làm thay vì nêu tên máy chủ (`navLabels.ts:21-23`:
 *     tên nhà cung cấp chỉ sống ở `services/*` và biến môi trường). Đó là quyết
 *     định câu chữ, chưa chốt.
 *   `vai giao thức` — `aladin` / `genie` là TÊN VAI trong dữ liệu hợp đồng
 *     (`workApi.ts`: `role: 'aladin' | 'genie'`, `aladinPledge`/`geniePledge`).
 *     Trùng tên app là trùng ngẫu nhiên; đổi chữ hiển thị mà không đổi giao
 *     thức thì hai bên gọi một vai bằng hai tên.
 *   `mục chết` — không chỗ gọi nào (đo bằng cách quét chuỗi nguồn trên toàn
 *     `src/`). Vô hại lúc chạy, nhưng nó nằm CẠNH bản `{brand}` đã thay nó, nên
 *     người sửa sau dễ chép nhầm bản cũ.
 */
const FROZEN: Record<string, string> = {
  'Aladin · Tin tức cộng đồng': 'mục chết',
  'Lỗi mạng khi gọi trợ lý Aladin': 'mục chết — chuỗi Error nội bộ, không ra màn',
  'Trợ lý Aladin phản hồi quá lâu': 'mục chết — chuỗi Error nội bộ, không ra màn',
  'Không gửi được yêu cầu tới Aladin': 'mục chết — chuỗi Error nội bộ, không ra màn',
  'Ví Aladin': 'mục chết',
  'DEMO — tin nhắn minh hoạ, CHƯA gửi thật qua mạng. Đang chờ máy chủ Aladin Chat.': 'mục chết',
  'Mã này chưa gắn dữ liệu truy xuất Aladin. Hãy thử mã QR trên sản phẩm đã định danh.': 'mục chết',
  'Trợ lý Aladin': 'mục chết — bản sống là "Trợ lý {brand}"',
  'Xin chào 👋 Mình là trợ lý Aladin. Bạn cần giúp gì hôm nay?':
    'mục chết — bản sống là "…trợ lý {brand}…"',
  'Aladin Chat — phiên bản mới': 'mục chết',
  'Phòng chat Aladin sẽ mở để bạn trao đổi với người thuê.': 'mục chết',
  'Cần backend AladinWork để thực thi bước này.': 'nhà cung cấp',
  'Cần máy chủ AladinWork để đăng bằng chứng.': 'nhà cung cấp',
  'Cần máy chủ AladinWork để khai năng lực.': 'nhà cung cấp',
  'Danh sách mẫu cần máy chủ AladinWork.': 'nhà cung cấp',
  'Cần máy chủ AladinWork để chào dịch vụ. Thử lại khi dịch vụ sống.': 'nhà cung cấp',
  'Danh sách mẫu dịch vụ cần máy chủ AladinWork.': 'nhà cung cấp',
  'Cần máy chủ AladinWork để tạo hợp đồng. Thử lại khi dịch vụ sống.': 'nhà cung cấp',
  'Danh bạ thợ cần máy chủ AladinWork. Sẽ hiện khi dịch vụ sống.': 'nhà cung cấp',
  'Người thuê (Aladin)': 'vai giao thức',
  'Aladin khoá cọc 300': 'vai giao thức — dữ liệu MẪU, "Aladin" đối "Genie"',
};

const namesIn = (s: string): boolean => APP_NAMES.some((n) => s.includes(n));

/** Mọi chuỗi có thể ra màn hình: khoá nguồn + mọi bản dịch, ở cả hai lối tra. */
function displayStrings(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  for (const [key, entry] of Object.entries(DICTIONARY)) {
    out.push({ where: key, text: key });
    for (const text of Object.values(entry)) {
      if (typeof text === 'string') out.push({ where: key, text });
    }
  }
  for (const [key, entry] of Object.entries(ALL_STRINGS)) {
    for (const text of Object.values(entry as Record<string, string>)) {
      if (typeof text === 'string') out.push({ where: key, text });
    }
  }
  return out;
}

it('phép quét tự kiểm — nó thật sự nhìn thấy chuỗi, và thấy đúng thứ đi tìm', () => {
  const all = displayStrings();
  expect(all.length).toBeGreaterThan(5000);
  // và nó phải bắt được ÍT NHẤT một mục trong danh sách đóng; nếu không thì hai
  // bài dưới xanh vì phép quét trả rỗng, không vì kho đã sạch.
  expect(all.some((s) => namesIn(s.text))).toBe(true);
});

it('không chuỗi hiển thị MỚI nào gọi thẳng tên app', () => {
  const offenders = [
    ...new Set(displayStrings().filter((s) => namesIn(s.text) && !FROZEN[s.where]).map((s) => s.where)),
  ];
  expect(offenders).toEqual([]);
});

it('danh sách đóng không phình, cũng không giữ tên đã vá xong', () => {
  const live = new Set(displayStrings().filter((s) => namesIn(s.text)).map((s) => s.where));
  const stale = Object.keys(FROZEN).filter((k) => !live.has(k));
  expect(stale).toEqual([]);
  expect(Object.keys(FROZEN)).toHaveLength(21);
});
