// services/analytics/TrackedButton.tsx

import React, { useCallback } from 'react';
import {
  GestureResponderEvent,
  TouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';
import analyticsService from './analyticsService';
import { TrackOptions } from './types';

export interface TrackedButtonProps extends TouchableOpacityProps {
  /** Màn hình chứa nút (bắt buộc — để biết thao tác ở màn nào). */
  screen: string;
  /** Định danh nút (vd "login_button"). */
  target: string;
  /** Tên chức năng nút thực hiện (vd "submit_login"). */
  action?: string;
  /** Metadata bổ sung gửi kèm. */
  trackMeta?: Record<string, any>;
  /**
   * true nếu nút này dẫn tới mở/điều hướng sang màn hình khác → tự động đo
   * độ trễ mở màn hình (screen_open_latency). Mặc định false (chỉ ghi tap).
   */
  navigates?: boolean;
}

/**
 * TouchableOpacity tự ghi nhận lần nhấn (và độ trễ mở màn hình nếu navigates).
 * Dùng thay TouchableOpacity ở những nút quan trọng để có tracking "miễn phí".
 */
const TrackedButton: React.FC<TrackedButtonProps> = ({
  screen,
  target,
  action,
  trackMeta,
  navigates = false,
  onPress,
  children,
  ...rest
}) => {
  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      const opts: TrackOptions = { action, metadata: trackMeta };
      if (navigates) {
        analyticsService.trackPress(screen, target, opts);
      } else {
        analyticsService.trackTap(screen, target, opts);
      }
      onPress?.(e);
    },
    [screen, target, action, trackMeta, navigates, onPress],
  );

  return (
    <TouchableOpacity {...rest} onPress={handlePress}>
      {children}
    </TouchableOpacity>
  );
};

export default TrackedButton;
