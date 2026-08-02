/**
 * @format
 */

// CRASH REPORTER — PHẢI đầu tiên: gắn global JS error handler + ping "app_boot"
// về remoteLogger. Nếu "app_boot" TỚI server = JS bundle ĐÃ nạp & chạy.
import './src/config/crashReporter';

import React from 'react';
import { AppRegistry, ScrollView, Text } from 'react-native';
import { name as appName } from './app.json';
import rLog from './src/services/remoteLogger';

// Nạp bootstrap + App Ở RENDER-TIME trong try/catch. Lý do: nếu CÂY import App
// (screen/service/native module) NÉM lỗi lúc eval trên bản release/Hermes (máy thật
// signed) → trước đây `import App` top-level ném → AppRegistry chưa đăng ký → MÀN
// TRẮNG CÂM, RootErrorBoundary không kịp mount nên không bắt được. Đưa require vào
// Root(): lỗi eval được BẮT và HIỆN LÊN MÀN HÌNH (chụp là biết) + báo remoteLogger.
function Root() {
  try {
    // bootstrap theme PHẢI chạy trước khi App (→ screens) đọc design token.
    require('./src/config/bootstrap');
    const App = require('./App').default;
    const RootErrorBoundary = require('./src/components/RootErrorBoundary').default;
    return (
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    );
  } catch (e) {
    const msg = (e && e.message) || String(e);
    const stack = String((e && e.stack) || '').slice(0, 4000);
    try {
      rLog.error('js_boot_import_error', { message: msg, stack });
    } catch (_) {
      // ignore
    }
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#fff' }}
        contentContainerStyle={{ padding: 24, paddingTop: 80 }}
      >
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#c0392b' }}>
          Lỗi nạp ứng dụng
        </Text>
        <Text style={{ marginTop: 12, fontSize: 14, color: '#222' }}>{msg}</Text>
        <Text style={{ marginTop: 16, fontSize: 11, color: '#666' }}>
          {stack.slice(0, 1500)}
        </Text>
      </ScrollView>
    );
  }
}

AppRegistry.registerComponent(appName, () => Root);
