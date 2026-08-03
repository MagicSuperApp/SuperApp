/**
 * treeDraftStore — bản NHÁP bền cho luồng chụp cây / quay video quả (H-17).
 *
 * Vấn đề: khi đăng ký cây, mảng ảnh (+heading/pitch/roll) chỉ nằm trong Redux
 * (`treeReID.captures`, iOS) hoặc route params (Android) — KHÔNG lưu bền. Quay
 * video quả thì `videoUri` chỉ nằm trong state màn. App bị ngắt (kill/crash) giữa
 * chừng → mất TRẮNG công chụp/quay. Ở đây ta lưu một bản nháp vào AsyncStorage
 * NGAY sau mỗi lần chụp/quay, để mở lại còn khôi phục được.
 *
 * NAMESPACE THEO NGƯỜI DÙNG (chống rò XUYÊN NGƯỜI DÙNG trên tablet dùng CHUNG):
 * mỗi khoá nháp gắn `owner` = DID/user-id hiện tại. Khôi phục CHỈ đọc nháp của
 * owner đang đăng nhập; đăng xuất thì `clearAllDrafts()` xoá sạch mọi namespace.
 * Trước đây khoá toàn cục + logout không dọn → nháp (ảnh+GPS+tên) của user A lọt
 * vào form user B. Nay: (a) khoá keyed theo owner; (b) logout xoá sạch.
 *
 * Chỉ có MỘT phiên đăng-ký-cây và MỘT phiên quay-video sống tại một thời điểm cho
 * mỗi người dùng nên mỗi loại dùng một khoá cố định trong namespace của owner
 * (không keyed theo tree — cây mới CHƯA có id).
 *
 * Giới hạn vòng đời file (ghi rõ, không giấu): ta chỉ lưu ĐƯỜNG DẪN (URI) chứ
 * không copy byte. URI ảnh/video native có thể trỏ thư mục tạm bị OS dọn — khi
 * khôi phục ta lọc bỏ URI đã chết (`file://` không còn trên đĩa) để không dựng lại
 * bản nháp rỗng. Ảnh nằm trong thư mục app thường sống qua lần mở kế; clip
 * image-picker ở thư mục tạm dễ bị dọn hơn → có thể mất, đó là trần của cách này.
 *
 * NÁP CHỈ GIỮ METADATA PHIÊN CHỤP, KHÔNG chịu trách nhiệm gửi lại byte video —
 * gửi lại giao HẲN cho hàng đợi `videoUploadQueue` (cửa duy nhất). Tránh hai cơ
 * chế bền cùng ôm một sự thật "clip này đã gửi chưa".
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CapturedImage } from './treeReIDNativeBridge';

// ---------------------------------------------------------------------------
// Khoá + hằng
// ---------------------------------------------------------------------------

const TREE_CAPTURE_DRAFT_PREFIX = 'tree_capture_draft:v1:';
const FRUIT_VIDEO_DRAFT_PREFIX = 'fruit_video_draft:v1:';

// Trần an-toàn số ảnh lưu nháp — một phiên chụp thực tế ~4–30 ảnh; chặn phình.
const MAX_DRAFT_CAPTURES = 80;

/** Chuẩn hoá owner thành namespace. Rỗng/thiếu → '__anon' (vẫn tách biệt). */
function ns(owner: string | null | undefined): string {
  return owner && owner.length > 0 ? owner : '__anon';
}
function treeKey(owner: string | null | undefined): string {
  return `${TREE_CAPTURE_DRAFT_PREFIX}${ns(owner)}`;
}
function fruitKey(owner: string | null | undefined): string {
  return `${FRUIT_VIDEO_DRAFT_PREFIX}${ns(owner)}`;
}

// ---------------------------------------------------------------------------
// Kiểu bản nháp
// ---------------------------------------------------------------------------

export interface TreeGps {
  lat: number;
  lng: number;
  accuracy: number;
}

