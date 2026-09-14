/**
 * Cuộn vừa đủ để ô đang gõ thoát khỏi bàn phím.
 *
 * ⛔ Vì sao KHÔNG dùng `scrollToEnd`, dù bản vá trước đã dùng:
 *
 * `scrollToEnd` cuộn tới CUỐI NỘI DUNG, không cuộn tới ô đang gõ —
 * `RCTScrollViewComponentView.mm` tính đích bằng
 * `contentSize.height − bounds.size.height + contentInset.bottom`, không có một
 * tham chiếu nào tới nút đang focus. Nó chỉ tình cờ đúng khi ô đang gõ là thứ
 * cuối cùng của vùng cuộn. Màn ghi hoạt động không ở trạng thái đó: danh sách
 * vật tư thêm được dòng, nên từ dòng thứ hai trở đi, chạm vào ô của dòng ĐẦU sẽ
 * cuộn thẳng xuống đáy và đẩy chính ô đó ra khỏi mép trên. Đó là một lỗi khác,
 * không phải lỗi cũ chưa vá.
 *
 * Phép đúng chỉ cần bốn số, và cả bốn đều lấy trong HỆ TOẠ ĐỘ CỬA SỔ, nên nó
 * không phụ thuộc chiều cao thanh tiêu đề, số dòng vật tư, hay `KeyboardAvoidingView`
 * đã co xong hay chưa. Vùng cuộn co lại KHÔNG dời nội dung, nên vị trí của ô
 * trong cửa sổ giữ nguyên suốt lúc bàn phím trượt lên.
 *
 * @param inputTop      đỉnh ô đang gõ, toạ độ CỬA SỔ
 * @param inputHeight   chiều cao ô đang gõ
 * @param keyboardTop   đỉnh bàn phím, toạ độ CỬA SỔ (= chiều cao cửa sổ − chiều cao bàn phím)
 * @param currentOffset vị trí cuộn hiện tại của vùng cuộn
 * @param gap           khoảng hở muốn chừa giữa đáy ô và đỉnh bàn phím
 * @returns vị trí cuộn mới, hoặc `null` khi ô đã nằm trọn trên bàn phím (KHÔNG cuộn).
 */
export function scrollOffsetToRevealInput(args: {
  inputTop: number;
  inputHeight: number;
  keyboardTop: number;
  currentOffset: number;
  gap: number;
}): number | null {
  const { inputTop, inputHeight, keyboardTop, currentOffset, gap } = args;

  // Phần đáy ô (cộng khoảng hở) đang thò xuống dưới đỉnh bàn phím.
  const hidden = inputTop + inputHeight + gap - keyboardTop;
  if (hidden <= 0) return null;

  // Cuộn thêm ĐÚNG phần bị che. Kẹp ở 0 để không kéo ngược nội dung xuống khi
  // vùng cuộn đang ở đầu và số đo tới muộn hơn một nhịp bố cục.
  return Math.max(0, currentOffset + hidden);
}

/** Khoảng hở dưới ô đang gõ — đủ để thấy mình gõ vào đâu, không phí chỗ. */
export const KEYBOARD_INPUT_GAP = 12;
