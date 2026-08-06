// Unit test cho videoUploadQueue — CỬA DUY NHẤT gửi video, hàng đợi bền xuyên app-kill.
//
// Kiểm: enqueue (copy file + khử trùng + EnqueueResult), flush thành công (xoá job +
// ghi bằng chứng), flush lỗi mạng (tăng attempts, giữ lại), stored=false (giữ lại),
// cap attempts → needsManual, bỏ qua khi offline (không đốt lượt), retry tay, tràn
// MAX_QUEUE (xoá file + báo droppedOldest), và 3 bất biến then-chốt của bản hợp nhất:
//   · lost-update: enqueue song song lúc flush đang await upload → clip mới KHÔNG bị nuốt.
//   · double-send: retry + autoflush cùng job → upload gọi ĐÚNG 1 lần.
//   · idempotency: cùng clip qua flush + retry → clientEventId gửi đi GIỐNG NHAU.
//
// Mock AsyncStorage + expo-file-system/legacy bằng in-memory để không đụng native module.
// Flush nhận deps tiêm được → không cần mock service upload/token thật.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FruitVideoResult } from './fruitVideoService';

const storage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => storage[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { storage[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete storage[k]; }),
  },
}));

// expo-file-system/legacy: theo dõi copy/delete, có documentDirectory (v56: API cũ ở /legacy).
const copied: Array<{ from: string; to: string }> = [];
const deleted: string[] = [];
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///docs/',
  copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    copied.push({ from, to });
  }),
  deleteAsync: jest.fn(async (uri: string) => { deleted.push(uri); }),
}));

// NetInfo mặc định online (flush test tự tiêm isOnline khi cần).
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}));

import {
  enqueueVideoUpload,
  loadVideoQueue,
  getVideoQueueCount,
  getPendingAutoCount,
  isJobQueued,
  computeClientEventId,
  flushVideoUploadQueue,
  retryVideoJobNow,
  retryAllVideoJobsNow,
  setVideoQueueOwner,
  getNeedsManualCount,
  removeVideoJob,
  clearVideoQueue,
  MAX_ATTEMPTS,
  _resetForTest,
  type FlushDeps,
  type VideoUploadJob,
} from './videoUploadQueue';

const QUEUE_KEY = '@aladin/videoUploadQueue/v1';

beforeEach(() => {
  for (const k of Object.keys(storage)) delete storage[k];
  copied.length = 0;
  deleted.length = 0;
  _resetForTest();
});

// Helper dựng deps giả cho flush.
function makeDeps(over: Partial<FlushDeps> = {}): FlushDeps {
  return {
    ensureToken: jest.fn(async () => true),
    upload: jest.fn(async () => ({ ok: true, stored: true, video_cid: 'cid-1' } as FruitVideoResult)),
    isOnline: jest.fn(async () => true),
    deleteFile: jest.fn(async () => {}),
    onProof: jest.fn(async () => []),
    ...over,
  };
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('enqueue', () => {
  it('copy clip vào document dir + ghi job (EnqueueResult) vào AsyncStorage', async () => {
    const { job, droppedOldest } = await enqueueVideoUpload(
      { treeId: 't1', videoUri: 'file:///cache/clip.mp4', kind: 'fruit', lat: 1, lon: 2, note: 'x' },
      'network_error',
    );
    expect(droppedOldest).toBe(0);
    expect(job.managedCopy).toBe(true);
    expect(job.videoUri).toBe(`file:///docs/videoq_${job.id}.mp4`);
    expect(job.originalUri).toBe('file:///cache/clip.mp4');
    expect(job.attempts).toBe(0);
    expect(job.lastError).toBe('network_error');
    expect(job.clientEventId).toBeTruthy();
    expect(copied).toHaveLength(1);

    const q = await loadVideoQueue();
    expect(q).toHaveLength(1);
    expect(q[0].treeId).toBe('t1');
  });

  it('copy thất bại → dùng URI gốc, managed=false, vẫn ghi job', async () => {
    const fs = require('expo-file-system/legacy');
    (fs.copyAsync as jest.Mock).mockRejectedValueOnce(new Error('no space'));
    const { job } = await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    expect(job.managedCopy).toBe(false);
    expect(job.videoUri).toBe('file:///cache/c.mp4');
    expect(await getVideoQueueCount()).toBe(1);
  });

  it('khử trùng: cùng cây + cùng clip gốc → không nhân đôi', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' }, 'lỗi lần 2');
    const q = await loadVideoQueue();
    expect(q).toHaveLength(1);
    expect(q[0].lastError).toBe('lỗi lần 2');
  });
});