/** Bản nháp đăng-ký-cây: mảng ảnh + metadata capture + GPS + tên + vườn. */
export interface TreeCaptureDraft {
  v: 1;
  savedAt: number;
  /** iOS: ảnh đầy-đủ metadata (heading/pitch/roll/round…) từ native bridge. */
  captures: CapturedImage[];
  /** Android: chỉ có URI ảnh (không metadata hướng). */
  androidImagePaths?: string[];
  gps: TreeGps | null;
  name?: string;
  farmId?: string;
}

/** Bản nháp quay-video-quả: URI clip + cây đã chọn + ghi chú (METADATA phiên chụp). */
export interface FruitVideoDraft {
  v: 1;
  savedAt: number;
  videoUri: string;
  videoSize?: number | null;
  selectedTreeId?: string;
  note?: string;
  farmId?: string;
  /** Mốc quay (ms) — để màn dựng lại clientEventId ổn định khi gửi. */
  capturedAt?: number;
}

// ---------------------------------------------------------------------------
// Kiểm tra URI còn sống (lazy expo-file-system — an-toàn khi chạy test/node)
// ---------------------------------------------------------------------------

/**
 * `true` nếu URI trỏ file `file://` còn trên đĩa. URI không phải file:// (content://,
 * http, ph://…) → coi như còn (không tự bỏ). Không kiểm được (thiếu module/lỗi) →
 * giữ lại (thà giữ ảnh sống còn hơn bỏ nhầm). Đây là default `exists` cho prune.
 */
export async function fileExists(uri: string): Promise<boolean> {
  if (!uri) return false;
  if (!uri.startsWith('file://')) return true;
  try {
    // legacy API khớp cách space3d dùng (getInfoAsync còn ở legacy trên SDK này).
    const FileSystem = require('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    return !!info?.exists;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Helper thuần (dễ test)
// ---------------------------------------------------------------------------

/** Có nội dung đáng khôi phục không (≥1 ảnh iOS hoặc ≥1 URI Android). */
export function draftHasContent(draft: TreeCaptureDraft | null | undefined): boolean {
  if (!draft) return false;
  return (draft.captures?.length ?? 0) > 0 || (draft.androidImagePaths?.length ?? 0) > 0;
}

/**
 * Lọc bỏ ảnh có URI đã chết khỏi bản nháp, dùng hàm `exists` bơm vào (test bơm giả,
 * app bơm `fileExists`). Trả về bản nháp mới (không đụng bản gốc). Cả hai đường
 * (iOS captures theo `fileURL`, Android theo URI) đều được soi.
 */
export async function pruneDeadCaptures(
  draft: TreeCaptureDraft,
  exists: (uri: string) => Promise<boolean> = fileExists,
): Promise<TreeCaptureDraft> {
  const captures: CapturedImage[] = [];
  for (const c of draft.captures ?? []) {
    const uri = c.fileURL?.startsWith('file://') ? c.fileURL : `file://${c.fileURL}`;
    if (await exists(uri)) captures.push(c);
  }
  let androidImagePaths: string[] | undefined;
  if (draft.androidImagePaths?.length) {
    androidImagePaths = [];
    for (const p of draft.androidImagePaths) {
      const uri = p.startsWith('file://') || p.startsWith('content://') ? p : `file://${p}`;
      if (await exists(uri)) androidImagePaths.push(p);
    }
  }
  return { ...draft, captures, androidImagePaths };
}

// ---------------------------------------------------------------------------
// Bản nháp đăng-ký-cây: lưu / đọc / xoá (theo owner)
// ---------------------------------------------------------------------------

/** Ghi bản nháp đăng-ký-cây (best-effort, nuốt lỗi — không được ném ra UI). */
export async function saveTreeCaptureDraft(owner: string, draft: TreeCaptureDraft): Promise<void> {
  try {
    const trimmed: TreeCaptureDraft = {
      ...draft,
      captures: (draft.captures ?? []).slice(0, MAX_DRAFT_CAPTURES),
      androidImagePaths: draft.androidImagePaths?.slice(0, MAX_DRAFT_CAPTURES),
    };
    await AsyncStorage.setItem(treeKey(owner), JSON.stringify(trimmed));
  } catch {
    /* bỏ qua — mất nháp còn hơn crash luồng chụp */
  }
}

/** Đọc bản nháp thô (chưa lọc URI chết). Không có / hỏng → null. */
export async function loadTreeCaptureDraft(owner: string): Promise<TreeCaptureDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(treeKey(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return null;
    if (!Array.isArray(parsed.captures)) parsed.captures = [];
    return parsed as TreeCaptureDraft;
  } catch {
    return null;
  }
}

/**
 * Đọc + lọc URI chết. Nếu sau khi lọc không còn ảnh nào → tự xoá nháp và trả null
 * (để UI không hỏi khôi phục một bản rỗng). Đây là hàm UI nên gọi khi mở màn.
 */
export async function restoreTreeCaptureDraft(owner: string): Promise<TreeCaptureDraft | null> {
  const draft = await loadTreeCaptureDraft(owner);
  if (!draft) return null;
  const pruned = await pruneDeadCaptures(draft);
  if (!draftHasContent(pruned)) {
    await clearTreeCaptureDraft(owner);
    return null;
  }
  return pruned;
}

/** Xoá bản nháp đăng-ký-cây (khi đăng ký thành công hoặc người dùng bỏ nháp). */
export async function clearTreeCaptureDraft(owner: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(treeKey(owner));
  } catch {
    /* bỏ qua */
  }
}

// ---------------------------------------------------------------------------
// Bản nháp quay-video-quả: lưu / đọc / xoá (theo owner)
// ---------------------------------------------------------------------------

/** Ghi bản nháp video quả (best-effort). */
export async function saveFruitVideoDraft(owner: string, draft: FruitVideoDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(fruitKey(owner), JSON.stringify(draft));
  } catch {
    /* bỏ qua */
  }
}

/** Đọc bản nháp video thô. Không có / hỏng / thiếu URI → null. */
export async function loadFruitVideoDraft(owner: string): Promise<FruitVideoDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(fruitKey(owner));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !parsed.videoUri) return null;
    return parsed as FruitVideoDraft;
  } catch {
    return null;
  }
}

