const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Don't let Metro index/watch generated native build folders. On Windows,
// Gradle deleting an `android/build` intermediates dir mid-watch crashes
// Metro's file watcher (ENOENT watch ...). Excluding them avoids that.
const buildDirsBlockList = /[\/\\](android[\/\\]build|android[\/\\]\.gradle|ios[\/\\]build)[\/\\].*/;

const config = {
    resolver: {
        assetExts: [...defaultConfig.resolver.assetExts, 'tflite'],
        blockList: buildDirsBlockList,
    },
};

module.exports = mergeConfig(defaultConfig, config);