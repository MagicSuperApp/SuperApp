/**
 * AnimalDetailScreen — Hồ sơ cá thể vật nuôi
 *
 * Props qua navigation.route.params: { animalDid: string }
 *
 * TODO: Tích hợp API lấy thông tin đầy đủ cá thể theo animalDid.
 *       Hiện tại là placeholder — hiển thị DID và nút quay lại.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL } from '../shared/theme';

type AnimalDetailRouteParams = {
  AnimalDetail: {
    animalDid: string;
  };
};

const HEADER_BG = '#5d4037';

const AnimalDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AnimalDetailRouteParams, 'AnimalDetail'>>();
  // Guard: route.params có thể undefined (deeplink / caller quên truyền) →
  // tránh crash "undefined is not an object". Thiếu animalDid → hiển thị fallback.
  const { animalDid } = route.params ?? ({} as AnimalDetailRouteParams['AnimalDetail']);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Icon name="paw" size={20} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>Hồ sơ cá thể</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.card}>
          <Icon name="identifier" size={32} color={HEADER_BG} style={styles.cardIcon} />
          <Text style={styles.cardLabel}>Animal DID</Text>
          <Text style={styles.cardDid} numberOfLines={3} selectable>
            {animalDid ?? 'Không có dữ liệu cá thể'}
          </Text>
          <Text style={styles.cardNote}>
            Màn hình này đang được phát triển.{'\n'}
            Thông tin chi tiết cá thể sẽ hiển thị ở đây.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bgSoft },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: NEUTRAL.white, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 40 },

  body: { flex: 1 },
  bodyContent: { padding: 16 },

  card: {
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    alignItems: 'center',
    gap: 10,
  },
  cardIcon: { marginBottom: 4 },
  cardLabel: { fontSize: 12, color: NEUTRAL.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  cardDid: { fontSize: 13, color: NEUTRAL.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'center' },
  cardNote: { fontSize: 13, color: NEUTRAL.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 8 },
});

export default AnimalDetailScreen;
