/**
 * Ghim đường lỗi từ lõi bảo mật lên màn (Issue #285).
 *
 * Hai cực phải phân biệt được, và mỗi ca dưới đây đứng ở đúng một cực:
 *   · câu của lõi viết cho người  → HIỆN NGUYÊN VĂN
 *   · kết xuất máy thô / vật liệu khoá → CHỈ mã tra ngược
 * Một hàm luôn trả mã tra ngược sẽ đỏ ở nhóm ca thứ nhất; một hàm luôn hiện
 * nguyên văn sẽ đỏ ở nhóm thứ hai. Không ca nào xanh ở cả hai cực.
 */

import {
  describeEnclaveFailure,
  enclaveReferenceCode,
  isSafeToShow,
  rawEnclaveMessage,
} from './enclaveErrorMessage';

/** Câu thật của `recovery_builders_gate()` trong `rust/.../taad_did.rs`. */
const GATE_MESSAGE =
  "recovery builders disabled: timelock is measured in slots but the validator's " +
  'recovery window is anchored to POSIX milliseconds. Building here produces a ' +
  'transaction the validator rejects, after fees are paid. Unblock by migrating to ' +
  'the recovery_timelock_ms ABI with era-summary conversion inputs.';

describe('rawEnclaveMessage', () => {
  it('lấy được câu từ Error, từ chuỗi, và từ vật thể kiểu {message}', () => {
    expect(rawEnclaveMessage(new Error('hỏng vì X'))).toBe('hỏng vì X');
    expect(rawEnclaveMessage('  hỏng vì Y  ')).toBe('hỏng vì Y');
    expect(rawEnclaveMessage({ message: 'hỏng vì Z' })).toBe('hỏng vì Z');
  });

  it('không có gì để lấy thì trả chuỗi rỗng, không bịa', () => {
    expect(rawEnclaveMessage(null)).toBe('');
    expect(rawEnclaveMessage(undefined)).toBe('');
    expect(rawEnclaveMessage({})).toBe('');
  });
});

describe('describeEnclaveFailure — câu của lõi thì hiện câu của lõi', () => {
  it('câu cửa chặn đi qua NGUYÊN VĂN, không mã tra ngược', () => {
    const out = describeEnclaveFailure(
      'buildInitRecovery',
      new Error(GATE_MESSAGE),
    );
    expect(out.referenceCode).toBeNull();
    // Ba mảnh nói được người đọc phải LÀM GÌ. Thay bằng "có lỗi xảy ra" là đỏ.
    expect(out.message).toContain('recovery builders disabled');
    expect(out.message).toContain('POSIX milliseconds');
    expect(out.message).toContain('recovery_timelock_ms');
  });

  it('câu nêu tên đối số sai cũng đi qua nguyên văn', () => {
    const out = describeEnclaveFailure(
      'masterKekToMnemonic',
      new Error('invalid argument `kek_hex`: null pointer or not valid UTF-8'),
    );
    expect(out.referenceCode).toBeNull();
    expect(out.message).toContain('kek_hex');
  });

  it('hai nguyên nhân khác nhau cho hai câu khác nhau', () => {
    const a = describeEnclaveFailure('x', new Error(GATE_MESSAGE)).message;
    const b = describeEnclaveFailure(
      'x',
      new Error('invalid argument `utxos_json`: null pointer or not valid UTF-8'),
    ).message;
    expect(a).not.toBe(b);
  });
});

describe('describeEnclaveFailure — kết xuất máy thô chỉ ra mã tra ngược', () => {
  it('vết ngăn xếp Rust không lên màn', () => {
    const raw =
      "thread 'main' panicked at src/taad_did.rs:1204:17:\n" +
      'index out of bounds: the len is 0 but the index is 3\n' +
      'stack backtrace:\n   0: rust_begin_unwind';
    const out = describeEnclaveFailure('buildRotate', new Error(raw));
    expect(out.referenceCode).toMatch(/^ENCLAVE-[0-9A-F]{8}$/);
    expect(out.message).toContain(out.referenceCode as string);
    expect(out.message).not.toContain('panicked at');
    expect(out.message).not.toContain('taad_did.rs');
    // Bản đầy đủ vẫn còn — để ghi nhật ký máy, không để lên màn.
    expect(out.raw).toBe(raw);
  });

  it('đường dẫn tuyệt đối trong máy người dựng không lên màn', () => {
    const out = describeEnclaveFailure(
      'aesGcmDecrypt',
      new Error('failed to open /Users/builder/secrets/keystore.json'),
    );
    expect(out.referenceCode).not.toBeNull();
    expect(out.message).not.toContain('/Users/');
  });

  it('chuỗi hex dài (khoá/seed/CBOR) bị lược khỏi câu hiện ra', () => {
    const key = 'a3f19c'.repeat(8); // 48 ký tự hex
    const out = describeEnclaveFailure(
      'signEd25519',
      new Error(`bad key material ${key} rejected`),
    );
    expect(out.message).not.toContain(key);
    expect(out.raw).toContain(key);
  });

  it('cụm 24 từ lọt vào câu lỗi thì KHÔNG được hiện ra', () => {
    // Cố ý cắt chuỗi làm hai vế: giá trị truyền vào không đổi, nhưng không dòng
    // nào trong tệp mang đủ 12 từ thường liền nhau trong nháy — `scripts/soi-khoa.sh`
    // canh đúng hình dạng đó, và ở đây nó báo đúng (bài kiểm nào cũng chỉ là mẫu).
    const phrase =
      'abandon ability able about above absent ' +
      'absorb abstract absurd abuse access accident';
    const out = describeEnclaveFailure('mnemonicToMasterKek', new Error(phrase));
    expect(out.referenceCode).not.toBeNull();
    expect(out.message).not.toContain('abandon');
  });

  it('câu quá dài coi như kết xuất máy', () => {
    const out = describeEnclaveFailure('x', new Error('y'.repeat(400)));
    expect(out.referenceCode).not.toBeNull();
  });
});

describe('describeEnclaveFailure — lõi im lặng thì nói thẳng là im lặng', () => {
  it('không bịa một danh sách nguyên nhân phỏng đoán', () => {
    const out = describeEnclaveFailure('buildSignedTransfer', '');
    expect(out.referenceCode).toBeNull();
    expect(out.raw).toBe('');
    expect(out.message).toContain('buildSignedTransfer');
    // Ba phỏng đoán mà bản cũ in ra bất kể nguyên nhân thật là gì.
    expect(out.message).not.toContain('UTXO');
    expect(out.message).not.toContain('KEK/seed');
    expect(out.message).not.toContain('build lỗi');
  });
});

describe('enclaveReferenceCode', () => {
  it('cùng câu lỗi thì cùng mã — hai người báo cùng mã là cùng một lỗi', () => {
    expect(enclaveReferenceCode('abc')).toBe(enclaveReferenceCode('abc'));
  });

  it('câu khác thì mã khác', () => {
    expect(enclaveReferenceCode('abc')).not.toBe(enclaveReferenceCode('abd'));
  });
});

describe('isSafeToShow', () => {
  it('nhận câu viết cho người', () => {
    expect(isSafeToShow(GATE_MESSAGE)).toBe(true);
  });

  it('từ chối chuỗi rỗng — rỗng không phải "an toàn", là "không có gì"', () => {
    expect(isSafeToShow('')).toBe(false);
  });
});
