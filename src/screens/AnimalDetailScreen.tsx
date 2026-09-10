/**
 * AnimalDetailScreen — Hồ sơ cá thể vật nuôi
 *
 * Params: { animalDid } — khoá CHÍNH THỨC, khớp lệ TreeDetail (`treeId`) và
 * FarmDetail (`farm_id`): tên khoá phải trùng thứ màn đích đọc.
 *
 * Dòng trên tới 2026-09-10 ghi `farmId` cho FarmDetail — SAI, màn đó đọc
 * `farm_id` (`FarmDetailScreen.tsx:1487`). Câu sai này không nằm im: nó là chỗ
 * bài kiểm mã QR ghim đúng cái khoá hỏng, nên bộ kiểm xanh trong khi quét mã
 * vườn thật lại mở ra màn TẠO VƯỜN MỚI. Bảng ép khoá nay ở
 * `navigation/traceScan.ts` → `TRACE_TARGET_ID_KEY`; sửa ở đó, đừng sửa ở đây.
 * Nhận thêm `id` CHỈ để đỡ mã QR cũ đã in ra ngoài (`lamp://AnimalDetail?id=…`).
 * Đừng sinh thêm mã mới bằng `id`.
 *
 * Màn này TRƯỚC ĐÂY là placeholder: 115 dòng, không gọi service nào, trong khi
 * `animalReIDService.getAnimal()` đã viết xong mà không ai gọi. Bốn lối vào đều
 * đâm vào đây (danh sách · sau đăng ký · sau MATCH/MOVED · QR truy xuất) nên cả
 * nhánh vật nuôi kết thúc ở một cái thẻ trắng. Nay nối dữ liệu thật.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL } from '../shared/theme';
import { COLORS } from '../constants';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { getAnimal, type AnimalInfo } from '../services/animalReIDService';
import EntityTimeline from '../modules/trace/components/EntityTimeline';
import { speciesLabel } from '../constants/animalSpecies';

type AnimalDetailRouteParams = {
  AnimalDetail: {
    animalDid?: string;
    /** Khoá cũ của QR — chỉ đọc, không sinh mới. */
    id?: string;
  };
};

const HEADER_BG = '#5d4037';
const BASE_URL: string = ORILIFE_BASE;


