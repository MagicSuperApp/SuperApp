// module_shim.c — buộc CocoaPods sinh clang module/framework cho pod `chat_mls`
// (vốn chỉ có header + vendored .a). Dưới `use_frameworks! :static`, pod không có
// source sẽ không tạo modulemap → Swift `import chat_mls` báo "no such module".
// Một translation unit là đủ để CocoaPods dựng framework + modulemap (umbrella gồm
// chat_mls.h). KHÔNG có code thực thi — thân thật nằm trong libchat_mls.a (Rust).
#include "chat_mls.h"