describe('clientEventId — ổn định theo clip', () => {
  it('cùng (treeId + capturedAt + size) → cùng id; khác thì khác', () => {
    const a = computeClientEventId('t1', 111, 222, 'file:///cache/a.mp4');
    const b = computeClientEventId('t1', 111, 222, 'file:///cache/DIFFERENT.mp4');
    const c = computeClientEventId('t1', 999, 222, 'file:///cache/a.mp4');
    expect(a).toBe(b);      // đổi URI không đổi id khi có mốc-quay + size
    expect(a).not.toBe(c);  // đổi mốc-quay → đổi id
  });
});

describe('flush — thành công', () => {
  it('stored=true → ghi bằng chứng, xoá bản sao, rời hàng', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const deps = makeDeps();
    const r = await flushVideoUploadQueue(deps);
    expect(r.sent).toBe(1);
    expect(r.remaining).toBe(0);
    expect(deps.onProof).toHaveBeenCalledWith('t1', expect.objectContaining({ videoCid: 'cid-1', kind: 'fruit' }));
    expect(deps.deleteFile).toHaveBeenCalledTimes(1);
    expect(await getVideoQueueCount()).toBe(0);
  });
});

describe('flush — thất bại giữ lại', () => {
  it('lỗi mạng → attempts++ và job vẫn trong hàng', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const deps = makeDeps({
      upload: jest.fn(async () => ({ ok: false, error: { type: 'network_error', detail: 'rớt', http_status: 0 } } as FruitVideoResult)),
    });
    const r = await flushVideoUploadQueue(deps);
    expect(r.sent).toBe(0);
    expect(r.remaining).toBe(1);
    const q = await loadVideoQueue();
    expect(q[0].attempts).toBe(1);
    expect(q[0].lastError).toBe('rớt');
    expect(q[0].needsManual).toBe(false);
  });

  it('stored=false → giữ lại để thử tiếp (byte chưa lên LampNet)', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const deps = makeDeps({
      upload: jest.fn(async () => ({ ok: true, stored: false, video_cid: 'cid-x' } as FruitVideoResult)),
    });
    const r = await flushVideoUploadQueue(deps);
    expect(r.sent).toBe(0);
    const q = await loadVideoQueue();
    expect(q[0].attempts).toBe(1);
    expect(q[0].lastError).toContain('stored=false');
    expect(deps.onProof).not.toHaveBeenCalled();
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  // Đây là đường mất bằng chứng im lặng nhất của cả dây: máy chủ KHÔNG nói gì về
  // `stored` thì trước đây `fruitVideoService` điền hộ `true`, và khối thành công xoá
  // bản sao clip. Không lỗi, không cảnh báo — chỉ là clip biến mất.
  it('stored VẮNG → vẫn ghi bằng chứng nhưng GIỮ bản sao, không xoá', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const deps = makeDeps({
      upload: jest.fn(async () => ({ ok: true, video_cid: 'cid-im-lang' } as FruitVideoResult)),
    });
    const r = await flushVideoUploadQueue(deps);
    expect(r.sent).toBe(1);
    expect(deps.onProof).toHaveBeenCalledTimes(1);
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('lampnet_disabled → dừng thử ngay (CID là giả, gửi lại chỉ đốt pin giữa vườn)', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const deps = makeDeps({
      upload: jest.fn(async () =>
        ({
          ok: true,
          stored: false,
          store_reason: 'lampnet_disabled',
          video_cid: 'local_deadbeef_c.mp4',
        }) as FruitVideoResult,
      ),
    });
    await flushVideoUploadQueue(deps);
    const q = await loadVideoQueue();
    expect(q[0].attempts).toBe(1);
    expect(q[0].needsManual).toBe(true); // KHÔNG đợi hết 5 lượt
    expect(q[0].lastError).toContain('lampnet_disabled');
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it('lampnet_unreachable → vẫn thử lại như thường (mạng/kho lỗi, gửi lại có ích)', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const deps = makeDeps({
      upload: jest.fn(async () =>
        ({ ok: true, stored: false, store_reason: 'lampnet_unreachable' }) as FruitVideoResult,
      ),
    });
    await flushVideoUploadQueue(deps);
    const q = await loadVideoQueue();
    expect(q[0].attempts).toBe(1);
    expect(q[0].needsManual).toBe(false);
  });
});

describe('cap attempts', () => {
  it('chạm MAX_ATTEMPTS → needsManual, auto-flush bỏ qua sau đó', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const failUpload = jest.fn(async () => ({ ok: false, error: { type: 'network_error', detail: 'rớt', http_status: 0 } } as FruitVideoResult));
    const deps = makeDeps({ upload: failUpload });
    // Chạy đủ MAX_ATTEMPTS lượt flush.
    for (let i = 0; i < MAX_ATTEMPTS; i++) await flushVideoUploadQueue(deps);
    let q = await loadVideoQueue();
    expect(q[0].attempts).toBe(MAX_ATTEMPTS);
    expect(q[0].needsManual).toBe(true);
    expect(await getPendingAutoCount()).toBe(0);
    expect(await getVideoQueueCount()).toBe(1);

    // Lượt flush kế: job needsManual bị bỏ qua → upload KHÔNG được gọi thêm.
    const callsBefore = failUpload.mock.calls.length;
    const r = await flushVideoUploadQueue(deps);
    expect(failUpload.mock.calls.length).toBe(callsBefore);
    expect(r.remaining).toBe(1);
  });
});

