/**
 * Bản gương luật đặt tên máy phải khớp `KeyServiceImpl.validateDeviceName`.
 *
 * Ba nhóm dưới đây khoá ba thứ khác nhau, và nhóm thứ ba mới là nhóm đáng có:
 * hai nhóm đầu chỉ nói "hàm chạy đúng như tôi vừa viết", nhóm ba nói "hàm chạy
 * đúng như MÁY CHỦ", tức là nó đỏ khi bản gương trôi khỏi bản gốc.
 */
import { checkDeviceName, DEVICE_NAME_MAX_LEN } from './deviceName';

const okValue = (raw: string) => {
  const r = checkDeviceName(raw);
  if (!r.ok) throw new Error(`đáng lẽ hợp lệ, lại bị chặn: ${r.message}`);
  return r.value;
};

describe('cắt trước, đo sau — đúng thứ tự máy chủ', () => {
  it('cắt hai đầu rồi mới trả về, để cái được duyệt cũng là cái được lưu', () => {
    expect(okValue('  iPhone của Thư  ')).toBe('iPhone của Thư');
  });

  it('chuỗi chỉ có khoảng trắng là RỖNG, không phải "đủ dài"', () => {
    // Máy chủ `trim()` trước `isEmpty()`. Nếu bản gương đo độ dài trước khi cắt
    // thì "   " lọt qua đây rồi bị máy chủ đá về bằng 3012 — mã số vô nghĩa với
    // người đang đứng ở ô nhập.
    expect(checkDeviceName('   ').ok).toBe(false);
    expect(checkDeviceName('\t\n ').ok).toBe(false);
  });

  it('đúng 100 ký tự thì nhận, 101 thì chặn — biên nằm đúng chỗ máy chủ đặt', () => {
    expect(checkDeviceName('a'.repeat(DEVICE_NAME_MAX_LEN)).ok).toBe(true);
    expect(checkDeviceName('a'.repeat(DEVICE_NAME_MAX_LEN + 1)).ok).toBe(false);
  });

  it('đo SAU khi cắt: 100 ký tự kèm khoảng trắng thừa vẫn hợp lệ', () => {
    expect(okValue(`  ${'a'.repeat(DEVICE_NAME_MAX_LEN)}  `)).toHaveLength(DEVICE_NAME_MAX_LEN);
  });
});

describe('ký tự phá bố cục — đúng danh sách của isLayoutBreaking', () => {
  /**
   * Từng khoảng mã một, KHÔNG gộp. Gộp lại thì một lần nới/siết bên máy chủ sẽ
   * làm bài này đỏ mà không chỉ được ra khoảng nào lệch.
   */
  const CHAN: Array<[string, string]> = [
    ['C0 (điều khiển)', ''],
    ['C1 (điều khiển)', ''],
    ['gạch nối mềm U+00AD', '­'],
    ['ZWSP U+200B', '​'],
    ['RLM U+200F', '‏'],
    ['ngắt dòng U+2028', ' '],
    ['ngắt đoạn U+2029', ' '],
    ['LRE U+202A', '‪'],
    ['RLO U+202E', '‮'],
    ['word-joiner U+2060', '⁠'],
    ['vô hình U+2064', '⁤'],
    ['LRI U+2066', '⁦'],
    ['PDI U+2069', '⁩'],
    ['BOM U+FEFF', '﻿'],
  ];

  it.each(CHAN)('chặn %s', (_ten, c) => {
    expect(checkDeviceName(`May ${c}cua toi`).ok).toBe(false);
  });

  it('vì sao chặn: U+202E làm cái tên HIỆN RA khác cái tên được LƯU', () => {
    // Đây là lý do luật này tồn tại, không phải "cấm ký tự lạ" cho sạch. Trong
    // một danh sách mà người ta nhìn để quyết định gỡ máy nào, một cái tên nói
    // dối được là một lỗ thật.
    expect(checkDeviceName('May cua ‮iot').ok).toBe(false);
  });

  it('KHÔNG chặn tiếng Việt có dấu, emoji, hay khoảng trắng ở giữa', () => {
    // Cái giá của việc chép luật sai theo chiều siết: người dùng bị từ chối một
    // cái tên mà máy chủ sẵn sàng nhận, và không ai biết vì sao.
    expect(okValue('Điện thoại của Thư 📱')).toBe('Điện thoại của Thư 📱');
    expect(okValue('Máy bàn — phòng kỹ thuật')).toBe('Máy bàn — phòng kỹ thuật');
    expect(okValue('Nguyễn Văn Ánh Đường')).toBe('Nguyễn Văn Ánh Đường');
  });

  it('emoji ngoài BMP không bị nhầm là ký tự cấm', () => {
    // Duyệt theo code point: một cặp thế thân ghép lại ra U+1F4F1, nằm ngoài mọi
    // khoảng cấm. Nếu duyệt theo đơn vị UTF-16 thì cũng vẫn qua — nhưng bài này
    // giữ cho lần viết lại sau đừng vô tình cấm nửa cặp.
    expect(checkDeviceName('\u{1F4F1}').ok).toBe(true);
  });
});

describe('độ dài đếm theo đơn vị UTF-16, giống String.length() của Java', () => {
  it('50 emoji = 100 đơn vị = vừa đúng biên', () => {
    // Máy chủ đo bằng `String.length()` (đơn vị UTF-16), không phải số code
    // point. Nếu bản gương đếm code point thì 50 emoji ra 50 và ta gửi đi một
    // cái tên bị máy chủ đá về — sai lệch câm đúng nghĩa.
    expect(checkDeviceName('\u{1F4F1}'.repeat(50)).ok).toBe(true);
    expect(checkDeviceName('\u{1F4F1}'.repeat(51)).ok).toBe(false);
  });
});
