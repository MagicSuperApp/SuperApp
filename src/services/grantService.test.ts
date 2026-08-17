/**
 * Chia sẻ cây/vườn — bốn cửa grant.
 *
 * Ba chỗ bài kiểm này khoá, cả ba đều thuộc họ "hỏng mà không có gì báo":
 *
 *   1. **Quyền ngoài `read_private`.** Kho grant lọc âm thầm rồi trả 400 với câu
 *      "Grant không hợp-lệ" — không nhắc chữ nào tới quyền. Người sửa đi tìm ở
 *      `scope_id`. Ở đây phải từ chối TẠI CHỖ, nêu đúng lý do.
 *   2. **`grantee` nhận tên người thay vì owner-ref.** Máy chủ vẫn tạo grant, và
 *      grant đó không bao giờ khớp ai. Chủ vườn tưởng đã chia sẻ.
 *   3. **`live` vắng mặt.** Suy từ `status === 'active'` là vẽ một cái khoá đang
 *      mở cho một grant đã hết hạn.
 */
import {
  createGrant,
  revokeGrant,
  listGrants,
  resolveAccount,
  isGrantLive,
  grantLabel,
  splitGrants,
  GRANT_PERMS,
  GRANT_SCOPES,
  type Grant,
} from './grantService';

jest.mock('./orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn(async () => false),
}));

const BASE = 'https://api.orilife.io';
const ME = 'acct:me-0001';
const BAN = 'acct:ban-0002';

const realFetch = globalThis.fetch;
const mockFetch = (status: number, body: unknown) => {
  globalThis.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  })) as unknown as typeof fetch;
};

/**
 * Ghi lại từng trường được nạp vào `FormData`.
 *
 * Không dùng `getParts()` của bản polyfill React Native: hàm đó có thể vắng, và
 * `?? []` khi nó vắng biến bài kiểm "KHÔNG gửi ttl_days" thành một bài luôn xanh
 * dù mã có gửi hay không — đúng cái vỏ im lặng mà tệp này đang đi khoá.
 */
const spyForm = () => {
  const sent: Array<[string, unknown]> = [];
  jest
    .spyOn(FormData.prototype, 'append')
    .mockImplementation(function (this: FormData, k: string, v: unknown) {
      sent.push([k, v]);
    } as never);
  return sent;
};

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

// Thân mẫu theo `grant_store.py:55-61` + ba trường làm giàu ở `server.py:4621-4624`.
const grant = (over: Partial<Grant> = {}): Grant => ({
  grant_id: 'g1',
  grantor: ME,
  grantee: BAN,
  scope_type: 'tree',
  scope_id: '11111111-2222-4333-8444-555555555555',
  perms: ['read_private'],
  created_at: '2026-08-17T03:00:00+00:00',
  expires_at: null,
  status: 'active',
  revoked_at: null,
  revoked_by: null,
  live: true,
  grantee_label: 'Bà Bán',
  grantor_label: 'Tôi',
  scope_label: 'cây Mai cafe',
  ...over,
});

