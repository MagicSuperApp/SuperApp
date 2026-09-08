// scripts/phoenixkey-contract.test.js
//
// Bài kiểm cho hàm phán quyết. Mục đích DUY NHẤT: chứng minh nó biết nói cả ba
// trạng thái, và chứng minh cái xanh của nó không rỗng.
//
// Vì sao phải có bộ này: phần gọi mạng chỉ chạy khi máy chủ của người khác đang
// sống, nên nếu chỉ có nó thì "hôm nay đỏ" là toàn bộ bằng chứng ta có — và nó
// không chứng minh được rằng ngày máy chủ được sửa thì thứ này sẽ chuyển xanh.
// Ở đây cả hai cực đều nạp được bằng dữ liệu.

const { STATE, verdict, exitCodeOf } = require('./phoenixkey-contract');

// Ảnh chụp phản hồi THẬT, đo 2026-09-08 trên api.phoenixkey.me. Giữ nguyên phong bì
// `{code, message, result}` — bản đầu của bộ này bịa một hình dạng phẳng, và phép đo
// thật lập tức báo "thiếu session_id" ở một máy chủ đang trả đủ.
const INIT_OK = {
  ok: true,
  status: 200,
  body: {
    code: 1000,
    message: 'Session created',
    result: {
      session_id: '1f1ab4ec-d610-60d0-ae48-61c7ca7183f6',
      challenge: '94ea3b97ede4c5317540fd51eea64247fab9c8ae320e199459211eb99a1f6881',
      temp_token: 'eyJraWQiOiJwaG9lbml4a2V5LWVkMjU1MTktMSIsImFsZyI6IkVkRFNBIn0.xxx.yyy',
      expires_at: 1788849336,
    },
  },
};
const APPROVE_401 = {
  ok: true,
  status: 401,
  body: { code: 1304, message: 'Unauthorized — Missing Bearer token' },
};
// Hình dạng SAU khi sửa: approve không còn tường Bearer, nên nó chạm tới bước đọc
// thân yêu cầu và từ chối vì thiếu chữ ký. 400 ở đây là câu trả lời ĐÚNG.
const APPROVE_400 = {
  ok: true,
  status: 400,
  body: { code: 1001, message: 'Invalid signature payload' },
};

const docs = (over = {}) => ({
  ok: true,
  doc: {
    security: [{ bearerAuth: [] }],
    paths: {
      '/auth/session/{sessionId}/approve': {
        post: { responses: { 200: {}, 403: {}, 404: {}, 409: {} }, ...over },
      },
    },
  },
});

const find = (v, id) => v.checks.find((c) => c.id === id);

