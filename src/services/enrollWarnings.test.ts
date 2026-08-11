// Canh SHAPE cảnh báo đăng ký cây.
//
// Vì sao cần: hai trường này từng bị khai nhầm cùng một dạng `{message_vi}`, và
// TypeScript KHÔNG bắt được — kiểu do chính bên này khai, không phải do máy chủ.
// Hậu quả không phải app sập mà là mọi cảnh báo biến mất im lặng: nông dân khoanh
// vùng quá nhỏ hoặc chụp ảnh mờ, máy chủ có nói, màn hình không hiện gì.
//
// Shape thật (OriLife `core/server.py`):
//   quality_warnings  :1925  = [{idx, reasons[], messages[]}]
//   region_warnings   :1769  = list[str]  ← CHUỖI TRẦN

import { enrollWarningMessages } from './treeReIDService';

describe('enrollWarningMessages', () => {
  it('rút câu Việt từ quality_warnings qua trường messages', () => {
    const out = enrollWarningMessages({
      quality_warnings: [
        { idx: 0, reasons: ['blur'], messages: ['Ảnh bị mờ — hãy chụp lại gần hơn.'] },
      ],
    });
    expect(out.quality).toEqual(['Ảnh bị mờ — hãy chụp lại gần hơn.']);
  });

  it('nhận region_warnings là mảng chuỗi trần', () => {
    const out = enrollWarningMessages({
      region_warnings: ['Vùng khoanh cây quá nhỏ — hãy khoanh rộng hơn.'],
    });
    expect(out.region).toEqual(['Vùng khoanh cây quá nhỏ — hãy khoanh rộng hơn.']);
  });

  it('gộp câu trùng khi nhiều ảnh cùng rớt một lý do', () => {
    const out = enrollWarningMessages({
      quality_warnings: [
        { idx: 0, messages: ['Ảnh bị mờ.'] },
        { idx: 1, messages: ['Ảnh bị mờ.'] },
        { idx: 2, messages: ['Ảnh bị mờ.', 'Thiếu sáng.'] },
      ],
    });
    expect(out.quality).toEqual(['Ảnh bị mờ.', 'Thiếu sáng.']);
  });

  it('KHÔNG đọc message_vi — đó là shape sai từng làm cảnh báo biến mất', () => {
    const out = enrollWarningMessages({
      // @ts-expect-error cố tình dựng shape SAI để canh: nếu ai đổi kiểu về
      // {message_vi} thì dòng này hết đỏ và test này phải gãy.
      quality_warnings: [{ message_vi: 'Ảnh bị mờ.' }],
    });
    expect(out.quality).toEqual([]);
  });

  it('vắng trường, mảng rỗng, hoặc sai kiểu đều trả mảng rỗng, không ném', () => {
    expect(enrollWarningMessages()).toEqual({ quality: [], region: [] });
    expect(enrollWarningMessages({})).toEqual({ quality: [], region: [] });
    expect(
      enrollWarningMessages({
        // @ts-expect-error dữ liệu từ mạng có thể sai kiểu — không được ném.
        quality_warnings: 'hỏng',
        // @ts-expect-error
        region_warnings: { a: 1 },
      }),
    ).toEqual({ quality: [], region: [] });
  });

  it('bỏ chuỗi rỗng và chuỗi chỉ có khoảng trắng', () => {
    const out = enrollWarningMessages({
      quality_warnings: [{ messages: ['', '   ', 'Thiếu sáng.'] }],
      region_warnings: ['', 'Vùng khoanh quá nhỏ.'],
    });
    expect(out.quality).toEqual(['Thiếu sáng.']);
    expect(out.region).toEqual(['Vùng khoanh quá nhỏ.']);
  });
});
