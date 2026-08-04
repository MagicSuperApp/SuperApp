// modules/work/screens/WorkHomeScreen.tsx
// Aladin Work · v2.0 — brand xanh lá + cam accent, style giống Aladin v1.x.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Image,
  Animated,
  RefreshControl,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { WORK_THEME, WORK_ACCENT, WORK_BG_SOFT } from '../theme/colors';
import StateView from '../../../components/state/StateView';
import { formatVND, type Job } from '../data/mockData';
import { WORK_CATEGORIES, type WorkCategory } from '../data/categories';
import { useJobs } from '../hooks/useJobs';

const { width: SCREEN_W } = Dimensions.get('window');

const WorkHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Nguồn tin: flag ON → API thật (chỉ tin mở); OFF → mock (useJobs xử lý).
  const { jobs, loading, errorKind, reload } = useJobs(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(j => {
      if (activeCategory && j.categoryId !== activeCategory) return false;
      if (query && !j.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [jobs, query, activeCategory]);

  // Số việc mỗi ngành = đếm từ việc THẬT đã tải (không nhúng số giả).
  const categoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const j of jobs) m[j.categoryId] = (m[j.categoryId] ?? 0) + 1;
    return m;
  }, [jobs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />

      {/* ── HEADER ─────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Icon name="arrow-left" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Aladin Work</Text>
            <Text style={styles.headerSubtitle}>Tìm thợ · Đặt việc · Ký hợp đồng số</Text>
          </View>
          <TouchableOpacity hitSlop={8} style={styles.iconBtnHeader} onPress={() => navigation.navigate('WorkTaskers')}>
            <Icon name="account-search-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} style={styles.iconBtnHeader} onPress={() => navigation.navigate('WorkAvailability')}>
            <Icon name="calendar-check-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} style={styles.iconBtnHeader} onPress={() => navigation.navigate('Contracts')}>
            <Icon name="file-document-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} style={styles.iconBtnHeader}>
            <Icon name="bell-outline" size={20} color="#fff" />
            <View style={styles.bellBadge} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Icon name="magnify" size={18} color={WORK_THEME.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Bạn cần tìm công việc gì hôm nay?"
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            allowFontScaling={false}
          />
          {!!query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity hitSlop={8}>
              <Icon name="heart-outline" size={18} color={WORK_ACCENT} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Animated.View style={[{ flex: 1, opacity: fadeAnim }]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={WORK_THEME.primary}
            />
          }
        >
          {/* ── Hero hành động: GUIDE TOUR + Tạo việc ─────── */}
          <View style={styles.heroSection}>
            <View style={styles.heroSectionHeader}>
              <Text style={styles.heroSectionTitle}>Tìm Tasker</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PostJob')} hitSlop={6}>
                <Text style={styles.heroSectionMore}>Tạo việc ngay</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.heroRow}>
              {/* GUIDE TOUR card — xanh lá đậm */}
              <TouchableOpacity activeOpacity={0.9} style={styles.guideCard}>
                <View style={styles.guideTag}>
                  <Text style={styles.guideTagText}>GUIDE TOUR</Text>
                </View>
                <Text style={styles.guideTitle} numberOfLines={3}>
                  Hướng dẫn đăng việc trên Aladin
                </Text>
                <View style={styles.guideIllustration}>
                  <View style={styles.guideClipboard}>
                    <Icon name="clipboard-check-outline" size={32} color={WORK_ACCENT} />
                    <View style={styles.guideLines}>
                      <View style={[styles.guideLine, { width: '70%' }]} />
                      <View style={[styles.guideLine, { width: '85%' }]} />
                      <View style={[styles.guideLine, { width: '55%' }]} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Tạo việc ngay card — trắng, viền cam đứt */}
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('PostJob')}
                style={styles.postCard}
              >
                <View style={styles.postPlusWrap}>
                  <Icon name="plus" size={28} color={WORK_THEME.primary} />
                </View>
                <Text style={styles.postTitle}>Tạo việc ngay</Text>
                <Text style={styles.postSub}>
                  Một số lưu ý cho lần đầu đăng việc
                </Text>
                <View style={styles.postCta}>
                  <Text style={styles.postCtaText}>Tạo Việc Ngay</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Pagination dots */}
            <View style={styles.dotsRow}>
              <View style={[styles.dot, styles.dotActive]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>

          {/* ── Categories ─────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ngành nghề</Text>
              <Text style={styles.sectionCount}>{WORK_CATEGORIES.length} ngành</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catList}
            >
              <TouchableOpacity
                onPress={() => setActiveCategory(null)}
                style={[
                  styles.catItem,
                  !activeCategory && { backgroundColor: WORK_THEME.primary, borderColor: WORK_THEME.primary },
                ]}
              >
                <Icon name="view-grid" size={18} color={!activeCategory ? '#fff' : WORK_THEME.primary} />
                <Text style={[styles.catItemText, !activeCategory && { color: '#fff' }]}>
                  Tất cả
                </Text>
              </TouchableOpacity>
              {WORK_CATEGORIES.map((c, i) => (
                <CategoryChip
                  key={c.id}
                  cat={c}
                  count={categoryCounts[c.id] ?? 0}
                  active={activeCategory === c.id}
                  onPress={() => setActiveCategory(c.id === activeCategory ? null : c.id)}
                  index={i}
                />
              ))}
            </ScrollView>
          </View>

          {/* ── Tasker Nổi Bật: ĐÃ GỠ ────────────────────────────
              Mục này trước dựng từ FEATURED_WORKERS (dữ liệu mẫu). Anh Aladin chốt
              2026-07-27 gỡ mọi mockup khỏi màn thật. Chưa có endpoint tasker/worker
              thật (AladinWork accounts:0) → gỡ hẳn mục, phục hồi khi có API danh sách
              tasker thật (ghi ở HANDOFF-LEDGER). */}

          {/* ── Việc mới đăng ────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {activeCategory ? WORK_CATEGORIES.find(c => c.id === activeCategory)?.name : 'Việc mới đăng'}
              </Text>
              <Text style={styles.sectionCount}>{filteredJobs.length} tin</Text>
            </View>

            {loading ? (
              <StateView status="loading" loadingLines={3} />
            ) : errorKind === 'network' ? (
              <StateView status="offline" onRetry={reload} />
            ) : errorKind === 'auth' ? (
              <StateView
                status="error"
                title="Cần đăng nhập lại"
                message="Phiên làm việc đã hết hạn. Vui lòng đăng nhập PhoenixKey lại."
                onRetry={reload}
              />
            ) : errorKind ? (
              <StateView status="error" onRetry={reload} />
            ) : filteredJobs.length === 0 ? (
              <StateView
                status="empty"
                title="Không có việc phù hợp"
                message="Thử bỏ lọc hoặc tìm từ khóa khác."
              />
            ) : (
              filteredJobs.map((j, i) => (
                <JobCard
                  key={j.id}
                  job={j}
                  onPress={() => navigation.navigate('JobDetail', { jobId: j.id })}
                  index={i}
                />
              ))
            )}
          </View>

          {/* ── Trust ──────────────────────────────────── */}
          <View style={styles.trustBox}>
            <View style={styles.trustIconWrap}>
              <Icon name="shield-check" size={20} color={WORK_THEME.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>Bảo vệ bởi smart contract</Text>
              <Text style={styles.trustSub}>
                Mọi giao dịch trên Aladin đều có hợp đồng số ký bằng PhoenixKey (P-256), Pledge định giá MAGIC nhưng khóa/hoàn bằng CARP — bạn không lo bị quỵt.
              </Text>
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const CategoryChip: React.FC<{
  cat: WorkCategory; count: number; active: boolean; onPress: () => void; index: number;
}> = ({ cat, count, active, onPress, index }) => {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1, duration: 350, delay: 100 + index * 40, useNativeDriver: true,
    }).start();
  }, [fade, index]);

  return (
    <Animated.View style={{ opacity: fade }}>
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.catItem,
          active && { backgroundColor: cat.color, borderColor: cat.color },
        ]}
      >
        <Icon name={cat.icon} size={18} color={active ? '#fff' : cat.color} />
        <Text style={[styles.catItemText, active && { color: '#fff' }]}>{cat.name}</Text>
        {/* Chỉ hiện badge khi có việc THẬT trong ngành (không hiện số 0). */}
        {count > 0 && (
          <View style={[
            styles.catItemCountWrap,
            active && { backgroundColor: 'rgba(255,255,255,0.25)' },
          ]}>
            <Text style={[
              styles.catItemCount,
              active && { color: '#fff' },
            ]}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const JobCard: React.FC<{
  job: Job; onPress: () => void; index: number;
}> = ({ job, onPress, index }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, delay: 100 + index * 60, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay: 100 + index * 60, useNativeDriver: true }),
    ]).start();
  }, [fade, slide, index]);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.jobCard}>
        <View style={styles.jobCardTop}>
          <View style={styles.jobBadgeRow}>
            <View style={styles.jobCategoryBadge}>
              <Text style={styles.jobCategoryText}>{job.category}</Text>
            </View>
            {job.isUrgent && (
              <View style={styles.jobUrgentBadge}>
                <Icon name="lightning-bolt" size={10} color="#fff" />
                <Text style={styles.jobUrgentText}>Gấp</Text>
              </View>
            )}
            {job.isFeatured && (
              <View style={styles.jobFeaturedBadge}>
                <Icon name="star" size={10} color="#fff" />
                <Text style={styles.jobUrgentText}>Nổi bật</Text>
              </View>
            )}
          </View>
          <Text style={styles.jobBudget}>{formatVND(job.budget)}</Text>
        </View>

        {/* 3 dòng: tiêu đề tiếng Việt dài (địa điểm + nghề) đỡ bị cắt cụt trên thẻ. */}
        <Text style={styles.jobTitle} numberOfLines={3}>{job.title}</Text>

        <View style={styles.jobMetaRow}>
          <View style={styles.jobMetaItem}>
            <Icon name="map-marker-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.jobMetaText}>{job.district}, {job.location}</Text>
          </View>
          <View style={styles.jobMetaItem}>
            <Icon name="clock-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.jobMetaText}>{job.postedAt}</Text>
          </View>
        </View>

        <View style={styles.jobFooter}>
          <View style={styles.jobPoster}>
            <Image source={{ uri: job.postedBy.avatar }} style={styles.jobPosterAvatar} />
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.jobPosterName}>{job.postedBy.name}</Text>
                {job.postedBy.verified && (
                  <Icon name="check-decagram" size={12} color={WORK_THEME.primary} />
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Icon name="star" size={10} color={WORK_ACCENT} />
                <Text style={styles.jobPosterRating}>{job.postedBy.rating}</Text>
              </View>
            </View>
          </View>
          <View style={styles.jobApplicants}>
            <Icon name="account-multiple-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.jobApplicantsText}>{job.applicantCount} ứng tuyển</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WORK_BG_SOFT },

  header: {
    backgroundColor: WORK_THEME.primaryDeep,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headerTitleBox: { flex: 1 },
  headerTitle: {
    fontSize: 19, fontWeight: '800', color: '#fff', letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 2,
  },
  iconBtnHeader: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: 8, right: 9,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: WORK_ACCENT,
    borderWidth: 1.5, borderColor: WORK_THEME.primaryDeep,
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6,
    elevation: 3,
  },
  searchInput: {
    flex: 1, color: COLORS.text, fontSize: 13, padding: 0,
  },

  // paddingBottom chừa khoảng cho CurvedTabBar (navbar nổi) khỏi che nội dung (iOS-fix).
  scrollContent: { paddingTop: 14, paddingBottom: 130 },

  // ── Hero section ────────────────────────────────────
  heroSection: { paddingHorizontal: 16, marginBottom: 8 },
  heroSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  heroSectionTitle: {
    fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3,
  },
  heroSectionMore: {
    fontSize: 12, fontWeight: '800', color: WORK_ACCENT,
  },

  heroRow: { flexDirection: 'row', gap: 10 },
  guideCard: {
    flex: 1,
    backgroundColor: WORK_THEME.primary,
    borderRadius: 16,
    padding: 14,
    // minHeight thay height cứng: máy nhỏ / cỡ chữ lớn không bị tràn nội dung.
    minHeight: 200,
    overflow: 'hidden',
    position: 'relative',
  },
  guideTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 6,
    marginBottom: 10,
  },
  guideTagText: {
    fontSize: 9, fontWeight: '900',
    color: '#fff', letterSpacing: 0.8,
  },
  guideTitle: {
    fontSize: 14, fontWeight: '800',
    color: '#fff', letterSpacing: -0.2,
    lineHeight: 19,
  },
  guideIllustration: {
    position: 'absolute', right: 8, bottom: 8,
  },
  guideClipboard: {
    width: 80, height: 90,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    transform: [{ rotate: '-6deg' }],
    alignItems: 'center', justifyContent: 'space-around',
  },
  guideLines: {
    width: '100%', gap: 4, marginTop: 2,
  },
  guideLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: WORK_THEME.primaryLight,
  },

  postCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    // minHeight thay height cứng: cân chiều cao 2 cột nhưng cho phép giãn.
    minHeight: 200,
    borderWidth: 1.5,
    borderColor: WORK_ACCENT,
    borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'space-between',
  },
  postPlusWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: WORK_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 6,
  },
  postTitle: {
    fontSize: 13, fontWeight: '800', color: COLORS.text,
    textAlign: 'center', letterSpacing: -0.2,
  },
  postSub: {
    fontSize: 10, color: COLORS.textMuted,
    textAlign: 'center', lineHeight: 14,
  },
  postCta: {
    width: '100%',
    paddingVertical: 9,
    backgroundColor: WORK_ACCENT,
    borderRadius: 10,
    alignItems: 'center',
  },
  postCtaText: {
    fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.2,
  },

  dotsRow: {
    flexDirection: 'row', gap: 5,
    alignSelf: 'center',
    marginTop: 12, marginBottom: 4,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 18, backgroundColor: WORK_THEME.primary,
  },

  // ── Sections ────────────────────────────────────────
  section: { marginBottom: 4, marginTop: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: -0.2 },
  sectionMore: { fontSize: 11, fontWeight: '800', color: WORK_THEME.primary },
  sectionCount: { fontSize: 11, color: COLORS.textMuted },

  // ── Categories ──────────────────────────────────────
  catList: { paddingHorizontal: 16, paddingBottom: 6, gap: 8 },
  catItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catItemText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  catItemCountWrap: {
    paddingHorizontal: 6, paddingVertical: 1,
    backgroundColor: WORK_BG_SOFT,
    borderRadius: 6,
  },
  catItemCount: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700' },

  // ── Tasker (carousel) ──────────────────────────────
  workerHorizontalList: { paddingHorizontal: 16, gap: 10 },
  taskerCard: {
    width: 130,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  taskerAvatarWrap: { position: 'relative', marginBottom: 8 },
  taskerAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.divider,
  },
  taskerVerifiedBadge: {
    position: 'absolute', top: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#C0533A',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  taskerName: {
    fontSize: 12, fontWeight: '800', color: COLORS.text,
    textAlign: 'center',
  },
  taskerRole: {
    fontSize: 10, color: COLORS.textMuted,
    marginTop: 2, textAlign: 'center',
  },
  taskerRating: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginTop: 6,
  },
  taskerRatingText: {
    fontSize: 11, fontWeight: '800', color: WORK_ACCENT,
  },

  // ── Jobs ────────────────────────────────────────────
  jobCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  jobCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  jobBadgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 },
  jobCategoryBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: WORK_THEME.primaryGlow,
    borderRadius: 6,
  },
  jobCategoryText: {
    fontSize: 10, fontWeight: '700', color: WORK_THEME.primary,
  },
  jobUrgentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: '#C0533A',
    borderRadius: 6,
  },
  jobFeaturedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: WORK_ACCENT,
    borderRadius: 6,
  },
  jobUrgentText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  jobBudget: { fontSize: 14, fontWeight: '900', color: WORK_THEME.primary },

  jobTitle: {
    fontSize: 14, fontWeight: '700', color: COLORS.text,
    lineHeight: 19, marginBottom: 8,
  },
  jobMetaRow: {
    flexDirection: 'row', gap: 12, marginBottom: 10,
  },
  jobMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  jobMetaText: { fontSize: 11, color: COLORS.textMuted },

  jobFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  jobPoster: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobPosterAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.divider },
  jobPosterName: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  jobPosterRating: { fontSize: 10, color: COLORS.textMuted },
  jobApplicants: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  jobApplicantsText: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  // ── Empty ──────────────────────────────────────────
  emptyView: {
    alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: WORK_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  emptySubtitle: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },

  // ── Trust ───────────────────────────────────────────
  trustBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginTop: 16,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1, borderColor: WORK_THEME.primaryLight,
  },
  trustIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: WORK_THEME.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  trustTitle: {
    fontSize: 12, fontWeight: '800', color: WORK_THEME.primaryDeep, marginBottom: 3,
  },
  trustSub: { fontSize: 11, color: COLORS.textSub, lineHeight: 16 },
});

export default WorkHomeScreen;
