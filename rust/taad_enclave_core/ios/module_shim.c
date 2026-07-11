// module_shim.c — buộc CocoaPods sinh clang module/framework cho pod
// `taad_enclave_core` (vốn chỉ có header + vendored .a).
//
// VÌ SAO CẦN: dưới `use_frameworks! :static`, một pod KHÔNG có source để biên dịch
// sẽ không tạo ra modulemap/framework → Swift `import taad_enclave_core` báo
// "no such module". Chỉ cần MỘT translation unit là CocoaPods dựng framework +
// modulemap (umbrella gồm taad_enclave_core.h) → Swift import được.
//
// Include header để anchor các khai báo C (taad_*). KHÔNG có code thực thi —
// thân thật nằm trong libtaad_enclave_core.a (Rust, link qua vendored_libraries).
#include "taad_enclave_core.h"
