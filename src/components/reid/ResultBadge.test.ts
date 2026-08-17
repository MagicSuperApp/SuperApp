/**
 * Khoá lại: `decision == "MATCH"` KHÔNG được trình bày như một câu trả lời đúng.
 *
 * Số đo OriLife: MATCH chỉ đúng **19/37 = 51,4%**. Biên giữa ứng viên nhất và
 * nhì có trung vị 0,030, thấp nhất 0,002 — hệ gần như luôn "chắc chắn" trên một
 * khoảng cách mỏng như thế. Dấu tích xanh ở tỉ lệ đó nói dối khoảng một nửa số
 * lần, và nói dối theo hướng nông dân tin: họ gắn nhãn rồi đi bán.
 *
 * Test này là hàng rào. Ai muốn trả dấu tích về thì phải xoá nó, và lúc đó phải
 * nhìn thấy con số 19/37.
 */
import { DECISION_COLORS, DECISION_ICONS, TREE_LABELS, ANIMAL_LABELS } from './ResultBadge';

describe('ResultBadge — MATCH là TIN BÁO, không phải kết luận', () => {
  it('MATCH không dùng biểu-tượng dấu tích', () => {
    expect(DECISION_ICONS.MATCH).not.toBe('check-circle');
    expect(DECISION_ICONS.MATCH).not.toMatch(/check/i);
  });

  it('nhãn MATCH không chứa ký-tự ✓', () => {
    expect(TREE_LABELS.MATCH).not.toContain('✓');
    expect(ANIMAL_LABELS.MATCH).not.toContain('✓');
  });

  it('nhãn MATCH nói rõ đây là MÁY đoán, không phải sự thật', () => {
    expect(TREE_LABELS.MATCH).toMatch(/máy đoán/i);
    expect(ANIMAL_LABELS.MATCH).toMatch(/máy đoán/i);
  });

  it('MATCH không mang màu xanh lá — xanh lá giữ riêng cho thứ NGƯỜI đã xác nhận', () => {
    // Xanh lá trong bảng cũ là '#1b5e20'. Kiểm theo kênh màu cho chắc: không
    // được là màu mà kênh lục trội hơn hẳn hai kênh kia.
    const hex = DECISION_COLORS.MATCH;
    expect(hex).not.toBe('#1b5e20');
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    expect(g > r + 24 && g > b + 24).toBe(false);
  });

  it('MATCH vẫn phân biệt được với UNCERTAIN và NO_MATCH', () => {
    expect(DECISION_COLORS.MATCH).not.toBe(DECISION_COLORS.UNCERTAIN);
    expect(DECISION_COLORS.MATCH).not.toBe(DECISION_COLORS.NO_MATCH);
  });
});
