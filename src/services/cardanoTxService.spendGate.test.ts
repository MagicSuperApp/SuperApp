/**
 * Khoá cổng xác thực đứng trước việc TIÊU TIỀN.
 *
 * ══ Vì sao cổng này tồn tại ══════════════════════════════════════════════════
 * Khoá gốc ví nằm trong Keychain dưới `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
 * (`TaadEnclaveModule.swift:295`) — không `SecAccessControl`, không `.biometryAny`.
 * `secureLoad` trả khoá ra chỉ với điều kiện MÁY ĐÃ MỞ KHOÁ. Trước bản này, cả
 * đường gửi tiền không có một lần chạm sinh trắc nào.
 *
 * ══ Vì sao phải có bài kiểm, không chỉ có mã ═════════════════════════════════
 * Gỡ cổng ra thì: `tsc` vẫn xanh · không màn nào đổi hình · mọi bài kiểm khác vẫn
 * xanh · và người đầu tiên phát hiện là người đã mất tiền. Đây đúng dạng hỏng mà
 * không kêu, nên nó cần một bài canh riêng.
 *
 * ══ Hai tầng, và vì sao KHÔNG bỏ tầng nào ═══════════════════════════════════
 * §A đọc NGUỒN — canh THỨ TỰ hai lời gọi. Bài chạy thật không phân biệt được
 * "ký trước khi dựng" với "ký sau khi dựng nhưng trước khi gửi", mà thứ tự đó là
 * cả ý nghĩa của cổng.
 * §B chạy THẬT — canh HÀNH VI khi người dùng huỷ. Bài đọc nguồn không phân biệt
 * được `await signRaw(...)` với `try { await signRaw(...) } catch {}`, và bản
 * thứ hai là một cổng đã chết mang nguyên hình dạng của cổng còn sống.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, 'cardanoTxService.ts'), 'utf8');

/** Vị trí xuất hiện đầu tiên; -1 nếu không có. Dùng để so THỨ TỰ. */
const at = (needle: string): number => SRC.indexOf(needle);

