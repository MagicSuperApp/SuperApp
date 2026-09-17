/**
 * "KHÔNG BIẾT" phải đi được tới màn hình mà không hoá thành "KHÔNG CÓ".
 *
 * Nhà PhoenixKey báo 17/09/2026: `/wallet/{did}/all` trả `magic.available = null`
 * khi máy chủ không xác định được sổ vault. Lượt gọi vẫn `200`, `wallets[]` vẫn
 * đủ — nên KHÔNG có gì đỏ ở đâu cả. Phía app khai `number` rồi đệm `?? 0`, và số
 * `0` đó chảy vào cổng chặn phí ở màn ghi việc đồng, khoá nông dân ra khỏi việc
 * của họ.
 *
 * Phép thử lúc VIẾT từng ca (Forall §Kỷ luật phát ngôn #6): *"đầu vào của ca này
 * có phân biệt được hai bên đột biến không?"* Đột biến ở đây là đặt lại `?? 0`.
 * Ca `available: 0` MỘT MÌNH thì xanh ở cả hai bên — nó không kiểm gì. Nên mỗi
 * luật đều đi theo CẶP `null` ↔ `0`: chỉ cặp đó mới tách được hai bên.
 *
 * Phần cuối đối chiếu VĂN BẢN NGUỒN cho bốn chỗ tiêu thụ. Chúng nằm trong màn
 * React/reducer nên không gọi thẳng được, mà `?? 0` đặt lại ở đó thì không hàm
 * thuần nào thấy — bỏ phần này là để hở đúng chỗ lỗi đã xảy ra.
 */
import fs from 'fs';
import path from 'path';
import {
  summarizeWalletAll,
  shouldBlockMagicSpend,
  userFacingMagicAbsentReason,
  WalletAllResponse,
} from './phoenixKey-api';

/** Thân bài tối thiểu, chỉ khác nhau ở khối `magic` — phần cần đo. */
const walletAll = (magic: WalletAllResponse['magic']): WalletAllResponse => ({
  wallets: [{
    kind: 'phoenix',
    addresses: { fixed: 'addr_test1_fixed' },
    balances: { lovelace: 2_000_000, lamp: 5_000_000, carp: 0 },
  }],
  magic,
});

describe('summarizeWalletAll — ba trạng thái của MAGIC đi qua nguyên vẹn', () => {
  it('máy chủ KHÔNG BIẾT (`null`) ra khỏi hàm vẫn là `null`, không phải 0', () => {
    const s = summarizeWalletAll(walletAll({ source: 'vault', available: null, accrued: null }));
    expect(s.magicAvailable).toBeNull();
    // Nói thẳng cả cực còn lại: đặt `?? 0` lại vào chỗ này thì dòng dưới đỏ.
    expect(s.magicAvailable).not.toBe(0);
    expect(s.magicAccrued).toBeNull();
  });

  it('trường VẮNG MẶT (`undefined`) cũng là "chưa biết" — cùng nghĩa, khác hình dạng', () => {
    const s = summarizeWalletAll(
      walletAll({ source: 'vault' } as unknown as WalletAllResponse['magic']),
    );
    expect(s.magicAvailable).toBeNull();
  });

  it('máy chủ nói rõ KHÔNG CÓ (`0`) vẫn ra `0` — không bị đẩy thành "chưa biết"', () => {
    const s = summarizeWalletAll(walletAll({ source: 'vault', available: 0, accrued: 0 }));
    expect(s.magicAvailable).toBe(0);
    expect(s.magicAvailable).not.toBeNull();
  });

  it('CÓ số thì giữ nguyên số', () => {
    const s = summarizeWalletAll(walletAll({ source: 'vault', available: 42, accrued: 50 }));
    expect(s.magicAvailable).toBe(42);
    expect(s.magicAccrued).toBe(50);
  });

  it('các số dư KHÁC không bị ca này đụng tới', () => {
    // Ca đối chứng: nếu bản vá lỡ tay nới cả ADA/LAMP thành "chưa biết" thì
    // dòng này đỏ. Ba token kia không nằm trong hợp đồng mới của PhoenixKey.
    const s = summarizeWalletAll(walletAll({ source: 'vault', available: null, accrued: null }));
    expect(s.lovelace).toBe(2_000_000);
    expect(s.lamp).toBe(5_000_000);
    expect(s.address).toBe('addr_test1_fixed');
  });

  it('câu của máy chủ đi kèm số dư thiếu, và tới được nơi gọi', () => {
    const s = summarizeWalletAll(walletAll({
      source: 'vault',
      available: null,
      accrued: null,
      magicAbsentReason: 'Sổ vault đang đồng bộ, thử lại sau ít phút.',
    }));
    expect(s.magicAbsentReason).toBe('Sổ vault đang đồng bộ, thử lại sau ít phút.');
  });
});

