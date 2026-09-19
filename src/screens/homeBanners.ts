// screens/homeBanners.ts
//
// Nội dung BĂNG TRƯỢT của Trang chủ — tách khỏi `HomeScreen.tsx` vì nó nay là
// một phép DỰNG có nhánh, không còn là một mảng hằng.
//
// ── Băng cũ, và vì sao nó phải đổi ──────────────────────────────────────────
// Tới 2026-09-14 đây là ba tấm chữ trắng trên ba mảng màu phẳng, nội dung viết
// cứng. Nó đúng và nó chết: mở app ngày thứ một trăm vẫn đọc đúng ba câu của
// ngày thứ nhất, nên mắt học cách bỏ qua cả khu — một khối chiếm 140 px ngay
// dưới thanh trên mà không ai nhìn nữa.
//
// Tấm Truy xuất nay lấy TIN MỚI NHẤT từ `agriNewsService` (RSS Dân Việt, cùng
// nguồn mục tin của trang Tổng quan). Mỗi lần tin đổi là băng đổi.
//
// ── Bố cục: ẢNH → MÀU, không phải hai nửa ──────────────────────────────────
// Ảnh phủ từ mép trái, một dải chuyển sắc kéo nó tan vào màu module ở nửa phải,
// chữ nằm trên phần đã đặc màu. Không có đường thẳng nào chia đôi thẻ — chỗ
// giao nhau là một quãng chuyển, nên ảnh nào cũng ghép được, kể cả ảnh mà mép
// phải của nó bận chi tiết.
//
// ── Vì sao dựng ở đây chứ không ngay trong màn ─────────────────────────────
// Phần có thể sai của khu này không nằm ở chỗ vẽ mà ở chỗ CHỌN: tin nào, ảnh
// nào khi tin không có ảnh, chữ gì khi chưa tải được tin. Cả ba đều là nhánh,
// và nhánh trong một `renderItem` thì chỉ kiểm được bằng cách dựng cả màn.

import type { ImageSourcePropType } from 'react-native';

import { TRACE_THEME, CHAT_THEME, WORK_THEME } from '../theme';
import type { NewsItem } from '../services/agriNewsService';
import type { ModuleId } from '../navigation/moduleIds';
import { ENABLED_MODULES } from '../config/instance.config';

/**
 * Ảnh của từng tấm.
 *
 * ── THAY ẢNH Ở ĐÂY ─────────────────────────────────────────────────────────
 * Ba dòng dưới là chỗ duy nhất khai ảnh băng. Ảnh nên là ảnh CHỤP nằm ngang,
 * tỉ lệ quãng 16:9 trở lên, và phần bên PHẢI của ảnh nên trống — đó là phía
 * dải chuyển sắc nuốt vào màu, chi tiết đặt ở đó sẽ bị phủ mất.
 *
 * `trace` chỉ là đường lùi: khi có tin và tin có ảnh thì tấm Truy xuất dùng ảnh
 * CỦA TIN, không dùng tấm này.
 */
export const ANH_BANG: Record<'trace' | 'chat' | 'work', ImageSourcePropType> = {
  trace: require('../../assets/images/trace/backdrop-home.jpg'),
  // Tạm mượn hình minh hoạ của module. Xem `assets/images/banners/README.md`.
  //
  // ⚠️ Đuôi `.jpg` chứ không phải `.png`, và đó là phần bắt buộc: hai tệp này
  // mang byte JPEG. Đặt tên `.png` cho một tệp JPEG thì bản debug vẫn dựng được
  // (bản debug không nghiền ảnh) còn bản PHÁT HÀNH đỏ ở `aapt2` —
  // `file failed to compile` — tức lỗi chỉ lộ ở đúng lượt dựng đắt nhất.
  chat: require('../../assets/images/banners/chat-fi.jpg'),
  work: require('../../assets/images/banners/job-fi.jpg'),
};

/** Một tấm băng đã dựng xong — chỗ vẽ chỉ việc đọc, không còn nhánh nào. */
export interface TamBang {
  id: string;
  /** Tên module, in nhỏ phía trên tiêu đề: "Truy xuất" · "Trò chuyện" · … */
  module: string;
  /**
   * Module SỞ HỮU tấm này — khoá để lọc theo lời khai `modules` của app.
   *
   * Khai riêng chứ KHÔNG suy từ `route`, và đó là phần bắt buộc: tấm Truy xuất
   * khi có tin thì bỏ `route` và đi bằng `link` ra báo ngoài. Lọc theo `route`
   * thì đúng tấm ấy không có khoá để lọc, và một phép lọc trả kết quả hợp lệ
   * cho đúng thứ nó không đo được thì nó nói "đạt" bằng giọng của "tôi không
   * biết".
   */
  moduleId: ModuleId;
  title: string;
  sub: string;
/** Dòng chữ nhỏ dưới cùng — tên báo, ở tấm tin. */
  meta?: string;
  /** Màu đặc ở cuối dải chuyển sắc. */
  color: string;
  icon: string;
  image: ImageSourcePropType;
  /**
   * ẢNH CHỤP hay HÌNH VẼ — quyết định cách lấp khung, và đây là một khác biệt
   * thật chứ không phải một nhãn.
   *
   * Khung ảnh của băng nằm ngang (tỉ lệ quãng 2:1). Ảnh chụp thì lấp đầy khung
   * và cắt bớt phần thừa (`cover`) là đúng: ảnh chụp có nền, cắt vào nền không
   * mất gì.
   *
   * Hình vẽ minh hoạ của app lại VUÔNG (2000×2000) và nền trong suốt. Lấp đầy
   * một khung 2:1 bằng một hình vuông là phóng nó lên gấp đôi rồi cắt mất một
   * nửa chiều cao — nhân vật bị cắt ngang ngực, và cái đọc ra là "ảnh bị zoom
   * quá mức". Hình vẽ vì thế phải `contain`: vào TRỌN trong khung, phần thừa
   * để lộ màu thẻ — mà nền nó vốn trong suốt nên chỗ ấy không hở ra gì cả.
   */
  kieu: 'anh' | 'hinh';
  /** Bấm vào thì đi đâu: một route của app, hoặc một địa chỉ ngoài. */
  route?: string;
  link?: string;
}

