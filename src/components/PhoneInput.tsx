import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Modal,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../constants';

const { height } = Dimensions.get('window');

// ── Country codes ─────────────────────────────────────────────────────────────
export const COUNTRIES = [
  { code: '+84', flag: '🇻🇳', name: 'Việt Nam', short: 'VN' },
  { code: '+1', flag: '🇺🇸', name: 'Hoa Kỳ', short: 'US' },
  { code: '+86', flag: '🇨🇳', name: 'Trung Quốc', short: 'CN' },
  { code: '+82', flag: '🇰🇷', name: 'Hàn Quốc', short: 'KR' },
  { code: '+81', flag: '🇯🇵', name: 'Nhật Bản', short: 'JP' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore', short: 'SG' },
  { code: '+66', flag: '🇹🇭', name: 'Thái Lan', short: 'TH' },
  { code: '+60', flag: '🇲🇾', name: 'Malaysia', short: 'MY' },
  { code: '+62', flag: '🇮🇩', name: 'Indonesia', short: 'ID' },
  { code: '+63', flag: '🇵🇭', name: 'Philippines', short: 'PH' },
  { code: '+44', flag: '🇬🇧', name: 'Anh', short: 'GB' },
  { code: '+49', flag: '🇩🇪', name: 'Đức', short: 'DE' },
  { code: '+33', flag: '🇫🇷', name: 'Pháp', short: 'FR' },
  { code: '+61', flag: '🇦🇺', name: 'Úc', short: 'AU' },
  { code: '+91', flag: '🇮🇳', name: 'Ấn Độ', short: 'IN' },
];

export interface Country {
  code: string;
  flag: string;
  name: string;
  short: string;
}

// ── Country Picker Modal ──────────────────────────────────────────────────────
const CountryPicker = ({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: Country;
  onSelect: (c: Country) => void;
  onClose: () => void;
}) => {
  const [searchText, setSearchText] = useState('');
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, friction: 8, useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height, duration: 250, useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const filteredCountries = COUNTRIES.filter(country => {
    const query = searchText.trim().toLowerCase();
    if (!query) return true;
    return (
      country.name.toLowerCase().includes(query) ||
      country.code.includes(query) ||
      country.short.toLowerCase().includes(query)
    );
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[styles.pickerSheet, { transform: [{ translateY: slideAnim }] }]}
        >
          <TouchableOpacity activeOpacity={1}>
            {/* Handle */}
            <View style={styles.pickerHandle} />

            {/* Title */}
            <View style={styles.pickerHeader}>
              <Text allowFontScaling={false} style={styles.pickerTitle}>Chọn vùng</Text>
              <TouchableOpacity onPress={onClose} style={styles.pickerCloseBtn}>
                <Icon name="close" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.pickerSearchBox}>
              <Icon name="magnify" size={18} color={COLORS.textSub}/>
              <TextInput
                allowFontScaling={false}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Tìm theo tên, mã vùng..."
                placeholderTextColor={COLORS.textSub}
                style={styles.pickerSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {/* List */}
            <FlatList
              data={filteredCountries}
              keyExtractor={item => item.code + item.short}
              showsVerticalScrollIndicator={false}
              style={styles.pickerList}
              renderItem={({ item }) => {
                const isSelected = item.short === selected.short;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                    onPress={() => { onSelect(item); onClose(); }}
                    activeOpacity={0.75}
                  >
                    <Text allowFontScaling={false} style={styles.pickerFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={false} style={[styles.pickerName, isSelected && { color: COLORS.accent }]}>
                        {item.name}
                      </Text>
                    </View>
                    <Text allowFontScaling={false} style={[styles.pickerCode]}>
                      {item.code}
                    </Text>
                    {isSelected && (
                      <Icon name="check-circle" size={16} color={COLORS.accent} style={{ marginLeft: 6 }} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

interface PhoneInputProps {
  country: Country;
  onChangeCountry: (c: Country) => void;
  phone: string;
  onChangePhone: (val: string) => void;
  isLoading?: boolean;
  showBiometric?: boolean;
  onBiometricPress?: () => void;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  country,
  onChangeCountry,
  phone,
  onChangePhone,
  isLoading = false,
  showBiometric = false,
  onBiometricPress,
}) => {
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const borderAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  };

  const handleBlur = () => {
    setFocused(false);
    Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.accent],
  });

  return (
    <>
      <View style={styles.phoneInputContainer}>
        <Animated.View style={[styles.phoneRow, { borderColor, flex: 1 }]}>
          {focused && <View style={styles.inputGlow} />}

          {/* Country selector */}
          <TouchableOpacity
            style={styles.countryBtn}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.8}
          >
            <Text allowFontScaling={false} style={styles.countryFlag}>{country.flag}</Text>
            <Text allowFontScaling={false} style={styles.countryCode}>{country.code}</Text>
            <Icon name="menu-down" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.phoneDivider} />

          {/* Number input */}
          <TextInput
            allowFontScaling={false}
            style={styles.phoneInput}
            placeholder="Số điện thoại"
            placeholderTextColor={COLORS.textMuted}
            value={phone}
            onChangeText={onChangePhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </Animated.View>

        {showBiometric && (
          <TouchableOpacity
            style={styles.biometricBtn}
            onPress={onBiometricPress}
            activeOpacity={0.8}
          >
            <Icon name="fingerprint" size={28} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>

      <CountryPicker
        visible={pickerOpen}
        selected={country}
        onSelect={onChangeCountry}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  phoneInputContainer: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12, borderWidth: 1.5,
    overflow: 'hidden', position: 'relative',
  },
  biometricBtn: {
    width: 54, height: 54, borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1.5, borderColor: COLORS.accentLight,
  },
  inputGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.accentGlow,
  },
  countryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 12, paddingVertical: 16,
    zIndex: 1,
  },
  countryFlag: { fontSize: 15 },
  countryCode: {
    fontSize: 14, fontWeight: '700', color: COLORS.text,
  },
  phoneDivider: {
    width: 1, height: 24, backgroundColor: COLORS.border, marginRight: 2,
  },
  phoneInput: {
    flex: 1, fontSize: 16, color: COLORS.text,
    paddingHorizontal: 10, paddingVertical: 16,
    zIndex: 1,
  },

  // Country picker modal styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: height * 0.65,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20,
    elevation: 20,
  },
  pickerHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  pickerTitle: {
    fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2,
  },
  pickerCloseBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.bgWarm,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  pickerList: { paddingHorizontal: 16, paddingTop: 8 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 4,
  },
  pickerSearchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    marginHorizontal: 16, marginVertical: 10,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    padding: 0,
  },
  pickerItemActive: {
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pickerFlag: { fontSize: 24 },
  pickerName: {
    fontSize: 14, fontWeight: '500', color: COLORS.text,
  },
  pickerCode: {
    fontSize: 14, fontWeight: '600', color: COLORS.textSub,
  },
});

export default PhoneInput;
