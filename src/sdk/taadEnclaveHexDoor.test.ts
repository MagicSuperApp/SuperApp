// sdk/taadEnclaveHexDoor.test.ts
//
// CẦU TS CỦA CỬA KÝ HEX — "máy này không có cửa đó" phải KHÁC "ký hỏng".
//
// ══ Vì sao bài này tồn tại, và vì sao nó đến SAU bản vá ═══════════════════════
// Lượt đo đột biến sau khi vá phát hiện một chốt **sống sót**: gỡ hẳn dòng
// `if (!call) return null` khỏi `signWalletRegisterHex` thì TRỌN bộ kiểm vẫn xanh —
// 3624/3624. Nguyên nhân đo được: **17 tệp kiểm `jest.mock` trọn module
// `sdk/taadEnclave`**, nên mã cầu thật chưa từng chạy trong bài kiểm nào. Các bài
// kia canh NƠI GỌI xử `null` ra sao; không bài nào canh cái cầu có TRẢ `null` không.
//
// Cửa ký hex chỉ có từ bản dựng 2026-09-15. Bản đã cài trước đó — gồm bản đang ở
// tay đội thử thực địa — không có nó. Ở đúng những máy ấy, mất dòng `if (!call)`
// biến một lượt dò khuôn êm thành một `TypeError` ném ngược lên màn hình.
//
// Nên bài này gọi cầu THẬT với một `NativeModules` giả, thay vì mock cả cầu.

const HEX_PROOF = JSON.stringify({
  paymentPublicKeyHex: '11'.repeat(32),
  signature: '22'.repeat(64),
});

/** Nạp lại module cầu với đúng bộ phương thức native cho trước. */
function loadBridge(native: Record<string, unknown> | null) {
  let mod!: typeof import('./taadEnclave');
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      NativeModules: native ? { TaadEnclaveModule: native } : {},
      Platform: { OS: 'ios' },
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./taadEnclave');
  });
  return mod;
}

const KEK = '33'.repeat(32);

afterEach(() => {
  jest.resetModules();
  jest.dontMock('react-native');
});

describe('máy KHÔNG có cửa ký hex — bản dựng cũ hơn 2026-09-15', () => {
  const nativeCu = {
    signWalletRegister: jest.fn(async () => HEX_PROOF),
    signEd25519: jest.fn(async () => 'aa'.repeat(64)),
  };

  it('signWalletRegisterHex trả `null`, KHÔNG ném', async () => {
    const taad = loadBridge(nativeCu);
    await expect(taad.signWalletRegisterHex(KEK, 0, '503a000000026162')).resolves.toBeNull();
  });

  it('signEd25519Hex trả `null`, KHÔNG ném', async () => {
    const taad = loadBridge(nativeCu);
    await expect(taad.signEd25519Hex(KEK, '503a000000026162')).resolves.toBeNull();
  });

  it('và cửa CHUỖI trên chính máy đó vẫn chạy bình thường', async () => {
    // Tách hai ca: "máy này thiếu cửa hex" không được đọc thành "máy này hỏng".
    const taad = loadBridge(nativeCu);
    await expect(taad.signEd25519(KEK, 'xin chao')).resolves.toBe('aa'.repeat(64));
  });
});

describe('máy CÓ cửa ký hex', () => {
  it('gọi đúng cửa hex và chuyển thẳng chuỗi hex xuống native', async () => {
    const native = {
      signWalletRegister: jest.fn(async () => HEX_PROOF),
      signWalletRegisterHex: jest.fn(async () => HEX_PROOF),
      signEd25519: jest.fn(async () => 'aa'.repeat(64)),
      signEd25519Hex: jest.fn(async () => 'bb'.repeat(64)),
    };
    const taad = loadBridge(native);

    await expect(taad.signEd25519Hex(KEK, '503a000000026162')).resolves.toBe('bb'.repeat(64));
    expect(native.signEd25519Hex).toHaveBeenCalledWith(KEK, '503a000000026162');

    const proof = await taad.signWalletRegisterHex(KEK, 0, '503a000000026162');
    expect(proof).toEqual({
      paymentPublicKeyHex: '11'.repeat(32),
      signature: '22'.repeat(64),
    });
    expect(native.signWalletRegisterHex).toHaveBeenCalledWith(KEK, 0, '503a000000026162');
  });

  it('native trả JSON thiếu chữ ký ⟹ NÉM, không trả một chứng nhận rỗng', async () => {
    // `null` chỉ được mang MỘT nghĩa: máy này không có cửa. Một phản hồi thiếu
    // trường là máy chủ/native đổi hợp đồng — ca khác hẳn, phải ồn ào.
    const taad = loadBridge({
      signWalletRegister: jest.fn(async () => HEX_PROOF),
      signWalletRegisterHex: jest.fn(async () => JSON.stringify({ paymentPublicKeyHex: 'ab' })),
      signEd25519: jest.fn(async () => 'aa'.repeat(64)),
    });
    await expect(taad.signWalletRegisterHex(KEK, 0, '00')).rejects.toThrow(
      /signWalletRegisterHex/,
    );
  });
});

describe('máy KHÔNG có lõi native nào cả', () => {
  it('cửa hex KHÔNG được trả `null` — đó là ca khác, và nó phải ném', async () => {
    // `null` nghĩa là "máy chạy được, chỉ thiếu đúng cửa này". Máy không có lõi thì
    // mọi cửa đều hỏng, và người dùng phải nhận đúng câu đó chứ không phải một lượt
    // dò khuôn lặng lẽ bỏ qua.
    const taad = loadBridge(null);
    await expect(taad.signWalletRegisterHex(KEK, 0, '00')).rejects.toThrow();
    await expect(taad.signEd25519Hex(KEK, '00')).rejects.toThrow();
  });
});
