/**
 * `200 {"ok": false}` — máy chủ TỪ CHỐI, và sáu cửa từng đọc nó thành "bạn chưa có gì".
 *
 * ── Ca được ghim ───────────────────────────────────────────────────────────
 * Máy chủ field-reid trả **HTTP 200** kèm thân
 * `{"ok": false, "error": "Tài khoản của bạn đang bị tạm khoá quyền xem vườn."}`.
 * Trước bản vá, phép đo trên chính mã này ra:
 *
 *     listFarms       → {"ok":true,"farms":[]}
 *     getFarm         → {"ok":false}                ← mất luôn câu `error`
 *     fetchTreeViews  → {"ok":true,"data":{"tree_id":"tree-1","n":0,"views":[]}}
 *
 * `syncFarmsFromBackend` đọc `res.ok && res.farms` ⟹ `source:'server'`,
 * `syncError: null` ⟹ app khẳng định *"đã đồng bộ xong và bạn có 0 vườn"* ⟹ người
 * dùng bấm "Tạo vườn" ⟹ bản ghi thứ hai trên máy chủ.
 *
 * ── Hai điều mỗi bài phải chứng minh, không phải một ───────────────────────
 * 1. Câu `error` của máy chủ đi ra **tới nơi gọi, nguyên văn**.
 * 2. Lần gọi bị từ chối phân biệt được với **danh sách rỗng THẬT** — hai trạng
 *    thái, hai màn hình.
 *
 * Phép so dùng `toMatch(/^…$/)` ghim TRỌN chuỗi. `toContain` là khớp chuỗi con
 * nên nó vẫn xanh khi câu bị cắt cụt hay bị bọc thêm chữ của app.
 */

jest.mock('./orilifeDidAuth', () => ({
  __esModule: true,
  ensureOrilifeToken: jest.fn(async () => true),
  clearOrilifeToken: jest.fn(async () => undefined),
  clearOrilifeLoginCooldown: jest.fn(),
}));

import { serverRejectionOf, isServerRejection, serverRejectionReason } from './serverRejection';
import { listFarms, getFarm, deleteFarm } from './farmService';
import { fetchTreeViews } from './treeViewsService';
import { getCapturePlan, captureHint } from './capturePlanService';
import { listGrants, resolveAccount } from './grantService';
import { getProvenance, getFruitDetail } from './provenanceService';
import { getTreeProfile, saveTreeProfile } from './treeProfileService';

const BASE = 'https://field.test';

/** Nguyên văn câu máy chủ nói. Nó nói được người dùng phải làm gì. */
const REFUSAL = 'Tài khoản của bạn đang bị tạm khoá quyền xem vườn.';
const REFUSAL_EXACT = /^Tài khoản của bạn đang bị tạm khoá quyền xem vườn\.$/;

/** HTTP 200, thân từ chối. Đúng hình dạng máy chủ thật đã trả trong PoC. */
function refusal200(reasonKey: 'error' | 'detail' | 'message' = 'error'): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ ok: false, [reasonKey]: REFUSAL }),
  } as unknown as Response;
}

/** HTTP 200, máy chủ ĐỒNG Ý và thứ nó trả về đúng là rỗng. */
function accepted200(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ ok: true, ...body }),
  } as unknown as Response;
}

