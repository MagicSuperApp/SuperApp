/**
 * videoUploadQueue — CỬA DUY NHẤT gửi video, hàng đợi bền xuyên app-kill.
 *
 * VÌ SAO PHẢI CÓ: `POST /api/tree/{id}/fruit_video` có thể trả `stored:false`
 * (byte gốc CHƯA lên LampNet dù server vẫn 200), hoặc mạng field rớt giữa buổi.
 * Trước đây màn chỉ có nút "gửi lại tại màn" — thoát app là MẤT clip, cả buổi
 * thực-địa không có gì lên mạng. Hàng đợi này giữ video chưa gửi trong
 * AsyncStorage và tự thử lại lúc mở app / khi mạng phục hồi.
 *
 * KIẾN TRÚC 1-CỬA: màn FruitVideo KHÔNG bao giờ POST trực tiếp. Mọi lần gửi —
 * gửi-ngay lẫn gửi-lại — đều đi qua hàng đợi (enqueue → flush / retry). Đây là
 * NGUỒN SỰ THẬT DUY NHẤT cho "clip này đã gửi chưa"; nháp (treeDraftStore) chỉ
 * giữ metadata phiên chụp, KHÔNG chịu trách nhiệm gửi lại byte.
 *
 * NGUYÊN TẮC:
 *  - KHÔNG mất clip: khi xếp hàng, COPY byte video vào documentDirectory (bền hơn
 *    cache của picker — OS hay dọn cache, và document dir sống qua app-kill). Chỉ
 *    xoá bản sao khi backend xác nhận `stored !== false`.
 *  - SERIALIZE mọi read-modify-write hàng đợi qua MỘT mutex nội-bộ (promise-chain).
 *    enqueue / flush-apply / retry / remove / clear đều đi qua mutex, và luôn đọc
 *    lại + sửa THEO id trước khi ghi (không "đọc cả mảng → ghi đè cả mảng" — kiểu
 *    đó nuốt clip enqueue song song lúc flush đang await mạng).
 *  - KHÔNG gửi trùng một job: một tập `inFlight` (giành quyền qua mutex) chặn flush
 *    và retry cùng gửi một job.
 *  - KHÔNG đốt lượt khi offline: flush kiểm mạng trước; offline thì bỏ qua, KHÔNG
 *    tăng attempts.
 *  - Cap attempts (mặc định 5): quá ngưỡng → đánh dấu `needsManual`, GIỮ LẠI job
 *    và bản sao clip để người dùng can thiệp tay, không tự thử vô hạn.
 *  - Tràn MAX_QUEUE: loại job CŨ NHẤT nhưng XOÁ file bản sao của nó + trả tín hiệu
 *    `droppedOldest` (không nuốt im lặng + không để file mồ côi).
 *
 * PHẠM VI: hiện chỉ có một route video (`fruit_video`) trên backend nên mọi job —
 * kể cả `kind:'tree'` — đều gửi qua `uploadFruitVideo`. Giữ trường `kind` để
 * forward-compat khi backend tách route video cây riêng.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
// v56: API documentDirectory/copyAsync/deleteAsync nằm ở gói con `/legacy` (giống
// features/space3d). Import thẳng 'expo-file-system' sẽ KHÔNG có các hàm này (default
// export là API File/Directory mới) → tsc fail + runtime không copy được bản bền.
import * as FileSystem from 'expo-file-system/legacy';
import { ORILIFE_BASE } from './orilifeBase';
import { ensureOrilifeToken } from './orilifeDidAuth';
import { uploadFruitVideo, type FruitVideoResult } from './fruitVideoService';
import { appendVideoProof, type VideoProof } from './videoProofStore';

const QUEUE_KEY = '@aladin/videoUploadQueue/v1';
/** Quá ngưỡng này → đánh dấu cần can thiệp tay, ngừng tự thử. */
export const MAX_ATTEMPTS = 5;
/** Trần số job giữ trong hàng — tránh phình vô hạn nếu backend hỏng dài ngày. */
const MAX_QUEUE = 100;

