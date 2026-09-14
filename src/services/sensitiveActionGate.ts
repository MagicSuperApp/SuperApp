/**
 * Cổng xác thực đứng trước các thao tác KHÔNG LẤY LẠI ĐƯỢC.
 *
 * ══ Vì sao cổng này tồn tại ══════════════════════════════════════════════════
 * Khoá gốc ví nằm trong Keychain/Keystore dưới
 * `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (`TaadEnclaveModule.swift:295`)
 * — KHÔNG `SecAccessControl`, không `.biometryAny`, không `.userPresence`. Nghĩa
 * là `secureLoad` trả khoá ra chỉ với điều kiện MÁY ĐÃ MỞ KHOÁ. Trước các bản vá
 * này, mọi đường tiêu tiền và mọi đường đụng danh tính đều đi qua mà không một
 * lần chạm sinh trắc: ai cầm máy đang mở là làm được hết.
 *
 * Điều đó đắt hơn kể từ khi một danh tính chạy được trên nhiều máy và nhiều app
 * cùng lúc (`keyAuthorizeService`): máy phụ thường là máy lỏng hơn — máy cũ, máy
 * mượn, app cài kèm — và hôm nay máy phụ có quyền ngang máy chính ở mọi luồng
 * nghiệp vụ (`phoenixKey-api.ts:1065`).
 *
 * ══ Ranh giới của nó — nói ra để không ai tin quá mức ════════════════════════
 * Cổng này KHÔNG chặn kẻ đã chiếm hẳn một máy: sinh trắc trên máy đó là sinh
 * trắc của người đang cầm nó. Cái nó chặn là máy để quên đang mở, máy cho mượn,
 * người đứng cạnh. Và nó nằm ở TẦNG APP — khoá vẫn đọc ra được bằng một lời gọi
 * `secureLoad` từ bất cứ đâu trong tiến trình. Chặn ở đúng tầng là việc của lớp
 * Enclave (nâng `kSecAttrAccessible…` lên `SecAccessControl`); cổng này gỡ đi
 * được khi tầng dưới đã chặn.
 *
 * ══ Cổng đặt ở ĐÂU, và ở đâu thì KHÔNG đặt ══════════════════════════════════
 * Chốt 13/09: chỉ đặt ở chỗ **RA TIỀN** và chỗ **MẤT DANH TÍNH** — nơi hỏng thì
 * không hoàn tác được. KHÔNG đặt ở chỗ chỉ ĐỌC (xem số dư, xem địa chỉ ví, xem
 * khoá công khai). Lý do không phải là lười: đặt cổng lên thao tác hằng ngày là
 * cách chắc nhất để người dùng tắt hẳn sinh trắc cho đỡ phiền — và lúc đó mất
 * luôn cổng ở những chỗ thật sự cần.
 *
 * `ExportIdentityScreen` là ca đã soát và CỐ Ý không gắn: nó chỉ hiện DID, khoá
 * công khai và địa chỉ ví — dữ liệu công khai. KEK ở đó chỉ dùng để derive khoá
 * công khai, không có gì bí mật rời khỏi máy.
 */

import { signRaw } from '../sdk/phoenixKey';
import { buildCanonicalHex } from './canonicalMessage';

/**
 * Tiền tố miền — mỗi thao tác một tiền tố RIÊNG.
 *
 * Dùng chung tiền tố thì một chữ ký lấy ở cổng này dùng lại được ở cổng kia của
 * cùng khoá. Các chuỗi này KHÔNG đi lên chuỗi khối và máy chủ không đọc chúng;
 * chúng chỉ tồn tại để hộp thoại của chip gắn với đúng việc đang duyệt.
 */
export const GATE_PREFIX = {
  /** Chuyển ADA/LAMP đi khỏi ví. */
  spend: 'PHOENIXKEY_SPEND:',
  /** Uỷ thác stake: đặt cọc khoá stake + đổi nơi nhận thưởng. */
  delegate: 'PHOENIXKEY_DELEGATE:',
  /** Gỡ một máy khỏi danh tính — máy đó mất quyền, không hoàn tác. */
  revokeDevice: 'PHOENIXKEY_REVOKE_DEVICE:',
  /** Ký một yêu cầu do bên ngoài soạn (WalletConnect-like). */
  signRequest: 'PHOENIXKEY_SIGN_REQUEST:',
} as const;

/**
 * Bật hộp thoại của CHIP và chỉ trả về khi chip đã đối chiếu xong sinh trắc.
 *
 * Vì sao là `signRaw`, KHÔNG phải `simplePrompt`: `simplePrompt()` bật hộp thoại
 * từ JS và trả về một `boolean` ở tầng JS — ai sửa được JS là qua được nó, và nó
 * không buộc chữ ký vào nội dung nào. `signRaw` để CHIP bật hộp thoại và chỉ trả
 * chữ ký khi chip đã đối chiếu xong (cùng lập luận ở `SeedExportScreen.tsx:62`).
 *
 * `fields` phải là NỘI DUNG THẬT của lần thao tác này (địa chỉ nhận, số tiền,
 * keyId sắp gỡ…). Ký một hằng số thì cổng vẫn bật hộp thoại, nhưng một lần duyệt
 * dùng lại được cho lần sau — hộp thoại không còn buộc vào việc nào cả.
 *
 * HÀM NÀY NÉM khi người dùng huỷ hoặc sinh trắc trượt. Để nó ném thẳng ra ngoài.
 * Bắt rồi đi tiếp là gỡ cổng mà vẫn giữ nguyên hình dạng của cổng.
 */
export async function requireUserPresence(args: {
  prefix: string;
  fields: string[];
  title: string;
  subtitle: string;
}): Promise<void> {
  await signRaw(
    buildCanonicalHex(args.prefix, ...args.fields),
    args.title,
    args.subtitle,
  );
}