/** `2026-08-18T03:12:00+00:00` → `18/08/2026`. Chuỗi hỏng → trả nguyên văn. */
function fmtDate(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Rút mã cá thể từ params. XUẤT RA để test khoá được — chỗ này từng lệch câm:
 * bộ phân giải QR sinh `params.id` còn màn đọc `params.animalDid`, nên
 * `animalDid === undefined` và màn hiện "Không có dữ liệu cá thể" trong khi mã
 * thật nằm ngay trong params. Test cũ xanh vì nó chỉ kiểm bộ phân giải.
 */
export function readAnimalDid(
  params?: AnimalDetailRouteParams['AnimalDetail'],
): string {
  return (params?.animalDid ?? params?.id ?? '').trim();
}

const AnimalDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AnimalDetailRouteParams, 'AnimalDetail'>>();
  const animalDid = readAnimalDid(route.params);

  const [animal, setAnimal] = useState<AnimalInfo | null>(null);
  const [isLoading, setIsLoading] = useState(!!animalDid);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!animalDid) return;
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setLoadError(null);
    try {
      const res = await getAnimal(BASE_URL, animalDid);
      if (res.ok && res.data) {
        setAnimal(res.data);
      } else {
        // Nói rõ máy chủ từ chối ở đâu — "không có dữ liệu" chung chung khiến
        // người dùng tưởng con vật biến mất, trong khi có thể chỉ là mất mạng.
        setLoadError(res.error?.detail ?? 'Không tải được hồ sơ cá thể.');
      }
    } catch {
      setLoadError('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [animalDid]);

  useEffect(() => { load(); }, [load]);

  // ── Thiếu mã: không gọi mạng, nói thẳng ────────────────────────────────────
  const renderNoDid = () => (
    <View style={styles.stateBox}>
      <Icon name="help-circle-outline" size={52} color={NEUTRAL.textMuted} />
      <Text style={styles.stateText}>
        Không nhận được mã cá thể. Mở lại từ sổ vật nuôi hoặc quét lại mã.
      </Text>
    </View>
  );

  const renderError = () => (
    <View style={styles.stateBox}>
      <Icon name="alert-circle-outline" size={52} color={NEUTRAL.textMuted} />
      <Text style={styles.stateText}>{loadError}</Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => load()}
        activeOpacity={0.8}
      >
        <Icon name="refresh" size={17} color={NEUTRAL.white} />
        <Text style={styles.retryBtnText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  );

  const renderBody = () => {
    if (!animalDid) return renderNoDid();
    if (isLoading) {
      return (
        <View style={styles.stateBox}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.stateText}>Đang tải hồ sơ...</Text>
        </View>
      );
    }
    if (loadError) return renderError();

    const created = fmtDate(animal?.created_at);
    const updated = fmtDate(animal?.updated_at);

    return (
      <>
        <View style={styles.card}>
          <Icon name="paw" size={32} color={HEADER_BG} style={styles.cardIcon} />
          <Text style={styles.cardName}>{animal?.name || 'Chưa đặt tên'}</Text>
          <Text style={styles.cardLabel}>Mã định danh vật nuôi</Text>
          <Text style={styles.cardDid} numberOfLines={3} selectable>
            {animalDid}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Icon name="paw-outline" size={16} color={NEUTRAL.textMuted} />
            <Text style={styles.infoText}>Loài: {speciesLabel(animal?.species)}</Text>
          </View>
          {!!animal?.farm_id && (
            <View style={styles.infoRow}>
              <Icon name="barn" size={16} color={NEUTRAL.textMuted} />
              <Text style={styles.infoText}>Vườn: {animal.farm_id}</Text>
            </View>
          )}
          {animal?.n_images != null && (
            <View style={styles.infoRow}>
              <Icon name="image-multiple-outline" size={16} color={NEUTRAL.textMuted} />
              <Text style={styles.infoText}>{animal.n_images} ảnh đã ghi nhận</Text>
            </View>
          )}
          {!!created && (
            <View style={styles.infoRow}>
              <Icon name="calendar-plus" size={16} color={NEUTRAL.textMuted} />
              <Text style={styles.infoText}>Đăng ký: {created}</Text>
            </View>
          )}
          {!!updated && (
            <View style={styles.infoRow}>
              <Icon name="calendar-edit" size={16} color={NEUTRAL.textMuted} />
              <Text style={styles.infoText}>Cập nhật: {updated}</Text>
            </View>
          )}
        </View>

        {/* Dòng thời gian — `animal` là entity hợp lệ (timelineService.ts:45).
            Component tự lo trạng thái tải/lỗi và KHÔNG làm hỏng màn khi đường này
            chưa bật ở máy chủ. */}
        <EntityTimeline entityType="animal" entityId={animalDid} />
      </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Icon name="paw" size={20} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>Hồ sơ cá thể</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => load(true)}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {renderBody()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bgSoft },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: NEUTRAL.white, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 40 },

  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 14 },

  card: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    alignItems: 'center',
    gap: 8,
  },
  cardIcon: { marginBottom: 4 },
  cardName: { fontSize: 18, fontWeight: '700', color: NEUTRAL.text, textAlign: 'center' },
  cardLabel: { fontSize: 12, color: NEUTRAL.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  cardDid: { fontSize: 13, color: NEUTRAL.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center' },

  infoCard: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 14, color: NEUTRAL.textSub, flex: 1 },

  stateBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  stateText: { fontSize: 14, color: NEUTRAL.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: HEADER_BG,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  retryBtnText: { color: NEUTRAL.white, fontSize: 14, fontWeight: '600' },
});

export default AnimalDetailScreen;
