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
 * ĐỊNH TUYẾN THEO `kind` — GIA CỐ PHÒNG XA, không phải vá một lỗi đang xảy ra.
 *
 * Có HAI cửa video, khác nghĩa hẳn nhau:
 *   POST /api/tree/{id}/video        làm GIÀU góc nhìn của chính CÂY (treeVideoService)
 *   POST /api/tree/{id}/fruit_video  ĐẾM QUẢ trên cây          (fruitVideoService)
 * Tiền đề cũ ghi ở đây — "hiện chỉ có một route video" — sai, và `upload` cũ gọi
 * `uploadFruitVideo` cho MỌI job bất kể `kind`.
 *
 * NHƯNG hôm nay điều đó VÔ HẠI, và cần nói rõ để không ai đọc chỗ này rồi tưởng đã
 * có clip cây đi lạc. Đo toàn repo:
 *   - chỗ gọi `enqueueVideoUpload` DUY NHẤT là FruitVideoScreen.tsx:211, luôn truyền
 *     `kind: 'fruit'`. Không nơi nào xếp job `kind:'tree'` vào hàng.
 *   - TreeVideoScreen.tsx:140 gọi THẲNG `uploadTreeVideo` — đúng cửa, không qua hàng.
 *   - bản mã ngày 05/08 (develop 7c02cf9) y hệt ⟹ chưa từng có clip cây đi lạc.
 * (Bản trước của chú thích này khẳng định ngược lại. Sai do grep gộp ba thứ cùng
 *  viết `kind: 'tree'`: nhãn 3D `LabelPoint` ở Space3DScreen, bản ghi `VideoProof`
 *  ở TreeVideoScreen, và job hàng đợi — chỉ thứ ba mới liên quan, và nó không tồn tại.)
 *
 * Giữ định tuyến vì `kind` là trường CÓ HAI GIÁ TRỊ mà nhánh gửi chỉ đọc một. Ngày
 * nào có người xếp job cây vào hàng, hàng đợi sẽ lặng lẽ gửi sai cửa và không có gì
 * báo. Đó là lý do đủ; "đang hỏng" thì không phải.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
// v56: API documentDirectory/copyAsync/deleteAsync nằm ở gói con `/legacy` (giống
// features/space3d). Import thẳng 'expo-file-system' sẽ KHÔNG có các hàm này (default
// export là API File/Directory mới) → tsc fail + runtime không copy được bản bền.
//
// ⚠ NẠP TRỄ (require trong hàm), KHÔNG import top-level: expo-file-system kéo
// expo-modules-core, mà module này lúc EVAL làm `exports.EventEmitter =
// globalThis.expo.EventEmitter`. Trên bản SIGNED, `globalThis.expo` CHƯA được
// ExpoModulesJSI cài xong lúc bundle bắt đầu chạy → import top-level = CRASH BOOT
// "Cannot read property 'EventEmitter' of undefined" (file này eager qua App.tsx/
// navigation/userSlice). Nạp trễ → tới lúc thật sự copy/xoá clip (useEffect/flush)
// globalThis.expo đã có. (Cùng lý do màn 3D phải React.lazy.)
type FileSystemLegacy = typeof import('expo-file-system/legacy');
let _fs: FileSystemLegacy | null = null;
// Trả null nếu KHÔNG nạp được expo-file-system. Trên bản signed lỗi ExpoModulesCore,
// require sẽ NÉM ngay module-eval (expo-modules-core đọc `globalThis.expo.EventEmitter`
// mà globalThis.expo chưa cài) → try/catch nuốt lỗi, trả null → caller bỏ qua bước copy
// bền (video vẫn gửi từ URI gốc, chỉ mất lớp chống app-kill). KHÔNG crash. Trong test,
// require trả mock jest bình thường. (Đây là ĐÒN nuốt lỗi TỔNG cho mọi lời gọi FS.)
const FileSystem = (): FileSystemLegacy | null => {
  try {
    return (_fs ??= require('expo-file-system/legacy'));
  } catch {
    return null;
  }
};
import { ORILIFE_BASE } from './orilifeBase';
import { ensureOrilifeToken } from './orilifeDidAuth';
import {
  uploadFruitVideo,
  isRetryableStoreReason,
  type FruitVideoResult,
} from './fruitVideoService';
import { uploadTreeVideo } from './treeVideoService';
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

/**
 * Ném khi KHO đọc không được — khác hẳn kho đọc được và rỗng.
 *
 * Có kiểu riêng để nơi gọi phân biệt được bằng `instanceof`, không phải bằng cách
 * dò chuỗi thông báo.
 */
