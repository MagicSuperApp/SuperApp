module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  // `__tests__/App.test.tsx` render TOÀN BỘ cây App trong node → cần harness mock cho
  // MỌI native module (lottie/firebase/…); giá trị chỉ là "không crash khi import", mà
  // `tsc --noEmit` (0 lỗi) đã bảo đảm mọi import/typing wire đúng. Tạm loại khỏi gate;
  // bật lại khi dựng đủ harness native. KHÔNG che lỗi app (447 unit test vẫn chạy đủ).
  // `Legacy/` = mã/tài-liệu ĐÃ VỀ HƯU (xem Legacy/README.md). Đo được: trước khi
  // dọn, jest chạy 7 bộ test của `MobileCore/` — cây vendored có repo + CI RIÊNG,
  // 0 importer trong `src/`. Tức bản sao cũ vẫn gác cổng của SuperApp, và nếu repo
  // chủ đổi thì bản ở đây đỏ mà chẳng ai sửa được ở kho này. Đã loại, khớp với
  // `tsconfig.json` cũng loại `Legacy`.
  //
  // `.claude/` = git worktree phụ do công cụ tạo (`.claude/worktrees/*`). Không
  // loại thì jest quét cả chúng và CHẠY LẶP toàn bộ bộ test — đo được 3.020 test
  // thay vì 755, kèm lỗi của cây phụ báo lẫn vào cây chính.
  //
  // Mẫu phải neo vào `<rootDir>`, KHÔNG khớp `.claude` ở bất kỳ đâu trong đường
  // dẫn tuyệt đối. Mẫu cũ `'/\\.claude/'` khớp cả chính cây phụ: chạy jest bên
  // trong `.claude/worktrees/<tên>` thì nó tự loại mình, in `No tests found` và
  // THOÁT 0 — một lượt chạy 0 bài đọc y hệt một lượt chạy toàn xanh. Neo vào
  // `<rootDir>` thì cây chính vẫn loại các cây phụ của nó, còn cây phụ chạy được
  // bộ kiểm của chính nó.
  testPathIgnorePatterns: ['/node_modules/', '__tests__/App.test.tsx', '/Legacy/', '<rootDir>/\\.claude/'],
  // Chặn ở `testPathIgnorePatterns` là chưa đủ cho `.claude/`: nó chặn CHẠY, không
  // chặn haste-map BÒ vào. Hệ quả đo được: `jest-haste-map: duplicate manual mock
  // found: assetModuleStub` lặp theo số worktree, và bản sao cũ của một test có thể
  // được gom vào lượt chạy — tức CI báo đỏ/xanh theo mã KHÔNG nằm trong commit.
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/'],
  // RN preset chỉ transform react-native + @react-native*. Các gói RN khác phát-hành
  // ESM thuần (@react-navigation, react-native-*, redux ESM…) → Jest gặp `export` sẽ
  // ném "Unexpected token 'export'" và cả suite chết (App.test.tsx). Nới allowlist để
  // Babel transform luôn các gói đó. Thêm gói mới gây lỗi tương tự thì bổ sung vào đây.
  // `three` nằm trong danh sách vì `three/examples/jsm/**` (GLTFLoader, PLYLoader…)
  // là ESM thuần — phần lõi `three` có bản CJS nên vẫn nạp được, nhưng các loader
  // thì không, và bất kỳ test nào chạm tới chúng sẽ chết ở dòng `import` đầu tiên.
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?(?:@?react-native(?:-community)?|@react-native(?:-community)?/.*|@react-navigation/.*|react-native-.*|react-redux|redux-persist|@reduxjs/.*|immer|@react-native-async-storage/.*|three)/)',
  ],
  // ── Hạn chờ mỗi test ──────────────────────────────────────────────────────
  // 5000ms là MẶC ĐỊNH CỦA JEST, không phải một con số ai đó đo cho kho này. Và
  // nó quá chật cho các bộ test dựng NGUYÊN một màn RN (`TreeManagementScreen`,
  // `WayfindScreen`, `FruitCropperScreen`, `AnimalDetailScreen`): chạy riêng thì
  // cả hai bộ đầu xong trong 4,4 GIÂY cộng lại, nhưng chạy cùng cả kho thì đỏ vì
  // "Exceeded timeout of 5000 ms".
  //
  // Đo được nguyên nhân trên máy dựng: 16 nhân ⇒ jest mở ~15 tiến trình con, mỗi
  // tiến trình nạp trọn đồ thị module RN, trong khi máy chỉ còn 0,8 GB RAM trống.
  // Chúng tranh nhau bộ nhớ và bị hoán trang, nên test không CHẬM về logic — nó
  // bị BỎ ĐÓI CPU. Nâng hạn chờ là nói đúng sự thật đó; sửa mã màn thì không sửa
  // gì cả, vì mã màn không hề chậm.
  //
  // Con số đỏ giả này còn nguy hơn một test chậm: nó dạy người ta chạy lại cho
  // tới khi xanh, và thói quen ấy sẽ nuốt luôn ngày một test đỏ THẬT.
  testTimeout: 30_000,

  moduleNameMapper: {
    // Model 3D (.glb/.gltf): trong app do Metro biến `require()` thành id asset dạng
    // SỐ. Jest không có bước đó nên sẽ cố parse tệp nhị phân → nổ. Trả về một stub số
    // để sổ đăng ký model (treeModels.ts) import được trong test.
    '\\.(glb|gltf)$': '<rootDir>/__mocks__/assetModuleStub.js',
  },
};
