import { toRustUtxos } from './cardanoTxService';

// Hình PhoenixKey trả về, dựng theo `WalletTxBuildDtos.WalletUtxo` +
// `WalletController.getUtxos` (kho PhoenixKey-Database), tên trường ở dạng snake_case
// vì Jackson đổi cho toàn bộ phản hồi — đo gián tiếp qua `GET /wallet/params` trả
// `min_fee_a` / `coins_per_utxo_size` (2026-08-11).
const POLICY = 'a'.repeat(56);         // policy id = 28 byte = 56 ký tự hex
const NAME_HEX = '4c414d50';           // "LAMP"

describe('toRustUtxos — đổi hình PhoenixKey → hình Rust đợi', () => {
  it('đổi đủ 3 chỗ lệch: output_index→index, native_assets(bảng)→assets(mảng), cắt unit', () => {
    const out = toRustUtxos([
      {
        address: 'addr_test1xxx',
        tx_hash: 'e9516a50023af2edab81363a6d78349a458698384c8a161a4b86b3140b0c80e6',
        output_index: 2,
        lovelace: '5000000',
        native_assets: { [POLICY + NAME_HEX]: '1200' },
        inline_datum_hex: null,
      },
    ]);
    expect(out).toEqual([
      {
        tx_hash: 'e9516a50023af2edab81363a6d78349a458698384c8a161a4b86b3140b0c80e6',
        index: 2,
        lovelace: '5000000',
        assets: [{ policy: POLICY, name: NAME_HEX, quantity: '1200' }],
      },
    ]);
  });

  // Đây là chỗ nguy hiểm nhất trong cả bản vá: `assets` ở Rust có `#[serde(default)]`,
  // nên nếu đưa thẳng bảng `native_assets` xuống thì serde BỎ QUA và mảng thành rỗng —
  // chọn coin tưởng ví chỉ có ADA, LAMP/CARP trong cùng UTxO biến mất khỏi tính toán,
  // KHÔNG lỗi nào được in. Test này khoá đúng chỗ đó.
  it('tài sản trong UTxO KHÔNG được rơi mất', () => {
    const out = toRustUtxos([
      {
        tx_hash: 'ff', output_index: 0, lovelace: '2000000',
        native_assets: { [POLICY + NAME_HEX]: '7', [POLICY + '00']: '9' },
      },
    ]);
    expect(out[0].assets).toHaveLength(2);
    expect(out[0].assets.map(a => a.quantity).sort()).toEqual(['7', '9']);
  });

  // Máy chủ khai `jackson.property-naming-strategy: SNAKE_CASE` cho MỌI phản hồi
  // (`PhoenixKey-Database` main, `src/main/resources/application.yml:8-9`), nên trên
  // dây KHÔNG có camelCase. Bản trước của hàm này nhận cả hai cách viết vì chưa đo
  // được; nay bỏ nhánh đó, và test này khoá việc bỏ — nhận camelCase trở lại là
  // dựng lại một nhánh chết mà người đọc sau sẽ tưởng máy chủ có hai cách viết.
  it('KHÔNG nhận camelCase — máy chủ khai SNAKE_CASE toàn cục, và NÉM chứ không im', () => {
    // Bản trước của test này viết `expect(out).toEqual([])` — tức đóng đinh sự IM
    // LẶNG làm hành vi đúng. Mảng rỗng đi xuống Rust thành "no funds to spend"
    // (`rust/taad_enclave_core/src/transfer.rs:177-179`) trong khi ví đang có
    // 5 ADA + 1200 LAMP, và người dùng đọc câu đó sẽ tưởng mình hết tiền.
    expect(() =>
      toRustUtxos([
        { txHash: 'ab', outputIndex: 1, lovelace: 3, nativeAssets: { [POLICY + NAME_HEX]: 5 } },
      ]),
    ).toThrow(/lệch hình dữ liệu/);
  });

  it('mảng vào RỖNG thì trả rỗng, KHÔNG ném — ví mới chưa có UTxO là chuyện thường', () => {
    expect(toRustUtxos([])).toEqual([]);
  });

  // `de_u64_str` bên Rust (`transfer.rs:80-82`) nhận cả chuỗi lẫn số. Nếu mai kia
  // ai bỏ `ToStringSerializer` ở `WalletTxBuildDtos.java` thì bên này KHÔNG được
  // im lặng bỏ tiền. Bản trước xoá hẳn test có giá trị số ⇒ mất luôn vùng phủ này.
  it('nhận lovelace/quantity dạng SỐ, đổi sang chuỗi', () => {
    const out = toRustUtxos([
      { tx_hash: 'a1', output_index: 0, lovelace: 2000000, native_assets: { [POLICY + NAME_HEX]: 7 } },
    ]);
    expect(out[0].lovelace).toBe('2000000');
    expect(out[0].assets[0].quantity).toBe('7');
  });

  it('số nguyên vượt 2^53 bị TỪ CHỐI, không làm tròn âm thầm', () => {
    // Đo được: String(9007199254740993) === '9007199254740992' — sai 1 đơn vị,
    // không một lời cảnh báo nào.
    expect(() =>
      toRustUtxos([{ tx_hash: 'a2', output_index: 0, lovelace: 9007199254740993 }]),
    ).toThrow(/2\^53/);
  });

  it('thiếu hẳn `lovelace` → bỏ UTxO đó, KHÔNG khai thành 0 ADA', () => {
    expect(() =>
      toRustUtxos([{ tx_hash: 'a3', output_index: 0, native_assets: { [POLICY + NAME_HEX]: '7' } }]),
    ).toThrow(/lệch hình dữ liệu/);
  });

  it('lovelace/quantity luôn ra CHUỖI — u64 vượt 2^53 của JSON number', () => {
    const big = '18446744073709551615'; // 2^64 − 1
    const out = toRustUtxos([
      { tx_hash: 'cd', output_index: 0, lovelace: big, native_assets: { [POLICY]: big } },
    ]);
    expect(out[0].lovelace).toBe(big);
    expect(out[0].assets[0].quantity).toBe(big);
    // Không đi qua Number ở bất kỳ đâu — Number(big) đã mất chính xác.
    expect(out[0].lovelace).not.toBe(String(Number(big)));
  });

  it('UTxO chỉ có ADA → assets rỗng, không phải undefined', () => {
    const out = toRustUtxos([{ tx_hash: 'ef', output_index: 0, lovelace: '1000000' }]);
    expect(out[0].assets).toEqual([]);
  });

  // Thà bỏ một UTxO còn hơn dựng một policy cụt rồi KÝ một giao dịch chi nhầm tài sản.
  it('unit ngắn hơn policy id (56 hex) bị bỏ, không cắt bừa', () => {
    const out = toRustUtxos([
      { tx_hash: 'gh', output_index: 0, lovelace: '1', native_assets: { abc: '1' } },
    ]);
    expect(out[0].assets).toEqual([]);
  });

  it('unit đúng 56 ký tự (tài sản không tên) → name rỗng, vẫn giữ', () => {
    const out = toRustUtxos([
      { tx_hash: 'ij', output_index: 0, lovelace: '1', native_assets: { [POLICY]: '4' } },
    ]);
    expect(out[0].assets).toEqual([{ policy: POLICY, name: '', quantity: '4' }]);
  });

  it('bỏ phần tử thiếu tx_hash hoặc thiếu chỉ số, giữ phần tử còn lại', () => {
    const out = toRustUtxos([
      { output_index: 0, lovelace: '1' },              // thiếu tx_hash
      { tx_hash: 'kl', lovelace: '1' },                // thiếu chỉ số
      { tx_hash: 'mn', output_index: 0, lovelace: '1' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].tx_hash).toBe('mn');
  });

  it('chỉ số 0 là hợp lệ — không được rơi vì nó falsy', () => {
    const out = toRustUtxos([{ tx_hash: 'op', output_index: 0, lovelace: '1' }]);
    expect(out[0].index).toBe(0);
  });

  it('đầu vào không phải mảng → mảng rỗng, không ném', () => {
    expect(toRustUtxos(null)).toEqual([]);
    expect(toRustUtxos(undefined)).toEqual([]);
    expect(toRustUtxos({ items: [] })).toEqual([]);
    expect(toRustUtxos('rác')).toEqual([]);
  });
});
