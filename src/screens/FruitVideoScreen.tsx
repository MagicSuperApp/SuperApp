// screens/FruitVideoScreen.tsx
//
// Thu video QUẢ → gắn vào 1 CÂY (OriLife). Theo User-Action-Flow (OriLife-Mobile PR #2):
//   Quay video (native launchCamera video) → xem lại → chọn cây (CHO gắn sai, VeData sửa
//   sau) → GỬI → hiện "đã lưu, thấy N quả".
//
// KIẾN TRÚC 1-CỬA: màn NÀY không bao giờ POST trực tiếp. "Gửi" = enqueueVideoUpload(...)
// rồi flush 1 lần; "Gửi lại lên LampNet" = retryVideoJobNow(jobId). Hàng đợi
// (videoUploadQueue) là nguồn sự-thật DUY NHẤT cho "clip đã gửi chưa" — nháp
// (treeDraftStore) chỉ giữ metadata phiên chụp để app bị-ngắt còn khôi phục được UI.
//
// MobileCore KHÔNG cấp quay video — đây là native RN per-app (image-picker). Chắt khung
// + detect quả ở SERVER. Không hiển thị lỗi kỹ-thuật thô cho nông dân.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView,
  ActivityIndicator, Alert, TextInput, Image, FlatList, Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Geolocation from 'react-native-geolocation-service';
import { COLORS } from '../constants';
import { NEUTRAL } from '../shared/theme';
import { useAppSelector } from '../store/hooks';
import type { RootState } from '../store';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { getTrees, type TreeInfo } from '../services/treeReIDService';
import { loadVideoProofs } from '../services/videoProofStore';
import { MAX_VIDEO_BYTES, type FruitVideoResult } from '../services/fruitVideoService';
import {
  saveFruitVideoDraft,
  clearFruitVideoDraft,
  restoreFruitVideoDraft,
} from '../services/treeDraftStore';
import {
  enqueueVideoUpload,
  flushVideoUploadQueue,
  retryVideoJobNow,
  isJobQueued,
  getVideoQueueCount,
} from '../services/videoUploadQueue';

// image-picker nạp mềm (giống AnimalEnroll) — máy chưa cài thì báo rõ, không crash.
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

const VIDEO_OPTIONS = {
  mediaType: 'video' as const,
  videoQuality: 'high' as const,
  durationLimit: 20,          // ≤ 20s (spec) — clip ngắn, dung-lượng vừa
  saveToPhotos: false,
};

type ParamList = { FruitVideo: { treeId?: string; treeName?: string; farmId?: string } };

const FruitVideoScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<ParamList, 'FruitVideo'>>();
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

  const [trees, setTrees] = useState<TreeInfo[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | undefined>(initialTreeId);
  const [showTreePicker, setShowTreePicker] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<FruitVideoResult | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  // Job vừa xếp hàng nhưng CHƯA lên LampNet — để nút "Gửi lại" nhắm đúng clip đó.
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  // Ref soi videoUri MỚI NHẤT để chống đua khôi-phục-vs-phiên-mới (hộp thoại mở lâu).
  const videoUriRef = useRef<string | null>(null);
  videoUriRef.current = videoUri;

  // Số clip đang chờ gửi trong hàng đợi bền — hiện để đội thực địa biết còn tồn.
  const refreshQueueCount = useCallback(() => {
    getVideoQueueCount().then(setQueueCount).catch(() => {});
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
      Alert.alert(
        'Khôi phục video dở?',
        'Có video quả quay buổi trước nhưng chưa gửi. Khôi phục để gửi tiếp?',
        [
          { text: 'Bỏ', style: 'destructive', onPress: () => { clearFruitVideoDraft(draftOwner); } },
          {
            text: 'Khôi phục',
            onPress: () => {
              // RE-CHECK: người dùng có thể đã quay clip mới trong lúc hộp thoại mở →
              // KHÔNG ghi đè phiên mới bằng clip nháp (chống gắn nhầm cây/hỏng provenance).
              if (videoUriRef.current) return;
              setVideoUri(draft.videoUri);
              setVideoSize(draft.videoSize ?? null);
              setCapturedAt(draft.capturedAt ?? null);
              if (draft.note) setNote(draft.note);
              if (draft.selectedTreeId) setSelectedTreeId(draft.selectedTreeId);
            },
          },
        ],
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
    });
  }, [draftOwner, videoUri, videoSize, selectedTreeId, note, farmId, capturedAt]);

  const selectedTree = trees.find(t => t.tree_id === selectedTreeId);

  // ── Quay video ────────────────────────────────────────────────────────────
  const handleRecord = useCallback(() => {
    if (!imagePicker?.launchCamera) {
      Alert.alert('Chưa cài camera', 'Cần cập nhật app (react-native-image-picker).');
      return;
    }
    imagePicker.launchCamera(VIDEO_OPTIONS, (response: any) => {
      if (response.didCancel) return;
      if (response.errorCode) {
        Alert.alert('Lỗi camera', response.errorMessage ?? 'Không mở được camera. Kiểm tra quyền.');
        return;
      }
      const asset = response.assets?.[0];
      if (!asset?.uri) return;
      const size = asset.fileSize ?? null;
      if (size && size > MAX_VIDEO_BYTES) {
        Alert.alert('Video quá nặng', 'Clip vượt 80MB — hãy quay ngắn hơn (dưới 20 giây).');
        return;
      }
      setVideoUri(asset.uri);
      setVideoSize(size);
      setCapturedAt(Date.now());     // mốc quay → clientEventId ổn định theo clip
      setResult(null);
    });
  }, []);

  const resetForNext = useCallback(() => {
    setVideoUri(null); setVideoSize(null); setCapturedAt(null); setNote(''); setResult(null);
  }, []);

  // ── Gửi (CỬA DUY NHẤT = hàng đợi) ────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!videoUri) return;
    if (!selectedTreeId) {
      Alert.alert('Chọn cây', 'Hãy chọn cây mà chùm quả này thuộc về.');
      return;
    }
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
      });
      if (enq.droppedOldest > 0) {
        Alert.alert(
          'Hàng đợi đầy',
          `Đã bỏ ${enq.droppedOldest} clip cũ nhất chưa gửi được để nhường chỗ. `
            + 'Hãy tới nơi sóng tốt để gửi bớt.',
        );
      }
      // Nháp đã bàn giao cho hàng đợi (cửa duy nhất giữ độ bền) → xoá nháp màn.
      clearFruitVideoDraft(draftOwner);

      // 2) Kích gửi 1 lần.
      await flushVideoUploadQueue();
      refreshQueueCount();

      // 3) Kết cục của CHÍNH clip này: còn trong hàng = chưa lên LampNet.
      const stillQueued = await isJobQueued(enq.job.id);
      if (!stillQueued) {
        // Gửi xong + byte đã lên LampNet → dựng màn kết quả từ SỔ BẰNG CHỨNG.
        const proofs = await loadVideoProofs(selectedTreeId);
        const proof = proofs[0];
        setPendingJobId(null);
        setResult({
          ok: true,
          video_cid: proof?.videoCid,
          event_id: proof?.eventId,
          n_fruits_max: proof?.nFruitsMax,
          n_frames: proof?.nFrames,
          stored: proof?.stored ?? true,
        });
      } else {
        // Còn trong hàng: mạng yếu / offline / stored=false → sẽ tự gửi lại.
        setPendingJobId(enq.job.id);
        Alert.alert(
          'Đã lưu để gửi sau',
          'Mạng đang yếu. Clip đã vào hàng đợi và sẽ tự gửi lại khi có mạng — cứ quay tiếp, '
            + 'hoặc bấm "Gửi lại lên LampNet" khi có sóng tốt.',
        );
        resetForNext();
      }
    } finally {
      setUploading(false);
    }
  }, [videoUri, selectedTreeId, gps, note, capturedAt, videoSize, draftOwner, refreshQueueCount, resetForNext]);

  // ── Gửi lại lên LampNet (giữ UX #94) — QUA hàng đợi, KHÔNG POST trực tiếp ──
  const handleRetryPending = useCallback(async () => {
    setUploading(true);
    try {
      if (pendingJobId) {
        await retryVideoJobNow(pendingJobId);
        if (!(await isJobQueued(pendingJobId))) setPendingJobId(null);
      } else {
        // Không nhớ job cụ thể (mở lại màn) → flush cả hàng.
        await flushVideoUploadQueue();
      }
      refreshQueueCount();
    } finally {
      setUploading(false);
    }
  }, [pendingJobId, refreshQueueCount]);

  // ── Màn kết quả ───────────────────────────────────────────────────────────
  if (result) {
    const n = result.n_fruits_max ?? 0;
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
        <Header title="Đã lưu video quả" onBack={() => navigation.goBack()} topInset={insets.top} />
        <View style={styles.resultBody}>
          <Icon name="check-circle" size={64} color="#2e7d32" />
          <Text style={styles.resultTitle}>
            {n > 0
              ? `Đã lưu video và thấy ${n} quả.`
              : 'Đã lưu video.'}
          </Text>
          <Text style={styles.resultSub}>
            {result.n_frames && result.n_frames > 0
              ? `Chủ vườn sẽ xác nhận sau. (${result.n_frames} khung)`
              : 'Quay chậm hơn một chút sẽ tốt hơn. Chủ vườn xác nhận sau.'}
          </Text>
          {/* #94 từng đặt ở đây khối "stored=false → nút Gửi lại" gọi thẳng handleUpload.
              Kiến trúc 1-cửa bỏ khối đó: màn kết quả CHỈ dựng khi clip đã rời hàng đợi,
              tức backend xác nhận stored!==false (videoUploadQueue.ts:497). Còn stored=false
              thì job nằm lại trong hàng và người dùng thấy màn "Đã lưu để gửi sau" + nút
              "Gửi lại" nối vào retryVideoJobNow. Gọi handleUpload ở đây sẽ xếp hàng clip
              lần nữa = đúng lỗi gửi-trùng đã bịt. */}
          {/* Bằng chứng clip đã nằm trên LampNet. Đội thực địa cần THẤY mã này để
              đối chiếu sau buổi test, không chỉ tin vào dòng "đã lưu". */}
          {!!result.video_cid && (
            <TouchableOpacity
              style={styles.cidBox}
              activeOpacity={0.7}
              onPress={() => {
                Clipboard.setString(result.video_cid!);
                Alert.alert('Đã sao chép', 'Mã lưu trữ đã vào bộ nhớ tạm.');
              }}
            >
              <Icon name="shield-check" size={15} color="#1b5e20" />
              <Text style={styles.cidText} numberOfLines={1}>
                Đã lưu lên mạng LampNet · {result.video_cid}
              </Text>
              <Icon name="content-copy" size={14} color={NEUTRAL.textSub} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.primaryBtn} onPress={resetForNext} activeOpacity={0.85}>
            <Icon name="video-plus" size={18} color={NEUTRAL.white} />
            <Text style={styles.primaryBtnText}>Quay clip khác</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.ghostBtnText}>Xong</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <Header title="Quay video quả" onBack={() => navigation.goBack()} topInset={insets.top} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Khung quay / xem lại */}
        {!videoUri ? (
          <TouchableOpacity style={styles.recordCard} onPress={handleRecord} activeOpacity={0.85}>
            <View style={styles.recordDot} />
            <Text style={styles.recordTitle}>Bấm để quay video chùm quả</Text>
            <Text style={styles.recordHint}>
              Lia chậm qua chùm quả · đủ sáng · giữ chắc tay · dưới 20 giây
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.previewCard}>
            <View style={styles.previewThumb}>
              <Icon name="video-check" size={40} color="#2e7d32" />
              <Text style={styles.previewText}>
                Đã quay xong{videoSize ? ` · ${(videoSize / 1024 / 1024).toFixed(1)}MB` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRecord} activeOpacity={0.8}>
              <Icon name="camera-retake" size={16} color={COLORS.accent} />
              <Text style={styles.retakeText}>Quay lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Chọn cây */}
        <Text style={styles.sectionLabel}>Chùm quả này thuộc cây nào?</Text>
        <TouchableOpacity
          style={styles.treeSelect}
          onPress={() => setShowTreePicker(v => !v)}
          activeOpacity={0.8}
        >
          <Icon name="tree" size={18} color="#1b5e20" />
          <Text style={styles.treeSelectText} numberOfLines={1}>
            {selectedTree ? (selectedTree.name || `Cây ${selectedTree.tree_id.slice(0, 6)}`)
              : 'Chọn cây…'}
          </Text>
          <Icon name={showTreePicker ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.textMuted} />
        </TouchableOpacity>
        <Text style={styles.allowWrongHint}>
          Chọn nhầm cây cũng không sao — hệ thống sẽ giúp sửa lại sau.
        </Text>

        {showTreePicker && (
          <View style={styles.treeList}>
            {trees.length === 0 ? (
              <Text style={styles.treeEmpty}>Chưa có cây nào trong vườn.</Text>
            ) : (
              <FlatList
                data={trees}
                keyExtractor={t => t.tree_id}
                style={{ maxHeight: 240 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.treeRow, item.tree_id === selectedTreeId && styles.treeRowActive]}
                    onPress={() => { setSelectedTreeId(item.tree_id); setShowTreePicker(false); }}
                    activeOpacity={0.7}
                  >
                    <Icon name="tree" size={18} color="#1b5e20" />
                    <Text style={styles.treeRowText} numberOfLines={1}>
                      {item.name || `Cây ${item.tree_id.slice(0, 6)}`}
                    </Text>
                    {item.tree_id === selectedTreeId && (
                      <Icon name="check" size={18} color="#1b5e20" />
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* Ghi chú */}
        <Text style={styles.sectionLabel}>Ghi chú (tuỳ chọn)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="vd: chùm phía đông"
          placeholderTextColor={NEUTRAL.textMuted}
          value={note}
          onChangeText={setNote}
          maxLength={120}
        />
      </ScrollView>

      {/* Nút Gửi */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {queueCount > 0 && (
          <View style={styles.queueBanner}>
            <Icon name="cloud-clock" size={15} color="#e65100" />
            <Text style={styles.queueBannerText}>
              Đang chờ gửi ({queueCount}) · sẽ tự gửi lại khi có mạng
            </Text>
            <TouchableOpacity
              onPress={handleRetryPending}
              disabled={uploading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.queueRetryText}>
                {uploading ? 'Đang gửi…' : 'Gửi lại lên LampNet'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={[styles.primaryBtn, (!videoUri || uploading) && styles.primaryBtnDisabled]}
          onPress={handleUpload}
          disabled={!videoUri || uploading}
          activeOpacity={0.85}
        >
          {uploading ? (
            <>
              <ActivityIndicator color={NEUTRAL.white} />
              <Text style={styles.primaryBtnText}>Đang gửi… giữ app mở</Text>
            </>
          ) : (
            <>
              <Icon name="cloud-upload-outline" size={18} color={NEUTRAL.white} />
              <Text style={styles.primaryBtnText}>Gửi</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Header nhỏ dùng chung ──────────────────────────────────────────────────
// paddingTop nhận insets.top: trước đây cứng 14 nên chữ chui dưới tai thỏ/status
// bar trên máy có notch. Cùng lỗi với footer — nút Gửi đè thanh home indicator.
const HEADER_BG = '#1b5e20';
const Header = ({ title, onBack, topInset }: { title: string; onBack: () => void; topInset: number }) => (
  <View style={[styles.header, { paddingTop: topInset + 14 }]}>
    <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Icon name="chevron-left" size={28} color={NEUTRAL.white} />
    </TouchableOpacity>
    <Text style={styles.headerTitle}>{title}</Text>
    <View style={{ width: 28 }} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: HEADER_BG, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 14,
  },
  headerTitle: { color: NEUTRAL.white, fontSize: 17, fontWeight: '700' },
  body: { padding: 16, paddingBottom: 24 },

  recordCard: {
    borderWidth: 2, borderColor: '#c62828', borderStyle: 'dashed', borderRadius: 16,
    paddingVertical: 34, alignItems: 'center', backgroundColor: '#fff5f5',
  },
  recordDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#c62828', marginBottom: 12 },
  recordTitle: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },
  recordHint: { fontSize: 12.5, color: NEUTRAL.textSub, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },

  previewCard: {
    borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: 16, padding: 16,
    backgroundColor: '#f1f8f2', alignItems: 'center', gap: 10,
  },
  previewThumb: { alignItems: 'center', gap: 6 },
  previewText: { fontSize: 14, fontWeight: '700', color: '#2e7d32' },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12 },
  retakeText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },

  sectionLabel: { fontSize: 14, fontWeight: '700', color: NEUTRAL.text, marginTop: 20, marginBottom: 8 },
  treeSelect: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: NEUTRAL.white,
  },
  treeSelectText: { flex: 1, fontSize: 15, color: NEUTRAL.text, fontWeight: '600' },
  allowWrongHint: { fontSize: 12, color: NEUTRAL.textMuted, marginTop: 6, fontStyle: 'italic' },
  treeList: {
    marginTop: 8, borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: 12,
    backgroundColor: NEUTRAL.white, overflow: 'hidden',
  },
  treeEmpty: { padding: 16, color: NEUTRAL.textMuted, textAlign: 'center' },
  treeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: NEUTRAL.border,
  },
  treeRowActive: { backgroundColor: '#e8f5e9' },
  treeRowText: { flex: 1, fontSize: 15, color: NEUTRAL.text, fontWeight: '600' },

  noteInput: {
    borderWidth: 1, borderColor: NEUTRAL.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: NEUTRAL.text, backgroundColor: NEUTRAL.white,
  },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: NEUTRAL.border, backgroundColor: COLORS.bg },
  queueBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
    backgroundColor: '#fff3e0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  queueBannerText: { flex: 1, fontSize: 12.5, color: '#e65100', fontWeight: '600' },
  queueRetryText: { fontSize: 12.5, color: '#1b5e20', fontWeight: '800' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: HEADER_BG, borderRadius: 14, paddingVertical: 15,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: NEUTRAL.white, fontSize: 16, fontWeight: '800' },

  resultBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  resultTitle: { fontSize: 19, fontWeight: '800', color: '#1a1a1a', textAlign: 'center', marginTop: 8 },
  resultSub: { fontSize: 14, color: NEUTRAL.textSub, textAlign: 'center' },
  resultWarn: { fontSize: 12.5, color: '#e65100', textAlign: 'center' },
  cidBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch',
    borderWidth: 1, borderColor: '#c8e6c9', backgroundColor: '#f1f8e9',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4,
  },
  cidText: { flex: 1, fontSize: 13, color: '#1b5e20', fontWeight: '600' },
  ghostBtn: { paddingVertical: 12, marginTop: 4 },
  ghostBtnText: { color: NEUTRAL.textSub, fontSize: 15, fontWeight: '600' },
});

export default FruitVideoScreen;
