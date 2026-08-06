// modules/trace/components/PaginationControls.tsx

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
// Icon: bộ Font Awesome Solid tải qua Iconify (assets/icons → icons.generated).
// Thêm icon mới: `node scripts/icons.js <tên-fa6-solid>`.
import Icon from '../../../components/Icon';
import { COLORS } from '../../../constants';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  startIndex,
  endIndex,
  totalItems,
  onPreviousPage,
  onNextPage,
}) => {
  const isFirst = currentPage === 1;
  const isLast  = currentPage === totalPages;

  const prevScale   = useRef(new Animated.Value(1)).current;
  const nextScale   = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(currentPage / totalPages)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: currentPage / totalPages,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentPage, totalPages]);

  const makePress = (scale: Animated.Value) => ({
    onPressIn:  () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true }).start(),
    onPressOut: () => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start(),
  });

  const progressWidth = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0%', '100%'],
  });

  const displayEnd = Math.min(endIndex, totalItems);

  // Build dot indicators — show max ~7 dots, collapse with ellipsis if needed
  const renderDots = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => {
        const p = i + 1;
        const isActive = p === currentPage;
        return (
          <View
            key={p}
            style={[styles.dot, isActive && styles.dotActive]}
          />
        );
      });
    }

    const items: React.ReactNode[] = [];
    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === currentPage;
      const near     = Math.abs(p - currentPage) <= 1;
      const isEdge   = p === 1 || p === totalPages;

      if (isEdge || near) {
        items.push(
          <View key={p} style={[styles.dot, isActive && styles.dotActive]} />
        );
      } else if (p === currentPage - 2 || p === currentPage + 2) {
        items.push(
          <Text key={`e${p}`} style={styles.ellipsis}>·</Text>
        );
      }
    }
    return items;
  };

  if (totalPages <= 1) return null;

  return (
    <View style={styles.wrapper}>

      {/* Info strip */}
      <View style={styles.infoRow}>
        <View style={styles.infoDot} />
        <Text style={styles.infoText}>
          {'Hiển thị '}
          <Text style={styles.infoVal}>{startIndex + 1}–{displayEnd}</Text>
          {' trong '}
          <Text style={styles.infoVal}>{totalItems}</Text>
          {' kết quả'}
        </Text>
        <View style={styles.pageChip}>
          <Text style={styles.pageChipText}>{currentPage}/{totalPages}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.btnRow}>

        <Animated.View style={{ transform: [{ scale: prevScale }] }}>
          <TouchableOpacity
            style={[styles.btn, isFirst && styles.btnDisabled]}
            onPress={onPreviousPage}
            disabled={isFirst}
            activeOpacity={1}
            {...makePress(prevScale)}
          >
            <Icon name="chevron-left" size={18} color={isFirst ? COLORS.textMuted : COLORS.accent} />
            <Text style={[styles.btnText, isFirst && styles.btnTextDisabled]}>Trước</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Dots */}
        <View style={styles.dotsRow}>
          {renderDots()}
        </View>

        <Animated.View style={{ transform: [{ scale: nextScale }] }}>
          <TouchableOpacity
            style={[styles.btn, isLast && styles.btnDisabled]}
            onPress={onNextPage}
            disabled={isLast}
            activeOpacity={1}
            {...makePress(nextScale)}
          >
            <Text style={[styles.btnText, isLast && styles.btnTextDisabled]}>Tiếp</Text>
            <Icon name="chevron-right" size={18} color={isLast ? COLORS.textMuted : COLORS.accent} />
          </TouchableOpacity>
        </Animated.View>

      </View>

      {/* Progress bar */}
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: progressWidth }]} />
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: COLORS.accent,
  },
  infoText: {
    flex: 1, fontSize: 12, color: COLORS.textMuted,
  },
  infoVal: {
    fontWeight: '700', color: COLORS.textSub,
  },
  pageChip: {
    backgroundColor: COLORS.accentGlow,
    borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pageChipText: {
    fontSize: 12, fontWeight: '700', color: COLORS.accent,
  },

  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 9,
  },
  btnDisabled: {
    backgroundColor: COLORS.bgWarm, opacity: 0.45,
  },
  btnText: {
    fontSize: 13, fontWeight: '600', color: COLORS.accent,
  },
  btnTextDisabled: {
    color: COLORS.textMuted,
  },

  dotsRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, flex: 1, justifyContent: 'center',
  },
  dot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 22, height: 7, borderRadius: 3.5,
    backgroundColor: COLORS.accent,
  },
  ellipsis: {
    fontSize: 13, color: COLORS.textMuted, lineHeight: 16,
  },

  track: {
    height: 3, backgroundColor: COLORS.border,
  },
  fill: {
    height: '100%', backgroundColor: COLORS.accent,
    borderTopRightRadius: 2, borderBottomRightRadius: 2,
  },
});

export default PaginationControls;
