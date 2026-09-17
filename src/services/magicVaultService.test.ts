/**
 * Bài kiểm `magicVaultService.ts`. Hai nhóm:
 *   · `parseVaultResponse` — THUẦN, dựng fixture tay theo đúng hình dạng thật của
 *     `VaultReadAPI` (README §3 + `service.ts` `toJsonBody`), không mock mạng.
 *   · `fetchMagicVaultBalance` — mock `getMagicVaultConfig` (module cấu hình) +
 *     `global.fetch`, kiểm BA trạng thái không được gộp: chưa cấu hình / lỗi mạng /
 *     có dữ liệu — và trong "có dữ liệu" thì `available` phải khác `accrued`.
 */

// Factory tường minh — KHÔNG dùng automock trơ (`jest.mock('../config/magicVault')`
// không factory). Automock vẫn phải NẠP module thật một lần để soi hình dạng, mà
// module thật `import … from '@env'` — phụ thuộc babel-plugin dotenv biến đổi lúc
// transform; factory ở đây né hẳn câu hỏi "module đó nạp có an toàn trong Jest
// không", vì Jest không bao giờ chạm bản thật.
jest.mock('../config/magicVault', () => ({ getMagicVaultConfig: jest.fn() }));

import { getMagicVaultConfig } from '../config/magicVault';
import {
  fetchMagicVaultBalance,
  parseVaultResponse,
  MagicVaultShapeError,
} from './magicVaultService';

const mockGetConfig = getMagicVaultConfig as jest.Mock;
const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

const VALID_PKH = '2e5e1418afd402e48232b143876104cac6188a44b867ffb7538318f4';
const VALID_CONFIG = { baseUrl: 'https://vault-read.example.test', ownerPkh: VALID_PKH, apiToken: '' };

beforeEach(() => {
  mockFetch.mockReset();
  mockGetConfig.mockReset();
});

/** Batch mẫu — ba lô CỐ Ý mang số khác nhau đôi một, để một phép kiểm "xanh" không
 *  xanh nhầm ở ca lẫn `available` với `accrued` hay quên cộng dồn nhiều vault. */
function rawBatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    batch_id: 'b'.repeat(64),
    source: 'Schedule',
    created_epoch: 20700,
    decay_window: 1,
    expires_at_epoch: 20701,
    initial_amount_nanogic: '8000000',
    current_amount_nanogic: '8000000',
    live: true,
    contract_id: null,
    ...overrides,
  };
}

function rawVault(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    utxo_ref: 'e5fd34b1…#0',
    vault_address: 'addr_test1w…',
    vault_id_unit: '76a5aaa6…f181a6',
    owner_pkh: VALID_PKH,
    available_nanogic: '64000000',
    accrued_nanogic: '64000000',
    expired_nanogic: '0',
    consumed_credit_nanogic: '0',
    lamp_balance_oildrop: '1001000000',
    lamp_locked_oildrop: '2000000',
    profile: 'Flame',
    last_updated_epoch: 20700,
    rate_locked_q: '8000000000',
    batches: [rawBatch()],
    gen_schedules: [],
    ...overrides,
  };
}

function rawResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    network: 'Preprod',
    owner_pkh: VALID_PKH,
    at_epoch: 20700,
    at_epoch_source: 'chain_tip',
    chain_tip: { block_height: 1, block_hash: 'aa', block_time_posix_ms: '1' },
    scopes_read: [],
    vaults: [rawVault()],
    // Ba con số PIN khác nhau đôi một — bắt được cả hai đột biến "dùng nhầm accrued"
    // và "quên trừ để ra expired".
    totals: { available_nanogic: '975', accrued_nanogic: '2986', expired_nanogic: '2011', vault_count: 1 },
    ignored: [],
    ...overrides,
  };
}

