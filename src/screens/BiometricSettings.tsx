// screens/BiometricSettings.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { COLORS } from '../constants';
import { showError, showSuccess } from '../utils/alert';
import { currentUserDid } from '../sdk/phoenixKey';

const BiometricSettings = () => {
  const navigation = useNavigation<any>();
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const phoenixKey = useSelector((state: RootState) => state.user.phoenixKey);
  const rnBiometrics = new ReactNativeBiometrics();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometryType, setBiometryType] = useState('');
  const [resolvedDid, setResolvedDid] = useState<string | null>(null);

  // Nguồn DID tin cậy: ưu tiên redux (phoenixKey/currentUser), nếu rỗng thì
  // lấy danh tính PhoenixKey đã lưu trên thiết bị. Người giữ khoá trên máy
  // CHÍNH LÀ danh tính — app không persist redux nên currentUser có thể rỗng
  // sau khi mở lại app; khi đó vẫn phải đọc được DID đã lưu thay vì báo lỗi.
  const resolveDid = async (): Promise<string | null> => {
    const fromState = phoenixKey?.did || currentUser?.did || currentUser?.id;
    if (fromState) return fromState;
    try {
      return await currentUserDid();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    checkBiometricAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phân giải DID rồi nạp cài đặt khi đã có nguồn (kể cả lúc redux rỗng).
  useEffect(() => {
    let mounted = true;
    (async () => {
      const did = await resolveDid();
      if (!mounted) return;
      setResolvedDid(did);
      if (did) loadBiometricSettings(did);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoenixKey, currentUser]);

  const checkBiometricAvailability = async () => {
    try {
      const result = await rnBiometrics.isSensorAvailable();
      setBiometricAvailable(result.available);
      setBiometryType(result.biometryType || '');
    } catch (error) {
      setBiometricAvailable(false);
    }
  };

  const loadBiometricSettings = async (did: string) => {
    try {
      if (!did) return;
      const mapStr = await AsyncStorage.getItem('biometric_did_map');
      if (mapStr) {
        const map = JSON.parse(mapStr) as Record<string, string>;
        setBiometricEnabled(Object.values(map).includes(did));
      } else {
        setBiometricEnabled(false);
      }
    } catch (error) {
      setBiometricEnabled(false);
    }
  };

  const enableBiometricForDid = async (did: string) => {
    try {
      let map: Record<string, string> = {};
      const existingStr = await AsyncStorage.getItem('biometric_did_map');
      if (existingStr) map = JSON.parse(existingStr);
      map.face = did;
      map.fingerprint = did;
      await AsyncStorage.setItem('biometric_did_map', JSON.stringify(map));
      setBiometricEnabled(true);
    } catch (error) {
      showError('Không thể lưu cài đặt');
    }
  };

  const disableBiometricForDid = async (did: string) => {
    try {
      const existingStr = await AsyncStorage.getItem('biometric_did_map');
      if (existingStr) {
        const map = JSON.parse(existingStr) as Record<string, string>;
        for (const kind of Object.keys(map)) {
          if (map[kind] === did) delete map[kind];
        }
        await AsyncStorage.setItem('biometric_did_map', JSON.stringify(map));
      }
      setBiometricEnabled(false);
    } catch (error) {
      showError('Không thể lưu cài đặt');
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    const did = resolvedDid || (await resolveDid());
    if (!did) {
      // Thực sự không có danh tính nào trên thiết bị → đưa về Login để khôi
      // phục (nút OK có hành động, không để người dùng kẹt ở popup).
      showError(
        'Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.',
        undefined,
        { onConfirm: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
      );
      return;
    }

    if (value) {
      try {
        const { success } = await rnBiometrics.simplePrompt({
          promptMessage: 'Thiết lập sinh trắc học mở khoá',
          cancelButtonText: 'Huỷ',
        });

        if (success) {
          await enableBiometricForDid(did);
          showSuccess('Đã bật xác thực sinh trắc học');
        }
      } catch (error) {
        showError('Thiết lập thất bại');
      }
    } else {
      Alert.alert(
        'Tắt xác thực sinh trắc học',
        'Bạn có chắc muốn tắt tính năng này?',
        [
          { text: 'Huỷ', style: 'cancel' },
          {
            text: 'Tắt',
            style: 'destructive',
            onPress: async () => {
              await disableBiometricForDid(did);
              showSuccess('Đã tắt xác thực sinh trắc học');
            },
          },
        ]
      );
    }
  };

  const getBiometryTypeText = () => {
    switch (biometryType) {
      case BiometryTypes.TouchID:
        return 'Vân tay';
      case BiometryTypes.FaceID:
        return 'Khuôn mặt';
      case BiometryTypes.Biometrics:
        return 'Sinh trắc học';
      default:
        return 'Không xác định';
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Top strip */}
      <View style={styles.topStrip}>
        <View style={styles.topStripAccent} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-left" size={20} color={COLORS.textSub} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sinh trắc học</Text>
          <Text style={styles.subtitle}>
            Bảo vệ tài khoản của bạn với xác thực sinh trắc học
          </Text>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>CÀI ĐẶT XÁC THỰC</Text>
          </View>

          <View style={styles.settingCard}>
            {biometricAvailable ? (
              <>
                <View style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: `${COLORS.accent}15` }]}>
                      <Icon name="fingerprint" size={20} color={COLORS.accent} />
                    </View>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.settingLabel}>Mở khóa bằng {getBiometryTypeText()}</Text>
                      <Text style={styles.settingDesc}>
                        Sử dụng {getBiometryTypeText().toLowerCase()} để đăng nhập nhanh
                      </Text>
                    </View>
                  </View>
                  <View style={styles.settingRight}>
                    <Switch
                      value={biometricEnabled}
                      onValueChange={handleBiometricToggle}
                      trackColor={{ false: COLORS.border, true: COLORS.accent }}
                      thumbColor={biometricEnabled ? COLORS.white : COLORS.textMuted}
                    />
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.noBiometricCard}>
                <Icon name="fingerprint-off" size={48} color={COLORS.textMuted} />
                <Text style={styles.noBiometricTitle}>Thiết bị không hỗ trợ</Text>
                <Text style={styles.noBiometricDesc}>
                  Thiết bị của bạn không có cảm biến sinh trắc học hoặc chưa được cấu hình.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Icon name="shield-check-outline" size={16} color={COLORS.success} />
          <Text style={styles.infoText}>
            Dữ liệu sinh trắc học được lưu trữ an toàn trên thiết bị và không được gửi đến máy chủ.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  topStrip: { height: 3, backgroundColor: COLORS.bgWarm, flexDirection: 'row' },
  topStripAccent: { width: '40%', height: '100%', backgroundColor: COLORS.accent },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 48,
  },

  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6,
    elevation: 2, marginBottom: 28,
  },

  header: { marginBottom: 32 },
  title: {
    fontSize: 28, fontWeight: '700', color: COLORS.text,
    letterSpacing: -0.6, marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: COLORS.textSub, lineHeight: 20,
  },

  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 12,
  },
  sectionDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: COLORS.accent, marginRight: 8,
  },
  sectionTitle: {
    fontSize: 10, fontWeight: '700', color: COLORS.accent,
    letterSpacing: 2,
  },

  settingCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },

  settingRow: {
    display: 'flex',
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },

  settingLeft: {
    flexDirection: 'row', alignItems: 'center', flex: 10
  },

  settingRight: {
    justifyContent: 'center', alignItems: 'center',
    flex: 1
  },

  settingIcon: {
    width: 40, height: 40, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },

  settingLabel: {
    fontSize: 16, fontWeight: '600', color: COLORS.text,
    marginBottom: 2,
  },

  settingDesc: {
    fontSize: 12, color: COLORS.textMuted,
  },

  noBiometricCard: {
    alignItems: 'center', paddingVertical: 24,
  },

  noBiometricTitle: {
    fontSize: 18, fontWeight: '600', color: COLORS.text,
    marginTop: 12, marginBottom: 8,
  },

  noBiometricDesc: {
    fontSize: 14, color: COLORS.textMuted,
    textAlign: 'center', lineHeight: 20,
  },

  infoSection: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: `${COLORS.success}08`,
    borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: `${COLORS.success}20`,
  },

  infoText: {
    fontSize: 12, color: COLORS.success,
    lineHeight: 16, marginLeft: 8, flex: 1,
  },
});

export default BiometricSettings;