describe('userFacingMagicAbsentReason — hiện câu của máy chủ, chặn vết gọi hàm', () => {
  it('một câu bình thường thì HIỆN, không thay bằng câu chung chung', () => {
    expect(userFacingMagicAbsentReason('Sổ vault đang đồng bộ, thử lại sau ít phút.'))
      .toBe('Sổ vault đang đồng bộ, thử lại sau ít phút.');
  });

  it('cắt khoảng trắng thừa nhưng giữ nguyên chữ', () => {
    expect(userFacingMagicAbsentReason('  Chưa tới kỳ chốt sổ.  ')).toBe('Chưa tới kỳ chốt sổ.');
  });

  it('traceback nhiều dòng thì KHÔNG hiện — nó chở đường dẫn nội bộ ra ngoài', () => {
    expect(userFacingMagicAbsentReason(
      'Traceback (most recent call last):\n  File "/srv/vault/ledger.py", line 88\nKeyError: did',
    )).toBeNull();
  });

  it('một dòng nhưng mang cú pháp của máy thì cũng KHÔNG hiện', () => {
    expect(userFacingMagicAbsentReason('java.lang.NullPointerException: magic ledger')).toBeNull();
    expect(userFacingMagicAbsentReason('lỗi tại VaultService.java:412')).toBeNull();
    expect(userFacingMagicAbsentReason('không đọc được /var/lib/vault/ledger.db')).toBeNull();
  });

  it('câu quá dài thì KHÔNG hiện — thông báo cho nông dân không dài tới đó', () => {
    expect(userFacingMagicAbsentReason('Sổ vault lỗi. '.repeat(30))).toBeNull();
  });

  it('không có câu nào thì trả `null`, và `null` KHÔNG phải một câu', () => {
    expect(userFacingMagicAbsentReason(undefined)).toBeNull();
    expect(userFacingMagicAbsentReason(null)).toBeNull();
    expect(userFacingMagicAbsentReason('')).toBeNull();
    expect(userFacingMagicAbsentReason('   ')).toBeNull();
    expect(userFacingMagicAbsentReason(0)).toBeNull();
  });
});

describe('shouldBlockMagicSpend — chiều hỏng phải mở, không phải đóng', () => {
  it('CHƯA BIẾT số dư thì KHÔNG chặn', () => {
    // Đây là ca đắt nhất trong tệp: nông dân ngoài đồng bị chặn vì một thứ app
    // không biết. Backend vẫn đối soát phí cuối cùng.
    expect(shouldBlockMagicSpend(null, 5)).toBe(false);
    expect(shouldBlockMagicSpend(undefined, 5)).toBe(false);
  });

  it('máy chủ nói rõ 0 và việc có tính phí thì CHẶN', () => {
    // Cặp với ca trên: `null` mở, `0` chặn. Gộp hai trạng thái làm một thì một
    // trong hai dòng phải đỏ, không có cách nào cho cả hai cùng xanh.
    expect(shouldBlockMagicSpend(0, 5)).toBe(true);
  });

  it('không đủ thì chặn, vừa đủ thì KHÔNG chặn', () => {
    expect(shouldBlockMagicSpend(4, 5)).toBe(true);
    expect(shouldBlockMagicSpend(5, 5)).toBe(false);
    expect(shouldBlockMagicSpend(10, 5)).toBe(false);
  });

  it('việc KHÔNG tính phí thì chưa biết hay bằng 0 đều đi qua', () => {
    expect(shouldBlockMagicSpend(0, 0)).toBe(false);
    expect(shouldBlockMagicSpend(null, 0)).toBe(false);
  });
});

// ── Bốn chỗ tiêu thụ: đối chiếu văn bản nguồn ────────────────────────────────
const doc = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');

describe('màn Ví — `null` giữ nguyên là `null` tới chỗ vẽ', () => {
  const SRC = doc('../screens/PhoenixWalletScreen.tsx');

  it('nhận số MAGIC KHÔNG qua giá trị đệm', () => {
    expect(SRC).toMatch(/setMagic\(s\.magicAvailable\);/);
    expect(SRC).not.toMatch(/setMagic\([^)]*\?\?/);
    expect(SRC).not.toMatch(/setMagicAccrued\([^)]*\?\?/);
  });

  it('ô MAGIC trống thì có chỗ nói VÌ SAO, không để lại một dấu "—" câm', () => {
    expect(SRC).toMatch(/setMagicAbsentReason\(s\.magicAbsentReason\);/);
    expect(SRC).toMatch(/magic == null && !balanceIssue/);
    // Máy chủ im thì vẫn phải nói là chưa đọc được — im lặng ở cả hai nhánh mới
    // là cái vỏ im lặng.
    expect(SRC).toMatch(/Máy chủ chưa xác định được số MAGIC/);
  });
});

describe('store — cộng vào một số chưa biết thì vẫn chưa biết', () => {
  const SRC = doc('../store/userSlice.ts');

  it('`magicBalance` khai được cả `null`', () => {
    expect(SRC).toMatch(/magicBalance: number \| null;/);
  });

  it('`updateCredits` không lấy 0 làm gốc rồi cộng', () => {
    expect(SRC).toMatch(/if \(state\.wallet\.magicBalance != null\) \{\s*\n\s*state\.wallet\.magicBalance \+= action\.payload\.magic;/);
    expect(SRC).not.toMatch(/magicBalance = \(state\.wallet\.magicBalance \?\? 0\)/);
  });
});

describe('SDK — chưa hỏi thì đừng tự trả lời hộ máy chủ', () => {
  const SRC = doc('../sdk/phoenixKey.ts');

  it('không có DID ⟹ `magicCredits: null`, không phải 0', () => {
    expect(SRC).toMatch(/magicCredits: null,/);
    expect(SRC).not.toMatch(/magicCredits: 0,/);
  });

  it('có DID thì lấy thẳng số từ máy chủ, không đệm', () => {
    expect(SRC).toMatch(/magicCredits: s\.magicAvailable,/);
    expect(SRC).not.toMatch(/magicCredits: s\.magicAvailable \?\?/);
  });
});
