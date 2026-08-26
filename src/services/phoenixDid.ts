/**
 * Khuôn `did:phoenix` — CỐ Ý LỎNG, và phải giữ lỏng.
 *
 * ══ Vì sao ════════════════════════════════════════════════════════════════
 * Bản trước ghim `[a-z2-7]+:[0-9a-f]{64}` — tức base32 rồi 64 hex. Đó là khuôn
 * bộ sinh **hiện hành** đang cho ra, không phải khuôn của phương thức DID. Nhà
 * PhoenixKey báo (2026-08-26): khuôn đang được chốt lại, bản khớp byte với cổng
 * mint on-chain (`DidPopBindGenerator`) render **đoạn giữa bằng THẬP PHÂN**, và
 * bản đó đã có mã, chỉ nằm sau một công tắc mặc định TẮT. Chính
 * `DidPhoenixGenerator` tự khai DID nó sinh ra "KHÔNG mint được anchor dưới
 * validator hiện hành". Ngày công tắc bật, chữ số `0,1,8,9` xuất hiện ở đoạn
 * giữa và `[a-z2-7]` từ chối một DID hoàn toàn hợp lệ.
 *
 * Cái giá của việc từ chối nhầm ở đây KHÔNG nhỏ: `assertSupportedBackendDid`
 * **ném**, và `isMalformedPhoenixDid` dẫn thẳng vào `recoverLocalIdentityFromKey`
 * — đường dựng lại danh tính. Ghim sai khuôn không phải là "hiện một cảnh báo",
 * mà là chặn đăng nhập và mời người dùng đi làm lại danh tính của họ.
 *
 * ══ Giữ gì, bỏ gì ═════════════════════════════════════════════════════════
 * GIỮ phần KHÔNG đổi theo bộ sinh: tiền tố `did:phoenix:` và **đúng hai đoạn**
 * sau nó, cả hai không rỗng, không khoảng trắng. Chừng đó đủ chặn thứ đang thật
 * sự đi lạc vào đây — `did:phoenix:pending:tree:<uuid>` và
 * `did:phoenix:orilife:tree:<uuid>` mà máy chủ OriLife trả dưới tên `entity_did`
 * (`phoenixkey_integration.py:170,199`) có BA đoạn, nên vẫn bị chặn.
 *
 * BỎ bảng chữ cái và độ dài của từng đoạn. Việc kiểm chúng thuộc về nhà cấp DID,
 * không thuộc về app. App nhận chuỗi mờ và để máy chủ phán.
 *
 * ⚠ ĐỪNG ghim lại khuôn chi tiết ở bất kỳ đâu trong kho này, kể cả "cho chắc".
 * Đó là lời nhắn thẳng của nhà PhoenixKey, và lý do là chi phí đổi tăng theo số
 * DID đã cấp.
 */
export const PHOENIX_DID_RE = /^did:phoenix:[^\s:]+:[^\s:]+$/;

/**
 * `did:cardano` thì NGƯỢC LẠI — giữ chặt.
 *
 * Khuôn này app **đọc nghĩa** từ chuỗi: `parseDidNetwork` bóc tên mạng ra để
 * quyết định gọi preprod hay mainnet. Nới nó ra là để một chuỗi lạ tự khai mạng.
 * Đây là DID cũ, không còn được cấp mới, nên nó cũng không đổi khuôn nữa.
 */
export const CARDANO_DID_RE = /^did:cardano:(mainnet|preprod|preview):[0-9a-f]{64}$/;

export type CardanoNetwork = 'mainnet' | 'preprod' | 'preview';

/**
 * Lấy mạng Cardano TỪ chính DID (định danh thật), không đoán.
 * - did:cardano:<network>:<hash> → network nằm thẳng trong chuỗi DID.
 * - did:phoenix:<slot>:<hash>   → mạng KHÔNG nằm trong chuỗi (phải hỏi backend),
 *   trả null để caller resolve qua /document hoặc fallback env.
 */
export function parseDidNetwork(
  did: string | null | undefined,
): CardanoNetwork | null {
  if (typeof did !== 'string') return null;
  const m = CARDANO_DID_RE.exec(did);
  return m ? (m[1] as CardanoNetwork) : null;
}

/**
 * Chuỗi có ĐÚNG HÌNH DẠNG một `did:phoenix` không. KHÔNG khẳng định nó tồn tại,
 * không khẳng định nó đúng bộ sinh nào — xem khối chú thích ở `PHOENIX_DID_RE`.
 */
export function isCanonicalPhoenixDid(did: string | null | undefined): did is string {
  return typeof did === 'string' && PHOENIX_DID_RE.test(did);
}

export function isLegacyCardanoDid(did: string | null | undefined): did is string {
  return typeof did === 'string' && CARDANO_DID_RE.test(did);
}

export function isSupportedBackendDid(did: string | null | undefined): did is string {
  return isCanonicalPhoenixDid(did) || isLegacyCardanoDid(did);
}

export function isMalformedPhoenixDid(did: string | null | undefined): boolean {
  return typeof did === 'string' && did.startsWith('did:phoenix:') && !isCanonicalPhoenixDid(did);
}

export function assertSupportedBackendDid(did: string, context = 'PhoenixKey DID'): string {
  if (!isSupportedBackendDid(did)) {
    throw new Error(`${context} không đúng định dạng backend: ${did}`);
  }
  return did;
}