export type VideoKind = 'tree' | 'fruit';

/** Một clip chờ gửi. Lưu nguyên trong AsyncStorage (mảng dưới một khoá). */
export interface VideoUploadJob {
  /** Định danh nội bộ của job (không phải event_id backend). */
  id: string;
  /** Cây mà clip gắn vào. */
  treeId: string;
  /** URI byte video sẽ gửi — trỏ bản sao trong documentDirectory nếu copy được. */
  videoUri: string;
  /** URI gốc từ picker (có thể bị OS dọn) — giữ để chẩn đoán + khử trùng. */
  originalUri?: string;
  /** true nếu `videoUri` là bản sao do hàng đợi quản lý (được phép xoá khi xong). */
  managedCopy: boolean;
  /** Loại video — hiện đều gửi route fruit_video. */
  kind: VideoKind;
  /**
   * Khoá khử-trùng phía CLIENT, ỔN ĐỊNH theo clip (không đổi qua các lần retry).
   * Gửi kèm multipart để BACKEND dedup (cùng clip retry N lần chỉ tạo 1 event).
   * Server dedup là việc của backend — client chỉ bảo đảm gửi id KHÔNG đổi.
   */
  clientEventId: string;
  lat?: number;
  lon?: number;
  note?: string;
  /** Thời điểm xếp hàng, ISO 8601. */
  createdAt: string;
  /** Số lần đã thử gửi và thất bại. */
  attempts: number;
  /** Lý do thất bại gần nhất (để hiện cho người dùng / chẩn đoán). */
  lastError?: string;
  /** true khi attempts chạm MAX_ATTEMPTS — ngừng tự thử, chờ can thiệp tay. */
  needsManual?: boolean;
  /**
   * CHỦ clip — DID (hoặc user-id) của người đăng nhập lúc xếp hàng.
   *
   * Vì sao cần: hàng đợi nằm dưới MỘT khoá AsyncStorage toàn cục và sống qua đăng
   * xuất, trong khi tablet thực địa dùng CHUNG. Không có trường này thì clip của A
   * sẽ được flush trong phiên của B (App mount / foreground / mạng lên đều gọi
   * flush) và badge trên màn của B đếm clip của A — đúng cái bất biến chống rò
   * A→B mà `treeDraftStore.ts:12-14` tự khai.
   *
   * Job CŨ (tạo trước bản này) không có trường này → coi là "vô chủ", vẫn gửi
   * được để không bỏ rơi clip đã quay ngoài đồng.
   */
  owner?: string;
}

/** Phụ thuộc tiêm được — mặc định nối service thật, test thay bằng giả. */
export interface FlushDeps {
  /** Bảo đảm có token OriLife; `force` để ký lại khi hết hạn. */
  ensureToken: (force?: boolean) => Promise<boolean>;
  /** Gửi một job → kết quả upload. */
  upload: (job: VideoUploadJob) => Promise<FruitVideoResult>;
  /** true nếu đang có mạng dùng được. */
  isOnline: () => Promise<boolean>;
  /** Xoá file bản sao (best-effort, không ném). */
  deleteFile: (uri: string) => Promise<void>;
  /** Ghi bằng chứng khi gửi thành công. */
  onProof: (treeId: string, proof: VideoProof) => Promise<unknown>;
}

// ── Mutex + inFlight (serialize ghi hàng đợi + chặn gửi trùng job) ────────────

/**
 * Promise-chain nối tiếp: mọi read-modify-write hàng đợi chạy TUẦN TỰ qua đây nên
 * không có hai luồng cùng "đọc mảng → ghi đè" giẫm lên nhau. Fn chạy dù mắt xích
 * trước thành hay bại; lỗi được nuốt ở mắt xích (không làm kẹt cả chuỗi).
 */
let mutex: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Id các job đang được một luồng gửi — chặn flush và retry gửi trùng cùng job. */
const inFlight = new Set<string>();

