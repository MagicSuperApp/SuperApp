/**
 * Đầu đề `Authorization` cho api.orilife.io — và ĐỆM của nó.
 *
 * Vì sao tách khỏi `components/RemoteImage.tsx` (nơi nó ra đời):
 *   Đệm này giữ `Bearer <token>` trong BỘ NHỚ tới 30 giây. Xoá token trong kho mà
 *   không xoá đệm thì trong 30 giây kế tiếp mọi tấm ảnh vẫn đi kèm token của người
 *   VỪA đăng xuất. Chỗ duy nhất biết token bị xoá là `orilifeDidAuth`, mà một
 *   service thì không nên import một component để với tới hàm xoá đệm. Nên đệm
 *   chuyển xuống đây: cả `RemoteImage` lẫn `orilifeDidAuth` đều nhìn xuống, không
 *   ai nhìn ngang.
 *
 * Hàm xoá đệm trước đây tên `resetRemoteImageAuthCache`, có chú thích "gọi khi đăng
 * xuất / đổi tài-khoản" — và KHÔNG chỗ nào gọi. Nay `clearOrilifeToken()` gọi nó,
 * nên mọi đường xoá token đều kéo theo đệm.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Khoá kho token field-reid. Nguồn ghi: `services/orilifeDidAuth.ts`. */
export const AUTH_TOKEN_KEY = 'auth_token';

/** Đệm trong bộ nhớ: một dải ảnh không nên đọc AsyncStorage mỗi tấm. */
let _headerCache: { at: number; value: string | null } | null = null;
const HEADER_TTL_MS = 30_000;

/** Xoá đệm. `clearOrilifeToken()` gọi hàm này — đừng để nó thành hàm chết lần nữa. */
export function resetOrilifeAuthHeaderCache(): void {
  _headerCache = null;
}

/** `Bearer <auth_token>`, hoặc null. KHÔNG ném, KHÔNG log giá-trị token. */
export async function orilifeAuthHeaderValue(force = false): Promise<string | null> {
  if (!force && _headerCache && Date.now() - _headerCache.at < HEADER_TTL_MS) {
    return _headerCache.value;
  }
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    const value = token ? `Bearer ${token}` : null;
    _headerCache = { at: Date.now(), value };
    return value;
  } catch {
    // Lỗi đọc kho: KHÔNG ghi đệm (để lần sau còn thử lại), và KHÔNG nổ.
    return null;
  }
}
