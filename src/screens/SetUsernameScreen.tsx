// screens/SetUsernameScreen.tsx
// Đặt hoặc đổi username PhoenixKey.
// Backend PhoenixKey đã sẵn: PUT /identity/username (needsAuth: true).
// Nếu session token chưa có → lưu local, sync lên server sau khi có session.

import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { phoenixKeyApi } from '../services/phoenixKey-api';
import { ensurePhoenixKeySession } from '../services/phoenixKeyAuthService';
import { RootState } from '../store';
import { useAppDispatch } from '../store/hooks';
import { setUser } from '../store/userSlice';
import { COLORS } from '../constants';

const USERNAME_REGEX = /^[a-z][a-z0-9_]{2,19}$/;
const ACTIVE_USERNAME_KEY = '@phoenixkey/active_username';
const AUTH_BLUE = '#3B6EA8';

const SetUsernameScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();

  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const existingUsername = currentUser?.name ?? '';

  const [value, setValue] = useState(existingUsername);
  const [saving, setSaving] = useState(false);
  const [syncedToServer, setSyncedToServer] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  const trimmed = value.trim().toLowerCase();
  const validation = useMemo<{ ok: boolean; reason?: string }>(() => {
    if (trimmed.length === 0) return { ok: false };
    if (!USERNAME_REGEX.test(trimmed)) {
      return {
        ok: false,
        reason: 'Username 3–20 ký tự, bắt đầu bằng chữ thường, chỉ a-z, 0-9, _',
      };
    }
    if (trimmed === existingUsername.toLowerCase()) {
      return { ok: false, reason: 'Giống username hiện tại' };
    }
    return { ok: true };
  }, [trimmed, existingUsername]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSave = async () => {
    if (!validation.ok) { shake(); return; }
    Keyboard.dismiss();
    setSaving(true);

    // Luôn lưu local trước.
    await AsyncStorage.setItem(ACTIVE_USERNAME_KEY, trimmed).catch(() => {});

    // Cập nhật Redux local.
    if (currentUser) {
      dispatch(setUser({ ...currentUser, name: trimmed }));
    }

    // Thử sync lên PhoenixKey server — fail gracefully.
    // Nếu chưa có session, ensurePhoenixKeySession sẽ trigger biometric.
    // Nếu biometric bị từ chối hoặc network lỗi → lưu local là đủ cho UX ngay.
    let synced = false;
    try {
      await ensurePhoenixKeySession();
      await phoenixKeyApi.identity.setUsername(trimmed);
      synced = true;
    } catch {
      // Biometric từ chối / network fail → đã lưu local ở trên, tiếp tục.
    }

    setSyncedToServer(synced);
    setSaving(false);

    // Đợi user thấy kết quả rồi back.
    setTimeout(() => navigation.goBack(), 900);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đặt username</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        {/* Mô tả */}
        <View style={styles.descCard}>
          <Icon name="account-circle-outline" size={18} color={AUTH_BLUE} />
          <Text style={styles.descText}>
            Username dùng để đăng nhập mọi app tích hợp PhoenixKey.
            Chỉ chứa chữ thường, số và dấu gạch dưới.
          </Text>
        </View>

        {/* Input */}
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <View style={[
            styles.inputWrap,
            trimmed.length > 0 && !validation.ok && styles.inputWrapError,
            trimmed.length > 0 && validation.ok  && styles.inputWrapOk,
          ]}>
            <Text style={styles.inputPrefix}>@</Text>
            <TextInput
              style={styles.input}
              placeholder="ten_nguoi_dung"
              placeholderTextColor={COLORS.textMuted}
              value={value}
              onChangeText={text => setValue(text.replace(/\s/g, '').toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSave}
              maxLength={20}
            />
            {trimmed.length > 0 && (
              validation.ok
                ? <Icon name="check-circle" size={18} color="#16A34A" />
                : <Icon name="alert-circle-outline" size={18} color="#DC2626" />
            )}
          </View>
          {trimmed.length > 0 && validation.reason ? (
            <Text style={styles.errorText}>{validation.reason}</Text>
          ) : null}
        </Animated.View>

        {/* Nút lưu */}
        <TouchableOpacity
          style={[styles.saveBtn, (!validation.ok || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!validation.ok || saving}
          activeOpacity={0.82}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="check" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Lưu username</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Kết quả sync */}
        {syncedToServer && (
          <View style={styles.syncOk}>
            <Icon name="cloud-check-outline" size={15} color="#16A34A" />
            <Text style={styles.syncOkText}>Đã đồng bộ lên PhoenixKey server</Text>
          </View>
        )}

        {/* Hint về sync */}
        <Text style={styles.hint}>
          Nếu chưa đăng nhập PhoenixKey, username được lưu trên thiết bị và sẽ tự đồng bộ sau.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const AUTH_BLUE_LIGHT = '#EEF4FA';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header
  header: {
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
  headerPlaceholder: { width: 36 },

  // Body
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 16,
  },

  // Desc
  descCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: AUTH_BLUE_LIGHT,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: `${AUTH_BLUE}30`,
  },
  descText: {
    flex: 1,
    fontSize: 13,
    color: AUTH_BLUE,
    lineHeight: 19,
  },

  // Input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    backgroundColor: COLORS.card,
    gap: 6,
  },
  inputWrapError: {
    borderColor: '#DC2626',
  },
  inputWrapOk: {
    borderColor: '#16A34A',
  },
  inputPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    padding: 0,
  },
  errorText: {
    marginTop: 5,
    marginLeft: 4,
    fontSize: 12,
    color: '#DC2626',
  },

  // Nút lưu
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AUTH_BLUE,
    borderRadius: 12,
    paddingVertical: 15,
    shadowColor: AUTH_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: COLORS.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Sync result
  syncOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  syncOkText: {
    fontSize: 13,
    color: '#16A34A',
    fontWeight: '500',
  },

  // Hint
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 4,
  },
});

export default SetUsernameScreen;
