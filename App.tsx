/**
 * Aladin App
 */

import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation';
import AlertProvider from './src/components/AlertProvider';
import { loadTreeDedupCache } from './src/services/treeDedupCache';
import { flushVideoUploadQueue } from './src/services/videoUploadQueue';
import analytics from './src/services/analytics';
import {
  bootstrapRuntimeGate,
  refreshRuntimeGate,
} from './src/config/runtimeGateBootstrap';

function App() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Build 58 (2026-05-26): warm-load tree dedup cache từ AsyncStorage.
    // Fire-and-forget — UI không cần đợi cache load xong; scan đầu trước
    // khi cache loaded sẽ skip dedup check (safe default — không tạo bug
    // mới, chỉ degrade graceful).
    void loadTreeDedupCache();

    // Khởi động hệ thống thu thập hành vi người dùng (fire-and-forget).
    void analytics.init();

    // Cổng runtime: probe /health mỗi module → tự bật khi backend sống, khỏi
    // build lại (fire-and-forget; default mock tới khi probe 2xx).
    void bootstrapRuntimeGate();

    // Hàng đợi gửi video bền: mở lại app → thử gửi những clip còn kẹt từ buổi
    // trước (mạng rớt / stored=false). Fire-and-forget; tự bỏ qua nếu offline.
    void flushVideoUploadQueue();

    // Mỗi lần app quay lại foreground = một phiên mới; vào background thì chốt
    // thời gian xem màn hình cuối và đẩy dữ liệu còn tồn lên server.
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      if (prev.match(/inactive|background/) && next === 'active') {
        analytics.startSession();
        // Quay lại foreground → probe lại: backend vừa được sửa sẽ tự bật.
        refreshRuntimeGate();
        // …và thử gửi lại clip video còn kẹt (mạng có thể vừa phục hồi).
        void flushVideoUploadQueue();
      } else if (prev === 'active' && next.match(/inactive|background/)) {
        analytics.endSession();
      }
      appState.current = next;
    });

    return () => {
      sub.remove();
      analytics.stop();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AlertProvider>
        <StatusBar barStyle="light-content" />
        <AppNavigator />
      </AlertProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({});

export default App;
