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
 * ✅ HAI ENDPOINT ĐÃ CÓ (đo 2026-08-11) — ghi chú cũ "CẦN team PhoenixKey thêm" đã
 *   lỗi thời: `GET /wallet/params` → 200, `GET /wallet/{did}/utxos` → 401 (tức tồn
 *   tại, đang đòi phiên). Bên này từng kết luận "thiếu" vì gọi
 *   `/wallet/utxos?address=` — sai HÌNH ĐƯỜNG GỌI, không phải thiếu đường.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import taad from '../sdk/taadEnclave';
import { phoenixKeyApi, baseURL, PhoenixKeyApiError } from './phoenixKey-api';
import { currentUserDid } from '../sdk/phoenixKey';

const SESSION_TOKEN_KEY = 'phoenixkey_session_token';

// ── UTXO: khoá là DID, KHÔNG phải address ────────────────────────────────────
//
// Bản cũ gọi `/wallet/utxos?address=…` và bên này kết luận "backend thiếu đường".
// Kết luận đó SAI, và sai theo một kiểu đáng ghi lại:
//
//   GET /api/v1/wallet/utxos?address=…      → 404
//   GET /api/v1/wallet/{userDid}/utxos      → 401 {"code":1304,"Missing Bearer token"}
//
// `401` là bằng chứng đường TỒN TẠI. `404` không là bằng chứng của gì cả — nó đọc
// được ít nhất ba nghĩa: chưa có · gọi sai hình · prod tụt sau `main`. Nhà PhoenixKey
// chỉ ra chỗ này 2026-08-11 và nêu thành quy tắc: **thử hình có tham số ĐƯỜNG DẪN
// trước khi kết luận thiếu.** Đây là cùng họ với bài học `grep` tuần trước — một mã
// trả về là CHỖ CẦN ĐỌC, không phải kết luận.
//
// Vì sao khoá là DID: ví Phoenix là mỗi-DID-nhiều-địa-chỉ-chi-được (Phoenix +
// Standard fixed/active). Hỏi "UTxO của địa chỉ X" trả lời được MỘT MẢNH, mà dựng tx
// uỷ thác cần TOÀN BỘ. Backend gom sẵn qua `listSpendableAddresses(userDid)` và loại
// stake address (không chi ADA được từ đó).
const UTXOS_PATH = (did: string) => `/wallet/${encodeURIComponent(did)}/utxos`;
const PARAMS_PATH = '/wallet/params';

/**
 * Một UTxO ĐÚNG HÌNH mà Rust đợi (`transfer::TransferUtxo` / `staking::StakeUtxo`):
 * `{ tx_hash, index, lovelace, assets: [{ policy, name, quantity }] }`.
 * `lovelace`/`quantity` là CHUỖI — u64 vượt 2^53 của JSON number.
 */
interface RustUtxo {
  tx_hash: string;
  index: number;
  lovelace: string;
  assets: { policy: string; name: string; quantity: string }[];
}

/** Độ dài hex của policy id Cardano: 28 byte = 56 ký tự. */
const POLICY_HEX_LEN = 56;

/**
 * Đổi hình UTxO của PhoenixKey sang hình Rust đợi. KHÔNG phải đổi tên suông — ba chỗ
 * lệch thật, và hai trong ba chỗ sẽ hỏng CÂM nếu bỏ qua:
 *
 * 1. `output_index` (backend) vs `index` (Rust) — serde thiếu trường bắt buộc thì ném,
 *    nên chỗ này hỏng TO TIẾNG. Đỡ nhất trong ba.
 * 2. `native_assets` là **bảng** `unit → quantity`, còn Rust đợi **mảng**
 *    `{policy, name, quantity}`. `assets` ở Rust có `#[serde(default)]` ⇒ bảng lạ bị
 *    bỏ qua và mảng thành RỖNG. Hậu quả: chọn coin tưởng ví chỉ có ADA, LAMP/CARP
 *    trong cùng UTxO biến mất khỏi tính toán — **không lỗi nào được in**.
 * 3. `unit` là policy(56 hex) nối thẳng asset name hex, phải cắt ra.
 *
 * TÊN TRƯỜNG TRÊN DÂY ĐÃ CHỐT — snake_case, đọc thẳng từ cấu hình máy chủ:
 *
 *   # PhoenixKey-Database, main, src/main/resources/application.yml:8-9
 *   jackson:
 *     property-naming-strategy: SNAKE_CASE
 *
 * Bản trước của hàm này nhận CẢ HAI cách viết (`tx_hash` lẫn `txHash`) vì lúc đó
 * bên này chưa gọi được thân 200 thật và không dám chọn. Nay có nguồn trực tiếp thì
 * nhánh camelCase là mã CHẾT — mà mã chết ở chỗ đổi hình thì tệ hơn mã thiếu: nó
 * làm người đọc sau tưởng máy chủ có hai cách viết, rồi giữ mãi cái nhánh đó.
 *
 * Hình đã đọc ở `dto/wallet/WalletTxBuildDtos.java` (bản main): `lovelace` và mọi
 * `quantity` là CHUỖI (`@JsonSerialize(ToStringSerializer)`), `output_index` là SỐ,
 * `native_assets` là BẢNG `unit → quantity`.
 */
