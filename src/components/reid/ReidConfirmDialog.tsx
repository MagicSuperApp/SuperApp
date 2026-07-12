/**
 * ReidConfirmDialog — Modal chọn cá thể (cây hoặc động vật) từ danh sách candidates.
 *
 * Dùng chung cho TreeReID và AnimalReID thông qua prop `context`.
 * Hiện khi decision = UNCERTAIN hoặc cần người dùng xác nhận thủ công.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NEUTRAL } from '../../shared/theme';

// ─── Kiểu candidate (gộp tree + animal, field dùng cái nào thì truyền cái đó) ─
export interface ReidCandidate {
  id: string;
  name: string;
  /** Mã code (cây) */
  code?: string;
  /** Điểm tương đồng 0–1 */
  sim?: number;
  /** Ở gần cá thể vừa quét không */
  near_prev?: boolean;
  /** Có dữ liệu 3D không (cây) */
  has3d?: boolean;
  /** Trạng thái neo blockchain: 'confirmed' | 'pending' | undefined */
  anchor?: string;
  /** Loài (animal) */
  species?: string;
  /** Số lượt ảnh đã ghi nhận */
  n_views?: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ReidConfirmDialogProps {
  visible: boolean;
  context: 'tree' | 'animal';
  candidates: ReidCandidate[];
  onSelect: (id: string | 'new') => void;
  onDismiss: () => void;
  /**
   * Server có CHO PHÉP đăng-ký cá thể MỚI không (allow_enroll_new). Mặc-định true
   * (giữ hành-vi cũ). false → ẩn nút "Mới", chỉ cho chọn trong danh sách
   * (chống tạo trùng khi cùng-loài mơ-hồ — owner_review B1/B2).
   */
  allowNew?: boolean;
  /** Câu gợi ý hành-động do backend trả (suggest) — hiện dưới phụ đề nếu có. */
  suggestText?: string;
}

// ─── Nhãn nội dung theo context ───────────────────────────────────────────────
const LABELS = {
  tree: {
    headerIcon: 'tree',
    headerColor: '#1b5e20',
    headerBg: '#e8f5e9',
    title: 'Chọn cây phù hợp',
    subtitle: (n: number) =>
      `Hệ thống tìm được ${n} cây có thể là cùng một cây. Chọn cây đúng trên thực địa:`,
    candidateIcon: 'tree',
    newTitle: 'Đây là cây mới',
    newSubtitle: 'Chưa có trong hệ thống',
    newButtonIcon: 'plus-circle',
    codeLabel: 'Mã:',
  },
  animal: {
    headerIcon: 'paw',
    headerColor: '#1565c0',
    headerBg: '#e3f2fd',
    title: 'Chọn cá thể phù hợp',
    subtitle: (n: number) =>
      `Hệ thống tìm được ${n} cá thể có thể là cùng một con. Chọn đúng trên thực địa:`,
    candidateIcon: 'cow',
    newTitle: 'Đây là cá thể mới',
    newSubtitle: 'Chưa có trong trại',
    newButtonIcon: 'plus-circle',
    codeLabel: 'Loài:',
  },
} as const;

// ─── Hàm phụ trợ ──────────────────────────────────────────────────────────────
/** Render điểm tương đồng dạng %, màu theo ngưỡng */
function simBadge(sim: number): { label: string; color: string; bg: string } {
  const pct = Math.round(sim * 100);
  if (sim >= 0.7) return { label: `${pct}%`, color: '#1b5e20', bg: '#e8f5e9' };
  if (sim >= 0.5) return { label: `${pct}%`, color: '#e65100', bg: '#fff3e0' };
  return { label: `${pct}%`, color: '#c62828', bg: '#ffebee' };
}

