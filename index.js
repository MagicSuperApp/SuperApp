/**
 * @format
 */

// CRASH REPORTER — PHẢI đầu tiên: gắn global JS error handler + ping "app_boot"
// về remoteLogger, để crash lúc khởi động không còn im lặng (màn hình trắng).
import './src/config/crashReporter';

// YC-3 BOOTSTRAP THEME — PHẢI (gần) ĐẦU TIÊN. Side-effect của module này gọi
// setActiveThemeConfig() trước khi cây import App chạm design token (YC-1:
// stylesheet đọc token lúc import top-level). ES import chạy theo thứ tự xuất
// hiện, nên dòng này đứng trên `import App` để theme resolve trước.
import './src/config/bootstrap';

import React from 'react';
import { AppRegistry } from 'react-native';
import App from './App';
import RootErrorBoundary from './src/components/RootErrorBoundary';
import { name as appName } from './app.json';

// Bọc App: lỗi RENDER sẽ HIỆN LÊN MÀN HÌNH (không còn trắng câm) + báo remoteLogger.
function Root() {
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

AppRegistry.registerComponent(appName, () => Root);
