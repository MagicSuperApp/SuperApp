// screens/AccountScreen.tsx

import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    ScrollView,
    Animated,
    Dimensions,
    Platform,
    Alert,
    Modal,
    Linking,
    RefreshControl,
} from 'react-native';
// RN 0.84 đã gỡ Clipboard khỏi core → dùng package cộng đồng (API setString giữ nguyên).
import Clipboard from '@react-native-clipboard/clipboard';
import {
    logoutUser,
    selectChainWallet,
    selectChainWallets,
    refreshWallet,
    resolveNetwork,
    refreshControllerPkh,
} from '../store/userSlice';
import type { WalletEntry } from '../services/phoenixKey-api';
import { setChatbotEnabled } from '../store/chatbotSlice';
import { useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootState } from '../store';
import { useAppDispatch } from '../store/hooks';
import { useCoachMark } from '../onboarding/CoachMarkContext';
import { resetTutorial } from '../utils/tutorialStorage';
import { COLORS } from '../constants';
import StateView from '../components/state/StateView';
import { showInfo, showWarning } from '../utils/alert';
import { checkDeviceKeyRisk, isRiskSnoozed, snoozeRisk } from '../services/deviceKeyRisk';
import { useNavigation } from '@react-navigation/native';
import { getVersion, getBuildNumber } from 'react-native-device-info';
// Debug host = backend field-reid THẬT app đang dùng (ORILIFE_BASE), không phải
// aladin-api (backend Lợi deprecated) — để field soi đúng server (Lỗi field #5).
import { ORILIFE_BASE } from '../services/orilifeBase';
import { fmtLamp, fmtCarp, fmtLampWhole, lampWholeToOildrop } from '../utils/token';
import { getVaultStatus, WAKEME_CLAIM_READY } from '../services/wakemeService';
import type { VaultStatusResponse } from '../services/phoenixKey-api';
import taad from '../sdk/taadEnclave';
import { getStoredMasterKek } from '../services/masterKekStore';
import { ownerPublicKey } from '../sdk/phoenixKey';
import LanguagePickerModal from '../components/LanguagePickerModal';
import { LANGUAGES, useLanguage } from '../i18n';
import { BUILD_COMMIT, BUILD_BRANCH, BUILD_ID } from '@env';

// 0 = preprod (testnet), khớp WALLET_NETWORK bên register + PhoenixWalletScreen.
import { CARDANO_NETWORK as WALLET_NETWORK } from '../config/cardanoNetwork';

// Version THẬT đọc từ bundle (CFBundleShortVersionString / versionName + build number).
// Thay chuỗi hard-code "Aladin v1.0.0" (Lỗi field #4) — để field biết đúng build đang chạy.
const APP_VERSION_BASE = `Aladin v${getVersion()} (${getBuildNumber()})`;

// Mã commit đã dựng ra bản này. VÌ SAO cần: số build ("86") do App Store Connect cấp
// và tăng dần theo mỗi lần nộp, KHÔNG chỉ về commit nào; hơn nữa `main` và `develop`
// cùng đẩy lên một luồng TestFlight nên hai nhánh khác nhau vẫn ra số liền nhau. Kết
// quả: người thử báo lỗi kèm "2.0 (86)" mà không ai truy được bản đó gồm những vá nào.
// CI ghi BUILD_COMMIT vào bundle (codemagic.yaml, .github/actions/rn-env). Build tay ở
// máy lập trình viên thì biến trống → giấu hẳn, KHÔNG in "()" rỗng hay chữ "unknown".
const COMMIT_SHORT = (BUILD_COMMIT ?? '').trim().slice(0, 7);
const APP_VERSION_LABEL = COMMIT_SHORT
    ? `${APP_VERSION_BASE} · ${COMMIT_SHORT}`
    : APP_VERSION_BASE;

// Chi tiết debug (tap version 5 lần): version + server API đang trỏ → field tự soi
// máy có chạy đúng build + đúng server không (chẩn đoán 404 farm — Lỗi field #5).
const BUILD_TRACE_LINES = [
    COMMIT_SHORT ? `Commit: ${COMMIT_SHORT}` : 'Commit: (bản dựng tay, CI không ghi)',
    (BUILD_BRANCH ?? '').trim() ? `Nhánh: ${BUILD_BRANCH.trim()}` : null,
    (BUILD_ID ?? '').trim() ? `Mã lượt dựng: ${BUILD_ID.trim()}` : null,
].filter(Boolean).join('\n');

const APP_DEBUG_INFO = `${APP_VERSION_BASE}\n\n${BUILD_TRACE_LINES}\n\nMáy chủ: ${ORILIFE_BASE}\nNền: ${Platform.OS}`;
import { Switch } from 'react-native';
const { width } = Dimensions.get('window');

