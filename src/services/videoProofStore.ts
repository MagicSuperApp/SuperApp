/**
 * videoProofStore — sổ BẰNG CHỨNG video đã lưu lên LampNet, theo cây.
 *
 * VÌ SAO PHẢI CÓ: OriLife agent đo `origin/main` (commit prod `b38496f`) và xác nhận
 * `video_cid` CHỈ xuất hiện trong phản hồi tức thời của `POST /api/tree/{id}/fruit_video`
 * (`server.py:2205`, `:2220`, `:2232`) — **KHÔNG có route nào tra ngược CID theo cây**.
 * Nghĩa là mã lưu trữ đó, nếu app không giữ, là mất vĩnh viễn. Đội đi thực địa cả
 * ngày mà không giữ CID thì sau buổi không có gì đối chiếu với LampNet.
 *
 * Trước đây `fruitVideoService.ts:129` đọc `video_cid` rồi để màn hình hiện tạm và
 * bỏ đi khi rời màn. Đây là chỗ mất mát thật sự — sửa bằng cách ghi NGAY khi nhận
 * response, trước cả khi vẽ giao diện.
 *
 * Chỉ lưu METADATA (mã CID + thời điểm + số quả), KHÔNG copy byte video.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'video_proof:';
const MAX_PER_TREE = 50;

/** Một lần gửi video thành công, gắn vào một cây. */
export interface VideoProof {
  /** Mã lưu trữ LampNet — thứ duy nhất đối chiếu được, và không lấy lại được. */
  videoCid: string;
  /** Loại video: quả (route fruit_video) hay video cây. */
  kind: 'fruit' | 'tree';
  /** Thời điểm nhận phản hồi, ISO 8601. */
  at: string;
  /** `event_id` phía OriLife (nếu có) — để tra nhật ký sự kiện. */
  eventId?: string;
  /**
   * Khoá khử-trùng phía client của CHÍNH clip đã gửi (`VideoUploadJob.clientEventId`).
   * Màn kết quả dùng nó để lấy đúng bằng chứng của clip vừa bấm Gửi, thay vì đoán
   * "bản ghi mới nhất của cây" — một cây có thể có nhiều clip trong hàng đợi.
   */
  clientEventId?: string;
  /** Số quả nhiều nhất trong 1 khung — ước-lượng, không phải đếm chính xác. */
  nFruitsMax?: number;
  /** Số khung server chắt được. */
  nFrames?: number;
  /** false khi LampNet lỗi — byte gốc CHƯA lưu, dù server trả 200. */
  stored?: boolean;
  /** Vị trí lúc quay, nếu máy có. */
  lat?: number;
  lon?: number;
}

function keyFor(treeId: string): string {
  return `${KEY_PREFIX}${treeId}`;
}

/** Đọc mọi bằng chứng đã lưu của cây, mới nhất trước. */
export async function loadVideoProofs(treeId: string): Promise<VideoProof[]> {
  if (!treeId) return [];
  try {
    const raw = await AsyncStorage.getItem(keyFor(treeId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x.videoCid === 'string');
  } catch {
    return [];
  }
}

/**
 * Ghi thêm một bằng chứng. Khử trùng theo `videoCid` (gửi lại cùng clip thì server
 * trả cùng CID — không nhân đôi dòng). Trả về danh sách sau khi ghi.
 *
 * KHÔNG ném lỗi: mất bằng chứng đã tệ, làm sập màn hình vừa gửi xong còn tệ hơn.
 * Chỗ gọi nên kiểm giá trị trả về nếu cần biết đã ghi được chưa.
 */
export async function appendVideoProof(
  treeId: string,
  proof: VideoProof,
): Promise<VideoProof[]> {
  if (!treeId || !proof?.videoCid) return loadVideoProofs(treeId);
  try {
    const existing = await loadVideoProofs(treeId);
    const merged = [proof, ...existing.filter(p => p.videoCid !== proof.videoCid)]
      .slice(0, MAX_PER_TREE);
    await AsyncStorage.setItem(keyFor(treeId), JSON.stringify(merged));
    return merged;
  } catch {
    return loadVideoProofs(treeId);
  }
}

/** Xoá sổ bằng chứng của cây (khi xoá cây). */
export async function clearVideoProofs(treeId: string): Promise<void> {
  if (!treeId) return;
  try {
    await AsyncStorage.removeItem(keyFor(treeId));
  } catch {
    /* bỏ qua */
  }
}

/**
 * Gom mọi bằng chứng của MỌI cây — dùng cho màn xuất/đối chiếu sau buổi thực địa.
 * Quét toàn bộ khoá nên đừng gọi trong vòng render.
 */
export async function loadAllVideoProofs(): Promise<Array<VideoProof & { treeId: string }>> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(KEY_PREFIX));
    if (!keys.length) return [];
    const pairs = await AsyncStorage.multiGet(keys);
    const out: Array<VideoProof & { treeId: string }> = [];
    for (const [k, raw] of pairs) {
      const treeId = k.slice(KEY_PREFIX.length);
      if (!raw) continue;
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          if (p && typeof p.videoCid === 'string') out.push({ ...p, treeId });
        }
      } catch {
        /* bỏ qua khoá hỏng */
      }
    }
    return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  } catch {
    return [];
  }
}
