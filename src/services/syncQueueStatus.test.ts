/**
 * Đọc một dòng hàng đợi đồng bộ — bốn chỗ dễ nói sai, cả bốn đều IM LẶNG.
 *
 * 1. Ba tình trạng "đang chờ sóng" · "máy chủ đang bận" · "cần người xử" đều để
 *    mục ở `status: 'pending'` trong CSDL. Không tách được ba cái đó thì màn hình
 *    bày một câu cho ba việc gỡ bằng ba cách khác nhau.
 * 2. `created_at` là `CURRENT_TIMESTAMP` của SQLite — giờ UTC, KHÔNG hậu tố múi
 *    giờ. Đọc thẳng là lệch bảy tiếng mà vẫn ra một mốc trông hợp lý.
 * 3. Một dòng thiếu `transaction_id` không gửi lại được, không xoá được. Bày nó
 *    ra như một mục bình thường là hứa một cái nút không làm gì.
 * 4. Kho KHÔNG giữ số lần thử qua lần mở lại app. Hiện `0` ở đó là bịa một dữ
 *    kiện, và con số ấy sẽ đi tiếp vào mắt người đọc như số thật.
 */

import {
  NEEDS_ATTENTION_PREFIX,
  buildSyncQueueEntry,
  buildSyncQueueEntries,
  countByGroup,
  describeRetryAllOutcome,
  describeRetryOutcome,
  normalizeQueueRow,
  parseQueueTimestamp,
  UNKNOWN_TYPE_LABEL,
  UNREADABLE_TYPE_LABEL,
  type SyncQueueDiagnostic,
} from './syncQueueStatus';

/** Một dòng đúng hình dạng `database.getSyncQueue()` trả về (cột snake_case). */
const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  transaction_id: 'activity_1',
  payload: JSON.stringify({
    type: 'activity',
    data: { activity: { type: 'watering', farmId: 'farm-1' } },
  }),
  media_paths: [],
  status: 'pending',
  error_code: null,
  created_at: '2026-09-14 03:20:00',
  updated_at: '2026-09-14T03:20:00.000Z',
  ...over,
});

const diag = (over: Partial<SyncQueueDiagnostic> = {}): SyncQueueDiagnostic => ({
  retryCount: 0,
  nextAttemptAt: 0,
  ...over,
});

describe('ba tình trạng cùng mang status pending phải TÁCH ra', () => {
  it('mất sóng → nhóm "đang chờ sóng"', () => {
    const e = buildSyncQueueEntry(row(), diag({ lastFailure: 'offline' }));
    expect(e.group).toBe('waitingNetwork');
  });

  it('máy chủ trả lời "lát nữa" → nhóm "máy chủ đang bận"', () => {
    const e = buildSyncQueueEntry(
      row({ error_code: 'Service Unavailable' }),
      diag({ retryCount: 2, lastFailure: 'retryable' }),
    );
    expect(e.group).toBe('serverBusy');
  });

  it('đã chạm trần (mang nhãn quá-trần) → nhóm "cần người xử"', () => {
    const e = buildSyncQueueEntry(
      row({ error_code: `${NEEDS_ATTENTION_PREFIX}Service Unavailable` }),
      diag({ retryCount: 5, lastFailure: 'retryable' }),
    );
    expect(e.group).toBe('needsAttention');
  });

  it('phiên hết hạn KHÔNG bị gộp vào "đang chờ sóng"', () => {
    // Hai việc gỡ khác hẳn nhau: một đằng đăng nhập lại, một đằng đi tìm sóng.
    const e = buildSyncQueueEntry(row(), diag({ lastFailure: 'auth' }));
    expect(e.group).toBe('sessionExpired');
  });

  it('máy chủ chưa nhận (403/404) và chưa có contract đều là "máy chủ chưa nhận"', () => {
    expect(buildSyncQueueEntry(row(), diag({ lastFailure: 'blocked' })).group).toBe('serverNotReady');
    expect(buildSyncQueueEntry(row(), diag({ lastFailure: 'unsupported' })).group).toBe('serverNotReady');
  });

  it('mục đã chết hẳn (status error) → nhóm "đã dừng", thắng mọi nhãn khác', () => {
    const e = buildSyncQueueEntry(
      row({ status: 'error', error_code: 'payload sai' }),
      diag({ lastFailure: 'permanent' }),
    );
    expect(e.group).toBe('stopped');
  });

  it('đếm theo nhóm chỉ kê nhóm CÓ mục — nhóm rỗng không phải một tin', () => {
    const entries = buildSyncQueueEntries(
      [row({ transaction_id: 'a' }), row({ transaction_id: 'b' }), row({ transaction_id: 'c', status: 'error' })],
      {
        a: diag({ lastFailure: 'offline' }),
        b: diag({ lastFailure: 'retryable' }),
      },
    );
    expect(countByGroup(entries)).toEqual([
      { group: 'stopped', count: 1 },
      { group: 'waitingNetwork', count: 1 },
      { group: 'serverBusy', count: 1 },
    ]);
  });
});

