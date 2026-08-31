/**
 * FeeDisplay — Component hiển thị phí tác vụ (LAMP + ADA) cho người dùng.
 *
 * Nhận feeQuote từ identify response (tree hoặc animal).
 * Mặc định thu gọn, bấm để mở chi tiết 3 bucket treasury.
 * Trả về null khi feeQuote không tồn tại — caller không cần guard thêm.
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import {NEUTRAL} from '../shared/theme';
// Tệp này có một hằng `COLORS` cục bộ (bảng màu riêng của khối phí), nên token
// toàn cục vào dưới tên khác — trùng tên là `tsc` đỏ ngay, không âm thầm.
import { COLORS as APP_COLORS } from '../theme';
import {tf, useT} from '../i18n';
import type {FeeQuote} from '../types/fee';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Khai tập trung ở types/fee.ts; re-export để FeeDisplay.test.tsx + caller cũ vẫn import được.
export type {FeeQuote};

interface Props {
  feeQuote: FeeQuote | null | undefined;
  style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLamp(n: number): string {
  if (n === 0) return '0';
  if (n < 0.01) return n.toFixed(4);
  if (n < 1) return n.toFixed(3);
  return n.toFixed(2);
}

function formatAda(n: number): string {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeeDisplay({feeQuote, style}: Props): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  // Hook PHẢI gọi trước nhánh `return null` bên dưới — thứ tự hook không được đổi
  // giữa các lần vẽ.
  const t = useT();

  if (!feeQuote) {
    return null;
  }

  const toggleExpanded = () => {
    setExpanded(prev => !prev);
  };

  // accessibilityLabel KHÔNG đi qua lớp autoText (chỉ <Text>/placeholder mới qua),
  // và chuỗi dựng bằng template literal thì không bao giờ khớp khoá từ điển — nên
  // phải dựng bằng `tf()` với chỗ thay.
  return (
    <TouchableOpacity
      onPress={toggleExpanded}
      style={[styles.container, style]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={tf('Phí tác vụ: {fee}. Nhấn để {action}.', {
        fee: feeQuote.display_vn,
        action: t(expanded ? 'thu gọn' : 'xem chi tiết'),
      })}
      accessibilityHint={expanded ? 'Thu gọn chi tiết phí' : 'Mở rộng để xem phân bổ phí theo bucket'}
    >
      {/* Hàng tóm tắt */}
      <View style={styles.summaryRow}>
        <View style={styles.labelWrapper}>
          <View style={styles.coinDot} accessibilityElementsHidden />
          <Text style={styles.labelText}>Phí</Text>
        </View>

        <Text style={styles.amountText} numberOfLines={1} adjustsFontSizeToFit>
          {feeQuote.display_vn}
        </Text>

        <Text style={styles.chevron} accessibilityElementsHidden>
          {expanded ? '▲' : '▼'}
        </Text>
      </View>

      {/* Chi tiết 3 bucket */}
      {expanded && (
        <View style={styles.detailPanel}>
          <View style={styles.divider} />

          <DetailRow
            icon="ADA"
            iconBg={COLORS.adaBg}
            iconColor={COLORS.adaText}
            label="Cardano Treasury"
            value={`${formatAda(feeQuote.fee_ada)} ADA`}
          />

          <DetailRow
            icon="ML"
            iconBg={COLORS.mlBg}
            iconColor={COLORS.mlText}
            label="MagicLamp Treasury"
            value={`${formatLamp(feeQuote.lamp_magiclamp)} LAMP`}
          />

          <DetailRow
            icon="OL"
            iconBg={COLORS.olBg}
            iconColor={COLORS.olText}
            label="Quỹ hệ thống"
            value={`${formatLamp(feeQuote.lamp_orilife)} LAMP`}
          />

          {/* Hệ số cầu — chỉ hiện khi > 1 */}
          {feeQuote.demand_factor > 1 && (
            <View style={styles.demandRow}>
              <Text style={styles.demandText}>
                Hệ số cầu: ×{feeQuote.demand_factor.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Sub-component DetailRow
// ---------------------------------------------------------------------------

interface DetailRowProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}

function DetailRow({icon, iconBg, iconColor, label, value}: DetailRowProps) {
  return (
    <View style={styles.detailRow} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.iconBadge, {backgroundColor: iconBg}]}>
        <Text style={[styles.iconText, {color: iconColor}]}>{icon}</Text>
      </View>
      <Text style={styles.detailLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const COLORS = {
  containerBg:  '#F5F8FF',
  containerBorder: '#D6E4F7',
  labelColor:   NEUTRAL.textSub,
  amountColor:  NEUTRAL.text,
  chevronColor: NEUTRAL.textMuted,
  dividerColor: NEUTRAL.border,
  demandBg:     '#FFF8E7',
  demandText:   '#B07D2F',

  adaBg:   '#EBF1FB',
  adaText: APP_COLORS.accentDeep,

  mlBg:   '#F3EBF9',
  mlText: '#6B21A8',

  olBg:   '#E8F5EF',
  olText: '#1B5E20',
} as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.containerBg,
    borderWidth: 1,
    borderColor: COLORS.containerBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    // Hoạt động tốt trên thiết bị yếu — không dùng shadow phức
    overflow: 'hidden',
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  labelWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  coinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: APP_COLORS.accent,
  },

  labelText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.labelColor,
  },

  amountText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.amountColor,
    textAlign: 'right',
    marginRight: 4,
  },

  chevron: {
    fontSize: 10,
    color: COLORS.chevronColor,
    width: 14,
    textAlign: 'center',
  },

  // Panel chi tiết
  detailPanel: {
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.dividerColor,
    marginVertical: 10,
    marginHorizontal: -14,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },

  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  detailLabel: {
    flex: 1,
    fontSize: 13,
    color: NEUTRAL.textSub,
  },

  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: NEUTRAL.text,
    textAlign: 'right',
  },

  // Hệ số cầu
  demandRow: {
    marginTop: 8,
    backgroundColor: COLORS.demandBg,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },

  demandText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.demandText,
  },
});
