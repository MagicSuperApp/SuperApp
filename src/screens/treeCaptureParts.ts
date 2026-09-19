/**
 * Chia ảnh chụp cây thành THÂN và GỐC — bằng số đo, không bằng nút bấm.
 *
 * ── Vì sao tệp này tồn tại ─────────────────────────────────────────────────
 *
 * Màn nhận diện cũ bắt người dùng bấm "Lượt 2: Cận gốc" giữa chừng. Chủ sở hữu
 * bác 2026-09-19, nguyên văn đáng giữ vì nó mô tả đúng hiện trường:
 *
 *   *"Thực tế khi tôi test, cứ lia quanh cây tới vài chục tấm chứ k phải chỉ có
 *   4 [...] Đừng bắt nông dân phải dừng lại chuyển nút bấm giữa chừng."*
 *
 * Ba số đo làm cái nút đó thành vô nghĩa, đo trong kho này 2026-09-19:
 *
 *  1. **Nhãn lượt KHÔNG BAO GIỜ rời điện thoại.** `identifyTree`
 *     (`treeReIDService.ts:919`) gửi `files[]`, toạ độ, `source`, và `view_poses`
 *     — một mảng `{heading, pitch, roll}` song song từng ảnh. Không có trường
 *     `round`/`part`/`kind` nào. Người dùng dừng tay để tạo một thông tin mà
 *     chính app vứt đi trước khi gửi.
 *  2. **Máy đã tự chụp gốc rồi.** Điều kiện tự chụp của tầng native là
 *     `|Δheading| ≥ 25°` HOẶC `|Δpitch| ≥ 18°` kèm máy đứng yên
 *     (`HeadingCaptureManager.swift:226-239`, bản Kotlin đối xứng ở `:77`), và
 *     KHÔNG có nhánh nào theo lượt. Chĩa máy xuống gốc là nó chụp. Cái nút chỉ
 *     dán nhãn cho những tấm vốn đã được chụp.
 *  3. **Trần 12 ảnh mỗi lượt là mã chết.** `maxCapturesPerRound`
 *     (`TreeReIDConfig.swift:62`) không nơi nào đọc. Lia vài chục tấm vẫn chạy.
 *
 * ── Tín hiệu dùng, và giới hạn của nó ──────────────────────────────────────
 *
 * Dùng `pitch` — góc chúc/ngẩng của ống kính — vì đó là thứ DUY NHẤT phân biệt
 * được hai tư thế mà app có sẵn ngay lúc chụp: sự kiện `CaptureTriggered` chở
 * `{captureId, heading, pitch, round, totalCaptures}`
 * (`treeReIDNativeBridge.ts:64-70`), nên không phải đợi hết phiên và không phải
 * sửa gì bên native.
 *
 * ⚠ **Đây là tín hiệu GIÁN TIẾP, và nó không nhìn thấy cái cây.** Một ảnh có cả
 * thân lẫn gốc thì pitch không tách được — việc tách đó là của mô hình bên máy
 * chủ, đã gửi thư đề nghị nhà OriLife. Chừng nào máy chủ chưa trả nhãn từng ảnh
 * thì bảng này là bản TẠM, và vì nó tạm nên `applyManualPart` phải tồn tại.
 *
 * ── Vì sao lấy TRUNG VỊ làm mốc, không lấy trung bình ──────────────────────
 *
 * Mốc phải là tư thế "lia ngang quanh thân", và không được gõ cứng một góc
 * tuyệt đối: người cao người thấp, cầm máy ngang ngực hay ngang mắt, pitch tuyệt
 * đối lệch nhau cả chục độ. Nên mốc lấy từ chính loạt ảnh của người đó.
 *
 * Trung vị chứ không trung bình, vì phân bố ở đây lệch HẲN về một phía: đo trên
 * 17 video lia quanh cây sầu riêng (`~/durian_reid`, rút 2 hình/giây ra 883
 * khung, 40–78 khung mỗi cây), phần lớn khung là lia ngang, số khung chúc xuống
 * gốc là thiểu số và lệch rất xa. Trung bình bị đúng nhóm thiểu số ấy kéo đi,
 * và kéo theo cả ngưỡng — càng chụp gốc nhiều thì mốc càng trôi xuống, tới lúc
 * ảnh gốc tự xếp thành "thân". Trung vị không có đường hỏng đó.
 */

/** Một ảnh thuộc phần nào của cây. */
export type TreePart = 'trunk' | 'base' | 'unknown';

/** Thứ duy nhất bảng này cần biết về một ảnh. */
export interface CaptureAngle {
  id: string;
  /** Góc chúc/ngẩng lúc chụp, độ. `null` khi máy không trả số (Android không native). */
  pitch: number | null;
}

/**
 * Lệch bao nhiêu độ so với mốc thì tính là ảnh gốc.
 *
 * 22° chọn theo ngưỡng `minPitchDelta = 18°` mà tầng native dùng để QUYẾT ĐỊNH
 * chụp (`TreeReIDConfig.swift:13`), nới nhẹ: một ảnh vừa đủ vượt ngưỡng chụp thì
 * chưa chắc đã là tư thế cận gốc, nó có thể chỉ là tay hơi rung khi lia ngang.
 * Lấy đúng 18° sẽ biến mọi cú lia hơi chúc thành "gốc".
 */
