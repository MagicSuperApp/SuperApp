// i18n/autoText.tsx
//
// LỚP DỊCH TOÀN CỤC cho <Text> và <TextInput>.
//
// Bài toán: app có ~1.7k chuỗi tiếng Việt nằm rải trong 177 file. Bọc tay từng
// chuỗi bằng `t(...)` = 177 file phải sửa, dễ sót và dễ vỡ (template literal,
// chuỗi nối, chuỗi trong Alert…). Thay vào đó bọc Ở CỬA RA: mọi chuỗi muốn hiện
// lên màn hình đều phải đi qua <Text> (hoặc placeholder của <TextInput>).
//
// Cách hoạt động: `install.ts` thay thuộc tính `Text`/`TextInput` trên module
// 'react-native' bằng hai component dưới đây. Babel dịch `import { Text } from
// 'react-native'` thành truy cập thuộc tính TẠI CHỖ DÙNG (`_reactNative.Text`)
// nên mọi file — kể cả file chưa từng sửa — nhận bản đã bọc.
//
// AN TOÀN:
//   · Chỉ dịch children là CHUỖI, và chỉ khi khớp CHÍNH XÁC một mục từ điển.
//     Tên người, tên vườn, mã DID, số dư… không có trong từ điển → giữ nguyên.
//   · Không đụng vào element con: chúng tự đi qua lớp này khi tới lượt vẽ.
//   · Ngôn ngữ = 'vi' → trả thẳng props gốc, gần như không tốn gì.
//
// GIỚI HẠN đã biết: text vẽ bởi component NATIVE không qua <Text> của RN
// (vd nhãn nút hệ thống trong Alert.alert của RN core, tiêu đề mặc định của
// react-navigation header) không đi qua lớp này. App dùng AlertPopup tự vẽ và
// header tự vẽ nên trên thực tế không lộ; chỗ nào cần thì gọi `t()` trực tiếp.

import * as React from 'react';
import { t } from './translate';
import { useLanguage } from './useLanguage';
import { SOURCE_LANG } from './types';

type AnyComponent = React.ComponentType<any>;

/** Dịch children của <Text>: chuỗi thì tra từ điển, phần còn lại giữ nguyên. */
function translateChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') return t(children);
  if (Array.isArray(children)) {
    let changed = false;
    const next = children.map((c) => {
      if (typeof c === 'string') {
        const tc = t(c);
        if (tc !== c) changed = true;
        return tc;
      }
      return c;
    });
    return changed ? next : children;
  }
  return children;
}

export function makeAutoText(Original: AnyComponent): AnyComponent {
  const AutoText = (props: any) => {
    const lang = useLanguage();
    if (lang === SOURCE_LANG) return <Original {...props} />;
    const children = translateChildren(props.children);
    if (children === props.children) return <Original {...props} />;
    return <Original {...props} children={children} />;
  };
  // Giữ static của bản gốc (vd Text.propTypes ở lib cũ) để code bên thứ 3 không
  // vỡ. Gán displayName SAU cùng — Object.assign có thể chép đè bằng 'Text'.
  const Wrapped = Object.assign(AutoText, Original);
  Wrapped.displayName = 'AutoText';
  return Wrapped;
}

export function makeAutoTextInput(Original: AnyComponent): AnyComponent {
  const AutoTextInput = (props: any) => {
    const lang = useLanguage();
    if (lang === SOURCE_LANG) return <Original {...props} />;
    const { placeholder } = props;
    if (typeof placeholder !== 'string') return <Original {...props} />;
    const next = t(placeholder);
    if (next === placeholder) return <Original {...props} />;
    return <Original {...props} placeholder={next} />;
  };
  const Wrapped = Object.assign(AutoTextInput, Original);
  Wrapped.displayName = 'AutoTextInput';
  return Wrapped;
}