describe('không bù dữ liệu kho KHÔNG giữ', () => {
  it('không có số liệu trong phiên ⇒ số lần thử là null, KHÔNG phải 0', () => {
    const e = buildSyncQueueEntry(row(), undefined);
    expect(e.attempts).toBeNull();
    expect(e.nextAttemptAt).toBeNull();
  });

  it('không có câu nào từ máy chủ ⇒ null, KHÔNG phải một câu chung chung', () => {
    expect(buildSyncQueueEntry(row({ error_code: null })).serverMessage).toBeNull();
    expect(buildSyncQueueEntry(row({ error_code: '' })).serverMessage).toBeNull();
  });

  it('giữ NGUYÊN VĂN câu máy chủ, chỉ gỡ nhãn quá-trần', () => {
    const e = buildSyncQueueEntry(row({ error_code: `${NEEDS_ATTENTION_PREFIX}uy tín 46,3 dưới ngưỡng 50,0` }));
    expect(e.serverMessage).toBe('uy tín 46,3 dưới ngưỡng 50,0');
  });

  it('payload không mở được ⇒ nói thẳng, KHÔNG đoán một nhãn loại', () => {
    const e = buildSyncQueueEntry(row({ payload: '{khong-phai-json' }));
    expect(e.typeCode).toBeNull();
    expect(e.typeLabel).toBe(UNREADABLE_TYPE_LABEL);
  });

  it('mã loại lạ ⇒ nhãn "chưa rõ loại", và mã thô vẫn giữ để dev đối chiếu', () => {
    const e = buildSyncQueueEntry(row({ payload: JSON.stringify({ type: 'thu_moi_lam' }) }));
    expect(e.typeCode).toBe('thu_moi_lam');
    expect(e.typeLabel).toBe(UNKNOWN_TYPE_LABEL);
  });

  it('mỗi loại việc đã biết có chữ riêng', () => {
    const labelOf = (type: string) =>
      buildSyncQueueEntry(row({ payload: JSON.stringify({ type }) })).typeLabel;
    expect(labelOf('activity')).toBe('Nhật ký đồng áng');
    expect(labelOf('tree_identification')).toBe('Cây mới ghi nhận');
    expect(labelOf('fruit_identification')).toBe('Quả đã chụp');
    expect(labelOf('farm_update')).toBe('Thông tin vườn');
  });
});

