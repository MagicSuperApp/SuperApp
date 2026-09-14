// navigation/actionRegistry.ts
//
// ⚠️ TỆP NÀY LÀ MÃ CHẾT — ĐỌC TRƯỚC KHI SỬA BẤT CỨ THỨ GÌ Ở ĐÂY.
//
// Đo 2026-08-18 (grep toàn `src/`): `resolveActions`, `DOMAIN_PACKS`, `resolveDomain`
// đều KHÔNG có nơi nào gọi. Cổng xoè đang SỐNG là `src/navigation/resolveGateItems.ts`,
// dùng ở `src/navigation/index.tsx:460`.
//
// Vì sao ghi cảnh báo này: đã có hai lượt rà kết luận "màn quét quả có lối vào rồi"
// chỉ vì thấy ô "Quét quả" khai ở đây. Ngoài đồng thì không nút nào mở được màn đó —
// máy chủ OriLife đếm 0/1859 lượt gọi `fruit/identify` suốt đợt thử thực địa.
// Khai một ô ở tệp này KHÔNG mở được lối nào. Muốn thêm lối vào: sửa `resolveGateItems.ts`.
//
// Giữ tệp lại vì thiết kế "menu theo loại canh tác" bên dưới vẫn là hướng đã chốt,
// chỉ là chưa ai nối. Ngày nối thì xoá khối cảnh báo này.
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
  icon: string;   // tên icon Font Awesome Solid (bộ Icon dùng chung)
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
  key: 'scan-tree', icon: 'tree', label, group: 'scan', route: 'TreeIdentity',
});
// "Quét quả" nay QUÉT THẬT: chụp quả → `POST /api/fruit/identify` soi ra quả nào,
// cây nào (xem `FruitScanScreen`). Trước đây nó trỏ `FruitList` — màn đó BẮT BUỘC
// có `treeId`, mà cổng xoè không kèm tham số nào, nên nút "Quét quả" chỉ dẫn tới
// một lời nhắc đi chọn cây. Đường chọn-cây-trước vẫn còn nguyên trong màn mới.
const scanFruit: ActionDef = {
  key: 'scan-fruit', icon: 'apple-whole', label: 'Quét quả', group: 'scan', route: 'FruitScan',
};
// Thu VIDEO quả → gắn cây (OriLife User-Action-Flow). Quay native + upload fruit_video.
const fruitVideo: ActionDef = {
  key: 'fruit-video', icon: 'video', label: 'Video quả', group: 'scan', route: 'FruitVideo',
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
  key: 'add-farm', icon: 'warehouse', label: 'Thêm vườn', group: 'create', route: 'FarmDetail',
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
    nutrition('Bón phân', 'droplet'),
  ],
  // Cây trồng nói chung.
  tree: (ctx) => [
    scanTree(ctx.speciesLabel ? `Quét ${ctx.speciesLabel}` : 'Quét cây'),
    fruitVideo,
    scanFruit,
    nutrition('Chăm sóc', 'droplet'),
  ],
  // Vật nuôi: quét vật (theo loài) · cho ăn · tiêm thuốc · thêm đàn.
  animal: (ctx) => [
    scanAnimal(ctx.speciesLabel ? `Quét ${ctx.speciesLabel}` : 'Quét vật'),
    nutrition('Cho ăn', 'utensils'),
    health('Tiêm thuốc', 'syringe'),
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

// ── Nhãn LOÀI suy từ mã GIỐNG ───────────────────────────────────────────────
// Hai tầng khác nhau, bảng này đi từ tầng dưới lên tầng trên: khoá là `variety`
// (GIỐNG — ri6 · monthong · musang_king), giá trị là `species` (LOÀI — sầu riêng).
// Không phải "nhãn của giống". Mọi giống sầu riêng đều suy ra cùng một loài, nên
// bảng nhiều-về-một là đúng, KHÔNG phải trùng lặp cần gộp.
const VARIETY_TO_SPECIES_LABEL: Record<string, string> = {
  ri6: 'sầu riêng',
  monthong: 'sầu riêng',
  musang_king: 'sầu riêng',
};

// Suy nhãn loài chủ đạo từ cây user đã đăng ký (nếu có). Chỉ dùng để dựng nhãn.
function dominantSpeciesLabel(state: RootState): string | undefined {
  const trees = state.farm?.trees ?? [];
  for (const t of trees) {
    const v = t.metadata?.variety;
    if (v && VARIETY_TO_SPECIES_LABEL[v]) return VARIETY_TO_SPECIES_LABEL[v];
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
    (t) => (t.metadata?.variety && VARIETY_TO_SPECIES_LABEL[t.metadata.variety]) || /sầu|durian/i.test(t.species ?? ''),
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