export function toRustUtxos(items: unknown): RustUtxo[] {
  if (!Array.isArray(items)) return [];
  const out: RustUtxo[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const txHash = it.tx_hash;
    const idx = it.output_index;
    if (typeof txHash !== 'string' || !txHash) continue;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) continue;

    const assetsMap = it.native_assets as Record<string, unknown> | undefined;
    const assets: RustUtxo['assets'] = [];
    if (assetsMap && typeof assetsMap === 'object' && !Array.isArray(assetsMap)) {
      for (const [unit, qty] of Object.entries(assetsMap)) {
        // Unit ngắn hơn policy id thì không cắt được — bỏ qua còn hơn dựng một
        // policy cụt rồi ký một giao dịch chi nhầm tài sản.
        if (typeof unit !== 'string' || unit.length < POLICY_HEX_LEN) continue;
        assets.push({
          policy: unit.slice(0, POLICY_HEX_LEN),
          name: unit.slice(POLICY_HEX_LEN),
          quantity: String(qty),
        });
      }
    }
    out.push({ tx_hash: txHash, index: idx, lovelace: String(it.lovelace ?? '0'), assets });
  }
  return out;
}

/**
 * Lấy UTXO + protocol-params cho MỘT DID — dùng chung cho gửi tx lẫn uỷ thác stake.
 * Trả 2 chuỗi JSON sẵn sàng đưa xuống native.
 *
 * `params` đưa xuống NGUYÊN VĂN (Rust đọc `min_fee_a`… đúng như dây trả). `utxos` thì
 * phải đổi hình — xem `toRustUtxos`.
 */
export async function fetchWalletUtxosAndParams(
  did: string,
): Promise<{ utxosJson: string; protocolParamsJson: string }> {
  const utxoBody = await rawGet<Record<string, unknown>>(UTXOS_PATH(did));
  const params = await rawGet<unknown>(PARAMS_PATH);
  const items = utxoBody?.items ?? utxoBody;
  return {
    utxosJson: JSON.stringify(toRustUtxos(items)),
    protocolParamsJson: JSON.stringify(params),
  };
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

  // 2) UTXO + protocol params. UTXO khoá theo DID (không theo address) — xem
  //    `UTXOS_PATH`. `senderAddress` vẫn cần ở bước dựng tx bên dưới.
  const did = await currentUserDid();
  if (!did) {
    throw new Error('Chưa đăng nhập PhoenixKey — không lấy được UTXO của ví.');
  }
  const { utxosJson: utxosStr, protocolParamsJson: paramsStr } =
    await fetchWalletUtxosAndParams(did);

  // 3) Native dựng + ký CBOR (seed không rời native).
  const cbor = await taad.buildSignedTransfer({
    kekHex: params.kekHex,
    account: params.account,
    toAddress: params.toAddress,
    amountLovelace: params.amountLovelace,
    lampAmount: params.lampAmount,
    lampPolicyHex: params.lampPolicyHex,
    lampAssetNameHex: params.lampAssetNameHex,
    utxosJson: utxosStr,
    protocolParamsJson: paramsStr,
    network: net,
  });

  // 4) Relay lên Cardano qua backend.
  const { cardanoTxHash } = await phoenixKeyApi.wallet.txSubmit(cbor);
  return { txHash: cardanoTxHash };
}
