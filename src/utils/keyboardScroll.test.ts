/**
 * Cuộn ô đang gõ thoát bàn phím — kiểm ở đúng cực mà bản vá trước làm sai.
 *
 * Bản vá trước dùng `scrollToEnd`, tức cuộn tới CUỐI NỘI DUNG. Nó trùng kết quả
 * với phép đúng ở một ca duy nhất: ô đang gõ là thứ cuối cùng của vùng cuộn. Ca
 * "dòng vật tư thứ hai" dưới đây là ca tách hai phép đó ra, và nó chính là ca
 * xảy ra ngoài thực địa ngay khi nông dân bấm "thêm dòng".
 */
import { scrollOffsetToRevealInput, KEYBOARD_INPUT_GAP } from './keyboardScroll';

/** Cửa sổ 874 điểm (iPhone 17), bàn phím 336 → đỉnh bàn phím ở y=538. */
const KEYBOARD_TOP = 874 - 336;

describe('scrollOffsetToRevealInput', () => {
  it('ô đã nằm trọn trên bàn phím thì KHÔNG cuộn', () => {
    // Trả `null` chứ không trả `currentOffset`: hai thứ đó khác nhau ở chỗ gọi —
    // `null` nghĩa là đừng gọi `scrollTo`, còn trả số thì vẫn phát một lệnh cuộn
    // và nuốt mất cú chạm của người dùng đang kéo danh sách.
    expect(scrollOffsetToRevealInput({
      inputTop: 200, inputHeight: 44,
      keyboardTop: KEYBOARD_TOP, currentOffset: 0, gap: KEYBOARD_INPUT_GAP,
    })).toBeNull();
  });

  it('ô bị bàn phím che thì cuộn ĐÚNG phần bị che', () => {
    // Đáy ô ở 600+44 = 644, cộng khoảng hở 12 → 656. Đỉnh bàn phím 538.
    // Thiếu 118 điểm, và cuộn thêm đúng 118.
    expect(scrollOffsetToRevealInput({
      inputTop: 600, inputHeight: 44,
      keyboardTop: KEYBOARD_TOP, currentOffset: 0, gap: KEYBOARD_INPUT_GAP,
    })).toBe(118);
  });

  it('cộng dồn vào vị trí cuộn ĐANG có, không cuộn về mốc tuyệt đối', () => {
    expect(scrollOffsetToRevealInput({
      inputTop: 600, inputHeight: 44,
      keyboardTop: KEYBOARD_TOP, currentOffset: 250, gap: KEYBOARD_INPUT_GAP,
    })).toBe(368);
  });

  it('dòng vật tư thứ hai — ô của dòng ĐẦU không bị đẩy khỏi mép trên', () => {
    // Đây là cực mà `scrollToEnd` sai. Dựng lại đúng cảnh thực địa: nông dân bấm
    // "thêm dòng" nên nội dung dài thêm, rồi quay lên chạm ô TÊN của dòng đầu.
    // Ô đó chỉ bị che vài chục điểm.
    const inputTop = 520;
    const inputHeight = 44;
    const currentOffset = 100;

    const target = scrollOffsetToRevealInput({
      inputTop, inputHeight,
      keyboardTop: KEYBOARD_TOP, currentOffset, gap: KEYBOARD_INPUT_GAP,
    })!;

    // Cuộn xong, ô phải nằm TRỌN trên bàn phím và vẫn ở trong khung nhìn —
    // đáy ô đúng bằng đỉnh bàn phím trừ khoảng hở.
    const inputTopAfterScroll = inputTop - (target - currentOffset);
    expect(inputTopAfterScroll + inputHeight + KEYBOARD_INPUT_GAP).toBe(KEYBOARD_TOP);
    expect(inputTopAfterScroll).toBeGreaterThan(0); // chưa trôi khỏi mép trên

    // Và phải NHỎ HƠN hẳn đích của `scrollToEnd`. Vùng cuộn cao 538 (tới đỉnh bàn
    // phím), nội dung 1400 → `scrollToEnd` nhắm tới 1400−538 = 862, đẩy ô đang gõ
    // lên trên mép trên 342 điểm. Đó đúng là lỗi bản vá trước để lại.
    const scrollToEndTarget = 1400 - 538;
    expect(target).toBeLessThan(scrollToEndTarget);
    expect(inputTop - (scrollToEndTarget - currentOffset)).toBeLessThan(0);
  });

  it('không kéo ngược nội dung xuống dưới mốc 0', () => {
    expect(scrollOffsetToRevealInput({
      inputTop: 530, inputHeight: 44,
      keyboardTop: KEYBOARD_TOP, currentOffset: 0, gap: KEYBOARD_INPUT_GAP,
    })).toBeGreaterThanOrEqual(0);
  });
});
