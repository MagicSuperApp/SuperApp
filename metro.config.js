// DÙNG 'expo/metro-config' (KHÔNG phải '@react-native/metro-config'):
// build iOS đóng gói JS qua `@expo/cli export:embed`, cần serializer của expo
// (trả về định dạng module-graph). Nếu dùng metro-config RN gốc → serializer mặc
// định trả chuỗi `var __BUNDLE...` → `export:embed` báo:
//   "Serializer did not return expected format ... Unexpected token 'v', var __BUND"
// (reset-cache vẫn lỗi). App tích hợp expo (expo-gl/asset) nên bundler PHẢI là expo.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── MỘT bản three DUY NHẤT ───────────────────────────────────────────────────
// package `three` khai báo exports 2 nhánh:
//     "."  →  { "import": "build/three.module.js", "require": "build/three.cjs" }
// mà three.cjs là BUNDLE TỰ CHỨA (có bản sao riêng của mọi class), còn
// three.module.js lại re-export từ three.core.js. Nên Metro nạp ra HAI bản khác nhau:
//   · @react-three/fiber/native resolve qua `main` → bản CJS → require('three') → three.cjs
//   · three/examples/jsm/loaders/GLTFLoader.js (ESM) → import 'three'  → three.core.js
// Hậu quả thật đã gặp: R3F vá THREE.LoaderUtils/FileLoader (để đọc asset RN qua
// expo-asset) trên bản three.cjs, còn GLTFLoader lại chạy bản three.core.js chưa vá
// → nạp tree1.glb nổ "url.lastIndexOf is not a function" tại three.core.js.
// Ngoài ra 2 bản còn làm mọi phép `instanceof` giữa R3F và code của app sai âm thầm.
// → Ép MỌI nơi import 'three' về đúng một file.
const THREE_ENTRY = path.resolve(__dirname, 'node_modules/three/build/three.module.js');

// Don't let Metro index/watch generated native build folders. On Windows,
// Gradle deleting an `android/build` intermediates dir mid-watch crashes
// Metro's file watcher (ENOENT watch ...). Excluding them avoids that.
const buildDirsBlockList = /[\/\\](android[\/\\]build|android[\/\\]\.gradle|ios[\/\\]build)[\/\\].*/;

// glb/gltf/bin/hdr: model 3D (assets/models/tree1.glb) nạp qua expo-asset cho
// three.js — Metro phải coi là ASSET, không phải mã nguồn.
config.resolver.assetExts = [...config.resolver.assetExts, 'tflite', 'glb', 'gltf', 'bin', 'hdr'];

// Gộp blockList của expo (nếu có) với build-dirs — KHÔNG ghi đè mất mặc định expo.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = existingBlockList
  ? [].concat(existingBlockList, buildDirsBlockList)
  : buildDirsBlockList;

// CHỈ chặn đúng specifier 'three'; 'three/examples/jsm/...' vẫn resolve bình thường.
// Chain vào resolveRequest sẵn có của expo (nếu có) để không mất hành vi mặc định.
const prevResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: THREE_ENTRY };
  }
  return (prevResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
