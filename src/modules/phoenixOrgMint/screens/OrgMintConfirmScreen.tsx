// modules/phoenixOrgMint/screens/OrgMintConfirmScreen.tsx
//
// Xác nhận + ký tx MINT LAMP (bản B — Registry-gate + SupplyState + KHO). Port
// logic từ PhoenixKey-Core `lib/screens/mint_lamp_screen.dart` (worktree
// `_wt-core-mint-b`, commit 2c63ad7) sang RN — GIỮ NGUYÊN thứ tự bước:
//
//   1. Gate sinh trắc (Keystore/Secure Enclave) → mở ô nhập 24 từ Master_KEK.
//   2. App TỰ fetch chain-data (protocol params, slot, UTxO ví, Registry,
//      SupplyState, KHO) qua Blockfrost.
//   3. Rust suy authority key từ Master_KEK, TỰ đọc authority cho token_tag từ
//      RegistryDatum (KHÔNG tin app khai báo), ráp + ký tx.
//   4. Evaluate (Blockfrost /utils/txs/evaluate, fail-fast) rồi submit.
//
// MVP SinglePkh: authority key = Master_KEK CỦA CHÍNH danh tính đang đăng nhập
// (org_did = identity hiện tại) — khớp giả định mint_lamp_screen.dart. MultiSig
// (token đối tác nhiều thiết bị) chưa có UI gom chữ ký — để giai đoạn sau.
//
// "display_text chống blind-sign": số lượng LAMP + đích rót (KHO, KHÔNG ra ví)
// hiện RÕ TRƯỚC khi cho bấm ký — người dùng luôn thấy CHÍNH XÁC cái mình sắp ký.

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
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RootState } from '../../../store';
import { COLORS, ORGMINT_THEME } from '../../../theme';
import taadEnclave from '../../../sdk/taadEnclave';
import { PhoenixChainDataService } from '../../../services/phoenixChainData';
import { evaluateThenSubmit } from '../../../services/phoenixTxSubmit';
import {
  ensureBiometricGate,
  unlockMasterKekFromMnemonic,
  OrgMintBiometricUnavailableError,
} from '../../../services/phoenixOrgMintAuth';
import {
  getPhoenixOrgMintConfig,
  getMissingMintConfig,
  chainNetworkId,
  rustNetworkId,
} from '../../../config/phoenixOrgMint';

const GOLD = ORGMINT_THEME.primary;
const GOLD_DEEP = ORGMINT_THEME.primaryDeep;

type Step = 'form' | 'unlocking' | 'building' | 'done';

const OrgMintConfirmScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const currentUser = useSelector((state: RootState) => state.user.currentUser);

  const orgDid: string = route.params?.orgDid ?? currentUser?.did ?? '';

  const [amountText, setAmountText] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const missing = useMemo(() => getMissingMintConfig(), []);
  const amount = Number.parseInt(amountText.trim(), 10);
  const amountValid = Number.isFinite(amount) && amount > 0;

  const handleUnlockGate = async () => {
    setError('');
    try {
      await ensureBiometricGate('Xác thực để mở Master_KEK', 'Ký giao dịch mint LAMP');
      setUnlocked(true);
    } catch (e: any) {
      if (e instanceof OrgMintBiometricUnavailableError) {
        setError(e.message);
      } else {
        setError(e?.message ?? 'Xác thực sinh trắc thất bại hoặc bị huỷ.');
      }
    }
  };

  const handleSign = async () => {
    if (!orgDid) {
      setError('Thiếu OrgDID — quay lại chọn tổ chức.');
      return;
    }
    if (!amountValid) {
      setError('Số lượng LAMP (oil) phải là số nguyên > 0.');
      return;
    }
    const words = mnemonic.trim().replace(/\s+/g, ' ');
    if (words.split(' ').length !== 24) {
      setError('Cụm từ khôi phục Master_KEK phải đủ 24 từ.');
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

      setStatus('Đang mở Master_KEK...');
      const masterKekHex = await unlockMasterKekFromMnemonic(words);
      const walletSeedHex = await taadEnclave.deriveWalletSeed(masterKekHex);
      const fundingAddr = await taadEnclave.deriveCardanoAddress(walletSeedHex, networkId);

      setStatus('Đang lấy dữ liệu chuỗi...');
      const registryNameHex = await taadEnclave.anchorAssetName(orgDid);

      const [protocolParams, slot, walletUtxos, registryUtxo, supplyStateUtxo, khoUtxo] =
        await Promise.all([
          chain.fetchProtocolParams(),
          chain.fetchSlotTip(),
          chain.fetchWalletUtxos(fundingAddr),
          chain.fetchNftHolderUtxo(cfg.registryNftPolicyId, registryNameHex, 'Registry'),
          chain.fetchNftHolderUtxo(cfg.threadNftPolicyId, cfg.threadNftNameHex, 'SupplyState'),
          chain.fetchNftHolderUtxo(cfg.khoNftPolicyId, cfg.khoNftNameHex, 'KHO'),
        ]);

      if (slot <= 0) throw new Error('Slot tip không hợp lệ (≤ 0)');
      if (walletUtxos.length === 0) {
        throw new Error(
          `Ví ${fundingAddr} (account 0) không có UTxO — cần fund ADA (phí + ` +
            `collateral, ≥1 UTxO chỉ-ADA) trước khi mint.`,
        );
      }

      setStatus('Đang ráp + ký giao dịch...');
      const txHex = await taadEnclave.buildMintLampViaDid({
        authorityKeks: [masterKekHex],
        registryUtxo: {
          tx_hash: registryUtxo.tx_hash,
          index: registryUtxo.index,
          inline_datum_hex: registryUtxo.inline_datum_hex,
        },
        tokenTagHex: cfg.lampTokenTagHex,
        supplyStateUtxo: {
          tx_hash: supplyStateUtxo.tx_hash,
          index: supplyStateUtxo.index,
          amount_lovelace: supplyStateUtxo.amount_lovelace,
          assets: supplyStateUtxo.assets,
          inline_datum_hex: supplyStateUtxo.inline_datum_hex,
        },
        supplyStateScriptCborHex: cfg.supplyStateScriptCborHex,
        khoUtxo: {
          tx_hash: khoUtxo.tx_hash,
          index: khoUtxo.index,
          address: khoUtxo.address,
        },
        lampPolicyCborHex: cfg.lampPolicyCborHex,
        mint: { token_name_hex: cfg.lampTokenNameHex, amount },
        utxos: walletUtxos,
        protocolParams,
        walletSeedHex,
        network: networkId,
        currentSlot: slot,
      });

      if (!txHex) {
        throw new Error(
          'Không ráp được tx. Kiểm tra: UTxO đủ phí/collateral (cần 1 UTxO chỉ-ADA ' +
            'cho collateral), Registry/SupplyState/KHO UTxO đúng, authority KEK khớp ' +
            'entry registry, chưa vượt cap.',
        );
      }

      setStatus('Đang evaluate + submit...');
      const txHash = await evaluateThenSubmit(txHex, network, cfg.blockfrostKey);

      setStep('done');
      navigation.replace('OrgMintResult', { txHash, network, kind: 'mint' });
    } catch (e: any) {
      setStep('form');
      setStatus('');
      setError(e?.message ?? String(e));
    }
  };

  const busy = step === 'building';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        <Text style={styles.headerTitle}>Mint LAMP</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
      >
        <Text style={styles.sectionLabel}>ORGDID</Text>
        <View style={styles.card}>
          <Text style={styles.monoText} numberOfLines={2} selectable>
            {orgDid || '(chưa chọn)'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>SỐ LƯỢNG LAMP (OIL — 1 LAMP = 10^6 OIL)</Text>
        <TextInput
          style={styles.input}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="number-pad"
          placeholder="vd 1000000 = 1 LAMP"
          placeholderTextColor={COLORS.textMuted}
          editable={!busy}
        />

        {/* Display-text chống blind-sign — luôn hiện RÕ trước khi ký. */}
        {amountValid && (
          <View style={styles.previewBox}>
            <Icon name="information-outline" size={16} color={GOLD_DEEP} />
            <Text style={styles.previewText}>
              Sẽ mint {amount.toLocaleString('vi-VN')} oil LAMP, rót vào KHO của tổ
              chức (KHÔNG ra ví cá nhân). Registry + KHO chỉ ĐỌC (reference input);
              SupplyState bị cập nhật cap.
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>MỞ MASTER_KEK</Text>
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
            placeholder="Nhập đủ 24 từ khôi phục, cách nhau bởi dấu cách"
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
          style={[
            styles.signBtn,
            (!unlocked || !amountValid || busy) && styles.signBtnDisabled,
          ]}
          activeOpacity={0.85}
          disabled={!unlocked || !amountValid || busy}
          onPress={handleSign}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text style={styles.signBtnText}>Ký giao dịch mint LAMP</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

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
  input: {
    backgroundColor: COLORS.inputBg, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text,
  },
  mnemonicInput: { minHeight: 80, textAlignVertical: 'top' },
  previewBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10,
    backgroundColor: `${GOLD}12`, borderRadius: 10, padding: 12,
  },
  previewText: { flex: 1, fontSize: 12.5, color: GOLD_DEEP, lineHeight: 17 },
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
});

export default OrgMintConfirmScreen;
