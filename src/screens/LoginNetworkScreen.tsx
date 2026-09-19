// screens/LoginNetworkScreen.tsx
//
// Màn đăng nhập MẠNG LƯỚI — bản thay cho `LoginScreen.tsx`.
//
// ── Vì sao có màn này thay vì sửa màn cũ ────────────────────────────────────
// Màn cũ kể quá nhiều chuyện cùng lúc: khu hero có logo, nhãn, tiêu đề, phụ đề,
// nút đổi ngôn ngữ, nút đổi tài khoản; tấm trắng bên dưới có nút sinh trắc, thẻ
// giải thích DID, lối đăng ký, khu tin tức, dòng chân trang. Người mở app ra chỉ
// định làm MỘT việc — đặt ngón tay vào để vào — mà phải đọc lướt qua chín khối
// trước khi tìm thấy chỗ đặt.
//
// Màn này chỉ còn đúng một việc đó. Không một chữ nào: nền, mạng lưới, và một
// vòng tròn ở giữa.
//
// Màn cũ GIỮ NGUYÊN trong kho, không xoá. Đổi lại chỉ cần sửa một dòng import ở
// `navigation/index.tsx` — xem chú thích tại chỗ đăng ký tuyến `Login`.
//
// ── Toàn bộ phần hiển thị nằm trong một mặt vẽ OpenGL ───────────────────────
// Nền, mạng lưới, vòng tròn và hình vân tay/khuôn mặt đều do three.js vẽ trên
// `expo-gl` (`features/loginNetwork/doHoa.ts`). Không một `<View>` có màu nào
// nằm trên mặt vẽ.
//
// Hai lớp `<View>` duy nhất ở đây đều TRONG SUỐT và chỉ để nhận cú chạm — bắt
// buộc phải thế: bề mặt GL tự nuốt cú chạm và không cho nó nổi lên (kho này đã
// vá hai lần vì đúng chuyện đó, xem `features/space3d/glTouchShield.gate.test.ts`).
//
// ── Ba tệp, ba việc ─────────────────────────────────────────────────────────
//   mangLuoi.ts  chuyển động và làn sáng — số học thuần, kiểm được bằng bài kiểm
//   doHoa.ts     shader và hình học three.js
//   tệp này      luồng sinh trắc học + nối hai thứ trên vào vòng vẽ

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getBuildNumber, getVersion } from 'react-native-device-info';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import {
  primaryCta,
  readIdentityPresence,
  routeForPresence,
  type IdentityPresence,
} from '../features/loginNetwork/identityPresence';
import { useDispatch } from 'react-redux';

