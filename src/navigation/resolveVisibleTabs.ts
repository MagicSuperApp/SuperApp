// navigation/resolveVisibleTabs.ts
//
// SG9 §2 — TAB-BAR ĐỘNG THEO PERSONA: mẫu "NEO cố định + SLOT thích ứng".
//
// HÀM THUẦN (pure) — KHÔNG đọc store trực tiếp, KHÔNG ghi, KHÔNG chạm logic
// module. Nhận tín hiệu (farm signal + usage + pinned) → trả DANH SÁCH route
// HIỂN THỊ theo đúng thứ tự vẽ trên navbar (trái → phải). CurvedTabBar chỉ VẼ
// theo kết quả này; `instance.config` giữ TẬP ĐẦY ĐỦ (resolver chỉ chọn subset).
//
// Bố cục 5 ô = 3 NEO + 2 SLOT:  Chat · [slot] · (Home) · [slot] · Me
//   - NEO (cố định mọi persona): ChatHome (Chat) · Home (giữa) · Account (Me).
//   - SLOT (2 ô trong): hoán vị trong {Farm, Work, Join} theo persona; module dôi
//     ra KHÔNG biến mất — vào cổng xoè (§4) / deep-link.
//
// RÀNG BUỘC ỔN ĐỊNH (§2.3): tập module BẬT không đổi; chỉ đổi ô HIỂN THỊ + thứ
// tự. User ghim (pinned) ĐÈ tất cả. Việc "đóng băng theo phiên + tối đa 1 đổi/
// phiên + toast" do hook useVisibleTabs (index.tsx) đảm nhiệm — hàm này thuần.

// ── NEO (cố định) ────────────────────────────────────────────────────────────
export const NEO_LEFT = 'ChatHome'; // Chat — đầu trái
export const NEO_CENTER = 'Home';        // ô giữa (cổng)
export const NEO_RIGHT = 'Account';      // Me — đầu phải (AVATAR user)

// ── SLOT ưu tiên theo persona ───────────────────────────────────────────────
// Nông dân / user mới: Farm nổi cạnh Home, Work kề; Join lùi vào cổng.
export const SLOT_PRIORITY_DEFAULT: string[] = ['Farms', 'WorkHome', 'JoinHome'];
// Shipper / thợ: Work + Join lên thanh; Farm lùi vào cổng.
export const SLOT_PRIORITY_SHIPPER: string[] = ['WorkHome', 'JoinHome', 'Farms'];

/**
 * Bảng ưu tiên SLOT của MỘT app. `InstanceConfig.slotPriority` mang đúng hình này.
 */
export interface SlotPriorityTable {
  default: string[];
  shipper: string[];
}

/** Bảng của nền dùng chung — dùng khi chỗ gọi không truyền bảng của app. */
export const DEFAULT_SLOT_PRIORITY: SlotPriorityTable = {
  default: SLOT_PRIORITY_DEFAULT,
  shipper: SLOT_PRIORITY_SHIPPER,
};

/**
 * Thứ tự ưu tiên 3 service {Farm, Work, Join} theo persona (cổng §4 tái dùng).
 *
 * ── Vì sao NHẬN bảng qua tham số thay vì tự đọc `InstanceConfig` ──────────────
 * `config/instance.config.ts` ĐÃ import hai hằng ở trên từ chính tệp này. Đọc
 * ngược lại là dựng một VÒNG import runtime — đúng loại đã làm bản signed chết ở
 * boot với `Cannot read property 'default' of undefined`, và là loại chỉ lộ ra
 * trên bản dựng thật chứ không lộ khi chạy dev.
 *
 * Nên chiều phụ thuộc giữ nguyên một chiều: tệp này KHÔNG biết gì về instance,
 * còn chỗ gọi (đã import instance rồi) rót bảng vào. Hàm vẫn THUẦN — cùng đầu
 * vào, cùng đầu ra, không đọc trạng thái toàn cục.
 *
 * Mặc định là bảng của nền dùng chung, nên mọi chỗ gọi cũ và mọi bài kiểm cũ
 * giữ nguyên hành vi.
 */
export function slotPriority(
  persona: Persona,
  table: SlotPriorityTable = DEFAULT_SLOT_PRIORITY,
): string[] {
  return persona === 'shipper' ? table.shipper : table.default;
}

// Số ô SLOT thích ứng (2 ô trong).
export const SLOT_COUNT = 2;

