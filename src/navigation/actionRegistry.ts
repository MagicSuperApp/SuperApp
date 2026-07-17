// navigation/actionRegistry.ts
//
// SG4 — MENU HÀNH ĐỘNG THÍCH ỨNG (Adaptive Action Menu).
//
// Cốt lõi (reviewer §6): menu nhanh của nút chính KHÔNG cố định "Quét cây/Quả/
// Vật". Nó phải hiện hành động THEO LOẠI CANH TÁC của user, tự suy từ dữ liệu đã
// đăng ký (farm/cây/vật) — không hỏi thêm. Cơ chế CONFIG-DRIVEN như module
// registry: mỗi DOMAIN khai một GÓI hành động ở đây; THÊM DOMAIN MỚI **không**
// phải sửa navbar/navigation. Menu chọn top 3–4 theo domain; tên nút ĐỘNG theo
// loài ("Quét ${loài}"). Màu theo NHÓM hành động (nhất quán xuyên domain).
//
// RÀNG BUỘC: thuần GIÁ TRỊ + hàm build khai báo (không eval/không tải động).
// Màu KHÔNG hardcode — tham chiếu ACTION_COLORS qua tên nhóm.

import { ACTION_COLORS } from '../theme';
import type { RootState } from '../store';

// ── Nhóm hành động → màu ngữ nghĩa (token, không hardcode hex) ──────────────
// quét = xanh lá · dinh dưỡng = hổ phách · sức khoẻ = đỏ · tạo = lam.
export type ActionGroup = 'scan' | 'nutrition' | 'health' | 'create';

export const ACTION_GROUP_COLOR: Record<ActionGroup, string> = {
  scan:      ACTION_COLORS.scan,
  nutrition: ACTION_COLORS.nutrition,
  health:    ACTION_COLORS.health,
  create:    ACTION_COLORS.create,
};

// ── Một hành động trong menu ────────────────────────────────────────────────
// route/params = ĐÍCH ĐIỀU HƯỚNG (định danh route đã đăng ký ở navigator). Menu
// chỉ tham chiếu bằng tên route — không nhúng component (giữ config thuần).
export interface ActionDef {
  key: string;
  icon: string;   // MaterialCommunityIcons
  label: string;  // nhãn 1 từ ưu tiên; ĐỘNG theo loài khi có
  group: ActionGroup;
  route: string;
  params?: Record<string, unknown>;
}

// ── Domain (loại canh tác) — mở rộng thoải mái, thêm KHÔNG đụng navbar ───────
export type Domain = 'durian' | 'tree' | 'animal' | 'onboarding';

// Ngữ cảnh suy ra từ dữ liệu user (loài chủ đạo) để dựng nhãn động.
export interface DomainContext {
  speciesLabel?: string; // vd "sầu riêng", "bò", "gà" — dùng cho "Quét ${loài}"
}

// Gói hành động của một domain = hàm build (nhận ngữ cảnh → danh sách hành động).
// Trả về THEO THỨ TỰ ưu tiên; menu lấy tối đa 4 mục đầu.
type ActionPack = (ctx: DomainContext) => ActionDef[];

// Hành động dùng lại (đích điều hướng có thật trong navigator hiện tại).
const scanTree = (label: string): ActionDef => ({
  key: 'scan-tree', icon: 'pine-tree', label, group: 'scan', route: 'TreeIdentity',
});
const scanFruit: ActionDef = {
  key: 'scan-fruit', icon: 'fruit-cherries', label: 'Quét quả', group: 'scan', route: 'FruitList',
};
// Thu VIDEO quả → gắn cây (OriLife User-Action-Flow). Quay native + upload fruit_video.
const fruitVideo: ActionDef = {
  key: 'fruit-video', icon: 'video-plus', label: 'Video quả', group: 'scan', route: 'FruitVideo',
};
const scanAnimal = (label: string): ActionDef => ({
  key: 'scan-animal', icon: 'paw', label, group: 'scan', route: 'AnimalManagement',
  params: { farmId: 'default' },
});
// Chăm sóc/dinh dưỡng & sức khoẻ dùng CareScan (ghi thuốc/phân qua ảnh nhãn).
// CareScan đọc params thủ (mặc định an toàn khi thiếu) — truyền targetType='farm'.
const nutrition = (label: string, icon: string): ActionDef => ({
  key: 'care-nutrition', icon, label, group: 'nutrition', route: 'CareScan',
  params: { targetType: 'farm', targetId: 'default', farmId: 'default' },
});
const health = (label: string, icon: string): ActionDef => ({
  key: 'care-health', icon, label, group: 'health', route: 'CareScan',
  params: { targetType: 'farm', targetId: 'default', farmId: 'default' },
});
const addFarm: ActionDef = {
  key: 'add-farm', icon: 'barn', label: 'Thêm vườn', group: 'create', route: 'FarmDetail',
};
const addHerd: ActionDef = {
  key: 'add-herd', icon: 'cow', label: 'Thêm đàn', group: 'create', route: 'FarmDetail',
};

