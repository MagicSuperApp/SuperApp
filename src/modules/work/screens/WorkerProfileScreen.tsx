// modules/work/screens/WorkerProfileScreen.tsx
// Hồ sơ thợ — dữ liệu THẬT từ `GET /taskers`, khớp theo `did`.
//
// ĐÃ GỠ hai khối "Đánh giá" và "Lịch sử việc" (2026-08-12). Không phải vì chưa kịp
// làm — nhà AladinWork trả lời thẳng: đánh giá/nhận xét **không tồn tại trong mô
// hình** (không collection, không cửa, không trường), còn lịch sử việc **không có
// đường nào đọc được** (`completedJobs` là một con số ĐẾM, không phải danh sách;
// `GET /contracts` đòi phiên đăng nhập và chỉ trả hợp đồng của CHÍNH người đang
// đăng nhập, nên không thể thành đường xem lịch sử của người thứ ba).
//
// Trước đó màn này hiện 3 nhận xét và 4 việc đã xong — tên người, số tiền, ngày
// tháng, ảnh đại diện — tất cả đều bịa, gắn lên hồ sơ một NGƯỜI THẬT. Thà thiếu
// còn hơn bịa uy tín của một người thật.
//
// Và đừng dựng lại khi nào backend "có dữ liệu": sẽ không bao giờ có "sao". Uy tín
// ở nền tảng này là điểm 0..100 tính được — xem chú thích ở `Tasker.reputation`.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  Animated,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { useTaskers } from '../hooks/useTaskers';

type RouteParams = { WorkerProfile: { workerId: string } };

const formatVND = (n: number): string => n.toLocaleString('vi-VN');

const WorkerProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'WorkerProfile'>>();
  const { workerId } = route.params;

  // `GET /taskers/{did}` CHƯA CÓ (nhà AladinWork xác nhận 2026-08-12). Danh sách đã
  // mang đủ mọi trường màn này cần, nên khớp `did` từ danh sách là chạy được ngay.
  // Khi nào bên đó mở `GET /taskers/:did` thì đổi sang gọi thẳng — tải cả danh bạ để
  // hiện MỘT hồ sơ là cái bẫy bậc hai đã đo được ở chính `/taskers` (3760ms một lượt).
  // Hôm nay `total = 0` nên chưa đau; nó đau đúng lúc chợ bắt đầu chạy.
  const { taskers, loading, errorKind } = useTaskers();
  const worker = useMemo(
    () => taskers.find(t => t.did === workerId),
    [taskers, workerId],
  );

  const [activeTab, setActiveTab] = useState<'services' | 'skills'>('services');
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centerBox]}>
        <ActivityIndicator color={WORK_THEME.primary} />
      </View>
    );
  }

  if (!worker) {
    // Phân biệt "mạng hỏng" với "không có người này" — hai chuyện khác nhau, và câu
    // chữ chung một mẫu là đúng lỗi vừa phải dọn ở màn Việc.
    return (
      <View style={[styles.root, styles.centerBox]}>
        <Text style={{ color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 32 }}>
          {errorKind
            ? 'Chưa đọc được danh bạ thợ. Kiểm tra mạng rồi thử lại.'
            : 'Không có thợ nào mang mã này trong danh bạ.'}
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: WORK_THEME.primary, fontWeight: '700' }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const offerings = worker.offerings ?? [];
  const skills = worker.skills ?? [];
  const avatarUri = worker.avatarUrl ?? worker.avatar;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hồ sơ thợ</Text>
        <TouchableOpacity hitSlop={8} style={styles.iconBtn}>
          <Icon name="share-variant-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fade }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.avatarWrap}>
              {avatarUri
                ? <Image source={{ uri: avatarUri }} style={styles.avatar} />
                : <View style={[styles.avatar, styles.avatarBlank]}>
                    <Icon name="account" size={32} color={COLORS.textMuted} />
                  </View>}
              {worker.available && <View style={styles.onlineDot} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{worker.name ?? 'Chưa đặt tên'}</Text>
              {!!worker.title && <Text style={styles.title}>{worker.title}</Text>}
              {/* Mã DID là thứ duy nhất chắc chắn có. Hiện rút gọn để người thuê đối
                  chiếu được, vì tên thì trùng nhau được còn DID thì không. */}
              <Text style={styles.didText} numberOfLines={1}>
                {worker.did.length > 24 ? `${worker.did.slice(0, 16)}…${worker.did.slice(-6)}` : worker.did}
              </Text>
            </View>
          </View>

          {/* Ba con số này đều có thật trong `GET /taskers`. Không con số nào ở đây
              được suy ra, và không ô nào hiện khi trường vắng — thà trống còn hơn số bịa. */}
          <View style={styles.statsRow}>
            <Stat
              icon="shield-star-outline" iconColor={WORK_THEME.primary}
              value={worker.reputation != null ? String(Math.round(worker.reputation)) : '—'}
              label="uy tín / 100"
            />
            <View style={styles.statDivider} />
            <Stat
              icon="check-circle-outline" iconColor={COLORS.success}
              value={worker.completedJobs != null ? String(worker.completedJobs) : '—'}
              label="việc đã tất toán"
            />
            <View style={styles.statDivider} />
            <Stat
              icon="certificate-outline" iconColor="#E08C3A"
              value={worker.verifiedCredentials != null ? String(worker.verifiedCredentials) : '—'}
              label="chứng chỉ đã kiểm"
            />
          </View>

          {/* `reputationBasis` là CƠ SỞ của điểm uy tín. Nhà AladinWork trả kèm chính
              vì lý do này: để bên hiển thị không bắt người xem tin một con số trần. */}
          {!!worker.reputationBasis && (
            <Text style={styles.basisText}>{worker.reputationBasis}</Text>
          )}
        </View>

        <View style={styles.tabBar}>
          {(['services', 'skills'] as const).map(t => {
            const labels = { services: 'Dịch vụ', skills: 'Kỹ năng' };
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setActiveTab(t)}
                style={[styles.tab, activeTab === t && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                  {labels[t]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'services' && (
          <View style={{ paddingHorizontal: 12 }}>
            {offerings.length === 0 ? (
              <View style={styles.bioBox}>
                <Text style={styles.bioText}>Người này chưa chào dịch vụ nào.</Text>
              </View>
            ) : offerings.map(o => (
              <View key={o.id} style={styles.offerCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerName} numberOfLines={2}>{o.name}</Text>
                  {!!o.templateKey && <Text style={styles.offerKey}>{o.templateKey}</Text>}
                </View>
                {o.minPriceVND != null && (
                  <Text style={styles.offerPrice}>
                    từ {formatVND(o.minPriceVND)}<Text style={styles.offerUnit}> VND</Text>
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'skills' && (
          <View style={{ paddingHorizontal: 12 }}>
            <View style={styles.bioBox}>
              <Text style={styles.bioTitle}>Kỹ năng</Text>
              {skills.length === 0 ? (
                <Text style={styles.bioText}>Chưa khai kỹ năng nào.</Text>
              ) : (
                <View style={styles.skillList}>
                  {skills.map((s, i) => (
                    <View key={i} style={styles.skillChip}>
                      <Icon name="check" size={11} color={WORK_THEME.primary} />
                      <Text style={styles.skillText}>{s}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Trước đây bốn dòng chứng nhận là HẰNG CỨNG — mọi thợ đều "đã xác thực
                CCCD, sinh trắc, chứng chỉ nghề". Nay chỉ vẽ những gì máy chủ trả. */}
            <View style={styles.bioBox}>
              <Text style={styles.bioTitle}>Chứng chỉ đã kiểm</Text>
              {(worker.credentials ?? []).length === 0 ? (
                <Text style={styles.bioText}>
                  {worker.verifiedCredentials
                    ? `Có ${worker.verifiedCredentials} chứng chỉ đã kiểm, chưa đọc được chi tiết.`
                    : 'Chưa có chứng chỉ nào được kiểm.'}
                </Text>
              ) : (worker.credentials ?? []).map((c, i) => (
                <CertItem
                  key={i}
                  icon="certificate-outline"
                  name={c.taskType ?? c.archetype ?? 'Chứng chỉ'}
                  tier={c.quality_tier}
                />
              ))}
            </View>
          </View>
        )}
      </Animated.ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => navigation.navigate('ChatRoom', { roomId: `worker-${worker.did}` })}
          style={styles.chatBtn}
        >
          <Icon name="message-outline" size={20} color={WORK_THEME.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('PostJob')}
          activeOpacity={0.85}
          style={styles.hireBtn}
        >
          <Icon name="handshake-outline" size={16} color="#fff" />
          <Text style={styles.hireBtnText}>Đặt thợ ngay</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const Stat: React.FC<{ icon: string; iconColor: string; value: string; label: string }> = ({
  icon, iconColor, value, label,
}) => (
  <View style={styles.statBox}>
    <Icon name={icon} size={14} color={iconColor} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const CertItem: React.FC<{ icon: string; name: string; tier?: string }> = ({ icon, name, tier }) => (
  <View style={styles.certItem}>
    <View style={styles.certIconWrap}>
      <Icon name={icon} size={14} color={WORK_THEME.primary} />
    </View>
    <Text style={styles.certText}>{name}</Text>
    {!!tier && <Text style={styles.certTier}>{tier}</Text>}
    <Icon name="check-decagram" size={14} color={COLORS.success} />
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  centerBox: { justifyContent: 'center', alignItems: 'center' },
  avatarBlank: { alignItems: 'center', justifyContent: 'center' },
  didText: { fontSize: 10, color: COLORS.textMuted, marginTop: 6, fontVariant: ['tabular-nums'] },
  basisText: {
    fontSize: 11, color: COLORS.textMuted, lineHeight: 16,
    marginTop: 2, paddingHorizontal: 2,
  },
  offerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  offerName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  offerKey: { fontSize: 10, color: COLORS.textMuted, marginTop: 3 },
  offerPrice: { fontSize: 13, fontWeight: '800', color: WORK_THEME.primary },
  offerUnit: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  certTier: { fontSize: 10, fontWeight: '700', color: WORK_THEME.primary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WORK_THEME.primaryDeep,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  iconBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
  },

  heroCard: {
    backgroundColor: COLORS.card,
    margin: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  heroTop: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.divider },
  onlineDot: {
    position: 'absolute', right: 2, bottom: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.success,
    borderWidth: 2, borderColor: COLORS.card,
  },
  name: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  title: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 9, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 4 },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.border },


  tabBar: {
    flexDirection: 'row', gap: 6,
    marginHorizontal: 12, marginBottom: 12,
    padding: 4,
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: COLORS.card },
  tabText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  tabTextActive: { color: WORK_THEME.primary },

  bioBox: {
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bioTitle: { fontSize: 12, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  bioText: { fontSize: 12, color: COLORS.textSub, lineHeight: 18 },

  skillList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: WORK_THEME.primaryGlow,
    borderRadius: 14,
    borderWidth: 1, borderColor: WORK_THEME.primaryLight,
  },
  skillText: { fontSize: 11, fontWeight: '700', color: WORK_THEME.primaryDeep },

  certItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8,
  },
  certIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: WORK_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  certText: { flex: 1, fontSize: 12, color: COLORS.text, fontWeight: '600' },

  bottomBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 24,
    backgroundColor: COLORS.card,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  chatBtn: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WORK_THEME.primaryGlow,
    borderWidth: 1, borderColor: WORK_THEME.primaryLight,
  },
  hireBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14,
    backgroundColor: WORK_THEME.primary,
    borderRadius: 12,
  },
  hireBtnText: {
    fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: -0.2,
  },
});

export default WorkerProfileScreen;
