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

  // ⚠️ CA NÀY TỪNG GHIM ĐÚNG CÁI KHOÁ SAI. Bản trước viết
  // `lamp://FarmDetail?farmId=f1` và kỳ vọng `params: { farmId: 'f1' }` — bộ phân
  // giải chỉ chép khoá nào có trong URL nên nó XANH, trong khi màn đích
  // `FarmDetailScreen.tsx` đọc `params.farm_id` (`const [farm_id, setFarm_id] =
  // useState(params.farm_id ?? null)`) ⇒ `undefined` ⇒ `farm` không bao giờ được
  // nạp ⇒ màn CHI TIẾT rơi xuống nhánh TẠO MỚI. Người quét QR một vườn đã có gặp
  // biểu mẫu trống, điền lại, và sinh ra vườn TRÙNG.
  //
  // Khoá CHÍNH THỨC của FarmDetail là `farm_id` — không phải chọn cho đẹp mà vì
  // MỌI lối vào trong app đã dùng nó (`DashboardScreen.tsx:497,511`,
  // `TreeEnrollScreen.tsx:783,1065`). Cái sai nằm ở QR, không nằm ở màn.
  //
  // ⛔ Đọc trước khi "sửa test cho xanh": nếu một bản sau lại thấy `farm_id` vướng
  // mắt và đổi ngược về `farmId`, thì đúng lỗi cũ quay lại y nguyên. Muốn đổi khoá
  // thì phải đổi ở MÀN ĐÍCH trước, rồi mới tới đây.
  it('deep-link route trực tiếp — khoá vườn là `farm_id`, khớp màn đích', () => {
    expect(parseTraceCode('lamp://FarmDetail?farm_id=f1')).toEqual({
      route: 'FarmDetail',
      params: { farm_id: 'f1' },
    });
  });

  it('QR mang khoá SAI (`farmId`) → null, KHÔNG mở màn chi tiết rỗng', () => {
    // Đây là ca đắt nhất của cả tệp: mở FarmDetail mà không có `farm_id` thì màn
    // đích không có gì để tra. Trả null để màn quét nói "chưa nhận diện" — thà
    // không đi đâu còn hơn đi tới một màn không nói được nó đang nói về vườn nào.
    expect(parseTraceCode('lamp://FarmDetail?farmId=f1')).toBeNull();
    expect(parseTraceCode('lamp://trace/TreeDetail?tree_id=t1')).toBeNull();
    expect(parseTraceCode('lamp://AnimalDetail?id=a1')).toBeNull();
  });

  it('thiếu hẳn khoá định danh → null', () => {
    expect(parseTraceCode('lamp://trace/TreeDetail')).toBeNull();
    expect(parseTraceCode('lamp://FarmDetail')).toBeNull();
    expect(parseTraceCode('lamp://AnimalDetail?name=B%C3%B2')).toBeNull();
    // Khoá có mặt nhưng RỖNG cũng không tra được gì.
    expect(parseTraceCode('lamp://FarmDetail?farm_id=')).toBeNull();
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
    expect(parseTraceCode('  LAMP://trace/TreeDetail?treeId=t1  ')).toEqual({
      route: 'TreeDetail',
      params: { treeId: 't1' },
    });
  });

  // Bảng route→khoá là một object tra theo chuỗi quét được. Tên thuộc tính có sẵn
  // trên `Object.prototype` phải KHÔNG được coi là route hợp lệ.
  it('tên thuộc tính của Object KHÔNG thành route', () => {
    expect(parseTraceCode('lamp://constructor?farm_id=f1')).toBeNull();
    expect(parseTraceCode('lamp://toString?farm_id=f1')).toBeNull();
    expect(parseTraceCode('lamp://__proto__?farm_id=f1')).toBeNull();
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
