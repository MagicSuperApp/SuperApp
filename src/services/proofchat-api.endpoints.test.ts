// services/proofchat-api.endpoints.test.ts
//
// BỀ MẶT REST CỦA CHAT — 27 phương thức thêm vào ở lượt nối máy chủ thật, cộng
// những phương thức có từ trước mà chưa bài kiểm nào chạm tới.
//
// Vì sao tệp riêng: `proofchat-api.test.ts` đo LUỒNG (bóc envelope, làm mới
// token, cầu nối auth). Tệp này đo HỢP ĐỒNG với máy chủ — đường, động từ, thân
// yêu cầu, và cờ `needsAuth`. Hai việc khác nhau, trộn vào một tệp thì không ai
// đọc nổi.
//
// ── Ba lớp hỏng câm mà tệp này canh ────────────────────────────────────────
//
//  1. THIẾU `needsAuth` — yêu cầu đi ra KHÔNG có Bearer. Máy chủ trả 401, và
//     interceptor sẽ thử làm mới token rồi gọi lại, cũng không có Bearer. Người
//     dùng thấy "không tải được", không ai thấy nguyên nhân. Bài kiểm cuối tệp
//     quét TOÀN BỘ bề mặt nên phương thức mới quên cờ này là ĐỎ ngay.
//
//  2. ID KHÔNG ĐƯỢC MÃ HOÁ vào đường. `messageId` chứa `/` là gọi sang một
//     đường khác hẳn, và máy chủ trả 404 chứ không nói "id sai".
//
//  3. THÂN YÊU CẦU sai tên trường. `{ participantIds }` mà gửi `{ participants }`
//     thì máy chủ nhận 200 với danh sách rỗng — thêm người mà không ai được thêm.

// ── AsyncStorage in-memory ───────────────────────────────────────────
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
  },
}));

// ── axios giả — ghi lại (đường, thân, cấu hình) của mọi động từ ───────
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: () => ({
      get: (...a: any[]) => mockGet(...a),
      post: (...a: any[]) => mockPost(...a),
      patch: (...a: any[]) => mockPatch(...a),
      delete: (...a: any[]) => mockDelete(...a),
      request: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    }),
  },
}));

import { proofChatApi, uploads, ProofChatApiError } from './proofchat-api';

/** Envelope thật của BE (TransformInterceptor global). */
const boc = (data: unknown) => ({ data: { data, statusCode: 200, message: 'ok' } });

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  mockGet.mockReset().mockResolvedValue(boc(null));
  mockPost.mockReset().mockResolvedValue(boc(null));
  mockPatch.mockReset().mockResolvedValue(boc(null));
  mockDelete.mockReset().mockResolvedValue(boc(null));
});

const { conversations, memberRequests, messages, readSignals, users, mls, auth } =
  proofChatApi as any;

