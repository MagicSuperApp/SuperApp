/**
 * TreeManagementScreen — Danh sách và quản lý cây đã đăng ký
 *
 * Tính năng:
 *  - GET /api/trees → danh sách cây
 *  - Pull to refresh
 *  - Mỗi item: tên, code, n_views, badge 3D, badge neo
 *  - Long press → Action sheet: Đổi tên / Xoá (có confirmation dialog)
 *  - Empty state: icon + text + nút "Đăng ký cây đầu tiên"
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
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { COLORS } from '../constants';
import { NEUTRAL } from '../shared/theme';
import RenameModal from '../components/RenameModal';
import {
  getTrees,
  deleteTree,
  renameTree,
  type TreeInfo,
} from '../services/treeReIDService';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { ORILIFE_BASE } from '../services/orilifeBase';
import { forTree, useOpenWayfind } from '../features/wayfind/WayfindButton';
const BASE_URL: string =
  ORILIFE_BASE;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TreeItem = TreeInfo;

/**
 * Tham số màn. `farmId` là TUỲ CHỌN và hiện chưa nơi gọi nào truyền — màn này
 * vốn liệt kê cây của MỌI vườn.
 *
 * Vì sao vẫn nhận: `TreeInfo` (`services/treeReIDService.ts`) KHÔNG có trường
 * vườn nào, nên cây trong danh sách này không tự khai được nó thuộc vườn nào.
 * Không có mã vườn thì màn Dẫn đường mở ra từ đây mất ranh giới vườn và phải
 * kéo cây của mọi vườn về. Nơi nào biết mình đang đứng trong một vườn thì
 * truyền `farmId` vào là cả danh sách lẫn đường dẫn đường đều thu đúng vườn đó.
 */
interface RouteParams {
  farmId?: string;
}

// ---------------------------------------------------------------------------
// Sub-component: Tree card
// ---------------------------------------------------------------------------

interface TreeCardProps {
  item: TreeItem;
  onPress: () => void;
  onLongPress: () => void;
  onFruits: () => void;
  /** null = cây chưa có toạ-độ → KHÔNG hiện nút dẫn đường (không có gì để dẫn tới). */
  onWayfind: (() => void) | null;
}