/**
 * Chữ của tấm Truy xuất khi CHƯA có tin — chưa tải xong, hoặc tải hỏng.
 *
 * Nói về chính tính năng, không nói "đang tải". Một băng trượt tự động mà đứng
 * ở "Đang tải tin…" thì người dùng đọc ra một màn hỏng; mà chờ tin về mới hiện
 * băng thì khu này nhảy chỗ giữa lúc người ta đang bấm.
 */
const TRUY_XUAT_TINH = {
  title: 'Truy xuất sầu riêng tới từng trái',
  sub: 'Định danh blockchain Cardano',
};

/**
 * Dựng ba tấm băng.
 *
 * `tin` là tin MỚI NHẤT đã chọn sẵn ở nơi gọi, hoặc `null` khi chưa có.
 *
 * `now` KHÔNG còn được dùng — nó vào đây để dựng dòng "2 giờ trước", mà dòng ấy
 * đã bỏ. Giữ lại tham số để nơi gọi không phải sửa, và để lúc nào cần hiện lại
 * tuổi tin thì không phải luồn một đồng hồ qua ba tầng lần nữa.
 */
export function dungBang(tin: NewsItem | null, _now = Date.now()): TamBang[] {
  return allBanners(tin).filter(b => ENABLED_MODULES.includes(b.moduleId));
}

/**
 * Ba tấm ĐẦY ĐỦ, chưa lọc theo app đang dựng.
 *
 * Tách ra để bài kiểm so được HAI CỰC: tập đầy đủ, và tập sau lọc. Một bài chỉ
 * đọc `dungBang()` thì không phân biệt được "đã lọc đúng" với "vốn chỉ có ngần
 * ấy tấm" — nó xanh ở cả hai cực, tức nó không kiểm gì.
 */
export function allBanners(tin: NewsItem | null): TamBang[] {
  return [
    {
      id: 'b1',
      module: TRACE_THEME.name,
      moduleId: 'trace',
      title: tin ? tin.title : TRUY_XUAT_TINH.title,
      /**
       * CÓ TIN thì tấm này KHÔNG mang dòng tóm tắt.
       *
       * Tóm tắt RSS là câu mở đầu của bài — nó lặp lại ý của tiêu đề bằng chữ
       * nhỏ hơn, tức trả thêm hai dòng để nói lại điều vừa nói.
       *
       * Chưa có tin thì câu tĩnh của module vẫn giữ: nó không lặp tiêu đề, nó
       * nói thêm một vế khác ("Định danh blockchain Cardano").
       */
      sub: tin ? '' : TRUY_XUAT_TINH.sub,
      /**
       * TÊN BÁO ở dòng cuối.
       *
       * Đây là thứ phân biệt một tấm băng tin với một tấm băng quảng cáo: chữ
       * trên tấm này không phải lời của app, và người đọc có quyền biết ai viết
       * nó trước khi bấm. Chuỗi `source` đã gồm cả chuyên mục
       * ("Dân Việt · Nhà nông") vì nó dựng từ bảng nguồn của `agriNewsService`.
       */
      meta: tin ? tin.source : undefined,
      color: TRACE_THEME.primary,
      icon: 'leaf-circle-outline',
      // Ảnh của tin trước, ảnh nền của module sau. Tin không ảnh là chuyện
      // thường ở RSS, và một tấm băng trống ảnh thì mất luôn nửa bố cục.
      image: tin?.imageUrl ? { uri: tin.imageUrl } : ANH_BANG.trace,
      // Cả hai nhánh đều là ảnh chụp: ảnh của bài báo, và tấm nền vườn dâu.
      kieu: 'anh',
      // Có tin thì mở đúng bài; không có thì về mục tin của module.
      link: tin?.link,
      route: tin ? undefined : 'TraceNews',
    },
    {
      id: 'b2',
      module: CHAT_THEME.name,
      moduleId: 'chat',
      title: 'Tính năng Trò chuyện sắp ra mắt',
      // Chữ giữ NGUYÊN văn bản của băng cũ. Tấm này đổi bố cục, không đổi điều
      // nó hứa: mọi câu ở đây đều phải là thứ tính năng đang làm được thật.
      sub: 'Tin nhắn xác thực bằng chữ ký',
      color: CHAT_THEME.primary,
      icon: 'message-text-outline',
      image: ANH_BANG.chat,
      // Đang là hình vẽ vuông. Thay bằng ảnh chụp ngang thì đổi sang `'anh'` —
      // xem `assets/images/banners/README.md`.
      kieu: 'hinh',
      route: 'ChatHome',
    },
    {
      id: 'b3',
      module: WORK_THEME.name,
      moduleId: 'work',
      title: 'Tìm việc · Đặt thợ mọi lĩnh vực',
      sub: 'Hợp đồng số · Ký quỹ blockchain',
      color: WORK_THEME.primary,
      icon: 'briefcase-search-outline',
      image: ANH_BANG.work,
      kieu: 'hinh',
      route: 'WorkHome',
    },
  ];
}
