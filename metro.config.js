// GIỮ metro-config RN gốc (install-expo-modules tự đổi sang 'expo/metro-config' —
// đã hoàn tác): bare RN, chỉ dùng expo-modules-core cho expo-gl (3D).
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

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

const config = {
    resolver: {
        // glb/gltf/bin/hdr: model 3D (assets/models/tree1.glb) nạp qua expo-asset
        // cho three.js — Metro phải coi là ASSET, không phải mã nguồn.
        assetExts: [...defaultConfig.resolver.assetExts, 'tflite', 'glb', 'gltf', 'bin', 'hdr'],
        blockList: buildDirsBlockList,
        // CHỈ chặn đúng specifier 'three'; 'three/examples/jsm/...' vẫn resolve bình thường.
        resolveRequest: (context, moduleName, platform) => {
            if (moduleName === 'three') {
                return { type: 'sourceFile', filePath: THREE_ENTRY };
            }
            return context.resolveRequest(context, moduleName, platform);
        },
    },
};

module.exports = mergeConfig(defaultConfig, config);