const TreeCard: React.FC<TreeCardProps> = ({ item, onPress, onLongPress, onFruits, onWayfind }) => (
  <TouchableOpacity
    style={styles.card}
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.75}
    delayLongPress={450}
  >
    {/* Avatar */}
    <View style={styles.cardAvatar}>
      <Icon name="tree" size={26} color="#1b5e20" />
      {item.has3d && (
        <View style={styles.badge3d}>
          <Icon name="cube-outline" size={9} color={NEUTRAL.white} />
        </View>
      )}
    </View>

    {/* Info */}
    <View style={styles.cardInfo}>
      <Text style={styles.cardName} numberOfLines={1}>
        {item.name || 'Cây chưa đặt tên'}
      </Text>
      <Text style={styles.cardCode} numberOfLines={1}>
        {item.tree_id}
      </Text>

      <View style={styles.cardMeta}>
        {/* Số góc */}
        <View style={styles.metaPill}>
          <Icon name="image-multiple-outline" size={12} color={NEUTRAL.textMuted} />
          <Text style={styles.metaPillText}>{item.n_views} góc</Text>
        </View>

        {/* Neo */}
        {item.anchor === 'confirmed' && (
          <View style={[styles.metaPill, styles.pillAnchor]}>
            <Icon name="link-variant" size={12} color={NEUTRAL.white} />
            <Text style={[styles.metaPillText, styles.pillAnchorText]}>Neo</Text>
          </View>
        )}
        {item.anchor === 'pending' && (
          <View style={[styles.metaPill, styles.pillAnchorPending]}>
            <Icon name="link-variant" size={12} color={NEUTRAL.white} />
            <Text style={[styles.metaPillText, styles.pillAnchorText]}>Neo (chờ)</Text>
          </View>
        )}
      </View>
    </View>

    {/* Dẫn đường tới đúng gốc cây — chỉ khi cây đã có toạ-độ */}
    {onWayfind && (
      <TouchableOpacity
        style={styles.fruitPill}
        onPress={onWayfind}
        accessibilityLabel={`Dẫn đường tới ${item.name || 'cây'}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Icon name="navigation-variant-outline" size={16} color={HEADER_BG} />
        <Text style={styles.fruitPillText}>Đường</Text>
      </TouchableOpacity>
    )}

    {/* Lối vào danh-sách QUẢ (field-reid) — dùng đúng tree_id của cây này */}
    <TouchableOpacity style={styles.fruitPill} onPress={onFruits} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Icon name="fruit-cherries" size={16} color="#1b5e20" />
      <Text style={styles.fruitPillText}>Quả</Text>
    </TouchableOpacity>

    <Icon name="chevron-right" size={22} color={NEUTRAL.textMuted} />
  </TouchableOpacity>
);

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const TreeManagementScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  // Đường vào màn Dẫn đường đi qua cửa chung — xem `features/wayfind/WayfindButton`.
  const openWayfind = useOpenWayfind();
  const farmId = (route.params as RouteParams | undefined)?.farmId;

  const [trees, setTrees] = useState<TreeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<TreeItem | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Ref để tránh double-call khi unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Load trees ───────────────────────────────────────────────────────────
  const loadTrees = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setLoadError(null);

      // Có mã vườn thì lọc luôn ở máy chủ: danh sách và màn Dẫn đường mở ra từ
      // nó phải nói về CÙNG một vườn, không thì hai chỗ đếm cây khác nhau.
      const res = await getTrees(BASE_URL, farmId);

      if (!mountedRef.current) return;

      if (res.ok && res.trees) {
        setTrees(res.trees);
      } else {
        setLoadError(res.error?.detail ?? 'Không thể tải danh sách cây.');
      }
    } catch {
      if (mountedRef.current) {
        setLoadError('Không thể kết nối. Kiểm tra mạng và thử lại.');
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
    // `farmId` nằm trong deps: đổi vườn thì phải hỏi lại máy chủ, không thì
    // danh sách còn là của vườn cũ mà đầu màn đã nói vườn mới.
  }, [farmId]);

  useEffect(() => {
    loadTrees();
  }, [loadTrees]);

  // ── Rename ───────────────────────────────────────────────────────────────
  const handleRenameConfirm = async (newName: string) => {
    if (!renameTarget) return;
    setIsRenaming(true);
    try {
      const res = await renameTree(BASE_URL, renameTarget.tree_id, newName);
      if (res.ok) {
        setTrees(prev =>
          prev.map(t =>
            t.tree_id === renameTarget.tree_id ? { ...t, name: newName } : t,
          ),
        );
        setRenameTarget(null);
      } else {
        Alert.alert('Đổi tên thất bại', res.error?.detail ?? 'Thử lại.');
      }
    } finally {
      setIsRenaming(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = (item: TreeItem) => {
    Alert.alert(
      'Xoá cây?',
      `Cây "${item.name || item.tree_id}" sẽ bị xoá khỏi hệ thống. Không thể hoàn tác.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteTree(BASE_URL, item.tree_id);
              if (res.ok) {
                setTrees(prev => prev.filter(t => t.tree_id !== item.tree_id));
              } else {
                Alert.alert('Xoá thất bại', res.error?.detail ?? 'Thử lại.');
              }
            } catch {
              Alert.alert('Lỗi mạng', 'Không thể xoá cây. Kiểm tra kết nối và thử lại.');
            }
          },
        },
      ],
    );
  };

  // ── Action sheet (long press) ─────────────────────────────────────────────
  const handleLongPress = (item: TreeItem) => {
    Alert.alert(
      item.name || item.tree_id || 'Cây chưa đặt tên',
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

  // ── Render empty state ────────────────────────────────────────────────────
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="tree-outline" size={64} color={NEUTRAL.textMuted} />
      <Text style={styles.emptyTitle}>Chưa có cây nào</Text>
      <Text style={styles.emptySubtitle}>
        Bắt đầu bằng cách nhận diện hoặc đăng ký cây đầu tiên
      </Text>
      <TouchableOpacity
        style={styles.emptyBtn}
        onPress={() => navigation.navigate('TreeIdentity')}
        activeOpacity={0.8}
      >
        <Icon name="camera-plus-outline" size={20} color={NEUTRAL.white} />
        <Text style={styles.emptyBtnText}>Đăng ký cây đầu tiên</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render error state ────────────────────────────────────────────────────
  const renderError = () => (
    <View style={styles.errorContainer}>
      <Icon name="alert-circle-outline" size={52} color={NEUTRAL.textMuted} />
      <Text style={styles.errorText}>{loadError}</Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => loadTrees()}
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
          <Icon name="tree" size={19} color={NEUTRAL.white} />
          <Text style={styles.headerTitle}>Quản lý cây</Text>
          {trees.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{trees.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('TreeIdentity')}
          activeOpacity={0.7}
        >
          <Icon name="plus" size={24} color={NEUTRAL.white} />
        </TouchableOpacity>
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
          data={trees}
          keyExtractor={item => item.tree_id}
          renderItem={({ item }) => {
            // Cây chưa có toạ độ → `forTree` trả null → thẻ tự giấu nút.
            //
            // Mã vườn phải truyền TAY: `TreeInfo` không có `farmId` lẫn
            // `farm_id`, nên đường lùi trong `forTree` không vớt được gì và
            // đích sẽ đi với `farmId: undefined`. Khi đó màn Dẫn đường mất
            // ranh giới vườn và gọi `getTrees` không lọc — chủ hai vườn cách
            // nhau 30 km sẽ thấy cây vườn kia trong "Cây quanh chỗ bạn đứng".
            // Lỗi này đã xảy ra một lần trước khi gom về `WayfindButton`.
            const target = forTree(item, farmId);
            return (
              <TreeCard
                item={item}
                onPress={() => navigation.navigate('TreeDetail', { treeId: item.tree_id })}
                onLongPress={() => handleLongPress(item)}
                onFruits={() => navigation.navigate('FruitList', { treeId: item.tree_id, treeName: item.name })}
                onWayfind={target ? () => openWayfind(target) : null}
              />
            );
          }}
          contentContainerStyle={
            trees.length === 0 ? styles.listEmpty : styles.listContent
          }
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadTrees(true)}
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Rename modal */}
      <RenameModal
        visible={renameTarget !== null}
        currentName={renameTarget?.name ?? ''}
        title="Đổi tên cây"
        confirmColor={HEADER_BG}
        onConfirm={handleRenameConfirm}
        onDismiss={() => setRenameTarget(null)}
      />

      {/* Renaming overlay */}
      {isRenaming && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.overlayText}>Đang đổi tên...</Text>
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const HEADER_BG = '#1b5e20';

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
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge3d: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#7b1fa2',
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
  fruitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 9, borderWidth: 1, borderColor: '#c8e6c9', marginRight: 6,
  },
  fruitPillText: { fontSize: 12, color: '#1b5e20', fontWeight: '700' },
  pillAnchor: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  pillAnchorPending: {
    backgroundColor: '#607d8b',
    borderColor: '#607d8b',
  },
  pillAnchorText: { color: NEUTRAL.white },

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

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  overlayText: {
    marginTop: 14,
    color: NEUTRAL.white,
    fontSize: 14,
    fontWeight: '500',
  },
});

// ─── Rename modal styles ───────────────────────────────────────────────────
export default TreeManagementScreen;
