/**
 * accountDeletionService — xoá tài khoản theo yêu cầu kho ứng dụng (issue #144 mục 1.1).
 *
 * Apple 5.1.1(v) và Google Play đều BẮT BUỘC app có đường tự xoá tài khoản. App này tạo
 * danh tính (PhoenixKey DID) + thu email nên thuộc phạm vi.
 *
 * Hai phần, tách bạch:
 *
 *  1) PHÍA MÁY CHỦ — `requestRemoteDeletion`. Các backend (PhoenixKey/OriLife/Work/
 *     ProofChat) HIỆN CHƯA có cửa xoá theo DID (thư gửi 12/08). Nên tới khi có endpoint,
 *     hàm này KHÔNG giả vờ đã xoá: nó GHI yêu cầu qua remoteLogger để người trực xử lý
 *     tay, và trả `'pending'`. Bật `REMOTE_DELETE_ENABLED` + điền lời gọi thật khi backend
 *     mở cửa — màn hình không phải đổi.
 *
 *  2) PHÍA THIẾT BỊ — `wipeLocalIdentity`. Danh tính là non-custodial: khoá nằm trên máy.
 *     Xoá sạch khoá/DID/token/cache tức là tài khoản KHÔNG dùng lại được từ thiết bị này —
 *     đây là phần app toàn quyền làm THẬT ngay bây giờ.
 *
 * Cái KHÔNG xoá được (màn hình phải nói thẳng, Apple xét cả tính trung thực của mô tả):
 * dữ liệu đã neo lên chuỗi và véc-tơ đặc trưng đã gộp vào mô hình nhận diện chung.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearMasterKek } from './masterKekStore';
import { wipeIdentity } from '../sdk/phoenixKey';
import { clearOrilifeToken } from './orilifeDidAuth';
import rLog from './remoteLogger';

// Bật khi từng backend có cửa DELETE theo DID (issue #144 mục 1.1). Hiện = false.
const REMOTE_DELETE_ENABLED = false;

export type RemoteDeletionState = 'done' | 'pending' | 'failed';

/**
 * Yêu cầu máy chủ xoá dữ liệu gắn với DID. Chưa có endpoint → ghi yêu cầu cho người trực,
 * trả `'pending'` (KHÔNG bịa 'done'). KHÔNG ném.
 */
export async function requestRemoteDeletion(did: string | null | undefined): Promise<RemoteDeletionState> {
  if (!REMOTE_DELETE_ENABLED) {
    rLog.info('account_deletion_requested', { did: did ?? null, remote: 'pending' });
    return 'pending';
  }
  try {
    // TODO(#144): khi backend mở cửa, gọi DELETE theo DID cho từng backend tại đây
    // (PhoenixKey / OriLife / AladinWork / ProofChat), tổng hợp kết quả.
    rLog.info('account_deletion_requested', { did: did ?? null, remote: 'done' });
    return 'done';
  } catch (e) {
    rLog.error('account_deletion_remote_failed', { message: String(e) });
    return 'failed';
  }
}

/**
 * Xoá SẠCH danh tính + dữ liệu cục bộ. Best-effort từng bước — một bước lỗi KHÔNG chặn
 * các bước sau (phải cố xoá được nhiều nhất có thể). KHÔNG ném.
 *
 * Gọi SAU `dispatch(logoutUser())` (đóng DB per-user + xoá phiên xuyên module + nháp).
 */
export async function wipeLocalIdentity(): Promise<void> {
  // KHOÁ CHỦ TRONG CHIP PHẢI XOÁ TRƯỚC, và phải xoá ở đây chứ không chỗ nào khác.
  //
  // `clearMasterKek()` chỉ xoá KEK ví — nó nói thẳng "KHÔNG đụng khoá HW/DID"
  // (`masterKekStore.ts`). Trước bản này, xoá tài khoản để lại nguyên khoá owner
  // trong Secure Enclave/Keystore, nên lần đăng ký sau `isKeypairEnrolled()` vẫn
  // trả TRUE trong khi DID đã bị xoá khỏi máy ⇒ app rơi vào đường khôi phục, đăng
  // ký lại đúng khoá cũ, và người dùng nhận câu "máy đã có khoá nhưng chưa khôi
  // phục được danh tính" — kẹt cứng, không đăng ký mới được nữa.
  //
  // Phải chạy TRƯỚC `AsyncStorage.clear()`: `wipeIdentity()` đọc con trỏ alias
  // (`phoenixkey_owner_alias`) từ AsyncStorage mới biết khoá nào cần xoá. Xoá kho
  // trước thì khoá đã xoay (`_v2`, `_v3`…) thành khoá mồ côi, không ai xoá được nữa.
  try { await wipeIdentity(); } catch (e) { console.warn('[deleteAccount] wipeIdentity:', e); }
  try { await clearMasterKek(); } catch (e) { console.warn('[deleteAccount] clearMasterKek:', e); }
  try { await clearOrilifeToken(); } catch (e) { console.warn('[deleteAccount] clearOrilifeToken:', e); }
  // Dọn mọi khoá còn lại: DID, cache ảnh, sổ bằng chứng, ngôn ngữ, cờ onboarding…
  try { await AsyncStorage.clear(); } catch (e) { console.warn('[deleteAccount] AsyncStorage.clear:', e); }
}
