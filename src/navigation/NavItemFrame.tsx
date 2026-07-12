// navigation/NavItemFrame.tsx
//
// FRAME CHUẨN cho MỘT ô tab dưới — song ngữ (EN chuẩn trên · quốc gia dưới).
// Thuần trình bày (presentational): nhận route + trạng thái, tự tra NAV_FRAME.
// Thêm dịch vụ KHÔNG đụng file này — chỉ thêm 1 dòng vào NAV_FRAME (navLabels.ts).
//
// Kích thước cố định để mọi tab CÂN NHAU (icon 24 · EN 11/đậm · quốc gia 9/nhạt),
// khớp chiều cao thanh TAB_BAR_HEIGHT=64. Đổi số ở NAV_FRAME_DIMS = đổi đồng loạt.

import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { navEn, navNational, navIcon } from './navLabels';

export const NAV_FRAME_DIMS = {
  iconSize: 24,
  enSize: 11, // EN — nhãn chuẩn (dòng trên)
  nationalSize: 9, // ngôn ngữ quốc gia (dòng dưới)
} as const;

interface Props {
  route: string;
  focused: boolean;
  /** Màu khi tab đang mở. */
  tint: string;
  /** Màu khi tab nghỉ (mờ). */
  dimTint: string;
}

const NavItemFrame: React.FC<Props> = ({ route, focused, tint, dimTint }) => {
  const color = focused ? tint : dimTint;
  return (
    <View style={styles.frame}>
      <Icon name={navIcon(route, focused)} size={NAV_FRAME_DIMS.iconSize} color={color} />
      <Text
        style={[styles.en, { color, fontWeight: focused ? '700' : '600' }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {navEn(route)}
      </Text>
      <Text style={[styles.national, { color }]} numberOfLines={1} allowFontScaling={false}>
        {navNational(route)}
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
});

export default NavItemFrame;
