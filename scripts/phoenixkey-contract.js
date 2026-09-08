// scripts/phoenixkey-contract.js
//
// PHÁN QUYẾT hợp đồng PhoenixKey — hàm THUẦN, không chạm mạng.
//
// Vì sao tách khỏi phần gọi mạng: phần gọi mạng chỉ chạy được khi máy chủ của người
// khác đang sống, nên nếu logic phán quyết nằm chung trong đó thì không có cách nào
// chứng minh nó biết nói ĐỎ — mà đó mới là thứ duy nhất một bài canh cần chứng minh.
// Ở đây logic nhận đầu vào đã đo sẵn, nên bài kiểm nạp được cả hai cực.
//
// ── BA trạng thái, không phải hai ────────────────────────────────────────────
//   OK           đã đo ĐỦ, và mọi mục đạt
//   VIOLATED     đã đo, và có mục hỏng
//   UNMEASURABLE KHÔNG đo được (máy chủ không với tới, hình dạng lạ)
//
// Trạng thái thứ ba tồn tại vì trạng thái thứ hai không nói thay nó được: một phép
// đo trả về giá trị hợp lệ đúng lúc nó không đo được gì thì màu xanh của nó vô
// nghĩa — nó không nói "ổn", nó nói "tôi không biết" bằng giọng của "ổn".
//
// ── Thứ tự ưu tiên khi trộn ba trạng thái ────────────────────────────────────
// VIOLATED thắng UNMEASURABLE. Nghe ngược với câu "cái không đo được phải kêu to
// hơn", nhưng không ngược: một vi phạm ĐÃ BIẾT mà bị hạ xuống "không rõ" thì đúng
// là giấu. Còn OK thì đòi MỌI mục đã đo và đạt — không mục nào được vắng mặt mà
// vẫn xanh. Đó là chỗ chặn cái xanh rỗng.

'use strict';

const STATE = Object.freeze({
  OK: 'OK',
  VIOLATED: 'VIOLATED',
  UNMEASURABLE: 'UNMEASURABLE',
});

// Mã lỗi máy chủ trả khi interceptor chặn vì thiếu Bearer. Đo 2026-09-08 trên
// api.phoenixkey.me: HTTP 401 + {"code":1304,"message":"Unauthorized — Missing Bearer token"}.
const MISSING_BEARER_CODE = 1304;

/**
 * Bóc phong bì `{code, message, result}` mà máy chủ bọc quanh MỌI phản hồi.
 *
 * Đo 2026-09-08: `/auth/session/init` trả `{"code":1000,...,"result":{session_id,
 * challenge, temp_token, expires_at}}`. Bản đầu của tệp này đọc thẳng ở gốc nên
 * báo "thiếu session_id" — sai chỗ, đúng màu. Giữ `?? body` để nếu ngày nào máy chủ
 * bỏ phong bì thì phép đo không tự hỏng theo.
 *
 * Xuất ra ngoài để phần gọi mạng dùng CHUNG một cách bóc — hai chỗ tự bóc là hai
 * chỗ trôi khỏi nhau mà không có gì báo.
 */
function payloadOf(body) {
  if (body && typeof body === 'object' && body.result && typeof body.result === 'object') {
    return body.result;
  }
  return body ?? {};
}

/**
 * Mục 1 — `session/init` phải mở, và phải trả đủ hai thứ để bước sau chạy được.
 *
 * Đây vừa là một mục kiểm, vừa là ĐIỀU KIỆN ĐO của mục 2: không có `session_id`
 * thì không gọi approve được, nên mục 2 lúc đó là KHÔNG ĐO ĐƯỢC chứ không phải đạt.
 */
function checkInit(init) {
  if (!init || init.ok !== true) {
    return {
      id: 'session-init-open',
      state: STATE.UNMEASURABLE,
      note: `không với tới được /auth/session/init: ${init?.reason ?? 'không rõ'}`,
    };
  }
  if (init.status !== 200) {
    return {
      id: 'session-init-open',
      state: STATE.VIOLATED,
      note: `/auth/session/init trả ${init.status}, mong đợi 200 — đây là cửa mở, không cần xác thực`,
    };
  }
  const body = payloadOf(init.body);
  const missing = ['session_id', 'temp_token'].filter((k) => !body[k]);
  if (missing.length > 0) {
    return {
      id: 'session-init-open',
      state: STATE.VIOLATED,
      note: `/auth/session/init trả 200 nhưng thiếu trường: ${missing.join(', ')}`,
    };
  }
  return { id: 'session-init-open', state: STATE.OK, note: '200, có session_id + temp_token' };
}

/**
 * Mục 2 — approve KHÔNG được chặn bằng 401/1304.
 *
 * Khẳng định hẹp có chủ ý: nó KHÔNG đòi approve trả 200. Gọi approve bằng thân rỗng
 * thì hỏng là đúng — 400/403/404/409 đều là câu trả lời hợp lệ và đều chứng minh
 * điều cần chứng minh: bức tường xác thực không còn chặn trước khi máy chủ kịp nhìn
 * vào chữ ký trong thân yêu cầu.
 *
 * Khẳng định rộng hơn ("approve phải trả 200") sẽ đòi một chữ ký Hardware Key thật,
 * tức đòi một khoá — và một bài canh cần credential là bài canh sẽ bị tắt.
 */
