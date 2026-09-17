/**
 * Khoá cổng MẠNG đứng trước mọi đường ký giao dịch.
 *
 * ══ Vì sao cổng này tồn tại ══════════════════════════════════════════════════
 * `ALLOWED_SIGN_NETWORKS` chặn mainnet, nhưng trước bản này **chỉ đường
 * `did_payment` hỏi nó** (`phoenixWallet.ts`, chỗ `assertNetworkAllowed`). Hai
 * đường tiêu tiền còn lại — `cardanoTxService.sendCardano` và
 * `stakingService.delegateToPool` — nhận số mạng, ép `=== 1 ? 1 : 0`, rồi ký.
 * Đặt `CARDANO_NETWORK=1` thì `did_payment` bị chặn đúng như tài liệu hứa, còn
 * hai đường kia gửi tiền thật.
 *
 * ══ Vì sao phải có bài kiểm, không chỉ có mã ═════════════════════════════════
 * Gỡ cổng ra thì `tsc` xanh, không màn nào đổi hình, và không bài kiểm nào đỏ —
 * vì hôm nay `CARDANO_NETWORK` mặc định 0, nên KHÔNG CÓ GÌ để đỏ. Rủi ro do một
 * biến dựng giữ, không do một cổng giữ. Bài này là chỗ biến nó thành cổng.
 *
 * ══ Hai tầng ════════════════════════════════════════════════════════════════
 * §A chạy THẬT cổng — canh hành vi của chính phép hỏi.
 * §B chạy THẬT hai đường tiêu tiền với mạng 1 — canh rằng chúng ném TRƯỚC khi
 * ký và TRƯỚC khi gửi. Bài đọc nguồn không phân biệt được `assert(...)` với
 * `try { assert(...) } catch {}`, mà bản thứ hai là cổng đã chết mang nguyên
 * hình dạng cổng còn sống.
 */

import fs from 'fs';
import path from 'path';

import {
  MAINNET_SIGNING_ALLOWED,
  NetworkNotAllowedError,
  assertSigningNetworkAllowed,
} from './cardanoNetwork';

describe('A — phép hỏi tự nó', () => {
  it('mạng 0 (chuỗi thử) đi qua', () => {
    expect(() => assertSigningNetworkAllowed(0)).not.toThrow();
  });

  it('mạng 1 (tiền thật) bị từ chối khi chưa mở', () => {
    // Nếu ai đó đổi hằng thành true thì bài này phải đổi cùng — cố ý buộc vào
    // hằng, để việc mở mainnet không lặng lẽ đi qua một bài kiểm cũ.
    expect(MAINNET_SIGNING_ALLOWED).toBe(false);
    expect(() => assertSigningNetworkAllowed(1)).toThrow(NetworkNotAllowedError);
    expect(() => assertSigningNetworkAllowed(1)).toThrow(/Mainnet/i);
  });

  it('giá trị KHÔNG phải 0 hay 1 bị từ chối, không lặng lẽ thành 0', () => {
    // Hai đường gọi từng ép `=== 1 ? 1 : 0`: một số rác thành "chuỗi thử" mà
    // không ai biết. Đúng chiều, nhưng nó biến vô nghĩa thành hợp lệ.
    for (const rac of [-1, 2, 7, NaN, 1.5]) {
      expect(() => assertSigningNetworkAllowed(rac)).toThrow(NetworkNotAllowedError);
    }
  });

  it('danh sách theo TÊN mạng dẫn từ cùng một hằng, không phải bản chép thứ hai', () => {
    // Hai không gian khoá (tên · số 0/1) là thật; hai sự thật thì không.
    const SRC = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'phoenixWallet.ts'),
      'utf8',
    );
    expect(SRC).toContain('MAINNET_SIGNING_ALLOWED');
    // Danh sách gõ cứng trở lại là lúc hai bên bắt đầu trôi khỏi nhau.
    expect(SRC).not.toMatch(/new Set<CardanoNetwork>\(\[\s*'preprod'/);
  });
});

