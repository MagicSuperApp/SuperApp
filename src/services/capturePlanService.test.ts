/**
 * `capture/plan` — cửa nói LÀM GÌ TIẾP, và ba chỗ nó dễ hỏng ÂM THẦM.
 *
 * Cả ba ca khoá dưới đây đều thuộc một họ: sai mà không có gì đỏ lên.
 *   1. Đọc `have` không rẽ theo `have_kind` — nhánh cây trả `undefined` cho mọi
 *      mặt, và thanh tiến độ vẽ từ `undefined` trông y hệt vẽ từ 0.
 *   2. Lấy `after_reject` sai chỗ (`messages` là câu cho người, không phải mã;
 *      `heterogeneous` là boolean ngoài cùng, không nằm trong `reasons`).
 *   3. Gửi mã lạ — máy chủ CỐ Ý không 4xx, nên nó trả kế hoạch thường và app
 *      tưởng mình đang hiện câu gỡ đúng cái vừa chặn.
 */
import {
  captureHint,
  coverageOf,
  facesOf,
  isPermanentPlanError,
  rejectCodeOf,
  suggestedFace,
  type CapturePlan,
} from './capturePlanService';

const TREE_PLAN: CapturePlan = {
  ok: true,
  target_type: 'tree',
  have_kind: 'coverage',
  have: { views: 4, poses: 2, weak_views: 1 },
  missing: [],
  thin: [],
  ready: false,
  next: { action: 'shoot_around', text_vi: 'Chụp thêm quanh gốc.' },
};

const FRUIT_PLAN: CapturePlan = {
  ok: true,
  target_type: 'fruit',
  have_kind: 'faces',
  have: { side: 5, bottom: 1 },
  n: 6,
  missing: ['stem'],
  thin: ['bottom'],
  ready: false,
  next: { action: 'shoot_face', view_type: 'bottom', need: 2, text_vi: 'Chụp thêm 2 tấm mặt đáy.' },
  why_vi: 'chưa có ảnh mặt cuống; còn ít ảnh mặt đáy',
};

describe('have_kind là chỗ BẮT BUỘC rẽ nhánh', () => {
  it('nhánh cây: facesOf trả null — KHÔNG trả object rỗng', () => {
    // Object rỗng cũng nguy: `(facesOf(p) ?? {}).side` vẫn ra undefined và vẽ được
    // thành 0. `null` buộc chỗ gọi phải quyết định, không lặng lẽ đi tiếp.
    expect(facesOf(TREE_PLAN)).toBeNull();
    expect(coverageOf(TREE_PLAN)).toEqual({ views: 4, poses: 2, weak_views: 1 });
  });

  it('nhánh quả: coverageOf trả null, facesOf trả số đếm theo mặt', () => {
    expect(coverageOf(FRUIT_PLAN)).toBeNull();
    expect(facesOf(FRUIT_PLAN)).toEqual({ side: 5, bottom: 1 });
  });

  it('máy chủ KHÔNG khai have_kind → cả hai đều null (không đoán theo target_type)', () => {
    const mo: CapturePlan = { ok: true, target_type: 'fruit', have: { side: 3 } };
    expect(facesOf(mo)).toBeNull();
    expect(coverageOf(mo)).toBeNull();
  });

  it('null/undefined không làm vỡ', () => {
    expect(facesOf(null)).toBeNull();
    expect(coverageOf(undefined)).toBeNull();
  });
});

describe('suggestedFace — thay cho việc viết cứng `side`', () => {
  it('lấy đúng mặt máy chủ chỉ định', () => {
    expect(suggestedFace(FRUIT_PLAN)).toBe('bottom');
  });

  it('`unknown` KHÔNG phải mặt chụp được → null', () => {
    // `unknown` là ô ĐẾM cho ảnh cũ chưa khai mặt. Để nó lọt ra bộ chọn là đặt
    // cho người dùng một mặt không tồn tại trên quả.
    const p: CapturePlan = { ...FRUIT_PLAN, next: { action: 'shoot_face', view_type: 'unknown' } };
    expect(suggestedFace(p)).toBeNull();
  });

  it('nhánh cây không có view_type → null, màn giữ nguyên lựa chọn người dùng', () => {
    expect(suggestedFace(TREE_PLAN)).toBeNull();
  });
});