export const BASE_PITCH_DELTA = 22;

/** Cần ít nhất bao nhiêu góc thân / góc gốc thì nhận diện được. */
export const MIN_TRUNK = 4;
export const MIN_BASE = 2;

/**
 * Mốc pitch của loạt ảnh — trung vị, `null` khi không ảnh nào có số.
 *
 * Tách ra thành hàm riêng (thay vì gộp trong `partitionCaptures`) để bài kiểm
 * bắt được chính chỗ hay hỏng: một cú đổi trung vị → trung bình.
 */
export function referencePitch(angles: readonly CaptureAngle[]): number | null {
  const co = angles
    .map(a => a.pitch)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
    .sort((x, y) => x - y);
  if (co.length === 0) return null;
  const giua = Math.floor(co.length / 2);
  return co.length % 2 === 1 ? co[giua] : (co[giua - 1] + co[giua]) / 2;
}

export interface Partition {
  /** Nhãn của từng ảnh, tra theo `id`. */
  parts: Record<string, TreePart>;
  trunk: number;
  base: number;
  unknown: number;
  /** Mốc đã dùng — phơi ra để màn hình giải thích được khi cần, và để bài kiểm neo. */
  reference: number | null;
}

/**
 * Chia loạt ảnh thành thân/gốc.
 *
 * `manual` là các nhãn người dùng tự đặt (tra theo `id`). Nó ĐÈ lên máy chứ không
 * trộn với máy: chủ sở hữu chốt 2026-09-19 rằng phải sửa lại được nhưng KHÔNG
 * bắt buộc — *"đừng tin tưởng vào sự nỗ lực của người dùng"*. Nên đường mặc định
 * là không ai phải chạm gì, còn khi có người chạm thì ý họ thắng, không bị một
 * lượt tính lại nào ghi đè.
 *
 * Ảnh không có `pitch` ⟹ `'unknown'`, KHÔNG đệm thành `'trunk'`. Đếm nó vào thân
 * là làm thanh tiến độ báo đủ trong khi chưa đủ — đúng mẫu "cái vỏ im lặng" mà
 * `Forall` cấm: giá trị đệm đi tiếp vào phép so sánh ở chỗ khác và ở đó nó không
 * còn tự khai được là thiếu.
 */
export function partitionCaptures(
  angles: readonly CaptureAngle[],
  manual: Readonly<Record<string, TreePart>> = {},
): Partition {
  const reference = referencePitch(angles);
  const parts: Record<string, TreePart> = {};
  let trunk = 0;
  let base = 0;
  let unknown = 0;

  for (const a of angles) {
    const datTay = manual[a.id];
    let part: TreePart;
    if (datTay === 'trunk' || datTay === 'base') {
      part = datTay;
    } else if (reference == null || typeof a.pitch !== 'number' || !Number.isFinite(a.pitch)) {
      part = 'unknown';
    } else {
      part = Math.abs(a.pitch - reference) > BASE_PITCH_DELTA ? 'base' : 'trunk';
    }
    parts[a.id] = part;
    if (part === 'trunk') trunk++;
    else if (part === 'base') base++;
    else unknown++;
  }

  return { parts, trunk, base, unknown, reference };
}

/**
 * Bấm một ảnh trong dải xem lại thì nhãn đặt tay của nó đi tiếp một nấc.
 *
 * Ba nấc, và nấc thứ ba là nấc quan trọng nhất: `undefined` = TRẢ LẠI CHO MÁY
 * ĐOÁN. Không có nấc đó thì người dùng chạm nhầm một cái là mắc kẹt với nhãn sai
 * mà không có đường lui — và họ sẽ không biết rằng cái họ vừa khoá đè lên một
 * phán đoán vốn đúng.
 *
 * Thứ tự `undefined → trunk → base → undefined` chọn theo cái giá của việc chạm
 * nhầm: hai nấc đầu là hai nhãn thật, nấc ba đưa về nguyên trạng, nên chạm ba
 * lần là chắc chắn không làm hỏng gì.
 */
export function nextManualPart(current: TreePart | undefined): TreePart | undefined {
  if (current === 'trunk') return 'base';
  if (current === 'base') return undefined;
  return 'trunk';
}

export interface Missing {
  trunk: number;
  base: number;
  /** Đủ để bấm nhận diện chưa. */
  enough: boolean;
}

/**
 * Còn thiếu bao nhiêu góc mỗi phần.
 *
 * Ảnh `unknown` KHÔNG được tính bù vào bên nào — xem lý do ở `partitionCaptures`.
 */
export function missingParts(p: Partition): Missing {
  const trunk = Math.max(0, MIN_TRUNK - p.trunk);
  const base = Math.max(0, MIN_BASE - p.base);
  return { trunk, base, enough: trunk === 0 && base === 0 };
}