function serveOnce(resp: Response): void {
  global.fetch = jest.fn(async () => resp) as never;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Hàm đọc — ba nhánh, và nhánh giữa là nhánh dễ làm hỏng nhất
// ---------------------------------------------------------------------------

describe('serverRejectionOf — đọc cờ NGHIỆP VỤ trong thân', () => {
  it('`ok: false` + câu lý do ⟹ lỗi mang NGUYÊN VĂN câu đó', () => {
    const e = serverRejectionOf({ ok: false, error: REFUSAL }, 200);
    expect(e).not.toBeNull();
    expect(e!.detail).toMatch(REFUSAL_EXACT);
    // `reason` là đường mà `syncErrorMessage`/`fieldErrorMessage` đọc TRƯỚC.
    expect(e!.reason).toMatch(REFUSAL_EXACT);
    // Mã HTTP giữ ĐÚNG 200 — đó là manh mối nói rằng cửa này từ chối bằng 200.
    expect(e!.http_status).toBe(200);
  });

  it('đọc được cả `detail` và `message`, không chỉ `error`', () => {
    expect(serverRejectionOf({ ok: false, detail: REFUSAL }, 200)!.detail).toMatch(REFUSAL_EXACT);
    expect(serverRejectionOf({ ok: false, message: REFUSAL }, 200)!.detail).toMatch(REFUSAL_EXACT);
  });

  it('`ok: false` mà máy chủ IM ⟹ câu đệm TỰ KHAI là máy chủ không nói lý do', () => {
    const e = serverRejectionOf({ ok: false }, 200)!;
    expect(e.detail).toMatch(/^Máy chủ từ chối yêu cầu nhưng không nói lý do\.$/);
    // Không bịa lời máy chủ: `reason` nghĩa là "máy chủ đã nói câu này".
    expect(e.reason).toBeUndefined();
  });

  it('`ok` VẮNG MẶT không phải một lời từ chối — phần lớn cửa không trả cờ này', () => {
    expect(serverRejectionOf({ farms: [] }, 200)).toBeNull();
    expect(serverRejectionOf({ ok: true, farms: [] }, 200)).toBeNull();
    expect(isServerRejection({})).toBe(false);
    expect(isServerRejection(null)).toBe(false);
    expect(serverRejectionReason({ ok: false, error: '   ' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sáu cửa
// ---------------------------------------------------------------------------

describe('farmService', () => {
  it('listFarms: từ chối ⟹ KHÔNG phải "bạn có 0 vườn"', async () => {
    serveOnce(refusal200());
    const res = await listFarms(BASE);

    expect(res.ok).toBe(false);
    expect(res.farms).toBeUndefined();
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
  });

  it('listFarms: danh sách rỗng THẬT ⟹ trạng thái KHÁC HẲN', async () => {
    serveOnce(accepted200({ farms: [] }));
    const res = await listFarms(BASE);

    expect(res.ok).toBe(true);
    expect(res.farms).toEqual([]);
    expect(res.error).toBeUndefined();
  });

  it('getFarm: câu `error` không còn bị đánh rơi', async () => {
    serveOnce(refusal200());
    const res = await getFarm(BASE, 'farm-1');

    expect(res.ok).toBe(false);
    expect(res.farm).toBeUndefined();
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
  });

  it('deleteFarm: từ chối ⟹ KHÔNG báo đã xoá', async () => {
    serveOnce(refusal200());
    const res = await deleteFarm(BASE, 'farm-1');

    expect(res.ok).toBe(false);
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
  });
});

describe('treeViewsService', () => {
  it('fetchTreeViews: từ chối ⟹ KHÔNG phải "cây này chưa có ảnh"', async () => {
    serveOnce(refusal200());
    const res = await fetchTreeViews(BASE, 'tree-1');

    expect(res.ok).toBe(false);
    expect(res.data).toBeUndefined();
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
  });

  it('fetchTreeViews: cây thật sự chưa có ảnh ⟹ trạng thái KHÁC', async () => {
    serveOnce(accepted200({ tree_id: 'tree-1', n: 0, views: [] }));
    const res = await fetchTreeViews(BASE, 'tree-1');

    expect(res.ok).toBe(true);
    expect(res.data?.n).toBe(0);
    expect(res.error).toBeUndefined();
  });
});

describe('capturePlanService', () => {
  it('getCapturePlan: từ chối ⟹ lỗi có câu máy chủ, KHÔNG phải kế hoạch câm', async () => {
    serveOnce(refusal200());
    const res = await getCapturePlan(BASE, 'tree', 'tree-1');

    expect(res.ok).toBe(false);
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
    // Trước bản vá: `res.ok === true`, `captureHint` trả `null`, màn chụp im lặng.
    expect(captureHint(res.data)).toBeNull();
  });
});

describe('grantService', () => {
  it('listGrants: từ chối ⟹ KHÔNG phải "bạn chưa chia sẻ cho ai"', async () => {
    serveOnce(refusal200());
    const res = await listGrants(BASE);

    expect(res.ok).toBe(false);
    expect(res.data).toBeUndefined();
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
  });

  it('resolveAccount: từ chối ⟹ `error`, KHÔNG phải `not_found`', async () => {
    serveOnce(refusal200());
    const res = await resolveAccount(BASE, 'nguoi-nhan');

    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.error.detail).toMatch(REFUSAL_EXACT);
  });
});

describe('provenanceService', () => {
  it('getProvenance: từ chối ⟹ `error` mang câu máy chủ, KHÔNG phải `not_public`', async () => {
    serveOnce(refusal200());
    const res = await getProvenance(BASE, 'tree-1');

    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.error.detail).toMatch(REFUSAL_EXACT);
  });

  it('getFruitDetail: từ chối ⟹ `error`, KHÔNG phải `not_found`', async () => {
    serveOnce(refusal200());
    const res = await getFruitDetail(BASE, 'fruit-1');

    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.error.detail).toMatch(REFUSAL_EXACT);
  });
});

describe('treeProfileService', () => {
  it('getTreeProfile: từ chối ⟹ KHÔNG phải hồ sơ rỗng', async () => {
    serveOnce(refusal200());
    const res = await getTreeProfile(BASE, 'tree-1');

    expect(res.ok).toBe(false);
    expect(res.profile).toBeUndefined();
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
  });

  it('saveTreeProfile: từ chối ⟹ KHÔNG báo đã lưu', async () => {
    serveOnce(refusal200());
    const res = await saveTreeProfile(BASE, 'tree-1', { variety: 'bưởi' });

    expect(res.ok).toBe(false);
    expect(res.error?.detail).toMatch(REFUSAL_EXACT);
  });
});