import GLErrorBoundary from '../components/GLErrorBoundary';
import LanguagePickerModal from '../components/LanguagePickerModal';
import { useAnalytics } from '../services/analytics';
import { useBiometricSensor } from '../hooks/useBiometricSensor';
import { biometricKindFromType, phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import {
  isAvailable as isPhoenixKeyAvailable,
  PhoenixKeyNativeError,
} from '../services/phoenixKey-native';
import { signRaw, wipeIdentity } from '../sdk/phoenixKey';
import { loginUser } from '../store/userSlice';
import { showError } from '../utils/alert';
import { LANGUAGES, t, useLanguage } from '../i18n';
import { AUTH_COLORS, NEUTRAL, WORK_THEME } from '../theme';
import { DEFAULT_INSTANCE } from '../config/instance.config';
import { BrandLockup } from '../components/BrandLockup';
import {
  batLanTruyen,
  buoc,
  daSangHet,
  buongCham,
  datCham,
  doiKhung,
  duyetCanh,
  taoMangLuoi,
  type MangLuoi,
} from '../features/loginNetwork/mangLuoi';
import {
  dungDoHoa,
  CO_CHAM,
  CO_CHAM_NHANH,
  type BangMau,
} from '../features/loginNetwork/doHoa';

/** Yêu cầu ghi "khoảng 100 chấm". */
const SO_NUT = 100;

/**
 * Lớp BỤI: thêm 50 chấm nữa, nhỏ hơn và nhanh hơn hẳn lớp trên.
 *
 * Chúng không nối dây và không truyền làn sáng (lý do ở `mangLuoi.ts`), nên cái
 * chúng thêm vào là chuyển động chứ không phải mật độ: mạng lưới giữ nguyên hình
 * của nó, và phía sau có một lớp bay nhanh làm màn hình sâu hơn.
 *
 * Một NỬA số chấm thường. Lớp này đi nhanh gấp hơn hai chục lần, nên nó chiếm
 * chỗ trong mắt nhiều hơn hẳn phần nó chiếm trong đếm đầu: để ngang số với lớp
 * thường thì cái đọc ra là một màn đầy chấm bay, và mạng lưới đứng sau nó.
 */
const SO_NUT_NHANH = 50;

/** Tổng số chấm phải vẽ — cỡ mọi bộ đệm của `doHoa`. */
const TONG_NUT = SO_NUT + SO_NUT_NHANH;

/**
 * Đường kính nút sinh trắc.
 *
 * To hơn hẳn nút của màn cũ (94 px): màn này không có một chữ nào chỉ đường,
 * không có nhãn dưới nút, và nền thì đầy chấm chuyển động — nút phải tự nói
 * được rằng nó là thứ duy nhất để bấm. 128 px là cỡ giữ được điều đó mà vẫn
 * không lấn vào khu logo ở trên hay dòng phiên bản ở dưới trên máy nhỏ.
 */
const CO_NUT = 128;

/** Nửa cạnh vùng bấm. Suy TỪ cỡ nút chứ không gõ một số thứ hai: hai số rời nhau
 *  thì sớm muộn cũng trôi khỏi nhau, và lúc ấy nút bấm trượt mà nhìn vẫn đúng chỗ. */
const NUA_NUT = CO_NUT / 2 + 10;

/** Kiểu cảm biến quyết định biểu tượng giữa nút. */
type KieuSinhTrac = 'face' | 'fingerprint';

/**
 * Bảng màu của mặt vẽ. KHÔNG có khoá nền: nền là màu xoá nền của `<Canvas>`, và
 * không lớp nào vẽ ra nó — xem đầu `doHoa.ts`. Cũng không còn khoá nút: nút nay
 * là một thành phần React Native nằm đè lên mặt vẽ.
 */
const BANG_MAU: BangMau = {
  loi: NEUTRAL.white,
  quang: WORK_THEME.primaryLight,
};

/**
 * Dòng phiên bản ở đáy màn.
 *
 * Đọc từ BUNDLE (`CFBundleShortVersionString` / `versionName` + số build), không
 * gõ cứng. Màn đăng nhập cũ ghi thẳng `v2.0.0` vào chuỗi chân trang — đó đúng là
 * lỗi mà `AccountScreen` đã phải gỡ một lần: người thử báo lỗi kèm một số hiệu
 * không chỉ về bản dựng nào cả.
 */
const DONG_PHIEN_BAN = `v${getVersion()} (${getBuildNumber()})`;

// ── Cảnh GL ─────────────────────────────────────────────────────────────────

interface CanhProps {
  mangRef: React.MutableRefObject<MangLuoi | null>;
  tamRef: React.MutableRefObject<{ x: number; y: number }>;
  mau: BangMau;
  onSangHet: () => void;
}

const Canh: React.FC<CanhProps> = ({ mangRef, tamRef, mau, onSangHet }) => {
  const { camera, size, gl } = useThree();
  // `SO_NUT` (chứ không `TONG_NUT`) là sức chứa lớp dây: chỉ lớp thường nối dây.
  const doHoa = useMemo(() => dungDoHoa(TONG_NUT, mau, SO_NUT), [mau]);
  const daBao = useRef(false);
  // Cỡ chấm là thuộc tính TĨNH, nạp lên máy đúng một lần sau khi mạng đã dựng.
  const daCo = useRef(false);

  useEffect(() => () => doHoa.huy(), [doHoa]);

  /**
   * Máy quay CHIẾU THẲNG, khung đúng bằng pixel bố cục, và `top = 0` /
   * `bottom = cao` nên trục y hướng XUỐNG.
   *
   * Nhờ vậy toạ độ ở mọi tầng là MỘT hệ: `locationX/locationY` của cú chạm, toạ
   * độ trong `mangLuoi.ts`, và toạ độ thế giới của three.js đều trùng nhau. Đổi
   * trục ở giữa là mời một dấu trừ đi lạc mà không ai thấy.
   */
  useEffect(() => {
    const c = camera as THREE.OrthographicCamera;
    c.left = 0;
    c.right = size.width;
    c.top = 0;
    c.bottom = size.height;
    c.near = -100;
    c.far = 100;
    c.position.set(0, 0, 10);
    c.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  // Dựng mạng lưới lần đầu, và co giãn khi khung đổi (xoay máy).
  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const m = mangRef.current;
    if (!m) {
      mangRef.current = taoMangLuoi(
        size.width,
        size.height,
        SO_NUT,
        Math.random,
        SO_NUT_NHANH,
      );
      daCo.current = false;
    } else doiKhung(m, size.width, size.height);
    tamRef.current = { x: size.width / 2, y: size.height / 2 };
  }, [size.width, size.height, mangRef, tamRef]);

  useFrame((_, dt) => {
    const m = mangRef.current;
    if (!m) return;

    buoc(m, dt);

    doHoa.datDpr(typeof gl.getPixelRatio === 'function' ? gl.getPixelRatio() : 1);

    // ── Cỡ chấm, một lần ────────────────────────────────────────────────────
    // Không nằm ở `dungDoHoa` được: cỡ tuỳ chấm thuộc lớp nào, mà lúc dựng đồ
    // hoạ thì mạng lưới chưa có (nó chờ số đo khung). Đặt ở đây là chỗ sớm nhất
    // biết đủ cả hai.
    if (!daCo.current) {
      for (let i = 0; i < m.nut.length; i++) {
        const n = m.nut[i];
        doHoa.coCham[i] = n.co * (n.nhanh ? CO_CHAM_NHANH : CO_CHAM);
      }
      doHoa.xongCo();
      daCo.current = true;
    }

    // ── Chấm ────────────────────────────────────────────────────────────────
    for (let i = 0; i < m.nut.length; i++) {
      const n = m.nut[i];
      doHoa.viTriCham[i * 3] = n.x;
      doHoa.viTriCham[i * 3 + 1] = n.y;
      doHoa.viTriCham[i * 3 + 2] = 0;
      doHoa.sangCham[i] = n.sang;
    }
    doHoa.xongCham();

    // ── Dây nối ─────────────────────────────────────────────────────────────
    let k = 0;
    duyetCanh(m, (a, c, manh, sang) => {
      const p = k * 6;
      doHoa.viTriDuong[p] = a.x;
      doHoa.viTriDuong[p + 1] = a.y;
      doHoa.viTriDuong[p + 2] = 0;
      doHoa.viTriDuong[p + 3] = c.x;
      doHoa.viTriDuong[p + 4] = c.y;
      doHoa.viTriDuong[p + 5] = 0;
      // Mờ theo khoảng cách, và bật hẳn lên khi CẢ HAI đầu đã được thắp.
      const a2 = Math.min(manh * (0.24 + 0.86 * sang), 1);
      doHoa.sangDuong[k * 2] = a2;
      doHoa.sangDuong[k * 2 + 1] = a2;
      k++;
    });
    doHoa.xongDuong(k);

    // Vệt đọc vị trí vừa ghi ở trên, nên nó phải chạy SAU `xongCham`.
    doHoa.ghiVet();

    // Báo MỘT lần: `useFrame` chạy 60 lần mỗi giây, gọi điều hướng ở đây mà
    // không chốt cờ là đẩy 60 lần chuyển màn trong một giây.
    if (!daBao.current && daSangHet(m)) {
      daBao.current = true;
      onSangHet();
    }
  });

  return <primitive object={doHoa.goc} />;
};

// ── Nút sinh trắc ───────────────────────────────────────────────────────────

/**
 * Nút ở giữa màn: đĩa xanh cùng màu nền + VIỀN TRẮNG + biểu tượng thật.
 *
 * ── Vì sao là React Native chứ không phải một hình trong mặt vẽ ────────────
 * Bản trước vẽ nút bằng hình học three.js, kể cả dấu vân tay — năm cung tròn
 * lồng nhau. Nó chỉ GỢI ra một dấu vân tay; bộ biểu tượng của app có sẵn hình
 * đúng, và người dùng đã quen hình đó ở mọi màn khác. Vẽ lại một hình gần giống
 * là bắt họ học một ký hiệu thứ hai cho cùng một việc.
 *
 * Viền cũng dễ hơn hẳn: `LineBasicMaterial.linewidth` bị OpenGL ES làm ngơ nên
 * viền trong mặt vẽ phải dựng bằng một vành mesh, còn ở đây nó là `borderWidth`.
 *
 * ── Bloom: chép đúng ba con số của `LoginScreen#BioButton` ─────────────────
 * phóng 1 → 1,6 · mờ 0,45 → 0 · chu kỳ 1400 ms, tăng tốc `Easing.out(ease)`.
 *
 * Hai khác biệt có chủ ý so với bản cũ:
 *   · vòng bloom là VÀNH TRẮNG, không phải đĩa xanh. Nền ở đây đã là xanh, nên
 *     một đĩa xanh trên nền xanh là vô hình.
 *   · nó chạy LIÊN TỤC, bản cũ chỉ chạy khi `busy`. Ở màn cũ nút nằm giữa một
 *     tấm trắng đầy chữ nên đã tự nổi; ở đây nó là vật thể duy nhất trên một nền
 *     tối, và một đĩa đứng im không nói được rằng nó bấm được.
 */
const NutSinhTrac: React.FC<{
  kieu: KieuSinhTrac;
  nen: string;
  busy: boolean;
  onPress: () => void;
}> = ({ kieu, nen, busy, onPress }) => {
  const song = useRef(new Animated.Value(0)).current;
  const nhan = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const vong = Animated.loop(
      Animated.timing(song, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    vong.start();
    // Dừng vòng lặp khi tháo — thiếu bước này thì `Animated` giữ tham chiếu và
    // cảnh báo cập nhật trạng thái sau khi thành phần đã biến mất.
    return () => vong.stop();
  }, [song]);

  return (
    <View style={styles.nutBoc} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.nutSong,
          {
            opacity: song.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [
              { scale: song.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
            ],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: nhan }] }}>
        <Pressable
          testID="login-biometric-button"
          accessibilityRole="button"
          accessibilityLabel={
            kieu === 'face' ? t('Đăng nhập bằng khuôn mặt') : t('Đăng nhập bằng vân tay')
          }
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPressIn={() =>
            Animated.spring(nhan, { toValue: 0.94, useNativeDriver: true }).start()
          }
          onPressOut={() =>
            Animated.spring(nhan, { toValue: 1, friction: 4, useNativeDriver: true }).start()
          }
          onPress={onPress}
          style={[styles.nut, { backgroundColor: nen }]}
        >
          <Icon
            name={kieu === 'face' ? 'face-recognition' : 'fingerprint'}
            size={Math.round(CO_NUT * 0.52)}
            color={NEUTRAL.white}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
};