// ═══════════════════════════════════════════════════════════════════════════
describe('conversations — phần thêm ở lượt nối máy chủ', () => {
  it('update → PATCH /conversations/:id với thân đổi tên', async () => {
    mockPatch.mockResolvedValueOnce(boc({ id: 'c1', title: 'Tên mới' }));
    const r = await conversations.update('c1', { title: 'Tên mới' });
    expect(mockPatch).toHaveBeenCalledWith(
      '/conversations/c1',
      { title: 'Tên mới' },
      expect.objectContaining({ needsAuth: true }),
    );
    expect(r).toEqual({ id: 'c1', title: 'Tên mới' });
  });

  it('addParticipants → POST …/participants, trường ĐÚNG TÊN participantIds', async () => {
    await conversations.addParticipants('c1', ['u1', 'u2']);
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations/c1/participants',
      { participantIds: ['u1', 'u2'] },
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('updateParticipant → PATCH …/participants/:userId', async () => {
    await conversations.updateParticipant('c1', 'u1', { nickname: 'Út' });
    expect(mockPatch).toHaveBeenCalledWith(
      '/conversations/c1/participants/u1',
      { nickname: 'Út' },
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('removeParticipant → DELETE …/participants/:userId', async () => {
    await conversations.removeParticipant('c1', 'u1');
    expect(mockDelete).toHaveBeenCalledWith(
      '/conversations/c1/participants/u1',
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('join KHÔNG lời nhắn → thân RỖNG, không gửi { message: undefined }', async () => {
    // Gửi `{ message: undefined }` thì JSON.stringify bỏ trường đi và kết quả
    // giống nhau — nhưng multipart/validator nghiêm ở BE thì không. Giữ thân rỗng.
    mockPost.mockResolvedValueOnce(boc({ action: 'JOINED', conversationId: 'c1' }));
    const r = await conversations.join('c1');
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations/c1/join',
      {},
      expect.objectContaining({ needsAuth: true }),
    );
    expect(r.action).toBe('JOINED');
  });

  it('join CÓ lời nhắn → thân mang lời nhắn; phòng kín trả REQUESTED', async () => {
    mockPost.mockResolvedValueOnce(
      boc({ action: 'REQUESTED', conversationId: 'c1', requestId: 'r9' }),
    );
    const r = await conversations.join('c1', 'cho em vào với');
    expect(mockPost.mock.calls[0][1]).toEqual({ message: 'cho em vào với' });
    expect(r).toEqual({ action: 'REQUESTED', conversationId: 'c1', requestId: 'r9' });
  });

  it('leave → POST …/leave', async () => {
    await conversations.leave('c1');
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations/c1/leave',
      {},
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('listPins → GET …/pins, bóc được cả envelope lẫn { data: [...] } hai lớp', async () => {
    mockGet.mockResolvedValueOnce(boc({ data: [{ messageId: 'm1' }], total: 1 }));
    const r = await conversations.listPins('c1');
    expect(mockGet).toHaveBeenCalledWith(
      '/conversations/c1/pins',
      expect.objectContaining({ needsAuth: true }),
    );
    expect(r).toEqual([{ messageId: 'm1' }]);
  });

  it('pin / unpin → POST …/pins { messageId } và DELETE …/pins/:msgId', async () => {
    await conversations.pin('c1', 'm1');
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations/c1/pins',
      { messageId: 'm1' },
      expect.objectContaining({ needsAuth: true }),
    );
    await conversations.unpin('c1', 'm1');
    expect(mockDelete).toHaveBeenCalledWith(
      '/conversations/c1/pins/m1',
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('listIds / get / create — có từ trước, chưa bài nào chạm', async () => {
    mockGet.mockResolvedValueOnce(boc(['c1', 'c2']));
    expect(await conversations.listIds()).toEqual(['c1', 'c2']);

    mockGet.mockResolvedValueOnce(boc({ id: 'c1' }));
    expect(await conversations.get('c1')).toEqual({ id: 'c1' });
    expect(mockGet).toHaveBeenLastCalledWith(
      '/conversations/c1',
      expect.objectContaining({ needsAuth: true }),
    );

    mockPost.mockResolvedValueOnce(boc({ id: 'c9' }));
    const body = { type: 'GROUP', participantIds: ['u1'] };
    expect(await conversations.create(body)).toEqual({ id: 'c9' });
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations',
      body,
      expect.objectContaining({ needsAuth: true }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('memberRequests — hai chiều, và chúng KHÔNG được lẫn nhau', () => {
  it('pending (người khác mời TÔI) → GET /member-requests/pending', async () => {
    mockGet.mockResolvedValueOnce(boc([{ id: 'r1', conversationId: 'c1' }]));
    const r = await memberRequests.pending();
    expect(mockGet).toHaveBeenCalledWith(
      '/member-requests/pending',
      expect.objectContaining({ needsAuth: true }),
    );
    expect(r).toHaveLength(1);
  });

  it('accept / decline → POST /member-requests/:id/{accept,decline}', async () => {
    await memberRequests.accept('r1');
    expect(mockPost).toHaveBeenLastCalledWith(
      '/member-requests/r1/accept',
      {},
      expect.objectContaining({ needsAuth: true }),
    );
    await memberRequests.decline('r1');
    expect(mockPost).toHaveBeenLastCalledWith(
      '/member-requests/r1/decline',
      {},
      expect.objectContaining({ needsAuth: true }),
    );
  });

  // Chiều kia đi qua ĐƯỜNG KHÁC HẲN (`/conversations/:cid/member-requests`).
  // Lẫn hai chiều là hiện danh sách "người ta mời tôi" ở chỗ đáng lẽ hiện "người
  // ta xin vào phòng tôi quản" — và nút duyệt bấm vào không có tác dụng.
  it('listForConversation (người khác xin VÀO phòng) → đường của phòng, mặc định PENDING', async () => {
    mockGet.mockResolvedValueOnce(boc([]));
    await memberRequests.listForConversation('c1');
    expect(mockGet).toHaveBeenCalledWith(
      '/conversations/c1/member-requests',
      expect.objectContaining({ needsAuth: true, params: { status: 'PENDING' } }),
    );
  });

  it('listForConversation nhận status tường minh', async () => {
    mockGet.mockResolvedValueOnce(boc([]));
    await memberRequests.listForConversation('c1', 'REJECTED');
    expect(mockGet.mock.calls[0][1].params).toEqual({ status: 'REJECTED' });
  });

  it('invite → POST …/member-requests/invite { targetUserId, message }', async () => {
    mockPost.mockResolvedValueOnce(boc({ id: 'r5', conversationId: 'c1' }));
    await memberRequests.invite('c1', 'u9', 'vào nhóm nhé');
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations/c1/member-requests/invite',
      { targetUserId: 'u9', message: 'vào nhóm nhé' },
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('myStatus → GET …/member-requests/my-status; null là câu trả lời HỢP LỆ', async () => {
    mockGet.mockResolvedValueOnce(boc(null));
    // Chưa xin vào phòng thì BE trả null. Chỗ gọi phải chịu được null chứ không
    // được dựng ra một trạng thái giả.
    expect(await memberRequests.myStatus('c1')).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(
      '/conversations/c1/member-requests/my-status',
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('approve → POST …/:rid/approve, thân rỗng khi không truyền gì', async () => {
    await memberRequests.approve('c1', 'r1');
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations/c1/member-requests/r1/approve',
      {},
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('approve mang theo welcomeMessage + ratchetTree + epoch (bắt tay MLS)', async () => {
    await memberRequests.approve('c1', 'r1', {
      welcomeMessage: 'W',
      ratchetTree: 'T',
      epoch: 7,
    });
    expect(mockPost.mock.calls[0][1]).toEqual({
      welcomeMessage: 'W',
      ratchetTree: 'T',
      epoch: 7,
    });
  });

  it('reject → POST …/:rid/reject { reason }', async () => {
    await memberRequests.reject('c1', 'r1', 'không quen');
    expect(mockPost).toHaveBeenCalledWith(
      '/conversations/c1/member-requests/r1/reject',
      { reason: 'không quen' },
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('cancel → DELETE …/member-requests/:rid', async () => {
    await memberRequests.cancel('c1', 'r1');
    expect(mockDelete).toHaveBeenCalledWith(
      '/conversations/c1/member-requests/r1',
      expect.objectContaining({ needsAuth: true }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('messages — thao tác trên metadata, KHÔNG chạm nội dung', () => {
  it('react → POST /messages/:id/reactions { emoji }', async () => {
    await messages.react('m1', '👍');
    expect(mockPost).toHaveBeenCalledWith(
      '/messages/m1/reactions',
      { emoji: '👍' },
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('reactions → GET /messages/:id/reactions', async () => {
    mockGet.mockResolvedValueOnce(boc([{ emoji: '👍', userId: 'u1' }]));
    expect(await messages.reactions('m1')).toEqual([{ emoji: '👍', userId: 'u1' }]);
  });

  it('unreact MÃ HOÁ emoji vào đường — emoji thô làm hỏng URL', async () => {
    await messages.unreact('m1', '👍');
    expect(mockDelete).toHaveBeenCalledWith(
      `/messages/m1/reactions/${encodeURIComponent('👍')}`,
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('remove mặc định forEveryone=false — thu hồi CHỈ ở máy mình', async () => {
    // Mặc định sai chiều ở đây là xoá tin trên máy người khác mà người dùng
    // không hề chọn. Mặc định phải là cái ÍT tác động nhất.
    await messages.remove('m1');
    expect(mockPost).toHaveBeenCalledWith(
      '/messages/m1/delete',
      { forEveryone: false },
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('remove(true) → thu hồi với mọi người', async () => {
    await messages.remove('m1', true);
    expect(mockPost.mock.calls[0][1]).toEqual({ forEveryone: true });
  });

  it('save / unsave → POST và DELETE /messages/:id/saved', async () => {
    await messages.save('m1');
    expect(mockPost).toHaveBeenCalledWith(
      '/messages/m1/saved',
      {},
      expect.objectContaining({ needsAuth: true }),
    );
    await messages.unsave('m1');
    expect(mockDelete).toHaveBeenCalledWith(
      '/messages/m1/saved',
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('saved → GET /users/me/saved-messages kèm phân trang', async () => {
    mockGet.mockResolvedValueOnce(boc({ data: [{ messageId: 'm1' }], total: 1 }));
    const r = await messages.saved({ cursor: 'abc', limit: 20 });
    expect(mockGet).toHaveBeenCalledWith(
      '/users/me/saved-messages',
      expect.objectContaining({ needsAuth: true, params: { cursor: 'abc', limit: 20 } }),
    );
    expect(r).toEqual([{ messageId: 'm1' }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('readSignals — báo đã-xem mà KHÔNG kèm nội dung', () => {
  it('gửi đúng đường + điền mặc định dwellMs=0 và ts', async () => {
    await readSignals.send('c1', [{ messageId: 'm1' }]);
    const [duong, than, cauHinh] = mockPost.mock.calls[0];
    expect(duong).toBe('/trackmess/signals');
    expect(cauHinh).toEqual(expect.objectContaining({ needsAuth: true }));
    expect(than.conversationId).toBe('c1');
    expect(than.items[0].messageId).toBe('m1');
    expect(than.items[0].dwellMs).toBe(0);
    expect(typeof than.items[0].ts).toBe('number');
  });

  it('giữ nguyên dwellMs/ts do chỗ gọi truyền vào', async () => {
    await readSignals.send('c1', [{ messageId: 'm1', dwellMs: 1200, ts: 1700000000000 }]);
    expect(mockPost.mock.calls[0][1].items[0]).toEqual({
      messageId: 'm1',
      dwellMs: 1200,
      ts: 1700000000000,
    });
  });

  it('thân KHÔNG mang nội dung tin — chỉ id, thời lượng, mốc giờ', async () => {
    // Đây là bất biến riêng tư, không phải chi tiết cài đặt: tín hiệu đã-xem đi
    // ra máy chủ ở dạng rõ, nên nó chỉ được mang metadata.
    await readSignals.send('c1', [{ messageId: 'm1' }]);
    const truong = Object.keys(mockPost.mock.calls[0][1].items[0]).sort();
    expect(truong).toEqual(['dwellMs', 'messageId', 'ts']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('uploads — ảnh đính kèm', () => {
  it('image → POST /support/uploads dạng multipart', async () => {
    mockPost.mockResolvedValueOnce(boc({ id: 'f1', url: '/media/f1.jpg' }));
    const r = await uploads.image({ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' });
    const [duong, than, cauHinh] = mockPost.mock.calls[0];
    expect(duong).toBe('/support/uploads');
    expect(than).toBeInstanceOf(FormData);
    expect(cauHinh.needsAuth).toBe(true);
    expect(cauHinh.headers['Content-Type']).toBe('multipart/form-data');
    expect(r).toEqual({ id: 'f1', url: '/media/f1.jpg' });
  });

  it('absoluteUrl ghép đường tương đối, GIỮ NGUYÊN đường đã tuyệt đối', async () => {
    // Ghép hai lần là ra `http://…http://…` — ảnh không hiện, và lỗi trông như
    // lỗi mạng chứ không như lỗi ghép chuỗi.
    expect(uploads.absoluteUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    const ghep = uploads.absoluteUrl('/media/f1.jpg');
    expect(ghep.endsWith('/media/f1.jpg')).toBe(true);
    expect(ghep.startsWith('http')).toBe(true);
    // Đường thiếu dấu gạch đầu vẫn phải ra một dấu gạch, không phải hai.
    expect(uploads.absoluteUrl('media/f1.jpg')).toBe(ghep);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('users.search — đường BE đang TẮT, lỗi phải NỔI lên', () => {
  it('gửi q qua params, không nhét vào đường', async () => {
    mockGet.mockResolvedValueOnce(boc([{ userDid: 'did:x' }]));
    await users.search('nông dân A');
    expect(mockGet).toHaveBeenCalledWith(
      '/users/search',
      expect.objectContaining({ needsAuth: true, params: { q: 'nông dân A' } }),
    );
  });

  it('404 (route đang bị đóng ở BE) → NÉM, không nuốt thành "không tìm thấy ai"', async () => {
    mockGet.mockRejectedValueOnce({
      response: { status: 404, data: { message: 'Cannot GET /users/search' } },
    });
    const loi = await users.search('x').then(
      () => null,
      (e: unknown) => e,
    );
    expect(loi).toBeInstanceOf(ProofChatApiError);
    expect((loi as ProofChatApiError).httpStatus).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('mls — bootstrap KeyPackage + epoch-sync', () => {
  it('keyPackageStatus → GET /mls/keypackage/status', async () => {
    mockGet.mockResolvedValueOnce(boc({ exists: true, devices: [] }));
    expect(await mls.keyPackageStatus()).toEqual({ exists: true, devices: [] });
    expect(mockGet).toHaveBeenCalledWith(
      '/mls/keypackage/status',
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('publishKeyPackage → POST /mls/keypackage', async () => {
    const body = { deviceId: 'd1', keyPackage: 'KP', ciphersuite: 'CS1' };
    mockPost.mockResolvedValueOnce(boc({ success: true, message: 'ok' }));
    await mls.publishKeyPackage(body);
    expect(mockPost).toHaveBeenCalledWith(
      '/mls/keypackage',
      body,
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('roomKeyPackages → GET /mls/keypackages/room/:cid?deviceId=', async () => {
    mockGet.mockResolvedValueOnce(boc([]));
    await mls.roomKeyPackages('c1', 'd1');
    expect(mockGet).toHaveBeenCalledWith(
      '/mls/keypackages/room/c1',
      expect.objectContaining({ needsAuth: true, params: { deviceId: 'd1' } }),
    );
  });

  it('createEpochSync → POST /mls/epoch-sync', async () => {
    const body = { conversationId: 'c1', epoch: 3, commitMessage: 'C', welcomeMessage: 'W' };
    await mls.createEpochSync(body);
    expect(mockPost).toHaveBeenCalledWith(
      '/mls/epoch-sync',
      body,
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('epochCurrent → GET /mls/epoch-sync/:cid/current', async () => {
    mockGet.mockResolvedValueOnce(boc({ conversationId: 'c1', currentEpoch: 4 }));
    expect(await mls.epochCurrent('c1')).toEqual({ conversationId: 'c1', currentEpoch: 4 });
  });

  it('epochRange → GET /mls/epoch-sync/:cid?fromEpoch&toEpoch', async () => {
    mockGet.mockResolvedValueOnce(boc([]));
    await mls.epochRange('c1', 1, 5);
    expect(mockGet).toHaveBeenCalledWith(
      '/mls/epoch-sync/c1',
      expect.objectContaining({ needsAuth: true, params: { fromEpoch: 1, toEpoch: 5 } }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('auth.logout', () => {
  it('gọi POST /auth/logout kèm Bearer', async () => {
    await auth.logout();
    expect(mockPost).toHaveBeenCalledWith(
      '/auth/logout',
      {},
      expect.objectContaining({ needsAuth: true }),
    );
  });

  it('mạng lỗi → VẪN xoá token ở finally, và lỗi vẫn nổi lên', async () => {
    store['proofchat_access_token'] = 'AA';
    mockPost.mockRejectedValueOnce(new Error('mất mạng'));
    await expect(auth.logout()).rejects.toThrow('mất mạng');
    expect(store['proofchat_access_token']).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QUÉT TOÀN BỘ BỀ MẶT — bài kiểm quan trọng nhất tệp này.
//
// Mọi bài ở trên chỉ canh những phương thức có người NHỚ viết bài kiểm. Phương
// thức thêm vào ngày mai thì không ai canh. Bài dưới đây gọi TỪNG phương thức
// trong bốn nhóm và đòi mỗi lượt gọi đều mang `needsAuth: true` — quên cờ là ĐỎ,
// kể cả với phương thức chưa ai nghĩ tới.
// ═══════════════════════════════════════════════════════════════════════════
describe('không phương thức nào đi ra mà quên Bearer', () => {
  /** Đối số hợp lệ tối thiểu cho từng phương thức, theo chữ ký của nó. */
  const DOI_SO: Record<string, unknown[]> = {
    'auth.logout': [],
    'conversations.list': [{}],
    'conversations.listIds': [],
    'conversations.get': ['c1'],
    'conversations.create': [{ type: 'DIRECT', participantIds: ['u1'] }],
    'conversations.getMessages': ['c1', 'd1'],
    'conversations.update': ['c1', { title: 't' }],
    'conversations.addParticipants': ['c1', ['u1']],
    'conversations.updateParticipant': ['c1', 'u1', { nickname: 'n' }],
    'conversations.removeParticipant': ['c1', 'u1'],
    'conversations.join': ['c1'],
    'conversations.leave': ['c1'],
    'conversations.listPins': ['c1'],
    'conversations.pin': ['c1', 'm1'],
    'conversations.unpin': ['c1', 'm1'],
    'memberRequests.pending': [],
    'memberRequests.accept': ['r1'],
    'memberRequests.decline': ['r1'],
    'memberRequests.listForConversation': ['c1'],
    'memberRequests.invite': ['c1', 'u1'],
    'memberRequests.myStatus': ['c1'],
    'memberRequests.approve': ['c1', 'r1'],
    'memberRequests.reject': ['c1', 'r1'],
    'memberRequests.cancel': ['c1', 'r1'],
    'messages.react': ['m1', '👍'],
    'messages.reactions': ['m1'],
    'messages.unreact': ['m1', '👍'],
    'messages.remove': ['m1'],
    'messages.save': ['m1'],
    'messages.unsave': ['m1'],
    'messages.saved': [{}],
    'readSignals.send': ['c1', [{ messageId: 'm1' }]],
    'users.search': ['x'],
    'mls.keyPackageStatus': [],
    'mls.publishKeyPackage': [{ deviceId: 'd', keyPackage: 'k', ciphersuite: 'c' }],
    'mls.roomKeyPackages': ['c1', 'd1'],
    'mls.createEpochSync': [
      { conversationId: 'c1', epoch: 1, commitMessage: 'C', welcomeMessage: 'W' },
    ],
    'mls.epochCurrent': ['c1'],
    'mls.epochRange': ['c1', 1, 2],
  };

  /**
   * Bề mặt cần cờ Bearer. `auth.phoenixKeyLogin` và `auth.refresh` KHÔNG có mặt
   * ở đây và đó là đúng: chúng là đường LẤY token, chưa có token để mà gắn.
   * `uploads.image` bỏ ra vì cần FormData thật (đã có bài riêng ở trên).
   */
  const BE_MAT: Record<string, Record<string, unknown>> = {
    auth: { logout: (auth as any).logout },
    conversations,
    memberRequests,
    messages,
    readSignals,
    users,
    mls,
  };

  const TEN: string[] = [];
  for (const [nhom, doiTuong] of Object.entries(BE_MAT)) {
    for (const [ten, gt] of Object.entries(doiTuong)) {
      if (typeof gt === 'function') TEN.push(`${nhom}.${ten}`);
    }
  }

  it('bảng đối số phủ HẾT bề mặt — thiếu một dòng là bài dưới bỏ sót câm', () => {
    // Không có phép này thì thêm phương thức mới mà quên khai đối số sẽ khiến
    // `it.each` chạy ít ca hơn, và bộ kiểm vẫn xanh.
    expect(TEN.filter((t) => !(t in DOI_SO))).toEqual([]);
    expect(TEN.length).toBeGreaterThanOrEqual(39);
  });

  it.each(TEN)('%s gắn needsAuth', async (ten) => {
    const [nhom, ph] = ten.split('.');
    const ham = (BE_MAT[nhom] as any)[ph];
    // Danh sách rỗng làm `unwrapList` ném; nuốt ở đây vì bài này chỉ đo CẤU HÌNH.
    await Promise.resolve(ham(...(DOI_SO[ten] as any[]))).catch(() => undefined);

    const moiLuot = [
      ...mockGet.mock.calls,
      ...mockPost.mock.calls,
      ...mockPatch.mock.calls,
      ...mockDelete.mock.calls,
    ];
    expect(moiLuot.length).toBe(1);
    // GET/DELETE: cấu hình là đối số thứ 2. POST/PATCH: thứ 3.
    const cauHinh = moiLuot[0][2] ?? moiLuot[0][1];
    expect(`${ten}:${(cauHinh as any)?.needsAuth}`).toBe(`${ten}:true`);
  });
});
