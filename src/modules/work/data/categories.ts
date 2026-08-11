// modules/work/data/categories.ts
//
// TAXONOMY ngành nghề — cấu trúc THẬT, KHÔNG phải mock.
//
// Đây là từ điển nhóm nghề để (a) render chip lọc trên WorkHomeScreen và (b) nhóm
// việc theo `categoryId`. Bộ id ở đây PHẢI khớp các *giá trị* của SKILL_TO_CATEGORY
// trong `data/adapters.ts` (map skill backend → categoryId UI) — lệch id = việc thật
// rơi hết vào nhóm 'other', chip lọc rỗng.
//
// KHÁC mockData: ở đây KHÔNG nhúng số việc giả. Số lượng việc mỗi nhóm tính từ danh
// sách việc THẬT ở runtime (WorkHomeScreen đếm theo categoryId của jobs đã tải).
// icon = tên MaterialCommunityIcons; color = token brand nhóm (đã có sẵn palette).

export interface WorkCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const WORK_CATEGORIES: WorkCategory[] = [
  { id: 'construction', name: 'Xây dựng', icon: 'hammer', color: '#E08C3A' },
  { id: 'repair', name: 'Sửa chữa', icon: 'wrench', color: '#3D7A5E' },
  { id: 'transport', name: 'Vận chuyển', icon: 'truck-outline', color: '#3B6EA8' },
  { id: 'housekeeping', name: 'Giúp việc', icon: 'broom', color: '#8B5BC4' },
  { id: 'it', name: 'IT · Văn phòng', icon: 'laptop', color: '#264E7E' },
  { id: 'event', name: 'Sự kiện', icon: 'party-popper', color: '#C0533A' },
  { id: 'creative', name: 'Sáng tạo', icon: 'palette-outline', color: '#B07D2F' },
  { id: 'beauty', name: 'Làm đẹp', icon: 'face-woman-shimmer', color: '#D8569E' },
  { id: 'driver', name: 'Tài xế', icon: 'car', color: '#0F1614' },
  { id: 'tutor', name: 'Gia sư', icon: 'school-outline', color: '#3D7A5E' },
];
