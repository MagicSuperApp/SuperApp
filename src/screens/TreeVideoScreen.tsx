// screens/TreeVideoScreen.tsx
//
// Thu video ĐỊNH DANH CÂY → bổ-sung góc nhìn cho 1 CÂY đã đăng-ký (OriLife).
//   Quay video (native launchCamera) → xem lại → chọn/xác-nhận cây → upload
//   POST /api/tree/{id}/video → server chắt khung + verify_add → "đã bổ-sung N góc".
//
// Khác "Video quả" (FruitVideoScreen, đếm quả): đây làm GIÀU góc nhìn của chính cây để
// nhận-diện sau chắc hơn. MobileCore KHÔNG cấp quay video — native RN per-app (image-picker).
// Server tự downscale khung; trần thật là 80MB (không phải 20MB — xem treeVideoService).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView,
  ActivityIndicator, Alert, FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import { COLORS } from '../constants';
import { NEUTRAL } from '../shared/theme';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { ensureOrilifeToken } from '../services/orilifeDidAuth';
import Clipboard from '@react-native-clipboard/clipboard';
import { getTrees, type TreeInfo } from '../services/treeReIDService';
import { appendVideoProof } from '../services/videoProofStore';
import {
  uploadTreeVideo, MAX_TREE_VIDEO_BYTES, type TreeVideoResult,
} from '../services/treeVideoService';
import { withPhotoSave } from '../services/mediaSavePermission';
import { showError, showInfo, showSuccess } from '../utils/alert';

// image-picker nạp mềm (giống FruitVideo/AnimalEnroll) — máy chưa cài thì báo rõ, không crash.
const imagePicker = (() => {
  try { return require('react-native-image-picker'); } catch { return null; }
})();

const VIDEO_OPTIONS = {
  mediaType: 'video' as const,
  // 'medium' → 'high': preset cũ chọn theo trần 20MB tưởng tượng. Trần thật là 80MB
  // (treeVideoService.ts:44), và khung rõ hơn thì engine bắt góc tốt hơn — đây là
  // đường làm giàu góc nhìn của CÂY, chất lượng khung là đầu vào của nó.
  videoQuality: 'high' as const,
  durationLimit: 15,               // ≤ 15s — cây đứng yên, đi vòng chậm là đủ góc
  // GIỮ BẢN GỐC TRONG MÁY (anh Aladin chốt 06/08). Trước đây `false`: clip chỉ là tệp
  // TẠM, rồi `videoUploadQueue.ts` xoá bản tạm ngay khi gửi xong ⇒ gửi thành công là
  // nông dân KHÔNG CÒN BẢN NÀO. Mà LampNet ở chế độ mặc định giữ toàn bộ mảnh nguồn
  // trên ĐÚNG một máy và vòng sửa chữa không tái sinh mảnh đã mất, nên "đã đưa vào hệ
  // phân tán" hiện chưa đồng nghĩa với "đã bền". Bản trong cuộn ảnh là chỗ dựa cho tới
  // khi tầng dưới bền thật.
  //
  // ⚠ KHAI TRONG MANIFEST LÀ CHƯA ĐỦ. Trên Android ≤ 28, picker CHẶN camera mở nếu
  // `saveToPhotos` bật mà WRITE_EXTERNAL_STORAGE chưa được cấp LÚC CHẠY — nghĩa là
  // máy Android 8/9 (đúng phân khúc máy rẻ của đội) không quay được gì. Vì vậy mọi
  // nơi mở camera đều đi qua `withPhotoSave()`: xin quyền, thiếu thì HẠ xuống
  // `saveToPhotos:false` chứ không để mất luôn đường quay.
  saveToPhotos: true,
};

type ParamList = { TreeVideo: { treeId?: string; treeName?: string; farmId?: string } };

const TreeVideoScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'TreeVideo'>>();
  const initialTreeId = route.params?.treeId;
  const initialTreeName = route.params?.treeName;
  const farmId = route.params?.farmId;

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<number | null>(null);
  const [gps, setGps] = useState<{ lat: number; lon: number } | null>(null);

  const [trees, setTrees] = useState<TreeInfo[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string | undefined>(initialTreeId);
  const [showTreePicker, setShowTreePicker] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<TreeVideoResult | null>(null);

  // GPS 1 lần (best-effort) — kèm vào upload để định-vị nơi quay.
  useEffect(() => {
    Geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 },
    );
  }, []);

  // Nạp danh sách cây của vườn (để đổi cây nếu cần) — best-effort.
  useEffect(() => {
    (async () => {
      const res = await getTrees(ORILIFE_BASE, farmId);
      if (res.ok && res.trees) setTrees(res.trees);
    })();
  }, [farmId]);

  const selectedTree = trees.find(t => t.tree_id === selectedTreeId);
  const selectedTreeLabel = selectedTree
    ? (selectedTree.name || `Cây ${selectedTree.tree_id.slice(0, 6)}`)
    : (initialTreeName || (selectedTreeId ? `Cây ${selectedTreeId.slice(0, 6)}` : 'Chọn cây…'));

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
      if (size && size > MAX_TREE_VIDEO_BYTES) {
        showInfo('Video quá nặng', 'Clip vượt 80MB — hãy quay ngắn hơn.');
        return;
      }
      setVideoUri(asset.uri);
      setVideoSize(size);
      setResult(null);
    });
  }, []);

  // ── Gửi ───────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!videoUri) return;
    if (!selectedTreeId) {
      showInfo('Chọn cây', 'Hãy chọn cây cần bổ sung góc nhìn.');
      return;
    }
    setUploading(true);
    try {
      // Token field-reid (DID challenge-sign) — như luồng nhận-diện/tạo-vườn.
      const tokenOk = await ensureOrilifeToken(ORILIFE_BASE);
      if (!tokenOk) {
        showError('Chưa xác thực', 'Không lấy được phiên máy chủ. Kiểm tra mạng/danh tính rồi thử lại.');
        return;
      }
      let res = await uploadTreeVideo(ORILIFE_BASE, selectedTreeId, videoUri, {
        lat: gps?.lat, lon: gps?.lon,
      });
      if (!res.ok && res.error?.type === 'auth_error') {
        const relog = await ensureOrilifeToken(ORILIFE_BASE, { force: true });
        if (relog) res = await uploadTreeVideo(ORILIFE_BASE, selectedTreeId, videoUri, {
          lat: gps?.lat, lon: gps?.lon,
        });
      }
      if (res.ok) {
        // GHI BẰNG CHỨNG TRƯỚC KHI VẼ. LampNet không có đường tra ngược CID theo cây
        // (`/v1/documents` đánh theo doc_type và GHI ĐÈ), nên mã này không app giữ thì
        // mất vĩnh viễn. Video quả đã làm đúng từ đợt trước; video cây thì chưa — đội đi
        // cả ngày, sau buổi không đối chiếu được clip nào.
        //
        // CỜ QUYẾT ĐỊNH LÀ `stored`, KHÔNG PHẢI `video_cid` (OriLife chốt 05/08). Khi
        // LampNet tắt, máy chủ VẪN trả một CID giả dạng `local_<sha16>_<tên>` — có mã
        // nhưng không byte nào rời máy chủ. Ghi mã đó vào sổ bằng chứng là tự tạo ra
        // một dòng không bao giờ tra được, mà sổ thì chỉ ghi thêm, không sửa được.
        if (res.stored === true && res.video_cid) {
          await appendVideoProof(selectedTreeId, {
            videoCid: res.video_cid,
            kind: 'tree',
            at: new Date().toISOString(),
            eventId: res.event_id,
            nFrames: res.n_kept,
            stored: true,
            lat: gps?.lat,
            lon: gps?.lon,
          }).catch(() => undefined);
        }
        setResult(res);
      } else if (res.error?.type === 'no_usable_frames') {
        // 422 — clip đọc được nhưng không khung đẹp: hướng-dẫn quay lại, KHÔNG coi là lỗi hệ-thống.
        showError('Chưa dùng được clip',
          'Chưa lấy được khung rõ từ video. Quay chậm hơn, đủ sáng, giữ chắc tay rồi thử lại.');
      } else {
        showError('Chưa gửi được', res.error?.detail ?? 'Thử lại nơi sóng tốt.');
      }
    } finally {
      setUploading(false);
    }
  }, [videoUri, selectedTreeId, gps]);

  const resetForNext = () => {
    setVideoUri(null); setVideoSize(null); setResult(null);
  };

  // ── Màn kết quả ───────────────────────────────────────────────────────────
  if (result) {
    const added = !!result.added && (result.n_kept ?? 0) > 0;
    const n = result.n_kept ?? 0;
    // Bằng-chứng LampNet: CHỈ `stored === true` mới là đã lưu thật.
    //
    // Trước đây dòng này có thêm `|| !!result.video_cid` — sai, vì chế độ LampNet tắt
    // vẫn trả CID giả `local_…`. Nghĩa là app hiện dấu tích "đã lưu" trong khi không
    // byte nào rời máy chủ, và nông dân yên tâm xoá clip trong máy. `undefined` (bản
    // máy chủ cũ chưa có trường này) cũng KHÔNG được coi là đã lưu.
    const savedToLampNet = result.stored === true;
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
        {/* Tiêu đề PHẢI theo trạng thái thật. Bản trước đóng cứng "Đã lưu video cây"
            và vẽ nó ở MỌI ca, kể cả ca mà thân màn ngay bên dưới đang viết "CHƯA cất
            giữ được… đừng xoá". Hai câu ngược nhau trên một màn, và câu to hơn là câu
            sai — người đọc lướt tiêu đề rồi xoá clip trong máy. */}
        <Header
          title={savedToLampNet ? 'Đã lưu video cây' : 'Đã nhận video cây'}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.resultBody}>
          <Icon
            name={added ? 'check-circle' : 'information'}
            size={64}
            color={added ? '#2e7d32' : '#e65100'}
          />
          <Text style={styles.resultTitle}>
            {added
              ? `Đã bổ sung ${n} góc nhìn cho cây.`
              : savedToLampNet
                ? 'Đã lưu video, nhưng chưa bổ sung được góc.'
                : 'Đã nhận video, nhưng chưa bổ sung được góc.'}
          </Text>
          <Text style={styles.resultSub}>
            {added
              ? 'Cây sẽ được nhận diện chắc hơn ở những góc này.'
              : 'Các khung chưa khớp đúng cây này. Hãy quay gần cây hơn, chỉ một cây trong khung, đủ sáng.'}
          </Text>
          {/* Đội thực địa phải THẤY mã lưu trữ để đối chiếu sau buổi, không chỉ tin
              một dòng chữ "đã lưu" — giống màn video quả. Chạm để sao chép. */}
          {savedToLampNet && !!result.video_cid && (
            <TouchableOpacity
              style={styles.cidBox}
              activeOpacity={0.7}
              onPress={() => {
                Clipboard.setString(result.video_cid!);
                showSuccess('Đã sao chép', 'Mã tra cứu đã vào bộ nhớ tạm.');
              }}
            >
              <Icon name="shield-check" size={15} color="#1b5e20" />
              <Text style={styles.cidText} numberOfLines={1}>
                Đã cất giữ an toàn · {result.video_cid}
              </Text>
              <Icon name="content-copy" size={14} color={NEUTRAL.textSub} />
            </TouchableOpacity>
          )}
          {savedToLampNet && !result.video_cid && (
            <Text style={styles.resultEvidence}>
              ✓ Video đã được cất giữ làm bằng chứng cho cây.
            </Text>
          )}
          {/* KHÔNG hiện mã khi chưa cất được. Mã lúc đó là mã tạm, tra không ra gì —
              hiện ra chỉ khiến người dùng tưởng đã xong rồi xoá clip trong máy. */}
          {!savedToLampNet && (
            <Text style={styles.resultWarn}>
              Máy chủ đã nhận video nhưng CHƯA cất giữ được. Hãy GIỮ LẠI clip trong máy
              và gửi lại khi có sóng tốt — đừng xoá.
            </Text>
          )}
          {(result.n_rejected ?? 0) > 0 && (
            <Text style={styles.resultWarn}>
              {result.n_rejected} khung bị bỏ vì mờ/thiếu sáng.
            </Text>
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
      <Header title="Quay video cây" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Khung quay / xem lại */}
        {!videoUri ? (
          <TouchableOpacity style={styles.recordCard} onPress={handleRecord} activeOpacity={0.85}>
            <View style={styles.recordDot} />
            <Text style={styles.recordTitle}>Bấm để quay video cây</Text>
            <Text style={styles.recordHint}>
              Đi vòng chậm quanh cây · từ gốc lên tán · chỉ một cây trong khung · đủ sáng · dưới 15 giây
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

        {/* Chọn / xác nhận cây */}
        <Text style={styles.sectionLabel}>Bổ sung góc cho cây nào?</Text>
        <TouchableOpacity
          style={styles.treeSelect}
          onPress={() => setShowTreePicker(v => !v)}
          activeOpacity={0.8}
        >
          <Icon name="tree" size={18} color="#1b5e20" />
          <Text style={styles.treeSelectText} numberOfLines={1}>{selectedTreeLabel}</Text>
          <Icon name={showTreePicker ? 'chevron-up' : 'chevron-down'} size={20} color={NEUTRAL.textMuted} />
        </TouchableOpacity>

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
      </ScrollView>

      {/* Nút Gửi */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, (!videoUri || uploading) && styles.primaryBtnDisabled]}
          onPress={handleUpload}
          disabled={!videoUri || uploading}
          activeOpacity={0.85}
        >
          {uploading ? (
            <>
              <ActivityIndicator color={NEUTRAL.white} />
              <Text style={styles.primaryBtnText}>Đang tải lên… giữ app mở</Text>
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
const HEADER_BG = '#1b5e20';
const Header = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <View style={styles.header}>
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

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: NEUTRAL.border, backgroundColor: COLORS.bg },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: HEADER_BG, borderRadius: 14, paddingVertical: 15, padding: 8
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: NEUTRAL.white, fontSize: 16, fontWeight: '800', padding: 4 },

  resultBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  resultTitle: { fontSize: 19, fontWeight: '800', color: '#1a1a1a', textAlign: 'center', marginTop: 8 },
  resultSub: { fontSize: 14, color: NEUTRAL.textSub, textAlign: 'center' },
  resultWarn: { fontSize: 12.5, color: '#e65100', textAlign: 'center' },
  resultEvidence: { fontSize: 13, color: '#2e7d32', fontWeight: '600', textAlign: 'center' },
  cidBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch',
    borderWidth: 1, borderColor: '#c8e6c9', backgroundColor: '#f1f8e9',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4,
  },
  cidText: { flex: 1, fontSize: 13, color: '#1b5e20', fontWeight: '600' },
  ghostBtn: { paddingVertical: 12, marginTop: 4 },
  ghostBtnText: { color: NEUTRAL.textSub, fontSize: 15, fontWeight: '600' },
});

export default TreeVideoScreen;
