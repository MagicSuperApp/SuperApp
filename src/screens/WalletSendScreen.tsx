/**
 * WalletSendScreen — GỬI ADA từ ví Standard.
 *
 * ── Vì sao màn này mới có hôm nay, trong khi đường gửi đã xong từ lâu ─────────
 * `services/cardanoTxService.ts` đã có `sendCardano()` đủ bốn bước (derive địa
 * chỉ → lấy UTXO + protocol params theo DID → native dựng & ký CBOR, seed không
 * rời native → `/wallet/tx/submit`), có bộ kiểm neo đường tự chữa 401
 * (`cardanoTxServiceAuthRetry.test.ts`). Nhưng đo `src/` ngày 13/09/2026: **không
 * tệp `.tsx` nào import nó** — tính năng đã dựng xong mà không có lối vào. Màn
 * này là lối vào đó, không phải một đường gửi thứ hai.
 *
 * ── Ba ràng buộc của màn này, và vì sao từng cái ở đây ────────────────────────
 * 1. **Gửi từ ví CỐ ĐỊNH (account 0).** Cùng account mà `standardWalletService`
 *    đăng ký lên backend và cùng account `StakingScreen` dùng. UTXO được khoá
 *    theo DID chứ không theo địa chỉ (`cardanoTxService.ts` bước 2), còn chữ ký
 *    thì dựng theo `account` — hai thứ đó chỉ chắc chắn khớp nhau ở account 0.
 *    Cho chọn ví hoạt động (account N) là mở một đường ký sai UTXO mà không có
 *    thông báo nào, nên màn này KHÔNG cho chọn, và nói thẳng nó gửi từ ví nào.
 * 2. **Chặn địa chỉ sai mạng TRƯỚC khi dựng tx.** `addr1…` trên chuỗi thử và
 *    `addr_test1…` trên mainnet đều là địa chỉ hợp lệ, nên không tầng nào bên
 *    dưới kêu: tiền đi vào một địa chỉ có thật trên một chuỗi khác. Đây là loại
 *    hỏng không lấy lại được, nên nó phải chặn ở đây chứ không báo sau.
 * 3. **Số dư `null` hiện "—", không hiện 0.** "Chưa đọc được số dư" và "ví rỗng"
 *    là hai việc khác nhau; vẽ giống nhau thì người dùng tin là ví rỗng. Cùng
 *    luật với `PhoenixWalletScreen` (ba ô số dư + `balanceIssue`).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import { fmtAdaLabel } from '../utils/token';
import { getStoredMasterKek } from '../services/masterKekStore';
import { sendCardano } from '../services/cardanoTxService';
import { phoenixKeyApi } from '../services/phoenixKey-api';
import { currentUserDid } from '../sdk/phoenixKey';
import * as taad from '../sdk/taadEnclave';
import { CARDANO_NETWORK as NETWORK, IS_MAINNET } from '../config/cardanoNetwork';
import { showError, showSuccess, showWarning } from '../utils/alert';

const PRIMARY = '#0033AD'; // Cardano blue — cùng màu với StakingScreen

/** Ví cố định. Xem ràng buộc 1 ở đầu tệp — con số này KHÔNG cho người dùng đổi. */
const ACCOUNT = 0;

const LOVELACE_PER_ADA = 1_000_000;

/**
 * Đệm phí + min-ADA giữ lại ở ví (lovelace). Không phải phí thật — phí thật do
 * native tính lúc dựng tx. Đây chỉ là mức chặn sớm để người dùng không gõ đúng
 * toàn bộ số dư rồi nhận lỗi "không đủ UTXO" sau ba bước mạng.
 */
const FEE_BUFFER_LOVELACE = 1_200_000;

/** Tiền tố bech32 hợp lệ theo mạng đang chạy. Xem ràng buộc 2 ở đầu tệp. */
const ADDR_PREFIX = IS_MAINNET ? 'addr1' : 'addr_test1';

/**
 * Kiểm địa chỉ nhận. Trả `null` khi hợp lệ, hoặc CÂU nói rõ sai ở đâu.
 *
 * Cố ý không kiểm checksum bech32 ở đây: làm đúng việc đó cần thư viện, mà sai
 * checksum thì tầng native đã từ chối và từ chối đúng lúc chưa mất gì. Cái tầng
 * dưới KHÔNG bắt được là sai mạng — nên đó là cái duy nhất kiểm ở đây.
 */
