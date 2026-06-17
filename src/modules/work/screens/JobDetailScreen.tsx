// modules/work/screens/JobDetailScreen.tsx
// Chi tiết tin tuyển dụng — ứng tuyển / liên hệ qua Aladin Chat.

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
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME } from '../theme/colors';
import { getJobById, formatVND } from '../data/mockData';
import StateView from '../../../components/state/StateView';

type RouteParams = { JobDetail: { jobId: string } };

const JobDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'JobDetail'>>();
  const { jobId } = route.params;
  const job = getJobById(jobId);

  const [applied, setApplied] = useState(false);
  const [saved, setSaved] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fade]);

  if (!job) {
    return (
      <View style={styles.root}>
        <StateView
          status="empty"
          title="Không tìm thấy tin tuyển dụng"
          message="Tin này có thể đã bị gỡ hoặc không còn tồn tại."
          actionLabel="Quay lại"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  const handleApply = () => {
    if (applied) return;
    Alert.alert(
      'Xác nhận ứng tuyển',
      `Bạn sẽ tạo phòng chat với ${job.postedBy.name} để trao đổi về công việc này.\n\nMọi trao đổi sẽ được ký số bằng PhoenixKey và có giá trị pháp lý.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Ứng tuyển',
          onPress: () => {
            setApplied(true);
            Alert.alert('Đã ứng tuyển', 'Phòng chat Aladin sẽ mở để bạn trao đổi với người thuê.');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết tin</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={() => setSaved(s => !s)} hitSlop={8} style={styles.iconBtn}>
            <Icon
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} style={styles.iconBtn}>
            <Icon name="share-variant-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fade }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBox}>
          <View style={styles.titleBadges}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{job.category}</Text>
            </View>
            {job.isUrgent && (
              <View style={[styles.urgencyBadge, { backgroundColor: '#C0533A' }]}>
                <Icon name="lightning-bolt" size={10} color="#fff" />
                <Text style={styles.urgencyText}>Gấp</Text>
              </View>
            )}
          </View>
          <Text style={styles.jobTitle}>{job.title}</Text>

          <View style={styles.budgetRow}>
            <View>
              <Text style={styles.budgetLabel}>Ngân sách</Text>
              <Text style={styles.budgetValue}>{formatVND(job.budget)} VND</Text>
            </View>
            <View style={styles.budgetDivider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.budgetLabel}>Hạn cuối</Text>
              <Text style={styles.deadlineValue}>{job.deadline}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông tin chung</Text>
          <View style={styles.infoGrid}>
            <InfoItem icon="map-marker-outline" label="Địa điểm" value={`${job.district}, ${job.location}`} />
            <InfoItem icon="clock-outline" label="Đăng" value={job.postedAt} />
            <InfoItem icon="account-multiple-outline" label="Ứng tuyển" value={`${job.applicantCount} người`} />
            <InfoItem icon="briefcase-outline" label="Loại việc" value={job.category} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mô tả công việc</Text>
          <Text style={styles.description}>{job.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Yêu cầu</Text>
          {job.requirements.map((r, i) => (
            <View key={i} style={styles.reqItem}>
              <Icon name="check-circle" size={14} color={COLORS.success} />
              <Text style={styles.reqText}>{r}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Người đăng tin</Text>
          <View style={styles.posterCard}>
            <Image source={{ uri: job.postedBy.avatar }} style={styles.posterAvatar} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.posterName}>{job.postedBy.name}</Text>
                {job.postedBy.verified && (
                  <Icon name="check-decagram" size={14} color={WORK_THEME.primary} />
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Icon name="star" size={12} color="#E08C3A" />
                <Text style={styles.posterRating}>{job.postedBy.rating} · Đã xác thực Aladin</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.viewProfileBtn}>
              <Text style={styles.viewProfileText}>Xem trang</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, styles.trustSection]}>
          <View style={styles.trustHeader}>
            <Icon name="shield-check" size={16} color={WORK_THEME.primary} />
            <Text style={styles.trustHeaderTitle}>Bảo vệ Aladin</Text>
          </View>
          <View style={styles.trustItem}>
            <Icon name="lock-outline" size={12} color={COLORS.textSub} />
            <Text style={styles.trustItemText}>
              Mọi thoả thuận được ký số bằng PhoenixKey, có giá trị pháp lý
            </Text>
          </View>
          <View style={styles.trustItem}>
            <Icon name="bank-outline" size={12} color={COLORS.textSub} />
            <Text style={styles.trustItemText}>
              Tiền cọc giữ qua escrow trên Cardano, chỉ giải ngân khi hai bên xác nhận
            </Text>
          </View>
          <View style={styles.trustItem}>
            <Icon name="message-badge-outline" size={12} color={COLORS.textSub} />
            <Text style={styles.trustItemText}>
              Trao đổi qua Aladin Chat — lưu trữ vĩnh viễn làm bằng chứng nếu tranh chấp
            </Text>
          </View>
        </View>
      </Animated.ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={() => navigation.navigate('ProofChatRoom', { roomId: `job-${job.id}` })}
          style={styles.chatBtn}
        >
          <Icon name="message-outline" size={20} color={WORK_THEME.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleApply}
          activeOpacity={0.85}
          style={[styles.applyBtn, applied && { backgroundColor: COLORS.success }]}
        >
          <Icon
            name={applied ? 'check-circle' : 'send-outline'}
            size={16}
            color="#fff"
          />
          <Text style={styles.applyBtnText}>
            {applied ? 'Đã ứng tuyển' : 'Ứng tuyển ngay'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const InfoItem: React.FC<{ icon: string; label: string; value: string }> = ({
  icon, label, value,
}) => (
  <View style={styles.infoItem}>
    <View style={styles.infoIconWrap}>
      <Icon name={icon} size={14} color={WORK_THEME.primary} />
    </View>
    <View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
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
  headerTitle: {
    flex: 1, fontSize: 16, fontWeight: '700', color: '#fff',
  },
  iconBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
  },

  titleBox: {
    backgroundColor: COLORS.card,
    margin: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  titleBadges: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  categoryBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: WORK_THEME.primaryGlow,
    borderRadius: 6,
  },
  categoryText: { fontSize: 10, fontWeight: '700', color: WORK_THEME.primary },
  urgencyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 6,
  },
  urgencyText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  jobTitle: {
    fontSize: 18, fontWeight: '800', color: COLORS.text,
    lineHeight: 24, letterSpacing: -0.3,
    marginBottom: 14,
  },

  budgetRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 10,
  },
  budgetLabel: {
    fontSize: 10, color: COLORS.textMuted,
    fontWeight: '700', letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  budgetValue: { fontSize: 16, fontWeight: '900', color: WORK_THEME.primary },
  deadlineValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  budgetDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 14 },

  section: {
    backgroundColor: COLORS.card,
    marginHorizontal: 12, marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: COLORS.text,
    letterSpacing: -0.2, marginBottom: 12,
  },

  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    width: '47%',
  },
  infoIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: WORK_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  infoLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  infoValue: { fontSize: 12, color: COLORS.text, fontWeight: '700', marginTop: 1 },

  description: { fontSize: 13, color: COLORS.textSub, lineHeight: 20 },

  reqItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 5,
  },
  reqText: { fontSize: 12, color: COLORS.text, flex: 1 },

  posterCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.inputBg,
    padding: 12,
    borderRadius: 10,
  },
  posterAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.divider },
  posterName: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  posterRating: { fontSize: 11, color: COLORS.textSub, fontWeight: '600' },
  viewProfileBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1, borderColor: WORK_THEME.primaryLight,
  },
  viewProfileText: { fontSize: 11, fontWeight: '700', color: WORK_THEME.primary },

  trustSection: {
    backgroundColor: WORK_THEME.primaryGlow,
    borderColor: WORK_THEME.primaryLight,
  },
  trustHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 10,
  },
  trustHeaderTitle: {
    fontSize: 12, fontWeight: '800', color: WORK_THEME.primaryDeep,
  },
  trustItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 4,
  },
  trustItemText: { flex: 1, fontSize: 11, color: COLORS.textSub, lineHeight: 16 },

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
  applyBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14,
    backgroundColor: WORK_THEME.primary,
    borderRadius: 12,
  },
  applyBtnText: {
    fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: -0.2,
  },
});

export default JobDetailScreen;
