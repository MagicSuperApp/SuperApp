// __tests__/i18n.test.tsx
//
// Ghim CƠ CHẾ của hệ đa ngôn ngữ, không phải nội dung từng bản dịch:
//   1. `t()` trả nguyên văn khi ngôn ngữ = 'vi' và khi không có bản dịch
//      (tên riêng/thuật ngữ tự động giữ nguyên nhờ tính chất này).
//   2. Khoảng trắng hai đầu được giữ (JSX hay tách `{'Xin chào '}{name}`).
//   3. `installI18n()` THẬT SỰ thay Text/TextInput trên module 'react-native'
//      → mọi file trong app nhận bản tự dịch mà không phải sửa gì.
//   4. Đổi ngôn ngữ làm <Text> vẽ lại nội dung mới.

import * as React from 'react';
import * as renderer from 'react-test-renderer';
import { act } from 'react';

import {
  t,
  tf,
  setLanguage,
  getLanguage,
  SUPPORTED_LANGS,
  SOURCE_LANG,
  type TargetLang,
} from '../src/i18n';
import { installI18n } from '../src/i18n/install';
import { DICTIONARY } from '../src/i18n/dictionary';

// Cài lớp dịch một lần cho cả file, y như index.js làm lúc khởi động.
installI18n();

// PHẢI require SAU installI18n để lấy đúng thuộc tính đã bị thay.
const RN = require('react-native');

afterEach(() => {
  // act(): đổi ngôn ngữ đánh thức mọi <Text> đang mount qua useSyncExternalStore.
  act(() => {
    setLanguage('vi');
  });
});

describe('t()', () => {
  it('trả nguyên văn khi đang ở tiếng Việt', () => {
    setLanguage('vi');
    expect(t('Đăng xuất')).toBe('Đăng xuất');
  });

  // Đối chiếu với CHÍNH từ điển, không ghim chuỗi cứng: sửa câu chữ cho hay hơn
  // là việc bình thường, không được làm đỏ test. Cái cần canh là CƠ CHẾ — đúng
  // ngôn ngữ đang chọn, và khác chuỗi gốc.
  it('dịch sang mọi ngôn ngữ đích đang hỗ trợ', () => {
    const nguon = 'Đăng xuất';
    for (const lang of ['en', 'zh', 'ja'] as const) {
      setLanguage(lang);
      const ra = t(nguon);
      expect(ra).toBe(DICTIONARY[nguon][lang]);
      expect(ra).not.toBe(nguon);
      expect(ra?.trim()).toBeTruthy();
    }
  });

  it('giữ NGUYÊN tên riêng & thuật ngữ (không khai trong từ điển)', () => {
    setLanguage('en');
    for (const term of ['PhoenixKey', 'LAMP', 'MAGIC', 'Cardano', 'ProofChat', 'DID']) {
      expect(t(term)).toBe(term);
    }
    // Dữ liệu người dùng (tên vườn, tên người) cũng rơi vào nhánh này.
    expect(t('Vườn Tám Lợi')).toBe('Vườn Tám Lợi');
  });

  it('giữ khoảng trắng hai đầu', () => {
    setLanguage('en');
    expect(t('  Đăng xuất ')).toBe(`  ${DICTIONARY['Đăng xuất'].en} `);
  });

  it('tf() thay chỗ trống sau khi dịch khuôn', () => {
    setLanguage('en');
    expect(tf('Xin chào {name}', { name: 'Tùng' })).toBe('Hello Tùng');
    setLanguage('vi');
    expect(tf('Xin chào {name}', { name: 'Tùng' })).toBe('Xin chào Tùng');
  });
});

