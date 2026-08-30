// modules/chat/features/chat/components/Avatar.tsx
//
// Ảnh đại diện cho phòng và cho người. Có ảnh thì hiện ảnh, không có thì hiện
// chữ cái đầu trên nền màu lấy theo tên — cùng một tên luôn ra cùng một màu, nên
// người dùng nhận ra phòng bằng màu trước cả khi đọc chữ.

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { AVATAR_TONES } from '../../../../../theme';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { STROKE } from '../../../theme/fluent';

/** Bảng sắc độ sống ở `theme/tokens.ts` (YC-1) — đây chỉ chọn một sắc theo tên. */
const TONES = AVATAR_TONES;

const toneFor = (seed: string): string => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

interface Props {
  name: string;
  uri?: string;
  size?: number;
  /** Chấm xanh góc dưới khi người đó đang có mặt. */
  online?: boolean;
  /** Bo góc. Mặc định bo mềm kiểu Fluent, không tròn hẳn. */
  radius?: number;
}

const Avatar: React.FC<Props> = ({ name, uri, size = 48, online, radius }) => {
  const r = radius ?? Math.round(size * 0.34);
  const tone = toneFor(name || '?');

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: size,
            height: size,
            borderRadius: r,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: STROKE.outer,
          }}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: r,
              backgroundColor: withAlpha(tone, 0.16),
              borderColor: withAlpha(tone, 0.34),
            },
          ]}
        >
          <Text style={[styles.initials, { color: tone, fontSize: size * 0.36 }]}>
            {initialsOf(name)}
          </Text>
        </View>
      )}
      {online && (
        <View
          style={[
            styles.dot,
            { width: size * 0.26, height: size * 0.26, borderRadius: size * 0.13 },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  initials: { fontWeight: '700' },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    backgroundColor: NEUTRAL.success,
    borderWidth: 2,
    borderColor: NEUTRAL.white,
  },
});

export default Avatar;
