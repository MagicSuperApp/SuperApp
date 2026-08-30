// modules/chat/features/chat/components/MemberPicker.tsx
//
// Ô tìm người, dùng chung cho "tạo cuộc trò chuyện" và "mời thêm người".
// Nguồn: GET /users/search?q= (`services/proofchat-api.ts` → `users.search`).
//
// MỘT ĐIỀU KHÔNG ĐƯỢC LÀM Ở ĐÂY: nuốt lỗi tra cứu thành danh sách rỗng. Đường
// `/users/search` phía máy chủ có lúc chưa mở; nuốt lỗi thì người dùng đọc thành
// "không có ai tên này" rồi gõ lại mãi. Lỗi tra cứu và không-có-kết-quả là hai
// câu khác nhau, phải hiện khác nhau.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../../../../../shared/theme';
import { CHAT_THEME } from '../../../theme/colors';
import { RADIUS, SPACE, STROKE } from '../../../theme/fluent';
import Avatar from './Avatar';
import { users, type RemoteUser } from '../../../../../services/proofchat-api';

const displayNameOf = (u: RemoteUser): string =>
  u.displayName?.trim() || u.username?.trim() || u.userDid;

interface Props {
  /** Không hiện lại những người này (đã ở trong phòng, hoặc chính mình). */
  excludeIds?: string[];
  /** Người đã chọn — hiện dấu tích. Bỏ trống nếu chọn xong là xong. */
  selectedIds?: string[];
  onPick: (user: RemoteUser) => void;
}

const MemberPicker: React.FC<Props> = ({ excludeIds = [], selectedIds = [], onPick }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RemoteUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }
    let alive = true;
    setSearching(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const r = await users.search(q);
        if (alive) setResults(r);
      } catch (e) {
        if (!alive) return;
        setResults([]);
        const status = (e as { httpStatus?: number } | null)?.httpStatus;
        setError(
          status === 404
            ? 'Máy chủ chưa mở phần tìm người. Chưa tra được — không phải là không có ai.'
            : 'Chưa tra cứu được lúc này. Thử lại sau.',
        );
      } finally {
        if (alive) setSearching(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const visible = results.filter((u) => !excludeIds.includes(u.userDid));

  return (
    <View>
      <View style={styles.searchBox}>
        <Icon name="magnify" size={18} color={NEUTRAL.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Tên hoặc mã người dùng"
          placeholderTextColor={NEUTRAL.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={CHAT_THEME.primary} />}
        {!searching && query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Icon name="close-circle" size={16} color={NEUTRAL.textMuted} />
          </Pressable>
        )}
      </View>

      {!!error && (
        <View style={styles.notice}>
          <Icon name="alert-circle-outline" size={14} color={NEUTRAL.warning} />
          <Text style={styles.noticeText}>{error}</Text>
        </View>
      )}

      {!error && query.trim().length >= 2 && !searching && visible.length === 0 && (
        <Text style={styles.hint}>Không tìm thấy ai khớp với “{query.trim()}”.</Text>
      )}

      {query.trim().length < 2 && !error && (
        <Text style={styles.hint}>Gõ ít nhất 2 ký tự để tìm.</Text>
      )}

      {visible.map((u) => {
        const picked = selectedIds.includes(u.userDid);
        return (
          <Pressable
            key={u.userDid}
            onPress={() => onPick(u)}
            style={({ pressed }) => [
              styles.row,
              picked && styles.rowPicked,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <Avatar name={displayNameOf(u)} uri={u.avatar ?? undefined} size={36} />
            <View style={styles.rowText}>
              <Text style={styles.name} numberOfLines={1}>
                {displayNameOf(u)}
              </Text>
              {!!u.username && u.username !== displayNameOf(u) && (
                <Text style={styles.sub} numberOfLines={1}>
                  {u.username}
                </Text>
              )}
            </View>
            <Icon
              name={picked ? 'check-circle' : 'plus-circle-outline'}
              size={20}
              color={picked ? CHAT_THEME.primary : NEUTRAL.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    height: 46,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: STROKE.outer,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: NEUTRAL.text, padding: 0 },
  hint: {
    fontSize: 12.5,
    color: NEUTRAL.textMuted,
    paddingVertical: SPACE.md,
    textAlign: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: SPACE.sm,
    padding: SPACE.sm + 2,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(NEUTRAL.warning, 0.10),
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17, color: NEUTRAL.textSub },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.sm + 2,
    paddingHorizontal: SPACE.xs,
    borderRadius: RADIUS.sm,
  },
  rowPicked: { backgroundColor: withAlpha(CHAT_THEME.primary, 0.08) },
  rowText: { flex: 1, gap: 1 },
  name: { fontSize: 14, fontWeight: '600', color: NEUTRAL.text },
  sub: { fontSize: 11.5, color: NEUTRAL.textMuted },
});

export { displayNameOf };
export default MemberPicker;
