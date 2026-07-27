// config/useCapabilityLive.ts
//
// Hook phản ứng cho cổng runtime: component re-render khi cờ live của capability
// lật (sau probe khởi động / foreground). Dùng useState+useEffect (an toàn mọi
// phiên bản React, không phụ thuộc useSyncExternalStore của React 18).

import { useEffect, useState } from 'react';
import {
  subscribeRuntimeGate,
  isCapabilityLive,
  type GateCapability,
} from './runtimeGate';

export const useCapabilityLive = (cap: GateCapability): boolean => {
  const [live, setLive] = useState<boolean>(() => isCapabilityLive(cap));
  useEffect(() => {
    // Đồng bộ ngay khi mount (probe có thể đã xong trước khi component gắn).
    setLive(isCapabilityLive(cap));
    return subscribeRuntimeGate(() => setLive(isCapabilityLive(cap)));
  }, [cap]);
  return live;
};
