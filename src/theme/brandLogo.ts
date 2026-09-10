/**
 * Logo VẼ TRONG APP — một nguồn, mọi màn trỏ về đây.
 *
 * ── Ca hỏng tệp này sinh ra để chặn ─────────────────────────────────────────
 * Tới 2026-09-11, bốn màn gõ cứng `require('assets/images/logo.png')`:
 * `LoginScreen`, `LanguageSelectScreen`, `OnboardingScreen`, `AppHeader`.
 * Đường dẫn cố định ⟹ không đi qua instance lần nào ⟹ **CheckFarm dựng ra
 * mang logo Aladin ở cả bốn chỗ**, kể cả màn đầu tiên người dùng nhìn thấy.
 *
 * Bộ nhận diện của CheckFarm vẫn tới đúng nơi khác — biểu tượng app, màu chủ
 * đạo, tên hiển thị — nên lỗi này không đọc ra như "chưa cấu hình", nó đọc ra
 * như "app dựng nhầm". Và không phép kiểm nào kêu, vì bốn chỗ ấy đều hợp lệ về
 * kiểu: chúng nạp một tệp CÓ THẬT.
 *
 * ── Vì sao là một BẢNG TĨNH, không phải một đường dẫn dựng lúc chạy ─────────
 * Metro biến `require()` thành một id asset ngay lúc gói, nên đường dẫn phải là
 * hằng chữ tại chỗ viết. Không có cách nào ghép `instances/${id}/…` lúc chạy.
 * Bảng tĩnh là hình dạng ĐÚNG ở đây, không phải chỗ đi tắt: mỗi app một dòng,
 * và `brandLogo.test.ts` bắt buộc bảng này phủ đủ mọi app trong `INSTANCES`.
 *
 * Cái giá phải trả và đã cân: mọi app đều mang logo của MỌI app trong gói cài.
 * Hai tệp cộng lại dưới 200 KB, và đổi lại là không app nào dựng ra mang nhận
 * diện của app khác — thứ đắt hơn hẳn.
 *
 * ── Thêm một app thì làm gì ─────────────────────────────────────────────────
 * Thêm ĐÚNG một dòng vào `LOGO_THEO_APP` trỏ tới `instances/<mã>/brand/`.
 * Quên thì `brandLogo.test.ts` đỏ kèm tên app còn thiếu — không phải người dùng
 * phát hiện hộ bằng cách nhìn thấy logo của công ty khác trên màn đăng nhập.
 */
import type { ImageSourcePropType } from 'react-native';

import { DEFAULT_INSTANCE } from '../config/instance.config';

/** Mã app → logo của app đó. Khoá phải phủ đủ `INSTANCES` (bài kiểm canh). */
export const LOGO_THEO_APP: Record<string, ImageSourcePropType> = {
  aladin: require('../../instances/aladin/brand/icon-1024.png'),
  checkfarm: require('../../instances/checkfarm/brand/icon-1024.png'),
};

/**
 * Logo của app ĐANG dựng.
 *
 * Không có giá trị lui sang một app khác: rơi về logo Aladin là đúng cái lỗi
 * tệp này sinh ra để chặn, chỉ khác là lúc đó nó lại còn có vẻ "có chủ ý". Chỗ
 * kêu lên là `brandLogo.test.ts`, chạy trước khi bản dựng ra tới tay ai.
 */
export const APP_LOGO: ImageSourcePropType = LOGO_THEO_APP[DEFAULT_INSTANCE.instanceId];