export class VideoQueueReadError extends Error {
  readonly code = 'VIDEO_QUEUE_READ_FAILED';
  constructor(public readonly goc: unknown) {
    super('Không đọc được hàng đợi clip trên máy.');
    this.name = 'VideoQueueReadError';
  }
}

/**
 * Đọc toàn bộ hàng đợi.
 *
 * ── VÌ SAO KHÔNG CÒN NUỐT LỖI THÀNH MẢNG RỖNG ──────────────────────────────
 * Chỗ GHI ngay dưới đã bỏ lối nuốt-lỗi từ trước, và chú thích của nó tả đúng
 * chuỗi hỏng: kho đầy ⟹ ghi trượt ⟹ hàng đợi rỗng ⟹ màn suy "không còn trong
 * hàng ⟹ đã gửi xong" ⟹ hiện "Đã lưu video" trong khi clip chưa rời máy.
 *
 * Chỗ ĐỌC dựng lại y hệt chuỗi ấy từ đầu kia: `AsyncStorage.getItem` ném (kho
 * đầy, tệp hỏng) thì hàm này trả mảng rỗng, và mọi nơi gọi đều đọc ra "chẳng
 * còn gì chờ gửi". `isJobQueued` trả `false`, huy hiệu về 0, `flush` báo đã
 * xong. Không dòng nào đỏ.
 *
 * Nên TÁCH BA trạng thái thay vì hai:
 *  · không có khoá         → `[]`, hàng đợi rỗng thật;
 *  · có khoá nhưng hỏng    → `[]`, dữ liệu không dùng được, coi như rỗng;
 *  · KHO ĐỌC KHÔNG ĐƯỢC    → NÉM. Không ai được suy ra điều gì từ trạng thái này.
 */
export async function loadVideoQueue(): Promise<VideoUploadJob[]> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(QUEUE_KEY);
  } catch (e) {
    throw new VideoQueueReadError(e);
  }
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(isJob);
  } catch {
    // Thân hỏng thì dữ liệu không dùng được — đây là "rỗng" thật, không phải mù.
    return [];
  }
}

/**
 * Ghi hàng đợi xuống đĩa. TRẢ VỀ ghi được hay không — đừng nuốt.
 *
 * Máy nông dân gần đầy sau một buổi quay là chuyện thường, và `AsyncStorage`
 * ném `SQLITE_FULL`. Bản cũ nuốt lỗi im lặng, nên `enqueueVideoUpload` vẫn trả về
 * một job trông như thật, màn quay xoá bản nháp, rồi `flush` đọc hàng đợi RỖNG và
 * không gọi upload lần nào — trong khi màn suy "không còn trong hàng ⇒ đã gửi xong"
 * và hiện "Đã lưu video". Clip chưa bao giờ rời máy, nháp thì đã xoá.
 */
