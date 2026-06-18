// modules/work/screens/WorkerProfileScreen.tsx
// Hồ sơ thợ — đánh giá, kỹ năng, lịch sử công việc.

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { getWorkerById, formatVND } from '../data/mockData';

type RouteParams = { WorkerProfile: { workerId: string } };

const REVIEWS = [
  {
    id: 'r1', reviewer: 'Anh Tuấn', avatar: 'https://i.pravatar.cc/100?img=12',
    rating: 5, comment: 'Làm rất tỉ mỉ, đúng giờ, giá cả phải chăng. Sẽ thuê lại.',
    job: 'Kéo dây điện nhà mới', time: '3 ngày trước',
  },
  {
    id: 'r2', reviewer: 'Chị Linh', avatar: 'https://i.pravatar.cc/100?img=47',
    rating: 5, comment: 'Anh Tài làm việc rất chuyên nghiệp. Có giấy phép, đầy đủ bảo hộ.',
    job: 'Sửa hệ thống điện văn phòng', time: '2 tuần trước',
  },
  {
    id: 'r3', reviewer: 'Chú Bình', avatar: 'https://i.pravatar.cc/100?img=70',
    rating: 4, comment: 'Tốt, hài lòng. Chỉ một chút chậm so với hẹn nhưng chất lượng OK.',
    job: 'Lắp đèn LED và quạt trần', time: '1 tháng trước',
  },
];

const JOB_HISTORY = [
  { id: 'h1', title: 'Kéo dây điện nhà mới 3 tầng', category: 'Sửa chữa', amount: 3500000, rating: 5, date: '12/05/2026', status: 'completed' },
  { id: 'h2', title: 'Sửa hệ thống điện văn phòng', category: 'Sửa chữa', amount: 2800000, rating: 5, date: '28/04/2026', status: 'completed' },
  { id: 'h3', title: 'Lắp đặt CCTV cho cửa hàng', category: 'Sửa chữa', amount: 4200000, rating: 4.8, date: '10/04/2026', status: 'completed' },
  { id: 'h4', title: 'Sửa ổ cắm điện hỏng', category: 'Sửa chữa', amount: 450000, rating: 5, date: '02/04/2026', status: 'completed' },
];

const WorkerProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'WorkerProfile'>>();
  const { workerId } = route.params;
  const worker = getWorkerById(workerId);

  const [activeTab, setActiveTab] = useState<'reviews' | 'history' | 'skills'>('reviews');
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  if (!worker) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.textMuted }}>Không tìm thấy thợ.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: WORK_THEME.primary, fontWeight: '700' }}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
              <Image source={{ uri: worker.avatar }} style={styles.avatar} />
              {worker.online && <View style={styles.onlineDot} />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.name}>{worker.name}</Text>
                {worker.verified && (
                  <Icon name="check-decagram" size={16} color={WORK_THEME.primary} />
                )}
              </View>
              <Text style={styles.title}>{worker.title}</Text>
              <View style={styles.locRow}>
                <Icon name="map-marker-outline" size={12} color={COLORS.textMuted} />
                <Text style={styles.locText}>{worker.location}</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <Stat icon="star" iconColor="#E08C3A" value={String(worker.rating)} label={`(${worker.reviewCount} đánh giá)`} />
            <View style={styles.statDivider} />
            <Stat icon="check-circle-outline" iconColor={COLORS.success} value={String(worker.completedJobs)} label="việc hoàn thành" />
            <View style={styles.statDivider} />
            <Stat icon="briefcase-clock-outline" iconColor={WORK_THEME.primary} value={`${worker.yearsExperience}`} label="năm kinh nghiệm" />
          </View>

          <View style={styles.rateBox}>
            <Text style={styles.rateLabel}>Phí dự kiến</Text>
            <Text style={styles.rateValue}>{formatVND(worker.hourlyRate)} VND<Text style={styles.rateUnit}> / giờ</Text></Text>
          </View>
        </View>

        <View style={styles.tabBar}>
          {(['reviews', 'history', 'skills'] as const).map(t => {
            const labels = { reviews: 'Đánh giá', history: 'Lịch sử', skills: 'Kỹ năng' };
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

        {activeTab === 'reviews' && (
          <View style={{ paddingHorizontal: 12 }}>
            <View style={styles.bioBox}>
              <Text style={styles.bioTitle}>Giới thiệu</Text>
              <Text style={styles.bioText}>{worker.bio}</Text>
            </View>
            {REVIEWS.map(r => (
              <View key={r.id} style={styles.reviewCard}>
                <Image source={{ uri: r.avatar }} style={styles.reviewAvatar} />
                <View style={{ flex: 1 }}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewName}>{r.reviewer}</Text>
                    <View style={styles.reviewStars}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <Icon
                          key={s}
                          name={s <= r.rating ? 'star' : 'star-outline'}
                          size={12}
                          color={s <= r.rating ? '#E08C3A' : COLORS.textMuted}
                        />
                      ))}
                    </View>
                  </View>
                  <Text style={styles.reviewJob}>{r.job} · {r.time}</Text>
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'history' && (
          <View style={{ paddingHorizontal: 12 }}>
            {JOB_HISTORY.map(j => (
              <View key={j.id} style={styles.historyCard}>
                <View style={styles.historyIconWrap}>
                  <Icon name="check-circle" size={18} color={COLORS.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle} numberOfLines={1}>{j.title}</Text>
                  <View style={styles.historyMeta}>
                    <Text style={styles.historyCategory}>{j.category}</Text>
                    <Text style={styles.historyDate}>· {j.date}</Text>
                  </View>
                  <View style={styles.historyBottom}>
                    <Text style={styles.historyAmount}>{formatVND(j.amount)} VND</Text>
                    <View style={styles.historyRating}>
                      <Icon name="star" size={10} color="#E08C3A" />
                      <Text style={styles.historyRatingText}>{j.rating}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'skills' && (
          <View style={{ paddingHorizontal: 12 }}>
            <View style={styles.bioBox}>
              <Text style={styles.bioTitle}>Kỹ năng chuyên môn</Text>
              <View style={styles.skillList}>
                {worker.skills.map((s, i) => (
                  <View key={i} style={styles.skillChip}>
                    <Icon name="check" size={11} color={WORK_THEME.primary} />
                    <Text style={styles.skillText}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.bioBox}>
              <Text style={styles.bioTitle}>Chứng nhận đã xác thực</Text>
              <CertItem icon="card-account-details-outline" name="CMND/CCCD đã xác thực" />
              <CertItem icon="shield-check-outline" name="Đã xác thực sinh trắc qua PhoenixKey" />
              <CertItem icon="certificate-outline" name="Chứng chỉ nghề (đã upload)" />
              <CertItem icon="briefcase-check-outline" name={`${worker.yearsExperience} năm kinh nghiệm xác thực qua lịch sử Aladin`} />
            </View>
          </View>
        )}
      </Animated.ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => navigation.navigate('ProofChatRoom', { roomId: `worker-${worker.id}` })}
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

const CertItem: React.FC<{ icon: string; name: string }> = ({ icon, name }) => (
  <View style={styles.certItem}>
    <View style={styles.certIconWrap}>
      <Icon name={icon} size={14} color={WORK_THEME.primary} />
    </View>
    <Text style={styles.certText}>{name}</Text>
    <Icon name="check-decagram" size={14} color={COLORS.success} />
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

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
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  locText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

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

  rateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: WORK_THEME.primaryGlow,
    padding: 12,
    borderRadius: 10,
  },
  rateLabel: { fontSize: 11, color: COLORS.textSub, fontWeight: '700' },
  rateValue: { fontSize: 16, fontWeight: '900', color: WORK_THEME.primary },
  rateUnit: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },

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

  reviewCard: {
    flexDirection: 'row', gap: 10,
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.divider },
  reviewHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  reviewName: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  reviewStars: { flexDirection: 'row', gap: 1 },
  reviewJob: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  reviewComment: { fontSize: 12, color: COLORS.textSub, marginTop: 6, lineHeight: 17 },

  historyCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  historyIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#E8F5EE',
    alignItems: 'center', justifyContent: 'center',
  },
  historyTitle: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  historyMeta: { flexDirection: 'row', gap: 4, marginTop: 3 },
  historyCategory: { fontSize: 10, color: WORK_THEME.primary, fontWeight: '700' },
  historyDate: { fontSize: 10, color: COLORS.textMuted },
  historyBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 6,
  },
  historyAmount: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  historyRating: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: '#FFF6E5',
    borderRadius: 6,
  },
  historyRatingText: { fontSize: 10, fontWeight: '800', color: '#B07D2F' },

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
