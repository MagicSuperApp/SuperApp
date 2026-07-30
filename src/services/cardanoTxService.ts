/**
 * cardanoTxService — gửi giao dịch Cardano (ADA/LAMP) theo mô hình MỚI (Issue #74):
 *   CLIENT dựng + ký CBOR trong Enclave (Rust) → backend chỉ RELAY qua
 *   POST /wallet/tx/submit. Thay cho luồng did_payment build-tx cũ (đã bỏ).
 *
 * Luồng:
 *   1) derive địa chỉ ví người gửi (account) từ Master_KEK.
 *   2) fetch UTXO + protocol-params từ BACKEND PROXY (Blockfrost passthrough).
 *   3) native buildSignedTransfer → CBOR đã witness đầy đủ (seed KHÔNG rời native).
 *   4) wallet.txSubmit(cbor) → txHash.
 *
 * ⚠️ QUAN TRỌNG — vì sao KHÔNG dùng axios client của phoenixKey-api để fetch UTXO:
 *   client đó có interceptor tự đổi response sang camelCase → sẽ phá JSON Blockfrost
 *   (`tx_hash`→`txHash`, `amount`, `unit`…) mà Rust `transfer::TransferUtxo` parse theo
 *   snake_case. Nên ta fetch THÔ (fetch thuần), lấy `result` NGUYÊN VĂN rồi
 *   JSON.stringify đưa xuống native.
 *
 * ⏳ PHỤ THUỘC BACKEND: 2 endpoint proxy dưới CẦN team PhoenixKey thêm (xem
 *   docs/phoenixkey-mobile-gap-plan.md §Pha2). Trước khi có, sendCardano sẽ ném lỗi
 *   rõ ràng ở bước fetch (404) — KHÔNG âm thầm hỏng.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import taad from '../sdk/taadEnclave';
import { phoenixKeyApi, baseURL, PhoenixKeyApiError } from './phoenixKey-api';

const SESSION_TOKEN_KEY = 'phoenixkey_session_token';

// Endpoint proxy [CHỜ backend] — Blockfrost passthrough, result GIỮ NGUYÊN snake_case.
const UTXOS_PATH = (address: string) => `/wallet/utxos?address=${encodeURIComponent(address)}`;
const PARAMS_PATH = '/wallet/params';

/**
 * Lấy UTXO + protocol-params THÔ (snake_case) cho 1 địa chỉ — dùng chung cho gửi tx
 * lẫn uỷ thác stake. Trả về 2 chuỗi JSON sẵn sàng đưa xuống native.
 */
export async function fetchWalletUtxosAndParams(
  address: string,
): Promise<{ utxosJson: string; protocolParamsJson: string }> {
  const utxos = await rawGet<unknown>(UTXOS_PATH(address));
  const params = await rawGet<unknown>(PARAMS_PATH);
  return { utxosJson: JSON.stringify(utxos), protocolParamsJson: JSON.stringify(params) };
}

/** GET thô giữ nguyên JSON (KHÔNG camelCase). Bóc envelope { code, message, result }. */
async function rawGet<T = unknown>(path: string): Promise<T> {
  const token = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${baseURL}${path}`, { method: 'GET', headers });
  } catch (e) {
    throw new PhoenixKeyApiError(-1, 0, `Mạng lỗi khi lấy dữ liệu Cardano: ${String(e)}`);
  }

  let body: { code?: number; message?: string; result?: T };
  try {
    body = await res.json();
  } catch {
    throw new PhoenixKeyApiError(-1, res.status, `Phản hồi không hợp lệ (HTTP ${res.status})`);
  }
  if (body.code !== 1000 || body.result === undefined) {
    throw new PhoenixKeyApiError(body.code ?? -1, res.status, body.message ?? `HTTP ${res.status}`);
  }
  return body.result;
}

export interface SendCardanoParams {
  /** Master_KEK hex (đã unlock) — KHÔNG persist, chỉ truyền vào native rồi bỏ. */
  kekHex: string;
  /** CIP-1852 account index (walletRotationIndex hiện hành). */
  account: number;
  /** Địa chỉ nhận (bech32). */
  toAddress: string;
  /** Số ADA gửi tính bằng lovelace — CHUỖI thập phân (u64). */
  amountLovelace: string;
  /** 0 = preprod/testnet, 1 = mainnet. */
  network: number;
  /** Tuỳ chọn gửi kèm LAMP. */
  lampAmount?: string;
  lampPolicyHex?: string;
  lampAssetNameHex?: string;
}

/**
 * Gửi ADA (và tuỳ chọn LAMP) từ ví Standard của người dùng.
 * Trả txHash sau khi node Cardano nhận. Ném PhoenixKeyApiError/Error nếu bất kỳ
 * bước nào lỗi (thiếu UTXO, build lỗi, submit từ chối…).
 */
export async function sendCardano(params: SendCardanoParams): Promise<{ txHash: string }> {
  const net = params.network === 1 ? 1 : 0;

  // 1) Địa chỉ người gửi (để hỏi UTXO). Derive từ chính KEK trong native.
  const senderAddress = await taad.deriveWalletAddress(params.kekHex, params.account, net);
  if (!senderAddress) {
    throw new Error('Không derive được địa chỉ ví người gửi (KEK sai?).');
  }

  // 2) UTXO + protocol params THÔ từ proxy (giữ snake_case cho Rust).
  const utxos = await rawGet<unknown>(UTXOS_PATH(senderAddress));
  const protocolParams = await rawGet<unknown>(PARAMS_PATH);

  // 3) Native dựng + ký CBOR (seed không rời native).
  const cbor = await taad.buildSignedTransfer({
    kekHex: params.kekHex,
    account: params.account,
    toAddress: params.toAddress,
    amountLovelace: params.amountLovelace,
    lampAmount: params.lampAmount,
    lampPolicyHex: params.lampPolicyHex,
    lampAssetNameHex: params.lampAssetNameHex,
    utxosJson: JSON.stringify(utxos),
    protocolParamsJson: JSON.stringify(protocolParams),
    network: net,
  });

  // 4) Relay lên Cardano qua backend.
  const { cardanoTxHash } = await phoenixKeyApi.wallet.txSubmit(cbor);
  return { txHash: cardanoTxHash };
}
