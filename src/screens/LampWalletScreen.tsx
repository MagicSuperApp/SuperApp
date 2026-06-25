// screens/LampWalletScreen.tsx

import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    ScrollView,
    Animated,
    Alert,
    Linking,
    ActivityIndicator,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { selectChainWallet } from '../store/userSlice';
import { useAppDispatch } from '../store/hooks';
import { RootState } from '../store';
import { COLORS } from '../constants';

const LAMP_COLOR = '#F5A623';

// ── Balance Card ──────────────────────────────────────────────────────────────
const BalanceCard = ({
    lampBalance,
    isLoading,
}: {
    lampBalance: number | null | undefined;
    isLoading: boolean;
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(14)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View
            style={[
                styles.balanceCard,
                {
                    borderColor: `${LAMP_COLOR}25`,
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                },
            ]}
        >
            <View style={[styles.balanceIconWrap, { backgroundColor: `${LAMP_COLOR}12` }]}>
                <Icon name="gold" size={22} color={LAMP_COLOR} />
            </View>
            <Text style={styles.balanceLabel}>LAMP Token</Text>

            {isLoading ? (
                <ActivityIndicator
                    size="small"
                    color={LAMP_COLOR}
                    style={styles.balanceLoader}
                />
            ) : (
                <>
                    <Text style={[styles.balanceValue, { color: LAMP_COLOR }]}>
                        {lampBalance != null ? String(lampBalance) : '—'}
                    </Text>
                    <Text style={styles.balanceUnit}>LAMP</Text>
                </>
            )}
        </Animated.View>
    );
};

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <View style={styles.sectionCard}>{children}</View>
    </View>
);

// ── Main Screen ───────────────────────────────────────────────────────────────
const LampWalletScreen = () => {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    // dispatch được khai báo để sẵn sàng mở rộng (refresh balance,...); tránh lỗi unused nếu cần.
    const _dispatch = useAppDispatch();

    const chainWallet = useSelector(selectChainWallet);
    const isLoading = useSelector((state: RootState) => state.user.isLoading);

    const lampBalance = chainWallet?.lampBalance ?? null;

    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, []);

    const handleMint = () => {
        Alert.alert('Sắp ra mắt', 'Tính năng mint LAMP sẽ ra mắt sớm.');
    };

    const handleViewOnChain = () => {
        Linking.openURL('https://preview.cardanoscan.io').catch(() => {});
    };

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

            {/* Header */}
            <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Icon name="chevron-left" size={26} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Ví LAMP</Text>
                {/* placeholder để căn giữa tiêu đề */}
                <View style={styles.headerPlaceholder} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: Math.max(insets.bottom, 12) + 24 },
                ]}
            >
                {/* Section 1 — Balance card */}
                <Animated.View style={[styles.balanceSection, { opacity: fadeAnim }]}>
                    <BalanceCard lampBalance={lampBalance} isLoading={isLoading} />
                </Animated.View>

                {/* Section 2 — Action buttons */}
                <Animated.View style={[styles.actionRow, { opacity: fadeAnim }]}>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPrimary]}
                        onPress={handleMint}
                        activeOpacity={0.85}
                    >
                        <Icon name="plus-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.actionBtnPrimaryText}>Mint LAMP</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnOutline]}
                        onPress={handleViewOnChain}
                        activeOpacity={0.85}
                    >
                        <Icon name="open-in-new" size={18} color={LAMP_COLOR} />
                        <Text style={styles.actionBtnOutlineText}>Xem on-chain</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* Section 3 — Lịch sử (empty state) */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Section title="HOẠT ĐỘNG GẦN ĐÂY">
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconWrap}>
                                <Icon name="clock-outline" size={28} color={COLORS.textMuted} />
                            </View>
                            <Text style={styles.emptyText}>Chưa có giao dịch LAMP</Text>
                        </View>
                    </Section>
                </Animated.View>

                {/* Section 4 — MAGIC Rewards (coming soon) */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <View style={styles.sectionWrap}>
                        <View style={styles.sectionHeaderRow}>
                            <View style={[styles.sectionDot, { backgroundColor: '#8B5CF6' }]} />
                            <Text style={[styles.sectionTitle, { color: '#8B5CF6' }]}>MAGIC REWARDS</Text>
                        </View>
                        <View style={styles.rewardsCard}>
                            <View style={styles.rewardsIconWrap}>
                                <Icon name="star-four-points-outline" size={22} color="#8B5CF6" />
                            </View>
                            <View style={styles.rewardsBody}>
                                <Text style={styles.rewardsTitle}>MAGIC Rewards</Text>
                                <Text style={styles.rewardsDesc}>
                                    Tính năng rewards đang phát triển — sẽ ra mắt trong v2.1
                                </Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },

    // Header
    headerWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: COLORS.bg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backBtn: {
        width: 36,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 17,
        fontWeight: '700',
        color: COLORS.text,
        letterSpacing: -0.3,
    },
    headerPlaceholder: {
        width: 36,
    },

    // Scroll
    scrollContent: {
        paddingTop: 20,
    },

    // Balance card
    balanceSection: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    balanceCard: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        borderWidth: 1.5,
        padding: 22,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 14,
        elevation: 3,
        alignItems: 'flex-start',
    },
    balanceIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    balanceLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.textMuted,
        letterSpacing: 1.5,
        marginBottom: 8,
    },
    balanceLoader: {
        marginTop: 6,
        marginBottom: 2,
    },
    balanceValue: {
        fontSize: 36,
        fontWeight: '800',
        letterSpacing: -1,
        marginBottom: 2,
    },
    balanceUnit: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.textMuted,
        marginBottom: 8,
    },
    // Action buttons
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 13,
        borderRadius: 14,
    },
    actionBtnPrimary: {
        backgroundColor: LAMP_COLOR,
        shadowColor: LAMP_COLOR,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 4,
    },
    actionBtnPrimaryText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    actionBtnOutline: {
        borderWidth: 1.5,
        borderColor: LAMP_COLOR,
        backgroundColor: `${LAMP_COLOR}08`,
    },
    actionBtnOutlineText: {
        fontSize: 14,
        fontWeight: '700',
        color: LAMP_COLOR,
    },

    // Section
    sectionWrap: {
        marginHorizontal: 20,
        marginBottom: 16,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    sectionDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.accent,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.accent,
        letterSpacing: 2,
    },
    sectionCard: {
        backgroundColor: COLORS.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: COLORS.border,
        overflow: 'hidden',
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 2,
    },

    // Empty state
    emptyState: {
        alignItems: 'center',
        paddingVertical: 36,
        gap: 12,
    },
    emptyIconWrap: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: COLORS.bgWarm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: COLORS.textMuted,
        fontWeight: '500',
    },

    // Rewards card
    rewardsCard: {
        backgroundColor: '#F0EBFF',
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: '#8B5CF6',
        padding: 18,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    rewardsIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: 'rgba(139,92,246,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    rewardsBody: {
        flex: 1,
    },
    rewardsTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#6D28D9',
        marginBottom: 5,
    },
    rewardsDesc: {
        fontSize: 13,
        color: '#7C3AED',
        lineHeight: 19,
        opacity: 0.85,
    },
});

export default LampWalletScreen;
