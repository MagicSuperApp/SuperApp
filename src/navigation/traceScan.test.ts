// navigation/traceScan.test.ts
//
// SG9 §3 — kiểm chứng bộ phân giải mã QR truy xuất: chỉ nhận deep-link nội bộ
// lamp://, whitelist đích, tách params; mã lạ → null.

import { parseTraceCode, parseTreeCode } from './traceScan';

describe('parseTraceCode', () => {
  it('deep-link module có moduleId + route + params', () => {
    expect(parseTraceCode('lamp://trace/TreeDetail?treeId=abc123')).toEqual({
      route: 'TreeDetail',
      params: { treeId: 'abc123' },
    });
  });

  it('deep-link route trực tiếp (không moduleId)', () => {
    expect(parseTraceCode('lamp://FarmDetail?farmId=f1')).toEqual({
      route: 'FarmDetail',
      params: { farmId: 'f1' },
    });
  });

  it('không params → params bỏ trống', () => {
    expect(parseTraceCode('lamp://trace/TreeDetail')).toEqual({ route: 'TreeDetail' });
  });

  // ⚠️ KHOÁ TÊN KHOÁ, không chỉ khoá bộ phân giải. Ca này trước đây viết
  // `?id=a1` — bộ phân giải trả `params.id` đúng như khai, test XANH, mà
  // `AnimalDetailScreen` đọc `route.params.animalDid` ⇒ `undefined`, màn hiện
  // "Không có dữ liệu cá thể". Đúng mẫu "test xanh trên đường không ai đi được".
  // Khoá CHÍNH THỨC là `animalDid`, khớp lệ TreeDetail (`treeId`) / FarmDetail
  // (`farmId`): tên khoá trong QR phải TRÙNG thứ màn đích đọc.
  // Đầu đọc phía màn có test riêng: `screens/AnimalDetailScreen.test.tsx`.
  it('nhiều params + giải mã % — khoá vật nuôi là `animalDid`, khớp màn đích', () => {
    expect(parseTraceCode('lamp://AnimalDetail?animalDid=a1&name=B%C3%B2')).toEqual({
      route: 'AnimalDetail',
      params: { animalDid: 'a1', name: 'Bò' },
    });
  });

  it('route NGOÀI whitelist → null (không điều hướng bừa)', () => {
    expect(parseTraceCode('lamp://trace/SeedExport')).toBeNull();
    expect(parseTraceCode('lamp://Login')).toBeNull();
    // Đã thu whitelist: danh sách/dashboard/enroll KHÔNG phải đích soi-nguồn-gốc.
    expect(parseTraceCode('lamp://Farms')).toBeNull();
    expect(parseTraceCode('lamp://trace/Dashboard')).toBeNull();
    expect(parseTraceCode('lamp://Activity')).toBeNull();
    expect(parseTraceCode('lamp://TreeIdentity')).toBeNull();
    expect(parseTraceCode('lamp://AnimalIdentity')).toBeNull();
  });

  it('mã KHÔNG phải lamp:// → null', () => {
    expect(parseTraceCode('https://example.com/x')).toBeNull();
    expect(parseTraceCode('just some text')).toBeNull();
    expect(parseTraceCode('')).toBeNull();
  });

  it('bỏ khoảng trắng thừa, không phân biệt hoa/thường ở scheme', () => {
    expect(parseTraceCode('  LAMP://trace/TreeDetail  ')).toEqual({ route: 'TreeDetail' });
  });
});

// ---------------------------------------------------------------------------
// parseTreeCode — mã in trên bao bì
// ---------------------------------------------------------------------------
//
// Mã HỢP LỆ dùng chung cả nhóm: geohash7 chỉ chữ THƯỜNG bỏ a,i,l,o; crockford8 chỉ
// chữ HOA bỏ I,L,O,U (`server.py:718`). Sai một ký tự là mã khác — nên các ca sai
// bên dưới không phải "cho đủ", chúng khoá đúng bảng chữ.
const OK = 'ORI-w3gvfbq-A7K9PQ2M';

