/**
 * FruitLookupScreen — NGƯỜI MUA chụp một quả → quả này từ vườn nào.
 *
 * Đây là cửa `POST /api/fruit/lookup`: **không cần đăng nhập**, phạm vi = quả
 * thuộc cây mà chính nông dân đã bật công khai. Xem `services/fruitLookupService.ts`
 * về ba đường quả và vì sao KHÔNG được gộp chúng lại.
 *
 * ── Màn này CỐ Ý không có dấu tích xanh ─────────────────────────────────────
 * Số đo của máy chủ 04/08/2026 (`server.py:8321`): ở ngưỡng 0,72 có **73%
 * (412/564)** cặp quả KHÁC NHAU trên cùng một cây bị nhận nhầm là cùng quả; siết
 * tới mức hết nhận nhầm thì chỉ giữ 7,8% quả thật. *"Không có điểm hoạt động nào
 * cứu được một đáp án đơn."*
 *
 * Nên màn này luôn là BỘ ĐỐI CHIẾU, kể cả khi `verdict === 'SOLO'` — `SOLO` chỉ
 * nghĩa là "trong tầm có đúng một ứng viên", KHÔNG phải "chắc chắn là quả này".
 * Giống hệt quyết định đã có ở `FruitScanScreen` cho đường nông dân.
 *
 * ── Ảnh phải NHỎ hơn ở đường nông dân, và đây là chỗ dễ sai ──────────────────
 * Lane khách có trần riêng 2 MB (`OLT_SCAN_MAX_MB`) → vượt là 413. Đường nông
 * dân thì CỐ Ý không co ảnh (máy chủ bôi trắng ngoài vòng khoanh rồi vứt ảnh
 * gốc, ảnh càng nét càng khớp đúng). Chép nguyên `PHOTO_OPTIONS` của màn kia
 * sang đây là mua lấy một chuỗi 413 không hiểu vì sao.
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchCamera } from 'react-native-image-picker';

import { COLORS } from '../constants';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { withPhotoSave } from '../services/mediaSavePermission';
import {
  candidateImageUrl, lookupFruit,
  type FruitLookupResult, type LookupCandidate, type LookupRegion,
} from '../services/fruitLookupService';
import { showError } from '../utils/alert';

/**
 * Co ảnh để nằm dưới trần 2 MB của lane khách. 1600 px cạnh dài + chất lượng
 * 0,8 cho ra ~300–600 KB với ảnh điện thoại thường — dư biên an toàn mà vẫn đủ
 * nét cho một lượt so.
 */
const PHOTO_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.8 as const,
  maxWidth: 1600,
  maxHeight: 1600,
  saveToPhotos: false, // Người mua không cần ảnh này trong thư viện của họ.
};

const FruitLookupScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Kết quả của lượt tra gần nhất, ở dạng NHÁNH.
   *
   * Nhánh gộp lại khi hợp nhất với `feat/scan`: hai nhánh cùng dựng cửa này, và
   * bản được giữ trả một union bảy nhánh thay cho `{ok, data, error}`. Đổi lại là
   * mỗi ca (`need_region` · `empty_scope` · `image_unusable` · `rate_limited`)
   * hiện ra một câu khác nhau mà không phải soi vào `error.code`.
   */
  const [res, setRes] = useState<FruitLookupResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  const run = useCallback(async (uri: string, region?: LookupRegion) => {
    setBusy(true);
    setErr(null);
    setRetryAfter(null);
    const r = await lookupFruit(
      ORILIFE_BASE,
      uri,
      region ? { bbox: region.bbox, shape: 'rect' } : undefined,
    );
    setBusy(false);
    setRes(r);

    // Câu của MÁY CHỦ thắng câu app soạn — nó biết chuyện gì vừa xảy ra rõ hơn.
    if (r.kind === 'error') { setErr(r.error.detail); return; }
    if (r.kind === 'rate_limited') {
      setErr(r.message ?? 'Máy chủ đang bận, chờ một chút rồi thử lại.');
      setRetryAfter(r.retryAfterSec);
      return;
    }
    if (r.kind === 'too_large') {
      setErr('Ảnh quá nặng để gửi đi. Chụp lại giúp.');
      return;
    }
    if (r.kind === 'image_unusable') {
      setErr(r.message ?? 'Ảnh chưa dùng được — lại gần hơn, đủ sáng, chụp lại giúp.');
    }
  }, []);

  const takePhoto = useCallback(async () => {
    launchCamera(await withPhotoSave(PHOTO_OPTIONS), (resp: any) => {
      if (resp.didCancel) return;
      if (resp.errorCode) {
        showError('Lỗi máy ảnh', resp.errorMessage ?? 'Không mở được máy ảnh. Kiểm tra quyền.');
        return;
      }
      const uri = resp.assets?.[0]?.uri;
      if (!uri) return;
      setPhoto(uri);
      setRes(null);
      run(uri);
    });
  }, [run]);

  const cands: LookupCandidate[] = res?.kind === 'candidates' ? res.candidates : [];
  const regions: LookupRegion[] = res?.kind === 'need_region' ? res.regions : [];
  const needRegion = res?.kind === 'need_region';
  const emptyScope = res?.kind === 'empty_scope';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="chevron-left" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Tra cứu quả</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {!photo && (
          <View style={s.intro}>
            <Icon name="fruit-cherries" size={48} color={COLORS.accent} />
            <Text style={s.introTitle}>Chụp một quả để xem nó từ vườn nào</Text>
            <Text style={s.introBody}>
              Không cần tài khoản. Máy sẽ đưa ra vài quả giống nhất để bạn tự đối chiếu —
              nó không tự khẳng định quả nào, vì mắt máy còn nhầm nhiều giữa các quả trên
              cùng một cây.
            </Text>
          </View>
        )}

        {photo && <Image source={{ uri: photo }} style={s.preview} resizeMode="cover" />}

        {busy && (
          <View style={s.center}>
            <ActivityIndicator color={COLORS.accent} />
            <Text style={s.muted}>Đang soi quả…</Text>
          </View>
        )}

        {!!err && !busy && (
          <View style={s.errBox}>
            <Icon name="alert-circle-outline" size={20} color={COLORS.warning} />
            <Text style={s.errText}>{err}</Text>
            {retryAfter != null && (
              <Text style={s.muted}>Thử lại sau khoảng {retryAfter} giây.</Text>
            )}
          </View>
        )}

        {/* Máy chủ thấy nhiều quả trong khung → mời chỉ đúng một. Đây CHƯA phải
            kết quả; hiện nó như "không tìm thấy" là sai hẳn nghĩa. */}
        {needRegion && !busy && (
          <View style={s.block}>
            <Text style={s.blockTitle}>Trong ảnh có nhiều quả</Text>
            <Text style={s.muted}>Chọn quả bạn đang cầm:</Text>
            <View style={s.chips}>
              {regions.map((rg) => (
                <TouchableOpacity
                  key={rg.index}
                  style={s.chip}
                  onPress={() => photo && run(photo, rg)}
                >
                  <Text style={s.chipText}>Quả {rg.index + 1}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* EMPTY_SCOPE ≠ "không tìm thấy". Hôm nay nó là câu trả lời thường gặp
            nhất (kho sản xuất 08/2026: 0/139 cây công khai), và lỗi KHÔNG nằm ở
            người mua — nói đúng chuyện gì đang xảy ra. */}
        {emptyScope && !busy && (
          <View style={s.block}>
            <Text style={s.blockTitle}>Chưa có vườn nào mở tra cứu</Text>
            <Text style={s.muted}>
              Tra cứu chỉ tìm trong những cây mà nhà vườn đã tự bật công khai. Hiện chưa
              có cây nào trong tầm — không phải quả của bạn không có nguồn gốc.
            </Text>
          </View>
        )}

        {cands.length > 0 && !busy && (
          <View style={s.block}>
            <Text style={s.blockTitle}>{cands.length} quả giống nhất</Text>
            <Text style={s.muted}>
              Máy KHÔNG khẳng định quả nào. Xem ảnh và thông tin vườn rồi tự đối chiếu.
            </Text>
            {cands.map((c, i) => <CandidateCard key={c.pick ?? i} c={c} />)}
          </View>
        )}

        <TouchableOpacity style={s.cta} onPress={takePhoto} disabled={busy}>
          <Icon name="camera" size={20} color={COLORS.white} />
          <Text style={s.ctaText}>{photo ? 'Chụp lại' : 'Chụp quả'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

/** Một ứng viên. Máy chủ CỐ Ý không trả điểm/biên/fruit_id — đừng đi tìm chúng. */
const CandidateCard: React.FC<{ c: LookupCandidate }> = ({ c }) => {
  // `img_urls` đã được quy về URL tuyệt đối ngay lúc đọc thân trả về (xem
  // `parseLookupBody`), nên ở đây không phải ghép base lần nữa.
  const img = candidateImageUrl(c);
  const tree = c.tree;
  const anchored = tree?.provenance?.anchored;

  return (
    <View style={s.cand}>
      {img
        ? <Image source={{ uri: img }} style={s.candImg} resizeMode="cover" />
        : <View style={[s.candImg, s.candImgEmpty]}><Icon name="image-off-outline" size={20} color={COLORS.textSub} /></View>}
      <View style={s.candBody}>
        <Text style={s.candName}>{c.name || `Quả ${c.pick ?? '?'}`}</Text>
        {!!tree?.name && <Text style={s.muted}>Cây: {tree.name}</Text>}
        {!!tree?.code && <Text style={s.candCode}>{tree.code}</Text>}
        {anchored != null && (
          <View style={s.anchorRow}>
            <Icon
              name={anchored ? 'link-variant' : 'link-variant-off'}
              size={13}
              color={anchored ? COLORS.accent : COLORS.textSub}
            />
            <Text style={s.muted}>
              {anchored ? 'Đã neo lên chuỗi' : 'Chưa neo lên chuỗi'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  // Giữ tiêu đề đúng giữa: đối trọng với nút back bên trái.
  headerSpacer: { width: 28 },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  intro: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  introTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  introBody: { fontSize: 14, lineHeight: 21, color: COLORS.textSub, textAlign: 'center' },
  preview: { width: '100%', height: 220, borderRadius: 14, backgroundColor: COLORS.card },
  center: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  muted: { fontSize: 13, lineHeight: 20, color: COLORS.textSub },
  block: { gap: 8 },
  blockTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  errBox: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: COLORS.card },
  errText: { fontSize: 14, color: COLORS.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  cand: {
    flexDirection: 'row', gap: 12, padding: 10, borderRadius: 12,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  candImg: { width: 68, height: 68, borderRadius: 10, backgroundColor: COLORS.bg },
  candImgEmpty: { alignItems: 'center', justifyContent: 'center' },
  candBody: { flex: 1, gap: 2 },
  candName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  candCode: { fontSize: 12, color: COLORS.textSub, letterSpacing: 0.4 },
  anchorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, paddingVertical: 15, borderRadius: 14, marginTop: 8,
  },
  ctaText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});

export default FruitLookupScreen;