/** Giành quyền gửi job (qua mutex). true = mình được gửi; false = luồng khác đang gửi. */
function claimJob(id: string): Promise<boolean> {
  return withQueueLock(async () => {
    if (inFlight.has(id)) return false;
    inFlight.add(id);
    return true;
  });
}
function releaseJob(id: string): void {
  inFlight.delete(id);
}

// ── Lưu/đọc hàng đợi ─────────────────────────────────────────────────────────

/** Đọc toàn bộ hàng đợi. KHÔNG ném — lỗi/khoá hỏng → mảng rỗng. */
export async function loadVideoQueue(): Promise<VideoUploadJob[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isJob);
  } catch {
    return [];
  }
}

async function saveQueue(jobs: VideoUploadJob[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(jobs.slice(0, MAX_QUEUE)));
  } catch {
    /* bỏ qua — mất một lần ghi còn hơn làm sập màn vừa gửi xong */
  }
}

function isJob(x: any): x is VideoUploadJob {
  return !!x && typeof x.id === 'string' && typeof x.treeId === 'string'
    && typeof x.videoUri === 'string';
}

// ── Chủ hàng đợi (chống rò clip A→B trên máy dùng chung) ─────────────────────

/**
 * DID người đang đăng nhập. Đặt ở `userSlice` (đăng nhập/đăng xuất) vì service này
 * KHÔNG được phép import store. null = chưa đăng nhập / vừa đăng xuất.
 */
let queueOwner: string | null = null;

/** Đặt chủ hàng đợi. Gọi khi đăng nhập (DID) và khi đăng xuất (null). */
export function setVideoQueueOwner(owner: string | null | undefined): void {
  queueOwner = owner && owner.length > 0 ? owner : null;
}

/** Chủ hàng đợi hiện tại (chủ yếu cho test + chẩn đoán). */
export function getVideoQueueOwner(): string | null {
  return queueOwner;
}

/**
 * Job này có thuộc phiên hiện tại không.
 * - Job vô chủ (dữ liệu cũ trước bản này) → luôn thuộc, để không bỏ rơi clip cũ.
 * - Chưa đăng nhập → CHỈ job vô chủ, tuyệt đối không đụng clip của ai.
 */
function ownsJob(job: VideoUploadJob): boolean {
  if (!job.owner) return true;
  return job.owner === queueOwner;
}

/** Hàng đợi THUỘC phiên hiện tại. Mọi thứ hướng ra người dùng phải đi qua đây. */
async function loadOwnQueue(): Promise<VideoUploadJob[]> {
  return (await loadVideoQueue()).filter(ownsJob);
}

/** Số clip của TÔI đang chờ gửi (tính cả cần-can-thiệp-tay). Cho badge. */
export async function getVideoQueueCount(): Promise<number> {
  return (await loadOwnQueue()).length;
}

/** Số clip của TÔI còn tự thử được (chưa chạm cap) — phần "sẽ tự gửi lại". */
export async function getPendingAutoCount(): Promise<number> {
  return (await loadOwnQueue()).filter(j => !j.needsManual).length;
}

/** Số clip của TÔI đã chạm cap — chỉ đi tiếp khi người dùng bấm gửi tay. */
export async function getNeedsManualCount(): Promise<number> {
  return (await loadOwnQueue()).filter(j => j.needsManual).length;
}

/** Job `id` còn nằm trong hàng không (màn dùng để biết clip vừa gửi đã xong hay còn chờ). */
export async function isJobQueued(id: string): Promise<boolean> {
  return (await loadVideoQueue()).some(j => j.id === id);
}

// ── Khoá khử-trùng ổn định theo clip ─────────────────────────────────────────

/** FNV-1a 32-bit → hex 8 ký tự. Tất định, không cần thư viện crypto. */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Sinh clientEventId ỔN ĐỊNH theo clip: hash(treeId + mốc-quay + kích-thước). Cùng
 * clip (cùng cây, cùng lúc quay, cùng dung-lượng) → LUÔN cùng id, kể cả gửi lại
 * nhiều lần. Thiếu mốc-quay/kích-thước → lùi về URI gốc (vẫn ổn định theo file).
 */
