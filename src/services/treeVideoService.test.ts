import { uploadTreeVideo, MAX_TREE_VIDEO_BYTES } from './treeVideoService';
import { MAX_VIDEO_BYTES as MAX_FRUIT_VIDEO_BYTES } from './fruitVideoService';

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

  // ══ 200 KÈM ok:false — máy chủ đặt `ok = retained` (`server.py:5015`) ══════
  it('200 + ok:false (clip KHÔNG được giữ) → ok:false, mang nguyên câu của máy chủ', async () => {
    // Đây là thân thật máy chủ dựng ở `server.py:5000-5024` cho ca `retained=False`.
    mockFetch(200, {
      ok: false, tree_id: TREE, n_kept: 0, n_parked: 0, n_rejected: 0,
      status: 'ok', rejected: [], stored: false, retained: false,
      store_reason: 'lampnet_down',
      error: 'Chưa lưu được video lên hệ thống — vui lòng gửi lại.',
      message: 'Chưa lưu được video lên hệ thống — vui lòng gửi lại.',
    });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(false);
    expect(r.error?.type).toBe('not_retained');
    // Câu Việt của máy chủ phải tới được người dùng, không bị thay bằng câu tự soạn.
    expect(r.error?.detail).toBe('Chưa lưu được video lên hệ thống — vui lòng gửi lại.');
    expect(r.retained).toBe(false);
    expect(r.store_reason).toBe('lampnet_down');
    // KHÔNG được lộ `video_cid` ra ngoài ở ca này: mã lúc đó tra không ra gì.
    expect(r.video_cid).toBeUndefined();
  });

  it('200 KHÔNG có trường `ok` (bản máy chủ cũ) → vẫn ok:true, không đọc thành thất bại', async () => {
    mockFetch(200, { tree_id: TREE, n_kept: 2, n_rejected: 0, status: 'ok', rejected: [], added: true });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(true);
    expect(r.n_kept).toBe(2);
  });

  it('200 + ok:true nhưng stored:false → ok:true kèm retained/store_reason để màn nói đúng', async () => {
    mockFetch(200, {
      ok: true, tree_id: TREE, n_kept: 3, n_rejected: 0, status: 'ok', rejected: [],
      added: true, stored: false, retained: true, store_reason: 'queued',
      message: 'Đã nhận video, đang gửi lên kho lưu-trữ.',
    });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(true);
    expect(r.stored).toBe(false);
    expect(r.retained).toBe(true);
    expect(r.store_reason).toBe('queued');
    expect(r.message).toBe('Đã nhận video, đang gửi lên kho lưu-trữ.');
  });

  it('nhánh LỖI cũng mang `store_reason` — nếu không thì cờ "gửi lại vô ích" không tới nơi quyết định', async () => {
    mockFetch(500, { error: 'Lỗi máy chủ', store_reason: 'empty_file' });
    const r = await uploadTreeVideo(BASE, TREE, URI);
    expect(r.ok).toBe(false);
    expect(r.store_reason).toBe('empty_file');
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

  // Trần thật của đường video là MAX_VIDEO_BYTES = 80MB (server tách trần riêng cho
  // hậu tố `/video` và `/fruit_video`), KHÔNG phải MAX_UPLOAD_BYTES = 20MB. Test cũ
  // khoá đúng con số sai, nên nó giữ app tự chặn oan thay vì bắt lỗi.
  it('trần dung-lượng khớp server 80MB — và BẰNG đường quả', () => {
    expect(MAX_TREE_VIDEO_BYTES).toBe(80 * 1024 * 1024);
    expect(MAX_TREE_VIDEO_BYTES).toBe(MAX_FRUIT_VIDEO_BYTES);
  });
});
