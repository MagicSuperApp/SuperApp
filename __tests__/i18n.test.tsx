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

import { t, tf, setLanguage, getLanguage } from '../src/i18n';
import { installI18n } from '../src/i18n/install';

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

  it('dịch khi đổi sang tiếng Anh / tiếng Trung', () => {
    setLanguage('en');
    expect(t('Đăng xuất')).toBe('Sign out');
    setLanguage('zh');
    expect(t('Đăng xuất')).toBe('退出登录');
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
    expect(t('  Đăng xuất ')).toBe('  Sign out ');
  });

  it('tf() thay chỗ trống sau khi dịch khuôn', () => {
    setLanguage('en');
    expect(tf('Xin chào {name}', { name: 'Tùng' })).toBe('Hello Tùng');
    setLanguage('vi');
    expect(tf('Xin chào {name}', { name: 'Tùng' })).toBe('Xin chào Tùng');
  });
});

describe('từ điển', () => {
  const { DICTIONARY, DICTIONARY_SIZE } = require('../src/i18n/dictionary') as typeof import('../src/i18n/dictionary');

  it('mọi cụm từ đều có ĐỦ cả hai ngôn ngữ đích', () => {
    const thieu = Object.entries(DICTIONARY)
      .filter(([, v]) => !v.en || !v.zh)
      .map(([k]) => k);
    expect(thieu).toEqual([]);
  });

  // Một mục mà MỌI ngôn ngữ đích đều trùng nguyên văn khoá = mục vô dụng (thường
  // do chép nhầm). Trùng ở MỘT ngôn ngữ thì hợp lệ: vd 'Cardano Preprod (Testnet)'
  // vốn đã là tiếng Anh, chỉ cần bản tiếng Trung.
  it('không có mục nào bỏ trống hoặc vô tác dụng ở MỌI ngôn ngữ', () => {
    const xau = Object.entries(DICTIONARY)
      .filter(([k, v]) => v.en?.trim() === '' || v.zh?.trim() === '' || (v.en === k && v.zh === k))
      .map(([k]) => k);
    expect(xau).toEqual([]);
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

    act(() => {
      setLanguage('en');
    });
    expect(readText()).toContain('Sign out');

    act(() => {
      setLanguage('zh');
    });
    expect(readText()).toContain('退出登录');
    expect(getLanguage()).toBe('zh');
  });

  it('<TextInput> dịch placeholder', () => {
    const { TextInput } = RN;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      setLanguage('en');
      tree = renderer.create(<TextInput placeholder="Tìm cây..." />);
    });
    const json = tree!.toJSON() as any;
    expect(json.props.placeholder).toBe('Search trees...');
  });
});