async function saveQueue(jobs: VideoUploadJob[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(jobs.slice(0, MAX_QUEUE)));
    return true;
  } catch {
    return false;
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

/**
 * `null` = KHÔNG ĐẾM ĐƯỢC, khác hẳn `0`. Ba hàm đếm dưới đây nuôi huy hiệu trên
 * màn; một huy hiệu ghi `0` khi thật ra máy không đọc nổi kho là nói với người
 * dùng rằng chẳng còn gì phải chờ.
 */
async function demOwn(loc: (j: VideoUploadJob) => boolean): Promise<number | null> {
  try {
    return (await loadOwnQueue()).filter(loc).length;
  } catch (e) {
    if (e instanceof VideoQueueReadError) return null;
    throw e;
  }
}

/** Số clip của TÔI đang chờ gửi (tính cả cần-can-thiệp-tay). Cho badge. */
export async function getVideoQueueCount(): Promise<number | null> {
  return demOwn(() => true);
}

/** Số clip của TÔI còn tự thử được (chưa chạm cap) — phần "sẽ tự gửi lại". */
export async function getPendingAutoCount(): Promise<number | null> {
  return demOwn(j => !j.needsManual);
}

/** Số clip của TÔI đã chạm cap — chỉ đi tiếp khi người dùng bấm gửi tay. */
export async function getNeedsManualCount(): Promise<number | null> {
  return demOwn(j => !!j.needsManual);
}

/**
 * Job `id` còn nằm trong hàng không.
 *
 * `null` = CHƯA BIẾT, và nơi gọi PHẢI xử nó khác `false`. Màn dùng hàm này để kết
 * luận "clip đã lên máy chủ"; trả `false` cho một lần đọc hỏng là dựng ra đúng kết
 * luận sai đó, còn bản nháp trên máy thì đã bị xoá trước đấy vài dòng.
 */
export async function isJobQueued(id: string): Promise<boolean | null> {
  try {
    return (await loadVideoQueue()).some(j => j.id === id);
  } catch (e) {
    if (e instanceof VideoQueueReadError) return null;
    throw e;
  }
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
  /**
   * Job đã GHI ĐƯỢC xuống đĩa chưa. `false` = máy hết dung lượng (AsyncStorage ném
   * `SQLITE_FULL`) → hàng đợi thật sự RỖNG, sẽ không có lần gửi nào.
   * Màn quay PHẢI kiểm cờ này TRƯỚC khi xoá bản nháp và trước khi nói "đã gửi".
   */
  persisted: boolean;
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
    const fs = FileSystem();
    const dir = fs?.documentDirectory;
    if (!fs || !dir) return { uri: srcUri, managed: false };
    const dest = `${dir}videoq_${id}.mp4`;
    await fs.copyAsync({ from: srcUri, to: dest });
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
      const persisted = await saveQueue(next);
      return { job: updated, droppedOldest: 0, persisted };
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
    const persisted = await saveQueue(next);
    return { job, droppedOldest, persisted };
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
    await FileSystem()?.deleteAsync(uri, { idempotent: true });
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

/**
 * Gửi job video CÂY qua đúng cửa `/api/tree/{id}/video`, rồi khớp kết quả về hình
 * dạng `FruitVideoResult` mà `flush` đang đọc.
 *
 * Khớp trường, nói rõ chỗ không khớp được:
 *   ok · stored · video_cid · event_id · link_status · error → cùng nghĩa, chép thẳng.
 *   n_frames ← n_kept + n_rejected — tổng khung máy chủ chắt được từ clip, đúng
 *     nghĩa `n_frames` của cửa quả. Số khung THẬT SỰ vào cây là `n_kept`; ai cần
 *     con số đó thì đọc từ màn (TreeVideoScreen), không đọc từ hàng đợi.
 *   n_fruits_max — KHÔNG khớp: clip cây không đếm quả. Để trống, đừng bịa 0.
 *   store_reason — cửa cây chưa trả trường này. Để trống ⟹ `isRetryableStoreReason`
 *     không kết luận "hết hy vọng" ⟹ job được thử lại. Nghiêng về thử lại là đúng
 *     chiều: mất công gửi lại còn hơn vứt bằng chứng của nông dân.
 */
async function uploadTreeVideoAsQueueResult(
  job: VideoUploadJob,
): Promise<FruitVideoResult> {
  const r = await uploadTreeVideo(ORILIFE_BASE, job.treeId, job.videoUri, {
    lat: job.lat, lon: job.lon,
  });
  return {
    ok: r.ok,
    // Cùng luật với `fruitVideoService`: máy chủ KHÔNG nói thì để `undefined`, đừng
    // cộng ra `0`. `0` ở trường này dẫn màn kết quả vào câu "lần sau quay chậm hơn"
    // — một lời trách người quay, dựng từ chỗ máy chủ im lặng. Đường cây hôm nay
    // chưa có ai xếp việc vào (đo trong chính tệp này), nên đây là vá chỗ chưa nổ.
    n_frames: r.n_kept === undefined && r.n_rejected === undefined
      ? undefined
      : (r.n_kept ?? 0) + (r.n_rejected ?? 0),
    video_cid: r.video_cid,
    event_id: r.event_id,
    link_status: r.link_status,
    stored: r.stored,
    error: r.error,
  };
}

function defaultDeps(): FlushDeps {
  return {
    ensureToken: (force?: boolean) => ensureOrilifeToken(ORILIFE_BASE, force ? { force: true } : undefined),
    upload: (job) => (job.kind === 'tree'
      ? uploadTreeVideoAsQueueResult(job)
      : uploadFruitVideo(ORILIFE_BASE, job.treeId, job.videoUri, {
        lat: job.lat, lon: job.lon, note: job.note, clientEventId: job.clientEventId,
      })),
    isOnline: defaultIsOnline,
    deleteFile: safeDeleteDefault,
    onProof: appendVideoProof,
  };
}

let flushing = false;

export interface FlushResult {
  /** Số job gửi xong (stored !== false) và đã rời hàng. */
  sent: number;
  /**
   * Số job vẫn còn trong hàng sau lượt flush.
   *
   * `null` = KHÔNG ĐẾM ĐƯỢC (kho trên máy đọc không ra). Khác hẳn `0`: `0` nói
   * "đã gửi hết", `null` nói "không biết còn gì không". Nơi gọi không được gộp
   * hai thứ đó — gộp là dựng lại đúng chuỗi hỏng mà `loadVideoQueue` vừa bỏ.
   */
  remaining: number | null;
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
): Promise<{ sent: number; remaining: number | null }> {
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
  //
  // ⚠ `stored` là cờ QUYẾT ĐỊNH, và nó có thể VẮNG. `fruitVideoService` đọc
  // `body?.stored ?? true`, nên máy chủ nào không trả trường này sẽ được coi là "đã
  // lưu" — rồi khối dưới xoá bản sao. Đó là đường mất bằng chứng im lặng nhất trong
  // dây: không lỗi, không cảnh báo, chỉ là một clip biến mất.
  //
  // Nay đã đỡ hai lớp: (1) mọi màn quay đặt `saveToPhotos: true` nên bản gốc còn nằm
  // trong cuộn ảnh máy; (2) OriLife (PR OriLife-Core #274) kèm `store_reason` ở MỌI
  // nhánh trả `stored`, nên phân biệt được "kho lỗi, gửi lại có ích" với
  // "LAMPNET_ENABLED=0, CID là GIẢ, gửi lại vô nghĩa".
  // `stored === undefined` KHÔNG phải là xong. Trước đây nhánh này chỉ thôi XOÁ bản
  // sao mà vẫn `return {done:true}` — mà `done:true` thì `applyOutcome` cắt job khỏi
  // hàng đợi. Kết quả: tệp `videoq_<id>.mp4` còn trên đĩa nhưng KHÔNG job nào trỏ tới
  // ⇒ không màn nào thấy, `retryVideoJobNow`/`clearVideoQueue` cũng không với tới,
  // rác cộng dồn mãi; đồng thời màn kết quả suy "không còn trong hàng ⇒ đã gửi xong"
  // nên hiện dấu tích "Đã lưu" cho một clip máy chủ CHƯA HỀ xác nhận.
  // Cờ xoá tệp và cờ rời hàng đợi phải là CÙNG một cờ.
  if (res.ok && res.stored === undefined) {
    if (res.video_cid) {
      await deps.onProof(job.treeId, {
        videoCid: res.video_cid,
        kind: job.kind,
        at: new Date().toISOString(),
        eventId: res.event_id,
        clientEventId: job.clientEventId,
        nFruitsMax: res.n_fruits_max,
        nFrames: res.n_frames,
        // Để nguyên `undefined` — màn phải phân biệt "máy chủ xác nhận" với "máy chủ
        // im lặng", không được vẽ khiên xanh cho cái sau.
        stored: undefined,
        lat: job.lat,
        lon: job.lon,
      });
    }
    return {
      done: false,
      job: {
        ...job,
        attempts: job.attempts + 1,
        lastError: 'máy chủ không xác nhận đã lưu (thiếu cờ stored)',
        needsManual: job.attempts + 1 >= MAX_ATTEMPTS,
      },
    };
  }

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
    // Chỉ xoá bản sao khi máy chủ NÓI RÕ đã lưu. `undefined` không còn được coi là
    // "đã lưu" ở đây nữa: máy chủ im lặng thì giữ bản sao lại: tốn ít dung lượng còn
    // hơn mất một ngày công đi vườn.
    if (job.managedCopy && res.stored === true) await deps.deleteFile(job.videoUri);
    return { done: true };
  }

  // Chưa xong: server nhận nhưng stored===false, hoặc lỗi mạng/quyền.
  const attempts = job.attempts + 1;
  const lastError = res.ok
    ? `stored=false (byte chưa lên LampNet)${res.store_reason ? ` · ${res.store_reason}` : ''}`
    : (res.error?.detail ?? 'Gửi thất bại');

  // Có lý do mà gửi lại KHÔNG cứu được thì dừng thử ngay, đừng đợi hết 5 lượt:
  // `lampnet_disabled` nghĩa là kho đang tắt và CID vừa nhận là GIẢ — thử lại chỉ đốt
  // pin và dữ liệu di động của nông dân giữa vườn, mà bản chất là việc của người trực
  // máy chủ. `empty_file` là tệp 0 byte, tức lỗi đường ghi tệp tạm ở phía app; gửi lại
  // cùng một tệp rỗng thì lần nào cũng rỗng. Cả hai đều GIỮ bản sao clip.
  // KHÔNG kẹp `res.ok`: `empty_file` về dưới dạng 422 (nhánh lỗi), nên kẹp `ok` là
  // đúng cái làm nhánh "gửi lại vô ích" thành mã chết. Chỉ cần CÓ `store_reason` và
  // lý do đó không thuộc nhóm đáng thử lại.
  const hopeless = res.store_reason != null && !isRetryableStoreReason(res.store_reason);

  const updated: VideoUploadJob = {
    ...job,
    attempts,
    lastError,
    needsManual: hopeless || attempts >= MAX_ATTEMPTS,
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
