/**
 * DevicePairScreen — GHÉP MÁY THỨ HAI vào một PhoenixKey đã có (issue #233).
 *
 * ══ Vì sao màn này tồn tại ══════════════════════════════════════════════════
 * `keyAuthorizeService.authorizeDeviceKey` đã dựng xong từ lâu, có bài kiểm ghim
 * từng byte chuỗi ký, và **không nơi nào gọi**. Người dùng cài app thứ hai chỉ có
 * hai lối, cả hai đều sai: sinh danh tính MỚI (mất vườn cũ) hoặc khôi phục bằng 24
 * từ (thu hồi khoá owner của app thứ nhất, app cũ chết ngay). Màn này mở đường thứ
 * ba — app A ký uỷ quyền cho khoá app B, hai khoá cùng sống.
 *
 * ══ Hai vai, một màn ════════════════════════════════════════════════════════
 *   `mode: 'show'` — MÁY B, chưa có danh tính. Hiện khoá công khai của mình dưới
 *                    dạng QR, rồi đợi. Vào từ cửa danh tính (`IdentityEntryChoice`).
 *   `mode: 'scan'` — MÁY A, đang giữ owner-key. Quét mã đó, xác nhận, ký. Vào từ
 *                    "Thiết bị của tôi".
 *
 * Một màn chứ không hai, vì hai vai dùng CHUNG cơ chế quét + ký của
 * `WebLoginScanScreen` (`react-native-camera-kit` + `signRaw`). Dựng màn thứ hai
 * là dựng bản sao thứ hai của cùng cơ chế, và bản sao đó sẽ trôi.
 *
 * ══ ⛔ RÀNG BUỘC CÂU CHỮ — ĐỌC TRƯỚC KHI SỬA CHUỖI NÀO Ở ĐÂY ═══════════════
 * Khoá mới nhận vai `manager` (`keyAuthorizeService.ts`, `keyRole` cố định). Vai đó
 * bị chặn ở NHỮNG CỬA NÀO thì **chưa ai đo được**, và hai nguồn đang nói khác nhau:
 *
 *   · `phoenixKey-api.ts` mục `keys.authorize` — phiếu phiên KHÔNG mang claim vai
 *     (`mintSessionToken` chỉ có `userDid` + loại + hạn + `tokenEpoch`), nên tầng
 *     dưới không phân biệt được vai kể cả khi muốn;
 *   · cùng tệp, mục `deviceLifecycle` — `/keys/devices/**` là `OWNER_ONLY`, phiên
 *     `manager` gọi vào nhận 403 `KEY_ROLE_FORBIDDEN`.
 *
 * Một mẫu đường đã đo là `OWNER_ONLY` KHÔNG chứng minh danh sách chỉ có một mẫu.
 * ⟹ Giao diện KHÔNG hứa "máy thứ hai dùng được đầy đủ như máy thứ nhất", và cũng
 * KHÔNG hứa "máy này quyền hạn chế". Chưa đo được thì đừng khẳng định chiều nào;
 * `identity.pair.success.role` nói đúng phần đã biết rồi dừng.
 *
 * **Còn treo — cách đo:** xin phía máy chủ danh sách mẫu đường `OWNER_ONLY` hiện
 * hành trong `EndpointRolePolicy`, rồi đối chiếu với các cửa app thật sự gọi. Có
 * danh sách đó mới được viết một câu khẳng định về phạm vi của vai `manager`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
// @ts-ignore — react-native-camera-kit không kèm types cho Camera prop scanBarcode
import { Camera } from 'react-native-camera-kit';

import { COLORS } from '../constants';
import TreeQrCode from '../features/treeQr/TreeQrCode';
import { useTk } from '../i18n/keys';
import { authorizeDeviceKey, describeAuthorizeFailure } from '../services/keyAuthorizeService';
import {
  buildPairPayload,
  claimAuthorizedIdentity,
  NotAuthorizedYetError,
  parsePairPayload,
  thisDevicePublicKey,
} from '../services/devicePairService';
import { phoenixKeyAuth } from '../services/phoenixKeyAuthService';
import { loginUser } from '../store/userSlice';

export type DevicePairMode = 'show' | 'scan';

type Step =
  | 'preparing'   // show: đang lấy/sinh khoá của máy này
  | 'showing'     // show: đã có mã QR trên màn
  | 'claiming'    // show: đang hỏi máy chủ xem đã được duyệt chưa
  | 'scanning'    // scan: camera đang mở
  | 'confirm'     // scan: đã đọc được khoá, chờ người bấm duyệt
  | 'signing'     // scan: đang ký + gọi máy chủ
  | 'success'     // scan: đã uỷ quyền xong
  | 'error';

const DevicePairScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useDispatch();
  const tk = useTk();

  const mode: DevicePairMode = route.params?.mode === 'scan' ? 'scan' : 'show';

  const [step, setStep] = useState<Step>(mode === 'scan' ? 'scanning' : 'preparing');
  const [myKey, setMyKey] = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Chặn quét/ký nhiều lần — cùng cơ chế `handled` của `WebLoginScanScreen`.
  const handled = useRef(false);

  // ── Phía MÁY B: chuẩn bị khoá để khoe ─────────────────────────────────────
  useEffect(() => {
    if (mode !== 'show') return;
    let huy = false;
    (async () => {
      try {
        const hex = await thisDevicePublicKey();
        if (huy) return;
        setMyKey(hex);
        setStep('showing');
      } catch (e) {
        if (huy) return;
        // KHÔNG nuốt: không có khoá thì không có gì để quét, và màn phải nói ra
        // thay vì hiện một ô QR trống.
        setError(e instanceof Error && e.message ? e.message : String(e));
        setStep('error');
      }
    })();
    return () => { huy = true; };
  }, [mode]);

  // ── Phía MÁY B: máy kia đã duyệt xong chưa ────────────────────────────────
  const claim = useCallback(async () => {
    setStep('claiming');
    try {
      const did = await claimAuthorizedIdentity();
      const user = await phoenixKeyAuth.unlockExistingIdentity();
      if (!user) {
        throw new Error(`Đã nhận danh tính ${did} nhưng chưa mở được trên máy này.`);
      }
      await dispatch(loginUser(user as any) as any);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      // "Chưa được duyệt" KHÁC "hỏng". Ca thứ nhất là chuyện bình thường của một
      // luồng hai máy — người dùng bấm sớm một nhịp — nên nó quay về màn QR, không
      // vào màn lỗi. Gộp hai ca là bắt người ta quét lại từ đầu vì chưa đợi đủ.
      if (e instanceof NotAuthorizedYetError) {
        setError(tk('identity.pair.show.notYet'));
        setStep('showing');
        return;
      }
      setError(e instanceof Error && e.message ? e.message : String(e));
      setStep('error');
    }
  }, [dispatch, navigation, tk]);

  // ── Phía MÁY A: đọc mã ────────────────────────────────────────────────────
  const onReadCode = useCallback((event: any) => {
    if (handled.current) return;
    const raw = event?.nativeEvent?.codeStringValue;
    if (!raw) return;
    const hex = parsePairPayload(raw);
    if (!hex) return; // QR lạ → cứ quét tiếp, đừng bắt người ta bấm gì
    handled.current = true;
    setScanned(hex);
    setError('');
    setStep('confirm');
  }, []);

  // ── Phía MÁY A: ký uỷ quyền ───────────────────────────────────────────────
  const approve = useCallback(async () => {
    if (!scanned) return;
    setStep('signing');
    try {
      await authorizeDeviceKey(scanned);
      setStep('success');
    } catch (e) {
      // Người dùng huỷ hộp sinh trắc thì cho bấm lại, đừng bắt quét lại — cùng
      // cách xử của `WebLoginScanScreen`.
      if ((e as { code?: string })?.code === 'E_USER_CANCELED') {
        setStep('confirm');
        return;
      }
      // Câu của `describeAuthorizeFailure`, không phải câu chung chung của màn:
      // bốn mã lỗi ở đó là bốn việc khác nhau người dùng phải làm.
      setError(describeAuthorizeFailure(e));
      setStep('error');
    }
  }, [scanned]);

  const scanAgain = useCallback(() => {
    handled.current = false;
    setScanned(null);
    setError('');
    setStep('scanning');
  }, []);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
        <Icon name="chevron-left" size={26} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{tk('identity.pair.title')}</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  // Camera chiếm trọn màn, chỉ khi đang quét.
  if (step === 'scanning') {
    return (
      <View style={styles.rootDark}>
        <StatusBar barStyle="light-content" />
        <Camera style={StyleSheet.absoluteFill} scanBarcode onReadCode={onReadCode} />
        <View style={styles.overlay}>
          {header}
          <View style={styles.scanBox} />
          <Text style={styles.scanHint}>{tk('identity.pair.scan.hint')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.rootDark}>
      <StatusBar barStyle="light-content" />
      {header}
      <ScrollView contentContainerStyle={styles.center}>
        {step === 'preparing' && (
          <>
            <ActivityIndicator color={COLORS.accentLight} size="large" />
            <Text style={styles.title}>{tk('identity.pair.show.preparing')}</Text>
          </>
        )}

        {(step === 'showing' || step === 'claiming') && myKey && (
          <>
            <Text style={styles.title}>{tk('identity.pair.mode.show')}</Text>
            <Text style={styles.subtle}>{tk('identity.pair.show.lead')}</Text>
            {/* Nền trắng dưới mã: máy quét cần tương phản, mà màn này nền tối. */}
            <View style={styles.qrPlate} testID="device-pair-qr">
              <TreeQrCode value={buildPairPayload(myKey)} size={220} withLogo={false} />
            </View>
            <Text style={styles.keyLabel}>{tk('identity.pair.show.keyLabel')}</Text>
            <Text style={styles.keyHex} selectable numberOfLines={3}>{myKey}</Text>

            {!!error && <Text style={styles.warn}>{error}</Text>}

            {step === 'claiming' ? (
              <ActivityIndicator color={COLORS.accentLight} />
            ) : (
              <TouchableOpacity
                testID="device-pair-claim"
                accessibilityRole="button"
                style={styles.primaryBtn}
                onPress={claim}
              >
                <Icon name="check-decagram" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{tk('identity.pair.show.done')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 'confirm' && scanned && (
          <>
            <Icon name="cellphone-link" size={44} color={COLORS.accentLight} />
            <Text style={styles.title}>{tk('identity.pair.confirm.title')}</Text>
            <Text style={styles.warn}>{tk('identity.pair.confirm.body')}</Text>
            <Text style={styles.keyLabel}>{tk('identity.pair.show.keyLabel')}</Text>
            <Text style={styles.keyHex} numberOfLines={3}>{scanned}</Text>
            <TouchableOpacity
              testID="device-pair-approve"
              accessibilityRole="button"
              style={styles.primaryBtn}
              onPress={approve}
            >
              <Icon name="draw-pen" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>{tk('identity.pair.confirm.button')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={scanAgain} accessibilityRole="button">
              <Text style={styles.linkText}>{tk('identity.pair.retry')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'signing' && (
          <>
            <ActivityIndicator color={COLORS.accentLight} size="large" />
            <Text style={styles.title}>{tk('identity.pair.signing')}</Text>
          </>
        )}

        {step === 'success' && (
          <>
            <Icon name="check-circle" size={56} color={COLORS.success} />
            <Text style={styles.title}>{tk('identity.pair.success.title')}</Text>
            <Text style={styles.subtle}>{tk('identity.pair.success.body')}</Text>
            <Text style={styles.subtle}>{tk('identity.pair.success.role')}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.primaryBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.primaryBtnText}>{tk('identity.pair.close')}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'error' && (
          <>
            <Icon name="alert-circle-outline" size={52} color={COLORS.error} />
            <Text style={styles.title}>{tk('identity.pair.fail.title')}</Text>
            <Text style={styles.subtle}>{error}</Text>
            <TouchableOpacity
              testID="device-pair-error-retry"
              accessibilityRole="button"
              style={styles.primaryBtn}
              onPress={mode === 'scan' ? scanAgain : () => navigation.goBack()}
            >
              <Text style={styles.primaryBtnText}>
                {mode === 'scan' ? tk('identity.pair.retry') : tk('identity.pair.close')}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  rootDark: { flex: 1, backgroundColor: '#0B0F0D' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-start' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  scanBox: {
    alignSelf: 'center', marginTop: 80, width: 240, height: 240,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 24,
  },
  scanHint: { color: '#fff', textAlign: 'center', marginTop: 20, fontSize: 14, opacity: 0.9 },

  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  title: { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 4, textAlign: 'center' },
  subtle: { fontSize: 14, color: 'rgba(255,255,255,0.72)', textAlign: 'center', lineHeight: 20 },
  warn: { fontSize: 13, color: '#E9C46A', textAlign: 'center', lineHeight: 19 },

  qrPlate: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginTop: 4 },
  keyLabel: { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, marginTop: 6 },
  keyHex: {
    fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'center',
    fontFamily: 'Courier', paddingHorizontal: 6,
  },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 26,
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  linkText: { color: COLORS.accentLight, fontSize: 14, marginTop: 4 },
});

export default DevicePairScreen;