export function validateRecipient(raw: string): string | null {
  const addr = raw.trim();
  if (!addr) return 'Chưa nhập địa chỉ người nhận.';
  if (addr.startsWith('addr_test1') && IS_MAINNET) {
    return 'Địa chỉ này thuộc chuỗi thử, còn ví đang ở mạng chính. Gửi đi là mất tiền.';
  }
  if (addr.startsWith('addr1') && !IS_MAINNET) {
    return 'Địa chỉ này thuộc mạng chính, còn ví đang ở chuỗi thử. Tiền sẽ không tới nơi.';
  }
  if (!addr.startsWith(ADDR_PREFIX)) {
    return `Địa chỉ Cardano phải bắt đầu bằng "${ADDR_PREFIX}".`;
  }
  if (addr.length < 50) return 'Địa chỉ quá ngắn — có vẻ bị cắt mất khi dán.';
  return null;
}

/**
 * Đổi số ADA người dùng gõ sang lovelace dạng CHUỖI (u64 — không qua `number`,
 * vì `number` mất chính xác từ 2^53 và số lovelace vượt ngưỡng đó là chuyện
 * bình thường). Trả `null` khi chuỗi không phải số hợp lệ.
 */
export function adaToLovelace(input: string): string | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const padded = (frac + '000000').slice(0, 6);
  const lovelace = BigInt(whole) * BigInt(LOVELACE_PER_ADA) + BigInt(padded);
  if (lovelace <= 0n) return null;
  return lovelace.toString();
}

const WalletSendScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [kek, setKek] = useState<string | null>(null);
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [balanceLovelace, setBalanceLovelace] = useState<number | null>(null);
  /** Vì sao số dư đang là "—". `null` = không có gì để nói. */
  const [balanceIssue, setBalanceIssue] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setFatal(null);
    try {
      const k = await getStoredMasterKek();
      setKek(k);
      if (!k) { setFatal('Chưa có ví trên máy này. Hãy tạo hoặc khôi phục ví trước khi gửi.'); return; }

      try {
        const addr = await taad.deriveWalletAddress(k, ACCOUNT, NETWORK);
        setFromAddress(addr || null);
      } catch { setFromAddress(null); }

      const did = await currentUserDid();
      if (!did) { setFatal('Chưa đăng nhập PhoenixKey — không đọc được ví.'); return; }
      try {
        const all = await phoenixKeyApi.wallet.getAll(did);
        const standard = all.wallets.find((w) => w.kind === 'standard') ?? all.wallets[0];
        // Không có ví nào ⟹ chưa đăng ký xong, KHÔNG phải số dư 0.
        if (!standard) {
          setBalanceLovelace(null);
          setBalanceIssue('Máy chủ chưa có ví nào cho danh tính này.');
        } else {
          setBalanceLovelace(standard.balances.lovelace);
          setBalanceIssue(null);
        }
      } catch (e: any) {
        setBalanceLovelace(null);
        setBalanceIssue(e?.message ?? 'Chưa đọc được số dư từ máy chủ ví.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recipientError = useMemo(
    () => (to.trim() ? validateRecipient(to) : null),
    [to],
  );

  const amountLovelace = useMemo(() => adaToLovelace(amount), [amount]);

  const amountError = useMemo(() => {
    if (!amount.trim()) return null;
    if (!amountLovelace) return 'Số tiền không hợp lệ (tối đa 6 chữ số thập phân).';
    if (balanceLovelace === null) return null; // chưa biết số dư → không chặn ở đây
    const max = BigInt(balanceLovelace) - BigInt(FEE_BUFFER_LOVELACE);
    if (max <= 0n) return 'Số dư không đủ để trả phí giao dịch.';
    if (BigInt(amountLovelace) > max) {
      return `Nhiều hơn mức gửi được. Tối đa khoảng ${fmtAdaLabel(max.toString())} (đã chừa phí).`;
    }
    return null;
  }, [amount, amountLovelace, balanceLovelace]);

  const canSend =
    !!kek && !!amountLovelace && !recipientError && !amountError && !!to.trim() && !sending;

  const doSend = useCallback(async () => {
    if (!kek || !amountLovelace) return;
    setSending(true);
    try {
      const { txHash } = await sendCardano({
        kekHex: kek,
        account: ACCOUNT,
        toAddress: to.trim(),
        amountLovelace,
        network: NETWORK,
      });
      showSuccess(
        'Đã gửi',
        `Mã giao dịch: ${txHash.slice(0, 16)}…\nMất vài phút để lên chuỗi. Số dư cập nhật sau đó.`,
      );
      setTo(''); setAmount('');
      load();
    } catch (e: any) {
      // Hiện NGUYÊN câu của tầng dưới. Nó nói được người dùng phải làm gì
      // ("thiếu UTXO", "submit từ chối"), câu chung chung thì không.
      showError('Gửi thất bại', e?.message ?? 'Không gửi được. Thử lại nơi sóng tốt.');
    } finally {
      setSending(false);
    }
  }, [kek, amountLovelace, to, load]);

  const handleSend = useCallback(() => {
    if (!canSend || !amountLovelace) return;
    const addr = to.trim();
    showWarning(
      IS_MAINNET ? 'Gửi tiền thật?' : 'Xác nhận gửi',
      `${fmtAdaLabel(amountLovelace)}\n\nTới địa chỉ:\n${addr}\n\n` +
        'Giao dịch Cardano KHÔNG hoàn tác được. Đối chiếu lại địa chỉ trước khi xác nhận.',
      { confirmText: 'Gửi', cancelText: 'Huỷ', onConfirm: doSend },
    );
  }, [canSend, amountLovelace, to, doSend]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Icon name="arrow-left" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Gửi</Text>
      <TouchableOpacity onPress={load} hitSlop={8}>
        <Icon name="refresh" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>
      </View>
    );
  }

  if (fatal) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.body}>
          <View style={styles.card}>
            <Icon name="wallet-outline" size={28} color={COLORS.textSub} />
            <Text style={styles.fatalText}>{fatal}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY} />
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Nguồn tiền — nói rõ gửi từ ví nào, vì người dùng có nhiều ví. */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Gửi từ ví cố định</Text>
          <Text style={styles.balance}>
            {balanceLovelace === null ? '—' : fmtAdaLabel(balanceLovelace)}
          </Text>
          {balanceIssue ? (
            <Text style={styles.issue}>{balanceIssue}</Text>
          ) : null}
          {fromAddress ? (
            <Text style={styles.addr} numberOfLines={1} ellipsizeMode="middle">{fromAddress}</Text>
          ) : (
            <Text style={styles.issue}>Chưa dựng được địa chỉ ví trên máy này.</Text>
          )}
          {!IS_MAINNET ? (
            <View style={styles.testnetTag}>
              <Icon name="flask-outline" size={13} color="#8A5A00" />
              <Text style={styles.testnetText}>Chuỗi thử — tiền ở đây không có giá trị thật.</Text>
            </View>
          ) : null}
        </View>

        {/* Người nhận */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Địa chỉ người nhận</Text>
          <TextInput
            style={[styles.input, recipientError ? styles.inputBad : null]}
            value={to}
            onChangeText={setTo}
            placeholder={`${ADDR_PREFIX}…`}
            placeholderTextColor={COLORS.textSub}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          {recipientError ? <Text style={styles.err}>{recipientError}</Text> : null}
        </View>

        {/* Số tiền */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Số ADA</Text>
          <TextInput
            style={[styles.input, amountError ? styles.inputBad : null]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.000000"
            placeholderTextColor={COLORS.textSub}
            keyboardType="decimal-pad"
          />
          {amountError ? <Text style={styles.err}>{amountError}</Text> : null}
        </View>

        <TouchableOpacity
          style={[styles.sendBtn, !canSend ? styles.sendBtnOff : null]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="send" size={18} color="#fff" />
              <Text style={styles.sendText}>Gửi</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.note}>
          Giao dịch được ký ngay trên máy này; cụm 24 từ không rời khỏi máy.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: PRIMARY, paddingHorizontal: 16, paddingTop: 48, paddingBottom: 14,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  body: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 14,
  },
  cardLabel: { color: COLORS.textSub, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  balance: { color: COLORS.text, fontSize: 26, fontWeight: '800' },
  addr: { color: COLORS.textSub, fontSize: 12, marginTop: 8 },
  issue: { color: COLORS.warning ?? '#B26A00', fontSize: 12, marginTop: 8 },
  testnetTag: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  testnetText: { color: '#8A5A00', fontSize: 12, flex: 1 },
  input: {
    color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44,
  },
  inputBad: { borderColor: COLORS.error ?? '#C62828' },
  err: { color: COLORS.error ?? '#C62828', fontSize: 12, marginTop: 8 },
  fatalText: { color: COLORS.text, fontSize: 14, marginTop: 10, lineHeight: 20 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 15,
  },
  sendBtnOff: { opacity: 0.45 },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  note: { color: COLORS.textSub, fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});

export default WalletSendScreen;
