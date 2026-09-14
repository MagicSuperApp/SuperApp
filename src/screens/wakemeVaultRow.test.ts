import { PhoenixKeyApiError } from '../services/phoenixKey-api';
import { vaultRowText, vaultStateFromError } from './wakemeVaultRow';

/**
 * Bài kiểm đo đúng một điều: một lượt hỏi TRƯỢT không được biến thành câu
 * "người này không có gì".
 *
 * Ca 501 là ca chạy thật hôm nay, nên nó đứng đầu.
 */
describe('dòng Wakeme — lượt hỏi trượt không được đọc thành "chưa nhận"', () => {
  it('501 (cửa chưa triển khai) → chưa hỏi được, KHÔNG phải chưa nhận', () => {
    const err = new PhoenixKeyApiError(9501, 501, 'Not implemented');
    expect(vaultStateFromError(err)).toBe('unknown');
  });

  it('mất mạng (httpStatus = 0) → chưa hỏi được', () => {
    const err = new PhoenixKeyApiError(-1, 0, 'Network error');
    expect(vaultStateFromError(err)).toBe('unknown');
  });

  it('5xx và 401 cũng là chưa hỏi được', () => {
    expect(vaultStateFromError(new PhoenixKeyApiError(-1, 500, 'boom'))).toBe('unknown');
    expect(vaultStateFromError(new PhoenixKeyApiError(1401, 401, 'hết phiên'))).toBe('unknown');
  });

  it('lỗi không mang mã HTTP nào (throw một chuỗi, undefined) → chưa hỏi được', () => {
    expect(vaultStateFromError('vỡ ở đâu đó')).toBe('unknown');
    expect(vaultStateFromError(undefined)).toBe('unknown');
  });

  /**
   * Ca NGƯỢC. Thiếu nó thì bản vá thực hiện được bằng cách bỏ hẳn nhánh
   * "chưa nhận" — lúc đó bốn ca trên vẫn xanh, và app thành ra không bao giờ
   * nói được điều máy chủ thật sự trả lời.
   */
  it('404 là câu TRẢ LỜI của máy chủ → chưa nhận', () => {
    const err = new PhoenixKeyApiError(1404, 404, 'Vault not found');
    expect(vaultStateFromError(err)).toBe('closed');
  });
});

describe('chữ hiện ra ở ô lẽ ra là con số', () => {
  it('chưa hỏi được thì hiện CHỮ, không hiện dấu gạch ngang và không hiện số 0', () => {
    const { sub, value } = vaultRowText('unknown');
    expect(value).toBe('chưa rõ');
    expect(value).not.toBe('—');
    expect(value).not.toMatch(/0/);
    expect(sub).toBe('Chưa hỏi được máy chủ');
  });

  it('chưa hỏi lần nào (idle) đọc như chưa biết, không đọc như không có', () => {
    expect(vaultRowText('idle')).toEqual(vaultRowText('unknown'));
  });

  it('đang hỏi thì không được khẳng định một thất bại chưa xảy ra', () => {
    expect(vaultRowText('loading').sub).toBe('Đang hỏi máy chủ…');
  });

  it('chưa nhận là câu của máy chủ, nên nó KHÁC câu chưa hỏi được', () => {
    expect(vaultRowText('closed').sub).toBe('Chưa nhận');
    expect(vaultRowText('closed').sub).not.toBe(vaultRowText('unknown').sub);
  });
});
