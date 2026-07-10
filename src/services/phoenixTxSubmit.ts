/**
 * PhoenixTxSubmit — evaluate + submit tx đã ký (CBOR hex) qua Blockfrost, dùng
 * chung cho luồng "tạo OrgDID + mint LAMP" (`src/modules/phoenixOrgMint`).
 *
 * LƯU Ý KIẾN TRÚC (khác với "evaluate-then-PATCH" lý tưởng): các builder Rust
 * (`taad_build_create_child_taad_utxo_tx`, `taad_build_mint_lamp_via_did`) trả
 * về tx ĐÃ KÝ với ExUnits ước lượng TĨNH bảo thủ đã bake sẵn (xem comment
 * `mint_lamp.rs::LAMP_MINT_EX_UNITS_*`). ExUnits nằm trong tx body (phần được
 * `script_data_hash` bảo vệ) — SỬA ExUnits sau khi ký sẽ làm KHÔNG khớp vkey
 * signature đã có, cần build-lại-rồi-ký-lại chứ không thể "patch tại chỗ" một
 * tx đã ký. Rust builder hiện KHÔNG nhận tham số ExUnits override, nên module
 * JS này KHÔNG patch — chỉ dùng evaluate làm bước TIỀN KIỂM (fail-fast, phát
 * hiện lỗi script/redeemer TRƯỚC khi mất phí+collateral do submit thất bại),
 * rồi submit nguyên trạng nếu evaluate không báo lỗi. Nếu evaluate cho thấy
 * ExUnits tĩnh của Rust không đủ, đây là lỗi cấu hình ở TẦNG RUST (hằng số
 * `LAMP_MINT_EX_UNITS_*` cần điều chỉnh) — KHÔNG phải việc JS tự vá được.
 *
 * (Đối chiếu: PhoenixKey-Core hiện KHÔNG có màn "evaluate-then-patch" mẫu nào
 * — `incoming_activation_screen.dart` chỉ gọi `PhoenixApi.submitActivationTx`,
 * một endpoint BACKEND PROXY submit thẳng, không evaluate/patch phía Dart.)
 */

const TIMEOUT_MS = 60_000;

/** Chuyển hex → Uint8Array (thủ công — KHÔNG dùng Buffer, RN không polyfill sẵn). */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new Error('CBOR hex không hợp lệ (độ dài lẻ hoặc ký tự lạ)');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function baseUrlFor(network: 0 | 1 | 2): string {
  switch (network) {
    case 1:
      return 'https://cardano-mainnet.blockfrost.io/api/v0';
    case 2:
      return 'https://cardano-preview.blockfrost.io/api/v0';
    default:
      return 'https://cardano-preprod.blockfrost.io/api/v0';
  }
}

export interface EvaluateRedeemerResult {
  validationError?: boolean;
  budget?: { memory: number; cpu: number };
}

/**
 * Preflight: Blockfrost `/utils/txs/evaluate` — đánh giá script trước khi
 * submit (fail-fast). Ném Error tiếng Việt rõ nếu có redeemer lỗi. KHÔNG chặn
 * cứng khi evaluate không xác định được ExUnits (một số phản hồi Blockfrost có
 * shape khác nhau theo phiên bản) — chỉ chặn khi THẤY RÕ lỗi script.
 */
export async function evaluateTx(
  signedTxCborHex: string,
  network: 0 | 1 | 2,
  blockfrostKey: string,
): Promise<unknown> {
  if (!blockfrostKey) {
    throw new Error('Thiếu BLOCKFROST_KEY trong cấu hình (.env)');
  }
  const bytes = hexToBytes(signedTxCborHex);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrlFor(network)}/utils/txs/evaluate`, {
      method: 'POST',
      headers: { project_id: blockfrostKey, 'Content-Type': 'application/cbor' },
      body: bytes.buffer as ArrayBuffer,
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(`Lỗi mạng khi evaluate tx qua Blockfrost: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Blockfrost evaluate lỗi HTTP ${res.status}: ${JSON.stringify(body ?? {})}`,
    );
  }
  // Blockfrost trả {result: {EvaluationResult: {...}} | {EvaluationFailure: {...}}}
  const result = (body as { result?: Record<string, unknown> } | null)?.result;
  if (result && 'EvaluationFailure' in result) {
    throw new Error(
      `Tx không hợp lệ theo script on-chain (evaluate thất bại): ` +
        `${JSON.stringify(result.EvaluationFailure)}`,
    );
  }
  return body;
}

/**
 * Submit tx đã ký qua Blockfrost `/tx/submit`. Trả tx hash (hex) khi thành
 * công. Ném Error tiếng Việt rõ khi network reject (fee/collateral/witness/...).
 */
export async function submitTx(
  signedTxCborHex: string,
  network: 0 | 1 | 2,
  blockfrostKey: string,
): Promise<string> {
  if (!blockfrostKey) {
    throw new Error('Thiếu BLOCKFROST_KEY trong cấu hình (.env)');
  }
  const bytes = hexToBytes(signedTxCborHex);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${baseUrlFor(network)}/tx/submit`, {
      method: 'POST',
      headers: { project_id: blockfrostKey, 'Content-Type': 'application/cbor' },
      body: bytes.buffer as ArrayBuffer,
      signal: controller.signal,
    });
  } catch (e) {
    throw new Error(`Lỗi mạng khi submit tx qua Blockfrost: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Blockfrost submit lỗi HTTP ${res.status}: ${text}`);
  }
  // Blockfrost trả tx hash dạng JSON string có ngoặc kép, vd "abcd1234...".
  const txHash = text.trim().replace(/^"|"$/g, '');
  if (!txHash) {
    throw new Error('Blockfrost submit trả rỗng — không rõ tx hash');
  }
  return txHash;
}

/**
 * Evaluate-rồi-submit (preflight fail-fast, xem module-doc). Ném lỗi ở bước
 * evaluate nếu script thất bại — KHÔNG submit tx chắc-chắn-fail để tránh mất
 * phí+collateral vô ích.
 */
export async function evaluateThenSubmit(
  signedTxCborHex: string,
  network: 0 | 1 | 2,
  blockfrostKey: string,
): Promise<string> {
  await evaluateTx(signedTxCborHex, network, blockfrostKey);
  return submitTx(signedTxCborHex, network, blockfrostKey);
}
