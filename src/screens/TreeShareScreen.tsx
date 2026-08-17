// screens/TreeShareScreen.tsx
//
// CHIA SẺ dữ liệu riêng của một VƯỜN hoặc một CÂY cho người khác.
//
// Không có màn này, chủ vườn chỉ còn hai lựa chọn: mở công khai toàn bộ, hoặc
// không cho ai xem. Người mua, hợp tác xã và đoàn kiểm tra đều rơi vào khoảng
// giữa. Tầng dịch vụ + bài kiểm đã có ở `services/grantService.ts`; đây là màn
// còn thiếu.
//
// ── BA CHỖ DỄ LÀM SAI, ĐỌC TRƯỚC KHI SỬA ────────────────────────────────────
//
// 1. `grantee` KHÔNG phải tên người. Nó là `owner-ref` đục (`acct:<id>` hoặc
//    DID). Người dùng gõ TÊN, màn phải đổi tên → owner-ref qua `resolveAccount`
//    TRƯỚC. Gửi thẳng tên thì máy chủ VẪN TẠO grant (nó không kiểm người nhận có
//    thật) và grant đó không bao giờ khớp ai: chủ vườn tưởng đã chia sẻ, người
//    kia không thấy gì, không có lỗi nào nổi lên. Vì vậy nút Chia sẻ ở đây chỉ
//    sáng SAU khi tra được tên — không có đường tắt.
//
// 2. Máy chủ khớp tên TUYỆT ĐỐI, không tìm mờ, không liệt kê (cố ý, để cửa này
//    không thành đường quét danh bạ). Gõ sai một chữ cũng ra "không tìm thấy",
//    nên màn phải nói rõ *tên phải gõ đúng từng ký tự* chứ không để người dùng
//    tưởng người kia chưa có tài khoản.
//
// 3. `GET /api/grants` trả danh sách HAI CHIỀU trong một mảng phẳng. Tách bằng
//    `splitGrants` với owner-ref của chính mình. Không biết mình là ai thì
//    `splitGrants` dồn hết vào `unknown` — và màn phải nói "chưa tách được
//    chiều", KHÔNG được đoán. Đoán sai chiều là hiện "bạn đã chia sẻ cây này cho
//    3 người" trong khi thật ra ba người đó đã chia sẻ cây CỦA HỌ cho bạn.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StatusBar, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';

import { ORILIFE_BASE } from '../services/orilifeBase';
import { currentOwnerRef } from '../services/orilifeDidAuth';
import {
  listGrants, createGrant, revokeGrant, resolveAccount, splitGrants,
  isGrantLive, grantLabel,
  type Grant, type GrantScopeType, type AccountRef,
} from '../services/grantService';
import {
  NATURE, SURFACE, TONE, TYPE, SPACE, RADIUS, ELEVATION, ORGANIC_CARD, TOUCH_MIN,
} from '../modules/trace/theme/depth';

export const TREE_SHARE_ROUTE_NAME = 'TreeShare';

interface RouteParams {
  scopeType: GrantScopeType;
  scopeId: string;
  /** Tên vườn/cây để hiện cho người đọc. Vắng thì hiện mã. */
  scopeName?: string;
}

/** Trạng thái ô tra tên. `idle` = chưa tra lần nào, khác hẳn `not_found`. */
type LookupState =
  | { kind: 'idle' }
  | { kind: 'looking' }
  | { kind: 'found'; account: AccountRef }
  | { kind: 'not_found'; tried: string }
  | { kind: 'error'; detail: string };

const SCOPE_WORD: Record<GrantScopeType, string> = { farm: 'vườn', tree: 'cây' };