describe('khoá từ điển khớp CHUỖI LÚC CHẠY, không phải chữ trong mã', () => {
  // Ba khuôn dưới đây trông khác hẳn nhau trong mã nguồn nhưng tới `t()` đều là
  // MỘT chuỗi. Viết khoá theo mã nguồn là hỏng, nên ghim lại bằng test.
  it('JSX đổi &amp; thành & → khoá viết bằng "&"', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      setLanguage('en');
      tree = renderer.create(<RN.Text>Tổ chức &amp; Mint LAMP</RN.Text>);
    });
    expect(JSON.stringify(tree!.toJSON())).toContain(
      DICTIONARY['Tổ chức & Mint LAMP'].en,
    );
  });

  it('nối chuỗi bằng + → khoá là chuỗi ĐÃ nối', () => {
    setLanguage('en');
    const noi = 'Clipboard KHÔNG an toàn (app khác đọc được). Chỉ dùng tạm rồi xoá. ' + 'Tốt nhất nên GHI RA GIẤY.';
    expect(t(noi)).toBe(DICTIONARY[noi].en);
    // …và từng MẢNH thì không khớp gì cả — đó là lý do khoá phải là chuỗi đã nối.
    expect(t('Tốt nhất nên GHI RA GIẤY.')).toBe('Tốt nhất nên GHI RA GIẤY.');
  });

  it('JSX xuống dòng gộp thành MỘT dòng, ngăn bằng một dấu cách', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      setLanguage('en');
      tree = renderer.create(
        <RN.Text>
          Hãy chọn cây trước, rồi mới xem quả
          của cây đó.
        </RN.Text>,
      );
    });
    expect(JSON.stringify(tree!.toJSON())).toContain(
      DICTIONARY['Hãy chọn cây trước, rồi mới xem quả của cây đó.'].en,
    );
  });
});

describe('thiếu bản dịch → rơi về TIẾNG ANH', () => {
  // Từ điển THẬT không còn lỗ hổng nào (bài "đủ mọi ngôn ngữ đích" ở dưới canh
  // đúng điều đó), nên phải dựng một từ điển GIẢ mới đo được nấc rơi.
  function withDict(dict: Record<string, Record<string, string>>) {
    let translate!: typeof import('../src/i18n/translate');
    let store!: typeof import('../src/i18n/store');
    jest.isolateModules(() => {
      jest.doMock('../src/i18n/dictionary', () => ({
        DICTIONARY: dict,
        DICTIONARY_SIZE: Object.keys(dict).length,
      }));
      // store phải lấy CÙNG bản sao mà translate nhìn thấy, nếu không setLanguage
      // sẽ đổi ngôn ngữ ở một module khác.
      store = require('../src/i18n/store');
      translate = require('../src/i18n/translate');
    });
    jest.dontMock('../src/i18n/dictionary');
    return { t: translate.t, setLanguage: store.setLanguage };
  }

  const DICT = {
    'Có đủ ba thứ tiếng': { en: 'All three', zh: '三种', ja: '三か国語' },
    'Chỉ có tiếng Anh': { en: 'English only' },
  };

  it('cụm từ thiếu bản tiếng Nhật/Trung thì hiện TIẾNG ANH, không hiện tiếng Việt', () => {
    const { t, setLanguage } = withDict(DICT);
    for (const lang of ['zh', 'ja'] as const) {
      setLanguage(lang);
      expect(t('Chỉ có tiếng Anh')).toBe('English only');
    }
  });

  it('có bản dịch đúng ngôn ngữ thì KHÔNG rơi về tiếng Anh', () => {
    const { t, setLanguage } = withDict(DICT);
    setLanguage('ja');
    expect(t('Có đủ ba thứ tiếng')).toBe('三か国語');
  });

  it('thiếu CẢ tiếng Anh → giữ nguyên chuỗi nguồn (tên riêng, dữ liệu người dùng)', () => {
    const { t, setLanguage } = withDict(DICT);
    setLanguage('ja');
    expect(t('PhoenixKey')).toBe('PhoenixKey');
    expect(t('Vườn Tám Lợi')).toBe('Vườn Tám Lợi');
  });

  it('nấc rơi vẫn giữ khoảng trắng hai đầu', () => {
    const { t, setLanguage } = withDict(DICT);
    setLanguage('zh');
    expect(t('  Chỉ có tiếng Anh ')).toBe('  English only ');
  });

  it('đang ở tiếng Việt thì không đụng tới nấc nào', () => {
    const { t, setLanguage } = withDict(DICT);
    setLanguage('vi');
    expect(t('Chỉ có tiếng Anh')).toBe('Chỉ có tiếng Anh');
  });
});

