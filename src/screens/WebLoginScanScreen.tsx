/**
 * WebLoginScanScreen — Quét QR đăng nhập web phoenixkey.me bằng khoá DID.
 *
 * Tương đương Enclave/lib/screens/web_login_scan_screen.dart. Luồng (khớp backend
 * SessionController):
 *   1. Web POST /auth/session/init → QR = base64url(JSON({v,sid,ch,dom,exp})).
 *   2. Màn này quét QR → decode → {sid, ch, dom}.
 *   3. Ký `ch:dom:timestamp` bằng HW_Key (P-256, Secure Enclave/Keystore, FaceID).
 *   4. POST /auth/session/{sid}/approve {user_did, public_key_hex, signature,
 *      domain, timestamp} → web đăng nhập.
 *
 * BẢO MẬT: cần danh tính DID sẵn trên máy (did + HW_Key). Hiện domain cho người
 * XÁC NHẬN (chống phishing). Chặn quét/ký 2 lần bằng cờ guard.
 */

import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
// @ts-ignore — react-native-camera-kit không kèm types cho Camera prop scanBarcode
import { Camera } from 'react-native-camera-kit';
import { COLORS } from '../constants';
import { currentUserDid, ownerPublicKey, signRaw } from '../sdk/phoenixKey';
import { phoenixKeyApi } from '../services/phoenixKey-api';

type Step = 'scanning' | 'confirm' | 'signing' | 'success' | 'error';

interface QrPayload { sid: string; ch: string; dom: string; exp?: number }

const asciiToHex = (s: string): string => {
  let out = '';
  for (let i = 0; i < s.length; i++) out += s.charCodeAt(i).toString(16).padStart(2, '0');
  return out;
};

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** base64url → chuỗi bytes (latin1). QR payload là ASCII JSON nên đủ. null nếu hỏng. */
const base64UrlToString = (b64url: string): string | null => {
  const b = b64url.replace(/-/g, '+').replace(/_/g, '/');
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const ch of b) {
    if (ch === '=') break;
    const idx = B64_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
};

const parseQr = (raw: string): QrPayload | null => {
  const json = base64UrlToString(raw.trim());
  if (!json) return null;
  try {
    const p = JSON.parse(json);
    if (p?.sid && p?.ch && p?.dom) return { sid: String(p.sid), ch: String(p.ch), dom: String(p.dom), exp: p.exp };
  } catch { /* not our QR */ }
  return null;
};

const WebLoginScanScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();

  const [step, setStep] = useState<Step>('scanning');
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [error, setError] = useState('');
  const handled = useRef(false); // chặn quét/ký nhiều lần

  const onReadCode = (event: any) => {
    if (handled.current) return;
    const raw = event?.nativeEvent?.codeStringValue;
    if (!raw) return;
    const p = parseQr(raw);
    if (!p) return; // QR lạ → tiếp tục quét
    handled.current = true;
    if (p.exp && p.exp * 1000 < Date.now()) {
      setError('Mã QR đã hết hạn. Làm mới trang web rồi quét lại.');
      setStep('error');
      return;
    }
    setPayload(p);
    setStep('confirm');
  };

  const handleApprove = async () => {
    if (!payload) return;
    setStep('signing');
    try {
      const did = await currentUserDid();
      const pubkey = await ownerPublicKey();
      if (!did || !pubkey) {
        throw new Error('Chưa có danh tính trên thiết bị này. Hãy tạo/khôi phục ví trước.');
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `${payload.ch}:${payload.dom}:${timestamp}`;
      const signature = await signRaw(
        asciiToHex(message),
        'Đăng nhập web',
        `Xác thực đăng nhập ${payload.dom}`,
      );
      await phoenixKeyApi.session.approve(payload.sid, {
        userDid: did,
        publicKeyHex: pubkey,
        signature,
        domain: payload.dom,
        timestamp,
      });
      setStep('success');
    } catch (e: any) {
      const code = e?.code;
      if (code === 'E_USER_CANCELED') {
        handled.current = false;
        setStep('confirm'); // cho thử lại
        return;
      }
      setError(e?.message ?? 'Đăng nhập web thất bại.');
      setStep('error');
    }
  };

  const retry = () => { handled.current = false; setError(''); setPayload(null); setStep('scanning'); };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Icon name="chevron-left" size={26} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Đăng nhập web</Text>
      <View style={{ width: 26 }} />
    </View>
  );

  // Camera chỉ khi đang quét
  if (step === 'scanning') {
    return (
      <View style={styles.rootDark}>
        <StatusBar barStyle="light-content" />
        <Camera style={StyleSheet.absoluteFill} scanBarcode onReadCode={onReadCode} />
        <View style={styles.overlay}>
          {Header}
          <View style={styles.scanBox} />
          <Text style={styles.scanHint}>Đưa mã QR trên trang web vào khung</Text>
        </View>
      </View>
    );
  }

  // Các trạng thái còn lại — nền tối, nội dung giữa
  return (
    <View style={styles.rootDark}>
      <StatusBar barStyle="light-content" />
      {Header}
      <View style={styles.center}>
        {step === 'confirm' && payload && (
          <>
            <Icon name="web" size={44} color={COLORS.accentLight} />
            <Text style={styles.title}>Xác nhận đăng nhập</Text>
            <View style={styles.domainCard}>
              <Text style={styles.domainLabel}>Trang</Text>
              <Text style={styles.domainVal}>{payload.dom}</Text>
            </View>
            <Text style={styles.warn}>
              Chỉ duyệt nếu bạn ĐANG tự đăng nhập trang này. Việc duyệt sẽ ký bằng khoá của bạn.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleApprove}>
              <Icon name="check-decagram" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Duyệt đăng nhập</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={retry}><Text style={styles.linkText}>Quét lại</Text></TouchableOpacity>
          </>
        )}

        {step === 'signing' && (
          <>
            <ActivityIndicator color={COLORS.accentLight} size="large" />
            <Text style={styles.title}>Đang xác thực…</Text>
          </>
        )}

        {step === 'success' && (
          <>
            <Icon name="check-circle" size={56} color={COLORS.success} />
            <Text style={styles.title}>Đã đăng nhập web</Text>
            <Text style={styles.subtle}>Quay lại trình duyệt để tiếp tục.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.primaryBtnText}>Xong</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'error' && (
          <>
            <Icon name="alert-circle-outline" size={52} color={COLORS.error} />
            <Text style={styles.title}>Không đăng nhập được</Text>
            <Text style={styles.subtle}>{error}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={retry}>
              <Text style={styles.primaryBtnText}>Quét lại</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  title: { fontSize: 19, fontWeight: '800', color: '#fff', marginTop: 4 },
  subtle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20 },
  domainCard: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 14, paddingHorizontal: 22, alignItems: 'center', gap: 4,
  },
  domainLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  domainVal: { fontSize: 18, fontWeight: '800', color: '#fff' },
  warn: { fontSize: 13, color: '#E9C46A', textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28,
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  linkText: { color: COLORS.accentLight, fontSize: 14, marginTop: 4 },
});

export default WebLoginScanScreen;
