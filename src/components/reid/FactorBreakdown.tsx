/**
 * FactorBreakdown — Biểu đồ thanh phân tích 4 tín hiệu nhận diện cây.
 *
 * CHỈ dùng cho TreeReID (animal không có tính năng này).
 * Không dùng thư viện chart — dùng View với width tỉ lệ % thuần túy.
 *
 * Ngưỡng màu:
 *  ≥ 0.7  → xanh lá (tốt)
 *  ≥ 0.5  → vàng    (tạm)
 *  < 0.5  → đỏ      (yếu, hiện cảnh báo)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL } from '../../shared/theme';

// ─── Kiểu dữ liệu ─────────────────────────────────────────────────────────────
export interface FactorScores {
  CTX:   number; // bối cảnh không gian (GPS + bản đồ cây lân cận)
  PLANT: number; // đặc trưng tổng thể thân cây
  BASE:  number; // gốc + vỏ (ổn định theo thời gian)
  LEAF:  number; // tán lá (biến đổi theo mùa)
}

interface FactorBreakdownProps {
  factors: FactorScores | null;
  visible: boolean;
}

// ─── Cấu hình hiển thị từng factor ────────────────────────────────────────────
interface FactorMeta {
  key: keyof FactorScores;
  label: string;
  icon: string;
  note: string; // ghi chú ngắn cho người dùng
}

const FACTOR_META: FactorMeta[] = [
  { key: 'CTX',   label: 'Bối cảnh',  icon: 'map-marker-radius',  note: 'Vị trí GPS' },
  { key: 'PLANT', label: 'Cây',       icon: 'tree',                note: 'Thân toàn bộ' },
  { key: 'BASE',  label: 'Gốc',       icon: 'texture-box',         note: 'Gốc + vỏ' },
  { key: 'LEAF',  label: 'Tán lá',    icon: 'leaf',                note: 'Tán + lá' },
];

// ─── Hàm phụ trợ ──────────────────────────────────────────────────────────────
function barColor(score: number): string {
  if (score >= 0.7) return '#1b5e20';
  if (score >= 0.5) return '#f9a825';
  return '#c62828';
}

function barBg(score: number): string {
  if (score >= 0.7) return '#e8f5e9';
  if (score >= 0.5) return '#fff8e1';
  return '#ffebee';
}

const FactorBreakdown: React.FC<FactorBreakdownProps> = ({ factors, visible }) => {
  if (!visible || !factors) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Phân tích tín hiệu</Text>

      {FACTOR_META.map(({ key, label, icon, note }) => {
        const score = factors[key];
        const pct = Math.round(score * 100);
        const color = barColor(score);
        const bg = barBg(score);
        const isWeak = score < 0.5;

        return (
          <View key={key} style={styles.row}>
            {/* Nhãn factor */}
            <View style={styles.labelCol}>
              <Icon name={icon} size={14} color={color} style={styles.labelIcon} />
              <View>
                <Text style={styles.labelText}>{label}</Text>
                <Text style={styles.noteText}>{note}</Text>
              </View>
            </View>

            {/* Thanh bar */}
            <View style={styles.barCol}>
              <View style={[styles.barTrack, { backgroundColor: bg }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${pct}%` as `${number}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Phần trăm + cảnh báo */}
            <View style={styles.pctCol}>
              <Text style={[styles.pctText, { color }]}>{pct}%</Text>
              {isWeak && (
                <Icon
                  name="alert"
                  size={13}
                  color="#c62828"
                  style={styles.alertIcon}
                />
              )}
            </View>
          </View>
        );
      })}

      {/* Chú thích ngưỡng */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#1b5e20' }]} />
          <Text style={styles.legendText}>≥70% tốt</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f9a825' }]} />
          <Text style={styles.legendText}>50–69% tạm</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#c62828' }]} />
          <Text style={styles.legendText}>{'<50% yếu'}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: NEUTRAL.text,
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  labelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 88,
  },
  labelIcon: {
    marginRight: 5,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '600',
    color: NEUTRAL.text,
  },
  noteText: {
    fontSize: 10,
    color: NEUTRAL.textMuted,
    marginTop: 1,
  },
  barCol: {
    flex: 1,
    marginHorizontal: 8,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    // width được set inline theo tỉ lệ %
  },
  pctCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
    justifyContent: 'flex-end',
  },
  pctText: {
    fontSize: 12,
    fontWeight: '700',
  },
  alertIcon: {
    marginLeft: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: NEUTRAL.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: NEUTRAL.textMuted,
  },
});

export default FactorBreakdown;
