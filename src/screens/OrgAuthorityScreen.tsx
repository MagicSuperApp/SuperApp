/**
 * OrgAuthorityScreen — OrgDID m-of-n: TẠO founding, NÂNG QUYỀN, và KÝ DUYỆT (được mời).
 *
 * ⚠️ m-of-n = nhiều người ký trên MÁY RIÊNG. Luồng:
 *   1) Initiator (tab "Tạo m/n"/"Nâng quyền"): nhập tên/ngưỡng + DID đồng-sáng-lập →
 *      "Tạo challenge & ký của tôi" → khoá challenge + ký phần mình → CHIA SẺ challenge.
 *   2) Mỗi đồng-sáng-lập mở app, tab "Ký duyệt", DÁN challenge → ký → gửi lại {mã định danh, chữ ký}.
 *   3) Initiator DÁN đủ chữ ký của mọi người → "Hoàn tất".
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView,
  TextInput, Alert, Clipboard,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS } from '../constants';
import taad from '../sdk/taadEnclave';
import { currentUserDid } from '../sdk/phoenixKey';
import {
  buildFoundingChallenge, buildUpgradeChallenge, signSharedOrgChallenge,
  foundOrg, upgradeAuthority, type FounderSig,
} from '../services/orgMintService';

const PRIMARY = '#5B3FA8';
type Mode = 'founding' | 'upgrade' | 'cosign';

const OrgAuthorityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialMode: Mode = route.params?.mode ?? 'founding';
  const paramOrgDid: string = route.params?.orgDid ?? '';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [selfDid, setSelfDid] = useState('');

  // Initiator (founding/upgrade)
  const [name, setName] = useState('');
  const [regNo, setRegNo] = useState('');
  const [orgDid, setOrgDid] = useState(paramOrgDid);
  const [threshold, setThreshold] = useState('2');
  const [memberDids, setMemberDids] = useState<string[]>(['']); // đồng-sáng-lập/thành-viên mới (KHÔNG gồm mình)
  const [locked, setLocked] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [nonce, setNonce] = useState('');
  const [sigs, setSigs] = useState<Record<string, string>>({}); // did → signature (gồm cả mình)
  const [busy, setBusy] = useState(false);

  // Co-sign
  const [pasted, setPasted] = useState('');
  const [cosign, setCosign] = useState<FounderSig | null>(null);

  useEffect(() => { currentUserDid().then(d => setSelfDid(d ?? '')); }, []);

  const allDids = mode === 'upgrade'
    ? [selfDid, ...memberDids.map(d => d.trim()).filter(Boolean)]   // self = current owner
    : [selfDid, ...memberDids.map(d => d.trim()).filter(Boolean)];  // founding: self là 1 founder
  const uniqueDids = Array.from(new Set(allDids.filter(Boolean)));
  const th = parseInt(threshold, 10) || 0;
  const allSigned = uniqueDids.length > 0 && uniqueDids.every(d => sigs[d]);

  const copy = (s: string, what: string) => { Clipboard.setString(s); Alert.alert('Đã sao chép', what); };

  // Initiator: dựng challenge + ký phần mình → khoá.
  const handlePrepare = useCallback(async () => {
    if (!selfDid) { Alert.alert('Thiếu danh tính', 'Máy này chưa có danh tính.'); return; }
    const members = memberDids.map(d => d.trim()).filter(Boolean);
    if (mode === 'founding' && !name.trim()) { Alert.alert('Thiếu tên', 'Nhập tên tổ chức.'); return; }
    if (mode === 'upgrade' && !orgDid.trim()) { Alert.alert('Thiếu mã định danh tổ chức', 'Nhập OrgDID cần nâng quyền.'); return; }
    if (members.length < 1) { Alert.alert('Thiếu thành viên', 'Cần ≥ 1 đồng-sáng-lập/thành-viên khác.'); return; }
    const total = mode === 'upgrade' ? 1 + members.length : 1 + members.length;
    if (th < 2 || th > total) { Alert.alert('Ngưỡng không hợp lệ', `Ngưỡng phải từ 2 đến ${total}.`); return; }

    setBusy(true);
    try {
      const n = await taad.generateSalt();
      const ch = mode === 'founding'
        ? buildFoundingChallenge({ name, founderDids: [selfDid, ...members], threshold: th, nonce: n })
        : buildUpgradeChallenge({ orgDid: orgDid.trim(), newMemberDids: members, newThreshold: th, nonce: n });
      // Ký phần MÌNH.
      const mine = await signSharedOrgChallenge(ch);
      setNonce(n); setChallenge(ch); setLocked(true);
      setSigs({ [mine.ownerDid]: mine.ownerSignature });
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message ?? 'Không tạo được challenge.');
    } finally { setBusy(false); }
  }, [selfDid, memberDids, mode, name, orgDid, th]);

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    try {
      if (mode === 'founding') {
        const founders: FounderSig[] = uniqueDids.map(d => ({ ownerDid: d, ownerSignature: sigs[d] }));
        const { orgDid: newOrg } = await foundOrg({
          name, registrationNumber: regNo, threshold: th, founders, nonce,
        });
        Alert.alert('Đã tạo tổ chức m/n', `OrgDID: ${newOrg}`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } else {
        const members = memberDids.map(d => d.trim()).filter(Boolean);
        const newMembers: FounderSig[] = members.map(d => ({ ownerDid: d, ownerSignature: sigs[d] }));
        const { threshold: newTh } = await upgradeAuthority({
          orgDid: orgDid.trim(),
          currentOwner: { ownerDid: selfDid, ownerSignature: sigs[selfDid] },
          newMembers, newThreshold: th, nonce,
        });
        Alert.alert('Đã nâng quyền', `Ngưỡng mới: ${newTh ?? th}`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
      }
    } catch (e: any) {
      Alert.alert('Thất bại', e?.message ?? 'Kiểm tra chữ ký các thành viên rồi thử lại.');
    } finally { setBusy(false); }
  }, [mode, uniqueDids, sigs, name, regNo, th, nonce, memberDids, orgDid, selfDid, navigation]);

  const handleCosign = useCallback(async () => {
    const ch = pasted.trim();
    if (!ch.startsWith('PHOENIXKEY_ORG_')) { Alert.alert('Sai challenge', 'Chuỗi phải bắt đầu PHOENIXKEY_ORG_…'); return; }
    setBusy(true);
    try {
      setCosign(await signSharedOrgChallenge(ch));
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message ?? 'Không ký được.');
    } finally { setBusy(false); }
  }, [pasted]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const Tab = ({ m, label }: { m: Mode; label: string }) => (
    <TouchableOpacity
      style={[styles.tab, mode === m && styles.tabOn]}
      onPress={() => setMode(m)}
    >
      <Text style={[styles.tabText, mode === m && styles.tabTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  const setMember = (i: number, v: string) => setMemberDids(prev => prev.map((d, k) => k === i ? v : d));
  const addMember = () => setMemberDids(prev => [...prev, '']);
  const removeMember = (i: number) => setMemberDids(prev => prev.filter((_, k) => k !== i));

  const isInitiator = mode === 'founding' || mode === 'upgrade';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tổ chức đồng-sở-hữu</Text>
      </View>

      <View style={styles.tabs}>
        <Tab m="founding" label="Tạo m/n" />
        <Tab m="upgrade" label="Nâng quyền" />
        <Tab m="cosign" label="Ký duyệt" />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {mode === 'cosign' ? (
          <>
            <Text style={styles.note}>Bạn được mời đồng-sáng-lập/nâng-quyền. Dán chuỗi challenge người khởi tạo chia sẻ, ký, rồi gửi lại {'{mã định danh, chữ ký}'}.</Text>
            <TextInput
              style={styles.textarea}
              placeholder="PHOENIXKEY_ORG_FOUNDING:… hoặc PHOENIXKEY_ORG_UPGRADE:…"
              placeholderTextColor={COLORS.textMuted}
              value={pasted} onChangeText={setPasted} multiline autoCapitalize="none"
            />
            <TouchableOpacity style={styles.btn} onPress={handleCosign} disabled={busy}>
              <Text style={styles.btnText}>Ký duyệt bằng khoá của tôi</Text>
            </TouchableOpacity>
            {cosign && (
              <View style={styles.card}>
                <Text style={styles.label}>Mã định danh của bạn</Text>
                <Text style={styles.mono} numberOfLines={1}>{cosign.ownerDid}</Text>
                <Text style={[styles.label, { marginTop: 8 }]}>Chữ ký (gửi lại người khởi tạo)</Text>
                <Text style={styles.mono} numberOfLines={3}>{cosign.ownerSignature}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={() => copy(`${cosign.ownerDid}\n${cosign.ownerSignature}`, 'Mã định danh + chữ ký')}>
                  <Icon name="content-copy" size={14} color={PRIMARY} />
                  <Text style={styles.copyText}>Sao chép Mã định danh + chữ ký</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <>
            {mode === 'founding' ? (
              <>
                <Text style={styles.label}>Tên tổ chức *</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} editable={!locked} placeholder="Vd: HTX Mai Vàng" placeholderTextColor={COLORS.textMuted} />
                <Text style={[styles.label, { marginTop: 10 }]}>Mã số ĐKKD (tuỳ chọn)</Text>
                <TextInput style={styles.input} value={regNo} onChangeText={setRegNo} editable={!locked} placeholder="MST…" placeholderTextColor={COLORS.textMuted} />
              </>
            ) : (
              <>
                <Text style={styles.label}>OrgDID cần nâng quyền *</Text>
                <TextInput style={styles.input} value={orgDid} onChangeText={setOrgDid} editable={!locked && !paramOrgDid} autoCapitalize="none" placeholder="did:phoenix:…" placeholderTextColor={COLORS.textMuted} />
              </>
            )}

            <Text style={[styles.label, { marginTop: 10 }]}>Ngưỡng m (số chữ ký tối thiểu, ≥ 2)</Text>
            <TextInput style={styles.input} value={threshold} onChangeText={t => setThreshold(t.replace(/[^0-9]/g, ''))} editable={!locked} keyboardType="number-pad" />

            <Text style={[styles.label, { marginTop: 12 }]}>Mã định danh của tôi ({mode === 'upgrade' ? 'chủ hiện tại' : 'người sáng lập #1'})</Text>
            <Text style={styles.mono} numberOfLines={1}>{selfDid || '(chưa có)'}</Text>

            <Text style={[styles.label, { marginTop: 12 }]}>{mode === 'upgrade' ? 'Thành viên MỚI' : 'Đồng-sáng-lập khác'} (mã định danh)</Text>
            {memberDids.map((d, i) => (
              <View key={i} style={styles.memberRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]} value={d} onChangeText={v => setMember(i, v)}
                  editable={!locked} autoCapitalize="none" placeholder="did:phoenix:…" placeholderTextColor={COLORS.textMuted}
                />
                {!locked && memberDids.length > 1 && (
                  <TouchableOpacity onPress={() => removeMember(i)} hitSlop={8}><Icon name="close-circle" size={22} color={COLORS.textMuted} /></TouchableOpacity>
                )}
              </View>
            ))}
            {!locked && (
              <TouchableOpacity style={styles.addRow} onPress={addMember}>
                <Icon name="plus" size={16} color={PRIMARY} /><Text style={styles.addText}>Thêm thành viên</Text>
              </TouchableOpacity>
            )}

            {!locked ? (
              <TouchableOpacity style={[styles.btn, { marginTop: 16 }]} onPress={handlePrepare} disabled={busy}>
                <Text style={styles.btnText}>Tạo challenge & ký của tôi</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.label}>Chuỗi challenge — chia sẻ cho MỌI thành viên để họ ký</Text>
                  <Text style={styles.mono} numberOfLines={4}>{challenge}</Text>
                  <TouchableOpacity style={styles.copyBtn} onPress={() => copy(challenge, 'Challenge')}>
                    <Icon name="content-copy" size={14} color={PRIMARY} /><Text style={styles.copyText}>Sao chép challenge</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { marginTop: 14 }]}>Thu chữ ký ({uniqueDids.filter(d => sigs[d]).length}/{uniqueDids.length})</Text>
                {uniqueDids.map(d => (
                  <View key={d} style={styles.sigRow}>
                    <Icon name={sigs[d] ? 'check-circle' : 'circle-outline'} size={18} color={sigs[d] ? COLORS.success : COLORS.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mono} numberOfLines={1}>{d === selfDid ? `${d}  (tôi)` : d}</Text>
                      {d !== selfDid && (
                        <TextInput
                          style={[styles.input, { marginTop: 4 }]}
                          value={sigs[d] ?? ''} onChangeText={v => setSigs(p => ({ ...p, [d]: v.trim() }))}
                          autoCapitalize="none" placeholder="Dán chữ ký của thành viên này" placeholderTextColor={COLORS.textMuted}
                        />
                      )}
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.btn, { marginTop: 16 }, (!allSigned || busy) && styles.btnOff]}
                  onPress={handleSubmit} disabled={!allSigned || busy}
                >
                  <Text style={styles.btnText}>{mode === 'founding' ? 'Tạo tổ chức' : 'Nâng quyền'}</Text>
                </TouchableOpacity>
                <Text style={styles.note}>Đổi thành viên/ngưỡng/tên sẽ đổi challenge → phải ký lại. Nếu cần sửa, quay lại màn và làm mới.</Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: PRIMARY, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff' },
  tabs: { flexDirection: 'row', backgroundColor: PRIMARY, paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tabTextOn: { color: PRIMARY },
  body: { padding: 16, gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: COLORS.textSub, marginBottom: 4 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  textarea: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 13, color: COLORS.text, minHeight: 90, textAlignVertical: 'top' },
  mono: { fontSize: 12, color: COLORS.textSub, fontFamily: 'monospace' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addText: { color: PRIMARY, fontWeight: '700', fontSize: 13 },
  btn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnOff: { opacity: 0.45 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 14, marginTop: 12, gap: 4 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  copyText: { color: PRIMARY, fontWeight: '700', fontSize: 12 },
  sigRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  note: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 12, lineHeight: 16 },
});

export default OrgAuthorityScreen;
