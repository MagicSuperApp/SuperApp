/**
 * ResultBadge — Hiển thị kết quả nhận diện dạng badge màu.
 *
 * Dùng chung cho cả TreeReID (context='tree') và AnimalReID (context='animal').
 * Màu sắc quyết định bởi decision, nhãn văn bản phụ thuộc context.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL } from '../../shared/theme';

// ─── Bảng màu quyết định ──────────────────────────────────────────────────────
const DECISION_COLORS: Record<string, string> = {
  MATCH:        '#1b5e20',
  UNCERTAIN:    '#f9a825',
  NO_MATCH:     '#c62828',
  EMPTY_BUCKET: '#607d8b',
  EMPTY_FARM:   '#607d8b',
  MOVED:        '#1565c0',
};

// ─── Nhãn văn bản theo context ────────────────────────────────────────────────
// TreeDecision: MATCH | UNCERTAIN | NO_MATCH | EMPTY_BUCKET | MOVED
const TREE_LABELS: Record<string, string> = {
  MATCH:        '✓ KHỚP',
  UNCERTAIN:    '? CHƯA CHẮC',
  NO_MATCH:     '✗ CHƯA NHẬN RA',
  EMPTY_BUCKET: '• CHƯA CÓ CÂY GẦN ĐÂY',
  MOVED:        '➜ CÂY ĐÃ DỜI?',
};

// AnimalDecision: MATCH | UNCERTAIN | NO_MATCH | EMPTY_FARM | MOVED
const ANIMAL_LABELS: Record<string, string> = {
  MATCH:        '✓ NHẬN RA',
  UNCERTAIN:    '? CHƯA CHẮC',
  NO_MATCH:     '✗ CHƯA NHẬN RA',
  EMPTY_FARM:   '• TRẠI CHƯA CÓ CÁ THỂ',
  MOVED:        '➜ ĐÃ DI CHUYỂN?',
};

// ─── Icon theo decision ───────────────────────────────────────────────────────
const DECISION_ICONS: Record<string, string> = {
  MATCH:        'check-circle',
  UNCERTAIN:    'help-circle',
  NO_MATCH:     'close-circle',
  EMPTY_BUCKET: 'circle-outline',
  EMPTY_FARM:   'circle-outline',
  MOVED:        'map-marker-right',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface ResultBadgeProps {
  decision: string;
  context: 'tree' | 'animal';
  /** Dòng phụ bên dưới: tên cây/con, khoảng cách di chuyển, v.v. */
  extra?: string;
}

const ResultBadge: React.FC<ResultBadgeProps> = ({ decision, context, extra }) => {
  const color = DECISION_COLORS[decision] ?? NEUTRAL.textMuted;
  const label =
    context === 'tree'
      ? TREE_LABELS[decision] ?? decision
      : ANIMAL_LABELS[decision] ?? decision;
  const iconName = DECISION_ICONS[decision] ?? 'information';

  return (
    <View style={styles.wrapper}>
      {/* Badge chính */}
      <View style={[styles.badge, { backgroundColor: color + '1A', borderColor: color }]}>
        <Icon name={iconName} size={16} color={color} style={styles.icon} />
        <Text style={[styles.label, { color }]}>{label}</Text>
      </View>

      {/* Dòng extra (tên cây/con, khoảng cách...) */}
      {!!extra && (
        <Text style={styles.extra} numberOfLines={2}>
          {extra}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-start',
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  icon: {
    marginRight: 5,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  extra: {
    fontSize: 12,
    color: NEUTRAL.textSub,
    marginLeft: 4,
    lineHeight: 17,
  },
});

export default ResultBadge;