describe('offline', () => {
  it('offline → bỏ qua, KHÔNG tăng attempts', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    const deps = makeDeps({ isOnline: jest.fn(async () => false), upload: jest.fn() });
    const r = await flushVideoUploadQueue(deps);
    expect(r.skipped).toBe(true);
    expect(deps.upload).not.toHaveBeenCalled();
    const q = await loadVideoQueue();
    expect(q[0].attempts).toBe(0);
  });
});

describe('retry tay', () => {
  it('retryVideoJobNow ép thử job needsManual, thành công → rời hàng', async () => {
    // Dựng sẵn 1 job đã needsManual trong storage.
    const job: VideoUploadJob = {
      id: 'vq_x', treeId: 't1', videoUri: 'file:///docs/videoq_x.mp4',
      originalUri: 'file:///cache/c.mp4', managedCopy: true, kind: 'fruit', clientEventId: 'ce_x',
      createdAt: new Date().toISOString(), attempts: MAX_ATTEMPTS, needsManual: true,
    };
    storage[QUEUE_KEY] = JSON.stringify([job]);
    const deps = makeDeps();
    const ok = await retryVideoJobNow('vq_x', deps);
    expect(ok).toBe(true);
    expect(await getVideoQueueCount()).toBe(0);
    expect(deps.onProof).toHaveBeenCalled();
  });
});

describe('tràn MAX_QUEUE', () => {
  it('loại job CŨ NHẤT + XOÁ file bản sao + báo droppedOldest (không im lặng)', async () => {
    const jobs: VideoUploadJob[] = Array.from({ length: 100 }, (_, i) => ({
      id: `old_${i}`, treeId: 't', videoUri: `file:///docs/old_${i}.mp4`,
      originalUri: `file:///cache/old_${i}.mp4`, managedCopy: true, kind: 'fruit',
      clientEventId: `ceOld_${i}`, createdAt: new Date(2020, 0, 1, 0, 0, i).toISOString(), attempts: 0,
    }));
    storage[QUEUE_KEY] = JSON.stringify(jobs);

    const enq = await enqueueVideoUpload({ treeId: 't', videoUri: 'file:///cache/new.mp4', kind: 'fruit' });
    expect(enq.droppedOldest).toBe(1);
    const q = await loadVideoQueue();
    expect(q).toHaveLength(100);
    expect(q[0].id).toBe(enq.job.id);               // job mới ở đầu
    expect(q.some(j => j.id === 'old_99')).toBe(false); // job cũ nhất (cuối) bị loại
    expect(deleted).toContain('file:///docs/old_99.mp4'); // file bản sao đã xoá, không mồ côi
  });
});

