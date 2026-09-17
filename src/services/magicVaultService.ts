/**
 * services/magicVaultService.ts — lớp ĐỌC-THÔI số dư MAGIC, nói chuyện với
 * `VaultReadAPI` (nhà MAGIC) qua `GET /vault/by-owner/{owner_pkh}`.
 *
 * Hợp đồng lấy nguyên từ mã nguồn thật của nhà MAGIC (không phải suy từ mô tả tóm
 * tắt): `MagicLampEco/MAGIC/VaultReadAPI/src/{service,vaultView,http,errors}.ts` +
 * `VaultReadAPI/README.md §3` (đọc 2026-09-17). Vài điểm dễ đọc nhầm nếu chỉ theo mô
 * tả rút gọn của thư inbox:
 *
 *   · Máy chủ trả `200` NGAY CẢ KHI chủ đó chưa có vault nào (`vaults: []`,
 *     `totals.vault_count: 0`). KHÔNG PHẢI `404`.
 *   · Mọi trường tiền (`available_nanogic`, `accrued_nanogic`, …) là CHUỖI chữ số,
 *     không phải số JSON — oildrop/nanogic có thể vượt ngưỡng an toàn 2^53 của
 *     IEEE-754, và Number() ở ngưỡng đó KHÔNG lỗi, nó LÀM TRÒN. Phải parse bằng
 *     `BigInt`, tuyệt đối không qua `Number`/`parseInt`.
 *   · `expires_at_epoch` của một batch là EPOCH GIAO THỨC (số nguyên đếm ngày kể từ
 *     Unix epoch, không trừ genesis — xem `utils/magicVaultFormat.ts`), KHÔNG phải
 *     giây/mili-giây Unix. Quy đổi sang giờ VN nằm ở tệp đó, không lặp lại ở đây.
 *   · "Không đọc được chuỗi" (`502 CHAIN_UNAVAILABLE`, `502
 *     VAULT_DATUM_UNDECODABLE`) và "chủ này không có vault" (`200`, `vaults: []`)
 *     là HAI trạng thái khác hẳn nhau — README của VaultReadAPI dặn thẳng "đừng gộp
 *     hàng 2 với hàng 3": gộp lại là dựng lại đúng con số 0 giả mà backend cũ vẫn
 *     trả cứng. Tệp này giữ chúng tách: ca đầu ném lỗi (`type: 'server_error'`), ca
 *     sau trả về số dư 0 hợp lệ.
 */

import { getMagicVaultConfig } from '../config/magicVault';

// ---------------------------------------------------------------------------
// Types — hình dạng ĐÃ PHÂN TÍCH (không phải JSON thô trên dây)
// ---------------------------------------------------------------------------

/**
 * Nguồn của một lô MAGIC. Giữ kiểu `string` (không phải union đóng) vì máy chủ có
 * thể thêm nguồn mới mà bên đọc chưa biết — ép union đóng thì một lô nguồn lạ làm
 * NÉM cả màn hình, trong khi đúng ra chỉ cần UI của riêng lô đó hiện nhãn chung
 * chung. UI vẫn phân biệt được `'Instant'`/`'Schedule'` bằng so sánh chuỗi.
 */
export type MagicBatchSource = string;

export interface MagicVaultBatch {
  batchId: string;
  source: MagicBatchSource;
  createdEpoch: number;
  decayWindow: number;
  /** Epoch GIAO THỨC — quy đổi sang giờ VN bằng `expiresAtEpochToVnMoment`. */
  expiresAtEpoch: number;
  initialAmountNanogic: bigint;
  currentAmountNanogic: bigint;
  /** Còn sống tại `atEpoch` mà máy chủ dùng để tính — đã tính sẵn phía máy chủ. */
  live: boolean;
  contractId: string | null;
}

export interface MagicVaultBalance {
  /** Σ nanogic CÒN SỐNG — số TIÊU ĐƯỢC. Đây là con số chính màn hình phải hiện. */
  availableNanogic: bigint;
  /**
   * Σ nanogic của MỌI lô còn ghi trong datum, KỂ CẢ ĐÃ HẾT HẠN. TUYỆT ĐỐI không
   * dùng trường này làm "số dư" — xem đầu tệp. Chỉ dùng để hiện dòng phụ "đã sinh
   * trong kỳ".
   */
  accruedNanogic: bigint;
  /** `accrued − available` — đã mất trắng, sẽ bị dọn ở lần tiêu kế tiếp. */
  expiredNanogic: bigint;
  vaultCount: number;
  /** Gộp batch của MỌI vault thuộc owner này — đủ để liệt kê từng lô + hạn dùng. */
  batches: MagicVaultBatch[];
  network: string;
  /** Epoch GIAO THỨC máy chủ dùng để tính — KHÔNG phải epoch Cardano. */
  atEpoch: number;
}

