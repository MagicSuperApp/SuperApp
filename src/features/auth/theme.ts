// features/auth/theme.ts
//
// Bảng màu blue dùng cho toàn bộ luồng đăng nhập / đăng ký.
// Khớp với LoginScreen để tạo cảm giác liền mạch.

export const AUTH_BLUE = {
  deep:     '#152B5A',
  primary:  '#2C5BC4',
  mid:      '#4D7DD6',
  light:    '#7DA9E8',
  pale:     '#B9D2F0',
  white:    '#FFFFFF',
  glow:     'rgba(125, 169, 232, 0.35)',
  glowSoft: 'rgba(185, 210, 240, 0.25)',
  bgSoft:   '#F4F7FB',
  border:   '#E5EAF2',
  text:     '#0F1A2E',
  textSub:  '#4B5872',
  textMuted:'#8A95A8',
} as const;

/**
 * Tông cảnh báo của luồng đăng nhập — khối "bạn sẽ mất gì" ở cửa vào.
 *
 * Để ở đây chứ không gõ thẳng vào màn: `Integration-Standard.md §2.1` cấm màu gõ
 * cứng trong mã module, và lý do thực dụng là app này dựng ra NHIỀU app từ một cây
 * mã (`instances/`). Bốn giá trị nằm rải trong một tệp màn hình thì đổi chủ đề cho
 * app khác sẽ bỏ sót đúng khối này, và người dùng CheckFarm gặp một mảng cam của
 * Aladin giữa màn xanh của mình.
 */
export const AUTH_WARN = {
  icon:   '#B07D2F',
  bg:     '#FFF6E6',
  border: '#F0DBB5',
  text:   '#6F4720',
} as const;