// ── Token Balance Card ────────────────────────────────────────────────────────
const TokenCard = ({
    icon, label, value, unit, color, desc, index, onPress,
}: {
    icon: string; label: string; value: any;
    unit: string; color: string; desc: string; index: number;
    /** Có `onPress` thì thẻ bấm được — kèm dấu chevron để người dùng BIẾT là bấm được. */
    onPress?: () => void;
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(12)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: index * 80, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: index * 80, useNativeDriver: true }),
        ]).start();
    }, []);

    const body = (
        <Animated.View style={[
            styles.tokenCard,
            { borderColor: `${color}25`, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}>
            <View style={[styles.tokenIconWrap, { backgroundColor: `${color}12` }]}>
                <Icon name={icon} size={20} color={color} />
            </View>
            <Text style={styles.tokenLabel}>{label}</Text>
            <Text style={[styles.tokenValue, { color }]}>{value ?? '—'}</Text>
            <Text style={styles.tokenUnit}>{unit}</Text>
            <Text style={styles.tokenDesc}>{desc}</Text>
        </Animated.View>
    );

    if (!onPress) return body;
    return (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
            {body}
            <View style={styles.tokenTapHint}>
                <Icon name="chevron-right" size={16} color={color} />
            </View>
        </TouchableOpacity>
    );
};

// ── Cardano network + Explorer ────────────────────────────────────────────────
// Giữ preprod/preview TÁCH RIÊNG tới tận URL: địa-chỉ preprod tra trên preview.cardanoscan.io
// sẽ KHÔNG thấy (và ngược lại) — gộp chung 'testnet' là sai mạng.
type NetKind = 'mainnet' | 'preprod' | 'preview' | null;

// Chuẩn hoá mạng. Nguồn ưu tiên: resolveNetwork (theo DID thật, đã cắt 'cardano:').
function normNetwork(net: string | null): NetKind {
    if (net === 'mainnet') return 'mainnet';
    if (net === 'preprod') return 'preprod';
    if (net === 'preview') return 'preview';
    return null;
}

// Suy mạng TỪ ĐỊA-CHỈ VÍ THẬT khi chưa resolve được. addr1 = Mainnet; addr_test KHÔNG phân biệt
// được preprod/preview qua tiền tố → mặc định preprod (mạng test chuẩn của dự án, TESTNET-PLAN).
function netFromAddress(addr?: string | null): NetKind {
    if (!addr) return null;
    if (addr.startsWith('addr_test') || addr.startsWith('stake_test')) return 'preprod';
    if (addr.startsWith('addr1') || addr.startsWith('stake1')) return 'mainnet';
    return null;
}

function networkLabel(net: NetKind, resolving?: boolean, unknown?: boolean): string {
    if (net === 'mainnet') return 'Cardano Mainnet';
    if (net === 'preprod') return 'Cardano Preprod (Testnet)';
    if (net === 'preview') return 'Cardano Preview (Testnet)';
    // Ba trạng thái "chưa biết" KHÔNG được nói giống nhau.
    //
    // Cũ: cả ba đều in "Đang xác định" (bản tiếng Anh: "Detecting"). Chữ đó hứa có
    // một lượt dò đang chạy. Nhưng lượt gọi chỉ chạy ĐÚNG MỘT LẦN lúc vào khu đã
    // đăng nhập; hỏng một lần là hỏng vĩnh viễn, và màn hình vẫn "Detecting" mãi.
    // Người dùng ngồi chờ một thứ không bao giờ tới, và không có nút nào để cứu.
    if (resolving) return 'Đang kiểm tra…';
    if (unknown) return 'Chưa kiểm được — kéo xuống để thử lại';
    return 'Chưa kiểm';
}

// Tiền tố subdomain explorer theo từng mạng (mainnet = không tiền tố).
function explorerSub(net: 'mainnet' | 'preprod' | 'preview'): string {
    return net === 'mainnet' ? '' : `${net}.`;
}

// Trình Explorer hỗ trợ tra ĐỊA-CHỈ (Cardanoscan mặc định). Pooltool chỉ tra pool nên không liệt kê.
const EXPLORERS: { name: string; url: (addr: string, sub: string) => string }[] = [
    { name: 'Cardanoscan', url: (a, s) => `https://${s}cardanoscan.io/address/${a}` },
    { name: 'Cexplorer', url: (a, s) => `https://${s}cexplorer.io/address/${a}` },
    { name: 'AdaStat', url: (a, s) => `https://${s}adastat.net/addresses/${a}` },
];

// Nút mở Explorer + Modal chọn (Android Alert chỉ cho 3 nút nên KHÔNG dùng Alert nhiều lựa chọn).
const ExplorerButton = ({ address, net }: { address: string; net: 'mainnet' | 'preprod' | 'preview' }) => {
    const [open, setOpen] = useState(false);
    const sub = explorerSub(net);
    return (
        <>
            <TouchableOpacity onPress={() => setOpen(true)} style={styles.copyBtn}>
                <Icon name="open-in-new" size={14} color={COLORS.accentLight} />
            </TouchableOpacity>
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <TouchableOpacity style={styles.explorerBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
                    <View style={styles.explorerSheet}>
                        <Text style={styles.explorerTitle}>Xem địa chỉ trên trình duyệt chuỗi</Text>
                        {EXPLORERS.map((e) => (
                            <TouchableOpacity
                                key={e.name}
                                style={styles.explorerItem}
                                onPress={() => {
                                    setOpen(false);
                                    Linking.openURL(e.url(address, sub)).catch(() => {});
                                }}
                            >
                                <Icon name="open-in-new" size={16} color={COLORS.accent} />
                                <Text style={styles.explorerItemText}>{e.name}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={styles.explorerCancel} onPress={() => setOpen(false)}>
                            <Text style={styles.explorerCancelText}>Huỷ</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </>
    );
};

// ── Info Row ──────────────────────────────────────────────────────────────────
const InfoRow = ({
    icon, label, value, copyable, mono, last, explorerNet,
}: {
    icon: string; label: string; value: string;
    copyable?: boolean; mono?: boolean; last?: boolean;
    explorerNet?: NetKind;
}) => {
    const [copied, setCopied] = useState(false);

    // Copy THẬT vào clipboard (trước đây chỉ đổi icon, nông dân bấm không sao chép được).
    const handleCopy = () => {
        if (value) Clipboard.setString(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
            <View style={styles.infoRowLeft}>
                <Icon name={icon} size={15} color={COLORS.accentLight} />
                <Text style={styles.infoLabel}>{label}</Text>
            </View>
            <View style={styles.infoRowRight}>
                <Text
                    style={[styles.infoValue, mono && styles.infoValueMono]}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                >
                    {value || '—'}
                </Text>
                {!!value && explorerNet && <ExplorerButton address={value} net={explorerNet} />}
                {copyable && (
                    <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
                        <Icon
                            name={copied ? 'check-circle-outline' : 'content-copy'}
                            size={14}
                            color={copied ? COLORS.success : COLORS.textMuted}
                        />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

// ── Khối MỘT ví (PhoenixKey API.md §7 trả 2 loại) ─────────────────────────────
// `standard` = CIP-1852, khoá do CHÍNH user giữ (derive từ cụm 24 từ) → user tự chuyển tiền.
// `phoenix`  = ví custody hệ-thống derive theo DID (script) → dùng cho MAGIC/kích-hoạt.
// Hiện TÁCH BẠCH vì 2 ví có địa-chỉ + số dư RIÊNG; gộp làm một sẽ giấu mất tài sản.
const WALLET_META: Record<'phoenix' | 'standard', {
    title: string; sub: string; icon: string; color: string;
}> = {
    standard: {
        title: 'Ví cơ bản',
        sub: 'Bạn tự giữ khoá (từ cụm 24 từ)',
        icon: 'wallet-outline',
        color: COLORS.accent,
    },
    phoenix: {
        title: 'Ví Phượng Hoàng',
        sub: 'Hệ thống giữ hộ — gắn với danh tính của bạn',
        icon: 'shield-star-outline',
        color: '#B07D2F',
    },
};

const WalletBlock = ({ entry }: { entry: WalletEntry }) => {
    const meta = WALLET_META[entry.kind] ?? WALLET_META.standard;
    // Ưu tiên địa-chỉ đang HOẠT-ĐỘNG (account N sau khi xoay), else account-0 cố-định.
    const addr = entry.addresses?.active ?? entry.addresses?.fixed ?? '';
    // Mạng suy theo CHÍNH địa-chỉ này (mỗi ví tự xác định, không dùng chung).
    const net = netFromAddress(addr);
    const b = entry.balances ?? { lovelace: 0, lamp: 0, carp: 0 };
    const ada = (b.lovelace ?? 0) / 1_000_000;

    return (
        <View style={styles.walletBlock}>
            <View style={styles.walletBlockHead}>
                <View style={[styles.walletBlockIcon, { backgroundColor: `${meta.color}14` }]}>
                    <Icon name={meta.icon} size={16} color={meta.color} />
                </View>
                <View style={styles.walletBlockHeadBody}>
                    <Text style={[styles.walletBlockTitle, { color: meta.color }]}>{meta.title}</Text>
                    <Text style={styles.walletBlockSub}>{meta.sub}</Text>
                </View>
            </View>

            <InfoRow
                icon="map-marker-outline"
                label="Địa chỉ"
                value={addr}
                copyable
                mono
                explorerNet={addr ? net : null}
            />

            <View style={styles.walletBalRow}>
                <Text style={styles.walletBalItem}>{ada} <Text style={styles.walletBalUnit}>ADA</Text></Text>
                <Text style={styles.walletBalDot}>·</Text>
                <Text style={styles.walletBalItem}>{fmtLamp(b.lamp ?? 0)} <Text style={styles.walletBalUnit}>LAMP</Text></Text>
                <Text style={styles.walletBalDot}>·</Text>
                <Text style={styles.walletBalItem}>{fmtCarp(b.carp)} <Text style={styles.walletBalUnit}>CARP</Text></Text>
            </View>
        </View>
    );
};

// ── Menu Item ─────────────────────────────────────────────────────────────────
const MenuItem = ({
    icon, label, sublabel, color, onPress, showArrow = true, last, badge, trailing,
}: {
    icon: string; label: string; sublabel?: string;
    color?: string; onPress?: () => void;
    showArrow?: boolean; last?: boolean;
    badge?: number;
    trailing?: React.ReactNode;
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const ic = color ?? COLORS.accent;

    // Mục CHƯA có đích đến thì phải TRÔNG như chưa có đích đến.
    //
    // Trước đây mục thiếu `onPress` vẫn vẽ mũi tên ">" và vẫn chạy hoạt ảnh co lại khi
    // chạm — người dùng nhận được phản hồi vật lý đầy đủ rồi không có gì mở ra. Đó
    // không đọc ra là "tính năng chưa làm", nó đọc ra là "app hỏng", và người dùng sẽ
    // chạm lại vài lần nữa để chắc. Nay: không mũi tên, không hoạt ảnh, không bắt chạm,
    // chữ mờ đi — và trình đọc màn hình cũng báo là đang tắt.
    const inert = !onPress;

    return (
        <TouchableOpacity
            activeOpacity={1}
            onPress={onPress}
            disabled={inert}
            accessibilityState={{ disabled: inert }}
            onPressIn={() => { if (!inert) Animated.spring(scaleAnim, { toValue: 0.985, useNativeDriver: true }).start(); }}
            onPressOut={() => { if (!inert) Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start(); }}
        >
            <Animated.View style={[
                styles.menuItem,
                last && { borderBottomWidth: 0 },
                inert && { opacity: 0.45 },
                { transform: [{ scale: scaleAnim }] },
            ]}>
                <View style={[styles.menuIconWrap, { backgroundColor: `${ic}12` }]}>
                    <Icon name={icon} size={18} color={ic} />
                </View>
                <View style={styles.menuItemBody}>
                    <Text style={[styles.menuLabel, color && { color }]}>{label}</Text>
                    {sublabel && <Text style={styles.menuSublabel}>{sublabel}</Text>}
                </View>
                {badge !== undefined && badge > 0 && (
                    <View style={styles.menuBadge}>
                        <Text style={styles.menuBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                    </View>
                )}
                {trailing}
                {!trailing && showArrow && !inert && <Icon name="chevron-right" size={18} color={COLORS.accentLight} />}
            </Animated.View>
        </TouchableOpacity>
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
const AccountScreen = () => {
    const insets = useSafeAreaInsets();
    const user = useSelector((state: RootState) => state.user.currentUser);
    // Ví ĐÁNG TIN: chỉ số đến từ chuỗi (refreshWallet). Chưa refresh → null → hiển thị "—" (không bịa).
    const chainWallet = useSelector(selectChainWallet);
    // CẢ HAI ví (phoenix + standard) — hiện tách bạch, không gộp.
    const chainWallets = useSelector(selectChainWallets);
    const network = useSelector((state: RootState) => state.user.network);
    const networkResolving = useSelector((state: RootState) => state.user.networkResolving);
    const networkUnknown = useSelector((state: RootState) => state.user.networkUnknown);
    const phoenixKey = useSelector((state: RootState) => state.user.phoenixKey);
    // Địa-chỉ-2: khoá điều-khiển DID (quản-trị, KHÔNG giữ tài sản). null = chưa lấy được.
    const controllerPkh = useSelector((state: RootState) => state.user.controllerPkh);
    const chatbotEnabled = useSelector((state: RootState) => state.chatbot.enabled);
    const dispatch = useAppDispatch();
    const navigation: any = useNavigation();
    // Luồng hướng dẫn: chạy lại theo yêu cầu (xoá cờ đã-xem rồi start).
    // QUAN TRỌNG: các bước đều spotlight vào phần tử của màn hình Chính (khu Dịch
    // vụ, nút Chính, chuông…) nên phải VỀ HOME TRƯỚC rồi mới chạy — chạy ngay tại
    // Cài đặt sẽ khoanh vào vùng không tồn tại/đang ẩn. Chờ một nhịp cho tab đổi
    // và layout ổn định để đo spotlight chính xác.
    // ── Lời nhắc lập người khôi phục ─────────────────────────────────────
    // Chỉ hiện cho đúng diện `hasDeviceKey && guardianCount === 0`. Ba trạng thái,
    // và 'unknown' KHÔNG hiện gì — không cảnh báo, cũng không trấn an. Lý do đầy
    // đủ ở `services/deviceKeyRisk.ts`.
    const [showGuardianNudge, setShowGuardianNudge] = React.useState(false);
    React.useEffect(() => {
        let alive = true;
        void (async () => {
            if (await isRiskSnoozed()) return;
            const r = await checkDeviceKeyRisk();
            if (alive && r.state === 'at-risk') setShowGuardianNudge(true);
        })();
        return () => { alive = false; };
    }, []);

    const { start: startTour } = useCoachMark();
    const tourTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => () => { if (tourTimer.current) clearTimeout(tourTimer.current); }, []);
    const runTutorial = React.useCallback(() => {
        const uid = user?.id;
        resetTutorial(uid);
        // 'Main' → tab 'Home': đi qua stack cha nên đúng cả khi Tài khoản được mở
        // như tab lẫn khi mở từ header.
        navigation.navigate('Main', { screen: 'Home' });
        if (tourTimer.current) clearTimeout(tourTimer.current);
        tourTimer.current = setTimeout(() => startTour(uid), 500);
    }, [user?.id, startTour, navigation]);

    // Địa-chỉ derive LOCAL từ Master_KEK (account-0) — ĐÚNG bằng địa-chỉ register gửi lên
    // backend. Dùng làm fallback để ví HIỆN kể cả khi /wallet/all chưa trả (deriver backend
    // chưa sẵn). Không cần mạng, không rò khoá (chỉ ra địa-chỉ công khai).
    const [localAddr, setLocalAddr] = useState<string | null>(null);
    // Máy này có khoá phần cứng thật không. `null` = chưa đo xong.
    const [hasHwKey, setHasHwKey] = useState<boolean | null>(null);
    // Vì sao địa chỉ ví trống — để nói đúng lý do thay vì in một dấu gạch câm.
    const [addrReason, setAddrReason] = useState<'no_wallet' | 'error' | null>(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const pub = await ownerPublicKey();
                if (alive) setHasHwKey(!!pub);
            } catch {
                if (alive) setHasHwKey(false);
            }
        })();
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const kek = await getStoredMasterKek();
                if (!kek) { if (alive) setAddrReason('no_wallet'); return; }
                const addr = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
                if (alive && addr) { setLocalAddr(addr); setAddrReason(null); }
                else if (alive) setAddrReason('error');
            } catch {
                // Trước đây `catch` nuốt im lặng và màn hình in một dấu gạch. Người dùng
                // không phân biệt được "máy chưa lập ví" với "lập rồi nhưng đọc hỏng" —
                // hai ca cần hai hành động khác hẳn nhau.
                if (alive) setAddrReason('error');
            }
        })();
        return () => { alive = false; };
    }, []);

    // Ưu tiên địa-chỉ từ chuỗi (chainWallet), rồi local-derive, rồi các nguồn cũ.
    const walletAddress =
        chainWallet?.address ?? localAddr ?? phoenixKey?.walletAddress ?? user?.walletAddress ?? '';
    // Mạng: ưu tiên resolveNetwork (theo DID thật), else suy từ tiền tố địa chỉ ví. KHÔNG hardcode.
    const realNet: NetKind = normNetwork(network) ?? netFromAddress(walletAddress);

    const did = phoenixKey?.did ?? user?.did ?? '';

    /**
     * Kéo-xuống-làm-mới. Trước đây màn này KHÔNG có, và đó là lỗ hổng thật:
     * ba lượt gọi (`refreshWallet`, `resolveNetwork`, `refreshControllerPkh`) chỉ chạy
     * ĐÚNG MỘT LẦN lúc vào khu đã đăng nhập (`navigation/index.tsx`). Nhà vườn ngoài
     * vườn sóng yếu, lượt đó hỏng — và hỏng vĩnh viễn. Địa chỉ ví "—", Mạng "Detecting",
     * không nút nào cứu được, thoát app vào lại cũng không gọi lại.
     */
    const [refreshing, setRefreshing] = useState(false);
    const onRefresh = React.useCallback(async () => {
        if (!did) return;
        setRefreshing(true);
        try {
            await Promise.allSettled([
                dispatch(refreshWallet(did)),
                dispatch(resolveNetwork(did)),
                dispatch(refreshControllerPkh(did)),
            ]);
        } finally {
            // `finally` chứ không đặt sau `await`: một lượt ném là vòng xoay quay mãi.
            setRefreshing(false);
        }
    }, [dispatch, did]);
    // Modal "Tài sản khác" (ADA + token khác + hợp đồng còn hạn).
    const [assetsOpen, setAssetsOpen] = useState(false);

    // Bảng chia LAMP. Người dùng hỏi "tôi có bao nhiêu LAMP" nhưng con số đó nằm ở
    // HAI chỗ khác nhau: LAMP tự do trong ví, và LAMP Wakeme còn khoá trong vault.
    // Cộng gộp một số duy nhất là nói dối theo cả hai chiều — số trong ví thì tiêu
    // được ngay, số trong vault thì chưa.
    const [lampOpen, setLampOpen] = useState(false);
    const [vault, setVault] = useState<VaultStatusResponse | null>(null);
    const [vaultState, setVaultState] = useState<'idle' | 'loading' | 'ok' | 'closed'>('idle');

    // Chỉ hỏi máy chủ khi người dùng MỞ popup — không nạp trước ở màn Tài khoản.
    // Cửa `/wakeme/vault/{did}` hiện ném 501 vô điều kiện trên preprod
    // (ActivationVaultServiceImpl.java:158-159), nên nạp sẵn chỉ tốn một lượt gọi
    // hỏng cho mọi người vào màn này.
    const openLamp = React.useCallback(() => {
        setLampOpen(true);
        if (!did || vaultState === 'loading' || vaultState === 'ok') return;
        setVaultState('loading');
        getVaultStatus(did)
            .then((v) => { setVault(v); setVaultState('ok'); })
            .catch(() => { setVault(null); setVaultState('closed'); });
    }, [did, vaultState]);

    // KHÔNG in 0 khi chưa biết. "0 LAMP" và "chưa hỏi được máy chủ" là hai việc
    // khác hẳn nhau, mà chỉ một trong hai đáng để người dùng đi khiếu nại.
    //
    // ── Vì sao khối này được viết lại (nhà LAMP báo 21/08) ───────────────────
    // Wakeme là **CHO MƯỢN để tiêu dịch vụ**, KHÔNG phải tặng
    // (`Papers/pot-catalog.md:88`). LAMP rời vault đi đúng một trong hai đích
    // (`:43-64`, chủ dự án chốt 12/08): về **pot** — ngày nào không dùng thì thu
    // 1 LAMP — hoặc thành **sở hữu** sau khi qua `OwnEpoch`. Nên tài sản thật chỉ
    // gồm số dư ví + `vestedUnlocked`.
    //
    // Bản cũ sai HAI lần, và lỗi thứ nhất che lỗi thứ hai:
    //   1. ĐƠN VỊ — `initialDlamp` là LAMP NGUYÊN, `lampBalance` là oildrop
    //      (1 LAMP = 10⁶ oildrop). `fmtLamp(vault.initialDlamp)` chia LAMP nguyên
    //      cho 10⁶ ⇒ 1001 LAMP hiện ra `0.001001`; và `BigInt(own) +
    //      BigInt(vault.initialDlamp)` cộng thẳng hai đơn vị lệch nhau 10⁶.
    //   2. NGHĨA — `initialDlamp` là số BAN ĐẦU, **không giảm** khi LAMP bị thu về
    //      pot. Bỏ không dùng 30 ngày thì 30 LAMP đã về pot mà con số vẫn nguyên:
    //      độ lệch lớn dần mỗi đêm, và luôn lệch về phía có lợi cho con số.
    //   Vì (1) làm số nhỏ đi một triệu lần nên (2) không ai nhìn ra.
    const vaultOk = vaultState === 'ok' && vault ? vault : null;
    const vestedOildrop = lampWholeToOildrop(vaultOk?.vestedUnlocked);
    /** Tài sản THẬT: ví + phần Wakeme đã mở khoá. Không gồm phần đang mượn. */
    const lampOwnedText = (() => {
        const own = chainWallet?.lampBalance;
        if (own == null) return '—';
        if (vaultState === 'loading') return '…';
        if (vestedOildrop == null) return fmtLamp(own);
        // `Math.trunc` chứ không `BigInt(own as any)`: `lampBalance` khai là `number`
        // (`userSlice.ts:34`), và `BigInt()` NÉM khi số có phần lẻ. Ném ở đây là ném
        // giữa lượt dựng màn Tài khoản — người dùng thấy màn trắng, không thấy lỗi.
        // Bỏ luôn `as any`: ép kiểu đi qua chính là thứ đã che lỗi đơn vị ở khối trên.
        return fmtLamp(BigInt(Math.trunc(own)) + vestedOildrop);
    })();
    /**
     * Nói thẳng con số trên đang gồm những gì — đừng để người đọc tự đoán.
     *
     * BA ca, không phải hai. "đang hỏi" khác "hỏi hỏng": gộp chúng lại là in câu
     * "chưa hỏi được phần Wakeme" ngay trong lúc còn đang hỏi — một KHẲNG ĐỊNH về
     * thất bại chưa xảy ra, đặt ngay cạnh con số đang hiện `…`.
     */
    const lampOwnedSub = vestedOildrop != null
        ? 'Trong ví + phần Wakeme đã mở khoá thành sở hữu'
        : vaultState === 'loading'
            ? 'Đang hỏi phần Wakeme…'
            : 'Mới tính phần trong ví — chưa hỏi được phần Wakeme';
    // Popup chọn ngôn ngữ (Việt · Anh · Trung). `useLanguage` để dòng phụ của mục
    // "Ngôn ngữ" đổi ngay khi người dùng chọn xong.
    const [langOpen, setLangOpen] = useState(false);
    const lang = useLanguage();
    // Tên ngôn ngữ viết bằng CHÍNH nó (English / 中文 / Tiếng Việt) — không dịch.
    const langLabel = LANGUAGES.find(l => l.code === lang)?.endonym ?? 'Tiếng Việt';

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    const versionTapCount = useRef(0);
    const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!user) {
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
    }, [navigation, user]);

    useEffect(() => {
        return () => {
            if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
        };
    }, []);

    const handleVersionTap = () => {
        versionTapCount.current += 1;
        if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
        versionTapTimer.current = setTimeout(() => {
            versionTapCount.current = 0;
        }, 1500);
        if (versionTapCount.current >= 5) {
            versionTapCount.current = 0;
            showInfo('Aladin', APP_DEBUG_INFO);
        }
    };

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
    }, []);

    const handleLogout = () => {
        showWarning(
            'Đăng xuất',
            'Bạn có chắc muốn đăng xuất khỏi tài khoản?',
            {
                onConfirm: async () => {
                    // logoutUser thunk ĐÓNG SQLite per-user (chống rò dữ liệu user A→B).
                    // reset thay navigate để xoá hẳn stack đã-đăng-nhập.
                    await dispatch(logoutUser());
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                },
                confirmText: 'Đăng xuất',
                cancelText: 'Huỷ',
            }
        );
    };

    // TÁI SINH danh tính (Recovery) — khi MẤT thiết bị/khoá. Khác hẳn Xoay khoá.
    // Theo PhoenixKey v4.6: PersonDID khôi phục qua TAAD (người bảo trợ + thời-gian-chờ),
    // GIỮ NGUYÊN DID cũ. KHÔNG đăng-ký-mới (đăng-ký-mới sẽ ra DID khác, mất liên-kết dữ-liệu).
    const handleRecover = () => {
        showWarning(
            'Tái sinh danh tính (thử nghiệm)',
            'Dùng khi bạn MẤT thiết bị hoặc mất khoá. Hệ thống khôi phục lại CHÍNH danh tính cũ ' +
            'của bạn thông qua người bảo trợ và thời gian chờ an toàn — không tạo danh tính mới, ' +
            'không mất liên kết với cây và dữ liệu đã ghi. Tính năng đang phát triển; nếu bạn mất thiết bị, ' +
            'vui lòng liên hệ đội hỗ trợ.',
            { confirmText: 'Đã hiểu' },
        );
    };

    // XOAY KHOÁ (Rotation) — owner CHỦ ĐỘNG thay bộ khoá (nghi khoá bị lộ). Giữ nguyên DID,
    // chỉ đổi khoá điều-khiển (/keys/rotate), không thời-gian-chờ. KHÁC với Tái sinh (mất thiết bị).
    // Hợp đồng backend /keys/rotate đã đầy đủ (phoenixKeyApi.keys.rotate — ký bằng khoá cũ trên
    // "PHOENIXKEY_ROTATE:<newPubkey>:<nonce>"). NHƯNG luồng tráo khoá an toàn cần native sinh khoá
    // mới ở alias tạm rồi mới ghi đè owner — nếu rotate lỗi giữa chừng mà khoá cũ đã bị xoá thì
    // MẤT danh tính. Native hiện chỉ thao tác một alias owner duy nhất nên chưa tráo atomic được →
    // hiện modal cảnh báo trung thực, KHÔNG giả vờ thành công.
    // TODO(native): ký khoá-cũ ở alias tạm trước khi ghi đè owner; chỉ wipe khoá cũ SAU khi
    // keys.rotate trả txHash thành công.
    const handleRotate = () => {
        showWarning(
            'Xoay khoá (thử nghiệm)',
            'Dùng khi bạn NGHI khoá bị lộ nhưng vẫn còn giữ thiết bị. Hệ thống thay khoá điều khiển ' +
            'bằng khoá mới và cập nhật lên chuỗi khối — danh tính của bạn GIỮ NGUYÊN. ' +
            'Cách đổi khoá an toàn đang được hoàn thiện để tránh rủi ro mất quyền truy cập ' +
            'nếu lỗi giữa chừng. Vui lòng liên hệ đội hỗ trợ nếu cần gấp.',
            { confirmText: 'Đã hiểu' },
        );
    };

    // Initials for avatar
    const initials = (user?.name ?? 'U')
        .split(' ')
        .map((w: string) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    // Guard độ dài: chỉ rút gọn khi địa chỉ đủ dài (>= 14 ký tự). Địa chỉ ngắn
    // (edge testnet) hiển thị nguyên vẹn — tránh lộ ký tự sai do slice chồng lấn.
    const shortWallet = (() => {
        const addr = user?.walletAddress;
        if (!addr) return '—';
        return addr.length >= 14 ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : addr;
    })();

    if (!user) {
        // Trước đây trả màn TRỐNG (vi phạm §7.3). Khi chưa có user (đang hydrate
        // sau đăng nhập), hiển thị skeleton thân thiện thay vì khoảng trắng.
        return (
            <View style={styles.root}>
                <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
                <StateView status="loading" loadingLines={5} />
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
                }
                contentContainerStyle={[
                    styles.scrollContent,
                    // iOS-fix: chừa khoảng dưới cho CurvedTabBar (navbar nổi) khỏi che nội dung.
                    { paddingBottom: Math.max(insets.bottom, 12) + 120 },
                ]}
            >
                {/* ── Profile hero ── */}
                <Animated.View style={[styles.profileHero, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                    {/* Avatar */}
                    <View style={styles.header}>
                        <View style={styles.avatarWrap}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarInitials}>{initials}</Text>
                            </View>
                            <View style={styles.avatarRing} />
                            <View style={styles.onlineDot} />
                        </View>

                        {/* Name / DID */}
                        <View style={styles.profileInfo}>
                            <Text style={styles.profileName}>{user?.name ?? 'Người dùng'}</Text>
                            <View style={styles.profilePhoneRow}>
                                <Icon name="identifier" size={13} color={COLORS.textMuted} />
                                <Text style={styles.profilePhone} numberOfLines={1} ellipsizeMode="middle">
                                    {(user?.did ?? user?.id) || 'Chưa có danh tính'}
                                </Text>
                            </View>
                            {user?.email && (
                                <View style={styles.profilePhoneRow}>
                                    <Icon name="email-outline" size={13} color={COLORS.textMuted} />
                                    <Text style={styles.profilePhone}>{user.email}</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* DID badge */}
                    {/* Huy hiệu này trước đây hiện LUÔN LUÔN, kể cả khi ngay phía trên
                    đang in "Chưa có danh tính" — hai câu mâu thuẫn trên cùng một màn.
                    Người dùng đọc "đã xác minh" rồi đánh giá thấp rủi ro khi quyết
                    định giữ tài sản. Nay chỉ hiện khi có DID thật. */}
                {!!did && <View style={styles.didBadge}>
                        <Icon name="shield-check-outline" size={12} color={COLORS.success} />
                        <Text style={styles.didBadgeText}>Danh tính đã xác minh</Text>
                    </View>}
                </Animated.View>

                {/* ── Token balances ── */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <View style={styles.sectionHeaderRow}>
                        <View style={styles.sectionDot} />
                        <Text style={styles.sectionTitle}>TÀI SẢN BLOCKCHAIN</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tokenScroll}>
                        {/* 2 ô đầu = MAGIC + LAMP (thứ user phổ thông quan tâm nhất). */}
                        <TokenCard
                            index={0}
                            icon="star-four-points-outline"
                            label="MAGIC"
                            value={chainWallet?.magicBalance}
                            unit="MAGIC"
                            color="#B07D2F"
                            desc="Tín dụng sử dụng dịch vụ"
                        />
                        <TokenCard
                            index={1}
                            icon="lightning-bolt"
                            label="LAMP"
                            value={fmtLamp(chainWallet?.lampBalance)}
                            unit="LAMP"
                            color={COLORS.accent}
                            desc="Sinh MAGIC mỗi 5 ngày"
                            onPress={openLamp}
                        />
                        {/* CARP — token hệ sinh thái thứ 3. TODO brand: icon/màu tạm; số dư chờ API Phoenix. */}
                        <TokenCard
                            index={2}
                            icon="fish"
                            label="CARP"
                            value={fmtCarp(chainWallet?.carpBalance)}
                            unit="CARP"
                            color="#2F8F8F"
                            desc="Token hệ sinh thái"
                        />
                        {/* Ô cuối: gom ADA + token khác + hợp đồng còn hạn — bấm để xem. */}
                        <TouchableOpacity style={styles.assetMoreCard} activeOpacity={0.85} onPress={() => setAssetsOpen(true)}>
                            <View style={[styles.tokenIconWrap, { backgroundColor: 'rgba(55,71,79,0.10)' }]}>
                                <Icon name="wallet-bifold-outline" size={20} color="#37474f" />
                            </View>
                            <Text style={styles.tokenLabel}>TÀI SẢN KHÁC</Text>
                            <Text style={[styles.tokenValue, { color: '#37474f', fontSize: 16 }]}>Xem ›</Text>
                            <Text style={styles.tokenDesc}>ADA · token · hợp đồng</Text>
                        </TouchableOpacity>
                    </ScrollView>

                    {/* Popup LAMP: tổng · phần Wakeme · phần của bạn.
                        Nút "Nhận LAMP (Wakeme)" nằm ở ĐÂY, cạnh đúng con số nó tác động,
                        thay vì chôn giữa danh sách cài đặt. Nó là việc làm MỘT LẦN cho mỗi
                        người, nên khi vault đã có thì nút biến mất — không mời gọi một
                        thao tác không lặp lại được. */}
                    <Modal visible={lampOpen} transparent animationType="slide" onRequestClose={() => setLampOpen(false)}>
                        <TouchableOpacity style={styles.explorerBackdrop} activeOpacity={1} onPress={() => setLampOpen(false)}>
                            <View style={styles.assetSheet}>
                                <Text style={styles.assetSheetTitle}>LAMP</Text>

                                {/* Dòng đầu là TÀI SẢN, không phải tổng gộp. Phần đang mượn
                                    nằm riêng bên dưới — đặt nó dưới chữ "Tổng cộng" là mời
                                    người dùng coi khoản mượn như thứ bán được, đúng điều
                                    pot này cấm (`Papers/pot-catalog.md:88`). */}
                                <View style={styles.lampRow}>
                                    <Icon name="lightning-bolt" size={18} color={COLORS.accent} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.lampRowName}>LAMP của bạn</Text>
                                        <Text style={styles.lampRowSub}>{lampOwnedSub}</Text>
                                    </View>
                                    <Text style={styles.lampTotalVal}>{lampOwnedText}</Text>
                                </View>

                                <View style={styles.lampRow}>
                                    <Icon name="wallet-outline" size={18} color={COLORS.accent} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.lampRowName}>Trong ví</Text>
                                        <Text style={styles.lampRowSub}>Dùng được ngay</Text>
                                    </View>
                                    <Text style={styles.lampRowVal}>{fmtLamp(chainWallet?.lampBalance)}</Text>
                                </View>

                                {!vaultOk ? (
                                    <View style={styles.lampRow}>
                                        <Icon name="lightbulb-on-outline" size={18} color={COLORS.accent} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.lampRowName}>Wakeme</Text>
                                            <Text style={styles.lampRowSub}>
                                                {vaultState === 'loading' ? 'Đang hỏi máy chủ…' : 'Chưa nhận'}
                                            </Text>
                                        </View>
                                        <Text style={styles.lampRowVal}>
                                            {vaultState === 'loading' ? '…' : '—'}
                                        </Text>
                                    </View>
                                ) : (<>
                                    <View style={styles.lampRow}>
                                        <Icon name="lock-open-variant-outline" size={18} color={COLORS.accent} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.lampRowName}>Wakeme đã mở khoá</Text>
                                            <Text style={styles.lampRowSub}>Đã thành sở hữu của bạn</Text>
                                        </View>
                                        <Text style={styles.lampRowVal}>{fmtLampWhole(vaultOk.vestedUnlocked)}</Text>
                                    </View>

                                    <View style={styles.lampRow}>
                                        <Icon name="hand-coin-outline" size={18} color={COLORS.accent} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.lampRowName}>Wakeme đang mượn</Text>
                                            <Text style={styles.lampRowSub}>
                                                Tiêu dịch vụ được, KHÔNG bán được. Ngày nào không dùng thì bị thu 1 LAMP về pot.
                                            </Text>
                                        </View>
                                        <Text style={styles.lampRowVal}>{fmtLampWhole(vaultOk.conditionalLamp)}</Text>
                                    </View>

                                    {/* Chỉ hiện khi ĐÃ có phần bị thu — đây là dòng giải thích
                                        vì sao số của người dùng giảm đi. Ẩn nó thì con số tụt
                                        mà không ai nói vì sao. */}
                                    {vaultOk.reclaimedToPotLamp > 0 && (
                                        <View style={styles.lampRow}>
                                            <Icon name="arrow-u-left-top" size={18} color={COLORS.textMuted} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.lampRowName}>Đã thu về pot</Text>
                                                <Text style={styles.lampRowSub}>Phần bỏ không dùng, đã trả lại pot</Text>
                                            </View>
                                            <Text style={styles.lampRowVal}>{fmtLampWhole(vaultOk.reclaimedToPotLamp)}</Text>
                                        </View>
                                    )}
                                </>)}

                                {vaultState !== 'ok' && (WAKEME_CLAIM_READY ? (
                                    <TouchableOpacity
                                        style={styles.lampClaimBtn}
                                        activeOpacity={0.88}
                                        onPress={() => { setLampOpen(false); navigation.navigate('Wakeme'); }}
                                    >
                                        <Text style={styles.lampClaimTxt}>Nhận LAMP (Wakeme)</Text>
                                        <Text style={styles.lampClaimSub}>Mỗi người chỉ nhận một lần</Text>
                                    </TouchableOpacity>
                                ) : (
                                    /* Luồng nhận chưa ký được tới cuối. Vẽ một nút sáng mời bấm
                                       là hứa một việc app chưa làm được: người dùng bấm, ký, rồi
                                       chuỗi từ chối ở bước cuối — hỏng SAU khi đã hứa. Nói trước
                                       thì họ mất 2 giây; hứa hão thì họ mất niềm tin. */
                                    <TouchableOpacity
                                        style={styles.lampNoticeBtn}
                                        activeOpacity={0.88}
                                        onPress={() => { setLampOpen(false); navigation.navigate('Wakeme'); }}
                                    >
                                        <Icon name="information-outline" size={16} color={COLORS.textMuted} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.lampNoticeTxt}>Nhận LAMP (Wakeme): tính năng chưa mở</Text>
                                            <Text style={styles.lampNoticeSub}>Xem chi tiết ›</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}

                                <Text style={styles.lampNote}>
                                    LAMP trong vault Wakeme mở khoá dần theo ngày. Con số chưa hiện nghĩa là máy chủ chưa cho biết — app không tự điền.
                                </Text>

                                <TouchableOpacity style={styles.assetClose} onPress={() => setLampOpen(false)}>
                                    <Text style={styles.assetCloseTxt}>Đóng</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </Modal>

                    {/* Modal "Tài sản khác": ADA thật + token/hợp-đồng (chưa có nguồn → ghi rõ, KHÔNG bịa). */}
                    <Modal visible={assetsOpen} transparent animationType="slide" onRequestClose={() => setAssetsOpen(false)}>
                        <TouchableOpacity style={styles.explorerBackdrop} activeOpacity={1} onPress={() => setAssetsOpen(false)}>
                            <View style={styles.assetSheet}>
                                <Text style={styles.assetSheetTitle}>Tài sản khác</Text>
                                <View style={styles.assetRow}>
                                    <Icon name="hexagon-outline" size={18} color="#0033AD" />
                                    <Text style={styles.assetName}>ADA</Text>
                                    <Text style={styles.assetVal}>{chainWallet?.adaBalance ?? '—'} ₳</Text>
                                </View>
                                <Text style={styles.assetHint}>
                                    Các token khác và hợp đồng đang còn hạn sẽ hiển thị ở đây khi có dữ liệu.
                                </Text>
                                <TouchableOpacity style={styles.assetClose} onPress={() => setAssetsOpen(false)}>
                                    <Text style={styles.assetCloseTxt}>Đóng</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </Modal>
                </Animated.View>

                {/* ── Blockchain info ── */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Section title="VÍ & DANH TÍNH">
                        {/* HAI ví (API.md §7): `standard` user tự giữ khoá + `phoenix` custody.
                            Backend chưa trả ví nào (chưa đăng-ký / offline) → rơi về địa-chỉ
                            derive LOCAL từ Master_KEK để user vẫn thấy ví của mình. */}
                        {chainWallets.length > 0 ? (
                            chainWallets.map(w => <WalletBlock key={w.kind} entry={w} />)
                        ) : (
                            /* Trống thì NÓI VÌ SAO, đừng in một dấu gạch câm. Hai lý do
                               dẫn tới hai việc khác hẳn nhau: chưa lập ví thì phải lập,
                               còn đọc hỏng thì chỉ cần thử lại. */
                            <InfoRow
                                icon="wallet-outline"
                                label="Địa chỉ ví (giữ tài sản)"
                                value={walletAddress || (
                                    addrReason === 'no_wallet' ? 'Chưa lập ví trên máy này'
                                    : addrReason === 'error' ? 'Chưa đọc được — kéo xuống để thử lại'
                                    : ''
                                )}
                                copyable={!!walletAddress}
                                mono={!!walletAddress}
                                explorerNet={walletAddress ? realNet : null}
                            />
                        )}
                        <InfoRow
                            icon="identifier"
                            label="Mã định danh"
                            value={did}
                            copyable mono
                        />
                        {/* Địa-chỉ-2: khoá ĐIỀU-KHIỂN DID (quản-trị, KHÔNG giữ tài sản). Chỉ hiện khi backend trả về. */}
                        {!!controllerPkh && (
                            <InfoRow
                                icon="key-outline"
                                label="Khoá điều khiển (quản trị danh tính)"
                                value={controllerPkh}
                                copyable mono
                            />
                        )}
                        {/* Trước đây hàng này in cứng "Khoá phần cứng v1" bất kể máy có
                            khoá phần cứng thật hay không — một lời khẳng định về bảo mật mà
                            app không hề đo. Máy không có khoá HW vẫn đọc y hệt, rồi người
                            dùng dựa vào đó mà quyết định giữ tài sản trong ví. Và "v1" là số
                            phiên bản nội bộ, ngoài đội ra không ai hiểu.
                            Nay nói đúng cái đo được: có khoá trên máy này hay không. */}
                        <InfoRow
                            icon="shield-key-outline"
                            label="Khoá bảo vệ"
                            value={hasHwKey === null
                                ? ''
                                : hasHwKey
                                    ? 'Khoá nằm trong chip bảo mật của máy'
                                    : 'Chưa có khoá trên máy này'}
                        />
                        <InfoRow
                            icon="earth"
                            label="Mạng"
                            value={networkLabel(realNet, networkResolving, networkUnknown)}
                        />
                        <View style={styles.walletNote}>
                            <Icon name="information-outline" size={13} color={COLORS.textMuted} />
                            <Text style={styles.walletNoteText}>
                                <Text style={styles.walletNoteStrong}>Ví cơ bản</Text> do chính bạn giữ chìa — dùng để nhận và chuyển tài sản.{' '}
                                <Text style={styles.walletNoteStrong}>Phoenix Wallet</Text> is managed by the system against your identity — used for activation and services.
                            </Text>
                        </View>
                    </Section>
                </Animated.View>

                {/* ── LampNet stats ── */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Section title="LAMPNET">
                        {/* Bỏ "Mảnh dữ liệu"/"Thiết bị lưu trữ": field shardCount/deviceCount KHÔNG
                            tồn tại trên User → luôn '—' (số ma). Nối lại khi có nguồn LampNet thật. */}
                        <InfoRow icon="lock-outline" label="Mã hoá" value="AES-256 đầu cuối" last />
                    </Section>
                </Animated.View>

                {/* ── Cài đặt ── */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Section title="CÀI ĐẶT">
                        <MenuItem icon="bell-outline" label="Thông báo" sublabel="Quản lý thông báo đẩy" />
                        {/* Nhãn song ngữ CỐ Ý: người đang cần đổi ngôn ngữ là người
                            chưa đọc được ngôn ngữ đang hiện. Dòng phụ = tên ngôn ngữ
                            đang chọn, viết bằng CHÍNH nó (endonym, không dịch). */}
                        <MenuItem
                            icon="translate"
                            label="Language"
                            sublabel={langLabel}
                            onPress={() => setLangOpen(true)}
                        />
                        <MenuItem icon="fingerprint" label="Sinh trắc học" sublabel="Xác thực khuôn mặt & vân tay" onPress={() => navigation.navigate('BiometricSettings')} />
                        <MenuItem
                            icon="robot-happy-outline"
                            label="Trợ lý ảo"
                            sublabel={chatbotEnabled ? 'Bong bóng đang hiển thị' : 'Đang tắt — bật để hiện bong bóng'}
                            onPress={() => dispatch(setChatbotEnabled(!chatbotEnabled))}
                            trailing={
                                <Switch
                                    value={chatbotEnabled}
                                    onValueChange={(v) => { dispatch(setChatbotEnabled(v)); }}
                                    trackColor={{ false: COLORS.border, true: COLORS.accentLight }}
                                    thumbColor={chatbotEnabled ? COLORS.accent : COLORS.bgWarm}
                                />
                            }
                        />
                        <MenuItem icon="school-outline" label="Chạy luồng hướng dẫn" sublabel="Xem lại hướng dẫn thao tác cơ bản" onPress={runTutorial} />
                        <MenuItem icon="wifi-off" label="Chế độ offline" sublabel="Lưu cục bộ khi mất mạng" last />
                    </Section>
                </Animated.View>

                {/* ── Ví ── */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Section title="VÍ">
                        <MenuItem
                            icon="wallet-outline"
                            label="Ví của tôi"
                            sublabel="Số dư ADA/LAMP/MAGIC + địa chỉ Cardano (từ cụm 24 từ)"
                            onPress={() => navigation.navigate('PhoenixWallet')}
                        />
                        {/*
                          Wakeme — cùng lý do bố trí như OrgDID bên dưới: tính năng cũng
                          cần Master_KEK, nên lối trong PhoenixWalletScreen là chính đáng,
                          nhưng nếu ĐÓ là lối duy nhất thì người chưa lập ví không bao giờ
                          nhìn thấy tính năng tồn tại. Lối này để họ THẤY, rồi màn Wakeme
                          tự dẫn sang thiết lập ví nếu chưa có.
                        */}
                        <MenuItem
                            icon="card-account-details-outline"
                            label="Xuất danh tính"
                            sublabel="Xem/sao chép mã định danh, khoá công khai, địa chỉ ví"
                            onPress={() => navigation.navigate('ExportIdentity')}
                        />
                        {/*
                          Lối vào THỨ HAI cho OrgDID. Lối cũ là lối duy nhất và nó bị chặn:
                          thẻ "VÍ TỔ CHỨC" nằm ở PhoenixWalletScreen.tsx:280-302, mà màn đó
                          return sớm ở :190 khi máy chưa có Master_KEK — người chưa thiết lập
                          ví chỉ thấy "Chưa có ví" và không có đường nào tới màn tạo tổ chức.
                          Cổng đó THỪA với OrgDID: tạo tổ chức ký bằng khoá phần cứng /
                          owner DID, không đụng Master_KEK (orgMintService.ts:160-164).
                          Kèm theo: lối cũ nằm sâu ba lớp sau một nhãn tên "Ví của tôi" —
                          không ai đoán "tạo tổ chức" nằm trong ví.
                        */}
                        <MenuItem
                            icon="office-building-outline"
                            label="Tổ chức (OrgDID)"
                            sublabel="Tạo danh tính tổ chức và mint LAMP vào kho Distribution"
                            onPress={() => navigation.navigate('OrgDid')}
                        />
                        <MenuItem
                            icon="at"
                            label="Username"
                            sublabel="Đặt tên tra cứu để người khác tìm bạn"
                            onPress={() => navigation.navigate('Username')}
                        />
                        <MenuItem
                            icon="account-supervisor-outline"
                            label="Người bảo hộ"
                            sublabel="Thêm guardian để khôi phục khi mất thiết bị"
                            onPress={() => navigation.navigate('Guardian')}
                        />
                        <MenuItem
                            icon="history"
                            label="Nhật ký hoạt động"
                            sublabel="Lịch sử ký, xoay khoá, khôi phục"
                            onPress={() => navigation.navigate('ActivityLog')}
                            last
                        />
                    </Section>
                </Animated.View>

                {/* ── Bảo mật ── */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Section title="BẢO MẬT & KHÔI PHỤC">
                        {/* Câu này nói ĐÚNG VIỆC, không doạ và không hứa: nêu tình
                            trạng, nêu hệ quả cụ thể (mất máy), nêu một việc làm được
                            ngay. Không dùng chữ "lỗi" — người dùng không làm gì sai. */}
                        {showGuardianNudge && (
                            <View style={styles.nudgeBox}>
                                <Text style={styles.nudgeTitle}>Chưa có ai khôi phục hộ bạn</Text>
                                <Text style={styles.nudgeBody}>
                                    Máy này đã bật bảo mật 2 lớp nhưng chưa chọn người khôi phục.
                                    Nếu mất máy, hiện chưa có cách nào lấy lại danh tính. Chọn một
                                    người thân tin cậy là xong.
                                </Text>
                                <View style={styles.nudgeRow}>
                                    <TouchableOpacity
                                        style={styles.nudgePrimary}
                                        activeOpacity={0.85}
                                        onPress={() => navigation.navigate('Guardian')}
                                    >
                                        <Text style={styles.nudgePrimaryText}>Chọn người khôi phục</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.nudgeGhost}
                                        activeOpacity={0.7}
                                        onPress={() => { void snoozeRisk(); setShowGuardianNudge(false); }}
                                    >
                                        <Text style={styles.nudgeGhostText}>Để sau</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                        <MenuItem
                            icon="backup-restore"
                            label="Tái sinh danh tính"
                            sublabel="Khôi phục khi MẤT thiết bị (giữ nguyên danh tính cũ)"
                            onPress={handleRecover}
                        />
                        <MenuItem
                            icon="key-change"
                            label="Xoay khoá"
                            sublabel="Thay bộ khoá khi nghi bị lộ (vẫn giữ thiết bị)"
                            onPress={handleRotate}
                        />
                        <MenuItem
                            icon="qrcode-scan"
                            label="Đăng nhập web (quét QR)"
                            sublabel="Duyệt đăng nhập phoenixkey.me bằng khoá trên máy"
                            onPress={() => navigation.navigate('WebLoginScan')}
                        />
                        <MenuItem
                            icon="key-outline"
                            label="Xuất cụm 24 từ khôi phục"
                            sublabel="Sao lưu gốc-tin-cậy (BIP39) — ghi ra giấy, cất an toàn"
                            onPress={() => navigation.navigate('SeedExport')}
                        />
                        <MenuItem
                            icon="backup-restore"
                            label="Khôi phục bằng cụm 24 từ"
                            sublabel="Nhập cụm từ để khôi phục danh tính trên máy này"
                            onPress={() => navigation.navigate('RestoreIdentity')}
                        />
                        <MenuItem
                            icon="account-multiple-outline"
                            label="Thiết bị tin cậy"
                            sublabel="Quản lý các thiết bị đã đăng nhập"
                            last
                        />
                    </Section>
                </Animated.View>

                {/* "Chụp định-danh bề-mặt" ĐÃ DỜI sang Dashboard (Truy-xuất) — đúng nghiệp-vụ trace,
                    không nằm ở Tài-khoản (settings) nữa. */}

                {/* ── Hỗ trợ ── */}
                <Animated.View style={{ opacity: fadeAnim }}>
                    <Section title="HỖ TRỢ">
                        {/* "Trung tâm hỗ trợ" CHƯA có đích đến, nên `MenuItem` tự vẽ nó ở
                            trạng thái tắt (mờ, không mũi tên, không bắt chạm) thay vì giả
                            vờ bấm được.
                            "Điều khoản & Chính sách" thì nay có đích thật: màn `Terms` đọc
                            được cả khi mất mạng, vì Google Play đòi phần tiết lộ dữ liệu
                            phải mở được NGAY TRONG ứng dụng — mà người dùng ngoài vườn
                            thường không có mạng đủ khoẻ để tải một trang web. */}
                        <MenuItem icon="help-circle-outline" label="Trung tâm hỗ trợ" />
                        <MenuItem
                            icon="file-document-outline"
                            label="Điều khoản & Chính sách"
                            onPress={() => navigation.navigate('Terms')}
                        />
                        <MenuItem
                            icon="information-outline"
                            label="Phiên bản ứng dụng"
                            sublabel={APP_VERSION_LABEL}
                            showArrow={false}
                            onPress={handleVersionTap}
                            last
                        />
                    </Section>
                </Animated.View>

                {/* ── Nạp tín dụng ── */}
                <Animated.View style={{ opacity: fadeAnim, marginHorizontal: 20, marginBottom: 12 }}>
                    {/* Nút này TRƯỚC ĐÂY không có `onPress` — bấm vào không xảy ra gì, không một
                        dòng báo. Kho chưa có màn nạp tín dụng nào (grep navigator: không route),
                        nên chưa thể nối đích thật. Trong lúc chờ, nói thẳng là chưa mở còn hơn
                        để người dùng bấm mãi tưởng máy treo — và nút chết cũng là thứ kho ứng
                        dụng đánh trượt khi xét bản phát hành. */}
                    <TouchableOpacity
                        style={styles.topupBtn}
                        activeOpacity={0.88}
                        onPress={() =>
                            // showInfo (KHÔNG phải Alert.alert gốc): hộp thoại native
                            // không đi qua lớp dịch, nên chuỗi tiếng Việt lộ nguyên
                            // với người chọn ngôn ngữ khác.
                            showInfo(
                                'Chưa mở nạp tín dụng',
                                'Đường nạp tín dụng MAGIC chưa mở trong bản này. Khi mở, nút này sẽ dẫn thẳng tới màn nạp.',
                            )
                        }
                    >
                        <View style={styles.btnShine} />
                        <Icon name="lightning-bolt" size={19} color={COLORS.white} />
                        <View>
                            <Text style={styles.topupBtnTitle}>Nạp tín dụng MAGIC</Text>
                            <Text style={styles.topupBtnSub}>Quẹt mã · Chuyển token LAMP</Text>
                        </View>
                        <Icon name="arrow-right" size={18} color={COLORS.white} style={{ marginLeft: 'auto' }} />
                    </TouchableOpacity>
                </Animated.View>

                {/* ── Đăng xuất ── */}
                <Animated.View style={{ opacity: fadeAnim, marginHorizontal: 20, marginBottom: 48 }}>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.88}>
                        <Icon name="logout" size={18} color={COLORS.error} />
                        <Text style={styles.logoutText}>Đăng xuất</Text>
                    </TouchableOpacity>
                    {/* Xoá tài khoản — bắt buộc bởi Apple 5.1.1(v) + Google Play (issue #144).
                        Để mờ, dưới Đăng xuất: hành động huỷ-diệt, không mời gọi. */}
                    <TouchableOpacity
                        onPress={() => navigation.navigate('DeleteAccount')}
                        style={{ marginTop: 16, alignItems: 'center' }}
                        activeOpacity={0.7}
                    >
                        <Text style={{ color: COLORS.textMuted, fontSize: 13, textDecorationLine: 'underline' }}>
                            Xoá tài khoản
                        </Text>
                    </TouchableOpacity>
                </Animated.View>
            </ScrollView>

            {/* Popup chọn ngôn ngữ — đặt NGOÀI ScrollView để phủ toàn màn. */}
            <LanguagePickerModal visible={langOpen} onClose={() => setLangOpen(false)} />
        </View>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    root: { flex: 1, backgroundColor: COLORS.bg },

    topStrip: { height: 3, backgroundColor: COLORS.bgWarm, flexDirection: 'row' },
    topStripAccent: { width: '40%', height: '100%', backgroundColor: COLORS.accent },

    scrollContent: {
        paddingTop: Platform.OS === 'ios' ? 56 : 44,
        paddingBottom: 20,
    },

    // Profile hero
    profileHero: {
        paddingHorizontal: 24,
        paddingBottom: 24,
        alignItems: 'flex-start',
    },
    avatarWrap: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 72, height: 72, borderRadius: 22,
        backgroundColor: COLORS.accentGlow,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: COLORS.accent,
    },
    avatarInitials: {
        fontSize: 26, fontWeight: '800', color: COLORS.accent, letterSpacing: -0.5,
    },
    avatarRing: {
        position: 'absolute', top: -5, left: -5, right: -5, bottom: -5,
        borderRadius: 27, borderWidth: 1.5,
        borderColor: COLORS.accentLight, opacity: 0.3,
    },
    onlineDot: {
        position: 'absolute', bottom: 2, right: 2,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: COLORS.success,
        borderWidth: 2, borderColor: COLORS.bg,
    },
    profileInfo: { marginBottom: 12 },
    profileName: {
        fontSize: 28, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6, marginBottom: 6,
    },
    profilePhoneRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3,
    },
    profilePhone: { fontSize: 13, color: COLORS.textMuted },
    didBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(74,124,89,0.10)',
        borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
        borderWidth: 1, borderColor: 'rgba(74,124,89,0.2)',
    },
    didBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.success },

    // Token scroll
    tokenScroll: { paddingLeft: 20, paddingRight: 4, marginBottom: 8 },
    tokenCard: {
        width: (width - 56) / 2.3,
        backgroundColor: COLORS.card,
        borderRadius: 16, padding: 14,
        borderWidth: 1.5, marginRight: 10,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10,
        elevation: 2,
    },
    tokenIconWrap: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
    },
    tokenLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 1.5, marginBottom: 4 },
    tokenValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 2 },
    tokenUnit: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6 },
    tokenDesc: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16 },

    // Section
    sectionWrap: { marginHorizontal: 20, marginBottom: 14 },
    sectionHeaderRow: {
        flexDirection: 'row', alignItems: 'center',
        gap: 8, marginBottom: 10,
        paddingHorizontal: 20,
    },
    sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
    nudgeBox: {
        backgroundColor: '#fff8e1', borderRadius: 12, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: '#ffe082',
    },
    nudgeTitle: { fontSize: 14, fontWeight: '800', color: '#e65100', marginBottom: 4 },
    nudgeBody: { fontSize: 13, lineHeight: 19, color: '#5d4037' },
    nudgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
    nudgePrimary: {
        backgroundColor: '#e65100', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14,
    },
    nudgePrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    nudgeGhost: { paddingVertical: 9, paddingHorizontal: 10 },
    nudgeGhostText: { color: '#795548', fontSize: 13, fontWeight: '600' },
    sectionTitle: {
        fontSize: 11, fontWeight: '700', color: COLORS.accent, letterSpacing: 2,
    },
    sectionCard: {
        backgroundColor: COLORS.card,
        borderRadius: 18, borderWidth: 1, borderColor: COLORS.border,
        overflow: 'hidden',
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10,
        elevation: 2,
    },

    // Info row
    infoRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 13,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
    },
    infoRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    infoRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '58%' },
    infoLabel: { fontSize: 13, color: COLORS.textSub },
    infoValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right', flexShrink: 1 },
    infoValueMono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },
    copyBtn: { padding: 2 },

    // ── Khối 1 ví (2 ví: cơ bản + Phượng Hoàng) ──────────────────────────────
    walletBlock: {
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        paddingBottom: 4,
    },
    walletBlockHead: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingTop: 13, paddingBottom: 4,
    },
    walletBlockIcon: {
        width: 30, height: 30, borderRadius: 15,
        alignItems: 'center', justifyContent: 'center',
    },
    walletBlockHeadBody: { flex: 1 },
    walletBlockTitle: { fontSize: 14, fontWeight: '800' },
    walletBlockSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
    walletBalRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
    },
    walletBalItem: { fontSize: 13, fontWeight: '700', color: COLORS.text },
    walletBalUnit: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
    walletBalDot: { fontSize: 13, color: COLORS.textMuted },

    walletNote: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: COLORS.bgWarm,
    },
    walletNoteText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: COLORS.textMuted },
    walletNoteStrong: { fontWeight: '700', color: COLORS.textSub },
    assetMoreCard: {
        width: (width - 56) / 2.3,
        backgroundColor: COLORS.card,
        borderRadius: 16, padding: 14,
        borderWidth: 1.5, borderColor: 'rgba(55,71,79,0.22)', marginRight: 10,
        shadowColor: COLORS.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10, elevation: 2,
    },
    tokenTapHint: { position: 'absolute', right: 8, top: 10 },
    lampRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    lampRowName: { flex: 1, fontSize: 14, color: COLORS.text },
    lampRowSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
    lampRowVal: { fontSize: 15, fontWeight: '800', color: COLORS.text },
    lampTotalVal: { fontSize: 20, fontWeight: '900', color: COLORS.accent },
    lampClaimBtn: { marginTop: 16, backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    lampClaimTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
    lampClaimSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    lampNoticeBtn: {
        marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
        borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14,
    },
    lampNoticeTxt: { fontSize: 14, fontWeight: '700', color: COLORS.text },
    lampNoticeSub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 },
    lampNote: { fontSize: 12, color: COLORS.textMuted, marginTop: 12, lineHeight: 18 },
    assetSheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 28 },
    assetSheetTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
    assetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
    assetName: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
    assetVal: { fontSize: 15, fontWeight: '700', color: COLORS.text },
    assetHint: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 12, lineHeight: 18 },
    assetClose: { marginTop: 16, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.accent },
    assetCloseTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
    explorerBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    explorerSheet: {
        backgroundColor: COLORS.bg,
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 28,
    },
    explorerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textMuted,
        marginBottom: 12,
    },
    explorerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
    },
    explorerItemText: { fontSize: 16, color: COLORS.text },
    explorerCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
    explorerCancelText: { fontSize: 15, color: COLORS.textMuted, fontWeight: '600' },

    // Menu item
    menuItem: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 13,
        borderBottomWidth: 1, borderBottomColor: COLORS.border,
        gap: 12,
    },
    menuIconWrap: {
        width: 36, height: 36, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    menuItemBody: { flex: 1 },
    menuLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
    menuSublabel: { fontSize: 12, color: COLORS.textMuted },
    menuBadge: {
        minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10,
        backgroundColor: COLORS.error,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 4,
    },
    menuBadgeText: {
        color: COLORS.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.3,
    },

    // Top-up button
    topupBtn: {
        backgroundColor: COLORS.accent,
        borderRadius: 16, paddingVertical: 16, paddingHorizontal: 18,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        overflow: 'hidden', position: 'relative',
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14,
        elevation: 6,
    },
    topupBtnTitle: { fontSize: 14, fontWeight: '700', color: COLORS.white },
    topupBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 },

    // Logout button
    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 14,
        borderRadius: 14, borderWidth: 1.5,
        borderColor: `${COLORS.error}33`,
        backgroundColor: `${COLORS.error}08`,
    },
    logoutText: { fontSize: 15, fontWeight: '700', color: COLORS.error },

    btnShine: {
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '50%', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 14,
    },
});

export default AccountScreen;