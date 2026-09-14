// hooks/useBiometricSensor.ts
//
// ĐO CẢM BIẾN SINH TRẮC, VÀ ĐO LẠI KHI NGƯỜI DÙNG QUAY VỀ TỪ CÀI ĐẶT.
//
// ── Lỗ đã đo được trên iPhone 17 giả lập, 2026-09-11 ──────────────────────
// Hai màn `LoginScreen` và `SignUpBiometricScreen` gọi `isSensorAvailable()`
// trong một `useEffect` danh sách phụ thuộc RỖNG — tức đúng MỘT lần lúc gắn cây.
// Không màn nào nghe `AppState`. Cả kho `src/` trước hôm nay **không có một chỗ
// nào** dùng `AppState`.
//
// Hệ quả người dùng thật gặp, đo bằng hai đường độc lập:
//   1. NGUỒN — `useEffect(..., [])`, không `AppState`, không `useFocusEffect`
//      ⇒ trạng thái cảm biến không có đường nào đổi sau lần đo đầu.
//   2. HÀNH VI — ghi danh Face ID trên máy giả lập rồi đưa app về tiền cảnh:
//      màn vẫn báo "chưa thiết lập". Chỉ khi TẮT HẲN app rồi mở lại thì nút
//      sinh trắc mới sống.
//
// Và đây là chỗ đắt: chính app dẫn người dùng đi vào đúng hành trình nó không
// xử được. `LoginScreen:485` bày nút **"Mở Cài đặt"**; câu lỗi ở
// `SignUpBiometricScreen:142` bảo *"bật Face ID / vân tay trong cài đặt của
// thiết bị, sau đó thử lại"*. Người dùng làm đúng từng chữ — và không có gì để
// "thử lại", vì app không đọc lại. Ở màn đăng ký thì hậu quả là **không tạo
// được tài khoản**, và màn hình tự khai bước đó "bắt buộc, không có cách thay
// thế".
//
// ── Vì sao là MỘT hook dùng chung, không phải hai bản vá ──────────────────
// Hai màn vá riêng thì hai bản sao trôi khỏi nhau, và cái sai lần sau chỉ hiện
// ở một màn. Gộp lại thì chỗ đo có đúng một nơi, và bài kiểm ghim được nó.

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';

export type BiometricSensor = {
  /** `null` = CHƯA đo xong. Đừng đọc thành "không có" — nút sẽ tắt oan. */
  available: boolean | null;
  /** `''` khi chưa đo xong hoặc máy không có cảm biến nào. */
  biometryType: string;
};

/**
 * Đọc trạng thái cảm biến sinh trắc, và đọc LẠI mỗi lần app quay về tiền cảnh.
 *
 * `onLog` nhận câu lỗi khi phép đo ném — người gọi tự quyết ghi đi đâu. KHÔNG
 * nuốt lỗi thành `available = false`: "đo hỏng" và "máy không có cảm biến" là
 * hai chuyện khác nhau, gộp lại là dựng một cái vỏ im lặng. Đo hỏng thì giữ
 * nguyên giá trị đang có.
 */
export function useBiometricSensor(onLog?: (message: string, error: unknown) => void): BiometricSensor {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [biometryType, setBiometryType] = useState<string>('');

  useEffect(() => {
    let alive = true;

    const measure = async () => {
      try {
        const rn = new ReactNativeBiometrics();
        const { available: ok, biometryType: type } = await rn.isSensorAvailable();
        if (!alive) return; // màn đã rời — đừng đặt state vào cây đã tháo
        setAvailable(ok);
        setBiometryType(type || '');
      } catch (e) {
        onLog?.('Biometric sensor check failed', e);
        // Chỉ hạ xuống `false` khi CHƯA có kết quả nào. Đã đo được một lần rồi
        // mà lần sau ném thì giữ kết quả cũ — một lần gọi hỏng không được phép
        // tắt nút của một cảm biến đang có thật.
        if (alive) setAvailable(prev => (prev === null ? false : prev));
      }
    };

    measure();

    // Người dùng bật Face ID trong Cài đặt rồi quay lại: đây là chỗ duy nhất
    // biết việc đó đã xảy ra. `background → active` cũng tính, không chỉ
    // `inactive → active` — trên iOS đi sang Cài đặt rồi về đi qua cả hai lối.
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') measure();
    });

    return () => { alive = false; sub.remove(); };
    // `onLog` cố ý KHÔNG nằm trong danh sách phụ thuộc: người gọi thường truyền
    // một hàm dựng tại chỗ, đưa vào đây thì hook tháo–lắp mỗi lần vẽ lại và
    // đăng ký lại listener liên tục.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { available, biometryType };
}