describe('từ điển', () => {
  const { DICTIONARY, DICTIONARY_SIZE } = require('../src/i18n/dictionary') as typeof import('../src/i18n/dictionary');

  // Duyệt theo TARGETS suy từ SUPPORTED_LANGS: thêm một ngôn ngữ vào i18n mà quên
  // dịch từ điển thì bài này đỏ ngay, thay vì lặng lẽ hiện tiếng Việt lẫn vào.
  const TARGETS = SUPPORTED_LANGS.filter((l) => l !== SOURCE_LANG) as TargetLang[];

  it('mọi cụm từ đều có ĐỦ mọi ngôn ngữ đích', () => {
    const thieu = Object.entries(DICTIONARY)
      .flatMap(([k, v]) => TARGETS.filter((l) => !v[l]).map((l) => `${l}: ${k}`));
    expect(thieu).toEqual([]);
  });

  // Một mục mà MỌI ngôn ngữ đích đều trùng nguyên văn khoá = mục vô dụng (thường
  // do chép nhầm). Trùng ở MỘT ngôn ngữ thì hợp lệ: vd 'Cardano Preprod (Testnet)'
  // vốn đã là tiếng Anh, chỉ cần bản tiếng Trung/Nhật.
  it('không có mục nào bỏ trống hoặc vô tác dụng ở MỌI ngôn ngữ', () => {
    const xau = Object.entries(DICTIONARY)
      .filter(
        ([k, v]) =>
          TARGETS.some((l) => v[l]?.trim() === '') || TARGETS.every((l) => v[l] === k),
      )
      .map(([k]) => k);
    expect(xau).toEqual([]);
  });

  it('không có khoá nào bị khai TRÙNG giữa các file cụm từ', () => {
    // Khai trùng thì bản nạp sau đè bản trước — hai chỗ dịch lệch nhau mà không ai
    // biết. `dictionary.ts` chỉ cảnh báo ở DEV; bài này biến nó thành lỗi.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.isolateModules(() => {
      require('../src/i18n/dictionary');
    });
    const trung = warn.mock.calls.filter(([m]) => String(m).includes('khoá trùng'));
    warn.mockRestore();
    expect(trung).toEqual([]);
  });

  it('còn nguyên vẹn (chống xoá nhầm cả file cụm từ)', () => {
    expect(DICTIONARY_SIZE).toBeGreaterThan(1500);
  });
});

describe('installI18n()', () => {
  it('thay Text/TextInput trên module react-native', () => {
    expect(RN.Text.displayName).toBe('AutoText');
    expect(RN.TextInput.displayName).toBe('AutoTextInput');
  });

  it('<Text> tự dịch children và vẽ lại khi đổi ngôn ngữ', () => {
    const { Text } = RN;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Text>Đăng xuất</Text>);
    });
    // Đọc CÂY ĐÃ VẼ, không đọc props của chính AutoText: bản dịch nằm ở đầu ra
    // của wrapper (children truyền xuống Text gốc), không phải ở đầu vào.
    const readText = () => JSON.stringify(tree.toJSON());
    expect(readText()).toContain('Đăng xuất');

    for (const lang of ['en', 'zh', 'ja'] as const) {
      act(() => {
        setLanguage(lang);
      });
      expect(readText()).toContain(DICTIONARY['Đăng xuất'][lang]!);
      expect(getLanguage()).toBe(lang);
    }
  });

  it('<TextInput> dịch placeholder', () => {
    const { TextInput } = RN;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      setLanguage('en');
      tree = renderer.create(<TextInput placeholder="Tìm cây..." />);
    });
    const json = tree!.toJSON() as any;
    expect(json.props.placeholder).toBe(DICTIONARY['Tìm cây...'].en);
  });
});
