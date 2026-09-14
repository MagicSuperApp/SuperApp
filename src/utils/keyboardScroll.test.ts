/**
 * Cuộn ô đang gõ vào tầm nhìn — kiểm ở đúng hai cực mà hai lượt vá trước làm sai.
 *
 * Cực 1 (lượt vá 2): `scrollToEnd` cuộn tới CUỐI NỘI DUNG. Nó trùng kết quả với
 * phép đúng ở một ca duy nhất — ô đang gõ là thứ cuối cùng — và màn ghi hoạt động
 * không ở ca đó vì danh sách vật tư thêm được dòng.
 *
 * Cực 2 (lượt vá 3): nhắm đáy ô vào ĐỈNH BÀN PHÍM, trong khi giữa vùng cuộn và bàn
 * phím còn thanh nút "Lưu" cao hơn cả ô nhập. Ô rơi trọn xuống dưới mép nhìn thấy.
 * Ca `thanh nút Lưu đứng giữa` dưới đây là ca tách hai mốc đó ra, và nó phải ĐỎ khi
 * ai đó lấy lại đỉnh bàn phím làm mốc.
 */
import { scrollOffsetToRevealInput, KEYBOARD_INPUT_GAP } from './keyboardScroll';

/** Cửa sổ 874 điểm (iPhone 17), bàn phím 336 → đỉnh bàn phím ở y=538. */
const KEYBOARD_TOP = 874 - 336;
/** Thanh nút "Lưu" nằm giữa vùng cuộn và bàn phím. */
const BOTTOM_BAR = 117;
/** Đáy khung nhìn THẬT của vùng cuộn. */
const VISIBLE_BOTTOM = KEYBOARD_TOP - BOTTOM_BAR; // 421

/** Ô nằm ở đâu sau khi cuộn tới `target`. */
const topAfter = (inputTop: number, currentOffset: number, target: number) =>
  inputTop - (target - currentOffset);

describe('scrollOffsetToRevealInput', () => {
  it('ô đã nằm trọn trong khung nhìn thì KHÔNG cuộn', () => {
    // Trả `null` chứ không trả `currentOffset`: hai thứ đó khác nhau ở chỗ gọi —
    // `null` nghĩa là đừng gọi `scrollTo`, còn trả số thì vẫn phát một lệnh cuộn
    // và nuốt mất cú chạm của người dùng đang kéo danh sách.
    expect(scrollOffsetToRevealInput({
      inputTop: 200, inputHeight: 44,
      visibleBottom: VISIBLE_BOTTOM, currentOffset: 0, gap: KEYBOARD_INPUT_GAP,
    })).toBeNull();
  });

  it('ô bị che thì cuộn ĐÚNG phần bị che, không hơn không kém', () => {
    // Đáy ô 600+44 = 644, cộng khoảng hở 12 → 656. Đáy khung nhìn 421. Thiếu 235.
    const target = scrollOffsetToRevealInput({
      inputTop: 600, inputHeight: 44,
      visibleBottom: VISIBLE_BOTTOM, currentOffset: 0, gap: KEYBOARD_INPUT_GAP,
    })!;
    expect(target).toBe(235);
    // Và phát biểu lại bằng đại lượng người dùng thấy: đáy ô đúng bằng đáy khung
    // nhìn trừ khoảng hở. Vế này mới là thứ ghim công thức; con số trên chỉ là nó
    // viết ra một lần.
    expect(topAfter(600, 0, target) + 44 + KEYBOARD_INPUT_GAP).toBe(VISIBLE_BOTTOM);
  });

  it('cộng dồn vào vị trí cuộn ĐANG có, không cuộn về mốc tuyệt đối', () => {
    const target = scrollOffsetToRevealInput({
      inputTop: 600, inputHeight: 44,
      visibleBottom: VISIBLE_BOTTOM, currentOffset: 250, gap: KEYBOARD_INPUT_GAP,
    })!;
    expect(target).toBe(485);
    expect(target - 250).toBe(235); // vẫn đúng quãng che, chỉ dời điểm xuất phát
  });

  it('thanh nút Lưu đứng giữa — ô phải lên TRÊN thanh nút, không phải trên bàn phím', () => {
    // Đây là cực mà lượt vá 3 sai. Ô nằm ngay dưới mép khung nhìn một chút.
    const inputTop = 440;
    const inputHeight = 35;
    const currentOffset = 100;

    const target = scrollOffsetToRevealInput({
      inputTop, inputHeight,
      visibleBottom: VISIBLE_BOTTOM, currentOffset, gap: KEYBOARD_INPUT_GAP,
    })!;
    const after = topAfter(inputTop, currentOffset, target);

    // Đáy ô phải nằm TRÊN đỉnh thanh nút, tức trên đáy khung nhìn.
    expect(after + inputHeight).toBeLessThanOrEqual(VISIBLE_BOTTOM);

    // Và phải chặt hơn hẳn phép cũ: lấy đỉnh bàn phím làm mốc thì đáy ô rơi xuống
    // 538−12 = 526, tức nằm sâu 105 điểm bên trong thanh nút — người dùng không
    // thấy gì, sau một cú giật màn hình.
    const cuOnKeyboardTop = currentOffset + (inputTop + inputHeight + KEYBOARD_INPUT_GAP - KEYBOARD_TOP);
    expect(topAfter(inputTop, currentOffset, cuOnKeyboardTop) + inputHeight)
      .toBeGreaterThan(VISIBLE_BOTTOM);
    expect(target).toBeGreaterThan(cuOnKeyboardTop);
  });

  it('dòng vật tư thứ hai — ô của dòng ĐẦU không bị đẩy khỏi mép trên', () => {
    // Cực của lượt vá 2. Nông dân bấm "thêm dòng" nên nội dung dài thêm, rồi quay
    // lên chạm ô TÊN của dòng đầu. `scrollToEnd` sẽ nhắm tới cuối nội dung và đẩy
    // chính ô vừa chạm lên trên mép trên.
    const inputTop = 430;
    const inputHeight = 35;
    const currentOffset = 100;

    const target = scrollOffsetToRevealInput({
      inputTop, inputHeight,
      visibleBottom: VISIBLE_BOTTOM, currentOffset, gap: KEYBOARD_INPUT_GAP,
    })!;
    expect(topAfter(inputTop, currentOffset, target)).toBeGreaterThan(0);

    // Nội dung 1400, khung nhìn cao 421−130 = 291 → `scrollToEnd` nhắm 1109.
    const scrollToEndTarget = 1400 - 291;
    expect(target).toBeLessThan(scrollToEndTarget);
    expect(topAfter(inputTop, currentOffset, scrollToEndTarget)).toBeLessThan(0);
  });

  it('vùng cuộn đang căng dây chun (offset ÂM) thì không trả đích âm', () => {
    // iOS cho `contentOffset.y` âm ở mép trên. Không kẹp thì `scrollTo` nhận một
    // số âm và kéo nội dung xuống dưới mốc 0 — ô đang gõ đi xa thêm.
    const target = scrollOffsetToRevealInput({
      inputTop: 430, inputHeight: 35,
      visibleBottom: VISIBLE_BOTTOM, currentOffset: -60, gap: KEYBOARD_INPUT_GAP,
    })!;
    expect(target).toBe(0);
  });
});