/**
 * Đọc bản nháp video + kiểm URI clip còn sống. Clip đã bị OS dọn → xoá nháp, trả
 * null (không hỏi khôi phục một clip không còn). UI nên gọi hàm này khi mở màn.
 */
export async function restoreFruitVideoDraft(owner: string): Promise<FruitVideoDraft | null> {
  const draft = await loadFruitVideoDraft(owner);
  if (!draft) return null;
  if (!(await fileExists(draft.videoUri))) {
    await clearFruitVideoDraft(owner);
    return null;
  }
  return draft;
}

/** Xoá bản nháp video (khi gửi thành công hoặc người dùng bỏ nháp). */
export async function clearFruitVideoDraft(owner: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(fruitKey(owner));
  } catch {
    /* bỏ qua */
  }
}

// ---------------------------------------------------------------------------
// Xoá SẠCH mọi nháp (mọi owner) — gọi khi ĐĂNG XUẤT trên tablet dùng chung
// ---------------------------------------------------------------------------

/**
 * Xoá mọi bản nháp của MỌI namespace. Đăng xuất = bàn giao máy → nháp là dữ liệu
 * phiên, phải purge để user kế KHÔNG thấy nháp (ảnh+GPS+tên) của user trước.
 */
export async function clearAllDrafts(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(
      k => k.startsWith(TREE_CAPTURE_DRAFT_PREFIX) || k.startsWith(FRUIT_VIDEO_DRAFT_PREFIX),
    );
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    /* bỏ qua */
  }
}