export function computeClientEventId(
  treeId: string,
  capturedAt: number | undefined,
  size: number | undefined,
  fallbackUri: string,
): string {
  const basis = capturedAt != null || size != null
    ? `${treeId}|${capturedAt ?? ''}|${size ?? ''}`
    : `${treeId}|${fallbackUri}`;
  return `ce_${stableHash(basis)}`;
}

// ── Xếp hàng ─────────────────────────────────────────────────────────────────

export interface EnqueueInput {
  treeId: string;
  videoUri: string;
  kind: VideoKind;
  lat?: number;
  lon?: number;
  note?: string;
  /** Mốc quay (ms) — để sinh clientEventId ổn định. */
  capturedAt?: number;
  /** Dung-lượng clip (byte) — để sinh clientEventId ổn định. */
  size?: number;
  /** Chủ clip (DID). Thiếu → lấy chủ hàng đợi hiện tại. */
  owner?: string;
}

/** Kết quả xếp hàng: job (mới hoặc đã có nếu trùng) + số job cũ bị loại do tràn. */
export interface EnqueueResult {
  job: VideoUploadJob;
  /** >0 nghĩa là hàng đã đầy MAX_QUEUE và bấy nhiêu clip cũ nhất bị loại (đã xoá file). */
  droppedOldest: number;
}

