// screens/GuardianScreen.tsx
// Quản-lý guardian (khôi-phục xã-hội): thêm/bớt qua POST /guardians/add|remove,
// và LIỆT KÊ qua GET /guardians/{userDid} (`phoenixKeyApi.guardians.list`).
//
// ── Chú thích cũ ở đây đã CHẾT, đây là chỗ nó sai ──────────────────────────
// Bản trước ghi "Chưa có endpoint LIST guardian → giữ danh sách cục bộ
// (AsyncStorage)". Cửa LIST đã có và đã được khai trong `phoenixKey-api.ts`, chỉ
// là không nơi nào gọi. Hệ quả của việc tin chú thích đó: danh sách trên màn là
// danh sách của MÁY NÀY, không phải của DANH TÍNH — cài lại app thì nó rỗng, đổi
// máy thì nó rỗng, và rỗng trông y hệt "tôi chưa ghi danh ai".
//
// ── Bất biến của màn này: RỖNG và HỎNG là HAI màn khác nhau ────────────────
// `guardians.list` hỏng thì màn nói "chưa lấy được danh sách" kèm nút thử lại —
// KHÔNG hiện "bạn chưa có người bảo hộ nào". Gộp hai ca là dạng cái-vỏ-im-lặng
// đắt nhất ở đây: người đọc câu sai sẽ đi ghi danh LẠI một người đã có, và mỗi
// lần ghi danh là một lần ký bằng khoá phần cứng cộng một mốc `opSeq` bị tiêu.
//
// ── Tên hiển thị vẫn nằm ở máy, và đó KHÔNG phải nợ kỹ thuật ───────────────
// Máy chủ chỉ trả `guardianDid · status · createdAt` — không có chỗ nào cho tên.
// Nên tên do người dùng đặt vẫn ở `AsyncStorage`, và nó là thứ PHỤ: danh sách
// thật lấy từ máy chủ, tên chỉ được DÁN vào theo `did`. Không có tên thì hiện mã
// định danh rút gọn, không bịa ra một cái tên nào.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { addGuardian, removeGuardian } from '../services/guardianService';
import { phoenixKeyApi, PhoenixKeyApiError } from '../services/phoenixKey-api';
import { currentUserDid } from '../sdk/phoenixKey';
import { PHOENIX_DID_RE } from '../services/phoenixDid';
import { showError, showInfo, showSuccess, showWarning } from '../utils/alert';
import { describeGuardianSafety } from '../features/identity/guardianSafety';
import { t } from '../i18n';
import { tk } from '../i18n/keys';

const PRIMARY = '#4A55C7';
/**
 * Khuôn DID lấy từ `services/phoenixDid.ts` — MỘT nguồn. Chỗ này từng chép tay
 * `/^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$/`, đúng khuôn mà tệp kia đã gỡ và dặn không
 * ghim lại ở đâu nữa: bộ sinh sắp cho ra chữ số `0,1,8,9` ở đoạn giữa, và ngày đó
 * `[a-z2-7]` từ chối một DID hoàn toàn hợp lệ. Ở màn này hậu quả là không thêm được người
 * giám hộ, với một câu đổ lỗi cho người dùng gõ sai.
 */
const DID_RE = PHOENIX_DID_RE;
const LOCAL_NAMES_KEY = 'phoenixkey_guardians_local';

/** Một dòng trên màn: `did` + `createdAt` từ máy chủ, `name` từ máy (có thể thiếu). */
interface GuardianRow { did: string; name: string | null; createdAt: string | null }

/**
 * Ba trạng thái của danh sách, KHÔNG gộp.
 *
 * `loading` tách khỏi `failed` vì lần mở màn đầu tiên chưa biết gì cả; `failed` tách
 * khỏi `loaded` + mảng rỗng vì đó là hai câu trả lời khác nhau cho người dùng.
 */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; rows: GuardianRow[] }
  | { kind: 'failed'; needSignIn: boolean };

/** Mã định danh rút gọn — dùng khi máy này không có tên cho người đó. */
const shortDid = (did: string): string =>
  did.length > 24 ? `${did.slice(0, 18)}…${did.slice(-6)}` : did;

const fmtDate = (v: string | null): string => {
  if (!v) return '';
  const n = Date.parse(v);
  return Number.isNaN(n) ? '' : new Date(n).toLocaleDateString('vi-VN');
};

