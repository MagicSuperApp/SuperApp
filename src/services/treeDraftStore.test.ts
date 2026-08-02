/**
 * treeDraftStore.test — lưu/khôi phục/xoá bản nháp chụp cây + video quả (H-17).
 * AsyncStorage đã được mock ở jest.setup.js (bộ nhớ trong RAM cho mỗi lần chạy).
 *
 * Mock 'expo-file-system/legacy' để đường prune-clip-chết chạy THẬT (default
 * fileExists → getInfoAsync), không chỉ inject hàm giả.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CapturedImage } from './treeReIDNativeBridge';

// getInfoAsync: file có 'gone' trong đường dẫn coi như đã bị OS dọn (exists:false).
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: !String(uri).includes('gone') })),
}));

import {
  saveTreeCaptureDraft,
  loadTreeCaptureDraft,
  clearTreeCaptureDraft,
  restoreTreeCaptureDraft,
  draftHasContent,
  pruneDeadCaptures,
  saveFruitVideoDraft,
  loadFruitVideoDraft,
  clearFruitVideoDraft,
  restoreFruitVideoDraft,
  clearAllDrafts,
  type TreeCaptureDraft,
} from './treeDraftStore';

const OWNER = 'did:userA';
const OWNER_B = 'did:userB';

function cap(id: string, fileURL: string): CapturedImage {
  return {
    id,
    fileURL,
    heading: 120,
    pitch: 5,
    roll: -2,
    round: 1,
    capturedAt: 1_700_000_000_000,
    width: 1080,
    height: 1920,
  };
}

function draft(over: Partial<TreeCaptureDraft> = {}): TreeCaptureDraft {
  return {
    v: 1,
    savedAt: Date.now(),
    captures: [cap('a', '/tmp/a.jpg'), cap('b', '/tmp/b.jpg')],
    gps: { lat: 10.5, lng: 106.7, accuracy: 8 },
    name: 'Mít số 3',
    farmId: 'farm-1',
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('bản nháp đăng-ký-cây', () => {
  it('chưa có nháp → load trả null', async () => {
    expect(await loadTreeCaptureDraft(OWNER)).toBeNull();
  });

  it('lưu rồi đọc lại giữ nguyên ảnh + metadata + GPS + tên + vườn', async () => {
    const d = draft();
    await saveTreeCaptureDraft(OWNER, d);
    const back = await loadTreeCaptureDraft(OWNER);
    expect(back).not.toBeNull();
    expect(back!.captures).toHaveLength(2);
    expect(back!.captures[0]).toMatchObject({ id: 'a', heading: 120, pitch: 5, roll: -2, round: 1 });
    expect(back!.gps).toEqual({ lat: 10.5, lng: 106.7, accuracy: 8 });
    expect(back!.name).toBe('Mít số 3');
    expect(back!.farmId).toBe('farm-1');
  });

  it('xoá nháp → load trả null', async () => {
    await saveTreeCaptureDraft(OWNER, draft());
    await clearTreeCaptureDraft(OWNER);
    expect(await loadTreeCaptureDraft(OWNER)).toBeNull();
  });

  it('draftHasContent: có ảnh → true, rỗng/null → false', () => {
    expect(draftHasContent(draft())).toBe(true);
    expect(draftHasContent(draft({ captures: [] }))).toBe(false);
    expect(draftHasContent(draft({ captures: [], androidImagePaths: ['file:///x.jpg'] }))).toBe(true);
    expect(draftHasContent(null)).toBe(false);
    expect(draftHasContent(undefined)).toBe(false);
  });

  it('bỏ qua bản nháp phiên bản lạ (v khác 1)', async () => {
    await AsyncStorage.setItem('tree_capture_draft:v1:' + OWNER, JSON.stringify({ v: 99, captures: [] }));
    expect(await loadTreeCaptureDraft(OWNER)).toBeNull();
  });
});

describe('namespace theo người dùng — chống rò XUYÊN NGƯỜI DÙNG', () => {
  it('nháp lưu dưới user A → user B khôi phục KHÔNG thấy', async () => {
    await saveTreeCaptureDraft(OWNER, draft());
    // Đăng nhập user B (namespace khác) → không đọc được nháp của A.
    expect(await loadTreeCaptureDraft(OWNER_B)).toBeNull();
    expect(await restoreTreeCaptureDraft(OWNER_B)).toBeNull();
    // Chính user A thì vẫn thấy nháp của mình.
    expect(await loadTreeCaptureDraft(OWNER)).not.toBeNull();
  });

  it('nháp video cũng tách theo user', async () => {
    await saveFruitVideoDraft(OWNER, { v: 1, savedAt: Date.now(), videoUri: 'file:///a.mp4' });
    expect(await loadFruitVideoDraft(OWNER_B)).toBeNull();
    expect(await loadFruitVideoDraft(OWNER)).not.toBeNull();
  });

  it('clearAllDrafts (đăng xuất) xoá nháp MỌI user', async () => {
    await saveTreeCaptureDraft(OWNER, draft());
    await saveTreeCaptureDraft(OWNER_B, draft());
    await saveFruitVideoDraft(OWNER, { v: 1, savedAt: Date.now(), videoUri: 'file:///a.mp4' });
    await clearAllDrafts();
    expect(await loadTreeCaptureDraft(OWNER)).toBeNull();
    expect(await loadTreeCaptureDraft(OWNER_B)).toBeNull();
    expect(await loadFruitVideoDraft(OWNER)).toBeNull();
  });
});

describe('pruneDeadCaptures — lọc URI ảnh đã chết (inject exists)', () => {
  it('bỏ ảnh iOS mà file không còn, giữ ảnh còn sống', async () => {
    const d = draft({ captures: [cap('a', '/tmp/a.jpg'), cap('b', '/tmp/gone.jpg')] });
    const exists = async (uri: string) => !uri.includes('gone');
    const pruned = await pruneDeadCaptures(d, exists);
    expect(pruned.captures.map(c => c.id)).toEqual(['a']);
  });

  it('bỏ URI Android đã chết, giữ URI còn sống', async () => {
    const d = draft({
      captures: [],
      androidImagePaths: ['file:///live.jpg', 'file:///dead.jpg'],
    });
    const exists = async (uri: string) => !uri.includes('dead');
    const pruned = await pruneDeadCaptures(d, exists);
    expect(pruned.androidImagePaths).toEqual(['file:///live.jpg']);
  });

  it('tất cả ảnh chết → draftHasContent(pruned) = false', async () => {
    const d = draft();
    const pruned = await pruneDeadCaptures(d, async () => false);
    expect(draftHasContent(pruned)).toBe(false);
  });
});

describe('pruneDeadCaptures — ĐƯỜNG THẬT (default fileExists → getInfoAsync)', () => {
  it('lọc file:// đã chết qua getInfoAsync thật, giữ file còn sống', async () => {
    // Không inject `exists` → chạy default fileExists → require expo-file-system/legacy.
    const d = draft({ captures: [cap('a', '/tmp/a.jpg'), cap('b', '/tmp/gone.jpg')] });
    const pruned = await pruneDeadCaptures(d);
    expect(pruned.captures.map(c => c.id)).toEqual(['a']);
    const legacy = require('expo-file-system/legacy');
    expect(legacy.getInfoAsync).toHaveBeenCalled();
  });

  it('restoreTreeCaptureDraft: mọi ảnh chết → tự xoá nháp + trả null (đường thật)', async () => {
    await saveTreeCaptureDraft(OWNER, draft({
      captures: [cap('a', '/tmp/gone1.jpg'), cap('b', '/tmp/gone2.jpg')],
    }));
    const restored = await restoreTreeCaptureDraft(OWNER);
    expect(restored).toBeNull();
    // Nháp rỗng đã bị xoá khỏi storage.
    expect(await loadTreeCaptureDraft(OWNER)).toBeNull();
  });

  it('restoreFruitVideoDraft: clip file:// đã chết → tự xoá nháp + trả null (đường thật)', async () => {
    await saveFruitVideoDraft(OWNER, { v: 1, savedAt: Date.now(), videoUri: 'file:///tmp/gone.mp4' });
    expect(await restoreFruitVideoDraft(OWNER)).toBeNull();
    expect(await loadFruitVideoDraft(OWNER)).toBeNull();
  });
});

describe('restoreTreeCaptureDraft', () => {
  it('không có nháp → null', async () => {
    expect(await restoreTreeCaptureDraft(OWNER)).toBeNull();
  });

  it('có nháp (URI coi như còn sống) → trả về kèm nội dung', async () => {
    // URI http:// được fileExists coi là còn (không kiểm đĩa) → không bị lọc.
    await saveTreeCaptureDraft(OWNER,
      draft({ captures: [], androidImagePaths: ['http://x/y.jpg'] }),
    );
    const restored = await restoreTreeCaptureDraft(OWNER);
    expect(restored).not.toBeNull();
    expect(draftHasContent(restored)).toBe(true);
  });
});

describe('bản nháp video quả', () => {
  it('chưa có → null', async () => {
    expect(await loadFruitVideoDraft(OWNER)).toBeNull();
  });

  it('lưu rồi đọc lại giữ URI + cây + ghi chú', async () => {
    await saveFruitVideoDraft(OWNER, {
      v: 1,
      savedAt: Date.now(),
      videoUri: 'file:///tmp/clip.mp4',
      videoSize: 12345,
      selectedTreeId: 'tree-9',
      note: 'chùm phía đông',
      farmId: 'farm-1',
    });
    const back = await loadFruitVideoDraft(OWNER);
    expect(back).toMatchObject({
      videoUri: 'file:///tmp/clip.mp4',
      selectedTreeId: 'tree-9',
      note: 'chùm phía đông',
    });
  });

  it('thiếu videoUri → coi như không có nháp', async () => {
    await AsyncStorage.setItem('fruit_video_draft:v1:' + OWNER, JSON.stringify({ v: 1, savedAt: 1 }));
    expect(await loadFruitVideoDraft(OWNER)).toBeNull();
  });

  it('xoá nháp video → null', async () => {
    await saveFruitVideoDraft(OWNER, { v: 1, savedAt: Date.now(), videoUri: 'file:///a.mp4' });
    await clearFruitVideoDraft(OWNER);
    expect(await loadFruitVideoDraft(OWNER)).toBeNull();
  });
});