export type MagicVaultErrorType =
  | 'not_configured'
  | 'network_error'
  | 'timeout'
  | 'bad_response'
  | 'unauthorized'
  | 'server_error';

export interface MagicVaultAPIError {
  type: MagicVaultErrorType;
  /** Câu (thường tiếng Việt, đôi khi là câu kỹ thuật của máy chủ) để hiện/ghi log. */
  detail: string;
  http_status: number;
  /** Mã lỗi máy chủ trả (vd `CHAIN_UNAVAILABLE`, `VAULT_IDENTITY_DUPLICATE`) — dùng làm
   *  mã tham chiếu khi câu tiếng Việt không đủ để người dùng tự hành động. */
  error_code?: string;
}

export type MagicVaultResult =
  | { ok: true; data: MagicVaultBalance }
  | { ok: false; error: MagicVaultAPIError };

// ---------------------------------------------------------------------------
// Parse — THUẦN, không mạng. Hình dạng lạ → NÉM, không nuốt về 0/[]/rỗng.
// ---------------------------------------------------------------------------

export class MagicVaultShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MagicVaultShapeError';
  }
}

/** Chuỗi chữ số thập phân → bigint. NÉM nếu không phải chuỗi số nguyên không âm —
 *  đây chính là cổng chặn "im lặng làm tròn qua Number" mà README bên máy chủ dặn. */
function parseNanogicString(raw: unknown, field: string): bigint {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new MagicVaultShapeError(
      `Trường ${field} phải là chuỗi số nguyên (nanogic); nhận được ${JSON.stringify(raw)}.`,
    );
  }
  return BigInt(raw);
}

function parseNumberField(raw: unknown, field: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new MagicVaultShapeError(`Trường ${field} phải là số; nhận được ${JSON.stringify(raw)}.`);
  }
  return raw;
}

function parseBatch(raw: unknown, index: number): MagicVaultBatch {
  if (typeof raw !== 'object' || raw === null) {
    throw new MagicVaultShapeError(`batches[${index}] không phải object.`);
  }
  const b = raw as Record<string, unknown>;
  if (typeof b.batch_id !== 'string') {
    throw new MagicVaultShapeError(`batches[${index}].batch_id thiếu hoặc không phải chuỗi.`);
  }
  if (typeof b.source !== 'string') {
    throw new MagicVaultShapeError(`batches[${index}].source thiếu hoặc không phải chuỗi.`);
  }
  if (typeof b.live !== 'boolean') {
    throw new MagicVaultShapeError(`batches[${index}].live thiếu hoặc không phải boolean.`);
  }
  return {
    batchId: b.batch_id,
    source: b.source,
    createdEpoch: parseNumberField(b.created_epoch, `batches[${index}].created_epoch`),
    decayWindow: parseNumberField(b.decay_window, `batches[${index}].decay_window`),
    expiresAtEpoch: parseNumberField(b.expires_at_epoch, `batches[${index}].expires_at_epoch`),
    initialAmountNanogic: parseNanogicString(b.initial_amount_nanogic, `batches[${index}].initial_amount_nanogic`),
    currentAmountNanogic: parseNanogicString(b.current_amount_nanogic, `batches[${index}].current_amount_nanogic`),
    live: b.live,
    contractId: typeof b.contract_id === 'string' ? b.contract_id : null,
  };
}

/**
 * Thân bài `200` thật của `GET /vault/by-owner/{owner_pkh}` → `MagicVaultBalance`.
 * NÉM `MagicVaultShapeError` ngay khi một trường bắt buộc thiếu hoặc sai kiểu —
 * không có `?? 0` / `?? []` nào ở đây (Forall §Cái vỏ im lặng): một hợp đồng bị lệch
 * phải kêu ngay lúc đọc, không được lặng lẽ biến thành "số dư 0".
 */
