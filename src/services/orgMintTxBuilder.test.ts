import type taad from '../sdk/taadEnclave';
import {
  makeBuildAndSignMintTx,
  missingChainInputs,
  OrgMintChainNotConfiguredError,
  ORG_MINT_CHAIN_FIELDS,
  type OrgMintChainInputs,
  type OrgMintTxDeps,
} from './orgMintTxBuilder';

jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    buildMintLampViaDid: jest.fn(async () => 'KHONG-DUOC-GOI'),
  },
}));

const CHAIN: OrgMintChainInputs = {
  registryUtxoJson: '{"tx_hash":"aa","index":0,"inline_datum_hex":"d8799f"}',
  tokenTagHex: '4c414d50746167',
  supplyStateUtxoJson: '{"tx_hash":"bb","index":1,"inline_datum_hex":"d8799f"}',
  supplyStateScriptCbor: '590123',
  khoUtxoJson: '{"tx_hash":"cc","index":2,"address":"addr_test1kho"}',
  lampPolicyCborHex: '590456',
};

const deps = (over: Partial<OrgMintTxDeps> = {}): OrgMintTxDeps => ({
  chain: CHAIN,
  network: 0,
  resolveAuthorityKeks: jest.fn(async () => ['a'.repeat(64)]),
  resolveWallet: jest.fn(async () => ({
    utxosJson: '[]',
    protocolParamsJson: '{}',
    walletSeedHex: 'b'.repeat(64),
  })),
  resolveTipSlot: jest.fn(async () => 123_456),
  resolveMint: jest.fn(async () => ({ tokenNameHex: '4c414d50', amount: '1000' })),
  buildMint: jest.fn(async () => 'CBOR_HEX'),
  ...over,
});

describe('missingChainInputs — thiếu cái gì phải gọi tên được cái đó', () => {
  it('null ⟹ thiếu cả sáu', () => {
    expect(missingChainInputs(null)).toEqual([...ORG_MINT_CHAIN_FIELDS]);
  });

  it('đủ sáu ⟹ rỗng', () => {
    expect(missingChainInputs(CHAIN)).toEqual([]);
  });

  it('chuỗi rỗng và chuỗi toàn khoảng trắng đều tính là THIẾU', () => {
    expect(missingChainInputs({ ...CHAIN, tokenTagHex: '' })).toEqual(['tokenTagHex']);
    expect(missingChainInputs({ ...CHAIN, khoUtxoJson: '   ' })).toEqual(['khoUtxoJson']);
  });

  it('giữ đúng thứ tự đã khai, không phụ thuộc thứ tự khoá của object', () => {
    const scrambled = {
      lampPolicyCborHex: '',
      registryUtxoJson: '',
      khoUtxoJson: '',
    } as Partial<OrgMintChainInputs>;
    expect(missingChainInputs(scrambled)).toEqual([
      'registryUtxoJson',
      'tokenTagHex',
      'supplyStateUtxoJson',
      'supplyStateScriptCbor',
      'khoUtxoJson',
      'lampPolicyCborHex',
    ]);
  });
});

describe('makeBuildAndSignMintTx — chưa đủ dữ liệu thì báo THIẾU GÌ', () => {
  it('thiếu dữ liệu chuỗi ⟹ ném lỗi nêu tên, KHÔNG gọi native', async () => {
    const d = deps({ chain: null });
    const fn = makeBuildAndSignMintTx(d);
    await expect(fn({ orgDid: 'did:org:1', requestId: 'r1' })).rejects.toBeInstanceOf(
      OrgMintChainNotConfiguredError,
    );
    expect(d.buildMint).not.toHaveBeenCalled();
    expect(d.resolveWallet).not.toHaveBeenCalled();
  });

  it('thông điệp lỗi nêu đúng phần còn thiếu, không nêu phần đã có', async () => {
    const fn = makeBuildAndSignMintTx(deps({ chain: { ...CHAIN, khoUtxoJson: '' } }));
    await expect(fn({ orgDid: 'd', requestId: 'r' })).rejects.toThrow(/KHO Distribution/);
    await expect(fn({ orgDid: 'd', requestId: 'r' })).rejects.not.toThrow(/Registry/);
  });
});

describe('makeBuildAndSignMintTx — đủ dữ liệu thì gọi native đúng hình', () => {
  it('trả CBOR native trả về', async () => {
    const fn = makeBuildAndSignMintTx(deps());
    await expect(fn({ orgDid: 'did:org:1', requestId: 'r1' })).resolves.toEqual({
      signedTxCbor: 'CBOR_HEX',
    });
  });

  it('mintJson dùng snake_case và amount là CHUỖI (oil vượt 2^53)', async () => {
    const buildMint: jest.MockedFunction<typeof taad.buildMintLampViaDid> = jest.fn(
      async (_args: Parameters<typeof taad.buildMintLampViaDid>[0]) => 'X',
    );
    const fn = makeBuildAndSignMintTx(
      deps({
        buildMint,
        resolveMint: jest.fn(async () => ({
          tokenNameHex: '4c414d50',
          amount: '26370000000000001',
        })),
      }),
    );
    await fn({ orgDid: 'd', requestId: 'r' });
    const arg = buildMint.mock.calls[0][0];
    expect(JSON.parse(arg.mintJson)).toEqual({
      token_name_hex: '4c414d50',
      amount: '26370000000000001',
    });
    // Chuỗi phải sống nguyên vẹn qua JSON — đây chính là chỗ number sẽ hỏng.
    expect(arg.mintJson).toContain('"26370000000000001"');
  });

  it('chuyển đủ 6 dữ-kiện chuỗi + slot + network xuống native', async () => {
    const buildMint: jest.MockedFunction<typeof taad.buildMintLampViaDid> = jest.fn(
      async (_args: Parameters<typeof taad.buildMintLampViaDid>[0]) => 'X',
    );
    const fn = makeBuildAndSignMintTx(deps({ buildMint, network: 1 }));
    await fn({ orgDid: 'd', requestId: 'r' });
    expect(buildMint.mock.calls[0][0]).toMatchObject({
      ...CHAIN,
      network: 1,
      currentSlot: 123_456,
      authorityKeksHex: ['a'.repeat(64)],
    });
  });

  it('không có khoá authority ⟹ ném, KHÔNG gọi native', async () => {
    const buildMint: jest.MockedFunction<typeof taad.buildMintLampViaDid> = jest.fn(
      async (_args: Parameters<typeof taad.buildMintLampViaDid>[0]) => 'X',
    );
    const fn = makeBuildAndSignMintTx(
      deps({ buildMint, resolveAuthorityKeks: jest.fn(async () => []) }),
    );
    await expect(fn({ orgDid: 'd', requestId: 'r' })).rejects.toThrow(/mở khoá/);
    expect(buildMint).not.toHaveBeenCalled();
  });

  it('số LAMP 0 hoặc không phải số ⟹ ném trước khi chạm native', async () => {
    for (const amount of ['0', '', '12.5', '-3', '1e3']) {
      const buildMint: jest.MockedFunction<typeof taad.buildMintLampViaDid> = jest.fn(
      async (_args: Parameters<typeof taad.buildMintLampViaDid>[0]) => 'X',
    );
      const fn = makeBuildAndSignMintTx(
        deps({ buildMint, resolveMint: jest.fn(async () => ({ tokenNameHex: 'aa', amount })) }),
      );
      await expect(fn({ orgDid: 'd', requestId: 'r' })).rejects.toThrow(/Số LAMP/);
      expect(buildMint).not.toHaveBeenCalled();
    }
  });
});
