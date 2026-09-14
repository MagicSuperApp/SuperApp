// components/reid/animalCandidates.ts
/**
 * AnimalCandidate (máy chủ) → ReidCandidate (danh sách chọn cá thể).
 *
 * ⛔ Chỗ này từng hỏng CÂM. Bản cũ ghi khoá `tree_id` trong khi nơi đọc lấy
 *    `candidate.id`, lại bị `candidates={… as any}` che nên TypeScript không gác
 *    nổi. Hệ quả: bấm một ứng viên thì `onSelect` nhận `undefined` → mở hồ sơ
 *    rỗng. Bản cũ cũng bỏ luôn `sim` dù máy chủ có trả ⇒ mất huy hiệu % giống.
 *
 * Chú kiểu trả về `ReidCandidate` chính là cái gác: đổi tên khoá là `tsc` đỏ.
 *
 * ── Vì sao nó ở ĐÂY, không ở trong màn ──────────────────────────────────────
 * Nó từng sống trong `AnimalIdentityScreen.tsx`. Nay bước chọn ứng viên nằm
 * trong `AnimalWizard` (một BƯỚC của luồng, không phải một hộp thoại chồng lên
 * hộp thoại), nên hàm phải đứng ở chỗ cả hai cùng với tới được. Màn cũ vẫn xuất
 * lại tên này để bài kiểm `AnimalIdentityScreen.candidates.test.ts` giữ nguyên
 * đường nhập — bài đó khoá đúng lỗi kể trên và không có lý do gì phải dời.
 */

import type { ReidCandidate } from './ReidConfirmDialog';
import type { AnimalCandidate } from '../../services/animalReIDService';
import { speciesLabel } from '../../constants/animalSpecies';

export function toReidCandidates(list?: AnimalCandidate[]): ReidCandidate[] {
  return (list ?? []).map(
    (c): ReidCandidate => ({
      id: c.animal_did,
      name: c.name ?? '',
      sim: c.sim,
      species: c.species,
      code: c.species ? speciesLabel(c.species) : undefined,
      near_prev: c.near_prev,
      n_views: c.n_views,
    }),
  );
}
