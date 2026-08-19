/**
 * speciesSuggest — đọc khối `species_suggest` mà `POST /api/enroll` trả kèm.
 *
 * Máy chủ OriLife (`9299637`, 19/08/2026) nay tự nhận được loài cây ngay ở lượt
 * đăng ký đầu tiên. Khối này CHỈ xuất hiện khi app **không** gửi `species` — gửi
 * rồi thì máy khỏi đoán.
 *
 *     "species_suggest": {
 *       "species":      "durio_zibethinus",
 *       "confidence":   0.83,      // [0..1]
 *       "confident":    false,     // true = được phép chọn sẵn THAY người
 *       "support_thin": true,      // máy CÓ đoán, nhưng nền nhãn chưa đủ để tự chốt
 *       "source":       "model",
 *       "ranked":       [{"species": "...", "confidence": 0.83}, ...]
 *     }
 *
 * ── Ba luật, và cả ba đều là chỗ dễ đọc sai ─────────────────────────────────
 *
 * 1. **VẮNG khối = máy không đoán ra, KHÔNG phải lỗi.** Hai ca gộp vào một chỗ
 *    vắng: cờ tắt, hoặc ảnh không đủ để phân loài. Cả hai đều rơi về đường cũ
 *    (người dùng tự chọn trong danh mục), nên nơi gọi chỉ cần `null` là đủ.
 *
 * 2. **Cổng là `confident`, KHÔNG phải `confidence`.** Hai tên chỉ khác một chữ
 *    cái mà nghĩa ngược hẳn nhau: `confidence` là điểm giống (luôn có số, luôn
 *    trông "đủ cao"), còn `confident` là phán quyết của máy chủ sau khi xét nền
 *    nhãn. Hôm nay `confident` LUÔN `false` vì ba trên bốn loài dưới sàn
 *    `OLT_TREE_SPECIES_MIN_SUPPORT = 5`. Đọc nhầm sang `confidence` là app tự
 *    chốt loài trong đúng lúc máy chủ nói nó chưa đủ căn cứ để chốt.
 *
 * 3. **`confident` không mở đường bỏ `set_species`.** Dù máy đoán đúng thì app
 *    VẪN phải gọi `POST /api/tree/set_species` — đó là chỗ duy nhất sinh ra nhãn,
 *    và máy chủ ghép nó với sự kiện `species_guess` thành cặp *(máy đoán, người
 *    chốt)*. Bỏ lần gọi đó vì "máy đoán đúng rồi" là cắt đúng sợi dây làm bộ nhận
 *    loài khoẻ lên, và khoá luôn cái sàn ở luật 2.
 */

/** Một mục trong bảng xếp hạng máy chủ trả. */
export interface RankedSpecies {
  species: string;
  /** `null` khi máy chủ không kèm số — vẫn dùng được, chỉ là không hiện điểm. */
  confidence: number | null;
}

export interface SpeciesSuggest {
  /** Mã loài máy đoán, ví dụ `durio_zibethinus`. Luôn khác rỗng. */
  species: string;
  confidence: number | null;
  /** Máy chủ cho phép app chọn sẵn thay người hay không. Xem luật 2 ở đầu tệp. */
  confident: boolean;
  /** Máy CÓ đoán, nhưng nền nhãn chưa đủ để tự chốt. */
  supportThin: boolean;
  source: string | null;
  /** Xếp hạng, đã lọc mục hỏng, giữ nguyên thứ tự máy chủ. Có thể rỗng. */
  ranked: RankedSpecies[];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Số trong dải [0..1]. `true`/`false` KHÔNG phải số dù JavaScript ép được —
 * `typeof true === 'boolean'` nên đã bị chặn, nhưng ghi ra đây vì `confidence`
 * nằm ngay cạnh `confident` trong cùng một object.
 */
function unit(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 0 || v > 1) return null;
  return v;
}

/** Chỉ `true` thật mới là `true`. Chuỗi `"true"`, số `1` đều KHÔNG tính. */
function flag(v: unknown): boolean {
  return v === true;
}

/**
 * Đọc khối `species_suggest` từ thân phản hồi `enroll`.
 *
 * Trả `null` khi vắng, hỏng, hoặc thiếu `species` — nơi gọi giữ nguyên đường cũ.
 */
export function parseSpeciesSuggest(raw: unknown): SpeciesSuggest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const species = str(o.species);
  // Không có mã loài thì cả khối vô nghĩa: không hiện được tên, không gửi lại được.
  if (!species) return null;

  const ranked: RankedSpecies[] = [];
  if (Array.isArray(o.ranked)) {
    for (const it of o.ranked) {
      if (!it || typeof it !== 'object') continue;
      const r = it as Record<string, unknown>;
      const id = str(r.species);
      if (!id) continue;
      ranked.push({ species: id, confidence: unit(r.confidence) });
    }
  }

  return {
    species,
    confidence: unit(o.confidence),
    confident: flag(o.confident),
    supportThin: flag(o.support_thin),
    source: str(o.source),
    ranked,
  };
}

/**
 * Thứ tự bày ra màn hình: đoán của máy ĐỨNG ĐẦU, phần còn lại giữ nguyên thứ tự
 * danh mục.
 *
 * Đây là toàn bộ phần "đổi màn CHỌN thành màn XÁC NHẬN": không thêm nút, không
 * ô đánh dấu sẵn — chỉ đưa cái máy đoán lên đầu và ghi rõ đó là máy đoán. Một
 * chạm là xong, mà cú chạm đó vẫn là lựa chọn thật của người dùng.
 *
 * Vì sao KHÔNG đánh dấu sẵn khi `confident === false`: máy chủ dùng chính lượt
 * người dùng chốt làm nhãn để huấn luyện. Ô đã tích sẵn thì cú "đồng ý" không
 * còn là bằng chứng độc lập, và tỉ lệ khớp đo từ đó chỉ là chặn trên. Hôm nay
 * `confident` luôn `false`, nên đường này là đường đang chạy.
 *
 * @param catalogIds mã loài theo thứ tự danh mục máy chủ trả
 * @param suggest    khối đã đọc, hoặc `null` khi máy không đoán
 */
export function orderSpeciesForConfirm(
  catalogIds: string[],
  suggest: SpeciesSuggest | null,
): string[] {
  const ids = catalogIds.filter((id) => typeof id === 'string' && id.trim());
  if (!suggest) return ids;
  const guess = suggest.species;
  // Máy đoán một loài KHÔNG có trong danh mục: không tự thêm vào. Danh mục là
  // nguồn tên hiển thị; thêm một mã trần vào đây là bày ra một ô không có chữ.
  if (!ids.includes(guess)) return ids;
  return [guess, ...ids.filter((id) => id !== guess)];
}
