#!/usr/bin/env node
// scripts/check-phoenixkey-contract.js
//
// Đo hợp đồng PhoenixKey trên máy chủ ĐANG CHẠY, rồi giao số đo cho hàm phán quyết
// thuần ở `phoenixkey-contract.js`. Tệp này KHÔNG chứa luật nào — nó chỉ đi lấy số.
//
// Vì sao có: lỗi #274 (cửa duy nhất cấp `session_token` lại đòi sẵn `session_token`)
// nằm ở máy chủ, không nằm trong kho này, nên KHÔNG bài kiểm đơn vị nào của kho này
// bắt được nó. Cái bắt được nó là một phép đo đối chiếu API thật, chạy định kỳ.
//
// ── Không cần credential ────────────────────────────────────────────────────
// `/auth/session/init` là cửa mở, nên toàn bộ phép đo dựng lại được bằng tay và
// chạy được ở CI mà không cần khoá nào. Đây là điều kiện để nó SỐNG: một bài canh
// đòi khoá là một bài canh sẽ bị tắt ở lần xoay khoá đầu tiên.
//
// Chạy tay:  node scripts/check-phoenixkey-contract.js
// Mã thoát:  0 đạt · 1 vi phạm · 2 KHÔNG đo được

'use strict';

const { STATE, payloadOf, verdict, exitCodeOf } = require('./phoenixkey-contract');

const BASE = process.env.PHOENIXKEY_BASE_URL || 'https://api.phoenixkey.me/api/v1';
const TIMEOUT_MS = Number(process.env.PHOENIXKEY_TIMEOUT_MS || 15000);

// Bọc `fetch` sao cho MỌI đường hỏng đều ra `{ ok: false, reason }`, không ném.
// Ném thì tiến trình chết ở giữa và ta mất luôn các mục đo được — mà "đo được một
// nửa" là thông tin, còn một traceback thì không.
async function probe(url, init) {
  const stop = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: stop });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 400) };
    }
    return { ok: true, status: res.status, body };
  } catch (e) {
    return { ok: false, reason: `${e.name}: ${e.message}` };
  }
}

async function main() {
  const init = await probe(`${BASE}/auth/session/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

  // Chỉ gọi approve khi init cho ra một session thật. Gọi bằng một id bịa thì mã trả
  // về nói về id đó chứ không nói về bức tường xác thực — đo sai đại lượng.
  const sessionId = init.ok ? payloadOf(init.body).session_id : null;
  const approve = sessionId
    ? await probe(`${BASE}/auth/session/${encodeURIComponent(sessionId)}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    : { ok: false, reason: 'không có session_id từ bước init' };

  const docsRes = await probe(`${BASE}/v3/api-docs`, { method: 'GET' });
  const apiDocs = docsRes.ok
    ? { ok: true, doc: docsRes.body }
    : { ok: false, reason: docsRes.reason };

  const v = verdict({ init, approve, apiDocs });

  const dau = { [STATE.OK]: '✓', [STATE.VIOLATED]: '✗', [STATE.UNMEASURABLE]: '?' };
  console.log(`Hợp đồng PhoenixKey — ${BASE}`);
  console.log(`Đo lúc ${new Date().toISOString()}\n`);
  for (const c of v.checks) {
    console.log(`${dau[c.state]} [${c.state}] ${c.id}`);
    console.log(`    ${c.note}`);
  }
  console.log(`\nTổng: ${v.state}`);
  if (v.state === STATE.UNMEASURABLE) {
    console.log(
      'KHÔNG ĐO ĐƯỢC không phải là ĐẠT. Bước này cố tình không trả 0 — một phép đo\n' +
        'im lặng lúc nó mù thì màu xanh của nó nói "tôi không biết" bằng giọng "ổn".',
    );
  }
  process.exit(exitCodeOf(v.state));
}

main();
