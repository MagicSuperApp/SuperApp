// modules/work/services/env.d.ts
//
// Shim @env CỤC BỘ cho module Work — CHỈ khai các biến WORK_* mà module này
// dùng, để KHÔNG phải sửa src/types/env.d.ts (nằm ngoài ranh giới sửa của
// agent module Work). TypeScript hợp nhất (merge) khai báo module '@env' này
// với khai báo toàn cục → không xung đột, chỉ bổ sung 2 biến.
//
// Khi tích hợp chính thức: chuyển 2 dòng này lên src/types/env.d.ts gốc rồi
// xoá file shim này.

declare module '@env' {
  export const WORK_API_URL: string;
  export const WORK_BACKEND_ENABLED: string;
}
