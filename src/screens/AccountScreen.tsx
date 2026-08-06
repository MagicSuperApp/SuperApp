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
} from 'react-native';
// RN 0.84 đã gỡ Clipboard khỏi core → dùng package cộng đồng (API setString giữ nguyên).
import Clipboard from '@react-native-clipboard/clipboard';
import { logoutUser, selectChainWallet, selectChainWallets } from '../store/userSlice';
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
import { showInfo } from '../utils/alert';
import { useNavigation } from '@react-navigation/native';
import { showWarning } from '../utils/alert';
import { getVersion, getBuildNumber } from 'react-native-device-info';
// Debug host = backend field-reid THẬT app đang dùng (ORILIFE_BASE), không phải
// aladin-api (backend Lợi deprecated) — để field soi đúng server (Lỗi field #5).
import { ORILIFE_BASE } from '../services/orilifeBase';
import { fmtLamp } from '../utils/token';
import taad from '../sdk/taadEnclave';
import { getStoredMasterKek } from '../services/masterKekStore';
import LanguagePickerModal from '../components/LanguagePickerModal';
import { LANGUAGES, useLanguage } from '../i18n';

// 0 = preprod (testnet), khớp WALLET_NETWORK bên register + PhoenixWalletScreen.
const WALLET_NETWORK = 0;

// Version THẬT đọc từ bundle (CFBundleShortVersionString / versionName + build number).
// Thay chuỗi hard-code "Aladin v1.0.0" (Lỗi field #4) — để field biết đúng build đang chạy.
const APP_VERSION_LABEL = `Aladin v${getVersion()} (${getBuildNumber()})`;

// Chi tiết debug (tap version 5 lần): version + server API đang trỏ → field tự soi
// máy có chạy đúng build + đúng server không (chẩn đoán 404 farm — Lỗi field #5).
const APP_DEBUG_INFO = `${APP_VERSION_LABEL}\n\nMáy chủ: ${ORILIFE_BASE}\nNền: ${Platform.OS}`;
import { Switch } from 'react-native';
const { width } = Dimensions.get('window');

// ── Token Balance Card ────────────────────────────────────────────────────────
const TokenCard = ({
    icon, label, value, unit, color, desc, index,
}: {
    icon: string; label: string; value: any;
    unit: string; color: string; desc: string; index: number;
}) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(12)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: index * 80, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: index * 80, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
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

