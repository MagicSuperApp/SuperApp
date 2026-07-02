// modules/join/data/contributionLevels.ts
// Mức đóng góp CPU/RAM/băng thông cho màn "Tham gia LampNet" (spec §4.1).
//
// KHUNG: đây là preset tĩnh app cho phép user chọn giới hạn tài nguyên. Bản sau
// (spec §6) thay bằng `estimate_contribution`/`ContributionPlan` từ mobile-sdk
// (hiện thêm ước W điện/ngày). Giữ shape gọn để lúc đó chỉ nối số liệu thật vào.

export interface ContributionLevel {
  id: 'light' | 'balanced' | 'max';
  /** Nhãn hiển thị. */
  label: string;
  /** Mô tả ngắn cho user hiểu đánh đổi. */
  hint: string;
  /** % CPU tối đa app cho phép node dùng. */
  cpuPct: number;
  /** RAM tối đa (MB). */
  ramMb: number;
  /** Băng thông tối đa (Mbps). */
  bandwidthMbps: number;
  icon: string;
}

export const CONTRIBUTION_LEVELS: ContributionLevel[] = [
  {
    id: 'light',
    label: 'Nhẹ nhàng',
    hint: 'Ít ảnh hưởng pin & máy — góp khi rảnh.',
    cpuPct: 15,
    ramMb: 256,
    bandwidthMbps: 5,
    icon: 'feather',
  },
  {
    id: 'balanced',
    label: 'Cân bằng',
    hint: 'Góp đều, máy vẫn mượt cho việc hằng ngày.',
    cpuPct: 40,
    ramMb: 512,
    bandwidthMbps: 15,
    icon: 'scale-balance',
  },
  {
    id: 'max',
    label: 'Tối đa',
    hint: 'Góp nhiều nhất — nên cắm sạc & dùng Wi-Fi.',
    cpuPct: 75,
    ramMb: 1024,
    bandwidthMbps: 50,
    icon: 'rocket-launch-outline',
  },
];
