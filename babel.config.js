module.exports = {
  // GIỮ preset RN gốc (KHÔNG đổi sang 'babel-preset-expo' như install-expo-modules
  // tự sửa): app này là bare RN, chỉ mượn expo-modules-core để chạy expo-gl cho
  // 3D. Đổi preset toàn app = rủi ro cho dotenv/worklets mà không đổi lại gì.
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // three.js (bản ESM) dùng KHỐI KHỞI-TẠO TĨNH `static { … }`. Preset RN chưa
    // hiểu cú pháp này → metro gãy ngay ở `class Vector2`. Thêm plugin để dịch.
    '@babel/plugin-transform-class-static-block',
    ['module:react-native-dotenv', {
      moduleName: '@env',
      path: '.env'
    }]
  ],
};
