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
 * ⛔ Mốc so sánh là ĐÁY KHUNG NHÌN CỦA VÙNG CUỘN, KHÔNG phải đỉnh bàn phím.
 *
 * Hai thứ đó từng được coi là một, và đó là lỗi của lượt sửa trước tệp này. Màn
 * ghi hoạt động đặt thanh nút "Lưu" làm anh em THỨ HAI bên trong
 * `KeyboardAvoidingView`, ngay sau vùng cuộn — chính là bản vá đã phải làm để thanh
 * nút thôi bị bàn phím che. Hệ quả: `KeyboardAvoidingView` co lại tới đúng đỉnh bàn
 * phím, thanh nút không co (`flexShrink` mặc định 0) còn `ScrollView` thì co hết
 * phần chênh (`ScrollView.js` khai `flexGrow: 1, flexShrink: 1`), nên
 *
 *     đáy khung nhìn của vùng cuộn  =  đỉnh bàn phím  −  chiều cao thanh nút
 *
 * Thanh nút cao khoảng 117 điểm (viền 1 + đệm trên 12 + dòng chi phí ~25 + khe 10 +
 * nút Lưu ~57 + đệm dưới 12), còn ô nhập vật tư chỉ cao khoảng 35. Nhắm đáy ô vào
 * đỉnh bàn phím tức là nhắm vào giữa thanh nút: màn giật lên hai trăm điểm rồi ô
 * VẪN bị che — đổi từ bàn phím che sang nút Lưu che. Và không có ca nào ô ló ra,
 * vì muốn ló thì ô phải cao hơn cả thanh nút.
 *
 * Lấy thẳng đáy khung nhìn còn sửa được một lỗi thứ hai mà không cần thêm mã: trên
 * Android `measureInWindow` trả toạ độ so với khung cửa sổ NHÌN THẤY (đã trừ thanh
 * trạng thái) trong khi `Dimensions.get('window').height` là chiều cao toàn màn,
 * nên "đỉnh bàn phím = chiều cao cửa sổ − chiều cao bàn phím" lệch đúng chiều cao
 * thanh trạng thái, và lệch hàng trăm điểm khi chia đôi màn hình. Đo cả hai số
 * bằng cùng một phép `measureInWindow` thì không còn hai hệ quy chiếu để lệch.
 *
 * @param inputTop      đỉnh ô đang gõ, toạ độ CỬA SỔ
 * @param inputHeight   chiều cao ô đang gõ
 * @param visibleBottom đáy khung nhìn của vùng cuộn, toạ độ CỬA SỔ (`y + height`
 *                      của chính `ScrollView`, đo SAU khi bàn phím đã co nó)
 * @param currentOffset vị trí cuộn hiện tại của vùng cuộn
 * @param gap           khoảng hở muốn chừa dưới ô
 * @returns vị trí cuộn mới, hoặc `null` khi ô đã nằm trọn trong khung nhìn.
 */
export function scrollOffsetToRevealInput(args: {
  inputTop: number;
  inputHeight: number;
  visibleBottom: number;
  currentOffset: number;
  gap: number;
}): number | null {
  const { inputTop, inputHeight, visibleBottom, currentOffset, gap } = args;

  // Phần đáy ô (cộng khoảng hở) đang thò xuống dưới đáy khung nhìn.
  const hidden = inputTop + inputHeight + gap - visibleBottom;
  if (hidden <= 0) return null;

  // Cuộn thêm ĐÚNG phần bị che. Kẹp ở 0 để không kéo ngược nội dung xuống khi
  // vùng cuộn đang ở đầu và số đo tới muộn hơn một nhịp bố cục.
  return Math.max(0, currentOffset + hidden);
}

/** Khoảng hở dưới ô đang gõ — đủ để thấy mình gõ vào đâu, không phí chỗ. */
export const KEYBOARD_INPUT_GAP = 12;