describe('parseVaultResponse — hình dạng thật của VaultReadAPI', () => {
  it('chọn ĐÚNG available_nanogic, KHÔNG lẫn với accrued_nanogic', () => {
    const data = parseVaultResponse(rawResponse());
    expect(data.availableNanogic).toBe(975n);
    expect(data.accruedNanogic).toBe(2986n);
    expect(data.expiredNanogic).toBe(2011n);
  });

  it('gộp batches của mọi vault, giữ nguyên source từng lô', () => {
    const resp = rawResponse({
      vaults: [
        rawVault({ batches: [rawBatch({ batch_id: 'a'.repeat(64), source: 'Instant' })] }),
        rawVault({ batches: [rawBatch({ batch_id: 'c'.repeat(64), source: 'Schedule' })] }),
      ],
    });
    const data = parseVaultResponse(resp);
    expect(data.batches).toHaveLength(2);
    expect(data.batches.map(b => b.source).sort()).toEqual(['Instant', 'Schedule']);
  });

  it('chủ CHƯA có vault (200, vaults: []) ⇒ số dư 0 HỢP LỆ, không phải lỗi', () => {
    const data = parseVaultResponse(rawResponse({ vaults: [], totals: { available_nanogic: '0', accrued_nanogic: '0', expired_nanogic: '0', vault_count: 0 } }));
    expect(data.availableNanogic).toBe(0n);
    expect(data.vaultCount).toBe(0);
    expect(data.batches).toEqual([]);
  });

  it('available_nanogic là SỐ (không phải chuỗi) ⇒ ném MagicVaultShapeError, không lặng lẽ đọc là 0', () => {
    const resp = rawResponse({ totals: { available_nanogic: 975, accrued_nanogic: '2986', expired_nanogic: '2011', vault_count: 1 } });
    expect(() => parseVaultResponse(resp)).toThrow(MagicVaultShapeError);
  });

  it('thiếu totals ⇒ ném, không mặc định về vault rỗng', () => {
    const resp = rawResponse();
    delete (resp as Record<string, unknown>).totals;
    expect(() => parseVaultResponse(resp)).toThrow(MagicVaultShapeError);
  });

  it('một batch thiếu expires_at_epoch ⇒ ném (không suy đoán hạn dùng)', () => {
    const resp = rawResponse({ vaults: [rawVault({ batches: [rawBatch({ expires_at_epoch: undefined })] })] });
    expect(() => parseVaultResponse(resp)).toThrow(MagicVaultShapeError);
  });

  it('vượt ngưỡng an toàn Number (2^53) vẫn đọc đúng bằng BigInt', () => {
    const huge = '9007199254740993'; // 2^53 + 1
    const resp = rawResponse({ totals: { available_nanogic: huge, accrued_nanogic: huge, expired_nanogic: '0', vault_count: 1 } });
    expect(parseVaultResponse(resp).availableNanogic).toBe(9007199254740993n);
  });
});

describe('fetchMagicVaultBalance — chưa cấu hình', () => {
  it('config null ⇒ not_configured, KHÔNG gọi mạng', async () => {
    mockGetConfig.mockReturnValue(null);
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('not_configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('fetchMagicVaultBalance — có cấu hình, phân loại lỗi mạng', () => {
  beforeEach(() => mockGetConfig.mockReturnValue(VALID_CONFIG));

  it('200 hợp lệ ⇒ ok, gọi đúng đường /vault/by-owner/{owner_pkh}', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => rawResponse() });
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.availableNanogic).toBe(975n);
    expect(mockFetch).toHaveBeenCalledWith(
      `${VALID_CONFIG.baseUrl}/vault/by-owner/${VALID_CONFIG.ownerPkh}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('502 CHAIN_UNAVAILABLE ⇒ server_error, KHÔNG được đọc thành số dư 0 (README §"đừng gộp hàng 2 với 3")', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: { code: 'CHAIN_UNAVAILABLE', message: 'Không đọc được chuỗi.', details: {} } }),
    });
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('server_error');
      expect(result.error.error_code).toBe('CHAIN_UNAVAILABLE');
    }
  });

  it('401 ⇒ unauthorized (thiếu/sai VAULT_READ_API_TOKEN)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Thiếu hoặc sai thẻ bài.', details: {} } }),
    });
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('unauthorized');
  });

  it('fetch ném TypeError (mất mạng thật) ⇒ network_error', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('network_error');
  });

  it('fetch ném AbortError (quá hạn chờ) ⇒ timeout, KHÔNG phải network_error', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    mockFetch.mockRejectedValue(abortErr);
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('timeout');
  });

  it('thân 200 không phải JSON hợp lệ (trang đăng nhập Wi-Fi chen ngang) ⇒ bad_response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    });
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('bad_response');
  });

  it('thân 200 là JSON hợp lệ nhưng SAI HÌNH DẠNG (thiếu totals) ⇒ bad_response, không đọc thành 0', async () => {
    const broken = rawResponse();
    delete (broken as Record<string, unknown>).totals;
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => broken });
    const result = await fetchMagicVaultBalance();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('bad_response');
  });

  it('có apiToken cấu hình ⇒ gửi header Authorization: Bearer …', async () => {
    mockGetConfig.mockReturnValue({ ...VALID_CONFIG, apiToken: 'tok-abc' });
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => rawResponse() });
    await fetchMagicVaultBalance();
    const [, opts] = mockFetch.mock.calls[0];
    expect((opts.headers as Record<string, string>).Authorization).toBe('Bearer tok-abc');
  });

  it('KHÔNG có apiToken ⇒ KHÔNG gửi header Authorization', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => rawResponse() });
    await fetchMagicVaultBalance();
    const [, opts] = mockFetch.mock.calls[0];
    expect((opts.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
