// hooks/useOffline.ts
//
// Tín hiệu OFFLINE dùng chung cho lớp trạng thái (INTEGRATION-STANDARD §7.3).
// Dùng CÙNG nguồn NetInfo mà navigation/index.tsx đã dùng để drain sync queue
// — không thêm package, không định nghĩa lại "offline" rời rạc giữa các màn.
//
// Quy ước "online" giữ y hệt navigation:
//   isConnected === true && isInternetReachable !== false
// (isInternetReachable có thể null lúc chưa rõ → coi như còn online, tránh
//  chớp UI offline sai khi mới mở app).

import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let mounted = true;
    NetInfo.fetch().then((state) => {
      if (!mounted) return;
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOffline(!online);
    });
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setOffline(!online);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return offline;
}
