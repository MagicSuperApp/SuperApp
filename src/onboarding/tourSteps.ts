// onboarding/tourSteps.ts
//
// Định nghĩa các BƯỚC của luồng hướng dẫn cơ bản (coach-mark tour).
//
// Mỗi bước trỏ tới một `targetId` — id do các màn/nút tự đăng ký với
// CoachMarkContext qua hook `useCoachMarkTarget(id)`. Bước không có target
// (welcome/done) sẽ hiện linh vật ở giữa màn hình, không cần spotlight.
//
// Tất cả target dưới đây đều hiển thị đồng thời trên màn hình Chính (Home) —
// header (chuông), thanh điều hướng (nút Chính + Tài khoản) và nội dung Home —
// nên luồng chạy tại chỗ, không cần điều hướng qua màn khác.

export type TargetId =
  | 'home.services'
  | 'nav.center'
  | 'nav.account'
  | 'header.bell';

export type TourStep = {
  /** id vùng cần spotlight; null = hiện linh vật giữa màn, không highlight. */
  targetId: TargetId | null;
  title: string;
  body: string;
  /** Bo tròn ô spotlight (nút tròn để cao). */
  radius?: number;
};

export const TOUR_STEPS: TourStep[] = [
  {
    targetId: null,
    title: 'Xin chào 👋',
    body: 'Mình là trợ lý của bạn. Để mình dẫn bạn đi một vòng các thao tác cơ bản nhé — chỉ mất khoảng một phút.',
  },
  {
    targetId: 'home.services',
    title: 'Màn hình Chính',
    body: 'Đây là màn hình chính. Bạn thấy các nhóm: khu Dịch vụ (Truy xuất, Trò chuyện, Công việc…), Thao tác nhanh, và Thông tin nhanh. Chạm vào một dịch vụ để mở.',
  },
  {
    targetId: 'nav.center',
    title: 'Nút Chính',
    body: 'Nút tròn ở giữa thanh dưới là nút Chính. Chạm để quay về trang chủ bất cứ lúc nào; giữ và KÉO để mở nhanh vòng menu dịch vụ mà không cần về Home.',
    radius: 999,
  },
  {
    targetId: 'nav.account',
    title: 'Tài khoản',
    body: 'Nút Tài khoản (Tôi) mở hồ sơ của bạn và toàn bộ Cài đặt: thông báo, ngôn ngữ, sinh trắc học, trợ lý ảo… Bạn cũng chạy lại hướng dẫn này từ đây.',
    radius: 999,
  },
  {
    targetId: 'header.bell',
    title: 'Thông báo',
    body: 'Chuông ở góc trên là nơi xem các cập nhật mới: hoạt động, nhắc việc và tin từ hệ thống.',
    radius: 999,
  },
  {
    targetId: null,
    title: 'Xong rồi! 🎉',
    body: 'Bạn đã nắm các thao tác cơ bản. Muốn xem lại bất cứ lúc nào, vào Tài khoản → Cài đặt → “Chạy luồng hướng dẫn”.',
  },
];
