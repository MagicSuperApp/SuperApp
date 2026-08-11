// modules/proofchat/shared/components/FeatureRemovedNotice.tsx
//
// Màn thay-thế cho tính-năng ĐÃ BỎ nhưng route còn giữ.
//
// Vì sao giữ route: liên-kết cũ, thông-báo cũ, ảnh chụp màn cũ vẫn trỏ tới
// 'ProofChatWallet'/'ProofChatEscrow'. Gỡ route đi thì các đường đó văng lỗi
// điều-hướng. Giữ route + hiện MỘT CÂU nói rõ thì người dùng hiểu ngay, và
// không ai còn thấy một màn có số dư giả để bấm (issue #110).
//
// KHÔNG hiện-thực-hoá lại ví/ký-quỹ trong chat: `module.manifest.json` của
// proofchat ghi quyết-định "CHAT KHÔNG escrow/ví (anh Aladin chốt: nhắn tin
// miễn phí)". Đổi ý thì sửa manifest trước, đừng sửa màn này.

import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NEUTRAL } from '../../../../shared/theme';

interface Props {
  /** Biểu-tượng Material Community. */
  icon: string;
  /** Đúng MỘT câu, nói rõ tính-năng không có ở đây. */
  message: string;
}

const FeatureRemovedNotice: React.FC<Props> = ({ icon, message }) => {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />

      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
      >
        <Icon name="chevron-left" size={24} color={NEUTRAL.text} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Icon name={icon} size={40} color={NEUTRAL.textMuted} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NEUTRAL.bg },
  backBtn: { marginTop: 44, marginLeft: 12, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 64, gap: 14 },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
  },
});

export default FeatureRemovedNotice;