export function parseVaultResponse(raw: unknown): MagicVaultBalance {
  if (typeof raw !== 'object' || raw === null) {
    throw new MagicVaultShapeError('Thân phản hồi không phải object.');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.network !== 'string') throw new MagicVaultShapeError('Thiếu trường network.');
  const atEpoch = parseNumberField(r.at_epoch, 'at_epoch');

  const totalsRaw = r.totals;
  if (typeof totalsRaw !== 'object' || totalsRaw === null) {
    throw new MagicVaultShapeError('Thiếu trường totals.');
  }
  const totals = totalsRaw as Record<string, unknown>;
  const availableNanogic = parseNanogicString(totals.available_nanogic, 'totals.available_nanogic');
  const accruedNanogic = parseNanogicString(totals.accrued_nanogic, 'totals.accrued_nanogic');
  const expiredNanogic = parseNanogicString(totals.expired_nanogic, 'totals.expired_nanogic');
  const vaultCount = parseNumberField(totals.vault_count, 'totals.vault_count');

  const vaultsRaw = r.vaults;
  if (!Array.isArray(vaultsRaw)) throw new MagicVaultShapeError('Thiếu mảng vaults.');

  const batches: MagicVaultBatch[] = [];
  vaultsRaw.forEach((v, vIndex) => {
    if (typeof v !== 'object' || v === null) {
      throw new MagicVaultShapeError(`vaults[${vIndex}] không phải object.`);
    }
    const vv = v as Record<string, unknown>;
    const vBatches = vv.batches;
    if (!Array.isArray(vBatches)) {
      throw new MagicVaultShapeError(`vaults[${vIndex}].batches thiếu hoặc không phải mảng.`);
    }
    vBatches.forEach((b, bIndex) => batches.push(parseBatch(b, bIndex)));
  });

  return { availableNanogic, accruedNanogic, expiredNanogic, vaultCount, batches, network: r.network, atEpoch };
}

// ---------------------------------------------------------------------------
// Gọi mạng
// ---------------------------------------------------------------------------

// Khớp mặc định `VAULT_READ_API_TIMEOUT_MS` phía máy chủ (`VaultReadAPI/README.md §6`)
// — cho máy chủ đủ thời gian tự timeout trước khi app timeout hộ nó.
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Đọc số dư MAGIC của `owner_pkh` đã cấu hình. KHÔNG nhận tham số — mặt tiền này
 * (v1) chỉ đọc đúng một `owner_pkh` cấu hình sẵn, khớp giới hạn nhà MAGIC đã nói rõ
 * trong thư 2026-09-17: "Vault bên này mở là vault của ví bên này… Bên này sẽ gửi
 * `owner_pkh` kèm tx trong thư sau." App CHƯA có đường để người dùng tự mở vault của
 * chính mình (`VaultTxAPI` chưa lên HTTP).
 */
export async function fetchMagicVaultBalance(): Promise<MagicVaultResult> {
  const config = getMagicVaultConfig();
  if (!config) {
    return {
      ok: false,
      error: {
        type: 'not_configured',
        detail: 'Chưa cấu hình địa chỉ VaultReadAPI hoặc owner_pkh.',
        http_status: 0,
      },
    };
  }

  const url = `${config.baseUrl}/vault/by-owner/${config.ownerPkh}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.apiToken) headers['Authorization'] = `Bearer ${config.apiToken}`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeoutHandle);

    if (!resp.ok) {
      let code: string | undefined;
      let message: string | undefined;
      try {
        const body = await resp.json();
        // Hình dạng lỗi thật: `{ error: { code, message, details } }` — errors.ts của
        // VaultReadAPI (`VaultReadError.toBody`).
        code = typeof body?.error?.code === 'string' ? body.error.code : undefined;
        message = typeof body?.error?.message === 'string' ? body.error.message : undefined;
      } catch {
        /* thân lỗi không phải JSON — vẫn phân loại được theo mã HTTP */
      }
      return {
        ok: false,
        error: {
          type: resp.status === 401 ? 'unauthorized' : 'server_error',
          detail: message ?? `HTTP ${resp.status}`,
          http_status: resp.status,
          error_code: code,
        },
      };
    }

    const raw: unknown = await resp.json();
    const data = parseVaultResponse(raw);
    return { ok: true, data };
  } catch (err: unknown) {
    clearTimeout(timeoutHandle);

    if (err instanceof MagicVaultShapeError) {
      return { ok: false, error: { type: 'bad_response', detail: err.message, http_status: 0 } };
    }

    // Cùng ba nguyên nhân đã tách ở `treeReIDService.ts` — không gộp lại thành một
    // "mất kết nối mạng" chung chung (Wi-Fi chen trang đăng nhập ≠ hết sóng ≠ quá hạn).
    const isTimeoutErr = err instanceof Error && err.name === 'AbortError';
    const isBodyErr = err instanceof SyntaxError;
    return {
      ok: false,
      error: {
        type: isTimeoutErr ? 'timeout' : isBodyErr ? 'bad_response' : 'network_error',
        detail: String(err),
        http_status: 0,
      },
    };
  }
}
