// components/state/StateView.tsx
//
// Component tái dùng phủ 4 TRẠNG THÁI bắt buộc (INTEGRATION-STANDARD §7.3):
//   loading | empty | offline | error
//
// Token-driven (YC-1): mọi màu/khoảng-cách qua useTheme() + useAdaptive().
// KHÔNG hardcode hex. KHÔNG lộ lỗi kỹ thuật ra UI (OriLife §5 — thông điệp
// thân thiện; chi tiết kỹ thuật chỉ vào console).
//
// Dùng:
//   if (loading) return <StateView status="loading" />;
//   if (offline) return <StateView status="offline" onRetry={reload} />;
//   if (error)   return <StateView status="error" onRetry={reload} />;
//   <FlatList ... ListEmptyComponent={<StateView status="empty" message="..."
//             actionLabel="Thêm" onAction={add} />} />
//
// Loading mặc định = Skeleton (KHÔNG spinner trắng vô định). Caller có thể
// truyền skeleton riêng qua `loadingSkeleton`.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../theme';
import { useAdaptive } from '../../theme/adaptive';
import Skeleton from './Skeleton';

export type StateStatus = 'loading' | 'empty' | 'offline' | 'error';

interface StateViewProps {
  status: StateStatus;
  // Thông điệp người-đọc-được (đè default theo status).
  title?: string;
  message?: string;
  // Hành động chính (empty: gợi ý tạo; offline/error: thử lại).
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  // Tuỳ biến loading: số dòng skeleton hoặc node tự dựng.
  loadingLines?: number;
  loadingSkeleton?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Văn bản mặc định thân thiện theo từng trạng thái (KHÔNG lộ lỗi kỹ thuật).
const DEFAULTS: Record<
  Exclude<StateStatus, 'loading'>,
  { icon: string; title: string; message: string; action?: string }
> = {
  empty: {
    icon: 'inbox-outline',
    title: 'Chưa có dữ liệu',
    message: 'Khi có nội dung, nó sẽ hiện ở đây.',
  },
  offline: {
    icon: 'wifi-off',
    title: 'Đang ngoại tuyến',
    message:
      'Thiết bị mất kết nối. Bạn vẫn xem được dữ liệu đã tải; thao tác mới sẽ tự đồng bộ khi có mạng.',
    action: 'Thử lại',
  },
  error: {
    icon: 'alert-circle-outline',
    title: 'Chưa tải được',
    message: 'Có trục trặc khi tải dữ liệu. Vui lòng thử lại.',
    action: 'Thử lại',
  },
};

const StateView: React.FC<StateViewProps> = ({
  status,
  title,
  message,
  onRetry,
  onAction,
  actionLabel,
  loadingLines = 4,
  loadingSkeleton,
  style,
}) => {
  const theme = useTheme();
  const adaptive = useAdaptive();

  if (status === 'loading') {
    return <>{loadingSkeleton ?? <Skeleton lines={loadingLines} style={style} />}</>;
  }

  const d = DEFAULTS[status];
  const heading = title ?? d.title;
  const body = message ?? d.message;
  const onPress = onAction ?? onRetry;
  const label = actionLabel ?? d.action;

  // Màu nhấn theo trạng thái — đều lấy từ token (không hex).
  const accent =
    status === 'error'
      ? theme.app.error
      : status === 'offline'
        ? theme.app.warning
        : theme.app.accent;

  const pad = Math.round(36 * adaptive.spacingScale);
  const styles = makeStyles(theme, accent, pad);

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.iconWrap}>
        <Icon name={d.icon} size={44} color={accent} />
      </View>
      <Text style={styles.title}>{heading}</Text>
      <Text style={styles.body}>{body}</Text>
      {onPress && label ? (
        <TouchableOpacity style={styles.btn} onPress={onPress} activeOpacity={0.85}>
          {status !== 'empty' ? (
            <Icon name="refresh" size={16} color={theme.app.white} />
          ) : (
            <Icon name="plus" size={16} color={theme.app.white} />
          )}
          <Text style={styles.btnText}>{label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const makeStyles = (
  theme: ReturnType<typeof useTheme>,
  accent: string,
  pad: number,
) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: pad,
      paddingVertical: 48,
    },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: theme.app.accentGlow,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.app.text,
      marginBottom: 8,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    body: {
      fontSize: 14,
      color: theme.app.textMuted,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 24,
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: accent,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 14,
    },
    btnText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.app.white,
      letterSpacing: 0.2,
    },
  });

export default StateView;