// ── Màn hình ────────────────────────────────────────────────────────────────

const LoginNetworkScreen: React.FC = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const { trackPress, trackAction } = useAnalytics('LoginNetworkScreen');

  // `available === null` = CHƯA dò xong; phân biệt với `false` (dò xong, máy
  // không có cảm biến) để nút không loé sang trạng thái tắt ở mấy khung đầu.
  const { available: sensorAvailable, biometryType } = useBiometricSensor(
    (msg, e) => console.log(`[LoginNetwork] ${msg}:`, e),
  );
  const [busy, setBusy] = useState(false);

  /**
   * Đọc LẠI mỗi lần màn này được nhìn thấy, không chỉ lúc gắn.
   *
   * Người dùng rời màn này sang `IdentityEntryChoice` → tạo hoặc khôi phục danh
   * tính → quay về. Đọc một lần lúc gắn thì lúc quay về nút vẫn mời họ "đăng ký"
   * một lần nữa, và lối đó dẫn tới một DID THỨ HAI.
   */
  const [identityPresence, setIdentityPresence] = useState<IdentityPresence>('unknown');
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const presence = await readIdentityPresence();
          if (!cancelled) setIdentityPresence(presence);
        } catch (e) {
          // Đọc HỎNG không được đọc thành "máy chưa có danh tính". Hai thứ đó
          // khác nhau, và đoán sai theo chiều ấy đẩy người ĐÃ có tài khoản vào
          // màn lập tài khoản thứ hai — chỗ mà cái sai không kêu lên, vì danh
          // sách vườn rỗng trùng khớp với "tôi chưa ghi gì".
          if (!cancelled) setIdentityPresence('unknown');
          console.warn('[LoginNetwork] không đọc được trạng thái danh tính:', e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  /** Nhãn + đích + trạng thái bấm được của nút dưới đáy. Một nguồn, ba thứ. */
  const cta = primaryCta(identityPresence);

  const insets = useSafeAreaInsets();
  const lang = useLanguage();
  // Đổi ngôn ngữ NGAY tại màn đăng nhập, không phải đăng nhập vào mới đổi được —
  // người chưa có tài khoản thì không có đường nào khác để tới phần Cài đặt.
  const [moChonNgonNgu, setMoChonNgonNgu] = useState(false);
  const ngonNgu = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  /**
   * Bề ngang CỤM NHẬN DIỆN — tính thẳng từ bề ngang màn, KHÔNG đo bằng `onLayout`.
   *
   * `styles.dinh` chừa 76 mỗi bên, nên bề ngang dùng được là `W − 152`, chặn trên
   * bằng 244. Đo bằng `onLayout` thì khung đầu tiên nhận số 0 và cả cụm nhấp nháy
   * một nhịp ở đúng màn người dùng nhìn lâu nhất — trước đây không thấy vì con số
   * ấy chỉ dùng để căn chữ, nay nó quyết cả kích thước hai ảnh.
   *
   * Phép căn khẩu hiệu dưới chữ hiệu ĐÃ CHUYỂN vào `components/BrandLockup`: nó là
   * việc của cụm, không phải việc của màn này, và ba màn đều cần nó. Cái còn lại ở
   * đây là dòng BA ĐỨC TÍNH — căn theo bề ngang CẢ CỤM, không theo chữ hiệu.
   */
  const { width: rongMan } = useWindowDimensions();
  const rongCum = Math.max(0, Math.min(244, rongMan - 152));
  const virtues = DEFAULT_INSTANCE.virtues?.[lang] ?? null;

  const mangRef = useRef<MangLuoi | null>(null);
  const tamRef = useRef({ x: 0, y: 0 });

  const noSensor = sensorAvailable === false;
  const bioKind = biometricKindFromType(biometryType);
  /** `strong` (Android, cảm biến mạnh không rõ loại) vẽ vân tay — đó là hình mà
   *  gần như mọi máy Android dùng nó đang dùng thật. */
  const kieu: KieuSinhTrac = bioKind === 'face' ? 'face' : 'fingerprint';

  /**
   * Nền tràn màn — xanh lá đặc, không chuyển sắc.
   *
   * Đọc TRONG thân component chứ không chụp ở tầng module: `AUTH_COLORS` là một
   * nhánh của theme đang chạy, và `setActiveThemeConfig` ghi đè nó TẠI CHỖ. Một
   * hằng ở tầng module sẽ giữ mãi màu của app nạp đầu tiên — đúng cái bẫy mà
   * `trace/theme/depth.ts` phải chuyển sang getter để gỡ.
   */
  const nen = AUTH_COLORS.canvas;

  /**
   * Mở đường ĐĂNG KÝ.
   *
   * Đích là `IdentityEntryChoice`, KHÔNG phải `SignUpBiometric` — tức màn HỎI,
   * không phải màn tạo mới. Đó là cùng một đích mà nút sinh trắc dùng khi máy
   * chưa có danh tính, và lý do thì đã ghi ở `runBiometric`: "đăng ký" ở đây gộp
   * ba luồng khác hẳn nhau — người mới, người đổi điện thoại, người đang có một
   * app khác cùng nhóm trên chính máy này. Đi thẳng vào màn tạo mới là chọn hộ
   * người dùng một trong ba, và hai trong ba lần chọn đó sai mà cái sai KHÔNG
   * kêu lên: họ có một DID thứ hai, danh sách vườn hiện rỗng, và rỗng thì trùng
   * khớp với "tôi chưa ghi gì".
   */
  const moDangKy = useCallback(() => {
    trackPress('identity_entry_cta', { action: 'open_entry_choice' });
    navigation.navigate('IdentityEntryChoice' as never);
  }, [navigation, trackPress]);

  /**
   * Đưa nút dưới đáy tới ĐÚNG đích của trạng thái máy — chủ nhân chốt 2026-09-16.
   *
   * Khối chú thích ngay trên (`moDangKy`) nói vì sao "đăng ký" phải qua màn HỎI,
   * và lý do đó VẪN ĐÚNG với những gì nó tả: ba luồng gộp vào một chữ. Chỗ nó
   * hụt là nó coi ba luồng ấy đều không đo được, trong khi hai trong ba thì đo
   * được ngay trên máy — xem `identityPresence.ts`. Câu hỏi chỉ còn được đặt ở
   * trạng thái app thật sự không biết.
   *
   * `signUpNew` đi THẲNG `SignUpBiometric` và KHÔNG phải là lối duy nhất của
   * trạng thái đó: dòng chữ phụ ngay dưới nút vẫn mở màn hỏi, cho người đổi
   * điện thoại — máy mới của họ cũng đo ra "không có gì".
   *
   * ⚠ KHÔNG bọc hàm này bằng `useCallback`. Nó gọi `runBiometric`, mà `runBiometric`
   * là hàm thường của thân component: mỗi lượt vẽ lại sinh một bản mới, đóng bao
   * quanh giá trị `busy` của ĐÚNG lượt vẽ ấy. Bọc `useCallback` thì bản `runBiometric`
   * bị chụp cứng ở lượt vẽ cuối cùng mà danh sách phụ thuộc đổi — và `busy` trong bản
   * chụp đó mãi mãi là `false`. Hậu quả không hiện ra ở đây mà ở `runBiometric`: chốt
   * `if (busy || noSensor) return` đọc một biến đã đóng băng, nên chạm lần thứ hai
   * trong lúc hộp sinh trắc đang mở vẫn chạy trọn một lượt đăng nhập thứ hai chồng lên
   * lượt đầu. Nút dưới đáy KHÔNG tự chặn hộ: `cta.disabled` chỉ đo trạng thái máy.
   *
   * Đây là hồi quy đã xảy ra thật một lần, ở đúng chỗ này, và không phép kiểm nào bắt
   * được vì không tệp kiểm nào nạp màn này. Muốn memo hoá thì phải dời khai báo
   * `runBiometric` lên trên và đưa nó vào danh sách phụ thuộc — đừng tắt luật
   * `exhaustive-deps` để giữ nguyên thứ tự.
   */
  const theoCta = () => {
    switch (cta.action) {
      case 'unlock':
        return runBiometric();
      case 'restoreByDeviceKey':
        trackPress('identity_entry_cta', { action: 'restore_by_device_key' });
        return navigation.navigate('RestoreIdentity' as never);
      case 'signUpNew':
        trackPress('identity_entry_cta', { action: 'sign_up_new' });
        return navigation.navigate('SignUpBiometric' as never);
      case 'openEntryChoice':
        return moDangKy();
      default:
        return undefined;
    }
  };

  const vaoMain = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] });
  }, [navigation]);

  /**
   * Bám theo ngón tay — không chỉ điểm chạm đầu tiên.
   *
   * Bản trước chỉ đọc `onStartShouldSetPanResponder` rồi trả `false`, tức nó lấy
   * đúng MỘT toạ độ rồi buông cử chỉ. Kéo tay đi thì mạng lưới vẫn xoay quanh
   * chỗ đặt ngón ban đầu. Nay cử chỉ được GIỮ (`true`), nên `onPanResponderMove`
   * chạy suốt lượt kéo và các chấm đi theo vị trí thật của ngón.
   *
   * Thả tay → `buongCham` → các chấm lập tức hướng về ô lưới của chúng.
   *
   * Dùng `PanResponder` chứ không dùng hệ sự kiện của react-three-fiber: hệ đó
   * cần cắt tia qua camera và các vật thể, mà ở đây chẳng có vật thể nào để cắt
   * trúng — nền là một tấm phẳng, còn chấm là điểm. `locationX/locationY` cho
   * thẳng toạ độ pixel, đúng hệ mà mô phỏng đang dùng.
   */
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => {
          const m = mangRef.current;
          if (!m) return false;
          // Nhường hẳn vùng nút cho `Pressable` bên trên. Về lý thì không cần —
          // `Pressable` nằm sau trong cây nên nó là đích của cú chạm — nhưng một
          // cú chạm trượt mép nút mà lại kéo cả mạng lưới đi thì người dùng đọc
          // ra "bấm không ăn", đúng triệu chứng khó lần nhất.
          const { locationX: x, locationY: y } = e.nativeEvent;
          const t2 = tamRef.current;
          if (Math.abs(x - t2.x) <= NUA_NUT && Math.abs(y - t2.y) <= NUA_NUT) return false;
          datCham(m, x, y);
          return true;
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderMove: (e) => {
          const m = mangRef.current;
          if (!m) return;
          datCham(m, e.nativeEvent.locationX, e.nativeEvent.locationY);
        },
        onPanResponderRelease: () => {
          const m = mangRef.current;
          if (m) buongCham(m);
        },
        // Cử chỉ bị thứ khác giành mất (điều hướng vuốt-back) cũng phải thả —
        // thiếu nhánh này thì mạng lưới đứng nguyên quanh một ngón tay đã rời màn.
        onPanResponderTerminate: () => {
          const m = mangRef.current;
          if (m) buongCham(m);
        },
      }),
    [],
  );

  /**
   * Cửa xác nhận cuối cho lối BỎ HẲN một danh tính mà khoá đã chết.
   *
   * Nó nói MẤT GÌ bằng lời người dùng đọc được, không nói "xoá khoá". Người ở đây
   * không quan tâm cái gì nằm trong chip; họ cần biết chuyện gì xảy ra với vườn
   * của họ. Ba vế bắt buộc, không vế nào được bỏ cho câu ngắn hơn:
   *   1. tài khoản này bỏ hẳn — bạn thành một người hoàn toàn mới;
   *   2. dữ liệu gắn tài khoản cũ KHÔNG đi theo;
   *   3. còn 24 từ thì vẫn lấy lại được, không có thì hết đường.
   *
   * Vì sao phải HAI cửa chứ không một: cửa trước là một hộp thoại ba nút, và người
   * đọc nó đang bực vì vừa không đăng nhập được. Một lần chạm nhầm ở đó không được
   * phép là một danh tính mất hẳn.
   */
  const confirmAbandonDeadIdentity = () => {
    showError(
      t('Bỏ hẳn tài khoản này?'),
      t('Tài khoản cũ sẽ bỏ hẳn và bạn bắt đầu lại như một người hoàn toàn mới. Vườn, cây và mọi thứ đã ghi dưới tài khoản cũ KHÔNG đi theo sang tài khoản mới. Nếu sau này bạn tìm lại được 24 từ thì vẫn lấy lại được tài khoản cũ, nhưng không có 24 từ thì không còn đường nào khác.'),
      {
        confirmText: t('Bỏ hẳn, tôi hiểu'),
        cancelText: t('Giữ lại'),
        onConfirm: async () => {
          try {
            // `wipeIdentity()` xoá khoá dưới nhãn đang dùng rồi trả con trỏ nhãn về
            // mặc định, nên nhãn hết "có chủ" và `enrollKeypair()` chạy được ở bước
            // sau. Không viết lại bước này: hàm đã có và đã được ba nơi khác dùng.
            await wipeIdentity();
            // Về màn HỎI, không đi thẳng sang màn tạo mới. Người vừa bấm "tôi không
            // có 24 từ" có thể tìm ra chúng ở bước sau, và từ màn hỏi thì cả hai lối
            // còn mở; đi thẳng sang tạo mới là chọn hộ họ lần thứ hai trong một phút.
            navigation.navigate('IdentityEntryChoice' as never);
          } catch (e) {
            // KHÔNG nuốt: xoá không xong thì nhãn vẫn có chủ, và bước tạo mới phía
            // sau sẽ chết bằng `E_KEY_EXISTS` ở một màn khác — xa chỗ hỏng thật.
            console.log('[LoginNetwork] wipeIdentity failed:', e);
            showError(
              t('Chưa bỏ được tài khoản cũ trên máy này'),
              t('Máy chưa xoá được khoá cũ nên tài khoản cũ vẫn còn. Hãy thử lại; nếu vẫn vậy, khởi động lại máy rồi thử một lần nữa.'),
            );
          }
        },
      },
    );
  };

  const runBiometric = async () => {
    if (busy || noSensor) return;
    // Hộp thoại sinh trắc do HỆ ĐIỀU HÀNH vẽ → không đi qua `<Text>` nên lớp tự
    // dịch không với tới; phải gọi `t()` tay.
    const prompt = t('Xác thực sinh trắc học');
    trackPress('biometric_button', {
      action: 'login_biometric',
      metadata: { kind: bioKind, biometryType: biometryType || 'unknown' },
    });
    try {
      setBusy(true);
      if (!isPhoenixKeyAvailable()) {
        showError('Chưa dùng được danh tính trên máy này');
        return;
      }

      // Máy CHƯA mở khoá được thì không hỏi sinh trắc — hỏi trước là bắt người
      // dùng xác thực cho một cái khoá không tồn tại.
      //
      // Đích thì ĐỌC TỪ TRẠNG THÁI MÁY, không còn gom hết về màn hỏi: máy còn
      // khoá trong chip mà app không biết khoá của ai thì đường đúng là màn
      // Khôi phục (nó đổi chính khoá ấy lấy DID, không hỏi người dùng gì cả);
      // máy trống trơn thì đường đúng là màn tạo mới. Xem `identityPresence.ts`.
      const presence = await readIdentityPresence();
      if (presence !== 'yes') {
        const dich = routeForPresence(presence);
        // `null` chỉ xảy ra ở `'unknown'`, mà `readIdentityPresence` không trả
        // `'unknown'` — nó NÉM. Giữ nhánh này để nếu ngày nào nó trả thì đứng
        // im một nhịp, đừng đoán một đích.
        if (dich) navigation.navigate(dich as never);
        return;
      }

      // Xác thực bằng chính KHOÁ, không bằng một cờ boolean: ký một chuỗi thử.
      // Hộp thoại do CHIP bật (BiometricPrompt gắn CryptoObject), chữ ký chỉ ra
      // khi chip đã đối chiếu xong khuôn mặt/vân tay — sửa luồng JS không đi vòng
      // được. Chữ ký không gửi đi đâu; giá trị của nó là nó KHÔNG TỒN TẠI nếu
      // chủ khoá vắng mặt.
      //
      // ⚠️ Sinh THEO TỪNG BYTE để chuỗi hex luôn CHẴN — `hexToBytes` bên native
      // đòi độ dài chẵn, và lệnh đó nằm cùng khối try với `initSign` nên độ dài
      // lẻ trả về `E_SIGN_INIT`, tức app báo "khoá hỏng" cho một khoá lành lặn.
      let nonceHex = '';
      for (let i = 0; i < 16; i++) {
        nonceHex += ((Math.random() * 256) | 0).toString(16).padStart(2, '0');
      }
      await signRaw(nonceHex, prompt, t('Xác thực để mở danh tính trên máy này'));

      const user = await phoenixKeyAuth.unlockExistingIdentity();
      if (!user) {
        // Có khoá, có DID, nhưng không dựng lại được danh tính. Dẫn sang màn HỎI
        // chứ không sang màn tạo mới: nhánh này không phân biệt được "DID cũ của
        // tôi" với "DID rác còn sót trên máy mượn", và hai thứ cần hai lối khác.
        navigation.navigate('IdentityEntryChoice' as never);
        return;
      }

      trackAction('login_success', {
        metadata: { kind: bioKind, biometryType: biometryType || 'unknown' },
      });
      // `.unwrap()`: thiếu nó thì lỗi mở cơ sở dữ liệu của người dùng bị nuốt, làn
      // sáng vẫn chạy rồi vào `Main` với `currentUser: null`. Xem khối chú thích
      // trên `loginUser` (`store/userSlice.ts`).
      await (dispatch(loginUser(user as any) as any) as any).unwrap();

      // ── Làn sáng ──────────────────────────────────────────────────────────
      // Chỉ bật SAU khi xác thực xong và phiên đã dựng. Bật sớm hơn là hứa với
      // người dùng một thứ chưa chắc xảy ra: hộp thoại sinh trắc có thể bị huỷ.
      const m = mangRef.current;
      if (m) {
        batLanTruyen(m, tamRef.current.x, tamRef.current.y);
      } else {
        // Chưa có mạng lưới (GL chưa dựng xong) thì không có gì để thắp — vào
        // thẳng, đừng để người dùng mắc kẹt ở một màn đã đăng nhập xong.
        vaoMain();
      }
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === PhoenixKeyNativeError.USER_CANCELED) return; // tự huỷ: im lặng
      if (code === PhoenixKeyNativeError.BIOMETRIC_LOCKOUT) {
        showError('Sai sinh trắc học nhiều lần nên máy đang tạm khoá. Chờ khoảng 30 giây rồi thử lại, hoặc mở khoá máy bằng mã PIN trước.');
        return;
      }
      if (code === PhoenixKeyNativeError.KEY_INVALIDATED) {
        // ── LỐI RA CHO KHOÁ ĐÃ CHẾT HẲN ──────────────────────────────────────
        // Tới được dòng này nghĩa là `signRaw` ở trên vừa CHẠY THẬT và chip trả
        // lời khoá chết vĩnh viễn (`PhoenixKeyModule.swift:210` ném mã này;
        // `PhoenixKeyModule.kt:143` bắt `KeyPermanentlyInvalidatedException` rồi
        // ném cùng mã). Đó là điều kiện duy nhất mở lối bỏ danh tính, và nó được
        // thoả BẰNG CÁCH DỰNG chứ không bằng một phép hỏi thêm:
        //
        //   · `hasKey()` KHÔNG mở được lối này, và đừng thêm nó vào đây. Nó trả
        //     lời "khe có khoá không", không trả lời "khoá còn ký được không" —
        //     lấy một tham chiếu khoá thì không cần xác thực, xác thực xảy ra lúc
        //     KÝ. Gộp hai câu đó là mời người ta xoá một khoá đang dùng tốt.
        //   · Ba trạng thái, không hai: còn ký được (đã đi tiếp ở nhánh thành công
        //     phía trên) · chết chắc (đây) · KHÔNG ĐO ĐƯỢC. Trạng thái thứ ba —
        //     người dùng bấm huỷ, sinh trắc tạm khoá, chưa mở khoá máy lần nào —
        //     rẽ ở các nhánh TRƯỚC dòng này, và không nhánh nào trong chúng mở lối
        //     bỏ danh tính. Một phép đo trả giá trị hợp lệ đúng lúc nó không đo
        //     được gì thì nó nói "tôi không biết" bằng giọng của "chết rồi".
        //
        // Thứ tự hai lựa chọn KHÔNG đổi được: 24 từ đứng TRƯỚC. Lấy lại thì giữ
        // được tài khoản; bỏ đi thì mất hẳn. Trên Android còn một lý do nặng hơn:
        // khoá bọc Master_KEK nằm dưới nhãn riêng của app (`TaadEnclaveModule.kt`,
        // `secureAesKey()`), nên gỡ app là mất luôn 24 từ. Ai chưa có 24 từ thì
        // đường đúng duy nhất là đi lấy chúng TRƯỚC, không phải bỏ tài khoản trước.
        showError(
          t('Khoá trên máy này đã chết hẳn'),
          t('Hệ điều hành đã huỷ khoá bảo mật của bạn, thường là ngay lúc bạn thêm hoặc đăng ký lại vân tay / khuôn mặt trong Cài đặt. Khoá vẫn nằm trong máy nhưng không ký được nữa, nên thử lại bao nhiêu lần cũng ra đúng kết quả này. Có hai đường đi tiếp, và chúng khác nhau rất nhiều.'),
          {
            hideCancel: true,
            actions: [
              {
                text: t('Lấy lại tài khoản bằng 24 từ'),
                onPress: () => navigation.navigate('RestoreIdentity' as never),
              },
              {
                text: t('Tôi không có 24 từ — bắt đầu lại'),
                style: 'destructive',
                onPress: () => confirmAbandonDeadIdentity(),
              },
              { text: t('Để sau'), style: 'cancel' },
            ],
          },
        );
        return;
      }
      if (code === PhoenixKeyNativeError.NO_KEY || code === PhoenixKeyNativeError.SIGN_INIT) {
        // KHÔNG gộp `KEY_INVALIDATED` vào đây. Hai ca dẫn người dùng đi hai hướng:
        // ở đây khoá có thể còn cứu được nên câu chữ mời đi khôi phục; ở nhánh trên
        // khoá chết hẳn nên đường khôi phục theo khoá cũng dừng, và người dùng cần
        // một lối thứ hai. Gộp lại là để đúng nhóm không có lối ra ở trong một vòng
        // lặp mà không gì nói ra.
        showError('Khoá trên máy không còn dùng được (thường do vừa thêm hoặc xoá vân tay/khuôn mặt trong Cài đặt). Hãy khôi phục danh tính để dùng tiếp.');
        return;
      }
      console.log('[LoginNetwork] Biometric flow failed:', e);
      showError('Đăng nhập sinh trắc học thất bại');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: nen }]}>
      <StatusBar barStyle="light-content" backgroundColor={nen} />

      {/* Tháo mặt vẽ khi màn mất tiêu điểm: mỗi `<Canvas>` là một ngữ cảnh
          OpenGL riêng, và để nó sống dưới một màn khác là giữ một vòng vẽ 60
          khung/giây chạy cho thứ không ai nhìn. */}
      {isFocused && (
        <GLErrorBoundary tag="loginNetwork">
          <Canvas
            style={StyleSheet.absoluteFill}
            orthographic
            camera={{ position: [0, 0, 10], near: -100, far: 100 }}
            gl={{ antialias: true }}
          >
            <color attach="background" args={[nen]} />
            <Canh mangRef={mangRef} tamRef={tamRef} mau={BANG_MAU} onSangHet={vaoMain} />
          </Canvas>
        </GLErrorBoundary>
      )}

      {/* Lớp nhận cú chạm trên nền. RỖNG và trong suốt — bề mặt GL không cho cú
          chạm nổi lên, nên phải có một lớp nằm trên nó để nhận. */}
      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {/* ── Chữ và logo ──────────────────────────────────────────────────────
          Đây là chỗ màn này RỜI khỏi luật "toàn bộ hiển thị bằng canvas" của
          lượt trước, và rời có chủ ý: vẽ chữ trong OpenGL đòi dựng texture từ
          phông, mà bốn thứ tiếng của app gồm cả chữ Nhật và chữ Trung — một bản
          đồ ký tự dựng sẵn sẽ thiếu ký tự, và thiếu thì ra ô vuông rỗng.

          Khối này `pointerEvents="none"`: nó nằm TRÊN lớp nhận cú chạm, nên nếu
          nó ăn cú chạm thì chạm vào vùng logo sẽ không kéo được mạng lưới — một
          vùng chết mà không có gì chỉ ra là nó chết. (Khối đáy thì `box-none`,
          vì ở đó có một nút thật cần nhận cú chạm.) */}
      <View
        pointerEvents="none"
        // Cụm nay là BA MẢNH RỜI và tự xếp ngang bên trong, nên khối ngoài này chỉ
        // còn việc xếp DỌC hai khối con: [cụm nhận diện] rồi [dòng ba đức tính].
        // `+ 44` chứ không `+ 18`: vùng an toàn chỉ chừa cho thanh trạng thái, nó
        // KHÔNG chừa cho khoảng thở. Với `18` thì mực của cụm bắt đầu ở y≈85 trên
        // một màn cao 874 — sát mép, và ở máy không có tai thỏ (`insets.top` nhỏ
        // hơn nhiều) thì nó còn sát hơn nữa. Chủ dự án bác bố cục đó 19/09/2026.
        style={[styles.dinh, styles.dinhXepDoc, { paddingTop: insets.top + 44 }]}
      >
        {/* CỤM NHẬN DIỆN — ba mảnh rời, xếp NGANG: [dấu hiệu] [chữ hiệu/khẩu hiệu].

            Bố cục này mang một ràng buộc hình học chủ dự án chốt 19/09/2026:
            `cao(chữ hiệu) + khe + cao(khẩu hiệu)` bằng đúng `cao(dấu hiệu)`, còn
            khẩu hiệu rộng đúng bằng CHỮ HIỆU (không phải bằng cả cụm). Ràng buộc
            ấy KHÔNG giải được khi dấu hiệu và chữ hiệu còn hàn trong một ảnh —
            hệ vô nghiệm, và nghiệm của nó nằm ở `config/brandLockup.ts`.

            Mọi phép đo và mọi tỉ lệ đã chuyển vào `components/BrandLockup`. Màn
            này chỉ còn cấp bề ngang. */}
        <BrandLockup direction="row" maxWidth={rongCum} lang={lang} withSlogan />

      </View>

      {/* `box-none`: khối bọc KHÔNG nhận cú chạm (để phần trống của nó vẫn kéo
          được mạng lưới) nhưng con của nó thì có. Đặt `none` như khối trên cùng
          là nút đăng ký bấm không ăn. */}
      <View
        pointerEvents="box-none"
        style={[styles.day, { paddingBottom: insets.bottom + 14 }]}
      >
        {/* BA ĐỨC TÍNH — nằm NGAY TRÊN nút đăng nhập, canh giữa.

            Không đặt dưới cụm nhận diện ở đầu màn: ở đó nó thành dòng chữ thứ ba
            liền nhau, và ba dòng chồng nhau thì không dòng nào được đọc. Dưới
            đáy nó đứng một mình, ngay trước thứ người dùng sắp bấm.

            Vẫn giãn chữ cho rộng bằng cụm nhận diện ở trên — cùng một bề ngang
            thì hai đầu màn đọc ra một khối, dù cách nhau cả chiều cao màn hình.

            App không khai `virtues` thì KHÔNG có dòng nào — không mượn lại
            `slogan` để lấp, vì như thế là in cùng một câu hai lần trên một màn. */}
        {virtues ? (
          <Text style={styles.baDucTinh} numberOfLines={1} adjustsFontSizeToFit>
            {virtues}
          </Text>
        ) : null}

        {/* NÚT DƯỚI ĐÁY — nhãn theo trạng thái THẬT của máy, không phải một chuỗi
            cố định.

            Trước bản này nút luôn đọc "Đăng ký danh tính", kể cả trên máy đã có
            danh tính. Hai cái hỏng, không phải một:

              · CHỮ sai — người đã có tài khoản được mời đăng ký, và lối đó dẫn
                sang `IdentityEntryChoice` rồi rất dễ sang màn tạo mới. Một DID
                thứ hai cho cùng một người, danh sách vườn hiện rỗng, mà rỗng
                thì trùng khớp với "tôi chưa ghi gì" — cái sai không kêu lên.
              · ĐÍCH sai — `IdentityEntryChoice` tự khai ngay dòng đầu rằng nó là
                "cửa vào khi máy CHƯA có danh tính nào". Đưa máy đã có danh tính
                vào đó là hỏi một câu đã có đáp án.

            Vòng tròn sinh trắc ở giữa màn thì vẫn kiểm đúng (`runBiometric`) —
            nên trước bản này hai lối vào cùng một màn trả lời khác nhau về cùng
            một câu hỏi. Nay cả hai đọc chung `readIdentityPresence`. */}
        {/* `busy` phải nằm trong `disabled` chứ không chỉ trong `runBiometric`.
            `cta.disabled` đo TRẠNG THÁI MÁY, nó không biết gì về việc một lượt
            đăng nhập đang chạy — nên nếu chỉ dựa vào nó thì trong lúc hộp sinh
            trắc của hệ điều hành đang mở, nút này vẫn sáng và vẫn bấm được.
            Vòng tròn sinh trắc ở giữa màn đã mờ đi đúng lúc ấy (`busy={busy}`);
            hai lối vào cùng một hành động thì phải khoá cùng nhau. */}
        <Pressable
          testID="login-primary-cta"
          accessibilityRole="button"
          accessibilityState={{ disabled: cta.disabled || busy }}
          accessibilityLabel={t(cta.labelKey)}
          disabled={cta.disabled || busy}
          onPress={theoCta}
          style={({ pressed }) => [
            styles.nutDangKy,
            (pressed || cta.disabled || busy) && styles.nutDangKyNhan,
          ]}
        >
          <Text style={styles.chuDangKy} allowFontScaling={false}>
            {t(cta.labelKey)}
          </Text>
          {cta.icon ? <Icon name={cta.icon} size={16} color={NEUTRAL.white} /> : null}
        </Pressable>

        {/* LỐI LÙI — chỉ hiện ở đúng trạng thái "máy trống trơn".

            Nút chính ở trạng thái đó đi THẲNG sang màn tạo mới, và với đa số
            người bấm nó thì đó là đích đúng. Nhưng phép đo "máy trống trơn"
            KHÔNG phân biệt được người mới với người vừa đổi điện thoại — máy
            mới của họ cũng trống trơn — nên nếu chỉ còn một lối thì nhóm thứ
            hai bị đẩy vào lối sinh một DID THỨ HAI, và cái sai đó không kêu
            lên: danh sách vườn hiện rỗng, mà rỗng thì trùng khớp với "tôi chưa
            ghi gì".

            Nên lối hỏi vẫn còn, chỉ thôi làm lối BẮT BUỘC. Một dòng chữ, không
            phải một nút: nó không được tranh chỗ với lối đúng của đa số. */}
        {cta.action === 'signUpNew' ? (
          <Pressable
            testID="login-secondary-entry-choice"
            accessibilityRole="button"
            accessibilityLabel={t('Tôi đã có tài khoản ở máy khác')}
            hitSlop={10}
            onPress={moDangKy}
          >
            <Text style={styles.chuLoiLui} allowFontScaling={false}>
              {t('Tôi đã có tài khoản ở máy khác')}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.phienBan} allowFontScaling={false}>
          {DONG_PHIEN_BAN}
        </Text>
      </View>

      {/* Nút đổi ngôn ngữ — góc trên bên PHẢI. Nằm sau lớp nhận cú chạm trong
          cây nên nó là đích của cú chạm trong vùng của nó. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ngonNgu.endonym}
        hitSlop={8}
        onPress={() => setMoChonNgonNgu(true)}
        style={({ pressed }) => [
          styles.nutNgonNgu,
          { top: insets.top + 10 },
          pressed && styles.nutDangKyNhan,
        ]}
      >
        <Text style={styles.coNgonNgu} allowFontScaling={false}>
          {ngonNgu.flag}
        </Text>
        <Icon name="chevron-down" size={14} color={NEUTRAL.white} />
      </Pressable>

      <LanguagePickerModal
        visible={moChonNgonNgu}
        onClose={() => setMoChonNgonNgu(false)}
      />

      {/* Nút sinh trắc. Nằm TRÊN lớp nhận cú chạm nên nó là đích của cú chạm
          trong vùng của nó — mạng lưới không bị kéo theo khi người dùng bấm. */}
      <NutSinhTrac kieu={kieu} nen={nen} busy={busy} onPress={runBiometric} />
    </View>
  );
};