// Khoá AsyncStorage cho lựa chọn GHIM của user (§2.3.4). Ghim = mảng route SLOT
// (2 phần tử) theo thứ tự trái→phải; ghim rồi thì persona KHÔNG đổi nữa.
export const PINNED_TABS_KEY = 'nav_tabs_pinned_v1';

export type Persona = 'farmer' | 'shipper' | 'new';

/** Tín hiệu domain rút từ state.farm (CHỈ ĐỌC — không giữ tham chiếu store). */
export interface FarmSignal {
  farms: number;
  trees: number;
  fruits: number;
}

/** Bản đồ tần suất mở từng route (đọc từ AsyncStorage/analytics). */
export type UsageMap = Record<string, number>;

/**
 * Suy PERSONA từ dữ liệu user (§2.2). Tái dùng tinh thần `domain(user)` của SG4:
 * có vườn/đàn (farm signal) → nông dân; chưa có dữ liệu nhưng dùng Work nhiều →
 * shipper; còn lại → user mới (chuẩn).
 *
 * Lưu ý: hiện app CHƯA có slice "hoạt động Work" / "nhu cầu khai báo onboarding"
 * nên nhánh `shipper` chỉ kích hoạt khi `usage` có tín hiệu Work — sẵn sàng cho
 * khi nguồn dữ liệu đó xuất hiện (thêm KHÔNG đụng navbar).
 */
export function resolvePersona(farm: FarmSignal, usage: UsageMap): Persona {
  const hasFarm = farm.farms > 0 || farm.trees > 0 || farm.fruits > 0;
  if (hasFarm) return 'farmer';

  const work = usage.WorkHome ?? 0;
  const farmInterest = usage.Farms ?? 0;
  // Không có farm mà dùng Work (≥ quan tâm Farm) → shipper.
  if (work > 0 && work >= farmInterest) return 'shipper';

  return 'new';
}

/**
 * DANH SÁCH route HIỂN THỊ theo thứ tự vẽ (trái → phải), gồm cả 'Home' ở giữa.
 *
 * @param farm       tín hiệu domain (state.farm)
 * @param usage      tần suất mở route
 * @param pinned     ghim của user (mảng route SLOT) — ĐÈ persona; null = chưa ghim
 * @param isAvailable route có thực sự tồn tại trong instance này không (mặc định:
 *                    luôn true). Dùng để lọc slot cho instance suy biến (bật ít
 *                    module hơn) — KHÔNG vẽ nút cho module chưa bật.
 */
export function resolveVisibleTabs(
  farm: FarmSignal,
  usage: UsageMap,
  pinned: string[] | null,
  isAvailable: (route: string) => boolean = () => true,
  /** Bảng của app đang chạy. Vắng = bảng nền dùng chung — xem `slotPriority`. */
  table: SlotPriorityTable = DEFAULT_SLOT_PRIORITY,
): string[] {
  // Chọn nguồn ưu tiên: ghim của user ĐÈ tất cả; nếu không, theo persona.
  let candidates: string[];
  if (pinned && pinned.length > 0) {
    // Ghim trước, rồi bù bằng ưu tiên CỦA APP để luôn đủ SLOT_COUNT ô. Bù bằng
    // bảng nền là lý do cũ khiến app khai thứ tự riêng vẫn ra thanh giống hệt
    // nhau ngay khi người dùng có ghim.
    candidates = [...pinned, ...table.default];
  } else {
    const persona = resolvePersona(farm, usage);
    candidates = slotPriority(persona, table);
  }

  // Lọc theo route có mặt + KHÔNG trùng NEO + KHÔNG trùng lặp, lấy đúng SLOT_COUNT.
  const seen = new Set<string>([NEO_LEFT, NEO_CENTER, NEO_RIGHT]);
  const slots: string[] = [];
  for (const route of candidates) {
    if (slots.length >= SLOT_COUNT) break;
    if (seen.has(route)) continue;
    if (!isAvailable(route)) continue;
    seen.add(route);
    slots.push(route);
  }

  // Dựng hàng: Chat · slot0 · (Home) · slot1 · Me. Nếu thiếu slot (instance suy
  // biến) thì bỏ ô trống tương ứng — thanh vẫn cân, chỉ ít ô hơn.
  const row = [NEO_LEFT, slots[0], NEO_CENTER, slots[1], NEO_RIGHT];
  return row.filter((r): r is string => !!r && isAvailable(r));
}