function checkApproveNotBehindBearer(approve, initState) {
  if (initState !== STATE.OK) {
    return {
      id: 'approve-not-behind-bearer',
      state: STATE.UNMEASURABLE,
      note: 'không có session_id hợp lệ từ bước init nên không gọi được approve',
    };
  }
  if (!approve || approve.ok !== true) {
    return {
      id: 'approve-not-behind-bearer',
      state: STATE.UNMEASURABLE,
      note: `không với tới được /auth/session/{id}/approve: ${approve?.reason ?? 'không rõ'}`,
    };
  }
  // Mã lỗi nằm ở GỐC phong bì, không trong `result` — nên đọc thẳng, không `payloadOf`.
  const code = approve.body?.code;
  if (approve.status === 401 && code === MISSING_BEARER_CODE) {
    return {
      id: 'approve-not-behind-bearer',
      state: STATE.VIOLATED,
      note:
        `approve trả 401/${MISSING_BEARER_CODE} — cửa DUY NHẤT cấp session_token đang đòi sẵn ` +
        'một Bearer token mà chỉ chính nó cấp được. Luồng tự-ghép-cặp đứng.',
    };
  }
  if (approve.status === 401) {
    return {
      id: 'approve-not-behind-bearer',
      state: STATE.VIOLATED,
      note: `approve trả 401 với code ${String(code)} — vẫn là một bức tường xác thực đứng trước chữ ký`,
    };
  }
  return {
    id: 'approve-not-behind-bearer',
    state: STATE.OK,
    note: `approve trả ${approve.status} (không phải 401) — bức tường Bearer đã gỡ`,
  };
}

/**
 * Mục 3 — `api-docs` không được tự nói hai điều trái nhau về approve.
 *
 * Luật OpenAPI: khối `security` ở gốc áp cho MỌI operation không khai đè. Nên một
 * operation vừa nằm dưới `security: [{bearerAuth: []}]` toàn cục, vừa khai danh sách
 * mã lỗi KHÔNG có 401, là hợp đồng tự mâu thuẫn.
 *
 * Mục này tồn tại riêng vì mục 2 không thay nó được: gỡ ràng buộc ở interceptor mà
 * để tài liệu nguyên thì mục 2 xanh, còn tài liệu vẫn dạy người tiếp theo gắn lại
 * đúng cái chặn vừa gỡ.
 */
function checkApiDocsSelfConsistent(apiDocs) {
  if (!apiDocs || apiDocs.ok !== true) {
    return {
      id: 'api-docs-self-consistent',
      state: STATE.UNMEASURABLE,
      note: `không đọc được api-docs: ${apiDocs?.reason ?? 'không rõ'}`,
    };
  }
  const doc = apiDocs.doc ?? {};
  const op = doc.paths?.['/auth/session/{sessionId}/approve']?.post
    ?? doc.paths?.['/auth/session/{id}/approve']?.post;
  if (!op) {
    return {
      id: 'api-docs-self-consistent',
      state: STATE.UNMEASURABLE,
      note: 'không tìm thấy operation approve trong api-docs — đường dẫn có thể đã đổi tên tham số',
    };
  }
  const globalSecurity = Array.isArray(doc.security) && doc.security.length > 0;
  const hasOwnSecurity = Array.isArray(op.security);
  const declares401 = Object.keys(op.responses ?? {}).includes('401');

  if (globalSecurity && !hasOwnSecurity && !declares401) {
    return {
      id: 'api-docs-self-consistent',
      state: STATE.VIOLATED,
      note:
        'api-docs có security toàn cục, approve không khai security riêng, mà danh sách mã lỗi ' +
        'của nó lại không có 401 — hai chỗ trong cùng một tài liệu nói ngược nhau',
    };
  }
  return {
    id: 'api-docs-self-consistent',
    state: STATE.OK,
    note: hasOwnSecurity
      ? 'approve khai security riêng, hợp đồng nói đúng một điều'
      : 'không có mâu thuẫn giữa security toàn cục và danh sách mã lỗi',
  };
}

/**
 * Trộn ba mục thành một phán quyết.
 *
 * `checks` LUÔN được trả đủ ba mục kể cả khi tổng đã đỏ — người đọc cần biết mục nào
 * đo được, không chỉ biết màu cuối.
 */
function verdict(measured) {
  const init = checkInit(measured?.init);
  const approve = checkApproveNotBehindBearer(measured?.approve, init.state);
  const docs = checkApiDocsSelfConsistent(measured?.apiDocs);
  const checks = [init, approve, docs];

  let state;
  if (checks.some((c) => c.state === STATE.VIOLATED)) {
    state = STATE.VIOLATED;
  } else if (checks.some((c) => c.state === STATE.UNMEASURABLE)) {
    state = STATE.UNMEASURABLE;
  } else {
    state = STATE.OK;
  }
  return { state, checks };
}

// Mã thoát: 0 đạt · 1 vi phạm · 2 không đo được. Ba mã vì hai mã thì trạng thái thứ
// ba buộc phải mượn màu của một trong hai, và mượn màu nào cũng sai.
function exitCodeOf(state) {
  if (state === STATE.OK) return 0;
  if (state === STATE.VIOLATED) return 1;
  return 2;
}

module.exports = { STATE, MISSING_BEARER_CODE, payloadOf, verdict, exitCodeOf };
