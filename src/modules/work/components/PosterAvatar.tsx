// modules/work/components/PosterAvatar.tsx
//
// Ảnh đại diện người đăng việc / Genie. Có ảnh thật từ dây thì hiện ảnh; KHÔNG
// có thì vẽ vòng chữ cái đầu NGAY TẠI MÁY.
//
// Vì sao không dùng dịch vụ sinh ảnh: bản trước dựng
// `https://i.pravatar.cc/150?u=<DID>` làm ảnh thay thế, tức DID PhoenixKey của
// người dùng bị gửi sang máy chủ bên thứ ba trong query string mỗi lần mở danh
// sách việc, rồi nằm lại trong log của họ. Không có ảnh thì vẽ tại máy, không
// gọi mạng, không mang định danh đi đâu.

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '../../../constants';

/** Sắc màu suy từ tên hiển thị — tính tại máy, ổn định giữa các lần mở. */
const hueOf = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
};

const initialOf = (name: string): string => {
  const c = name.trim().charAt(0);
  return c ? c.toUpperCase() : '?';
};

interface Props {
  /** Đường dẫn ảnh THẬT từ dây. Rỗng/không phải http ⇒ vẽ chữ cái đầu. */
  uri?: string;
  /** Tên hiển thị — dùng lấy chữ cái đầu và sắc màu nền. */
  name: string;
  /** Style vòng tròn (đã có width/height/borderRadius ở màn gọi). */
  style?: StyleProp<ViewStyle>;
  /** Cỡ chữ của chữ cái đầu. */
  fontSize?: number;
}

const PosterAvatar: React.FC<Props> = ({ uri, name, style, fontSize = 12 }) => {
  if (uri) return <Image source={{ uri }} style={style as never} />;
  const hue = hueOf(name || '?');
  return (
    <View
      style={[
        styles.fallback,
        style,
        { backgroundColor: `hsl(${hue}, 45%, 88%)` },
      ]}
    >
      <Text style={[styles.letter, { fontSize, color: `hsl(${hue}, 55%, 32%)` }]}>
        {initialOf(name)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.divider },
  letter: { fontWeight: '800' },
});

export default PosterAvatar;
