/**
 * Cổng chặn tái phát: máy ảnh mở ra rồi tắt, không một câu nào (iOS).
 *
 * Báo từ thực địa 14/09/2026. Nguyên nhân KHÔNG nằm ở đời máy: trên iOS
 * `react-native-image-picker` không kiểm quyền máy ảnh lần nào, nên ai đã từng bấm
 * "Không cho phép" thì máy ảnh dựng lên đen, người dùng bấm Huỷ, thư viện trả
 * `didCancel`, và màn `return` im lặng. Số đo và đường mã: `utils/cameraPermission.ts`.
 *
 * Không phép thử nào trên MÁY ẢO chạm được đường này — máy ảo trả
 * `camera_unavailable` ngay dòng đầu, trước mọi nhánh quyền
 * (`ImagePickerManager.mm:70-73`). Nên cổng này đối chiếu văn bản nguồn.
 */
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'ActivityScreen.tsx'), 'utf8');

describe('máy ảnh phải xin quyền TRƯỚC khi mở', () => {
  it('hỏi quyền trước, và hỏi trên CẢ HAI nền tảng', () => {
    // Pin cả HÌNH DẠNG của câu lệnh, không chỉ sự có mặt của cái tên. Bọc lời xin
    // quyền vào bất cứ điều kiện nền tảng nào — `if (Platform.OS === 'android')`
    // như cũ, hay một biểu thức ba ngôi — chính là hình dạng đã để iOS đi qua mà
    // không hỏi gì, và đó là lỗi đang vá.
    expect(SRC).toMatch(/\n\s*const camPerm = await ensureCameraPermission\(\{/);
    // Và toàn bộ câu lệnh đó không được nhắc tới nền tảng.
    const cau = SRC.slice(
      SRC.indexOf('const camPerm ='),
      SRC.indexOf('const camPerm =') + 240,
    );
    expect(cau).not.toContain('Platform.OS');
  });

  it('lời xin quyền đứng TRƯỚC `launchCamera`, không phải sau', () => {
    const viTriXin = SRC.indexOf('await ensureCameraPermission(');
    const viTriMo = SRC.indexOf('imagePicker.launchCamera(');
    expect(viTriXin).toBeGreaterThan(-1);
    expect(viTriMo).toBeGreaterThan(-1);
    expect(viTriXin).toBeLessThan(viTriMo);
  });

  it('bị từ chối thì chỉ thẳng sang Cài đặt, không mở máy ảnh', () => {
    expect(SRC).toMatch(/camPerm === 'denied'[\s\S]{0,80}askOpenSettings\(\);\s*\n\s*return;/);
  });

  it('KHÔNG đo được quyền thì vẫn mở máy ảnh, không chặn', () => {
    // `unmeasurable` và `denied` phải dẫn tới hai việc khác nhau. Chặn khi không
    // đo được là tự tay tắt máy ảnh của mọi người vì một thứ mình không biết —
    // trong khi đường cũ vẫn còn nguyên và không tệ hơn hôm nay.
    expect(SRC).not.toMatch(/camPerm !== 'granted'/);
    expect(SRC).not.toMatch(/camPerm === 'unmeasurable'[\s\S]{0,60}return;/);
  });
});
