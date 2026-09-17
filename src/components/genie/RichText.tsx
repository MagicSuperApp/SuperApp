// components/genie/RichText.tsx
//
// Hiện câu của trợ lý có ĐẬM — bộ đọc markdown tối giản, chỉ một dấu hiệu.
//
// ── VÌ SAO PHẢI CÓ, VÀ VÌ SAO CHỈ CÓ ĐẬM ────────────────────────────────────
//
// Câu trong playbook viết tên nút bằng `**hai dấu sao**`, và đó KHÔNG phải trang
// trí: §7.3 giữ riêng dấu hiệu đó cho TÊN NÚT, `guard/labels.js` hậu-kiểm dựa vào
// nó, và bài kiểm CI đối chiếu từng nhãn với mã màn. Nghĩa là mỗi chuỗi đậm trong
// câu là một cái nút CÓ THẬT trên màn hình người dùng đang nhìn.
//
// Hiện thô ra thì bác nông dân nghe/đọc thành:
//
//     Bác chọn **Tự động ghi** thì cứ đi vòng quanh vườn…
//
// — và đi tìm một cái nút tên là "**Tự động ghi**". Dấu sao là nhiễu, còn cái nó
// đánh dấu lại là thứ quan trọng nhất trong câu.
//
// KHÔNG dựng một bộ markdown đầy đủ: mỗi dấu hiệu thêm vào là một cách nữa để
// câu chữ của trợ lý mang ý nghĩa mà cổng hậu-kiểm không soi. Danh sách trắng
// một dấu hiệu, và thứ gì không khớp thì hiện nguyên văn — không nuốt im.

import React, { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

export interface Segment {
  text: string;
  bold: boolean;
}

/**
 * Cắt chuỗi thành các đoạn thường/đậm.
 *
 * Tách ra một hàm THUẦN để kiểm được mà không dựng React — và vì đây là chỗ dễ
 * sai lặng: một dấu sao lẻ, một cặp rỗng, hay dấu sao nằm giữa chữ.
 */
export function parseBold(input: string): Segment[] {
  const s = String(input ?? '');
  if (!s) return [];

  const out: Segment[] = [];
  let buf = '';
  let i = 0;

  // QUÉT TAY, không dùng regex.
  //
  // Bản đầu dùng `/\*\*([^*]+)\*\*/g` và nó để rơi lại dấu sao lẻ: với `***x***`
  // nó bắt được `**x**` ở giữa và nhả ra `*x*` — người dùng vẫn thấy dấu sao,
  // đúng cái mà tệp này sinh ra để dọn. Muốn vá bằng regex thì phải dùng
  // lookbehind `(?<!\*)`, mà đó lại là thứ không chắc có trên mọi máy JS của RN.
  //
  // Phép quét dưới đây đòi dấu mở và dấu đóng là ĐÚNG HAI sao, không dính sao
  // thứ ba ở hai bên. Không khớp thì hiện NGUYÊN VĂN — không nuốt im, vì nuốt im
  // nghĩa là một playbook thiếu dấu sao đóng vẫn trông như bình thường.
  while (i < s.length) {
    const moDuoc =
      s[i] === '*' && s[i + 1] === '*' && s[i - 1] !== '*' && s[i + 2] !== '*';

    if (moDuoc) {
      let j = i + 2;
      while (j < s.length && s[j] !== '*') j += 1;
      const noiDung = s.slice(i + 2, j);
      const dongDuoc =
        j + 1 < s.length && s[j] === '*' && s[j + 1] === '*' && s[j + 2] !== '*';

      // Nội dung phải có chữ: `a ** ** b` không phải một đoạn đậm rỗng, nó là
      // hai cặp sao người ta gõ nhầm — và nuốt chúng đi thì câu mất hai ký tự mà
      // không được gì.
      if (dongDuoc && noiDung.trim()) {
        if (buf) {
          out.push({ text: buf, bold: false });
          buf = '';
        }
        out.push({ text: noiDung, bold: true });
        i = j + 2;
        continue;
      }
    }

    buf += s[i];
    i += 1;
  }
  if (buf) out.push({ text: buf, bold: false });

  return out;
}

const RichText: React.FC<{
  children: string;
  style?: StyleProp<TextStyle>;
  boldStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}> = ({ children, style, boldStyle, numberOfLines }) => {
  const segs = useMemo(() => parseBold(children), [children]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segs.map((s, i) =>
        s.bold ? (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={i} style={[styles.bold, boldStyle]}>
            {s.text}
          </Text>
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={i}>{s.text}</Text>
        ),
      )}
    </Text>
  );
};

const styles = StyleSheet.create({
  bold: { fontWeight: '800' },
});

export default RichText;