describe('createGrant — chặn ở BIÊN thay vì để máy chủ trả câu lạc đề', () => {
  it('quyền hợp lệ → POST đúng đường, form đúng bốn trường, `grantee` là owner-ref', async () => {
    const sent = spyForm();
    mockFetch(200, { ok: true, grant: grant() });
    const r = await createGrant(BASE, {
      grantee: BAN,
      scopeType: 'tree',
      scopeId: 'cay-1',
      perms: ['read_private'],
    });
    expect(r.ok).toBe(true);
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${BASE}/api/grant`);
    expect(init.method).toBe('POST');
    expect(sent).toEqual([
      ['grantee', BAN],
      ['scope_type', 'tree'],
      ['scope_id', 'cay-1'],
      ['perms', 'read_private'],
    ]);
  });

  it('quyền ngoài danh sách → TỪ CHỐI tại chỗ, KHÔNG gọi mạng', async () => {
    mockFetch(200, { ok: true });
    const r = await createGrant(BASE, {
      grantee: BAN,
      scopeType: 'tree',
      scopeId: 'cay-1',
      perms: ['moderate' as never],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.detail).toContain('Quyền không hợp lệ');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('danh sách quyền rỗng → từ chối (máy chủ sẽ trả 400 không rõ lý do)', async () => {
    mockFetch(200, { ok: true });
    const r = await createGrant(BASE, {
      grantee: BAN,
      scopeType: 'tree',
      scopeId: 'cay-1',
      perms: [],
    });
    expect(r.ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('phạm vi lạ → từ chối tại chỗ', async () => {
    mockFetch(200, { ok: true });
    const r = await createGrant(BASE, {
      grantee: BAN,
      scopeType: 'con-vat' as never,
      scopeId: 'x',
      perms: ['read_private'],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.detail).toContain('VƯỜN hoặc một CÂY');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('thiếu người nhận → từ chối, không tạo grant mồ côi', async () => {
    mockFetch(200, { ok: true });
    const r = await createGrant(BASE, {
      grantee: '   ',
      scopeType: 'tree',
      scopeId: 'cay-1',
      perms: ['read_private'],
    });
    expect(r.ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('403 của máy chủ giữ NGUYÊN câu tiếng Việt, không nuốt thành "HTTP 403"', async () => {
    mockFetch(403, { detail: 'Cây này không thuộc tài khoản của bạn.' });
    const r = await createGrant(BASE, {
      grantee: BAN,
      scopeType: 'tree',
      scopeId: 'cay-cua-nguoi-khac',
      perms: ['read_private'],
    });
    expect(r.ok).toBe(false);
    expect(r.error?.detail).toBe('Cây này không thuộc tài khoản của bạn.');
  });

  it('`ttlDays` hợp lệ → gửi `ttl_days` dạng số nguyên', async () => {
    const sent = spyForm();
    mockFetch(200, { ok: true, grant: grant() });
    await createGrant(BASE, {
      grantee: BAN,
      scopeType: 'tree',
      scopeId: 'cay-1',
      perms: ['read_private'],
      ttlDays: 30.7,
    });
    expect(sent).toContainEqual(['ttl_days', '30']);
  });

  it('`ttlDays` không hợp lệ → KHÔNG gửi trường đó (vắng mặt = vô thời hạn)', async () => {
    for (const bad of [0, -5, NaN, null, undefined]) {
      const sent = spyForm();
      mockFetch(200, { ok: true, grant: grant() });
      await createGrant(BASE, {
        grantee: BAN,
        scopeType: 'tree',
        scopeId: 'cay-1',
        perms: ['read_private'],
        ttlDays: bad as number | null | undefined,
      });
      expect(sent.map(([k]) => k)).not.toContain('ttl_days');
      jest.restoreAllMocks();
    }
  });
});

describe('resolveAccount — "không có ai tên đó" là CÂU TRẢ LỜI, không phải sự cố', () => {
  it('200 → found, trả owner-ref để điền vào grantee', async () => {
    mockFetch(200, { ok: true, owner: BAN, username: 'baban' });
    const r = await resolveAccount(BASE, 'baban');
    expect(r.kind).toBe('found');
    if (r.kind !== 'found') return;
    expect(r.account.owner).toBe(BAN);
  });

  it('404 → not_found, KHÔNG phải error', async () => {
    mockFetch(404, { detail: 'Không tìm thấy tài khoản với tên này.' });
    const r = await resolveAccount(BASE, 'khong-co-ai');
    expect(r.kind).toBe('not_found');
  });

  it('tên rỗng → not_found ngay, không gọi mạng', async () => {
    mockFetch(200, { ok: true, owner: BAN, username: 'x' });
    const r = await resolveAccount(BASE, '   ');
    expect(r.kind).toBe('not_found');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('máy chủ hỏng → error, KHÔNG hoá thành "không có ai tên đó"', async () => {
    mockFetch(500, {});
    const r = await resolveAccount(BASE, 'baban');
    expect(r.kind).toBe('error');
  });

  it('tên được mã hoá vào query', async () => {
    mockFetch(200, { ok: true, owner: BAN, username: 'a b' });
    await resolveAccount(BASE, 'a b');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE}/api/account/resolve?username=a%20b`,
      expect.anything(),
    );
  });
});