/** Ngày → chuỗi ngắn. Chuỗi không phân giải được thì trả nguyên văn, không bịa. */
function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const GrantRow: React.FC<{
  grant: Grant;
  /** Chỉ người ĐÃ CẤP mới thu hồi được — người nhận bấm sẽ ăn 404. */
  canRevoke: boolean;
  onRevoke: (g: Grant) => void;
  busy: boolean;
}> = ({ grant, canRevoke, onRevoke, busy }) => {
  const live = isGrantLive(grant);
  const who = grantLabel(canRevoke ? grant.grantee_label : grant.grantor_label);
  const whoRef = canRevoke ? grant.grantee : grant.grantor;

  return (
    <View style={styles.grantRow}>
      <View style={styles.grantMain}>
        {/* Tra không ra tên thì hiện MÃ ĐỤC, không hiện ô trống — ô trống trông
            y hệt một cái tên bị mất. */}
        <Text style={styles.grantWho} numberOfLines={1}>{who ?? whoRef}</Text>
        {!who && <Text style={styles.grantHint}>chưa tra được tên, đây là mã tài khoản</Text>}
        <Text style={styles.grantMeta}>
          {grantLabel(grant.scope_label) ?? `${SCOPE_WORD[grant.scope_type]} ${grant.scope_id}`}
          {'  ·  từ '}{shortDate(grant.created_at)}
          {grant.expires_at ? `  ·  hết hạn ${shortDate(grant.expires_at)}` : '  ·  không hết hạn'}
        </Text>
      </View>

      {/* BA trạng thái: còn hiệu lực / đã tắt / KHÔNG RÕ. Máy chủ không khai
          `live` thì không được vẽ một cái khoá đang mở. */}
      {live === true && (
        <View style={[styles.pill, styles.pillLive]}>
          <Text style={styles.pillTextLive}>còn hiệu lực</Text>
        </View>
      )}
      {live === false && (
        <View style={[styles.pill, styles.pillDead]}>
          <Text style={styles.pillTextDead}>đã tắt</Text>
        </View>
      )}
      {live === null && (
        <View style={[styles.pill, styles.pillUnknown]}>
          <Text style={styles.pillTextUnknown}>không rõ</Text>
        </View>
      )}

      {canRevoke && live !== false && (
        <TouchableOpacity
          onPress={() => onRevoke(grant)}
          disabled={busy}
          style={styles.revokeBtn}
          accessibilityLabel="Thu hồi chia sẻ"
        >
          <Icon name="link-variant-off" size={22} color={busy ? NATURE.barkSoft : TONE.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const TreeShareScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const route = useRoute();
  const { scopeType, scopeId, scopeName } = (route.params ?? {}) as RouteParams;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [me, setMe] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [lookup, setLookup] = useState<LookupState>({ kind: 'idle' });
  const [ttlDays, setTtlDays] = useState('');
  const [sharing, setSharing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const owner = await currentOwnerRef();
    setMe(owner);
    const r = await listGrants(ORILIFE_BASE);
    if (r.ok && r.data) setGrants(Array.isArray(r.data.grants) ? r.data.grants : []);
    else setLoadError(r.error?.detail ?? 'Không tải được danh sách chia sẻ');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Gõ lại tên thì kết quả tra cũ KHÔNG còn đúng — xoá ngay, đừng để nút Chia sẻ
  // sáng trong khi ô tên đã là người khác.
  const onChangeUsername = (v: string) => {
    setUsername(v);
    if (lookup.kind !== 'idle') setLookup({ kind: 'idle' });
  };

  const doLookup = async () => {
    const uname = username.trim();
    if (!uname) return;
    setLookup({ kind: 'looking' });
    const r = await resolveAccount(ORILIFE_BASE, uname);
    if (r.kind === 'found') setLookup({ kind: 'found', account: r.account });
    else if (r.kind === 'not_found') setLookup({ kind: 'not_found', tried: uname });
    else setLookup({ kind: 'error', detail: r.error.detail });
  };

  const doShare = async () => {
    if (lookup.kind !== 'found') return;
    const ttl = ttlDays.trim() ? Number(ttlDays.trim()) : null;
    if (ttlDays.trim() && (!Number.isFinite(ttl!) || ttl! < 1)) {
      Alert.alert('Số ngày không hợp lệ', 'Bỏ trống nếu muốn chia sẻ không hết hạn.');
      return;
    }
    setSharing(true);
    const r = await createGrant(ORILIFE_BASE, {
      grantee: lookup.account.owner,
      scopeType,
      scopeId,
      perms: ['read_private'],
      ttlDays: ttl,
    });
    setSharing(false);
    if (!r.ok) {
      Alert.alert('Chưa chia sẻ được', r.error?.detail ?? 'Máy chủ từ chối.');
      return;
    }
    setUsername('');
    setTtlDays('');
    setLookup({ kind: 'idle' });
    load();
  };

  const doRevoke = (g: Grant) => {
    Alert.alert(
      'Thu hồi chia sẻ?',
      `${grantLabel(g.grantee_label) ?? g.grantee} sẽ không xem được dữ liệu riêng của ${SCOPE_WORD[g.scope_type]} này nữa.`,
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Thu hồi',
          style: 'destructive',
          onPress: async () => {
            setBusyId(g.grant_id);
            const r = await revokeGrant(ORILIFE_BASE, g.grant_id);
            setBusyId(null);
            // 404 ở đây KHÔNG dịch thành "đã bị xoá rồi": máy chủ cố ý không phân
            // biệt "không có grant đó" với "grant đó không phải của bạn".
            if (!r.ok) Alert.alert('Chưa thu hồi được', r.error?.detail ?? 'Máy chủ từ chối.');
            load();
          },
        },
      ],
    );
  };

  const safeBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  // Chỉ hiện grant của ĐÚNG vườn/cây đang mở — màn này là màn của một thực thể.
  const mine = grants.filter((g) => g.scope_type === scopeType && g.scope_id === scopeId);
  const { given, received, unknown } = splitGrants(mine, me);

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
      <TouchableOpacity onPress={safeBack} style={styles.backBtn} accessibilityLabel="Quay lại">
        <Icon name="chevron-left" size={28} color={NATURE.bark} />
      </TouchableOpacity>
      <View style={styles.headerMid}>
        <Text style={styles.headerTitle} numberOfLines={1}>Chia sẻ dữ liệu riêng</Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          {SCOPE_WORD[scopeType] ?? 'phạm vi'} {scopeName || scopeId || '—'}
        </Text>
      </View>
      <View style={{ width: 28 }} />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" />
        {Header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TONE.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {Header}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + SPACE.section }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Cấp quyền mới ─────────────────────────────────────────────── */}
        <Text style={styles.section}>Cho thêm người xem</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Tên tài khoản người nhận</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={onChangeUsername}
              placeholder="gõ đúng tên tài khoản"
              placeholderTextColor={NATURE.barkSoft}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={doLookup}
            />
            <TouchableOpacity
              style={[styles.lookupBtn, !username.trim() && styles.btnOff]}
              onPress={doLookup}
              disabled={!username.trim() || lookup.kind === 'looking'}
            >
              {lookup.kind === 'looking'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Icon name="account-search-outline" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
          <Text style={styles.fieldNote}>
            Phải gõ đúng từng ký tự — máy chủ không tìm gần đúng, và cố ý không liệt kê người dùng.
          </Text>

          {lookup.kind === 'found' && (
            <View style={[styles.lookupBox, styles.lookupOk]}>
              <Icon name="account-check-outline" size={20} color={TONE.primary} />
              <Text style={styles.lookupText}>
                Tìm thấy <Text style={styles.bold}>{lookup.account.username}</Text>
              </Text>
            </View>
          )}
          {lookup.kind === 'not_found' && (
            <View style={[styles.lookupBox, styles.lookupWarn]}>
              <Icon name="account-question-outline" size={20} color={TONE.sun} />
              <Text style={styles.lookupText}>
                Không có tài khoản nào tên đúng “{lookup.tried}”. Kiểm tra lại chính tả trước khi
                kết luận người đó chưa có tài khoản.
              </Text>
            </View>
          )}
          {lookup.kind === 'error' && (
            <View style={[styles.lookupBox, styles.lookupErr]}>
              <Icon name="alert-circle-outline" size={20} color={TONE.danger} />
              <Text style={styles.lookupText}>{lookup.detail}</Text>
            </View>
          )}

          <Text style={[styles.fieldLabel, { marginTop: SPACE.lg }]}>Tự tắt sau bao nhiêu ngày</Text>
          <TextInput
            style={styles.input}
            value={ttlDays}
            onChangeText={setTtlDays}
            placeholder="bỏ trống = không hết hạn"
            placeholderTextColor={NATURE.barkSoft}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, (lookup.kind !== 'found' || sharing) && styles.btnOff]}
            onPress={doShare}
            disabled={lookup.kind !== 'found' || sharing}
          >
            {sharing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Icon name="account-plus-outline" size={19} color="#fff" />}
            <Text style={styles.primaryBtnText}>
              {lookup.kind === 'found' ? 'Cho người này xem' : 'Tra tên trước đã'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.fieldNote}>
            Người nhận chỉ XEM được dữ liệu riêng của {SCOPE_WORD[scopeType]} này. Họ không sửa
            được gì, và không xem được vườn hay cây khác.
          </Text>
        </View>

        {/* ── Danh sách ─────────────────────────────────────────────────── */}
        {loadError && (
          <View style={styles.errorBox}>
            <Icon name="alert-circle-outline" size={20} color={TONE.danger} />
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={load}><Text style={styles.retryText}>Thử lại</Text></TouchableOpacity>
          </View>
        )}

        {given.length > 0 && (
          <>
            <Text style={styles.section}>Đang cho xem ({given.length})</Text>
            <View style={styles.card}>
              {given.map((g) => (
                <GrantRow
                  key={g.grant_id}
                  grant={g}
                  canRevoke
                  onRevoke={doRevoke}
                  busy={busyId === g.grant_id}
                />
              ))}
            </View>
          </>
        )}

        {received.length > 0 && (
          <>
            <Text style={styles.section}>Người khác cho mình xem ({received.length})</Text>
            <View style={styles.card}>
              {received.map((g) => (
                <GrantRow key={g.grant_id} grant={g} canRevoke={false} onRevoke={doRevoke} busy={false} />
              ))}
            </View>
          </>
        )}

        {/* Không biết mình là ai ⟹ KHÔNG tách chiều. Nói thẳng thay vì đoán. */}
        {unknown.length > 0 && (
          <>
            <Text style={styles.section}>Chưa tách được chiều ({unknown.length})</Text>
            <View style={styles.noteBox}>
              <Icon name="information-outline" size={20} color={NATURE.barkSoft} />
              <Text style={styles.noteText}>
                {me
                  ? 'Những mục này không có mình ở cả hai đầu — có thể là chia sẻ giữa hai người khác.'
                  : 'Chưa biết mã tài khoản của chính mình nên không nói được mục nào là mình cấp, '
                    + 'mục nào là người ta cấp cho mình. Đăng nhập lại một lần là tách được.'}
              </Text>
            </View>
            <View style={styles.card}>
              {unknown.map((g) => (
                <GrantRow key={g.grant_id} grant={g} canRevoke={false} onRevoke={doRevoke} busy={false} />
              ))}
            </View>
          </>
        )}

        {!loadError && mine.length === 0 && (
          <View style={styles.emptyBox}>
            <Icon name="lock-outline" size={44} color={NATURE.barkSoft} />
            <Text style={styles.emptyTitle}>Chưa chia sẻ cho ai</Text>
            <Text style={styles.subtle}>
              Dữ liệu riêng của {SCOPE_WORD[scopeType]} này hiện chỉ mình xem được.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.md, paddingBottom: SPACE.md,
  },
  backBtn: { padding: SPACE.xs },
  headerMid: { flex: 1, alignItems: 'center' },
  headerTitle: { ...TYPE.cardTitle },
  headerSub: { ...TYPE.caption, fontSize: 12 },

  scroll: { paddingHorizontal: SPACE.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.section },
  subtle: { ...TYPE.body, textAlign: 'center' },

  section: { ...TYPE.section, marginTop: SPACE.section, marginBottom: SPACE.md },
  card: {
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD, ...ELEVATION.card,
    padding: SPACE.lg,
  },

  fieldLabel: { ...TYPE.caption, fontWeight: '700', color: NATURE.bark, marginBottom: SPACE.sm },
  fieldNote: { ...TYPE.caption, fontSize: 13, marginTop: SPACE.sm },
  inputRow: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: SURFACE.sunken, borderRadius: RADIUS.field,
    paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md,
    fontSize: 16, color: NATURE.bark, minHeight: TOUCH_MIN,
  },
  lookupBtn: {
    width: TOUCH_MIN, height: TOUCH_MIN, borderRadius: RADIUS.field,
    backgroundColor: TONE.primary, alignItems: 'center', justifyContent: 'center',
  },
  btnOff: { opacity: 0.45 },

  lookupBox: {
    flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start',
    borderRadius: RADIUS.field, padding: SPACE.md, marginTop: SPACE.md,
  },
  lookupOk: { backgroundColor: TONE.primarySoft },
  lookupWarn: { backgroundColor: TONE.sunSoft },
  lookupErr: { backgroundColor: SURFACE.sunken },
  lookupText: { ...TYPE.caption, flex: 1, color: NATURE.bark },
  bold: { fontWeight: '700' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    backgroundColor: TONE.primary, borderRadius: RADIUS.field,
    paddingVertical: SPACE.lg, minHeight: TOUCH_MIN, marginTop: SPACE.lg,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  grantRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: TONE.border,
  },
  grantMain: { flex: 1, gap: 2 },
  grantWho: { ...TYPE.cardTitle, fontSize: 16 },
  grantHint: { ...TYPE.caption, fontSize: 12, fontStyle: 'italic' },
  grantMeta: { ...TYPE.caption, fontSize: 13 },

  pill: { borderRadius: RADIUS.chip, paddingHorizontal: SPACE.md, paddingVertical: SPACE.xs },
  pillLive: { backgroundColor: TONE.primarySoft },
  pillDead: { backgroundColor: SURFACE.sunken },
  pillUnknown: { backgroundColor: TONE.sunSoft },
  pillTextLive: { fontSize: 12, fontWeight: '700', color: TONE.primaryDeep },
  pillTextDead: { fontSize: 12, fontWeight: '700', color: NATURE.barkSoft },
  pillTextUnknown: { fontSize: 12, fontWeight: '700', color: NATURE.bark },

  revokeBtn: { padding: SPACE.sm, minWidth: 40, alignItems: 'center' },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.sm,
    backgroundColor: SURFACE.sunken, borderRadius: RADIUS.field,
    padding: SPACE.lg, marginTop: SPACE.lg,
  },
  errorText: { ...TYPE.caption, flex: 1, color: NATURE.bark },
  retryText: { ...TYPE.caption, fontWeight: '700', color: TONE.primary },

  noteBox: {
    flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start',
    backgroundColor: SURFACE.sunken, borderRadius: RADIUS.field,
    padding: SPACE.md, marginBottom: SPACE.md,
  },
  noteText: { ...TYPE.caption, flex: 1 },

  emptyBox: { alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.section },
  emptyTitle: { ...TYPE.section, marginTop: SPACE.xs },
});

export default TreeShareScreen;
