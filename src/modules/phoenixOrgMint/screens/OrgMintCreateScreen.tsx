// modules/phoenixOrgMint/screens/OrgMintCreateScreen.tsx
//
// Tạo OrgDID mới qua cổng `GenesisChild` (chủ sở hữu ký, con KHÔNG ký genesis).
// KHÔNG có màn tham chiếu sẵn ở PhoenixKey-Core (đã kiểm tra — `enclave_bridge.dart`
// chưa bridge `buildCreateChildTaadUtxoTx`/`generateControllerKeypair`/`constructDid`
// tới Dart, chưa có UI nào gọi). Luồng dưới đây tự thiết kế bám ĐÚNG contract Rust
// (`taad_did.rs::build_create_child_taad_utxo_tx` doc-comment) + first-principles:
//
//   1. OrgDID có danh tính RIÊNG (Master_KEK/TAAD_Key/HW_Key CỦA NÓ, KHÔNG dùng
//      chung khoá owner) — owner chỉ ký GENESIS (chứng minh chủ ý tạo), owner UTxO
//      (anchor DID hiện sống) đưa vào làm reference input, KHÔNG bị tiêu.
//   2. Master_KEK của tổ chức mới PHẢI được sao lưu (24 từ) NGAY sau khi tạo —
//      mất cụm từ này = mất khả năng điều khiển tổ chức (giống hệt luồng
//      SeedExportScreen cho danh tính cá nhân, lặp lại tại đây cho tổ chức).
//   3. Gate sinh trắc TRƯỚC khi cho nhập 24 từ owner (tái dùng PhoenixKeyModule,
//      xem `services/phoenixOrgMintAuth.ts`).

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RootState } from '../../../store';
import { COLORS, ORGMINT_THEME } from '../../../theme';
import taadEnclave from '../../../sdk/taadEnclave';
import { generateKeypair } from '../../../services/phoenixKey-native';
import { PhoenixChainDataService } from '../../../services/phoenixChainData';
import { evaluateThenSubmit } from '../../../services/phoenixTxSubmit';
import {
  ensureBiometricGate,
  unlockMasterKekFromMnemonic,
  OrgMintBiometricUnavailableError,
} from '../../../services/phoenixOrgMintAuth';
import {
  getPhoenixOrgMintConfig,
  getMissingCreateOrgConfig,
  chainNetworkId,
  rustNetworkId,
} from '../../../config/phoenixOrgMint';

const GOLD = ORGMINT_THEME.primary;
const GOLD_DEEP = ORGMINT_THEME.primaryDeep;

const ENTITY_TYPES: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Tổ chức (Org)' },
  { value: 2, label: 'Thiết bị (Device)' },
  { value: 3, label: 'Máy (Machine)' },
  { value: 4, label: 'Tài sản (Asset)' },
  { value: 5, label: 'Bot' },
  { value: 6, label: 'AI' },
  { value: 7, label: 'Dịch vụ (Service)' },
  { value: 8, label: 'Bối cảnh (Context)' },
  { value: 9, label: 'Nhân vật (Character)' },
];

type Step = 'form' | 'building' | 'backup';

const OrgMintCreateScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const currentUser = useSelector((state: RootState) => state.user.currentUser);
  const ownerDid = currentUser?.did ?? '';

  const [entityType, setEntityType] = useState(1);
  const [mnemonic, setMnemonic] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Kết quả tạo — giữ tạm trong RAM để hiện bước sao lưu 24 từ TRƯỚC khi rời màn.
  const [pending, setPending] = useState<{
    childDid: string;
    txHash: string;
    network: 0 | 1 | 2;
    words: string[];
  } | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  const missing = useMemo(() => getMissingCreateOrgConfig(), []);

  const handleUnlockGate = async () => {
    setError('');
    try {
      await ensureBiometricGate('Xác thực để tạo tổ chức', 'Ký giao dịch tạo OrgDID');
      setUnlocked(true);
    } catch (e: any) {
      if (e instanceof OrgMintBiometricUnavailableError) {
        setError(e.message);
      } else {
        setError(e?.message ?? 'Xác thực sinh trắc thất bại hoặc bị huỷ.');
      }
    }
  };

  const handleCreate = async () => {
    if (!ownerDid) {
      setError('Chưa đăng nhập — cần danh tính chủ sở hữu để ký genesis.');
      return;
    }
    const words = mnemonic.trim().replace(/\s+/g, ' ');
    if (words.split(' ').length !== 24) {
      setError('Cụm từ khôi phục Master_KEK (chủ sở hữu) phải đủ 24 từ.');
      return;
    }
    if (missing.length > 0) {
      setError(`Chưa cấu hình (.env): ${missing.join(', ')}`);
      return;
    }

    setError('');
    setStep('building');
    try {
      const cfg = getPhoenixOrgMintConfig();
      const network = chainNetworkId();
      const networkId = rustNetworkId();
      const chain = new PhoenixChainDataService(network);

      setStatus('Đang mở Master_KEK chủ sở hữu...');
      const ownerMasterKekHex = await unlockMasterKekFromMnemonic(words);
      const walletSeedHex = await taadEnclave.deriveWalletSeed(ownerMasterKekHex);
      const fundingAddr = await taadEnclave.deriveCardanoAddress(walletSeedHex, networkId);

      setStatus('Đang lấy dữ liệu chuỗi...');
      const ownerAssetNameHex = await taadEnclave.anchorAssetName(ownerDid);
      const [protocolParams, slot, walletUtxos, ownerAnchorUtxo] = await Promise.all([
        chain.fetchProtocolParams(),
        chain.fetchSlotTip(),
        chain.fetchWalletUtxos(fundingAddr),
        chain.fetchAnchorUtxo(cfg.taadPolicyIdHex, ownerAssetNameHex),
      ]);

      if (slot <= 0) throw new Error('Slot tip không hợp lệ (≤ 0)');
      if (walletUtxos.length === 0) {
        throw new Error(
          `Ví ${fundingAddr} (account 0) không có UTxO — cần fund ADA (phí + ` +
            `collateral, ≥1 UTxO chỉ-ADA) trước khi tạo tổ chức.`,
        );
      }

      setStatus('Đang sinh danh tính tổ chức mới...');
      const childDid = await taadEnclave.constructDid(entityType, ownerDid, slot);
      const childMasterKek = await taadEnclave.generateMasterKek();
      const childTaadPubHex = await taadEnclave.deriveTaadPublicKey(childMasterKek);
      // Alias Keystore/Secure Enclave RIÊNG cho HW_Key của tổ chức mới — mỗi
      // OrgDID 1 alias, không trùng gate sinh trắc hay ví Phượng hoàng.
      const hwAlias = `phoenixOrgMint.org.${childDid}`;
      const hwKeypair = await generateKeypair(hwAlias, true);

      setStatus('Đang ráp + ký giao dịch...');
      const txHex = await taadEnclave.buildCreateChildTaadUtxoTx({
        childDid,
        ownerDid,
        entityType,
        hwPubHex: hwKeypair.publicKeyHex,
        childTaadPubHex,
        ownerMasterKekHex,
        walletSeedHex,
        network: networkId,
        taadScriptCborHex: cfg.taadScriptCborHex,
        policyIdHex: cfg.taadPolicyIdHex,
        ownerUtxo: {
          tx_hash: ownerAnchorUtxo.tx_hash,
          index: ownerAnchorUtxo.index,
          amount_lovelace: ownerAnchorUtxo.amount_lovelace,
          assets: ownerAnchorUtxo.assets,
        },
        utxos: walletUtxos,
        protocolParams,
        currentSlot: slot,
      });

      if (!txHex) {
        throw new Error(
          'Không ráp được tx. Kiểm tra: UTxO đủ phí/collateral, anchor owner còn ' +
            'sống, entity_type hợp lệ (1..9), policy/script CBOR đúng.',
        );
      }

      setStatus('Đang evaluate + submit...');
      const txHash = await evaluateThenSubmit(txHex, network, cfg.blockfrostKey);

      setStatus('');
      const phrase = await taadEnclave.masterKekToMnemonic(childMasterKek);
      const wordList = phrase.split(/\s+/).filter(Boolean);
      setPending({ childDid, txHash, network, words: wordList });
      setStep('backup');
    } catch (e: any) {
      setStep('form');
      setStatus('');
      setError(e?.message ?? String(e));
    }
  };

  const handleBackupDone = () => {
    if (!backupConfirmed || !pending) {
      showWarningBackup();
      return;
    }
    const { childDid, txHash, network } = pending;
    setPending(null);
    navigation.replace('OrgMintResult', { txHash, network, kind: 'create', orgDid: childDid });
  };

  const busy = step === 'building';

  if (step === 'backup' && pending) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={{ width: 36 }} />
          <Text style={styles.headerTitle}>Sao lưu khoá tổ chức</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
        >
          <View style={styles.warnBox}>
            <Icon name="shield-alert-outline" size={18} color={COLORS.warning} />
            <Text style={styles.warnText}>
              Đây là 24 từ khôi phục Master_KEK của TỔ CHỨC vừa tạo (không phải của
              bạn). GHI RA GIẤY, cất nơi an toàn. Mất cụm từ này = mất khả năng ký
              mint/rotate cho tổ chức — KHÔNG khôi phục được.
            </Text>
          </View>
          <View style={styles.wordsGrid}>
            {pending.words.map((w, i) => (
              <View key={i} style={styles.wordChip}>
                <Text style={styles.wordIndex}>{i + 1}</Text>
                <Text style={styles.wordText}>{w}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.confirmRow}
            onPress={() => setBackupConfirmed((v) => !v)}
            activeOpacity={0.8}
          >
            <Icon
              name={backupConfirmed ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={20}
              color={backupConfirmed ? COLORS.success : COLORS.textMuted}
            />
            <Text style={styles.confirmText}>Tôi đã ghi lại đủ 24 từ đúng thứ tự</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.signBtn, !backupConfirmed && styles.signBtnDisabled]}
            disabled={!backupConfirmed}
            onPress={handleBackupDone}
          >
            <Text style={styles.signBtnText}>Đã lưu — tiếp tục</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={busy}
        >
          <Icon name="chevron-left" size={26} color={busy ? COLORS.textMuted : COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tạo tổ chức</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
      >
        <Text style={styles.sectionLabel}>CHỦ SỞ HỮU (KÝ GENESIS)</Text>
        <View style={styles.card}>
          <Text style={styles.monoText} numberOfLines={2} selectable>
            {ownerDid || 'Chưa đăng nhập'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>LOẠI THỰC THỂ</Text>
        <View style={styles.typeGrid}>
          {ENTITY_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, entityType === t.value && styles.typeChipActive]}
              onPress={() => setEntityType(t.value)}
              disabled={busy}
            >
              <Text
                style={[styles.typeChipText, entityType === t.value && styles.typeChipTextActive]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>MỞ MASTER_KEK CHỦ SỞ HỮU</Text>
        {!unlocked ? (
          <TouchableOpacity style={styles.gateBtn} onPress={handleUnlockGate} disabled={busy}>
            <Icon name="fingerprint" size={20} color={GOLD_DEEP} />
            <Text style={styles.gateBtnText}>Xác thực sinh trắc để nhập 24 từ</Text>
          </TouchableOpacity>
        ) : (
          <TextInput
            style={[styles.input, styles.mnemonicInput]}
            value={mnemonic}
            onChangeText={setMnemonic}
            placeholder="Nhập đủ 24 từ khôi phục của BẠN (chủ sở hữu), cách nhau bởi dấu cách"
            placeholderTextColor={COLORS.textMuted}
            multiline
            secureTextEntry
            editable={!busy}
          />
        )}

        {!!error && (
          <View style={styles.errorBox}>
            <Icon name="alert-circle-outline" size={16} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {busy && !!status && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={GOLD} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.signBtn, (!unlocked || busy) && styles.signBtnDisabled]}
          activeOpacity={0.85}
          disabled={!unlocked || busy}
          onPress={handleCreate}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.signBtnText}>Ký giao dịch tạo OrgDID</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

function showWarningBackup() {
  // Tách hàm nhỏ để tránh import chéo không cần thiết — dùng console.warn làm
  // fallback tối thiểu; UI đã disable nút khi chưa tick xác nhận nên nhánh này
  // hiếm khi chạy tới (chỉ khi state đồng bộ trễ).
  console.warn('[OrgMintCreateScreen] cần xác nhận đã lưu 24 từ trước khi tiếp tục.');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: COLORS.bg, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 36, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: COLORS.text },
  scroll: { paddingTop: 20, paddingHorizontal: 20 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5,
    marginBottom: 8, marginTop: 16,
  },
  card: {
    backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    padding: 14,
  },
  monoText: { fontSize: 12.5, color: COLORS.text, fontFamily: 'monospace' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  typeChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  typeChipText: { fontSize: 12.5, color: COLORS.textSub, fontWeight: '600' },
  typeChipTextActive: { color: '#000' },
  input: {
    backgroundColor: COLORS.inputBg, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text,
  },
  mnemonicInput: { minHeight: 80, textAlignVertical: 'top' },
  gateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center',
    backgroundColor: `${GOLD}14`, borderWidth: 1, borderColor: `${GOLD}40`, borderRadius: 10,
    paddingVertical: 14,
  },
  gateBtnText: { fontSize: 13.5, fontWeight: '600', color: GOLD_DEEP },
  errorBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14,
    backgroundColor: `${COLORS.error}12`, borderRadius: 10, padding: 12,
  },
  errorText: { flex: 1, fontSize: 12.5, color: COLORS.error, lineHeight: 17 },
  statusRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 },
  statusText: { fontSize: 12.5, color: COLORS.textSub },
  signBtn: {
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20,
  },
  signBtnDisabled: { opacity: 0.4 },
  signBtnText: { fontSize: 15, fontWeight: '700', color: '#000' },
  warnBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: `${COLORS.warning}14`, borderRadius: 12, padding: 14, marginBottom: 20,
  },
  warnText: { flex: 1, fontSize: 12.5, color: COLORS.warning, lineHeight: 18 },
  wordsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  wordChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, width: '31%',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8,
  },
  wordIndex: { fontSize: 10, color: COLORS.textMuted, width: 16 },
  wordText: { fontSize: 12.5, color: COLORS.text, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  confirmText: { fontSize: 13, color: COLORS.text, flex: 1 },
});

export default OrgMintCreateScreen;
