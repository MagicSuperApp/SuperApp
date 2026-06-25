// components/LampBalanceCard.tsx
//
// Hiển thị số dư LAMP token theo 2 chế độ:
//   compact=false (mặc định) — card đầy đủ với nút Mint + Lịch sử
//   compact=true             — chip nhỏ tappable (dẫn sang Lịch sử)

import React, { useEffect, useRef } from 'react';
import {
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// ── Hằng màu LAMP ─────────────────────────────────────────────────────────────
const LAMP_GOLD       = '#F5A623';
const LAMP_GOLD_LIGHT = '#FDF3DC';
const LAMP_GOLD_DARK  = '#C47F0D';


// ── Props ──────────────────────────────────────────────────────────────────────
interface LampBalanceCardProps {
    lampBalance: number | null;
    adaBalance?: number | null;
    onMintPress: () => void;
    onHistoryPress: () => void;
    compact?: boolean; // true = chip nhỏ; false (mặc định) = card đầy đủ
}

// ── Helper: định dạng số ──────────────────────────────────────────────────────
function formatLamp(value: number): string {
    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toLocaleString();
}

// ── Component ─────────────────────────────────────────────────────────────────
const LampBalanceCard: React.FC<LampBalanceCardProps> = ({
    lampBalance,
    onMintPress,
    onHistoryPress,
    compact = false,
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    // ── Chip nhỏ (compact) ────────────────────────────────────────────────────
    if (compact) {
        return (
            <Animated.View style={{ opacity: fadeAnim }}>
                <TouchableOpacity
                    style={styles.chip}
                    onPress={onHistoryPress}
                    activeOpacity={0.75}
                >
                    <Icon name="lightning-bolt" size={14} color={LAMP_GOLD} />
                    <Text style={styles.chipBalance}>
                        {lampBalance !== null ? formatLamp(lampBalance) : '—'}
                    </Text>
                    <Text style={styles.chipUnit}>LAMP</Text>
                    <Icon name="chevron-right" size={16} color={LAMP_GOLD_DARK} />
                </TouchableOpacity>
            </Animated.View>
        );
    }

    // ── Card đầy đủ ───────────────────────────────────────────────────────────
    return (
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
            {/* ── Row trên: icon + label + badge ── */}
            <View style={styles.headerRow}>
                <View style={styles.iconWrap}>
                    <Icon name="lightning-bolt" size={20} color={LAMP_GOLD} />
                </View>
                <Text style={styles.tokenLabel}>LAMP Token</Text>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>Cardano</Text>
                </View>
            </View>

            {/* ── Số dư lớn ── */}
            <Text style={styles.balanceValue}>
                {lampBalance !== null ? formatLamp(lampBalance) : '—'}
            </Text>

            {/* ── Divider ── */}
            <View style={styles.divider} />

            {/* ── 2 nút hành động ── */}
            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={styles.btnFilled}
                    onPress={onMintPress}
                    activeOpacity={0.82}
                >
                    <Icon name="plus-circle-outline" size={16} color="#fff" />
                    <Text style={styles.btnFilledText}>Mint LAMP</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.btnOutline}
                    onPress={onHistoryPress}
                    activeOpacity={0.82}
                >
                    <Icon name="history" size={16} color={LAMP_GOLD} />
                    <Text style={styles.btnOutlineText}>Lịch sử</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    // Card đầy đủ
    card: {
        borderWidth: 1.5,
        borderColor: `${LAMP_GOLD}40`,
        borderRadius: 16,
        padding: 16,
        backgroundColor: LAMP_GOLD_LIGHT,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    iconWrap: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: `${LAMP_GOLD}18`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tokenLabel: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: LAMP_GOLD_DARK,
    },
    badge: {
        backgroundColor: `${LAMP_GOLD}22`,
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: `${LAMP_GOLD}55`,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: LAMP_GOLD_DARK,
        letterSpacing: 0.5,
    },
    balanceValue: {
        fontSize: 32,
        fontWeight: '800',
        color: LAMP_GOLD,
        letterSpacing: -0.5,
        marginBottom: 4,
    },
    divider: {
        height: 1,
        backgroundColor: `${LAMP_GOLD}30`,
        marginBottom: 14,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    btnFilled: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: LAMP_GOLD,
        borderRadius: 10,
        paddingVertical: 11,
    },
    btnFilledText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    btnOutline: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1.5,
        borderColor: LAMP_GOLD,
        borderRadius: 10,
        paddingVertical: 11,
    },
    btnOutlineText: {
        color: LAMP_GOLD,
        fontSize: 14,
        fontWeight: '700',
    },

    // Chip compact
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        backgroundColor: LAMP_GOLD_LIGHT,
        borderWidth: 1,
        borderColor: `${LAMP_GOLD}55`,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipBalance: {
        fontSize: 14,
        fontWeight: '800',
        color: LAMP_GOLD,
    },
    chipUnit: {
        fontSize: 12,
        fontWeight: '600',
        color: LAMP_GOLD_DARK,
    },
});

export default LampBalanceCard;
