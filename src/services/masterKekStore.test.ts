/**
 * Canh đúng MỘT luật, luật đắt nhất trong kho này:
 *
 *   suy Master_KEK từ cụm 24 từ ≠ ghi Master_KEK vào máy.
 *
 * Ghi đè KEK là thao tác KHÔNG hoàn tác được và không có bản sao: ví Cardano/LAMP
 * của người dùng derive từ đúng nó. Bản trước gộp hai việc vào một hàm và gọi nó
 * NGAY khi cụm từ qua checksum BIP39 — mà "qua checksum" chỉ nói cụm từ đúng dạng,
 * không nói nó là cụm của người đang cầm máy. Người dùng gõ nhầm cụm của ví khác là
 * ví cũ chết, rồi app mới báo "không tìm thấy tài khoản khớp".
 *
 * Nếu ai đó gộp lại lần nữa, test này phải đỏ.
 */

jest.mock('../sdk/taadEnclave', () => ({
  __esModule: true,
  default: {
    isAvailable: jest.fn(() => true),
    mnemonicToMasterKek: jest.fn(),
    secureStore: jest.fn(),
    secureLoad: jest.fn(),
    secureDelete: jest.fn(),
    generateMasterKek: jest.fn(),
  },
}));

import taad from '../sdk/taadEnclave';
import {
  deriveMasterKekFromMnemonic,
  storeMasterKek,
  getStoredMasterKek,
} from './masterKekStore';

const KEK_MOI = 'b'.repeat(64);
const KEK_DANG_CO = 'a'.repeat(64);
const CUM_24_TU = 'abandon '.repeat(23) + 'art';

const m = taad as unknown as {
  mnemonicToMasterKek: jest.Mock;
  secureStore: jest.Mock;
  secureLoad: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  m.mnemonicToMasterKek.mockResolvedValue(KEK_MOI);
  m.secureLoad.mockResolvedValue(KEK_DANG_CO);
});

describe('suy KEK từ cụm 24 từ', () => {
  it('trả đúng KEK suy được', async () => {
    await expect(deriveMasterKekFromMnemonic(CUM_24_TU)).resolves.toBe(KEK_MOI);
    expect(m.mnemonicToMasterKek).toHaveBeenCalledWith(CUM_24_TU);
  });

  it('KHÔNG ghi gì vào máy — đây là luật chính', async () => {
    await deriveMasterKekFromMnemonic(CUM_24_TU);
    expect(m.secureStore).not.toHaveBeenCalled();
  });

  it('ví đang có trên máy còn nguyên sau khi suy', async () => {
    await deriveMasterKekFromMnemonic(CUM_24_TU);
    await expect(getStoredMasterKek()).resolves.toBe(KEK_DANG_CO);
  });

  it('cụm từ sai thì ném, và vẫn không ghi gì', async () => {
    m.mnemonicToMasterKek.mockRejectedValue(new Error('E_MNEMONIC_INVALID'));
    await expect(deriveMasterKekFromMnemonic('sai bét')).rejects.toThrow();
    expect(m.secureStore).not.toHaveBeenCalled();
  });
});

describe('ghi KEK', () => {
  it('chỉ `storeMasterKek` mới được chạm vào kho khoá', async () => {
    await storeMasterKek(KEK_MOI);
    expect(m.secureStore).toHaveBeenCalledTimes(1);
    expect(m.secureStore).toHaveBeenCalledWith('taad_master_kek_v1', KEK_MOI);
  });
});

describe('trình tự bắt buộc của màn Khôi phục', () => {
  /**
   * Diễn lại đúng thứ tự `RestoreIdentityScreen` chạy khi cụm 24 từ KHÔNG khớp
   * tài khoản nào: suy → đối chiếu hỏng → thoát. Ví cũ phải còn nguyên.
   */
  it('đối chiếu hỏng ⇒ ví cũ còn nguyên', async () => {
    const kek = await deriveMasterKekFromMnemonic(CUM_24_TU);
    const dangCo = await getStoredMasterKek();
    const mayDaCoVi = dangCo != null && dangCo !== kek;
    expect(mayDaCoVi).toBe(true);

    const khopDuocDid = false; // máy chủ trả 403/404 cho mọi DID ứng viên
    if (mayDaCoVi && khopDuocDid) await storeMasterKek(kek);

    expect(m.secureStore).not.toHaveBeenCalled();
  });

  it('đối chiếu khớp ⇒ mới được ghi đè', async () => {
    const kek = await deriveMasterKekFromMnemonic(CUM_24_TU);
    const dangCo = await getStoredMasterKek();
    const mayDaCoVi = dangCo != null && dangCo !== kek;

    const khopDuocDid = true; // recoverDevice trả 200/409
    if (mayDaCoVi && khopDuocDid) await storeMasterKek(kek);

    expect(m.secureStore).toHaveBeenCalledWith('taad_master_kek_v1', KEK_MOI);
  });

  it('máy chưa có ví ⇒ ghi ngay, không phải chờ đối chiếu', async () => {
    m.secureLoad.mockResolvedValue(null);
    const kek = await deriveMasterKekFromMnemonic(CUM_24_TU);
    const dangCo = await getStoredMasterKek();
    const mayDaCoVi = dangCo != null && dangCo !== kek;
    expect(mayDaCoVi).toBe(false);

    if (!mayDaCoVi) await storeMasterKek(kek);
    expect(m.secureStore).toHaveBeenCalledWith('taad_master_kek_v1', KEK_MOI);
  });
});
