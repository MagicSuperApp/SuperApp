/**
 * Cờ bật/tắt Ví tổ chức — tạo OrgDID + mint LAMP bằng OrgDID.
 *
 * MẶC ĐỊNH = false vì mint LAMP CHƯA chạy thật:
 *   1. Cap/authority/redeemer còn CHỜ LAMP hợp nhất design lên main (main CountMint
 *      vs branch DistributionVest/ReserveDraw). Chưa biết chữ ký OrgDID controller
 *      có đủ authorize không hay cần dist_authority riêng.
 *   2. Phần DỰNG + KÝ CBOR chạy ở Enclave NATIVE — chưa ráp buildAndSignTx.
 *   3. Endpoint claim/vesting-release (bước 2 đưa LAMP về ví) PhoenixKey CHƯA cấp.
 *
 * Khi false: các màn OrgDID/Mint vẫn XEM được (UX review), nhưng nút thao tác
 * disabled và orgMintService ném OrgMintDisabledError trước khi gọi mạng.
 *
 * Bật = đặt ORG_MINT_ENABLED=true trong .env SAU khi (1)(2)(3) trên xong VÀ đã
 * đối-chiếu shape API thật ở src/services/orgMint-api.ts.
 */

// @ts-ignore — provided by react-native-dotenv at build time.
import { ORG_MINT_ENABLED } from '@env';

export function isOrgMintEnabled(): boolean {
  return String(ORG_MINT_ENABLED ?? '').toLowerCase() === 'true';
}