// ── Bảng gói hành động theo domain (CONFIG-DRIVEN) ──────────────────────────
// Thêm một domain mới = thêm một entry ở đây; navbar/navigation KHÔNG đổi.
export const DOMAIN_PACKS: Record<Domain, ActionPack> = {
  // Trồng sầu riêng: quét cây (theo loài) · quét quả · bón phân · thêm vườn.
  durian: (ctx) => [
    scanTree(`Quét ${ctx.speciesLabel ?? 'sầu riêng'}`),
    fruitVideo,
    scanFruit,
    nutrition('Bón phân', 'watering-can'),
  ],
  // Cây trồng nói chung.
  tree: (ctx) => [
    scanTree(ctx.speciesLabel ? `Quét ${ctx.speciesLabel}` : 'Quét cây'),
    fruitVideo,
    scanFruit,
    nutrition('Chăm sóc', 'watering-can'),
  ],
  // Vật nuôi: quét vật (theo loài) · cho ăn · tiêm thuốc · thêm đàn.
  animal: (ctx) => [
    scanAnimal(ctx.speciesLabel ? `Quét ${ctx.speciesLabel}` : 'Quét vật'),
    nutrition('Cho ăn', 'silverware-fork-knife'),
    health('Tiêm thuốc', 'needle'),
    addHerd,
  ],
  // User MỚI (chưa có dữ liệu) → menu onboarding: các lối quét cơ bản + tạo vườn.
  onboarding: () => [
    scanTree('Quét cây'),
    scanFruit,
    scanAnimal('Quét vật'),
    addFarm,
  ],
};

// ── Nhãn loài thân thiện từ mã variety/species ──────────────────────────────
const VARIETY_LABEL: Record<string, string> = {
  ri6: 'sầu riêng',
  monthong: 'sầu riêng',
  musang_king: 'sầu riêng',
};

// Suy nhãn loài chủ đạo từ cây user đã đăng ký (nếu có). Chỉ dùng để dựng nhãn.
function dominantSpeciesLabel(state: RootState): string | undefined {
  const trees = state.farm?.trees ?? [];
  for (const t of trees) {
    const v = t.metadata?.variety;
    if (v && VARIETY_LABEL[v]) return VARIETY_LABEL[v];
    if (t.species) return t.species;
  }
  return undefined;
}

// ── Dò DOMAIN bằng HEURISTIC (đợt này) — không hỏi user ─────────────────────
// Ưu tiên bằng dữ liệu đã đăng ký. Vật nuôi hiện chưa nằm trong store nên chưa
// dò được tự động — khi có animal slice, bổ sung nhánh ở đây (KHÔNG đụng navbar).
// TODO(SG4): thay heuristic bằng suy domain đầy đủ từ farm.type + đàn vật nuôi.
export function resolveDomain(state: RootState): Domain {
  const trees = state.farm?.trees ?? [];
  const fruits = state.farm?.fruits ?? [];
  const farms = state.farm?.farms ?? [];

  const hasDurian = trees.some(
    (t) => (t.metadata?.variety && VARIETY_LABEL[t.metadata.variety]) || /sầu|durian/i.test(t.species ?? ''),
  );
  if (hasDurian) return 'durian';
  if (trees.length > 0 || fruits.length > 0) return 'tree';
  if (farms.length === 0 && trees.length === 0) return 'onboarding';
  return 'tree';
}

// ── API chính: danh sách hành động thích ứng cho menu (tối đa 4) ─────────────
export function resolveActions(state: RootState): ActionDef[] {
  const domain = resolveDomain(state);
  const ctx: DomainContext = { speciesLabel: dominantSpeciesLabel(state) };
  return DOMAIN_PACKS[domain](ctx).slice(0, 4);
}
