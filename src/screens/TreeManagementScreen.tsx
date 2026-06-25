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
  TextInput,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

import { COLORS } from '../constants';
import { NEUTRAL } from '../shared/theme';
import {
  getTrees,
  deleteTree,
  renameTree,
  type TreeInfo,
} from '../services/treeReIDService';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { ORILIFE_API_BASE_URL } from '@env';
const BASE_URL: string =
  (ORILIFE_API_BASE_URL as string | undefined) ?? 'https://api.orilife.io';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TreeItem = TreeInfo;

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

  // Reset khi mở lại với tên khác
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
          <Text style={modal.title}>Đổi tên cây</Text>
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
// Sub-component: Tree card
// ---------------------------------------------------------------------------

interface TreeCardProps {
  item: TreeItem;
  onPress: () => void;
  onLongPress: () => void;
  onFruits: () => void;
}

const TreeCard: React.FC<TreeCardProps> = ({ item, onPress, onLongPress, onFruits }) => (
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

      const res = await getTrees(BASE_URL);

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
  }, []);

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
          renderItem={({ item }) => (
            <TreeCard
              item={item}
              onPress={() => navigation.navigate('TreeDetail', { treeId: item.tree_id })}
              onLongPress={() => handleLongPress(item)}
              onFruits={() => navigation.navigate('FruitList', { treeId: item.tree_id, treeName: item.name })}
            />
          )}
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

export default TreeManagementScreen;