describe('BẤT BIẾN hợp nhất', () => {
  it('lost-update: enqueue song song lúc flush đang await upload → clip mới KHÔNG bị nuốt', async () => {
    const { job: jobA } = await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit' });
    let injected = false;
    const deps = makeDeps({
      upload: jest.fn(async () => {
        if (!injected) {
          injected = true;
          // Clip MỚI vào hàng NGAY giữa lúc flush đang await mạng.
          await enqueueVideoUpload({ treeId: 't2', videoUri: 'file:///cache/new.mp4', kind: 'fruit' });
        }
        return { ok: true, stored: true, video_cid: 'cid' } as FruitVideoResult;
      }),
    });
    await flushVideoUploadQueue(deps);
    const q = await loadVideoQueue();
    // jobA gửi xong (rời hàng); clip mới t2 VẪN còn (không bị ghi đè cả-mảng nuốt).
    expect(q.some(j => j.treeId === 't2')).toBe(true);
    expect(q.some(j => j.id === jobA.id)).toBe(false);
  });

  it('double-send: retry + autoflush song song cùng job → upload gọi ĐÚNG 1 lần', async () => {
    const { job } = await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit' });
    const upload = jest.fn(async () => {
      await delay(15);
      return { ok: true, stored: true, video_cid: 'cid' } as FruitVideoResult;
    });
    const deps = makeDeps({ upload });
    await Promise.all([
      flushVideoUploadQueue(deps),
      retryVideoJobNow(job.id, deps),
    ]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await getVideoQueueCount()).toBe(0);
    expect(await isJobQueued(job.id)).toBe(false);
  });

  it('idempotency: cùng clip qua flush + retry → clientEventId gửi đi GIỐNG NHAU', async () => {
    const seen: Array<string | undefined> = [];
    const upload = jest.fn(async (j: VideoUploadJob) => {
      seen.push(j.clientEventId);
      return { ok: false, error: { type: 'network_error', detail: 'rớt', http_status: 0 } } as FruitVideoResult;
    });
    const deps = makeDeps({ upload });
    const { job } = await enqueueVideoUpload(
      { treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit', capturedAt: 111, size: 222 },
    );
    await flushVideoUploadQueue(deps);    // lần 1 (lỗi → giữ lại)
    await retryVideoJobNow(job.id, deps); // lần 2 (lỗi → giữ lại)
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(job.clientEventId);
    expect(new Set(seen).size).toBe(1);
    expect(job.clientEventId).toBeTruthy();
  });
});

describe('remove + clear', () => {
  it('removeVideoJob xoá job + bản sao', async () => {
    const { job } = await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/c.mp4', kind: 'fruit' });
    await removeVideoJob(job.id);
    expect(await getVideoQueueCount()).toBe(0);
    expect(deleted).toContain(job.videoUri);
  });

  it('clearVideoQueue xoá sạch + mọi bản sao', async () => {
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit' });
    await enqueueVideoUpload({ treeId: 't2', videoUri: 'file:///cache/b.mp4', kind: 'fruit' });
    await clearVideoQueue();
    expect(await getVideoQueueCount()).toBe(0);
    expect(deleted).toHaveLength(2);
  });
});

// ── Nợ sau merge #97: chủ hàng đợi + đường thoát cho clip chạm cap ────────────

describe('chủ hàng đợi (chống rò clip A→B trên máy dùng chung)', () => {
  it('flush KHÔNG đụng clip của người khác, nhưng gửi clip của chính mình', async () => {
    setVideoQueueOwner('did:phoenix:A');
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit' });
    // A đăng xuất, B đăng nhập trên cùng máy.
    setVideoQueueOwner('did:phoenix:B');
    await enqueueVideoUpload({ treeId: 't2', videoUri: 'file:///cache/b.mp4', kind: 'fruit' });

    const deps = makeDeps();
    const res = await flushVideoUploadQueue(deps);

    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect((deps.upload as jest.Mock).mock.calls[0][0].treeId).toBe('t2');
    expect(res.sent).toBe(1);
    // Clip của A vẫn nằm nguyên trong kho, chờ chính A đăng nhập lại.
    const all = await loadVideoQueue();
    expect(all.map(j => j.treeId)).toEqual(['t1']);
  });

  it('badge chỉ đếm clip của phiên hiện tại', async () => {
    setVideoQueueOwner('did:phoenix:A');
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit' });
    expect(await getVideoQueueCount()).toBe(1);
    setVideoQueueOwner('did:phoenix:B');
    expect(await getVideoQueueCount()).toBe(0);
    // Đăng xuất hẳn: không ai được thấy clip có chủ.
    setVideoQueueOwner(null);
    expect(await getVideoQueueCount()).toBe(0);
  });

  it('job CŨ không có owner vẫn gửi được (không bỏ rơi clip quay trước bản này)', async () => {
    storage[QUEUE_KEY] = JSON.stringify([{
      id: 'old1', treeId: 't9', videoUri: 'file:///docs/old.mp4', managedCopy: true,
      kind: 'fruit', clientEventId: 'ce_old', createdAt: new Date().toISOString(), attempts: 0,
    }]);
    setVideoQueueOwner('did:phoenix:B');
    const deps = makeDeps();
    await flushVideoUploadQueue(deps);
    expect(deps.upload).toHaveBeenCalledTimes(1);
  });

  it('không gửi hộ clip người khác kể cả khi có id trong tay', async () => {
    setVideoQueueOwner('did:phoenix:A');
    const { job } = await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit' });
    setVideoQueueOwner('did:phoenix:B');
    const deps = makeDeps();
    expect(await retryVideoJobNow(job.id, deps)).toBe(false);
    expect(deps.upload).not.toHaveBeenCalled();
  });
});

describe('clip chạm cap vẫn còn đường rời máy', () => {
  it('flush bỏ qua job needsManual, retryAllVideoJobsNow thì gửi được', async () => {
    setVideoQueueOwner('did:phoenix:A');
    await enqueueVideoUpload({ treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit' });

    // Đốt hết lượt tự thử → needsManual.
    const failing = makeDeps({
      upload: jest.fn(async () => ({ ok: false, error: { type: 'network_error', detail: 'rớt mạng', http_status: 0 } } as FruitVideoResult)),
    });
    for (let i = 0; i < MAX_ATTEMPTS; i++) await flushVideoUploadQueue(failing);
    const q = await loadVideoQueue();
    expect(q[0].needsManual).toBe(true);
    expect(await getPendingAutoCount()).toBe(0);
    expect(await getNeedsManualCount()).toBe(1);

    // Mạng tốt trở lại: flush vẫn cố ý bỏ qua…
    const good = makeDeps();
    await flushVideoUploadQueue(good);
    expect(good.upload).not.toHaveBeenCalled();

    // …còn nút "Gửi lại" khi không nhớ id job thì phải gửi được.
    const manual = makeDeps();
    const res = await retryAllVideoJobsNow(manual);
    expect(manual.upload).toHaveBeenCalledTimes(1);
    expect(res.sent).toBe(1);
    expect(await getVideoQueueCount()).toBe(0);
  });
});

describe('bằng chứng neo vào ĐÚNG clip', () => {
  it('ghi clientEventId vào sổ bằng chứng để màn kết quả không lấy nhầm clip khác', async () => {
    setVideoQueueOwner('did:phoenix:A');
    const { job } = await enqueueVideoUpload({
      treeId: 't1', videoUri: 'file:///cache/a.mp4', kind: 'fruit', capturedAt: 111, size: 222,
    });
    const deps = makeDeps();
    await flushVideoUploadQueue(deps);
    const proof = (deps.onProof as jest.Mock).mock.calls[0][1];
    expect(proof.clientEventId).toBe(job.clientEventId);
  });
});