function networkLabel(net: NetKind): string {
    if (net === 'mainnet') return 'Cardano Mainnet';
    if (net === 'preprod') return 'Cardano Preprod (Testnet)';
    if (net === 'preview') return 'Cardano Preview (Testnet)';
    return 'Đang xác định';
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
        sub: 'Hệ thống giữ hộ — gắn với DID',
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
                <Text style={styles.walletBalItem}>{b.carp ?? 0} <Text style={styles.walletBalUnit}>CARP</Text></Text>
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

    return (
        <TouchableOpacity
            activeOpacity={1}
            onPress={onPress}
            onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.985, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
        >
            <Animated.View style={[
                styles.menuItem,
                last && { borderBottomWidth: 0 },
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
                {!trailing && showArrow && <Icon name="chevron-right" size={18} color={COLORS.accentLight} />}
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
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const kek = await getStoredMasterKek();
                if (!kek) return;
                const addr = await taad.deriveWalletAddress(kek, 0, WALLET_NETWORK);
                if (alive && addr) setLocalAddr(addr);
            } catch { /* giữ null → hiện "—" */ }
        })();
        return () => { alive = false; };
    }, []);

    // Ưu tiên địa-chỉ từ chuỗi (chainWallet), rồi local-derive, rồi các nguồn cũ.
    const walletAddress =
        chainWallet?.address ?? localAddr ?? phoenixKey?.walletAddress ?? user?.walletAddress ?? '';
    // Mạng: ưu tiên resolveNetwork (theo DID thật), else suy từ tiền tố địa chỉ ví. KHÔNG hardcode.
    const realNet: NetKind = normNetwork(network) ?? netFromAddress(walletAddress);

    const did = phoenixKey?.did ?? user?.did ?? '';
    // Modal "Tài sản khác" (ADA + token khác + hợp đồng còn hạn).
    const [assetsOpen, setAssetsOpen] = useState(false);
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
            'Dùng khi bạn MẤT thiết bị hoặc mất khoá. Hệ thống khôi phục lại CHÍNH danh tính (DID) cũ ' +
            'của bạn thông qua người bảo trợ và thời-gian-chờ an toàn — không tạo danh tính mới, ' +
            'không mất liên kết với cây/dữ-liệu đã ghi. Tính năng đang phát triển; nếu bạn mất thiết bị, ' +
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
            'Dùng khi bạn NGHI khoá bị lộ nhưng vẫn còn giữ thiết bị. Hệ thống thay bộ khoá điều-khiển ' +
            'bằng bộ khoá mới và cập nhật lên Cardano — danh tính (DID) của bạn GIỮ NGUYÊN. ' +
            'Luồng tráo khoá an toàn đang được đội kỹ thuật hoàn thiện để tránh rủi ro mất quyền truy cập ' +
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
                                    {(user?.did ?? user?.id) || 'Chưa có DID'}
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
                    <View style={styles.didBadge}>
                        <Icon name="shield-check-outline" size={12} color={COLORS.success} />
                        <Text style={styles.didBadgeText}>DID đã xác minh</Text>
                    </View>
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
                        />
                        {/* CARP — token hệ sinh thái thứ 3. TODO brand: icon/màu tạm; số dư chờ API Phoenix. */}
                        <TokenCard
                            index={2}
                            icon="fish"
                            label="CARP"
                            value={chainWallet?.carpBalance}
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
                            <InfoRow
                                icon="wallet-outline"
                                label="Địa chỉ ví (giữ tài sản)"
                                value={walletAddress}
                                copyable mono
                                explorerNet={walletAddress ? realNet : null}
                            />
                        )}
                        <InfoRow
                            icon="identifier"
                            label="DID"
                            value={did}
                            copyable mono
                        />
                        {/* Địa-chỉ-2: khoá ĐIỀU-KHIỂN DID (quản-trị, KHÔNG giữ tài sản). Chỉ hiện khi backend trả về. */}
                        {!!controllerPkh && (
                            <InfoRow
                                icon="key-outline"
                                label="Khoá điều-khiển (quản-trị DID)"
                                value={controllerPkh}
                                copyable mono
                            />
                        )}
                        <InfoRow
                            icon="shield-key-outline"
                            label="Chuẩn khoá"
                            value="PhoenixKey v1"
                        />
                        <InfoRow
                            icon="earth"
                            label="Mạng"
                            value={networkLabel(realNet)}
                        />
                        <View style={styles.walletNote}>
                            <Icon name="information-outline" size={13} color={COLORS.textMuted} />
                            <Text style={styles.walletNoteText}>
                                <Text style={styles.walletNoteStrong}>Basic Wallet</Text> you hold the keys yourself (recovery via a 24-word phrase) — used to receive and transfer assets.{' '}
                                <Text style={styles.walletNoteStrong}>Phoenix Wallet</Text> is managed by the system according to the DID — used for activation and services.
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
                            label="Ví PhoenixKey"
                            sublabel="Số dư ADA/LAMP/MAGIC + địa chỉ Cardano (từ cụm 24 từ)"
                            onPress={() => navigation.navigate('PhoenixWallet')}
                        />
                        <MenuItem
                            icon="card-account-details-outline"
                            label="Xuất danh tính"
                            sublabel="Xem/copy DID, khoá công khai, địa chỉ ví"
                            onPress={() => navigation.navigate('ExportIdentity')}
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
                        <MenuItem
                            icon="backup-restore"
                            label="Tái sinh danh tính"
                            sublabel="Khôi phục DID khi MẤT thiết bị (giữ danh tính cũ)"
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
                        <MenuItem icon="help-circle-outline" label="Trung tâm hỗ trợ" />
                        <MenuItem icon="file-document-outline" label="Điều khoản & Chính sách" />
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
                    <TouchableOpacity style={styles.topupBtn} activeOpacity={0.88}>
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