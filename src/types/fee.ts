// types/fee.ts
//
// Báo giá phí 3-bucket cho 1 tác vụ (identify cây/quả/vật nuôi). Khai 1 NƠI DUY NHẤT
// rồi tall import — trước đây định nghĩa trùng 3 chỗ (FeeDisplay + tree/animal service),
// lệch 1 nơi là dialog phí sai âm thầm.
//
// - fee_lamp / fee_ada: tổng phí quy ra LAMP / ADA.
// - lamp_magiclamp / lamp_orilife: phần LAMP chia về kho MagicLamp / OriLife.
// - demand_factor: hệ số nhu cầu (động theo tải).
// - display_vn: chuỗi hiển thị tiếng Việt server dựng sẵn.
export interface FeeQuote {
  fee_lamp: number;
  fee_ada: number;
  lamp_magiclamp: number;
  lamp_orilife: number;
  demand_factor: number;
  display_vn: string;
}
