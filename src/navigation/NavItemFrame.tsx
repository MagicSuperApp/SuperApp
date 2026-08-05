// navigation/NavItemFrame.tsx
//
// FRAME CHUẨN cho MỘT ô tab dưới — song ngữ (EN chuẩn trên · quốc gia dưới).
// Thuần trình bày (presentational): nhận route + trạng thái, tự tra NAV_FRAME.
// Thêm dịch vụ KHÔNG đụng file này — chỉ thêm 1 dòng vào NAV_FRAME (navLabels.ts).
//
// Kích thước cố định để mọi tab CÂN NHAU (icon 24 · EN 11/đậm · quốc gia 9/nhạt),
// khớp chiều cao thanh TAB_BAR_HEIGHT=64. Đổi số ở NAV_FRAME_DIMS = đổi đồng loạt.

import * as React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Icon } from '../components/Icon';
import { navEn, navNational, navIcon } from './navLabels';
import { useNationalLanguage } from '../i18n/useNationalLanguage';

export const NAV_FRAME_DIMS = {
  iconSize: 24,
  enSize: 11, // EN — nhãn chuẩn (dòng trên)
  nationalSize: 11, // ngôn ngữ quốc gia (dòng dưới) — 9pt cũ đọc không nổi ngoài nắng
  avatarSize: 24, // đường kính avatar (khớp iconSize để cân với các tab khác)
} as const;

// Nhãn nav TỪNG khoá cứng allowFontScaling={false} → người lớn tuổi chỉnh cỡ chữ
// hệ thống to lên vẫn không đọc được thanh điều hướng. Nay cho phóng nhưng chặn
// trần 1.3 để 6 ô không vỡ hàng.
const NAV_FONT_SCALE_MAX = 1.3;

interface Props {
  route: string;
  focused: boolean;
  /** Màu khi tab đang mở. */
  tint: string;
  /** Màu khi tab nghỉ (mờ). */
  dimTint: string;
  /**
   * Ảnh đại diện user (vd tab "Me/Tôi"). Có uri → vẽ ảnh tròn thay icon.
   * Không có → dùng `initials`; không có nốt → về icon mặc định của route.
   */
  avatarUri?: string;
  /** Chữ viết tắt tên (fallback khi chưa có ảnh), vd "AL". */
  initials?: string;
}

const NavItemFrame: React.FC<Props> = ({ route, focused, tint, dimTint, avatarUri, initials }) => {
  // Đăng ký nghe đổi ngôn ngữ: `navNational` chỉ đọc giá trị hiện tại, React không tự
  // biết nó đổi. Thiếu dòng này thì đổi ngôn ngữ xong thanh dưới vẫn giữ chữ cũ cho tới
  // khi màn tình cờ vẽ lại — người dùng sẽ bấm đi bấm lại vì tưởng hụt.
  const lang = useNationalLanguage();
  const color = focused ? tint : dimTint;
  const isAvatarTab = !!avatarUri || !!initials;
  return (
    <View style={styles.frame}>
      {isAvatarTab ? (
        <View style={[styles.avatar, { borderColor: color, opacity: focused ? 1 : 0.75 }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
          ) : (
            <Text style={[styles.avatarInitials, { color }]} allowFontScaling={false}>
              {initials}
            </Text>
          )}
        </View>
      ) : (
        <Icon name={navIcon(route, focused)} size={NAV_FRAME_DIMS.iconSize} color={color} />
      )}
      <Text
        style={[styles.en, { color, fontWeight: focused ? '700' : '600' }]}
        numberOfLines={1}
        maxFontSizeMultiplier={NAV_FONT_SCALE_MAX}
      >
        {navEn(route)}
      </Text>
      <Text style={[styles.national, { color }]} numberOfLines={1} maxFontSizeMultiplier={NAV_FONT_SCALE_MAX}>
        {navNational(route, lang)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  en: {
    fontSize: NAV_FRAME_DIMS.enSize,
    lineHeight: NAV_FRAME_DIMS.enSize + 3,
    letterSpacing: 0.1,
  },
  national: {
    fontSize: NAV_FRAME_DIMS.nationalSize,
    lineHeight: NAV_FRAME_DIMS.nationalSize + 2,
    letterSpacing: -0.1,
    opacity: 0.9,
  },
  avatar: {
    width: NAV_FRAME_DIMS.avatarSize,
    height: NAV_FRAME_DIMS.avatarSize,
    borderRadius: NAV_FRAME_DIMS.avatarSize / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 10,
    fontWeight: '800',
  },
});

export default NavItemFrame;
