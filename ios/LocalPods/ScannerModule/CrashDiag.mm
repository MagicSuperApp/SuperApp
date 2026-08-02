// CrashDiag.mm — CHẨN ĐOÁN crash native bản signed (build 73-76): một native module
// ném NSException trong VOID method async → RN throw jsi::JSError trên background
// dispatch queue → uncaught → std::terminate → SIGABRT (crash cả app lúc khởi động).
//
// NSSetUncaughtExceptionHandler KHÔNG bắt được (đi qua C++ terminate, không qua ObjC
// uncaught handler). React là PREBUILT nên patch RCTTurboModule.mm vô tác dụng. Vì vậy
// đặt `std::set_terminate` (chạy được cả với prebuilt) để lấy MESSAGE của jsi::JSError
// mà RN throw — message dạng "Module.method raised an exception: <reason>" → biết ĐÚNG
// module/method/lý do. POST về log server (event `native_terminate`).
//
// Nằm trong ScannerModule (pod build từ source) để được biên dịch vào app. `+load`/
// constructor chạy lúc framework nạp (sớm).
#import <Foundation/Foundation.h>
#import <exception>

static std::terminate_handler gAladinPrevTerminate = nullptr;

static void aladinPostTerminate(NSString *msg) {
  NSURL *url = [NSURL URLWithString:@"https://gutless-renovator-distaste.ngrok-free.dev/logs"];
  if (url == nil) {
    return;
  }
  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
  req.HTTPMethod = @"POST";
  [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
  [req setValue:@"true" forHTTPHeaderField:@"ngrok-skip-browser-warning"];
  NSDictionary *payload = @{
    @"event" : @"native_terminate",
    @"device" : @"iOS RN",
    @"osVersion" : @"",
    @"appVersion" : @"",
    @"stackTrace" : @"",
    @"data" : @{@"message" : (msg ?: @"(nil)"), @"level" : @"error"},
  };
  req.HTTPBody = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
  // Gửi ĐỒNG BỘ (chặn tối đa 3s) vì tiến trình sắp abort.
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  NSURLSessionDataTask *task =
      [[NSURLSession sharedSession] dataTaskWithRequest:req
                                      completionHandler:^(NSData *d, NSURLResponse *r, NSError *e) {
                                        dispatch_semaphore_signal(sem);
                                      }];
  [task resume];
  dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(3 * NSEC_PER_SEC)));
}

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
  aladinPostTerminate(info);
  if (gAladinPrevTerminate != nullptr) {
    gAladinPrevTerminate();
  }
  abort();
}

__attribute__((constructor)) static void aladinInstallTerminate(void) {
  gAladinPrevTerminate = std::set_terminate(&aladinTerminateHandler);
}
