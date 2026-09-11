// features/auth/theme.ts
//
// CON TRỎ, không phải nguồn. Giá trị thật nằm ở `theme/tokens.ts`
// (`AUTH_TOKENS`) và đi qua `theme/index.ts` để từng app ghi đè được
// (`ThemeConfig.auth`).
//
// ── Vì sao tệp này không còn giữ hex ────────────────────────────────────────
// Tới 2026-09-11 đây là một object literal gõ cứng tên `AUTH_BLUE`, mở đầu bằng
// câu "Bảng màu blue dùng cho toàn bộ luồng đăng nhập / đăng ký". Bốn màn cửa
// vào đọc thẳng nó, nên toàn bộ quãng người dùng gặp ĐẦU TIÊN đứng NGOÀI tầng
// chủ đề: app thứ hai đổi được mọi màn phía sau mà không đổi được cửa vào.
//
// Chú thích cũ của `AUTH_WARN` đã nói đúng luật (`Integration-Standard §2.1`
// cấm màu gõ cứng trong mã module) và nêu đúng ca hỏng — "người dùng CheckFarm
// gặp một mảng cam của Aladin giữa màn xanh của mình". Nó chỉ áp luật cho BỐN
// giá trị cảnh báo, còn mười ba giá trị lam ngay phía trên thì không. Đây là
// mẫu quen: rào dựng đúng chỗ vừa bị đau, không dựng ở chỗ cùng loại nằm cạnh.
//
// Hai tên dưới đây GIỮ NGUYÊN để bốn màn không phải sửa hàng loạt; chúng trỏ
// tới chính đối tượng sống mà `setActiveThemeConfig` ghi đè tại chỗ.

import { AUTH_COLORS } from '../../theme';

/**
 * Bảng màu luồng vào. Tên giữ chữ `BLUE` vì 99 chỗ gọi ở 4 tệp đang dùng
 * (đếm 2026-09-11: `grep -rho 'AUTH_BLUE\.' src/features/auth/{screens,components}`), nhưng nó
 * KHÔNG còn nhất thiết là lam: app nào ghi đè `ThemeConfig.auth` thì đây là
 * bảng của app đó (CheckFarm đang là xanh lục).
 */
export const AUTH_BLUE = AUTH_COLORS;

/** Tông cảnh báo của luồng vào — khối "bạn sẽ mất gì" ở cửa vào. */
export const AUTH_WARN = {
  get icon() {
    return AUTH_COLORS.warnIcon;
  },
  get bg() {
    return AUTH_COLORS.warnBg;
  },
  get border() {
    return AUTH_COLORS.warnBorder;
  },
  get text() {
    return AUTH_COLORS.warnText;
  },
};