// ─── Component ────────────────────────────────────────────────────────────────
const ReidConfirmDialog: React.FC<ReidConfirmDialogProps> = ({
  visible,
  context,
  candidates,
  onSelect,
  onDismiss,
  allowNew = true,
  suggestText,
}) => {
  const L = LABELS[context];
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={styles.overlay}>
        <View style={[styles.dialog, { paddingBottom: Math.max(insets.bottom, 16) }]}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <View style={[styles.header, { borderBottomColor: NEUTRAL.border }]}>
            <View style={[styles.headerIconWrap, { backgroundColor: L.headerBg }]}>
              <Icon name={L.headerIcon} size={22} color={L.headerColor} />
            </View>
            <Text style={styles.title}>{L.title}</Text>
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Đóng hộp thoại"
              accessibilityRole="button"
            >
              <Icon name="close" size={20} color={NEUTRAL.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Phụ đề ─────────────────────────────────────────────────────── */}
          {candidates.length > 0 && (
            <Text style={styles.subtitle}>{L.subtitle(candidates.length)}</Text>
          )}

          {/* ── Gợi ý hành-động từ server (suggest) ────────────────────────── */}
          {suggestText ? (
            <View style={styles.suggestBox} accessible={true}>
              <Icon name="lightbulb-on-outline" size={16} color={NEUTRAL.warning} />
              <Text style={styles.suggestText}>{suggestText}</Text>
            </View>
          ) : null}

          {/* ── Danh sách candidates ────────────────────────────────────────── */}
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {candidates.length === 0 && (
              <View style={styles.emptyState} accessible={true}>
                <Icon name="help-circle-outline" size={40} color={NEUTRAL.textMuted} />
                <Text style={styles.emptyStateText}>
                  {allowNew
                    ? 'Không có cá thể gợi ý — chọn Mới để đăng ký.'
                    : 'Không có cá thể phù hợp. Chế độ này chỉ tái-định-danh, chưa thể đăng ký mới.'}
                </Text>
              </View>
            )}
            {candidates.map((candidate, index) => {
              const sim = candidate.sim;
              const simInfo = sim !== undefined ? simBadge(sim) : null;

              return (
                <TouchableOpacity
                  key={candidate.id}
                  style={styles.card}
                  onPress={() => onSelect(candidate.id)}
                  activeOpacity={0.7}
                  accessibilityLabel={`Chọn cá thể ${candidate.name || 'Không tên'}${candidate.sim !== undefined ? `, tương đồng ${Math.round(candidate.sim * 100)}%` : ''}`}
                  accessibilityRole="button"
                >
                  {/* Icon + số thứ tự */}
                  <View style={[styles.cardIcon, { backgroundColor: L.headerBg }]}>
                    <Icon name={L.candidateIcon} size={26} color={L.headerColor} />
                    <View style={[styles.indexBubble, { backgroundColor: L.headerColor }]}>
                      <Text style={styles.indexText}>{index + 1}</Text>
                    </View>
                  </View>

                  {/* Thông tin chính */}
                  <View style={styles.cardBody}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {candidate.name || 'Không tên'}
                    </Text>

                    {/* Code (cây) hoặc species (animal) */}
                    {(candidate.code != null || candidate.species != null) && (
                      <Text style={styles.candidateSub} numberOfLines={1}>
                        {L.codeLabel} {candidate.code ?? candidate.species}
                      </Text>
                    )}

                    {/* Số lượt ảnh */}
                    {candidate.n_views !== undefined && (
                      <Text style={styles.candidateSub}>
                        {candidate.n_views} ảnh đã lưu
                      </Text>
                    )}

                    {/* Badges: 3D, Neo, Gần đây */}
                    <View style={styles.badges}>
                      {candidate.has3d === true && (
                        <View
                          style={[styles.badge, styles.badge3D]}
                          accessible={true}
                          accessibilityLabel="Có dữ liệu 3D"
                        >
                          <Icon name="cube-outline" size={10} color="#fff" />
                          <Text style={styles.badgeText}>3D</Text>
                        </View>
                      )}
                      {candidate.anchor === 'confirmed' && (
                        <View
                          style={[styles.badge, styles.badgeAnchor]}
                          accessible={true}
                          accessibilityLabel="Đã neo blockchain"
                        >
                          <Icon name="link-variant" size={10} color="#fff" />
                          <Text style={styles.badgeText}>Neo</Text>
                        </View>
                      )}
                      {candidate.anchor === 'pending' && (
                        <View
                          style={[styles.badge, styles.badgeAnchorPending]}
                          accessible={true}
                          accessibilityLabel="Neo blockchain đang chờ xác nhận"
                        >
                          <Icon name="link-variant" size={10} color="#fff" />
                          <Text style={styles.badgeText}>Neo (chờ)</Text>
                        </View>
                      )}
                      {candidate.near_prev === true && (
                        <View
                          style={[styles.badge, styles.badgeNearby]}
                          accessible={true}
                          accessibilityLabel="Gần vị trí vừa quét"
                        >
                          <Icon name="map-marker" size={10} color="#fff" />
                          <Text style={styles.badgeText}>Gần đây</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Tương đồng + mũi tên */}
                  <View style={styles.cardRight}>
                    {simInfo !== null && (
                      <View style={[styles.simBadge, { backgroundColor: simInfo.bg }]}>
                        <Text style={[styles.simText, { color: simInfo.color }]}>
                          {simInfo.label}
                        </Text>
                      </View>
                    )}
                    <Icon name="chevron-right" size={20} color={NEUTRAL.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* ── Nút "Mới" — chỉ hiện khi server CHO PHÉP đăng-ký mới ─────── */}
            {allowNew && (
              <TouchableOpacity
                style={[styles.newBtn, { borderColor: L.headerColor }]}
                onPress={() => onSelect('new')}
                activeOpacity={0.7}
                accessibilityLabel={L.newTitle}
                accessibilityRole="button"
              >
                <Icon name={L.newButtonIcon} size={30} color={L.headerColor} />
                <View style={styles.newBtnBody}>
                  <Text style={[styles.newBtnTitle, { color: L.headerColor }]}>
                    {L.newTitle}
                  </Text>
                  <Text style={styles.newBtnSub}>{L.newSubtitle}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={L.headerColor} />
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* ── Nút Huỷ ────────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onDismiss}
            activeOpacity={0.7}
            accessibilityLabel="Huỷ, đóng hộp thoại"
            accessibilityRole="button"
          >
            <Text style={styles.cancelText}>Huỷ</Text>
          </TouchableOpacity>

        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: NEUTRAL.overlay,
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: NEUTRAL.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    // paddingBottom được tính động từ useSafeAreaInsets (Math.max(insets.bottom, 16))
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: NEUTRAL.text,
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 13,
    color: NEUTRAL.textSub,
    paddingHorizontal: 16,
    paddingVertical: 12,
    lineHeight: 19,
  },
  suggestBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: NEUTRAL.bgWarm,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  suggestText: {
    flex: 1,
    fontSize: 13,
    color: NEUTRAL.text,
    lineHeight: 18,
  },
  list: {
    maxHeight: 340,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NEUTRAL.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    gap: 10,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  indexBubble: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: 10,
    fontWeight: '700',
    color: NEUTRAL.white,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  candidateName: {
    fontSize: 15,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  candidateSub: {
    fontSize: 11,
    color: NEUTRAL.textMuted,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badge3D: {
    backgroundColor: '#7b1fa2',
  },
  badgeAnchor: {
    backgroundColor: '#1565c0',
  },
  badgeAnchorPending: {
    backgroundColor: '#5c6bc0',
  },
  badgeNearby: {
    backgroundColor: '#2e7d32',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: NEUTRAL.white,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  simBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  simText: {
    fontSize: 11,
    fontWeight: '700',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    gap: 10,
    marginTop: 2,
  },
  newBtnBody: {
    flex: 1,
  },
  newBtnTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  newBtnSub: {
    fontSize: 12,
    color: NEUTRAL.textMuted,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    fontSize: 16,
    color: NEUTRAL.textMuted,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default ReidConfirmDialog;
