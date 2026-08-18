/**
 * AnimalManagementScreen — Danh sách & quản lý cá thể vật nuôi
 *
 * Tính năng:
 *  - GET /api/animal/list → danh sách cá thể (pagination limit/offset, filter species)
 *  - Pull to refresh
 *  - Load thêm khi cuộn đến cuối (load more / infinite scroll)
 *  - Filter theo loài (chip ngang)
 *  - Mỗi item: tên, DID, loài, số ảnh
 *  - Long press → Action sheet: Đổi tên / Xoá (có confirmation dialog)
 *  - Empty state: icon + text + chỉ đường sang trang trại (KHÔNG có nút thêm —
 *    thêm vật nuôi cần farm_id, xem `renderEmpty`)
 *  - Error state: icon + text + nút Thử lại
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

import { COLORS } from '../constants';
import { NEUTRAL } from '../shared/theme';
import {
  listAnimals,
  deleteAnimal,
  type AnimalInfo,
} from '../services/animalReIDService';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { ORILIFE_BASE } from '../services/orilifeBase';
const BASE_URL: string =
  ORILIFE_BASE;

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Species filter
// ---------------------------------------------------------------------------

const SPECIES_OPTIONS: Array<{ key: string; label: string; icon: string }> = [
  { key: '',      label: 'Tất cả',  icon: 'paw'           },
  { key: 'ga',    label: 'Gà',      icon: 'bird'          },
  { key: 'lon',   label: 'Lợn',     icon: 'pig'           },
  { key: 'de',    label: 'Dê',      icon: 'cow'           },
  { key: 'bo',    label: 'Bò',      icon: 'cow'           },
  { key: 'vit',   label: 'Vịt',     icon: 'bird'          },
  { key: 'ngong', label: 'Ngỗng',   icon: 'bird'          },
  { key: 'cho',   label: 'Chó',     icon: 'dog'           },
  { key: 'meo',   label: 'Mèo',     icon: 'cat'           },
];

const SPECIES_LABELS: Record<string, string> = SPECIES_OPTIONS.reduce<Record<string, string>>(
  (acc, s) => { if (s.key) acc[s.key] = s.label; return acc; },
  {},
);

function speciesLabel(s: string): string {
  return SPECIES_LABELS[s.toLowerCase()] ?? s;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnimalItem = AnimalInfo;

// ---------------------------------------------------------------------------
// Sub-component: Rename Modal
// ---------------------------------------------------------------------------

interface RenameModalProps {
  visible: boolean;
  currentName: string;
  onConfirm: (newName: string) => void;
  onDismiss: () => void;
}

const RenameModal: React.FC<RenameModalProps> = ({
  visible,
  currentName,
  onConfirm,
  onDismiss,
}) => {
  const [value, setValue] = useState(currentName);

  useEffect(() => {
    if (visible) setValue(currentName);
  }, [visible, currentName]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={modal.overlay}>
        <View style={modal.dialog}>
          <Text style={modal.title}>Đổi tên cá thể</Text>
          <TextInput
            style={modal.input}
            value={value}
            onChangeText={setValue}
            placeholder="Nhập tên mới..."
            placeholderTextColor={NEUTRAL.textMuted}
            autoFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (value.trim()) onConfirm(value.trim());
            }}
          />
          <View style={modal.actions}>
            <TouchableOpacity
              style={[modal.btn, modal.btnCancel]}
              onPress={onDismiss}
              activeOpacity={0.8}
            >
              <Text style={modal.btnCancelText}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                modal.btn,
                modal.btnConfirm,
                !value.trim() && modal.btnDisabled,
              ]}
              onPress={() => {
                if (value.trim()) onConfirm(value.trim());
              }}
              disabled={!value.trim()}
              activeOpacity={0.8}
            >
              <Text style={modal.btnConfirmText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Animal card
// ---------------------------------------------------------------------------

interface AnimalCardProps {
  item: AnimalItem;
  onPress: () => void;
  onLongPress: () => void;
}

const AnimalCard: React.FC<AnimalCardProps> = ({ item, onPress, onLongPress }) => (
  <TouchableOpacity
    style={styles.card}
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.75}
    delayLongPress={450}
  >
    {/* Avatar */}
    <View style={styles.cardAvatar}>
      <Icon name="paw" size={26} color={HEADER_BG} />
    </View>

    {/* Info */}
    <View style={styles.cardInfo}>
      <Text style={styles.cardName} numberOfLines={1}>
        {item.name || 'Chưa đặt tên'}
      </Text>
      <Text style={styles.cardCode} numberOfLines={1}>
        {item.animal_did}
      </Text>

      <View style={styles.cardMeta}>
        {/* Loài */}
        <View style={styles.metaPill}>
          <Icon name="paw-outline" size={12} color={NEUTRAL.textMuted} />
          <Text style={styles.metaPillText}>{speciesLabel(item.species)}</Text>
        </View>

        {/* Số ảnh */}
        {item.n_images !== undefined && item.n_images > 0 && (
          <View style={styles.metaPill}>
            <Icon name="image-multiple-outline" size={12} color={NEUTRAL.textMuted} />
            <Text style={styles.metaPillText}>{item.n_images} ảnh</Text>
          </View>
        )}
      </View>
    </View>

    <Icon name="chevron-right" size={22} color={NEUTRAL.textMuted} />
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const AnimalManagementScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [animals, setAnimals] = useState<AnimalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const offsetRef = useRef(0);

  // Rename state
  const [renameTarget, setRenameTarget] = useState<AnimalItem | null>(null);
  const [pendingRename, setPendingRename] = useState<Record<string, string>>({});

  // Tránh double-call khi unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Load animals ──────────────────────────────────────────────────────────
  const loadAnimals = useCallback(async (
    opts: { refresh?: boolean; loadMore?: boolean; species?: string } = {},
  ) => {
    const { refresh = false, loadMore = false } = opts;
    const species = opts.species !== undefined ? opts.species : selectedSpecies;

    if (loadMore && !hasMore) return;

    try {
      if (refresh) {
        setIsRefreshing(true);
        offsetRef.current = 0;
      } else if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        offsetRef.current = 0;
      }
      setLoadError(null);

      const currentOffset = loadMore ? offsetRef.current : 0;
      const res = await listAnimals(BASE_URL, undefined, species || undefined, PAGE_SIZE, currentOffset);

      if (!mountedRef.current) return;

      if (res.ok && res.animals) {
        const fetched = res.animals;
        if (loadMore) {
          setAnimals(prev => [...prev, ...fetched]);
        } else {
          setAnimals(fetched);
        }
        offsetRef.current = currentOffset + fetched.length;
        setHasMore(fetched.length === PAGE_SIZE);
      } else {
        setLoadError(res.error?.detail ?? 'Không thể tải danh sách cá thể.');
      }
    } catch {
      if (mountedRef.current) {
        setLoadError('Không thể kết nối. Kiểm tra mạng và thử lại.');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, [selectedSpecies, hasMore]);

  useEffect(() => {
    loadAnimals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Species filter ────────────────────────────────────────────────────────
  const handleSpeciesChange = useCallback((key: string) => {
    setSelectedSpecies(key);
    setHasMore(true);
    offsetRef.current = 0;
    setAnimals([]);
    setLoadError(null);
    setIsLoading(true);

    listAnimals(BASE_URL, undefined, key || undefined, PAGE_SIZE, 0).then(res => {
      if (!mountedRef.current) return;
      if (res.ok && res.animals) {
        setAnimals(res.animals);
        offsetRef.current = res.animals.length;
        setHasMore(res.animals.length === PAGE_SIZE);
      } else {
        setLoadError(res.error?.detail ?? 'Không thể tải danh sách cá thể.');
      }
      setIsLoading(false);
    }).catch(() => {
      if (mountedRef.current) {
        setLoadError('Không thể kết nối. Kiểm tra mạng và thử lại.');
        setIsLoading(false);
      }
    });
  }, []);

  // ── Rename (local optimistic — không có rename endpoint, lưu vào pendingRename)
  const handleRenameConfirm = (newName: string) => {
    if (!renameTarget) return;
    // Optimistic update local
    setAnimals(prev =>
      prev.map(a =>
        a.animal_did === renameTarget.animal_did ? { ...a, name: newName } : a,
      ),
    );
    setPendingRename(prev => ({ ...prev, [renameTarget.animal_did]: newName }));
    setRenameTarget(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (item: AnimalItem) => {
    Alert.alert(
      'Xoá cá thể?',
      `Cá thể "${item.name || item.animal_did}" sẽ bị xoá khỏi hệ thống. Không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteAnimal(BASE_URL, item.animal_did);
              if (res.ok) {
                setAnimals(prev => prev.filter(a => a.animal_did !== item.animal_did));
              } else {
                Alert.alert('Xoá thất bại', res.error?.detail ?? 'Thử lại.');
              }
            } catch {
              Alert.alert('Lỗi mạng', 'Không thể xoá. Kiểm tra kết nối và thử lại.');
            }
          },
        },
      ],
    );
  };

  // ── Action sheet (long press) ─────────────────────────────────────────────
  const handleLongPress = (item: AnimalItem) => {
    Alert.alert(
      item.name || item.animal_did || 'Cá thể chưa đặt tên',
      'Chọn hành động:',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Đổi tên',
          onPress: () => setRenameTarget(item),
        },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: () => handleDelete(item),
        },
      ],
    );
  };

  // ── Footer khi load thêm ──────────────────────────────────────────────────
  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={COLORS.accent} />
      </View>
    );
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="paw-off-outline" size={64} color={NEUTRAL.textMuted} />
      <Text style={styles.emptyTitle}>Chưa có cá thể nào</Text>
      <Text style={styles.emptySubtitle}>
        {selectedSpecies
          ? `Chưa có ${speciesLabel(selectedSpecies).toLowerCase()} nào được đăng ký`
          : 'Chưa có vật nuôi nào'}
      </Text>
      {/* Thêm/nhận diện vật nuôi cần ngữ cảnh trang trại (backend bắt buộc farm_id).
          Màn này liệt kê mọi farm nên KHÔNG có nút thêm — vào từng trang trại để thêm. */}
      <Text style={styles.emptySubtitle}>
        Để thêm vật nuôi, hãy mở trang trại tương ứng rồi đăng ký từ trong đó.
      </Text>
    </View>
  );

  // ── Error state ───────────────────────────────────────────────────────────
  const renderError = () => (
    <View style={styles.errorContainer}>
      <Icon name="alert-circle-outline" size={52} color={NEUTRAL.textMuted} />
      <Text style={styles.errorText}>{loadError}</Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => loadAnimals()}
        activeOpacity={0.8}
      >
        <Icon name="refresh" size={17} color={NEUTRAL.white} />
        <Text style={styles.retryBtnText}>Thử lại</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Main render ───────────────────────────────────────────────────────────
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
          <Icon name="paw" size={19} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>Quản lý vật nuôi</Text>
          {animals.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{animals.length}</Text>
            </View>
          )}
        </View>
        {/* Bỏ nút "+" thêm ở màn toàn cục: thêm vật nuôi cần ngữ cảnh trang trại
            (backend bắt buộc farm_id). Giữ View rỗng để cân header. */}
        <View style={styles.addBtn} />
      </View>

      {/* Species filter chips */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {SPECIES_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[
                styles.filterChip,
                selectedSpecies === opt.key && styles.filterChipActive,
              ]}
              onPress={() => handleSpeciesChange(opt.key)}
              activeOpacity={0.75}
            >
              <Icon
                name={opt.icon}
                size={14}
                color={selectedSpecies === opt.key ? NEUTRAL.white : NEUTRAL.textSub}
              />
              <Text
                style={[
                  styles.filterChipText,
                  selectedSpecies === opt.key && styles.filterChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Đang tải...</Text>
        </View>
      ) : loadError ? (
        renderError()
      ) : (
        <FlatList
          data={animals}
          keyExtractor={item => item.animal_did}
          renderItem={({ item }) => (
            <AnimalCard
              item={item}
              onPress={() => navigation.navigate('AnimalDetail', { animalDid: item.animal_did })}
              onLongPress={() => handleLongPress(item)}
            />
          )}
          contentContainerStyle={
            animals.length === 0 ? styles.listEmpty : styles.listContent
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadAnimals({ refresh: true })}
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
            />
          }
          onEndReached={() => {
            if (!isLoadingMore && hasMore && !loadError) {
              loadAnimals({ loadMore: true });
            }
          }}
          onEndReachedThreshold={0.3}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Rename modal */}
      <RenameModal
        visible={renameTarget !== null}
        currentName={renameTarget?.name ?? ''}
        onConfirm={handleRenameConfirm}
        onDismiss={() => setRenameTarget(null)}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEADER_BG = '#5d4037';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NEUTRAL.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingTop: Platform.OS === 'ios' ? 52 : 38,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: { color: NEUTRAL.white, fontSize: 17, fontWeight: '700' },
  countBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    color: NEUTRAL.white,
    fontSize: 12,
    fontWeight: '700',
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  filterBar: {
    backgroundColor: NEUTRAL.card,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.border,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  filterChipActive: {
    backgroundColor: HEADER_BG,
    borderColor: HEADER_BG,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: NEUTRAL.textSub,
  },
  filterChipTextActive: {
    color: NEUTRAL.white,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: { fontSize: 14, color: NEUTRAL.textMuted },

  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
  },
  errorText: {
    fontSize: 14,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: { color: NEUTRAL.white, fontSize: 14, fontWeight: '600' },

  listContent: { padding: 14, paddingBottom: 28 },
  listEmpty: { flex: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NEUTRAL.card,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#efebe9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { fontSize: 15, fontWeight: '600', color: NEUTRAL.text },
  cardCode: { fontSize: 12, color: NEUTRAL.textMuted, marginTop: 1 },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: NEUTRAL.bgSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  metaPillText: { fontSize: 11, color: NEUTRAL.textMuted },

  separator: { height: 10 },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: NEUTRAL.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: NEUTRAL.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: HEADER_BG,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 6,
  },
  emptyBtnText: { color: NEUTRAL.white, fontSize: 15, fontWeight: '600' },

  footerLoader: {
    paddingVertical: 18,
    alignItems: 'center',
  },
});

// ─── Rename modal styles ───────────────────────────────────────────────────
const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: NEUTRAL.bg,
    borderRadius: 18,
    padding: 22,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: NEUTRAL.text,
    textAlign: 'center',
  },
  input: {
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: NEUTRAL.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: NEUTRAL.textSub,
  },
  btnConfirm: { backgroundColor: HEADER_BG },
  btnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: NEUTRAL.white,
  },
  btnDisabled: { opacity: 0.45 },
});

export default AnimalManagementScreen;