/**
 * Chữ TRẮNG ĐẶC ở cả ba dòng, phân cấp bằng CỠ và ĐỘ ĐẬM chứ không bằng độ mờ.
 *
 * Trên nền `#1F511A` chữ trắng đo 9,33 lần tương phản — rộng hơn hẳn mức AA
 * (4,5), nên ở đây CÓ chỗ để hạ độ mờ một bậc nếu muốn. Vẫn không hạ: bậc yếu
 * hơn lấy cỡ chữ làm trục thì đứng vững trên MỌI app, kể cả app có nền sáng hơn
 * (CheckFarm đặt `canvas` là `#174F2A`). Một thang màu chỉnh vừa khít cho một
 * nền là một thang sẽ trượt ở nền thứ hai — và `authContrast.test.ts` chỉ canh
 * được chữ trắng đặc, không canh được một độ mờ nằm trong tệp này.
 */
const styles = StyleSheet.create({
  // Màu nền đặt ở NƠI DÙNG, không ở đây: nó đến từ theme của app đang chạy.
  root: { flex: 1 },

  dinh: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // HÀNG NGANG: logo bên trái, hai dòng chữ bên phải. `center` theo trục ngang
    // để cả cụm đứng giữa màn, `center` theo trục dọc để logo canh giữa hai dòng.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Chừa hai bên rộng hơn bề ngang nút đổi ngôn ngữ ở góc phải (≈52 + lề 16).
    // Chừa ĐỀU hai bên chứ không chỉ bên phải: chừa một bên thì cụm logo lệch
    // khỏi tâm màn, mà nó phải đứng giữa. Với tên app dài, cụm này hẹp lại chứ
    // không bao giờ chui xuống dưới nút.
    paddingHorizontal: 76,
  },
  /**
   * Xếp dọc — và GIỮ NGUYÊN `paddingHorizontal: 76` của `dinh`, không nới.
   *
   * Bản đầu nới xuống `40` với lý do "cụm rộng hơn một ô vuông 52px". Lý do đó
   * đọc ngược: `76` không phải chỗ cho ô vuông, nó là khoảng chừa để cụm KHÔNG
   * chui dưới nút đổi ngôn ngữ ở góc phải (nút bắt đầu ở `W − 71`). Nới lề là
   * bỏ đúng cái hàng rào duy nhất.
   *
   * Khoảng chừa ấy nay còn là NGUỒN của một con số: `rongCum = W − 2×76`, chặn
   * trên 244. Đổi số này là đổi cỡ cả cụm nhận diện, không chỉ đổi lề.
   */
  dinhXepDoc: { flexDirection: 'column' },
  /**
   * BA ĐỨC TÍNH, ngay trên nút đăng nhập.
   *
   * ⚠ KHÔNG giãn chữ cho rộng bằng cụm nhận diện, dù cụm trên đầu màn làm thế.
   * Bản trước có giãn và chủ dự án bác ngay: kéo một câu 32 ký tự cho đủ 244pt
   * đẩy khoảng cách giữa các chữ lên ~2,4pt, và ở cỡ 11pt thì mắt phải ghép lại
   * từng chữ cái. Phép giãn ấy ĐÚNG ở cụm nhận diện — nơi nó phục vụ một ràng
   * buộc hình học và người đọc nhìn cả khối như một dấu hiệu — nhưng ở đây thì
   * dòng này là một câu để ĐỌC, và hai vai đó đòi hai cách đặt chữ khác nhau.
   *
   * `allowFontScaling` để MẶC ĐỊNH (bật), khác các dòng khác trong màn: đây là
   * dòng duy nhất ở đây người dùng lớn tuổi cần đọc được, nên nó phải nở theo cỡ
   * chữ hệ thống họ đã chọn. `adjustsFontSizeToFit` chỉ co lại khi bản dịch dài
   * hơn bề ngang màn.
   */
  baDucTinh: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
    textAlign: 'center',
    color: NEUTRAL.white,
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  khauHieu: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
    color: NEUTRAL.white,
  },
  day: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  /**
   * Nút đăng ký: nền trắng NHẠT, không viền.
   *
   * Thứ hạng vẫn phải đọc ra ngay — nút chính to, đặc, ở giữa; nút này nằm sát
   * đáy — nhưng nó nói bằng một cách khác: một mảng trắng mờ chứ không phải một
   * đường viền. Trên nền chuyển động của mạng lưới thì một mặt phẳng đứng yên
   * hơn một đường kẻ: viền mảnh chạy ngang qua các chấm sáng sẽ đứt quãng theo
   * chúng, còn mảng nền thì che hẳn phía dưới nó và chữ luôn nằm trên một nền
   * ổn định.
   *
   * 16% là chỗ cân: đủ để thấy hình nút khi phía sau đang tối, còn nhạt để nó
   * không tranh với đĩa trắng đặc của nút sinh trắc.
   */
  nutDangKy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    // 48 px chiều cao chạm — dưới mức 56 của module Truy xuất, nhưng đây là lối
    // phụ trên một màn không đeo găng, và nới to hơn là nó tranh chỗ nút chính.
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginBottom: 16,
  },
  nutDangKyNhan: { opacity: 0.6 },

  /**
   * Nút đổi ngôn ngữ. Vẫn giữ lối viền-trắng-ruột-rỗng, và nay nó là thứ DUY
   * NHẤT trong màn dùng lối ấy — cố ý: nó không cùng hạng với nút đăng ký (một
   * lối vào) mà là một công tắc, nên nó không nên trông giống nút đăng ký thu
   * nhỏ. Viền nói "đổi một thiết lập"; mảng nền nói "đi tới đâu đó".
   *
   * `right` chứ không `left`, và `top` cộng safe-area tại nơi dùng — góc trên
   * bên phải là chỗ quen thuộc của nút này (màn cũ cũng đặt ở đó), và nó không
   * đụng vào cụm logo đang canh giữa.
   */
  nutNgonNgu: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 10,
    paddingRight: 7,
    paddingVertical: 6,
    borderRadius: 999,
  },
  coNgonNgu: { fontSize: 18, lineHeight: 22 },
  chuDangKy: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: NEUTRAL.white,
  },

  /** Lối lùi dưới nút chính — mờ hơn hẳn, để nó là lối THỨ HAI cả khi nhìn lướt. */
  chuLoiLui: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: NEUTRAL.white,
    opacity: 0.78,
    textDecorationLine: 'underline',
    marginBottom: 16,
  },

  phienBan: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: NEUTRAL.white,
  },

  // Khối bọc phủ kín màn để canh nút vào ĐÚNG tâm — cùng một điểm mà làn sáng
  // lấy làm ngòi (`tamRef`). Hai chỗ lệch nhau là làn sáng phát ra từ chỗ không
  // có gì. `box-none` để phần trống của khối bọc không nuốt cú chạm.
  nutBoc: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nut: {
    width: CO_NUT,
    height: CO_NUT,
    borderRadius: CO_NUT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    
    borderWidth: 6,
    borderColor: NEUTRAL.white,

  },
  nutSong: {
    position: 'absolute',
    width: CO_NUT + 10,
    height: CO_NUT + 10,
    borderRadius: (CO_NUT + 10) / 2,
    borderWidth: 2,
    borderColor: NEUTRAL.white,
    backgroundColor: NEUTRAL.white,
    shadowColor: NEUTRAL.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
});

export default LoginNetworkScreen;