/**
 * Tối thiểu người bảo hộ mà anchor on-chain đòi (PhoenixKey chốt 2026-09-17:
 * `UpdateGuardians` chỉ chạy khi tập còn lại ≥ 2). Gỡ xuống dưới ngưỡng này thì
 * giao dịch chết ở validator — cổng dưới đây chặn TRƯỚC, ngay tại app.
 */
const MIN_GUARDIANS = 2;

/**
 * Cổng gỡ một người bảo hộ.
 *
 * `count == null` là "chưa tải xong / tải hỏng", KHÔNG phải "0 người" — đọc nhầm
 * thành 0 (kiểu `?? []` rồi lấy `.length`) sẽ khoá nút của người đang có đủ 5
 * người bảo hộ khỏi chính dữ liệu của họ. Đây là cổng chặn thao tác người dùng
 * ⟹ hỏng (chưa biết) thì FAIL-OPEN — không khoá.
 */
export function canRemoveGuardian(count: number | null | undefined): boolean {
  if (count == null) return true;
  return count > MIN_GUARDIANS;
}

const readLocalNames = async (): Promise<Record<string, string>> => {
  const raw = await AsyncStorage.getItem(LOCAL_NAMES_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  // Khuôn CŨ là một MẢNG `{did, name}`. Đọc được cả hai để tên người dùng đã đặt
  // không biến mất ở lần cập nhật này.
  if (Array.isArray(parsed)) {
    const out: Record<string, string> = {};
    for (const g of parsed) if (g?.did && g?.name) out[String(g.did)] = String(g.name);
    return out;
  }
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
};

const GuardianScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [gDid, setGDid] = useState('');
  const [gName, setGName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const did = await currentUserDid();
      // Máy chủ chặn tra DID khác (`GuardianController` so với DID trong phiên),
      // nên không có DID trên máy thì cửa này KHÔNG gọi được — nói thẳng, đừng
      // gọi rồi hiện một con 401 thô.
      if (!did) { setState({ kind: 'failed', needSignIn: true }); return; }

      const res = await phoenixKeyApi.guardians.list(did);
      // Hình dạng lạ thì NÉM, không `?? []`: một phản hồi thiếu trường `guardians`
      // là máy chủ đổi hợp đồng, và "0 người bảo hộ" là câu trả lời sai cho nó.
      if (!Array.isArray(res?.guardians)) {
        throw new Error('Máy chủ trả về danh sách người bảo hộ không đúng khuôn.');
      }

      let names: Record<string, string> = {};
      try { names = await readLocalNames(); } catch { names = {}; }

      setState({
        kind: 'loaded',
        rows: res.guardians.map(g => ({
          did: g.guardianDid,
          name: names[g.guardianDid] ?? null,
          createdAt: g.createdAt ?? null,
        })),
      });
    } catch (e) {
      const needSignIn = e instanceof PhoenixKeyApiError && (e.httpStatus === 401 || e.httpStatus === 403);
      setState({ kind: 'failed', needSignIn });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Ghi TÊN (chỉ tên) xuống máy. Danh sách thật vẫn là của máy chủ. */
  const saveName = async (did: string, name: string) => {
    try {
      const names = await readLocalNames();
      names[did] = name;
      await AsyncStorage.setItem(LOCAL_NAMES_KEY, JSON.stringify(names));
    } catch { /* tên hiển thị mất thì vẫn còn mã định danh — không chặn luồng */ }
  };

  const rows = state.kind === 'loaded' ? state.rows : [];
  /**
   * Số người bảo hộ HIỆN TẠI, dùng riêng cho `canRemoveGuardian` — TÁCH khỏi
   * `rows.length` vì dòng trên đã ép `rows` về mảng rỗng ở cả hai trạng thái
   * `loading`/`failed`, nên `rows.length === 0` không phân biệt được "rỗng thật"
   * với "chưa biết". Cổng gỡ cần phân biệt được hai ca đó.
   */
  const guardianCount: number | null = state.kind === 'loaded' ? state.rows.length : null;
  const removable = canRemoveGuardian(guardianCount);

  const onAdd = async () => {
    const did = gDid.trim();
    const name = gName.trim();
    if (!DID_RE.test(did)) { showInfo('Mã định danh chưa đúng', 'Nhập mã định danh của người giám hộ.'); return; }
    if (!name) { showInfo('Thiếu tên', 'Nhập tên hiển thị cho guardian.'); return; }
    if (rows.some((g) => g.did === did)) { showSuccess('Đã có', 'Guardian này đã trong danh sách.'); return; }
    setBusy(true);
    try {
      await addGuardian(did);
      await saveName(did, name);
      setGDid(''); setGName('');
      // Tải LẠI từ máy chủ thay vì tự thêm một dòng vào mảng địa phương: máy chủ
      // là nơi giữ danh sách, và đây cũng là phép kiểm rằng lượt ghi đã vào thật.
      await load();
    } catch (e) {
      showError('Thêm thất bại', e instanceof Error ? e.message : 'Thử lại.');
    } finally { setBusy(false); }
  };

  const onRemove = (g: GuardianRow) => {
    const ten = g.name ?? shortDid(g.did);
    showWarning('Bớt guardian', `Gỡ ${ten} khỏi danh sách khôi phục?`, {
        confirmText: 'Gỡ',
        cancelText: 'Huỷ',
        onConfirm: async () => {
          try {
            await removeGuardian(g.did);
            await load();
          } catch (e) {
            showError(t('Gỡ thất bại'), e instanceof Error ? e.message : t('Thử lại.'));
          }
        },
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Người bảo hộ (Guardian)</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.lead}>
          Ghi danh người bạn tin tưởng bằng mã định danh của họ. Đường dùng người bảo hộ để khôi phục chưa chạy tới cuối — cụm 24 từ vẫn là bản dự phòng duy nhất.
        </Text>

        {/* ── Danh sách: ba trạng thái, ba khối khác nhau ───────────────── */}
        {state.kind === 'loading' && (
          <View style={styles.stateBox} testID="guardian-loading">
            <ActivityIndicator size="small" color={PRIMARY} />
            <Text style={styles.stateText}>{tk('identity.guardian.loading')}</Text>
          </View>
        )}

        {state.kind === 'failed' && (
          <View style={[styles.stateBox, styles.stateBoxFail]} testID="guardian-load-fail">
            <Icon name="alert-circle-outline" size={20} color="#C0533A" />
            <Text style={styles.stateTitleFail}>{tk('identity.guardian.loadFailTitle')}</Text>
            <Text style={styles.stateText}>
              {state.needSignIn
                ? tk('identity.guardian.needSignIn')
                : tk('identity.guardian.loadFailBody')}
            </Text>
            {!state.needSignIn && (
              <TouchableOpacity
                testID="guardian-retry"
                accessibilityRole="button"
                onPress={load}
                style={styles.retryBtn}
              >
                <Text style={styles.retryText}>{tk('identity.guardian.retry')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/*
          ── MỨC AN TOÀN ─────────────────────────────────────────────────────────
          Chỉ hiện ở trạng thái `loaded`, KHÔNG hiện lúc đang tải hay lúc hỏng. Lý do
          là bất biến của màn này: danh sách hỏng thì số người bảo hộ CHƯA BIẾT, mà
          một khung "chưa ai khôi phục hộ bạn được" vẽ trên một con số chưa biết là
          đúng dạng cái-vỏ-im-lặng — người đọc sẽ đi ghi danh lại một người đã có.
        */}
        {state.kind === 'loaded' && (() => {
          const safety = describeGuardianSafety(rows.length);
          const urgent = safety.level !== 'spread';
          return (
            <View
              testID="guardian-safety"
              style={[styles.safetyBox, urgent ? styles.safetyUrgent : styles.safetyCalm]}
            >
              <Text style={styles.safetyHeadline}>{t(safety.headline)}</Text>
              <Text style={styles.safetyBody}>{t(safety.body)}</Text>
              {/*
                Dòng "app chưa đo được" in ở MỌI mức, kể cả mức cao nhất — mức cao
                nhất mới là mức cần nó nhất, vì đó là lúc con số dễ bị đọc thành
                một lời bảo đảm.
              */}
              <Text style={styles.safetyUnmeasured} testID="guardian-safety-unmeasured">
                {t(safety.unmeasured)}
              </Text>
            </View>
          );
        })()}

        {state.kind === 'loaded' && rows.length === 0 && (
          <View style={styles.stateBox} testID="guardian-empty">
            <Icon name="account-off-outline" size={20} color={COLORS.textMuted} />
            <Text style={styles.stateText}>{tk('identity.guardian.empty')}</Text>
          </View>
        )}

        {state.kind === 'loaded' && rows.length > 0 && (
          <>
            <Text style={styles.countText}>{tk('identity.guardian.count', { n: rows.length })}</Text>
            <View style={styles.card} testID="guardian-list">
              {rows.map((g, i) => (
                <View key={g.did} style={[styles.gRow, i > 0 && styles.gRowBorder]}>
                  <View style={styles.avatar}><Icon name="account-outline" size={18} color={PRIMARY} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gName}>{g.name ?? shortDid(g.did)}</Text>
                    <Text style={styles.gDid} numberOfLines={1}>{g.did}</Text>
                    {!!fmtDate(g.createdAt) && (
                      <Text style={styles.gDid}>Ghi danh: {fmtDate(g.createdAt)}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    testID={`guardian-remove-${g.did}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !removable }}
                    onPress={() => onRemove(g)}
                    disabled={!removable}
                    hitSlop={8}
                  >
                    <Icon
                      name="close-circle-outline"
                      size={20}
                      color={removable ? '#C0533A' : COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
            {/*
              Cổng là thuộc tính của CẢ TẬP, không của riêng một dòng — mọi nút gỡ
              cùng khoá hay cùng mở một lúc, nên câu giải thích đứng NGOÀI vòng
              lặp, một lần. `guardianCount != null` chặn ca fail-open: chưa biết số
              thì không khoá (xem `canRemoveGuardian`), nên cũng không có gì để
              giải thích ở đây.
            */}
            {!removable && guardianCount != null && (
              <Text style={styles.removeLockedNote} testID="guardian-remove-locked-note">
                {tk('identity.guardian.removeLocked')}
              </Text>
            )}
          </>
        )}

        {/* Thêm */}
        <Text style={styles.section}>Thêm guardian</Text>
        <TextInput
          style={styles.input} placeholder="Mã định danh người giám hộ (did:phoenix:…)"
          placeholderTextColor={COLORS.textMuted} value={gDid} onChangeText={setGDid}
          autoCapitalize="none" autoCorrect={false}
        />
        <TextInput
          style={[styles.input, { marginTop: 10 }]} placeholder="Tên hiển thị (vd: Anh Tuấn)"
          placeholderTextColor={COLORS.textMuted} value={gName} onChangeText={setGName}
        />
        <TouchableOpacity style={styles.addBtn} onPress={onAdd} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color="#fff" />
            : <><Icon name="account-plus-outline" size={16} color="#fff" /><Text style={styles.addText}>Thêm guardian</Text></>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  // Khung mức an toàn. Mức chưa đủ người thì viền cảnh báo; mức cao nhất thì viền
  // TRUNG TÍNH, cố ý KHÔNG dùng màu xanh "xong việc" — app chưa đo được điều đó.
  safetyBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  safetyUrgent: { borderColor: COLORS.warning, backgroundColor: 'rgba(224,154,58,0.08)' },
  safetyCalm: { borderColor: COLORS.border, backgroundColor: COLORS.card },
  safetyHeadline: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  safetyBody: { fontSize: 12, lineHeight: 18, marginTop: 4, color: COLORS.text },
  safetyUnmeasured: { fontSize: 12, lineHeight: 18, marginTop: 8, color: COLORS.textMuted },
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: PRIMARY, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  lead: { fontSize: 13, color: COLORS.textSub, lineHeight: 19, marginBottom: 18 },

  stateBox: {
    backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, marginBottom: 20, alignItems: 'center', gap: 8,
  },
  stateBoxFail: { borderColor: '#C0533A' },
  stateTitleFail: { fontSize: 13, fontWeight: '800', color: '#C0533A', textAlign: 'center' },
  stateText: { fontSize: 12, color: COLORS.textSub, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    marginTop: 4, paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1, borderColor: PRIMARY,
  },
  retryText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  countText: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },

  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 },
  removeLockedNote: {
    fontSize: 12, color: COLORS.textMuted, lineHeight: 18,
    marginTop: -12, marginBottom: 20,
  },
  gRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  gRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(74,85,199,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  gName: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  gDid: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  section: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 14, paddingVertical: 14, borderRadius: 12, backgroundColor: PRIMARY,
  },
  addText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

export default GuardianScreen;
