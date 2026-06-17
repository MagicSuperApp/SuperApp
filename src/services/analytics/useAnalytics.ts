// services/analytics/useAnalytics.ts

import { useCallback, useMemo } from 'react';
import analyticsService from './analyticsService';
import { TrackOptions } from './types';

/**
 * Hook tiện dụng để gắn tracking thủ công vào một màn hình.
 *
 * Truyền tên màn hình một lần, sau đó mọi thao tác đã gắn sẵn screen:
 *
 *   const { trackTap, trackInput, trackAction, trackPress } = useAnalytics('LoginScreen');
 *
 *   <TextInput onChangeText={t => { setPhone(t); trackInput('phone_input', t); }} />
 *   <Button onPress={() => { trackPress('login_button', { action: 'submit_login' }); doLogin(); }} />
 *   // trackPress vừa ghi nhận nút bấm, vừa đo độ trễ tới màn hình kế tiếp.
 */
export function useAnalytics(screen: string) {
  const trackTap = useCallback(
    (target: string | null, opts?: TrackOptions) =>
      analyticsService.trackTap(screen, target, opts),
    [screen],
  );

  const trackInput = useCallback(
    (target: string, value: unknown, opts?: TrackOptions) =>
      analyticsService.trackInput(screen, target, value, opts),
    [screen],
  );

  const trackAction = useCallback(
    (action: string, opts?: TrackOptions) =>
      analyticsService.trackAction(screen, action, opts),
    [screen],
  );

  const trackPress = useCallback(
    (target: string, opts?: TrackOptions) =>
      analyticsService.trackPress(screen, target, opts),
    [screen],
  );

  return useMemo(
    () => ({ trackTap, trackInput, trackAction, trackPress }),
    [trackTap, trackInput, trackAction, trackPress],
  );
}

export default useAnalytics;
