/**
 * animalSpecies — NGUỒN DUY NHẤT cho danh mục loài vật nuôi.
 *
 * ── Vì sao phải có tệp này ────────────────────────────────────────────────────
 * Trước đây bảng loài nằm rời ở BỐN màn (`AnimalEnrollScreen`, `AnimalDetailScreen`,
 * `AnimalIdentityScreen`, `AnimalManagementScreen`), mỗi màn một bản chép tay, và
 * cả bốn bản đều khoá theo tiếng Việt bỏ dấu: `ga · lon · de · bo · vit · ngong ·
 * cho · meo`.
 *
 * Máy chủ OriLife trả khoá TIẾNG ANH (`animal_config.py:45-54`):
 *
 *     cattle · chicken · goat · duck · pig · dog        (+ cow/buffalo → cattle)
 *
 * Giao của hai tập là RỖNG. Tức tám dòng kia chưa từng khớp một lần nào với loài
 * máy chủ thật sự trả về — và vì hàm tra có nhánh `?? s` nuốt mọi lần trượt, màn
 * hình chỉ lặng lẽ hiện "chicken", "cattle" cho nông dân. Không lỗi nào nổ ra, nên
 * nó sống được rất lâu.
 *
 * Năm dòng `bo`, `vit`, `ngong`, `cho`, `meo` cũng không thuộc danh mục nào của máy
 * chủ — chúng là danh sách tự viết, không phải bản sao lệch của một gốc có thật.
 * Nên tệp này viết lại THẲNG từ sáu khoá của máy chủ, không đối chiếu bảng cũ.
 *
 * ── Loài lạ thì nói thật ──────────────────────────────────────────────────────
 * `speciesLabel` KHÔNG còn rơi về chính khoá. Trượt phải nhìn thấy được thì lần
 * sau mới có người sửa — xem `UNKNOWN_LABEL`.
 *
 * Máy chủ từ chối loài ngoài danh sách bằng 422 kèm danh sách hợp lệ
 * (`animal_server_ext.py:136-138`), nên app không cần đoán.
 */

/** Sáu khoá máy chủ nhận. Thứ tự này là thứ tự hiện trên màn chọn loài. */
export const SPECIES_KEYS = ['chicken', 'pig', 'goat', 'cattle', 'duck', 'dog'] as const;
export type SpeciesKey = (typeof SPECIES_KEYS)[number];

/** Bí danh máy chủ tự quy đổi (`animal_server_ext.py:86`). App hiểu để hiện đúng nhãn. */
const ALIAS: Record<string, SpeciesKey> = { cow: 'cattle', buffalo: 'cattle' };

/** Nhãn nguồn (tiếng Việt) — lớp i18n tự dịch sang ngôn ngữ đang chọn. */
const LABEL: Record<SpeciesKey, string> = {
  chicken: 'Gà',
  pig: 'Lợn',
  goat: 'Dê',
  cattle: 'Bò',
  duck: 'Vịt',
  dog: 'Chó',
};

const ICON: Record<SpeciesKey, string> = {
  chicken: 'bird',
  pig: 'pig',
  goat: 'cow',
  cattle: 'cow',
  duck: 'bird',
  dog: 'dog',
};

/** Hiện khi khoá không thuộc danh mục — CỐ Ý không in khoá thô ra màn hình. */
export const UNKNOWN_LABEL = 'Loài chưa rõ';

function normalize(raw: string | undefined | null): SpeciesKey | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if ((SPECIES_KEYS as readonly string[]).includes(s)) return s as SpeciesKey;
  return ALIAS[s] ?? null;
}

/** Nhãn để HIỆN cho người dùng. Khoá lạ → `UNKNOWN_LABEL`, không phải khoá thô. */
export function speciesLabel(raw: string | undefined | null): string {
  const k = normalize(raw);
  return k ? LABEL[k] : UNKNOWN_LABEL;
}

/** Icon cho một khoá loài. Khoá lạ → icon trung tính. */
export function speciesIcon(raw: string | undefined | null): string {
  const k = normalize(raw);
  return k ? ICON[k] : 'paw';
}

/** Danh mục để dựng bộ chọn loài. */
export const SPECIES_OPTIONS: Array<{ key: SpeciesKey; label: string; icon: string }> =
  SPECIES_KEYS.map(k => ({ key: k, label: LABEL[k], icon: ICON[k] }));
