import { uploadTreeVideo, MAX_TREE_VIDEO_BYTES } from './treeVideoService';

// AsyncStorage đã được mock ở jest.setup.js (getItem trả null → không có token, vẫn gửi được).
const BASE = 'https://api.orilife.io';
const TREE = 'tree-abc-123';
const URI = 'file:///tmp/clip.mp4';

const realFetch = globalThis.fetch;
const mockFetch = (status: number, body: any) => {
  globalThis.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as any);
};

afterEach(() => { globalThis.fetch = realFetch; jest.clearAllMocks(); });

describe('uploadTreeVideo — map mã trả server /api/tree/{id}/video', () => {
  it('200 + added=true → ok, bổ-sung n_kept góc', async () => {
    mockFetch(200, { ok: true, tree_id: TREE, n_kept: 5, n_rejected: 1, status: 'ok', rejected: [], added: true });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(true);
    expect(r.n_kept).toBe(5);
    expect(r.tree_id).toBe(TREE);
  });

  it('200 + added=false → ok nhưng không bổ-sung (khung không khớp cây)', async () => {
    mockFetch(200, { ok: true, tree_id: TREE, n_kept: 0, n_rejected: 4, status: 'ok', rejected: [], added: false, reason: 'no_match' });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(false);
    expect(r.n_kept).toBe(0);
    expect(r.reason).toBe('no_match');
  });

  it('422 KHÔNG có cid (prod cũ b38496f) → no_usable_frames, thất-bại mềm', async () => {
    mockFetch(422, { ok: false, error: 'Không trích được khung.', status: 'read_ok_no_good_frame', n_kept: 0, n_rejected: 3, rejected: [{ reason: 'blur', messages: ['Khung mờ.'] }] });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('no_usable_frames');
    expect(r.error?.http_status).toBe(422);
    expect(r.rejected?.length).toBe(1);
  });

  it('422 CÓ video_cid (PR #251) → ok:true, ĐÃ LƯU bằng-chứng, chưa bổ-sung góc', async () => {
    mockFetch(422, {
      ok: false, error: 'Không trích được khung.', status: 'read_ok_no_good_frame',
      n_kept: 0, n_rejected: 2, rejected: [],
      stored: true, video_cid: 'ln1q_treevideo_abc', event_id: 'ev-9', engine_verified: false, link_status: 'unconfirmed',
    });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(true);          // có CID ⇒ không coi là thất-bại trắng
    expect(r.added).toBe(false);
    expect(r.stored).toBe(true);
    expect(r.video_cid).toBe('ln1q_treevideo_abc');
    expect(r.event_id).toBe('ev-9');
  });

  it('200 + added=true kèm bằng-chứng LampNet (PR #251) → giữ đủ video_cid/stored', async () => {
    mockFetch(200, {
      ok: true, tree_id: TREE, n_kept: 6, n_rejected: 0, status: 'ok', rejected: [], added: true,
      stored: true, video_cid: 'ln1q_treevideo_xyz', event_id: 'ev-10', engine_verified: true, link_status: 'unconfirmed',
    });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(true);
    expect(r.n_kept).toBe(6);
    expect(r.stored).toBe(true);
    expect(r.video_cid).toBe('ln1q_treevideo_xyz');
    expect(r.engine_verified).toBe(true);
  });

  it('413 → too_large', async () => {
    mockFetch(413, { ok: false, error: 'too large' });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('too_large');
    expect(r.error?.http_status).toBe(413);
  });

  it('403 → forbidden (IDOR, cây không thuộc chủ)', async () => {
    mockFetch(403, { detail: 'Cây này không thuộc tài khoản của bạn.' });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('forbidden');
  });

  it('401 → auth_error (để màn thử refresh token)', async () => {
    mockFetch(401, {});
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('auth_error');
  });

  it('mạng lỗi (fetch throw) → network_error, không ném', async () => {
    globalThis.fetch = jest.fn(async () => { throw new Error('boom'); }) as any;
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('network_error');
  });

  it('trần dung-lượng khớp server 20MB', () => {
    expect(MAX_TREE_VIDEO_BYTES).toBe(20 * 1024 * 1024);
  });
});
