declare module '@env' {
  export const ALADIN_API_URL: string;
  export const ALADIN_API_KEY: string;
  export const ALADIN_REGION_CODE: string;
  export const PHOENIXKEY_API_URL: string;
  export const PHOENIX_WALLET_ENABLED: string;
  export const ORG_MINT_ENABLED: string;
  export const MESHAPI_USE_MOCK: string;
  export const ORILIFE_API_BASE_URL: string;
  export const LAMPNET_BASE_URL: string;
  export const LAMPNET_UPLOAD_URL: string;
  export const CAPTURES_3D_URL: string;
  export const PROOFCHAT_API_URL: string;
  export const PROOFCHAT_WS_URL: string;
  export const PROOFCHAT_WS_PATH: string;
  export const PROOFCHAT_BACKEND_ENABLED: string;
  export const ANALYTICS_API_URL: string;
  export const ANALYTICS_API_KEY: string;
  // Truy vết bản dựng. CI ghi ba biến này (codemagic.yaml + .github/actions/rn-env);
  // build tay ở máy lập trình viên thì trống → app tự giấu phần này đi, không in
  // chuỗi rỗng ra màn hình.
  export const BUILD_COMMIT: string;
  export const BUILD_BRANCH: string;
  export const BUILD_ID: string;
  // Hai biến dưới đây CỐ Ý để trống ở bản phát hành. Xem lời dẫn ở
  // `src/services/remoteLogger.ts` và `src/services/aladinChat.ts`:
  // trống = tính năng tắt hẳn, KHÔNG phải lui về một địa chỉ mặc định nào.
  export const REMOTE_LOG_URL: string;
  export const ALADIN_CHAT_URL: string;
  // Chuỗi Cardano app nói chuyện. '1'/'mainnet' = tiền thật; mọi giá trị khác
  // (kể cả rỗng) = chuỗi thử. Nguồn duy nhất: `src/config/cardanoNetwork.ts`.
  export const CARDANO_NETWORK: string;
  /**
   * App nào được dựng ra từ nền mã này: `aladin` | `checkfarm`.
   *
   * Chốt lúc DỰNG, không đổi được lúc chạy. Rỗng ⇒ `aladin` (máy lập trình viên
   * chưa dựng lại tệp biến); giá trị LẠ ⇒ ném ngay lúc nạp module, vì rơi sạch ở
   * đây nghĩa là dựng ra app này rồi đem nộp cửa hàng dưới tên app kia.
   *
   * Đường dựng không rơi vào ca rỗng được: bước đối chiếu ở
   * `.github/actions/rn-env/action.yml` so mọi `import … from '@env'` trong
   * `src/` với các biến vừa ghi, nên thiếu biến này là bản dựng ĐỎ.
   */
  export const APP_INSTANCE: string;
}

