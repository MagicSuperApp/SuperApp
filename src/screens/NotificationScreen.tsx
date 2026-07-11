// screens/NotificationScreen.tsx
//
// Màn THÔNG BÁO tối giản — đích của nút chuông trên AppHeader. Hiện chưa nối
// backend thông báo (chưa có nguồn dữ liệu thật) nên render empty-state trung
// thực "Chưa có thông báo" thay vì bịa danh sách. Khi có API/push feed, thay
// mảng rỗng bằng dữ liệu thật + FlatList (KHÔNG đổi khung màn).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';

const NotificationScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      {/* Thanh trên đơn giản: quay lại + tiêu đề */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.7}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
          accessibilityLabel="Quay lại"
        >
          <Icon name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Thông báo</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Empty state trung thực */}
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <Icon name="bell-sleep-outline" size={40} color={COLORS.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có thông báo</Text>
        <Text style={styles.emptySub}>
          Nhắc quét cây, cập nhật đồng bộ và tin từ hệ thống sẽ xuất hiện tại đây.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.bgWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13.5, lineHeight: 20, color: COLORS.textMuted, textAlign: 'center' },
});

export default NotificationScreen;
