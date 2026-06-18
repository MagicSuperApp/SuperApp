/**
 * @format
 */

// YC-3 BOOTSTRAP THEME — PHẢI là import ĐẦU TIÊN. Side-effect của module này
// gọi setActiveThemeConfig() trước khi cây import App chạm design token (YC-1:
// stylesheet đọc token lúc import top-level). ES import chạy theo thứ tự xuất
// hiện, nên dòng này đứng trên `import App` để theme resolve trước.
import './src/config/bootstrap';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