describe('revokeGrant', () => {
  it('gọi DELETE đúng đường, có mã hoá', async () => {
    mockFetch(200, { ok: true });
    await revokeGrant(BASE, 'g/1');
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${BASE}/api/grant/g%2F1`);
    expect(init.method).toBe('DELETE');
  });

  it('mã rỗng → từ chối tại chỗ', async () => {
    mockFetch(200, { ok: true });
    const r = await revokeGrant(BASE, '');
    expect(r.ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('listGrants + splitGrants — hai chiều, đừng nhầm chiều', () => {
  it('200 → đọc đủ danh sách', async () => {
    mockFetch(200, { ok: true, grants: [grant(), grant({ grant_id: 'g2' })] });
    const r = await listGrants(BASE);
    expect(r.ok).toBe(true);
    expect(r.data?.grants).toHaveLength(2);
  });

  it('tách đúng cái mình CẤP và cái mình ĐƯỢC cấp', async () => {
    const given = grant({ grant_id: 'gA', grantor: ME, grantee: BAN });
    const received = grant({ grant_id: 'gB', grantor: BAN, grantee: ME });
    const s = splitGrants([given, received], ME);
    expect(s.given.map((g) => g.grant_id)).toEqual(['gA']);
    expect(s.received.map((g) => g.grant_id)).toEqual(['gB']);
    expect(s.unknown).toHaveLength(0);
  });

  it('KHÔNG biết mình là ai → không xếp bừa vào chiều nào', async () => {
    const s = splitGrants([grant()], null);
    expect(s.given).toHaveLength(0);
    expect(s.received).toHaveLength(0);
    expect(s.unknown).toHaveLength(1);
  });

  it('danh sách vắng mặt → ba nhóm rỗng, không nổ', () => {
    const s = splitGrants(undefined, ME);
    expect(s.given).toHaveLength(0);
    expect(s.unknown).toHaveLength(0);
  });
});

describe('isGrantLive — không đoán hiệu lực', () => {
  it('máy chủ khai `live` → dùng đúng cờ đó', () => {
    expect(isGrantLive(grant({ live: true }))).toBe(true);
    expect(isGrantLive(grant({ live: false }))).toBe(false);
  });

  it('`live` vắng mặt → null, KHÔNG suy từ `status: active`', () => {
    const g = grant({ status: 'active', expires_at: '2020-01-01T00:00:00+00:00' });
    delete g.live;
    expect(isGrantLive(g)).toBeNull();
    expect(isGrantLive(g)).not.toBe(true);
  });

  it('không có grant → null', () => {
    expect(isGrantLive(null)).toBeNull();
  });
});

describe('grantLabel — chuỗi rỗng không phải một cái tên', () => {
  it('có tên → trả tên', () => {
    expect(grantLabel(' Bà Bán ')).toBe('Bà Bán');
  });

  it('rỗng / null / không phải chuỗi → null', () => {
    expect(grantLabel('')).toBeNull();
    expect(grantLabel('   ')).toBeNull();
    expect(grantLabel(null)).toBeNull();
    expect(grantLabel(undefined)).toBeNull();
  });
});

describe('hằng số khoá theo kho grant của máy chủ', () => {
  it('đúng MỘT quyền — nới ở đây là nới ở máy chủ trước (`grant_store.py:32`)', () => {
    expect(GRANT_PERMS).toEqual(['read_private']);
  });

  it('đúng hai phạm vi (`grant_store.py:33`)', () => {
    expect([...GRANT_SCOPES].sort()).toEqual(['farm', 'tree']);
  });
});
