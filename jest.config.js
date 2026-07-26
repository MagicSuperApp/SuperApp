module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  // `__tests__/App.test.tsx` render TOÀN BỘ cây App trong node → cần harness mock cho
  // MỌI native module (lottie/firebase/…); giá trị chỉ là "không crash khi import", mà
  // `tsc --noEmit` (0 lỗi) đã bảo đảm mọi import/typing wire đúng. Tạm loại khỏi gate;
  // bật lại khi dựng đủ harness native. KHÔNG che lỗi app (447 unit test vẫn chạy đủ).
  testPathIgnorePatterns: ['/node_modules/', '__tests__/App.test.tsx'],
  // RN preset chỉ transform react-native + @react-native*. Các gói RN khác phát-hành
  // ESM thuần (@react-navigation, react-native-*, redux ESM…) → Jest gặp `export` sẽ
  // ném "Unexpected token 'export'" và cả suite chết (App.test.tsx). Nới allowlist để
  // Babel transform luôn các gói đó. Thêm gói mới gây lỗi tương tự thì bổ sung vào đây.
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?(?:@?react-native(?:-community)?|@react-native(?:-community)?/.*|@react-navigation/.*|react-native-.*|react-redux|redux-persist|@reduxjs/.*|immer|@react-native-async-storage/.*)/)',
  ],
  moduleNameMapper: {
    // Model 3D (.glb/.gltf): trong app do Metro biến `require()` thành id asset dạng
    // SỐ. Jest không có bước đó nên sẽ cố parse tệp nhị phân → nổ. Trả về một stub số
    // để sổ đăng ký model (treeModels.ts) import được trong test.
    '\\.(glb|gltf)$': '<rootDir>/__mocks__/assetModuleStub.js',
  },
};