function newId(): string {
  return `vq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Copy clip vào documentDirectory để sống qua app-kill và tránh bị OS dọn cache.
 * Best-effort: thất bại (không có document dir / copy lỗi) → trả URI gốc, managed=false.
 */
async function copyToDocuments(id: string, srcUri: string): Promise<{ uri: string; managed: boolean }> {
  try {
    const dir = FileSystem.documentDirectory;
    if (!dir) return { uri: srcUri, managed: false };
    const dest = `${dir}videoq_${id}.mp4`;
    await FileSystem.copyAsync({ from: srcUri, to: dest });
    return { uri: dest, managed: true };
  } catch {
    return { uri: srcUri, managed: false };
  }
}

/**
 * Xếp một clip vào hàng đợi. Gọi khi gửi-ngay HOẶC khi cần gửi lại sau.
 * Copy byte video vào document dir trước khi ghi job. Khử trùng theo (treeId +
 * originalUri) hoặc theo clientEventId: xếp lại cùng clip không nhân đôi.
 * Toàn bộ đọc-sửa-ghi mảng chạy trong mutex (không giẫm lên flush song song).
 */
export async function enqueueVideoUpload(
  input: EnqueueInput,
  lastError?: string,
): Promise<EnqueueResult> {
  const id = newId();
  // Copy file NGOÀI mutex (IO nặng, không đụng mảng hàng đợi).
  const { uri, managed } = await copyToDocuments(id, input.videoUri);
  const clientEventId = computeClientEventId(input.treeId, input.capturedAt, input.size, input.videoUri);

  const owner = input.owner && input.owner.length > 0 ? input.owner : (queueOwner ?? undefined);

  return withQueueLock(async () => {
    const existing = await loadVideoQueue();
    // Khử trùng: cùng cây + cùng clip gốc, hoặc cùng clientEventId → thay job cũ.
    // CHỈ trong phạm vi CÙNG CHỦ: hai người khác nhau quay cùng cây không được
    // gộp job của nhau (job của A sẽ mang ghi chú/GPS của A).
    const dupe = existing.find(
      j => (j.owner ?? undefined) === owner
        && ((j.treeId === input.treeId && j.originalUri === input.videoUri)
          || j.clientEventId === clientEventId),
    );
    if (dupe) {
      // Bản sao mới vừa tạo là dư thừa → xoá cho khỏi rác file, dùng lại bản cũ.
      if (managed && uri !== dupe.videoUri) await safeDeleteDefault(uri);
      const updated: VideoUploadJob = {
        ...dupe,
        lastError,
        createdAt: new Date().toISOString(),
        needsManual: false,
      };
      const next = existing.map(j => (j.id === dupe.id ? updated : j));
      await saveQueue(next);
      return { job: updated, droppedOldest: 0 };
    }

    const job: VideoUploadJob = {
      id,
      treeId: input.treeId,
      videoUri: uri,
      originalUri: input.videoUri,
      managedCopy: managed,
      kind: input.kind,
      clientEventId,
      lat: input.lat,
      lon: input.lon,
      note: input.note,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError,
      owner,
    };

    let next = [job, ...existing];
    let droppedOldest = 0;
    if (next.length > MAX_QUEUE) {
      // Loại các job CŨ NHẤT (cuối mảng) NHƯNG xoá file bản sao + báo ra ngoài.
      const dropped = next.slice(MAX_QUEUE);
      for (const d of dropped) if (d.managedCopy) await safeDeleteDefault(d.videoUri);
      droppedOldest = dropped.length;
      next = next.slice(0, MAX_QUEUE);
    }
    await saveQueue(next);
    return { job, droppedOldest };
  });
}

/** Xoá một job khỏi hàng (kèm xoá bản sao clip nếu do hàng đợi quản lý). */
export async function removeVideoJob(id: string): Promise<void> {
  await withQueueLock(async () => {
    const jobs = await loadVideoQueue();
    const job = jobs.find(j => j.id === id);
    if (job?.managedCopy) await safeDeleteDefault(job.videoUri);
    await saveQueue(jobs.filter(j => j.id !== id));
  });
}

/** Xoá sạch hàng đợi (kèm mọi bản sao). Dùng cho gỡ lỗi / reset. */
export async function clearVideoQueue(): Promise<void> {
  await withQueueLock(async () => {
    const jobs = await loadVideoQueue();
    for (const j of jobs) if (j.managedCopy) await safeDeleteDefault(j.videoUri);
    try {
      await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
      /* bỏ qua */
    }
  });
}

async function safeDeleteDefault(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* bỏ qua */
  }
}

// ── Flush (thử gửi lại) ──────────────────────────────────────────────────────

async function defaultIsOnline(): Promise<boolean> {
  try {
    const s = await NetInfo.fetch();
    // Cùng quy ước với useOffline/navigation: reachable null lúc chưa rõ → coi online.
    return s.isConnected === true && s.isInternetReachable !== false;
  } catch {
    return true; // không rõ mạng → cứ thử, upload tự báo lỗi nếu rớt
  }
}

function defaultDeps(): FlushDeps {
  return {
    ensureToken: (force?: boolean) => ensureOrilifeToken(ORILIFE_BASE, force ? { force: true } : undefined),
    upload: (job) => uploadFruitVideo(ORILIFE_BASE, job.treeId, job.videoUri, {
      lat: job.lat, lon: job.lon, note: job.note, clientEventId: job.clientEventId,
    }),
    isOnline: defaultIsOnline,
    deleteFile: safeDeleteDefault,
    onProof: appendVideoProof,
  };
}

let flushing = false;

export interface FlushResult {
  /** Số job gửi xong (stored !== false) và đã rời hàng. */
  sent: number;
  /** Số job vẫn còn trong hàng sau lượt flush. */
  remaining: number;
  /** Số job vừa chạm cap needsManual trong lượt này. */
  hitCap: number;
  /** true nếu bỏ qua vì offline / đang flush. */
  skipped: boolean;
}

/**
 * Thử gửi lại toàn bộ hàng đợi. Gọi lúc app launch + khi mạng phục hồi.
 *  - Offline → bỏ qua, KHÔNG tăng attempts.
 *  - Mỗi job: giành quyền qua `inFlight` (khỏi trùng với retry tay), gửi qua service
 *    NGOÀI mutex (mạng chậm), rồi ÁP kết quả vào hàng TRONG mutex theo id — đọc lại
 *    mảng ngay trước khi ghi để KHÔNG nuốt clip enqueue song song.
 *  - `stored !== false` → ghi bằng chứng, xoá job + bản sao. Thất bại → attempts++,
 *    giữ lại; chạm MAX_ATTEMPTS → needsManual (ngừng tự thử).
 *  - Job đã needsManual: bỏ qua trong auto-flush (chờ người dùng gọi retry tay).
 * An toàn khi gọi trùng: khoá `flushing` chống flush-vs-flush.
 */
export async function flushVideoUploadQueue(deps: FlushDeps = defaultDeps()): Promise<FlushResult> {
  if (flushing) return { sent: 0, remaining: await getVideoQueueCount(), hitCap: 0, skipped: true };
  flushing = true;
  try {
    const snapshot = await loadVideoQueue();
    if (snapshot.length === 0) return { sent: 0, remaining: 0, hitCap: 0, skipped: false };
    if (!(await deps.isOnline())) {
      return { sent: 0, remaining: snapshot.length, hitCap: 0, skipped: true };
    }

    let sent = 0;
    let hitCap = 0;

    for (const job of snapshot) {
      // Clip của người khác (hoặc chưa ai đăng nhập) → KHÔNG đụng tới. Nó chờ đúng
      // chủ của nó đăng nhập lại; gửi hộ ở đây là rò dữ liệu A→B.
      if (!ownsJob(job)) continue;
      // Cần can thiệp tay → giữ nguyên, không tự thử.
      if (job.needsManual) continue;
      // Job đang được retry tay gửi → bỏ qua để khỏi gửi trùng.
      const claimed = await claimJob(job.id);
      if (!claimed) continue;
      try {
        const outcome = await tryOne(job, deps);
        await applyOutcome(job.id, outcome);
        if (outcome.done) sent += 1;
        else if (outcome.job.needsManual) hitCap += 1;
      } finally {
        releaseJob(job.id);
      }
    }

    const remaining = await getVideoQueueCount();
    return { sent, remaining, hitCap, skipped: false };
  } finally {
    flushing = false;
  }
}

/**
 * Ép thử lại một job NGAY, kể cả khi đã needsManual (dùng cho nút "Gửi lại" tay).
 * Reset needsManual trước khi thử. Trả về true nếu gửi xong (job đã rời hàng).
 * Đi qua CÙNG `inFlight` với flush → không bao giờ gửi trùng một job.
 */
export async function retryVideoJobNow(
  id: string,
  deps: FlushDeps = defaultDeps(),
): Promise<boolean> {
  const jobs = await loadVideoQueue();
  const target = jobs.find(j => j.id === id);
  if (!target) return false;
  // Không gửi hộ clip của người khác, kể cả khi có id trong tay.
  if (!ownsJob(target)) return false;
  if (!(await deps.isOnline())) return false;
  // Giành quyền gửi: flush đang gửi job này thì thôi (không gửi trùng).
  const claimed = await claimJob(id);
  if (!claimed) return false;
  try {
    const outcome = await tryOne({ ...target, needsManual: false }, deps);
    await applyOutcome(id, outcome);
    return outcome.done;
  } finally {
    releaseJob(id);
  }
}

/**
 * Ép thử lại MỌI clip của phiên hiện tại, KỂ CẢ clip đã chạm cap `needsManual`.
 *
 * Vì sao cần: `retryVideoJobNow` phải biết id job, mà màn hình chỉ giữ id của clip
 * vừa quay trong state. Rời màn / tắt app là mất id → nút "Gửi lại" rơi về
 * `flushVideoUploadQueue`, mà flush CỐ Ý bỏ qua job `needsManual` ⇒ clip chạm cap
 * không còn đường nào rời máy, trong khi badge vẫn hứa "sẽ tự gửi lại khi có mạng".
 * Đây là đường thoát cho đúng những clip đó.
 *
 * Trả về số clip đã gửi xong và số còn lại (của phiên hiện tại).
 */
export async function retryAllVideoJobsNow(
  deps: FlushDeps = defaultDeps(),
): Promise<{ sent: number; remaining: number }> {
  const jobs = await loadOwnQueue();
  let sent = 0;
  for (const job of jobs) {
    if (await retryVideoJobNow(job.id, deps)) sent += 1;
  }
  return { sent, remaining: await getVideoQueueCount() };
}

/**
 * Áp kết quả một lần thử vào hàng, TRONG mutex, THEO id: đọc lại mảng hiện tại rồi
 * chỉ sửa đúng job đó (xoá nếu xong, cập nhật nếu chưa). Không đụng job khác nên
 * clip enqueue song song lúc đang gửi KHÔNG bị nuốt.
 */
async function applyOutcome(
  id: string,
  outcome: { done: true } | { done: false; job: VideoUploadJob },
): Promise<void> {
  await withQueueLock(async () => {
    const cur = await loadVideoQueue();
    const idx = cur.findIndex(j => j.id === id);
    if (idx === -1) return; // đã bị xoá ở nơi khác
    if (outcome.done) cur.splice(idx, 1);
    else cur[idx] = outcome.job;
    await saveQueue(cur);
  });
}

/**
 * Thử gửi một job (CHỈ phần mạng + xoá file + ghi bằng chứng, KHÔNG ghi mảng hàng
 * đợi — việc đó do applyOutcome làm trong mutex). Trả `{done:true}` khi backend
 * xác nhận `stored!==false`. Ngược lại trả job đã cập nhật attempts/lastError.
 */
async function tryOne(
  job: VideoUploadJob,
  deps: FlushDeps,
): Promise<{ done: true } | { done: false; job: VideoUploadJob }> {
  // Bảo đảm token trước; không có token → coi như một lần thử hỏng (đừng đốt clip).
  const hasToken = await deps.ensureToken();
  let res: FruitVideoResult;
  if (!hasToken) {
    res = { ok: false, error: { type: 'auth_error', detail: 'Chưa lấy được phiên', http_status: 0 } };
  } else {
    res = await deps.upload(job);
    // Token hết hạn giữa chừng → ký lại một lần rồi thử lại.
    if (!res.ok && res.error?.type === 'auth_error') {
      if (await deps.ensureToken(true)) res = await deps.upload(job);
    }
  }

  // Gửi xong VÀ byte đã lên LampNet.
  if (res.ok && res.stored !== false) {
    if (res.video_cid) {
      await deps.onProof(job.treeId, {
        videoCid: res.video_cid,
        kind: job.kind,
        at: new Date().toISOString(),
        eventId: res.event_id,
        // Neo bằng chứng vào ĐÚNG clip đã gửi. Không có nó thì màn kết quả chỉ còn
        // cách đoán "bản ghi mới nhất của cây" — và đoán sai khi một cây có nhiều
        // clip trong hàng (flush duyệt [mới→cũ] còn sổ thì prepend ⇒ bản ghi cuối
        // cùng lại là clip CŨ NHẤT).
        clientEventId: job.clientEventId,
        nFruitsMax: res.n_fruits_max,
        nFrames: res.n_frames,
        stored: res.stored,
        lat: job.lat,
        lon: job.lon,
      });
    }
    if (job.managedCopy) await deps.deleteFile(job.videoUri);
    return { done: true };
  }

  // Chưa xong: server nhận nhưng stored===false, hoặc lỗi mạng/quyền.
  const attempts = job.attempts + 1;
  const lastError = res.ok
    ? 'stored=false (byte chưa lên LampNet)'
    : (res.error?.detail ?? 'Gửi thất bại');
  const updated: VideoUploadJob = {
    ...job,
    attempts,
    lastError,
    needsManual: attempts >= MAX_ATTEMPTS,
  };
  return { done: false, job: updated };
}

// ── Test helper ──────────────────────────────────────────────────────────────

/** CHỈ dùng trong test: xoá cờ flushing + mutex + inFlight + chủ hàng đợi. */
export function _resetForTest(): void {
  flushing = false;
  mutex = Promise.resolve();
  inFlight.clear();
  queueOwner = null;
}
