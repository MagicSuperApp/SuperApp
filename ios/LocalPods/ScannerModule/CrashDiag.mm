// CrashDiag.mm — CHẨN ĐOÁN crash native bản signed (build 73-76): một native module
// ném NSException trong VOID method async → RN throw jsi::JSError trên background
// dispatch queue → uncaught → std::terminate → SIGABRT (crash cả app lúc khởi động).
//
// NSSetUncaughtExceptionHandler KHÔNG bắt được (đi qua C++ terminate, không qua ObjC
// uncaught handler). React là PREBUILT nên patch RCTTurboModule.mm vô tác dụng. Vì vậy
// đặt `std::set_terminate` (chạy được cả với prebuilt) để lấy MESSAGE của jsi::JSError
// mà RN throw — message dạng "Module.method raised an exception: <reason>" → biết ĐÚNG
// module/method/lý do. Ghi ra nhật ký hệ thống (`NSLog`), KHÔNG gửi đi đâu.
//
// Bản trước POST thẳng về một tên miền ngrok tạm viết cứng ở đây, và nó ĐÃ đi vào bản
// phát hành: đo được chuỗi đó trong nhị phân đã ký của bản 94. Ngrok miễn phí hết hạn
// là ai cũng giành lại được tên miền, rồi nhận hết lý do crash của máy người dùng thật.
// Cần đường gửi từ xa thì đi qua biến môi trường như `src/services/remoteLogger.ts`.
//
// Nằm trong ScannerModule (pod build từ source) để được biên dịch vào app. `+load`/
// constructor chạy lúc framework nạp (sớm).
#import <Foundation/Foundation.h>
#import <exception>

static std::terminate_handler gAladinPrevTerminate = nullptr;

static void aladinTerminateHandler() {
  NSString *info = @"(no in-flight exception)";
  // Idiom crash-reporter iOS: rethrow exception đang bay để phân loại. libc++ (Apple)
  // hỗ trợ `throw;` trong terminate handler vì có exception đang được xử lý.
  try {
    throw;
  } catch (NSException *e) {
    info = [NSString stringWithFormat:@"NSException %@: %@", e.name, (e.reason ?: @"(nil)")];
  } catch (const std::exception &e) {
    // jsi::JSError kế thừa std::exception → what() = "Module.method raised an exception: reason"
    info = [NSString stringWithFormat:@"std::exception: %s", e.what()];
  } catch (...) {
    info = @"unknown C++ exception";
  }
  NSLog(@"[ALADIN-TERMINATE] %@", info);
  if (gAladinPrevTerminate != nullptr) {
    gAladinPrevTerminate();
  }
  abort();
}

// Đặt trong +load của ObjC class (KHÔNG dùng __attribute__((constructor)) — trong
// static framework nó bị linker dead-strip vì không ai tham chiếu). App có `-ObjC`
// trong OTHER_LDFLAGS → mọi class ObjC bị force-load → +load chắc chắn chạy lúc launch.
@interface AladinCrashDiag : NSObject
@end

@implementation AladinCrashDiag
+ (void)load {
  gAladinPrevTerminate = std::set_terminate(&aladinTerminateHandler);
  NSLog(@"[ALADIN-TERMINATE] installed std::set_terminate");
}
@end