describe('A — cổng đứng ĐÚNG CHỖ trong nguồn', () => {
  it('cổng ký đứng TRƯỚC bước dựng+ký CBOR', () => {
    const gate = at('await requireUserPresence(');
    const signCbor = at('await taad.buildSignedTransfer(');
    expect(gate).toBeGreaterThan(-1);
    expect(signCbor).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(signCbor);
  });

  it('cổng đứng SAU khi đã có dữ liệu để hiện cho người duyệt', () => {
    // Hỏi trước khi biết mình duyệt cái gì là cổng dạy người ta bấm qua cho xong.
    const fetchUtxo = at('await fetchWalletUtxosAndParams(');
    const gate = at('await requireUserPresence(');
    expect(fetchUtxo).toBeGreaterThan(-1);
    expect(fetchUtxo).toBeLessThan(gate);
  });

  it('ký ĐÚNG nội dung lần chuyển này, không ký một hằng số', () => {
    // Ký hằng số thì một lần duyệt dùng lại được cho lần chuyển khác — cổng vẫn
    // bật hộp thoại, nhưng nó không còn buộc hộp thoại vào giao dịch nào cả.
    const sig = SRC.slice(at('await requireUserPresence('), at('await requireUserPresence(') + 400);
    expect(sig).toContain('GATE_PREFIX.spend');
    expect(sig).toContain('params.toAddress');
    expect(sig).toContain('params.amountLovelace');
  });

  it('tiền tố miền RIÊNG, không mượn tiền tố của cổng khác', () => {
    // Tiền tố sống ở `sensitiveActionGate.ts` — đọc ở đó, vì đó mới là nơi đặt ra
    // nó. Đọc bản chép trong tệp này thì bài kiểm canh một bản sao.
    const GATE = fs.readFileSync(path.join(__dirname, 'sensitiveActionGate.ts'), 'utf8');
    expect(GATE).toContain("spend: 'PHOENIXKEY_SPEND:'");
    // Mượn `PHOENIXKEY_AUTHORIZE:` thì một chữ ký lấy ở cổng thêm-máy dùng lại
    // được cho một lệnh chuyển tiền.
    expect(GATE).not.toContain("spend: 'PHOENIXKEY_AUTHORIZE:'");
    // Mỗi thao tác một tiền tố: trùng nhau là một lần duyệt dùng được cho việc khác.
    const prefixes = [...GATE.matchAll(/'(PHOENIXKEY_[A-Z_]+:)'/g)].map((m) => m[1]);
    expect(prefixes.length).toBeGreaterThan(1);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe('B — HÀNH VI khi người dùng không qua được cổng', () => {
  const OK_ADDR = 'addr_test1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

  const nap = () => {
    jest.resetModules();

    const buildSignedTransfer = jest.fn().mockResolvedValue('cbor-gia');
    const signRaw = jest.fn();

    jest.doMock('../sdk/taadEnclave', () => ({
      __esModule: true,
      default: {
        deriveWalletAddress: jest.fn().mockResolvedValue(OK_ADDR),
        buildSignedTransfer,
      },
    }));
    jest.doMock('../sdk/phoenixKey', () => ({
      __esModule: true,
      currentUserDid: jest.fn().mockResolvedValue('did:taad:abc'),
      signRaw,
    }));
    const txSubmit = jest.fn().mockResolvedValue({ cardanoTxHash: 'hash-gia' });
    jest.doMock('./phoenixKey-api', () => ({
      __esModule: true,
      phoenixKeyApi: { wallet: { txSubmit } },
      baseURL: 'https://x.test',
      PhoenixKeyApiError: class extends Error {},
      remintSessionOnce: jest.fn(),
    }));

    return { buildSignedTransfer, signRaw, txSubmit };
  };

  /**
   * Bơm UTXO + params, vì bước đó đứng TRƯỚC cổng và phải qua được.
   *
   * Giữ ĐÚNG hình `{ code: 1000, result }` mà `rawGet` đòi (`cardanoTxService.ts:231`).
   * Nới hình ở đây — trả thẳng mảng, hay bỏ `code` — là làm mock LỎNG hơn thật,
   * và lúc đó bài §B xanh vì một lý do không liên quan gì tới cổng.
   */
  const gaFetch = () => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 1000, message: 'OK', result: [] }),
      headers: { get: () => 'application/json' },
    });
  };

  const thamSo = {
    kekHex: 'ab'.repeat(32),
    account: 0,
    toAddress: OK_ADDR,
    amountLovelace: '1500000',
    network: 0 as const,
  };

  afterEach(() => { jest.restoreAllMocks(); });

  it('người dùng HUỶ ⟹ ném ra ngoài, và KHÔNG ký CBOR, KHÔNG gửi', async () => {
    const { buildSignedTransfer, signRaw, txSubmit } = nap();
    gaFetch();
    signRaw.mockRejectedValue(new Error('Người dùng đã huỷ'));

    const { sendCardano } = require('./cardanoTxService');
    await expect(sendCardano(thamSo)).rejects.toThrow('Người dùng đã huỷ');

    // Đây là phép đo thật của cổng: không phải "có gọi signRaw không", mà
    // "signRaw trượt thì tiền có đi không".
    expect(buildSignedTransfer).not.toHaveBeenCalled();
    expect(txSubmit).not.toHaveBeenCalled();
  });

  it('ĐỐI CHỨNG — qua cổng thì đi tiếp bình thường', async () => {
    const { buildSignedTransfer, signRaw, txSubmit } = nap();
    gaFetch();
    signRaw.mockResolvedValue('chu-ky-gia');

    const { sendCardano } = require('./cardanoTxService');
    const res = await sendCardano(thamSo);

    expect(res.txHash).toBe('hash-gia');
    expect(signRaw).toHaveBeenCalledTimes(1);
    expect(buildSignedTransfer).toHaveBeenCalledTimes(1);
    expect(txSubmit).toHaveBeenCalledTimes(1);
  });
});
