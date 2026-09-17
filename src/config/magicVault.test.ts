/**
 * Bài kiểm cho vế THUẦN của cấu hình vault MAGIC — không đụng `@env`, gọi thẳng
 * `parseMagicVaultConfig`. Trọng tâm: ba trạng thái KHÔNG được gộp —
 *   · thiếu (undefined/rỗng)   → `null` (chưa cấu hình)
 *   · sai định dạng            → `null` (chưa cấu hình — cùng nhánh với "thiếu")
 *   · hợp lệ                   → object, đã chuẩn hoá
 */

import { parseMagicVaultConfig } from './magicVault';

const VALID_PKH = '2e5e1418afd402e48232b143876104cac6188a44b867ffb7538318f4'; // 56 hex
const VALID_URL = 'https://vault-read.example.test';

describe('parseMagicVaultConfig — chưa cấu hình', () => {
  it('cả ba trường đều undefined ⇒ null', () => {
    expect(parseMagicVaultConfig({})).toBeNull();
  });

  it('thiếu baseUrl ⇒ null dù ownerPkh hợp lệ', () => {
    expect(parseMagicVaultConfig({ ownerPkh: VALID_PKH })).toBeNull();
  });

  it('baseUrl toàn khoảng trắng ⇒ null (trim rỗng, không phải chuỗi "có nội dung")', () => {
    expect(parseMagicVaultConfig({ baseUrl: '   ', ownerPkh: VALID_PKH })).toBeNull();
  });

  it('thiếu ownerPkh ⇒ null dù baseUrl hợp lệ', () => {
    expect(parseMagicVaultConfig({ baseUrl: VALID_URL })).toBeNull();
  });

  it('ownerPkh ngắn hơn 56 ký tự ⇒ null', () => {
    expect(parseMagicVaultConfig({ baseUrl: VALID_URL, ownerPkh: 'abcd' })).toBeNull();
  });

  it('ownerPkh dài đúng 56 nhưng lẫn ký tự không-hex ⇒ null', () => {
    const bad = 'g'.repeat(56); // 'g' không phải hex
    expect(parseMagicVaultConfig({ baseUrl: VALID_URL, ownerPkh: bad })).toBeNull();
  });
});

describe('parseMagicVaultConfig — hợp lệ', () => {
  it('trả object đã chuẩn hoá khi đủ baseUrl + ownerPkh đúng dạng', () => {
    const cfg = parseMagicVaultConfig({ baseUrl: VALID_URL, ownerPkh: VALID_PKH });
    expect(cfg).toEqual({ baseUrl: VALID_URL, ownerPkh: VALID_PKH, apiToken: '' });
  });

  it('ownerPkh viết hoa vẫn nhận, và được hạ về lowercase', () => {
    const cfg = parseMagicVaultConfig({ baseUrl: VALID_URL, ownerPkh: VALID_PKH.toUpperCase() });
    expect(cfg?.ownerPkh).toBe(VALID_PKH);
  });

  it('cắt dấu "/" cuối baseUrl — tránh URL hai gạch khi ghép đường dẫn', () => {
    const cfg = parseMagicVaultConfig({ baseUrl: `${VALID_URL}/`, ownerPkh: VALID_PKH });
    expect(cfg?.baseUrl).toBe(VALID_URL);
  });

  it('apiToken có mặt thì giữ nguyên (đã trim)', () => {
    const cfg = parseMagicVaultConfig({ baseUrl: VALID_URL, ownerPkh: VALID_PKH, apiToken: '  tok123  ' });
    expect(cfg?.apiToken).toBe('tok123');
  });

  it('apiToken vắng mặt ⇒ chuỗi rỗng, KHÔNG phải undefined (để service khỏi phải đoán)', () => {
    const cfg = parseMagicVaultConfig({ baseUrl: VALID_URL, ownerPkh: VALID_PKH });
    expect(cfg?.apiToken).toBe('');
  });
});