describe('B — hai đường tiêu tiền ném TRƯỚC khi ký', () => {
  const OK_ADDR = 'addr_test1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

  /**
   * Bơm mock giống §B của `cardanoTxService.spendGate.test.ts`: mọi bước SAU
   * cổng đều trả thành công. Nới chỗ nào trong đây là làm bài xanh vì một lý do
   * không liên quan tới cổng.
   */
  const nap = () => {
    jest.resetModules();

    const buildSignedTransfer = jest.fn().mockResolvedValue('cbor-gia');
    const buildStakeDelegation = jest.fn().mockResolvedValue('cbor-gia');
    const deriveWalletAddress = jest.fn().mockResolvedValue(OK_ADDR);
    const requireUserPresence = jest.fn().mockResolvedValue(undefined);
    const txSubmit = jest.fn().mockResolvedValue({ cardanoTxHash: 'hash-gia' });

    jest.doMock('../sdk/taadEnclave', () => ({
      __esModule: true,
      default: { deriveWalletAddress, buildSignedTransfer, buildStakeDelegation },
    }));
    jest.doMock('../sdk/phoenixKey', () => ({
      __esModule: true,
      currentUserDid: jest.fn().mockResolvedValue('did:taad:abc'),
      signRaw: jest.fn().mockResolvedValue('sig-gia'),
    }));
    jest.doMock('../services/sensitiveActionGate', () => ({
      __esModule: true,
      GATE_PREFIX: { spend: 'PHOENIXKEY_SPEND:', delegate: 'PHOENIXKEY_DELEGATE:' },
      requireUserPresence,
    }));
    jest.doMock('../services/phoenixKey-api', () => ({
      __esModule: true,
      phoenixKeyApi: { wallet: { txSubmit }, pools: { get: jest.fn() } },
      baseURL: 'https://x.test',
      PhoenixKeyApiError: class extends Error {},
      remintSessionOnce: jest.fn(),
    }));

    (global as unknown as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 1000, message: 'OK', result: [] }),
      headers: { get: () => 'application/json' },
    });

    return { buildSignedTransfer, buildStakeDelegation, txSubmit, requireUserPresence };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sendCardano mạng 1 ⟹ ném, KHÔNG ký, KHÔNG gửi, KHÔNG hỏi sinh trắc', async () => {
    const { buildSignedTransfer, txSubmit, requireUserPresence } = nap();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendCardano } = require('../services/cardanoTxService');

    await expect(
      sendCardano({
        kekHex: 'ab'.repeat(32),
        account: 0,
        toAddress: OK_ADDR,
        amountLovelace: '1500000',
        network: 1,
      }),
    ).rejects.toThrow(/Mainnet/i);

    expect(buildSignedTransfer).not.toHaveBeenCalled();
    expect(txSubmit).not.toHaveBeenCalled();
    // Cổng mạng đứng TRƯỚC cổng sinh trắc: hỏi vân tay cho một đường bị khoá là
    // dạy người dùng rằng lần duyệt của họ có ý nghĩa.
    expect(requireUserPresence).not.toHaveBeenCalled();
  });

  it('sendCardano mạng 0 ⟹ vẫn đi tới bước ký (cổng không chặn cả hai cực)', async () => {
    // Ca đối chứng. Thiếu nó thì một cổng ném-mọi-lúc cũng làm bài trên xanh.
    const { buildSignedTransfer, txSubmit } = nap();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendCardano } = require('../services/cardanoTxService');

    await sendCardano({
      kekHex: 'ab'.repeat(32),
      account: 0,
      toAddress: OK_ADDR,
      amountLovelace: '1500000',
      network: 0,
    });

    expect(buildSignedTransfer).toHaveBeenCalledTimes(1);
    expect(txSubmit).toHaveBeenCalledTimes(1);
  });

  it('delegateToPool mạng 1 ⟹ ném, KHÔNG dựng cert, KHÔNG gửi', async () => {
    const { buildStakeDelegation, txSubmit, requireUserPresence } = nap();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { delegateToPool } = require('../services/stakingService');

    await expect(
      delegateToPool({
        kekHex: 'ab'.repeat(32),
        account: 0,
        poolBech32: 'pool1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        network: 1,
      }),
    ).rejects.toThrow(/Mainnet/i);

    expect(buildStakeDelegation).not.toHaveBeenCalled();
    expect(txSubmit).not.toHaveBeenCalled();
    expect(requireUserPresence).not.toHaveBeenCalled();
  });
});
