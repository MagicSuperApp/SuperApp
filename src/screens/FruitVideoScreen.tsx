/**
 * FruitVideoScreen — quay clip một CHÙM QUẢ rồi gắn vào một CÂY.
 *
 * ── Bố cục: ba chặng, không phải một tờ khai ────────────────────────────────
 * Bản cũ đổ tất cả xuống một trang cuộn: khung quay, chọn cây, ghi chú, nút Gửi —
 * ngang hàng nhau, không cái nào nói cho biết còn thiếu gì. Người dùng quay xong,
 * bấm Gửi, rồi mới bị hộp thoại chặn lại "Hãy chọn cây". Nay màn có **vạch ba
 * chặng** (quay → chọn cây → gửi) tự sáng theo việc đã làm, và nút Gửi **nói
 * thẳng cái đang thiếu** thay vì để người ta bấm rồi mới báo.
 *
 * ── Danh sách cây tự biết co giãn ───────────────────────────────────────────
 * Vườn 5 cây thì cuộn tay là xong; vườn 60 cây thì cuộn tay là cực hình. Quá
 * NGƯỠNG thì hiện thêm ô tìm theo tên.
 *
 * ── Giữ nguyên phần ruột ────────────────────────────────────────────────────
 * KIẾN TRÚC 1-CỬA không đổi: màn này KHÔNG bao giờ POST thẳng. "Gửi" =
 * `enqueueVideoUpload` rồi flush một lần; "Gửi lại" = `retryVideoJobNow`. Hàng
 * đợi là nguồn sự-thật DUY NHẤT cho "clip đã gửi chưa"; nháp (`treeDraftStore`)
 * chỉ giữ metadata để app bị ngắt còn dựng lại được màn.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Clipboard, FlatList, Image, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Geolocation from 'react-native-geolocation-service';

import Icon from '../components/Icon';
import { useTk } from '../i18n/keys';
import { useAppSelector } from '../store/hooks';
import type { RootState } from '../store';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { getTrees, type TreeInfo } from '../services/treeReIDService';
import { loadVideoProofs } from '../services/videoProofStore';
import { MAX_VIDEO_BYTES, type FruitVideoResult } from '../services/fruitVideoService';
import { detectFruit, enrollFruit, outcomeOf, type Bbox } from '../services/fruitReIDService';
import { buildCaptureMeta, serializeCaptureMeta } from '../services/captureMeta';
import { TreeReIDBridge } from '../services/treeReIDNativeBridge';
import {
  saveFruitVideoDraft, clearFruitVideoDraft, restoreFruitVideoDraft,
} from '../services/treeDraftStore';
import {
  enqueueVideoUpload, flushVideoUploadQueue, retryVideoJobNow, retryAllVideoJobsNow,
  isJobQueued, getVideoQueueCount, getNeedsManualCount, VideoQueueReadError,
} from '../services/videoUploadQueue';
import { withPhotoSave } from '../services/mediaSavePermission';
import { GroundBackdrop } from '../modules/trace/components/layered/Organic';
import {
  ELEVATION, NATURE, ORGANIC_CARD, ORGANIC_TILE, RADIUS, SPACE, SURFACE, TONE, TYPE,
} from '../modules/trace/theme/depth';
import { showError, showInfo, showSuccess, showWarning } from '../utils/alert';
import { t } from '../i18n';

// image-picker nạp mềm (giống AnimalEnroll) — máy chưa cài thì báo rõ, không crash.
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

const VIDEO_OPTIONS = {
  mediaType: 'video' as const,
  videoQuality: 'high' as const,
  durationLimit: 20,          // ≤ 20s (spec) — clip ngắn, dung-lượng vừa
  saveToPhotos: true,
};

/** Quá bấy nhiêu cây thì hiện ô tìm — dưới ngưỡng, cuộn tay còn nhanh hơn gõ. */
const SEARCH_THRESHOLD = 6;

/**
 * Ảnh nhận dạng quả. Cùng cỡ với luồng khoanh ảnh để máy chủ nhận cùng chất lượng.
 *
 * ⚠️ CHƯA GIẢI: `FruitScanScreen` CỐ Ý không co ảnh, dẫn cảnh báo OriLife 14/08.
 * Tức luồng quả đang gửi lên hai cỡ khác nhau. Chưa ai đo cỡ nào cho kết quả đối
 * chiếu tốt hơn, nên KHÔNG tự chốt số — đang chờ OriLife trả lời.
 */
const PHOTO_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8,
  maxWidth: 1600,
  maxHeight: 1600,
  saveToPhotos: true,
};

/**
 * ⛔ KHÔNG dựng lại ô lùi "vuông giữa khung 60%".
 *
 * Bản cũ có `centerBox()`: máy chủ không thấy quả nào thì bịa một ô giữa khung
 * rồi gửi đi như dữ liệu thật. Người chụp không thấy ô đó, không sửa được, nên
 * ảnh mẫu của quả nhiễm lá và nền — hỏng âm thầm, và hỏng ngay ở tấm ảnh NHẬN
 * DẠNG, thứ mọi lượt đối chiếu sau này dựa vào.
 *
 * Đối chiếu: màn khoanh tay còn từ chối vùng nhỏ hơn 8 px và bắt người tự canh
 * (`FruitCropperScreen.tsx`). Ở đây bịa cả ô thì càng không được. Không thấy quả
 * ⇒ báo thật và mời khoanh tay ở màn "Quả trên cây", KHÔNG gửi ô đoán.
 */

/** Ô lớn nhất trong các ô máy chủ tìm được — quả to nhất khung là quả người ta nhắm. */
function biggestBox(boxes: Array<{ bbox: Bbox }>): Bbox | null {
  let best: Bbox | null = null;
  let bestArea = 0;
  for (const d of boxes) {
    const [, , w, h] = d.bbox;
    const area = w * h;
    if (area > bestArea) { bestArea = area; best = d.bbox; }
  }
  return best;
}

type ParamList = { FruitVideo: { treeId?: string; treeName?: string; farmId?: string } };

const FruitVideoScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ParamList, 'FruitVideo'>>();
  const tk = useTk();
  const initialTreeId = route.params?.treeId;
  const farmId = route.params?.farmId;

  // Namespace nháp theo người dùng hiện tại (chống rò xuyên user trên tablet chung).
  const currentUser = useAppSelector((s: RootState) => s.user.currentUser);
  const draftOwner = currentUser?.did ?? currentUser?.id ?? '';

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<number | null>(null);
  const [capturedAt, setCapturedAt] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);

  // Ảnh tĩnh + tên → hai thứ biến buổi quay thành một QUẢ trong danh sách.
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverSize, setCoverSize] = useState<{ w: number; h: number } | null>(null);
  /**
   * Khối `capture` của tấm ảnh quả (heading/pitch/cỡ ảnh gốc/máy).
   *
   * Dựng NGAY trong callback máy ảnh, không dựng lúc gửi: heading và pitch là số
   * đo tại thời điểm bấm máy, tới lúc gửi người ta đã xoay máy đi rồi. Xem
   * `captureMeta.ts` — ảnh chụp thiếu thông số ống kính thì vĩnh viễn không đo
   * được kích thước quả, không có đợt sau nào vá lại được.
   */
  const [coverCapture, setCoverCapture] = useState<string | undefined>(undefined);
  const [fruitName, setFruitName] = useState('');
  /** Tên quả đã lưu được — màn xong đọc để nói "đã lưu thành quả …". */
  const [savedFruitName, setSavedFruitName] = useState<string | null>(null);

  const [trees, setTrees] = useState<TreeInfo[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | undefined>(initialTreeId);
  const [showTreePicker, setShowTreePicker] = useState(false);
  const [treeQuery, setTreeQuery] = useState('');

  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<FruitVideoResult | null>(null);
  // `null` = chưa đếm được (kho trên máy đọc không ra), KHÁC `0` = không còn gì chờ.
  const [queueCount, setQueueCount] = useState<number | null>(0);
  // Trong số đang chờ, bao nhiêu clip đã chạm cap → KHÔNG tự gửi lại nữa, phải bấm tay.
  const [manualCount, setManualCount] = useState<number | null>(0);
  // Job vừa xếp hàng nhưng CHƯA lên LampNet — để nút "Gửi lại" nhắm đúng clip đó.
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  // Ref soi videoUri MỚI NHẤT để chống đua khôi-phục-vs-phiên-mới (hộp thoại mở lâu).
  const videoUriRef = useRef<string | null>(null);
  videoUriRef.current = videoUri;

  // Số clip đang chờ gửi trong hàng đợi bền — hiện để đội thực địa biết còn tồn.
  const refreshQueueCount = useCallback(() => {
    getVideoQueueCount().then(setQueueCount).catch(() => {});
    getNeedsManualCount().then(setManualCount).catch(() => {});
  }, []);
  useEffect(() => { refreshQueueCount(); }, [refreshQueueCount]);

  // GPS 1 lần (best-effort) — kèm vào upload để định-vị nơi quay.
  useEffect(() => {
    Geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  }, []);

  // Nạp danh sách cây của vườn (để chọn/đổi cây) — best-effort.
  useEffect(() => {
    (async () => {
      const res = await getTrees(ORILIFE_BASE, farmId);
      if (res.ok && res.trees) setTrees(res.trees);
    })();
  }, [farmId]);

  // ── H-17: hỏi khôi phục video quả quay dở khi mở màn ─────────────────────
  // App bị ngắt sau khi quay xong nhưng CHƯA gửi → clip + lựa chọn cây/ghi chú mất
  // trắng. restoreFruitVideoDraft tự bỏ nháp nếu clip đã bị OS dọn (không hỏi khống).
  const didCheckDraftRef = useRef(false);
  useEffect(() => {
    if (didCheckDraftRef.current) return;
    didCheckDraftRef.current = true;
    if (videoUri) return;
    (async () => {
      const draft = await restoreFruitVideoDraft(draftOwner);
      if (!draft?.videoUri) return;
      showWarning(
        t('Khôi phục video dở?'),
        t('Có video quả quay buổi trước nhưng chưa gửi. Khôi phục để gửi tiếp?'),
        {
          actions: [
          { text: t('Bỏ'), style: 'destructive', onPress: () => { clearFruitVideoDraft(draftOwner); } },
          {
            text: t('Khôi phục'),
            onPress: () => {
              // RE-CHECK: người dùng có thể đã quay clip mới trong lúc hộp thoại mở →
              // KHÔNG ghi đè phiên mới bằng clip nháp (chống gắn nhầm cây/hỏng provenance).
              if (videoUriRef.current) return;
              setVideoUri(draft.videoUri);
              setVideoSize(draft.videoSize ?? null);
              setCapturedAt(draft.capturedAt ?? null);
              if (draft.note) setNote(draft.note);
              if (draft.selectedTreeId) setSelectedTreeId(draft.selectedTreeId);
              if (draft.coverUri) setCoverUri(draft.coverUri);
              if (draft.coverW && draft.coverH) setCoverSize({ w: draft.coverW, h: draft.coverH });
              if (draft.fruitName) setFruitName(draft.fruitName);
            },
          },
          ],
        },
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── H-17: lưu bản nháp video (METADATA) NGAY khi quay xong / đổi cây / ghi chú ─
  useEffect(() => {
    if (!videoUri) return;
    saveFruitVideoDraft(draftOwner, {
      v: 1,
      savedAt: Date.now(),
      videoUri,
      videoSize,
      selectedTreeId,
      note,
      farmId,
      capturedAt: capturedAt ?? undefined,
      coverUri,
      coverW: coverSize?.w ?? null,
      coverH: coverSize?.h ?? null,
      fruitName,
    });
  }, [draftOwner, videoUri, videoSize, selectedTreeId, note, farmId, capturedAt,
      coverUri, coverSize, fruitName]);

  const selectedTree = trees.find(t => t.tree_id === selectedTreeId);
  const treeLabel = (t: TreeInfo) => t.name || `Cây ${t.tree_id.slice(0, 6)}`;

  const shownTrees = useMemo(() => {
    const q = treeQuery.trim().toLowerCase();
    return q ? trees.filter(t => treeLabel(t).toLowerCase().includes(q)) : trees;
  }, [trees, treeQuery]);

  // ── Quay video ────────────────────────────────────────────────────────────
  const handleRecord = useCallback(async () => {
    if (!imagePicker?.launchCamera) {
      showError('Chưa mở được máy ảnh', 'Bản app này chưa mở được máy ảnh. Vui lòng cập nhật app rồi thử lại.');
      return;
    }
    imagePicker.launchCamera(await withPhotoSave(VIDEO_OPTIONS), (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        showError('Lỗi camera', response.errorMessage ?? 'Không mở được camera. Kiểm tra quyền.');
        return;
      }
      const asset = response.assets?.[0];
      if (!asset?.uri) return;
      const size = asset.fileSize ?? null;
      if (size && size > MAX_VIDEO_BYTES) {
        showInfo('Video quá nặng', 'Clip vượt 80MB — hãy quay ngắn hơn (dưới 20 giây).');
        return;
      }
      setVideoUri(asset.uri);
      setVideoSize(size);
      setCapturedAt(Date.now());     // mốc quay → clientEventId ổn định theo clip
      setResult(null);
    });
  }, []);

  /** Ảnh nhận dạng của quả — tấm mà `/api/fruit/enroll` sẽ học. */
  const handleCover = useCallback(async () => {
    if (!imagePicker?.launchCamera) {
      showWarning(tk('trace.activity.noCamera'), tk('trace.activity.noCameraBody'));
      return;
    }
    imagePicker.launchCamera(await withPhotoSave(PHOTO_OPTIONS), async (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        showWarning(tk('trace.activity.cameraErr'), response.errorMessage ?? tk('trace.activity.cameraErrBody'));
        return;
      }
      const a = response.assets?.[0];
      if (!a?.uri) return;
      setCoverUri(a.uri);
      setCoverSize(a.width && a.height ? { w: a.width, h: a.height } : null);
      // Hỏng thì bỏ trống, KHÔNG chặn luồng chụp: mất khối siêu dữ liệu là mất khả
      // năng đo tấm ảnh, còn chặn ảnh là mất cả tấm ảnh lẫn buổi quay.
      try {
        setCoverCapture(serializeCaptureMeta(await buildCaptureMeta(a, TreeReIDBridge)));
      } catch { setCoverCapture(undefined); }
    });
  }, [tk]);

  const resetForNext = useCallback(() => {
    setVideoUri(null); setVideoSize(null); setCapturedAt(null); setNote(''); setResult(null);
    setCoverUri(null); setCoverSize(null); setCoverCapture(undefined);
    setFruitName(''); setSavedFruitName(null);
  }, []);

  /**
   * Tạo bản ghi QUẢ từ tấm ảnh vừa chụp. Trả câu lỗi để màn nói thật khi không
   * xong — clip lúc này đã lưu rồi, im lặng ở đây là để người ta tưởng đã có quả.
   */
  const enrollFromCover = useCallback(async (treeId: string): Promise<string | null> => {
    if (!coverUri) return 'thiếu ảnh quả';

    // Hỏi máy chủ quả nằm đâu trong tấm ảnh. Không ra ô nào thì DỪNG — xem khối
    // chú thích chỗ `biggestBox` để biết vì sao không được lùi về ô đoán.
    //
    // HAI ca hỏng, hai câu khác nhau, vì hai việc phải làm khác hẳn nhau:
    //   · `species_no_fruit` — giống cây này KHÔNG cho quả. Chụp lại bao nhiêu lần
    //     cũng vậy; đường đi tiếp là luồng sản phẩm khác, không phải quả.
    //   · không có ô nào — máy chưa nhận ra quả trong ẢNH NÀY. Chụp lại thì được.
    // Gộp hai ca vào một câu là đẩy người dùng đi chụp lại một thứ không tồn tại.
    //
    // Ca `species_no_fruit` trả HTTP 200 kèm `ok:false` (nhóm §14.4 của hợp đồng
    // OriLife: xét `ok`, đừng xét mã) — nên phải đọc `data.reason`, không đọc HTTP.
    let box: Bbox | null = null;
    let noFruitSpecies = false;
    try {
      const det = await detectFruit(ORILIFE_BASE, coverUri, treeId);
      if (det.ok && det.data?.reason === 'species_no_fruit') noFruitSpecies = true;
      else if (det.ok && det.data?.detections?.length) box = biggestBox(det.data.detections);
    } catch { box = null; }
    if (noFruitSpecies) return 'giống cây này không cho quả — clip vẫn lưu, nhưng không tạo được bản ghi quả';
    if (!box) return 'máy chưa nhận ra quả trong ảnh — hãy tự khoanh quả ở trang “Quả trên cây”';

    const res = await enrollFruit(
      ORILIFE_BASE, treeId, fruitName.trim(), coverUri, { bbox: box },
      {
        // Quả trùng KHÔNG chặn ở đây: người dùng đang ở giữa vườn, vừa quay xong một
        // clip; dựng cổng hỏi-trùng tại đây là bắt họ phán xử giữa nắng. Trùng thì
        // VeData gộp sau — mất một bản ghi quả tệ hơn có một bản ghi thừa.
        allowDup: true,
        // `side` là khai CÓ Ý THỨC, không phải mặc định bỏ quên: màn này chỉ yêu
        // cầu "một tấm ảnh quả", không hỏi mặt nào, và người ta chụp chùm quả
        // trên cây thì gần như luôn là mặt hông. Thiếu hẳn trường này mới là cái
        // đắt — 54/54 góc lưu trước đó không có nó, và đó là gốc của việc cổng bồi
        // góc chặn oan 30/32 lượt. Muốn đúng hơn thì phải thêm bộ chọn mặt vào
        // màn này, không phải đoán ở đây.
        viewType: 'side',
        capture: coverCapture,
      },
    );
    // KHÔNG đọc `res.ok`: đó là tầng vận chuyển. Máy chủ từ chối bằng HTTP 200 kèm
    // `{ok:false}`, và 409 (trùng quả) được `_apiCall` cố ý đổi thành `{ok:true}`
    // để caller đọc cờ. Chỉ xét `res.ok` là báo "Đã lưu thành quả «X»" cho một
    // lượt kho không hề ghi gì.
    const outcome = outcomeOf(res);
    if (outcome === 'ok') return null;
    if (outcome === 'needs_confirm') return res.data?.message ?? 'máy chủ chưa nhận quả này';
    return res.error?.detail ?? 'máy chủ từ chối';
  }, [coverUri, coverCapture, fruitName]);

  // ── Gửi (CỬA DUY NHẤT = hàng đợi) ────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!videoUri) return;
    // Không còn hộp thoại "Hãy chọn cây" ở đây: nút Gửi tự khoá và nói thẳng cái
    // đang thiếu, nên nhánh này chỉ còn là chốt an toàn cho lập trình viên.
    if (!selectedTreeId || !coverUri || !fruitName.trim()) return;
    setUploading(true);
    try {
      // 1) Xếp hàng (copy byte vào document dir bền + khử trùng theo clip).
      const enq = await enqueueVideoUpload({
        treeId: selectedTreeId,
        videoUri,
        kind: 'fruit',
        lat: gps?.lat,
        lon: gps?.lon,
        note,
        capturedAt: capturedAt ?? undefined,
        size: videoSize ?? undefined,
        owner: draftOwner || undefined,
      });
      if (enq.droppedOldest > 0) {
        showInfo('Hàng đợi đầy',
          `Đã bỏ ${enq.droppedOldest} clip cũ nhất chưa gửi được để nhường chỗ. `
            + 'Hãy tới nơi sóng tốt để gửi bớt.');
      }
      // GHI XUỐNG ĐĨA HỎNG (máy hết dung lượng) → hàng đợi thật sự rỗng, sẽ không có
      // lần gửi nào. Dừng TẠI ĐÂY: không xoá nháp, không chạy tiếp xuống nhánh suy
      // "không còn trong hàng ⇒ đã gửi xong" — nhánh đó sẽ hiện "Đã lưu video" cho
      // một clip chưa bao giờ rời máy, mà nháp thì đã xoá mất.
      if (!enq.persisted) {
        setUploading(false);
        showInfo('Máy hết dung lượng',
          'Không ghi được clip vào hàng đợi nên chưa gửi đi được. Clip vẫn còn trong '
            + 'máy — hãy xoá bớt ảnh/video cũ rồi bấm gửi lại.');
        return;
      }

      // Nháp đã bàn giao cho hàng đợi (cửa duy nhất giữ độ bền) → xoá nháp màn.
      clearFruitVideoDraft(draftOwner);

      // 2) Kích gửi 1 lần.
      //
      // BỌC LẠI: từ khi `loadVideoQueue` NÉM thay vì trả mảng rỗng (đúng luật "hình
      // dạng lạ thì ném, đừng nuốt"), `flushVideoUploadQueue` ném theo được. Ở đúng
      // chỗ này thì một lần ném là mất hết: nháp màn vừa bị xoá ba dòng trên, và
      // hàm này KHÔNG có nhánh bắt lỗi nào bao ngoài (nay đã thêm, xem cuối hàm)
      // nên lỗi bay thẳng ra khỏi `handleUpload`, bỏ luôn bước dựng màn kết quả —
      // người quay không thấy màn nào, không thấy câu lỗi nào, chỉ thấy app quay về.
      //
      // Clip KHÔNG mất trong ca này: nó đã nằm trong hàng đợi bền (`enq.persisted`
      // đã kiểm ngay trên). Cái hỏng chỉ là lần ĐỌC hàng đợi. Nên bắt riêng, nói
      // đúng điều đã xảy ra, rồi đi tiếp — bước dưới đã phân biệt được `null`.
      try {
        await flushVideoUploadQueue();
      } catch (e) {
        console.log('[FruitVideo] flush hàng đợi lỗi:', e);
        showInfo(tk('trace.fruitVideo.queueUnknownTitle'), tk('trace.fruitVideo.queueUnknownBody'));
      }
      refreshQueueCount();

      // 3) Kết cục của CHÍNH clip này: còn trong hàng = chưa lên LampNet.
      const stillQueued = await isJobQueued(enq.job.id);
      // `=== false` chứ KHÔNG `!stillQueued`: `null` nghĩa là không đọc nổi hàng
      // đợi, và `!null` cũng bằng `true`. Gộp hai thứ đó lại thì một lần đọc hỏng
      // được đọc thành "clip đã lên máy chủ" — trong khi bản nháp trên máy vừa bị
      // xoá vài dòng trước, nên không còn gì để dựng lại.
      if (stillQueued === false) {
        // Gửi xong + byte đã lên LampNet → dựng màn kết quả từ SỔ BẰNG CHỨNG.
        // Tra theo `clientEventId` của CHÍNH clip này, KHÔNG lấy `proofs[0]`:
        // một cây có thể có nhiều clip trong hàng, flush duyệt [mới→cũ] còn sổ thì
        // prepend ⇒ bản ghi đứng đầu lại là clip CŨ NHẤT vừa gửi. Lấy nhầm là
        // đội thực địa cầm CID sai đi đối chiếu LampNet.
        const proofs = await loadVideoProofs(selectedTreeId);
        const proof = proofs.find(p => p.clientEventId === enq.job.clientEventId) ?? proofs[0];
        setPendingJobId(null);

        // Clip đã nằm trên LampNet → giờ mới tạo bản ghi QUẢ. Thứ tự này có chủ ý:
        // clip là bằng chứng gốc, hỏng ở bước tạo quả thì clip vẫn còn và màn nói
        // rõ còn thiếu gì. Làm ngược lại sẽ để lại quả mồ côi không bằng chứng.
        const failReason = await enrollFromCover(selectedTreeId);
        if (failReason) {
          showWarning(tk('trace.fruitVideo.fruitFailTitle'),
            tk('trace.fruitVideo.fruitFailBody', { reason: failReason }));
          setSavedFruitName(null);
        } else {
          setSavedFruitName(fruitName.trim());
        }

        setResult({
          ok: true,
          video_cid: proof?.videoCid,
          event_id: proof?.eventId,
          n_fruits_max: proof?.nFruitsMax,
          n_frames: proof?.nFrames,
          // KHÔNG `?? true`: sổ bằng chứng để `undefined` đúng khi máy chủ im lặng.
          // Bịa `true` ở đây là vẽ dấu tích "đã lưu" cho cái chưa ai xác nhận.
          stored: proof?.stored,
        });
      } else {
        // Còn trong hàng: mạng yếu / offline / stored=false → sẽ tự gửi lại.
        setPendingJobId(enq.job.id);

        // Vẫn THỬ tạo quả: clip nằm lại hàng đợi có thể chỉ vì LampNet chưa nhận
        // byte, chứ mạng vẫn đi được — mà `enroll` là một đường khác hẳn.
        const failReason = await enrollFromCover(selectedTreeId);
        showSuccess('Đã lưu để gửi sau',
          'Mạng đang yếu. Clip đã vào hàng đợi và sẽ tự gửi lại khi có mạng — cứ quay tiếp, '
            + 'hoặc bấm "Gửi lại" khi có sóng tốt.');
        // Chỉ dọn màn khi quả ĐÃ tạo xong. Còn thiếu quả mà xoá sạch ảnh với tên
        // là bắt người ta chụp lại từ đầu — giữ nguyên để bấm Gửi lần nữa là được.
        if (!failReason) resetForNext();
        else showWarning(tk('trace.fruitVideo.fruitFailTitle'),
          tk('trace.fruitVideo.fruitFailBody', { reason: failReason }));
      }
    } catch (e) {
      // PHẢI CÓ, cùng lý do với `handleRetryPending`. `enqueueVideoUpload` đọc hàng
      // đợi trong mutex nên nay ném được, và hàm này trước đó chỉ có `try…finally`.
      //
      // Đây là một ĐƯỜNG LÙI nếu để nguyên: trước bản vá hàng đợi, cùng trạng thái
      // "kho không ghi được" đi tới nhánh `persisted === false` và hiện hộp "Máy hết
      // dung lượng". Bỏ `catch` thì cửa báo đó biến mất — bấm Gửi, không màn nào,
      // không hộp nào, nút sáng lại.
      console.log('[FruitVideo] gửi lỗi:', e);
      if (e instanceof VideoQueueReadError) {
        showInfo(tk('trace.fruitVideo.queueUnknownTitle'), tk('trace.fruitVideo.queueUnknownBody'));
      } else {
        showError(tk('trace.fruitVideo.retryFailTitle'), tk('trace.fruitVideo.retryFailBody'));
      }
    } finally {
      setUploading(false);
    }
  }, [videoUri, selectedTreeId, coverUri, gps, note, capturedAt, videoSize, draftOwner,
      refreshQueueCount, resetForNext, enrollFromCover, fruitName, tk]);

  // ── Gửi lại (giữ UX #94) — QUA hàng đợi, KHÔNG POST trực tiếp ──
  const handleRetryPending = useCallback(async () => {
    setUploading(true);
    try {
      if (pendingJobId) {
        await retryVideoJobNow(pendingJobId);
        // Chỉ bỏ dấu "đang chờ" khi CHẮC CHẮN job đã rời hàng. Đọc hỏng (`null`)
        // thì giữ nguyên dấu — giữ nhầm một dấu chờ chỉ phiền, bỏ nhầm nó là mất
        // luôn nút gửi lại cho một clip vẫn còn nằm trên máy.
        if ((await isJobQueued(pendingJobId)) === false) setPendingJobId(null);
      } else {
        // Không nhớ job cụ thể (mở lại màn / tắt app) → ép gửi lại CẢ HÀNG, kể cả
        // clip đã chạm cap. KHÔNG dùng flushVideoUploadQueue ở đây: flush cố ý bỏ
        // qua job `needsManual`, nên bấm nút sẽ không gửi gì mà cũng không báo gì.
        await retryAllVideoJobsNow();
      }
      refreshQueueCount();
    } catch (e) {
      // PHẢI CÓ. Từ khi `loadVideoQueue` ném thay vì trả mảng rỗng, cả
      // `retryVideoJobNow` lẫn `retryAllVideoJobsNow` ném theo được — và hàm này
      // trước đó chỉ có `try…finally`. Hệ quả: bấm "Gửi lại" → lỗi bay ra ngoài →
      // `finally` bật nút sáng lại → KHÔNG một chữ nào trên màn đổi.
      //
      // Nặng hơn bình thường vì đây là nút mà chính câu `queueUnknownBody` vừa
      // thêm ở dải báo đang mời người ta bấm. Hứa một lối thoát rồi để nó câm là
      // tệ hơn không hứa gì: người quay sẽ bấm mãi.
      console.log('[FruitVideo] gửi lại lỗi:', e);
      if (e instanceof VideoQueueReadError) {
        showInfo(tk('trace.fruitVideo.queueUnknownTitle'), tk('trace.fruitVideo.queueUnknownBody'));
      } else {
        showError(tk('trace.fruitVideo.retryFailTitle'), tk('trace.fruitVideo.retryFailBody'));
      }
    } finally {
      setUploading(false);
    }
  }, [pendingJobId, refreshQueueCount, tk]);

  // ── Màn kết quả ───────────────────────────────────────────────────────────
  if (result) {
    // KHÔNG `?? 0` — cùng lý do đã gỡ dấu ấy khỏi `fruitVideoService.ts:183`, và
    // gỡ ở đó mà để lại ở đây thì chẳng gỡ được gì: `0` vẫn mang hình dạng một số
    // đo, nên "máy chủ chưa cho biết" và "máy chủ đếm được không quả nào" vẫn ra
    // cùng một dòng chữ.
    const n = result.n_fruits_max;
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
        <GroundBackdrop variant="detail" />
        <ScreenHeader title={tk('trace.fruitVideo.doneTitle')} onBack={() => navigation.goBack()} top={insets.top} />

        <View style={styles.doneBody}>
          <View style={styles.doneSeal}>
            <Icon name="circle-check" size={46} color={TONE.primary} />
          </View>
          {/* BA nhánh: chưa biết · có thấy quả · không thấy quả nào. */}
          <Text style={styles.doneTitle}>
            {/* `== null` (HAI dấu bằng) bắt cả `undefined` lẫn `null`. Máy chủ trả
                `"n_fruits_max": null` là thân JSON hoàn toàn hợp lệ, và `null > 0`
                cho `false` — nên nếu chỉ tách `undefined` thì ca "máy chủ nói rõ là
                không biết" lại rơi vào nhánh "không thấy quả nào". Đúng cái nhầm mà
                ba ngôi này dựng ra để tránh. */}
            {n == null
              ? tk('trace.fruitVideo.doneSaved')
              : n > 0
                ? tk('trace.fruitVideo.doneSawN', { n })
                : tk('trace.fruitVideo.doneSaved')}
          </Text>
          {/* HEDGE PHẢI ĐI KÈM CON SỐ, KHÔNG ĐỂ Ở CHỖ KHÁC.
              `n_fruits_max` là số quả nhiều nhất thấy trong MỘT KHUNG, do bộ dò HSV
              ước lượng — `fruitVideoService.ts` khai đúng như vậy ở chỗ định nghĩa
              trường, và còn trả kèm `fruit_count_method` "để UI cảnh báo đây là ước
              lượng sơ bộ". Nhưng không màn nào đọc trường ấy, nên lời cảnh báo đó
              chưa bao giờ tới được người đọc con số.
              Hai tầng sai cùng lúc nếu để trần: ước lượng chứ không phải đếm, và
              max-theo-khung chứ không phải tổng của cây. Người ghi chép ngoài vườn
              chép thẳng con số vào sổ, rồi sổ đó thành số liệu thực địa. */}
          {n != null && n > 0 ? (
            <Text style={styles.doneHedge}>{tk('trace.fruitVideo.countHedge')}</Text>
          ) : null}
          {savedFruitName ? (
            <View style={styles.savedFruitChip}>
              <Icon name="apple-whole" size={15} color={TONE.primaryDeep} />
              <Text style={styles.savedFruitTxt} numberOfLines={1}>
                {tk('trace.fruitVideo.savedFruit', { name: savedFruitName })}
              </Text>
            </View>
          ) : null}
          {/* BA nhánh, không phải hai. `n_frames` là `undefined` khi sổ bằng chứng
              chưa có bản ghi cho clip này — gộp ca đó vào ca "0 khung" là trách oan
              người quay đúng bằng câu "lần sau quay chậm hơn", trong khi app chỉ
              đơn giản là chưa biết. */}
          <Text style={styles.doneSub}>
            {/* `== null` — xem chú thích ở nhánh đếm quả phía trên. */}
            {result.n_frames == null
              ? tk('trace.fruitVideo.doneFramesUnknown')
              : result.n_frames > 0
                ? tk('trace.fruitVideo.doneFrames', { n: result.n_frames })
                : tk('trace.fruitVideo.doneSlower')}
          </Text>

          {/* Bằng chứng clip đã nằm trên LampNet. Đội thực địa cần THẤY mã này để
              đối chiếu sau buổi test, không chỉ tin vào dòng "đã lưu". */}
          {!!result.video_cid && (
            <Pressable
              style={styles.cidBox}
              onPress={() => {
                Clipboard.setString(result.video_cid!);
                showSuccess(tk('trace.tree.copied'), tk('trace.tree.copiedBody'));
              }}
            >
              <Icon name="shield-halved" size={15} color={TONE.primary} />
              <Text style={styles.cidText} numberOfLines={1}>
                {tk('trace.fruitVideo.storedCid', { cid: result.video_cid })}
              </Text>
              <Icon name="copy" size={14} color={NATURE.barkSoft} />
            </Pressable>
          )}

          <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]} onPress={resetForNext}>
            <Icon name="video" size={19} color={NATURE.paper} />
            <Text style={styles.primaryBtnText}>{tk('trace.fruitVideo.another')}</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.ghostBtnText}>{tk('trace.fruitVideo.finish')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Chặng đang đứng — vạch ba chặng và nhãn nút Gửi đều đọc từ đây, nên hai thứ
  // đó không bao giờ nói lệch nhau.
  const stage = !videoUri ? 0 : !coverUri ? 1 : !fruitName.trim() ? 2 : !selectedTreeId ? 3 : 4;
  const blockedBy = !videoUri
    ? tk('trace.fruitVideo.needClip')
    : !coverUri ? tk('trace.fruitVideo.needCover')
      : !fruitName.trim() ? tk('trace.fruitVideo.needName')
        : !selectedTreeId ? tk('trace.fruitVideo.needTree') : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />
      <GroundBackdrop variant="detail" />
      <ScreenHeader title={tk('trace.fruitVideo.title')} onBack={() => navigation.goBack()} top={insets.top} />

      <StageSpine
        stage={stage}
        labels={[
          tk('trace.fruitVideo.stepRecord'),
          tk('trace.fruitVideo.stepCover'),
          tk('trace.fruitVideo.stepName'),
          tk('trace.fruitVideo.stepTree'),
        ]}
      />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* ── Chặng 1 — quay ── */}
        {!videoUri ? (
          <Pressable
            style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}
            onPress={handleRecord}
          >
            <View style={styles.recordDot}><View style={styles.recordDotInner} /></View>
            <Text style={styles.recordTitle}>{tk('trace.fruitVideo.tapToRecord')}</Text>
            <Text style={styles.recordHint}>{tk('trace.fruitVideo.tapHint')}</Text>
          </Pressable>
        ) : (
          <View style={[styles.card, styles.previewCard]}>
            <View style={styles.previewIcon}>
              <Icon name="circle-check" size={26} color={TONE.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{tk('trace.fruitVideo.recorded')}</Text>
              {videoSize ? (
                <Text style={styles.cardSub}>{(videoSize / 1024 / 1024).toFixed(1)} MB</Text>
              ) : null}
            </View>
            <Pressable style={styles.retakeBtn} onPress={handleRecord}>
              <Icon name="arrows-rotate" size={14} color={NATURE.barkSoft} />
              <Text style={styles.retakeText}>{tk('trace.fruitVideo.retake')}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Chặng 2 — ảnh nhận dạng quả ──
            Clip không thay được tấm này: `/api/fruit/enroll` chỉ nhận ảnh tĩnh. */}
        <Text style={styles.sectionLabel}>{tk('trace.fruitVideo.coverTitle')}</Text>
        {!coverUri ? (
          <Pressable
            style={({ pressed }) => [styles.card, styles.coverEmpty, pressed && styles.pressed]}
            onPress={handleCover}
          >
            <View style={styles.coverIcon}>
              <Icon name="camera" size={24} color={TONE.primary} />
            </View>
            <Text style={styles.coverHint}>{tk('trace.fruitVideo.coverHint')}</Text>
          </Pressable>
        ) : (
          <View style={[styles.card, styles.coverDone]}>
            <Image source={{ uri: coverUri }} style={styles.coverThumb} resizeMode="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{tk('trace.fruitVideo.coverDone')}</Text>
            </View>
            <Pressable style={styles.retakeBtn} onPress={handleCover}>
              <Icon name="arrows-rotate" size={14} color={NATURE.barkSoft} />
              <Text style={styles.retakeText}>{tk('trace.fruitVideo.retakeCover')}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Chặng 3 — tên quả ── */}
        <Text style={styles.sectionLabel}>{tk('trace.fruitVideo.nameLabel')}</Text>
        <TextInput
          style={styles.noteInput}
          placeholder={tk('trace.fruitVideo.nameHint')}
          placeholderTextColor={NATURE.barkSoft}
          value={fruitName}
          onChangeText={setFruitName}
          maxLength={60}
        />

        {/* ── Chặng 4 — cây nào ── */}
        <Text style={styles.sectionLabel}>{tk('trace.fruitVideo.whichTree')}</Text>
        <Pressable
          style={({ pressed }) => [styles.card, styles.treeSelect, pressed && styles.pressed]}
          onPress={() => setShowTreePicker(v => !v)}
        >
          <View style={styles.treeIcon}>
            <Icon name="tree" size={19} color={TONE.primary} />
          </View>
          <Text style={[styles.treeSelectText, !selectedTree && styles.treeSelectEmpty]} numberOfLines={1}>
            {selectedTree ? treeLabel(selectedTree) : tk('trace.fruitVideo.pickTree')}
          </Text>
          <Icon name={showTreePicker ? 'chevron-up' : 'chevron-down'} size={18} color={NATURE.barkSoft} />
        </Pressable>
        <Text style={styles.softNote}>{tk('trace.fruitVideo.wrongOk')}</Text>

        {showTreePicker && (
          <View style={[styles.card, styles.treeList]}>
            {trees.length > SEARCH_THRESHOLD && (
              <View style={styles.treeSearch}>
                <Icon name="magnifying-glass" size={16} color={NATURE.barkSoft} />
                <TextInput
                  style={styles.treeSearchInput}
                  placeholder={tk('trace.fruitVideo.searchTree')}
                  placeholderTextColor={NATURE.barkSoft}
                  value={treeQuery}
                  onChangeText={setTreeQuery}
                />
                {treeQuery.length > 0 && (
                  <Pressable onPress={() => setTreeQuery('')} hitSlop={10}>
                    <Icon name="circle-xmark" size={16} color={NATURE.barkSoft} />
                  </Pressable>
                )}
              </View>
            )}

            {trees.length === 0 ? (
              <Text style={styles.treeEmpty}>{tk('trace.fruitVideo.noTree')}</Text>
            ) : shownTrees.length === 0 ? (
              <Text style={styles.treeEmpty}>{tk('trace.fruitVideo.noTreeMatch')}</Text>
            ) : (
              <FlatList
                data={shownTrees}
                keyExtractor={t => t.tree_id}
                style={{ maxHeight: 260 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = item.tree_id === selectedTreeId;
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.treeRow, active && styles.treeRowActive, pressed && styles.pressed]}
                      onPress={() => { setSelectedTreeId(item.tree_id); setShowTreePicker(false); setTreeQuery(''); }}
                    >
                      <Icon name="tree" size={17} color={active ? TONE.primary : NATURE.barkSoft} />
                      <Text style={[styles.treeRowText, active && styles.treeRowTextActive]} numberOfLines={1}>
                        {treeLabel(item)}
                      </Text>
                      {active && <Icon name="check" size={17} color={TONE.primary} />}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        )}

        {/* ── Ghi thêm ── */}
        <Text style={styles.sectionLabel}>{tk('trace.fruitVideo.note')}</Text>
        <TextInput
          style={styles.noteInput}
          placeholder={tk('trace.fruitVideo.noteHint')}
          placeholderTextColor={NATURE.barkSoft}
          value={note}
          onChangeText={setNote}
          maxLength={120}
        />
      </ScrollView>

      {/* ── Chặng 3 — gửi ── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {/* BA trạng thái, không phải hai. `null` = kho trên máy đọc không ra, nên
            app KHÔNG biết còn clip nào chờ. Gộp nó vào nhánh "ẩn dải" là nói với
            người quay rằng chẳng còn gì phải chờ — đúng lúc điều đó không ai biết. */}
        {(queueCount === null || queueCount > 0) && (
          <View style={styles.queueBanner}>
            <Icon name="clock" size={15} color={TONE.sun} />
            {/* Nói ĐÚNG sự thật: clip đã chạm cap KHÔNG còn tự gửi lại nữa. Hứa
                "sẽ tự gửi" cho những clip đó là để đội thực địa yên tâm nhầm. */}
            <Text style={styles.queueBannerText}>
              {queueCount === null
                ? tk('trace.fruitVideo.queueUnknown')
                : manualCount !== null && manualCount > 0
                  ? tk('trace.fruitVideo.queueManual', { n: queueCount, m: manualCount })
                  : tk('trace.fruitVideo.queueAuto', { n: queueCount })}
            </Text>
            <Pressable onPress={handleRetryPending} disabled={uploading} hitSlop={10}>
              <Text style={styles.queueRetryText}>
                {tk(uploading ? 'trace.fruitVideo.sendingShort' : 'trace.fruitVideo.retrySend')}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            (blockedBy || uploading) && styles.primaryBtnOff,
            pressed && styles.pressed,
          ]}
          onPress={handleUpload}
          disabled={!!blockedBy || uploading}
        >
          {uploading ? (
            <>
              <ActivityIndicator color={NATURE.paper} />
              <Text style={styles.primaryBtnText}>{tk('trace.fruitVideo.sending')}</Text>
            </>
          ) : (
            <>
              <Icon name="cloud-arrow-up" size={19} color={NATURE.paper} />
              <Text style={styles.primaryBtnText}>{blockedBy ?? tk('trace.fruitVideo.send')}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
};

// ── Mảnh dùng lại ───────────────────────────────────────────────────────────

const ScreenHeader: React.FC<{ title: string; onBack: () => void; top: number }> = ({
  title, onBack, top,
}) => (
  <View style={[styles.header, { paddingTop: top + SPACE.md }]}>
    <Pressable onPress={onBack} style={styles.backBtn} hitSlop={10}>
      <Icon name="arrow-left" size={21} color={NATURE.bark} />
    </Pressable>
    <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
  </View>
);

/**
 * Vạch ba chặng. Chặng đã qua tô đặc, chặng đang đứng có vòng sáng, chặng chưa
 * tới để mờ — nhìn một cái là biết còn thiếu bước nào.
 */
const StageSpine: React.FC<{ stage: number; labels: string[] }> = ({ stage, labels }) => (
  <View style={styles.spine}>
    {labels.map((label, i) => {
      const done = i < stage;
      const here = i === stage;
      return (
        <React.Fragment key={label}>
          {i > 0 && <View style={[styles.spineLine, done && styles.spineLineDone]} />}
          <View style={styles.spineItem}>
            <View style={[styles.spineDot, done && styles.spineDotDone, here && styles.spineDotHere]}>
              {done
                ? <Icon name="check" size={11} color={NATURE.paper} />
                : <Text style={[styles.spineNum, here && styles.spineNumHere]}>{i + 1}</Text>}
            </View>
            <Text style={[styles.spineLabel, (done || here) && styles.spineLabelOn]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </React.Fragment>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  pressed: { opacity: 0.9 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.page, paddingBottom: SPACE.md,
  },
  backBtn: {
    width: 44, height: 44, ...ORGANIC_TILE, ...ELEVATION.card,
    backgroundColor: SURFACE.raised, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { ...TYPE.title, fontSize: 23, flex: 1 },

  // ── Vạch chặng
  spine: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.page, paddingBottom: SPACE.lg,
  },
  spineItem: { alignItems: 'center', gap: 5, width: 66 },
  spineDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: SURFACE.sunken, alignItems: 'center', justifyContent: 'center',
  },
  spineDotDone: { backgroundColor: TONE.primary },
  spineDotHere: { backgroundColor: SURFACE.raised, borderWidth: 2, borderColor: TONE.primary },
  spineNum: { fontSize: 13, fontWeight: '700', color: NATURE.barkSoft },
  spineNumHere: { color: TONE.primary },
  spineLabel: { fontSize: 11.5, color: NATURE.barkSoft, textAlign: 'center' },
  spineLabelOn: { color: NATURE.bark, fontWeight: '600' },
  spineLine: { flex: 1, height: 2, backgroundColor: SURFACE.sunken, marginBottom: 20 },
  spineLineDone: { backgroundColor: TONE.primary },

  body: { paddingHorizontal: SPACE.page, paddingBottom: SPACE.xxl },

  card: {
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD, ...ELEVATION.card,
    padding: SPACE.lg,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: NATURE.bark },
  cardSub: { ...TYPE.caption, fontSize: 13 },

  // ── Chặng 1
  recordCard: {
    ...ORGANIC_CARD, ...ELEVATION.card,
    backgroundColor: SURFACE.raised,
    paddingVertical: SPACE.xxl, paddingHorizontal: SPACE.xl,
    alignItems: 'center', gap: SPACE.sm,
  },
  recordDot: {
    width: 62, height: 62, borderRadius: 31, marginBottom: SPACE.xs,
    borderWidth: 3, borderColor: TONE.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  recordDotInner: { width: 34, height: 34, borderRadius: 17, backgroundColor: TONE.danger },
  recordTitle: { fontSize: 17, fontWeight: '700', color: NATURE.bark, textAlign: 'center' },
  recordHint: { ...TYPE.caption, textAlign: 'center' },

  previewCard: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  previewIcon: {
    width: 48, height: 48, ...ORGANIC_TILE,
    backgroundColor: TONE.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: SURFACE.sunken, borderRadius: RADIUS.chip,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  retakeText: { fontSize: 13, fontWeight: '600', color: NATURE.barkSoft },

  // ── Chặng 2
  sectionLabel: { ...TYPE.section, fontSize: 17, marginTop: SPACE.xl, marginBottom: SPACE.sm },
  treeSelect: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: 60 },
  treeIcon: {
    width: 40, height: 40, ...ORGANIC_TILE,
    backgroundColor: TONE.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  treeSelectText: { flex: 1, fontSize: 16, fontWeight: '600', color: NATURE.bark },
  treeSelectEmpty: { color: NATURE.barkSoft, fontWeight: '400' },
  softNote: { ...TYPE.caption, fontSize: 13, marginTop: SPACE.sm, paddingHorizontal: SPACE.xs },

  treeList: { marginTop: SPACE.sm, padding: 0, overflow: 'hidden' },
  treeSearch: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
    borderBottomWidth: 1, borderBottomColor: TONE.border,
  },
  treeSearchInput: { flex: 1, fontSize: 15, color: NATURE.bark, paddingVertical: 0 },
  treeEmpty: { ...TYPE.caption, padding: SPACE.xl, textAlign: 'center' },
  treeRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.lg, minHeight: 54,
  },
  treeRowActive: { backgroundColor: TONE.primarySoft },
  treeRowText: { flex: 1, fontSize: 15.5, color: NATURE.bark },
  treeRowTextActive: { fontWeight: '700' },

  noteInput: {
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD, ...ELEVATION.card,
    paddingHorizontal: SPACE.lg, paddingVertical: 15,
    fontSize: 16, color: NATURE.bark,
  },

  coverEmpty: { alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.xl },
  coverIcon: {
    width: 58, height: 58, ...ORGANIC_TILE,
    backgroundColor: TONE.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  coverHint: { ...TYPE.caption, textAlign: 'center', paddingHorizontal: SPACE.sm },
  coverDone: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  coverThumb: { width: 58, height: 58, ...ORGANIC_TILE, backgroundColor: SURFACE.sunken },

  savedFruitChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: TONE.primarySoft, borderRadius: RADIUS.chip,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
  },
  savedFruitTxt: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: TONE.primaryDeep },

  // ── Chặng 3
  footer: {
    paddingHorizontal: SPACE.page, paddingTop: SPACE.md,
    borderTopWidth: 1, borderTopColor: TONE.border,
    backgroundColor: SURFACE.ground, gap: SPACE.sm,
  },
  queueBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: TONE.sunSoft, borderRadius: RADIUS.field,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  queueBannerText: { flex: 1, fontSize: 13, color: NATURE.bark, fontWeight: '500' },
  queueRetryText: { fontSize: 13, color: TONE.primaryDeep, fontWeight: '700' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    backgroundColor: TONE.primary, ...ORGANIC_CARD, ...ELEVATION.cardStrong,
    padding: 16
  },
  primaryBtnOff: { opacity: 0.45 },
  primaryBtnText: { color: NATURE.paper, fontSize: 17, fontWeight: '700' },

  // ── Màn xong
  doneBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACE.xl, gap: SPACE.md,
  },
  doneSeal: {
    width: 92, height: 92, borderRadius: 46, marginBottom: SPACE.xs,
    backgroundColor: TONE.primarySoft, alignItems: 'center', justifyContent: 'center',
  },
  doneTitle: { ...TYPE.section, fontSize: 20, textAlign: 'center' },
  doneSub: { ...TYPE.body, fontSize: 15, textAlign: 'center' },
  // Nhỏ hơn tiêu đề nhưng KHÔNG mờ đi: đây là câu quyết định con số phía trên được
  // đọc thế nào, nên nó không phải chú thích trang trí.
  doneHedge: { ...TYPE.body, fontSize: 13, textAlign: 'center', marginTop: 6 },
  cidBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, alignSelf: 'stretch',
    backgroundColor: TONE.primarySoft, borderRadius: RADIUS.field,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, marginTop: SPACE.xs,
  },
  cidText: { flex: 1, fontSize: 13, color: TONE.primaryDeep, fontWeight: '600' },
  ghostBtn: { paddingVertical: SPACE.md },
  ghostBtnText: { color: NATURE.barkSoft, fontSize: 16, fontWeight: '600' },
});

export default FruitVideoScreen;
