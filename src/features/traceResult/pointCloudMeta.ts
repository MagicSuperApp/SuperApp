// features/traceResult/pointCloudMeta.ts
//
// DÒNG CHỮ DƯỚI Ô KHỐI 3D — ĐƯỢC KHẲNG ĐỊNH GÌ, KHI NÀO.
//
// ══ Lỗi đang vá ═══════════════════════════════════════════════════════════════
// `TreePointCloudView` có năm nhánh hỏng, và cả năm đều vẽ một câu báo hỏng vào
// trong ô. Nhưng NGAY DƯỚI ô đó, bản cũ vẫn in tiếp hai dòng:
//
//     const count = result?.kind === 'ok' ? result.count : (declaredPoints ?? null);
//     …
//     {count !== null ? `${count} điểm dựng từ ảnh chụp thật` : null}
//     {advice ? advice : null}
//
// Nhánh dự phòng `?? declaredPoints` lấy con số MÁY CHỦ KHAI rồi in ra dưới câu
// "dựng từ ảnh chụp thật" — một lời khẳng định về phép ĐO, cho đúng cái tệp mà
// app vừa nói là không mở được. Ca `gone` là ca nặng nhất: câu trong ô nói kho
// lưu trữ không còn phục vụ tệp này và cố ý KHÔNG bày nút thử lại, rồi ngay dưới
// là "2.048 điểm dựng từ ảnh chụp thật". Người đọc có mọi lý do để tin cây vẫn
// còn khối 3D.
//
// Chú thích ba dòng trên chỗ hỏng đã nói đúng luật — "ưu tiên số ĐỌC ĐƯỢC từ
// tệp… ưu tiên số khai sẽ giấu nó đi" — còn dòng mã ngay bên dưới thì làm ngược
// lại ở đúng nhánh mà nó cảnh báo. Chú thích không chặn được gì; hàm này chặn.
//
// Nhà OriLife báo cùng hình dạng này ở phía họ (thư `ol-pr-wave-445`, mục 2): một
// `.ply` cụt từng trả `{n_points: 0, low_confidence: false, "…đủ dày…"}` đứng cạnh
// `points: []`, và app hiện chữ "đủ dày" trên màn hình trống. Hai chỗ khác nhau,
// cùng một kiểu hỏng: một con số đi kèm một lời trấn an, không con nào đo được.
//
// ══ Luật ══════════════════════════════════════════════════════════════════════
// Chỉ khi ĐỌC ĐƯỢC tệp, app mới được nói "dựng từ ảnh chụp thật". Chưa đọc được
// thì con số của máy chủ vẫn hiện — nó là dữ kiện có ích — nhưng phải mang nhãn
// KHAI, không mang nhãn ĐO. Còn câu độ phủ (`coverage.advice`) thì tả một đám mây
// điểm mà app không lấy được, nên nó im.
//
// ══ `low_confidence` — đọc khi có, không suy khi vắng ══════════════════════════
// OriLife PR #445 (CHƯA gộp lúc viết) thêm `trust.low_confidence`: có bản dựng thì
// LUÔN có phán quyết, 0 điểm là fail-closed `true`. Ngưỡng thưa của họ là 1120
// điểm còn trung vị thật là 496 ⇒ PHẦN LỚN cây sẽ gắn cờ. Nên cờ này KHÔNG được
// vẽ như ngoại lệ hiếm (biển đỏ, hộp cảnh báo) — nó là một dòng chú.
//
// Trường vắng ⇒ `undefined` ⇒ app KHÔNG kết luận gì. Máy chủ bản cũ không nói,
// không có nghĩa là nói "đáng tin".
//
// ⛔ KHÔNG dựng tỉ lệ `n_points / n_points_scene`. OriLife khai `n_points_scene`
// có thể là `null` = KHÔNG BIẾT, và làn cây thì không đo số này lần nào. Bản trước
// của họ mặc định nó về chính `n_points` ⇒ tỉ lệ ra 1,00 = "tách nền hoàn hảo" cho
// đúng cái làn không lọc nền một lần nào. Kho này hiện sạch — đừng thêm vào.

/** Tệp đã đọc tới đâu. `failed` gộp cả năm nhánh hỏng của bộ tải. */
export type CloudLoadState = 'loading' | 'ok' | 'failed';

export interface PointCloudMeta {
  /**
   * Số điểm ĐỌC ĐƯỢC từ tệp. Chỉ số này mới được đi kèm câu "dựng từ ảnh chụp
   * thật". `null` ⇒ không in dòng đó.
   */
  measuredPoints: number | null;
  /**
   * Số điểm máy chủ KHAI, dùng khi app chưa đọc được tệp. Chỗ gọi phải in kèm
   * chữ "máy chủ khai" — in trần là quay lại đúng lỗi cũ.
   */
  declaredPoints: number | null;
  /** Câu độ phủ của máy chủ, hiện nguyên văn. `null` ⇒ im. */
  advice: string | null;
  /**
   * Máy chủ tự khai đám mây thưa (`trust.low_confidence === true`). Chỉ đúng khi
   * app ĐỌC ĐƯỢC tệp — chưa đọc được thì đã có dòng khác nói rồi, chồng thêm một
   * lời cảnh báo nữa là hai câu tranh nhau.
   */
  lowConfidence: boolean;
}

export interface PointCloudMetaInput {
  state: CloudLoadState;
  /** Số điểm bộ tải đếm được. Chỉ có nghĩa khi `state === 'ok'`. */
  readCount?: number | null;
  /** `model3d.n_points` của máy chủ. */
  declared?: number | null;
  /** `model3d.coverage.advice` — câu tiếng Việt của máy chủ. */
  advice?: string | null;
  /** `model3d.trust.low_confidence`. `undefined` = máy chủ không nói. */
  lowConfidence?: boolean | null;
}

/** Số nguyên không âm mới là số điểm. Số âm / NaN / `Infinity` ⇒ không có. */
function countOf(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

export function pointCloudMeta(input: PointCloudMetaInput): PointCloudMeta {
  const advice = typeof input.advice === 'string' && input.advice.trim()
    ? input.advice.trim()
    : null;

  if (input.state === 'ok') {
    return {
      measuredPoints: countOf(input.readCount),
      declaredPoints: null,
      advice,
      lowConfidence: input.lowConfidence === true,
    };
  }

  // Đang tải: chưa đo được gì, mà cũng chưa hỏng. In số khai lúc này là dựng một
  // con số lên trước khi có phép đo, rồi nó đổi khi tệp về — hoặc không đổi vì
  // tệp không về. Im cho tới khi biết.
  if (input.state === 'loading') {
    return { measuredPoints: null, declaredPoints: null, advice: null, lowConfidence: false };
  }

  return {
    measuredPoints: null,
    declaredPoints: countOf(input.declared),
    advice: null,
    lowConfidence: false,
  };
}
