// services/signingFormatProbe.ts
//
// ĐO KHUÔN CHUỖI KÝ MÀ MÁY CHỦ NHẬN, THAY VÌ ĐOÁN NÓ
//
// ══ Vì sao có tệp này ═════════════════════════════════════════════════════════
// Máy chủ PhoenixKey đã đổi một số cửa sang khuôn ĐÓNG KHUNG THEO ĐỘ DÀI
// (`canonicalMessage.ts`), và một số cửa khác thì CỐ Ý không đổi. Danh sách đầy đủ
// chưa từng được khai ở đâu — không có trong tài liệu, không có trong thư. Nên với
// mỗi cửa còn lại, app đang ở một trong ba trạng thái và **không phân biệt được**:
//
//   1. máy chủ đã đổi sang đóng khung  → khuôn `':'` của app bị từ chối
//   2. máy chủ vẫn dùng `':'`          → lật sang đóng khung là TỰ LÀM HỎNG
//   3. chữ ký sai vì một lý do KHÁC    → đổi khuôn không cứu được gì
//
// Lật khuôn theo phỏng đoán là tung đồng xu trên một đường người dùng thật đang
// đi. Tệp này làm việc khác: **thử, rồi NHỚ khuôn máy chủ đã nhận.**
//
// ══ Ba ràng buộc, mỗi cái vá một cách hỏng riêng ═══════════════════════════════
//
// **Khuôn đang chạy đi TRƯỚC.** Chưa biết gì thì thử `':'` trước, vì đó là khuôn
// app đang dùng: một lượt dò không bao giờ được làm xấu hơn hiện trạng.
//
// **Nhớ rồi vẫn phải thử cái còn lại.** `formatsToTry` LUÔN trả đủ hai khuôn, chỉ
// đổi thứ tự. Máy chủ đổi khuôn sau ngày app nhớ thì dòng đã nhớ thành một lời
// khai sai, và một lời khai sai được ưu tiên còn tệ hơn không nhớ gì.
//
// **Nhớ theo TỪNG CỬA, không nhớ chung.** Máy chủ đổi từng cửa một, và bốn luồng
// `GENESIS_`/`RESOLVE_`/`LOOKUP_`/CLI thì cố ý không đổi. Suy khuôn của cửa này ra
// cửa khác là đúng cái sai mà tệp này dựng để tránh.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Khuôn chuỗi ký. `legacy-colon` = nối `':'`; `length-framed` = `buildCanonicalHex`. */
export type SigningFormat = 'legacy-colon' | 'length-framed';

/**
 * Cửa máy chủ đang dò. Mỗi cửa một dòng nhớ riêng — xem ràng buộc thứ ba ở đầu tệp.
 */
export type SigningFlow =
  | 'walletStandardRegister'
  | 'identityRecover'
  | 'orgMint'
  | 'orgFounding'
  | 'orgUpgrade';

const storageKey = (flow: SigningFlow): string => `signing_format_accepted_${flow}`;

const isSigningFormat = (v: string | null): v is SigningFormat =>
  v === 'legacy-colon' || v === 'length-framed';

/**
 * Khuôn mà máy chủ đã NHẬN ở lần gọi thành công gần nhất của cửa này; `null` khi
 * chưa đo được lần nào.
 *
 * Giá trị lạ trong ô nhớ (bản cũ ghi tên khác, dữ liệu bị sửa tay) đọc thành `null`
 * — tức "chưa biết", chứ không phải một khuôn thứ ba không ai dựng được.
 */
export async function getAcceptedFormat(flow: SigningFlow): Promise<SigningFormat | null> {
  const raw = await AsyncStorage.getItem(storageKey(flow));
  return isSigningFormat(raw) ? raw : null;
}

/** Ghi lại khuôn máy chủ vừa nhận cho cửa này. */
export async function rememberAcceptedFormat(
  flow: SigningFlow,
  format: SigningFormat,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(flow), format);
}

/** Bỏ dòng nhớ của một cửa. Dùng khi dựng lại danh tính hoặc khi cần đo lại từ đầu. */
export async function forgetAcceptedFormat(flow: SigningFlow): Promise<void> {
  await AsyncStorage.removeItem(storageKey(flow));
}

/**
 * Thứ tự thử cho một lượt gọi. LUÔN trả đủ hai khuôn — `remembered` chỉ quyết định
 * cái nào đi trước.
 *
 * Trả về một mảng mới mỗi lần gọi, để người gọi có sắp xếp lại cũng không đụng vào
 * hằng dùng chung.
 */
export function formatsToTry(remembered: SigningFormat | null): SigningFormat[] {
  if (remembered === 'length-framed') return ['length-framed', 'legacy-colon'];
  // Chưa biết gì, hoặc đã biết là `legacy-colon`: khuôn đang chạy đi trước.
  return ['legacy-colon', 'length-framed'];
}

/**
 * Lần gọi này bị từ chối vì CHỮ KÝ, tức đổi khuôn có thể cứu được.
 *
 * Hẹp có chủ ý. `403/1326` là mã máy chủ trả khi nó dựng lại chuỗi ký rồi thấy
 * Ed25519 không khớp. Mọi mã khác — `401` thiếu thẻ phiên, `409` đã đăng ký, `5xx`,
 * mất mạng — thì thử khuôn thứ hai chỉ tốn thêm một lượt gọi và một lần hỏi sinh
 * trắc, mà không trả lời được câu nào.
 *
 * ⚠️ Mã này KHÔNG tách được "app dựng khuôn khác máy chủ" với "thẻ phiên thuộc
 * người khác nên máy chủ dựng chuỗi bằng DID khác" — hai nguyên nhân, một mã.
 * Chỗ tách hai cái đó là `ensureSessionTokenBelongsTo`, chạy TRƯỚC lượt dò này.
 */
export function isSignatureRejection(httpStatus: number, code: number): boolean {
  return httpStatus === 403 && code === 1326;
}