describe('parseTreeCode', () => {
  it('mã trần đúng khuôn ORI-{geohash7}-{crockford8}', () => {
    expect(parseTreeCode(OK)).toBe(OK);
    expect(parseTreeCode(`  ${OK}  `)).toBe(OK);
  });

  it('URL máy chủ nhúng vào QR (`{PUBLIC_BASE_URL}/t/{code}`) → rút được mã', () => {
    expect(parseTreeCode(`https://api.orilife.io/t/${OK}`)).toBe(OK);
    expect(parseTreeCode(`http://api.orilife.io/t/${OK}`)).toBe(OK);
    // Máy chủ `quote(code, safe='')` trước khi ghép — dấu `-` không bị mã hoá, nhưng
    // đường giải mã vẫn phải chạy đúng nếu một ngày mã có ký tự cần mã hoá.
    expect(parseTreeCode(`https://api.orilife.io/t/${encodeURIComponent(OK)}`)).toBe(OK);
    expect(parseTreeCode(`https://api.orilife.io/t/${OK}?utm=qr`)).toBe(OK);
  });

  // ⚠️ NHÓM NÀY KHOÁ ĐIỀU KIỆN, KHÔNG KHOÁ KẾT QUẢ. Nới `TREE_CODE_RE` thành
  // `[a-z0-9]{7}` / `[A-Z0-9]{8}` cho "gọn" vẫn qua được nhóm trên — chỉ những ca
  // dưới đây bắt được, vì mỗi ca đúng độ dài và chỉ sai BẢNG CHỮ.
  it('giữ bảng chữ geohash: a · i · l · o KHÔNG hợp lệ', () => {
    for (const bad of ['a', 'i', 'l', 'o']) {
      expect(parseTreeCode(`ORI-${bad}3gvfbq-A7K9PQ2M`)).toBeNull();
    }
  });

  it('giữ bảng chữ crockford: I · L · O · U KHÔNG hợp lệ', () => {
    for (const bad of ['I', 'L', 'O', 'U']) {
      expect(parseTreeCode(`ORI-w3gvfbq-${bad}7K9PQ2M`)).toBeNull();
    }
  });

  it('giữ HOA/THƯỜNG đúng chỗ: geohash hoa · crockford thường → null', () => {
    expect(parseTreeCode('ORI-W3GVFBQ-A7K9PQ2M')).toBeNull();
    expect(parseTreeCode('ORI-w3gvfbq-a7k9pq2m')).toBeNull();
  });

  it('giữ ĐỘ DÀI: thiếu hoặc thừa một ký tự → null', () => {
    expect(parseTreeCode('ORI-w3gvfb-A7K9PQ2M')).toBeNull();   // geohash 6
    expect(parseTreeCode('ORI-w3gvfbqz-A7K9PQ2M')).toBeNull(); // geohash 8
    expect(parseTreeCode('ORI-w3gvfbq-A7K9PQ2')).toBeNull();   // crockford 7
    expect(parseTreeCode('ORI-w3gvfbq-A7K9PQ2MN')).toBeNull(); // crockford 9
  });

  // Chặn ở máy để KHÔNG bắn chuỗi quét được tuỳ ý lên api.orilife.io.
  it('chuỗi lạ, rỗng, và mã nằm ở chỗ khác trong URL → null', () => {
    expect(parseTreeCode('')).toBeNull();
    expect(parseTreeCode('just some text')).toBeNull();
    expect(parseTreeCode('lamp://trace/TreeDetail')).toBeNull();
    // `ORI-…` nằm trong query của trang khác KHÔNG được nuốt thành mã: chỉ đoạn
    // ngay sau `/t/` mới tính.
    expect(parseTreeCode(`https://example.com/x?ref=${OK}`)).toBeNull();
    expect(parseTreeCode(`https://example.com/other/${OK}`)).toBeNull();
  });

  it('mã hỏng phần trăm trong URL → null, không đoán', () => {
    expect(parseTreeCode('https://api.orilife.io/t/%E0%A4%A')).toBeNull();
  });
});