describe('phán quyết hợp đồng PhoenixKey', () => {
  it('ĐỎ ở đúng hình dạng đang chạy hôm nay: approve bị 401/1304', () => {
    const v = verdict({ init: INIT_OK, approve: APPROVE_401, apiDocs: docs() });
    expect(v.state).toBe(STATE.VIOLATED);
    expect(find(v, 'approve-not-behind-bearer').state).toBe(STATE.VIOLATED);
    expect(find(v, 'approve-not-behind-bearer').note).toMatch(/401\/1304/);
    expect(exitCodeOf(v.state)).toBe(1);
  });

  it('XANH khi tường Bearer đã gỡ VÀ api-docs khai security riêng', () => {
    const v = verdict({
      init: INIT_OK,
      approve: APPROVE_400,
      apiDocs: docs({ security: [] }),
    });
    expect(v.state).toBe(STATE.OK);
    expect(v.checks.map((c) => c.state)).toEqual([STATE.OK, STATE.OK, STATE.OK]);
    expect(exitCodeOf(v.state)).toBe(0);
  });

  it('mọi mã KHÁC 401 đều tính là đã gỡ tường — bài canh không đòi approve trả 200', () => {
    for (const status of [400, 403, 404, 409]) {
      const v = verdict({
        init: INIT_OK,
        approve: { ok: true, status, body: {} },
        apiDocs: docs({ security: [] }),
      });
      expect([status, v.state]).toEqual([status, STATE.OK]);
    }
  });

  it('401 với mã KHÁC 1304 vẫn là vi phạm — tường vẫn đứng, chỉ đổi mã', () => {
    const v = verdict({
      init: INIT_OK,
      approve: { ok: true, status: 401, body: { code: 9999 } },
      apiDocs: docs({ security: [] }),
    });
    expect(v.state).toBe(STATE.VIOLATED);
  });

  it('máy chủ không với tới ⟹ KHÔNG ĐO ĐƯỢC, KHÔNG phải đạt', () => {
    const v = verdict({
      init: { ok: false, reason: 'ETIMEDOUT' },
      approve: { ok: false, reason: 'bỏ qua' },
      apiDocs: { ok: false, reason: 'ETIMEDOUT' },
    });
    expect(v.state).toBe(STATE.UNMEASURABLE);
    expect(exitCodeOf(v.state)).toBe(2);
    // Chỗ đắt nhất: nó KHÔNG được rơi vào 0.
    expect(exitCodeOf(v.state)).not.toBe(0);
  });

  it('init hỏng ⟹ mục approve là KHÔNG ĐO ĐƯỢC, không phải đạt ngầm', () => {
    const v = verdict({
      init: { ok: false, reason: 'ECONNREFUSED' },
      approve: APPROVE_400, // ngay cả khi có sẵn một phản hồi trông đẹp
      apiDocs: docs({ security: [] }),
    });
    expect(find(v, 'approve-not-behind-bearer').state).toBe(STATE.UNMEASURABLE);
    expect(v.state).toBe(STATE.UNMEASURABLE);
  });

  it('vi phạm ĐÃ BIẾT thắng không-đo-được — không hạ một cái đỏ xuống thành "không rõ"', () => {
    const v = verdict({
      init: INIT_OK,
      approve: APPROVE_401,
      apiDocs: { ok: false, reason: 'api-docs 502' },
    });
    expect(v.state).toBe(STATE.VIOLATED);
    expect(find(v, 'api-docs-self-consistent').state).toBe(STATE.UNMEASURABLE);
  });

  it('api-docs tự mâu thuẫn là một mục RIÊNG: approve đã sửa mà tài liệu chưa thì vẫn đỏ', () => {
    const v = verdict({ init: INIT_OK, approve: APPROVE_400, apiDocs: docs() });
    expect(v.state).toBe(STATE.VIOLATED);
    expect(find(v, 'approve-not-behind-bearer').state).toBe(STATE.OK);
    expect(find(v, 'api-docs-self-consistent').state).toBe(STATE.VIOLATED);
  });

  it('api-docs khai 401 tường minh thì hết mâu thuẫn — hợp đồng nói đúng một điều', () => {
    const v = verdict({
      init: INIT_OK,
      approve: APPROVE_400,
      apiDocs: docs({ responses: { 200: {}, 401: {}, 403: {}, 404: {}, 409: {} } }),
    });
    expect(find(v, 'api-docs-self-consistent').state).toBe(STATE.OK);
  });

  it('không tìm thấy operation approve ⟹ KHÔNG ĐO ĐƯỢC, không tự cho là đạt', () => {
    const v = verdict({
      init: INIT_OK,
      approve: APPROVE_400,
      apiDocs: { ok: true, doc: { security: [{ bearerAuth: [] }], paths: {} } },
    });
    expect(find(v, 'api-docs-self-consistent').state).toBe(STATE.UNMEASURABLE);
  });

  it('init trả 200 nhưng thiếu temp_token là VI PHẠM, không phải không-đo-được', () => {
    const v = verdict({
      init: { ok: true, status: 200, body: { session_id: 'sess_abc' } },
      approve: APPROVE_400,
      apiDocs: docs({ security: [] }),
    });
    expect(find(v, 'session-init-open').state).toBe(STATE.VIOLATED);
    expect(find(v, 'session-init-open').note).toMatch(/temp_token/);
  });

  it('luôn trả đủ ba mục, kể cả khi tổng đã đỏ ở mục đầu', () => {
    const v = verdict({ init: { ok: false, reason: 'x' } });
    expect(v.checks).toHaveLength(3);
    expect(v.checks.map((c) => c.id)).toEqual([
      'session-init-open',
      'approve-not-behind-bearer',
      'api-docs-self-consistent',
    ]);
  });
});