describe('rejectCodeOf — ba nguồn, ba chỗ đọc khác nhau', () => {
  it('409 enroll: `heterogeneous` là boolean NGOÀI CÙNG, không nằm trong reasons', () => {
    expect(rejectCodeOf({ ok: false, error: 'nhiều cây', heterogeneous: true })).toBe('heterogeneous');
  });

  it('422: đọc `quality_warnings[].reasons[]`', () => {
    const body = {
      ok: false,
      error: 'Ảnh chưa đạt chất-lượng để bổ-sung góc.',
      quality_warnings: [{ idx: 0, reasons: ['mo'], messages: ['Ảnh hơi mờ, …'] }],
      messages: ['Ảnh hơi mờ, …'],
    };
    expect(rejectCodeOf(body)).toBe('mo');
  });

  it('KHÔNG lấy từ `messages` — đó là câu tiếng Việt cho người đọc, không phải mã', () => {
    const body = { ok: false, messages: ['Ảnh hơi mờ, chụp lại giúp em.'] };
    expect(rejectCodeOf(body)).toBeNull();
  });

  it('`heterogeneous: false` KHÔNG phải một mã — false không phải là từ chối vì lý do đó', () => {
    expect(rejectCodeOf({ ok: false, heterogeneous: false })).toBeNull();
  });

  it('mã lạ trong reasons bị bỏ, không truyền tiếp', () => {
    // Máy chủ cố ý KHÔNG 4xx với mã lạ ⇒ nó trả kế hoạch thường, im lặng. App
    // gửi mã lạ là tự làm mình tưởng đang hiện câu gỡ đúng chỗ.
    expect(rejectCodeOf({ quality_warnings: [{ reasons: ['low_self'] }] })).toBeNull();
    expect(rejectCodeOf({ quality_warnings: [{ reasons: ['better_other'] }] })).toBeNull();
  });

  it('lấy mã đầu tiên đọc được khi có nhiều ảnh cảnh báo', () => {
    const body = {
      quality_warnings: [
        { idx: 0, reasons: [] },
        { idx: 1, reasons: ['toi', 'nho'] },
      ],
    };
    expect(rejectCodeOf(body)).toBe('toi');
  });

  it('thân rác / rỗng / không phải object → null, không ném', () => {
    expect(rejectCodeOf(null)).toBeNull();
    expect(rejectCodeOf('mo')).toBeNull();
    expect(rejectCodeOf({})).toBeNull();
    expect(rejectCodeOf({ quality_warnings: 'mo' })).toBeNull();
  });
});

describe('isPermanentPlanError — thử lại vô ích vs thử lại có ích', () => {
  it('403/404/422 là vĩnh viễn (chủ khác / không tồn tại / target_type sai)', () => {
    for (const s of [403, 404, 422]) {
      expect(isPermanentPlanError({ type: 'validation_error', detail: '', http_status: s })).toBe(true);
    }
  });

  it('lỗi mạng và 5xx KHÔNG vĩnh viễn — thử lại có ích', () => {
    expect(isPermanentPlanError({ type: 'network_error', detail: '', http_status: 0 })).toBe(false);
    expect(isPermanentPlanError({ type: 'server_error', detail: '', http_status: 503 })).toBe(false);
  });

  it('không có lỗi → không phải lỗi vĩnh viễn', () => {
    expect(isPermanentPlanError(undefined)).toBe(false);
  });
});

describe('captureHint — dùng chung cho CẢ cây lẫn quả', () => {
  it('trả đúng câu máy chủ viết, không viết lại', () => {
    expect(captureHint(TREE_PLAN)).toBe('Chụp thêm quanh gốc.');
    expect(captureHint(FRUIT_PLAN)).toBe('Chụp thêm 2 tấm mặt đáy.');
  });

  it("action 'done' → null: đủ rồi thì đừng giục chụp nữa", () => {
    expect(captureHint({ ...TREE_PLAN, next: { action: 'done', text_vi: 'Đủ ảnh rồi.' } })).toBeNull();
  });

  it('chưa có kế hoạch / ok:false / thiếu next → null, KHÔNG bịa câu', () => {
    expect(captureHint(null)).toBeNull();
    expect(captureHint(undefined)).toBeNull();
    expect(captureHint({ ok: true })).toBeNull();
    expect(captureHint({ ...TREE_PLAN, ok: false })).toBeNull();
  });

  it('text_vi rỗng hoặc chỉ khoảng trắng → null, không hiện dòng trống', () => {
    expect(captureHint({ ...TREE_PLAN, next: { action: 'rotate', text_vi: '   ' } })).toBeNull();
    expect(captureHint({ ...TREE_PLAN, next: { action: 'rotate' } })).toBeNull();
  });

  it("giữ lại các action chỉ có sau một lượt bị từ chối ('wait' · 'need_light')", () => {
    // Ba action đó cũng là việc phải làm ngay, máy chủ đã viết sẵn câu cho từng cái.
    expect(captureHint({ ...TREE_PLAN, next: { action: 'wait', eta_seconds: 30, text_vi: 'Chờ 30 giây.' } }))
      .toBe('Chờ 30 giây.');
    expect(captureHint({ ...TREE_PLAN, next: { action: 'need_light', text_vi: 'Ra chỗ sáng hơn.' } }))
      .toBe('Ra chỗ sáng hơn.');
  });
});