describe('mốc thời gian đọc đúng hoặc KHÔNG đọc', () => {
  it('hình dạng CURRENT_TIMESTAMP của SQLite hiểu là giờ UTC', () => {
    expect(parseQueueTimestamp('2026-09-14 03:20:00')).toBe(Date.parse('2026-09-14T03:20:00.000Z'));
  });

  it('chuỗi ISO có múi giờ thì giữ nguyên nghĩa', () => {
    expect(parseQueueTimestamp('2026-09-14T03:20:00.000Z')).toBe(Date.parse('2026-09-14T03:20:00.000Z'));
  });

  it('chuỗi không đọc được ⇒ null, và bản thô vẫn giữ để hiện ra', () => {
    const e = buildSyncQueueEntry(row({ created_at: 'hôm qua' }));
    expect(e.createdAtMs).toBeNull();
    expect(e.createdAtRaw).toBe('hôm qua');
  });

  it('không có cột thời gian ⇒ cả hai đều null', () => {
    const e = buildSyncQueueEntry(row({ created_at: null }));
    expect(e.createdAtMs).toBeNull();
    expect(e.createdAtRaw).toBeNull();
  });
});

describe('dòng hàng đợi hỏng KHÔNG được bày ra như một mục bình thường', () => {
  it('thiếu mã giao dịch ⇒ NÉM', () => {
    expect(() => normalizeQueueRow(row({ transaction_id: undefined }))).toThrow(/transaction_id/);
    expect(() => normalizeQueueRow(row({ transaction_id: '   ' }))).toThrow(/transaction_id/);
  });

  it('đọc được cả hình dạng camelCase mà slice khai', () => {
    // Hai hình dạng cùng chảy qua một chỗ (xem `syncService.txIdOf`). Đọc một
    // bên thôi thì bên kia ra `undefined` mà không ai kêu.
    const e = buildSyncQueueEntry({
      transactionId: 'activity_9',
      status: 'pending',
      errorCode: 'Quá tải',
      createdAt: '2026-09-14T03:20:00.000Z',
      payload: JSON.stringify({ type: 'activity' }),
    });
    expect(e.transactionId).toBe('activity_9');
    expect(e.serverMessage).toBe('Quá tải');
    expect(e.createdAtMs).not.toBeNull();
  });
});

describe('câu báo sau một lượt gửi lại', () => {
  it('mục rời hàng đợi ⇒ câu mừng', () => {
    expect(describeRetryOutcome({ kind: 'cleared' })).toEqual({
      tone: 'ok',
      text: 'Đã gửi xong — mục đã rời hàng đợi.',
      detail: null,
    });
  });

  it('mục còn nằm đó ⇒ câu BÁO HỎNG kèm nguyên văn máy chủ', () => {
    const note = describeRetryOutcome({ kind: 'stillQueued', status: 'pending', message: 'Service Unavailable' });
    expect(note.tone).toBe('bad');
    expect(note.detail).toBe('Service Unavailable');
  });

  it('chưa thử được lượt nào KHÔNG được đọc thành đã thử và hỏng', () => {
    const a = describeRetryOutcome({ kind: 'notAttempted', reason: 'database-not-ready' });
    const b = describeRetryOutcome({ kind: 'notAttempted', reason: 'another-pass-running' });
    expect(a.tone).toBe('bad');
    expect(b.tone).toBe('bad');
    expect(a.text).not.toBe(b.text);
    // Và cả hai phải khác câu của ca "đã thử, mục vẫn còn" — ba tình huống, ba câu.
    expect(a.text).not.toBe(
      describeRetryOutcome({ kind: 'stillQueued', status: 'pending', message: null }).text,
    );
  });

  it('gửi cả hàng đợi: sạch · một phần · không mục nào đều ra ba câu khác nhau', () => {
    const sach = describeRetryAllOutcome({ kind: 'done', before: 3, remaining: 0 });
    const motPhan = describeRetryAllOutcome({ kind: 'done', before: 3, remaining: 1 });
    const khong = describeRetryAllOutcome({ kind: 'done', before: 3, remaining: 3 });
    expect(sach.tone).toBe('ok');
    expect(motPhan.tone).toBe('bad');
    expect(khong.tone).toBe('bad');
    expect(new Set([sach.text, motPhan.text, khong.text]).size).toBe(3);
    expect(motPhan.detail).toContain('2 mục đã gửi');
  });
});
