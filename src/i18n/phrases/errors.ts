// i18n/phrases/errors.ts — thông báo lỗi, cảnh báo, chuỗi dịch vụ nền.
//
// Nhiều chuỗi ở đây do service ném ra rồi hiện thẳng trong AlertPopup/StateView →
// vẫn là chữ NGƯỜI DÙNG đọc, nên phải dịch.

import type { PhraseMap } from '../types';

export const ERRORS: PhraseMap = {
  // ── Mặc định của utils/alert ───────────────────────────────────────────────
  'Đã xảy ra lỗi.': { en: 'Something went wrong.', zh: '发生错误。' },
  'Đã có lỗi xảy ra.': { en: 'Something went wrong.', zh: '发生错误。' },
  'Có lỗi xảy ra.': { en: 'Something went wrong.', zh: '发生错误。' },
  'Có lỗi xảy ra. Bạn thử lại nhé.': { en: 'Something went wrong. Please try again.', zh: '发生错误，请重试。' },
  'Thao tác thành công.': { en: 'Done successfully.', zh: '操作成功。' },
  'Cảnh báo.': { en: 'Warning.', zh: '警告。' },
  'Thông tin.': { en: 'Information.', zh: '提示。' },

  // ── Mạng / đồng bộ ─────────────────────────────────────────────────────────
  'Không có mạng': { en: 'No network', zh: '无网络' },
  'Không có kết nối mạng. App sẽ lưu dữ liệu cục bộ và đồng bộ sau.': {
    en: 'No network connection. The app will store data locally and sync later.',
    zh: '无网络连接。应用会将数据保存在本地并稍后同步。',
  },
  'Kết nối mạng chậm. Vui lòng thử lại.': { en: 'Slow network connection. Please try again.', zh: '网络连接较慢，请重试。' },
  'Đẩy dữ liệu thất bại. Vui lòng kiểm tra mạng và thử lại.': {
    en: 'Upload failed. Please check your network and try again.',
    zh: '数据上传失败，请检查网络后重试。',
  },
  'Tiếp tục ngoại tuyến': { en: 'Continue offline', zh: '继续离线使用' },
  'Dữ liệu sẽ được lưu cục bộ và đồng bộ khi có mạng': {
    en: 'Data will be stored locally and synced when you are back online',
    zh: '数据将保存在本地，联网后自动同步',
  },
  'Mất kết nối mạng. Kiểm tra sóng/Wi-Fi rồi thử lại.': {
    en: 'Network connection lost. Check your signal or Wi-Fi and try again.',
    zh: '网络连接中断，请检查信号或 Wi-Fi 后重试。',
  },
  'Mất kết nối. Thử lại sau.': { en: 'Connection lost. Try again later.', zh: '连接中断，请稍后重试。' },
  'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.': {
    en: 'Could not reach the server. Check your network and try again.',
    zh: '无法连接服务器，请检查网络后重试。',
  },
  'Hết thời gian chờ': { en: 'Timed out', zh: '超时' },
  'Quá nhiều yêu cầu': { en: 'Too many requests', zh: '请求过多' },
  'Thao tác quá nhanh. Chờ một chút rồi thử lại.': {
    en: 'That was too fast. Wait a moment and try again.',
    zh: '操作过快，请稍等片刻后重试。',
  },
  'Máy chủ đang bận. Thử lại sau ít phút.': { en: 'The server is busy. Try again in a few minutes.', zh: '服务器繁忙，请几分钟后重试。' },
  'Server lỗi. Thử lại sau.': { en: 'Server error. Try again later.', zh: '服务器错误，请稍后重试。' },
  'Trùng lặp': { en: 'Duplicate', zh: '重复' },
  'Trùng': { en: 'Duplicate', zh: '重复' },
  'Token hết hạn hoặc không hợp lệ': { en: 'Token expired or invalid', zh: '令牌已过期或无效' },
  'Phiên hết hạn': { en: 'Session expired', zh: '会话已过期' },
  'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.': { en: 'Your session expired. Please sign in again.', zh: '登录会话已过期，请重新登录。' },

  // ── Ảnh / cảm biến ─────────────────────────────────────────────────────────
  'Ảnh mờ': { en: 'Blurry photo', zh: '照片模糊' },
  'Ảnh mờ, giữ chắc tay.': { en: 'Blurry photo — hold the device steady.', zh: '照片模糊，请握稳设备。' },
  'Giữ tay yên và chắc chắn ánh sáng đủ': { en: 'Hold still and make sure there is enough light', zh: '保持稳定并确保光线充足' },
  'Thiết bị rung': { en: 'Device shaking', zh: '设备抖动' },
  'Thiết bị rung, vui lòng giữ yên.': { en: 'The device is shaking — please hold still.', zh: '设备抖动，请保持稳定。' },
  'Đặt thiết bị lên bề mặt cứng hoặc giữ chắc hơn': {
    en: 'Rest the device on a firm surface or hold it more steadily',
    zh: '请将设备放在稳固表面上或握得更稳',
  },
  'App cần quyền truy cập camera. Vui lòng cấp quyền trong Cài đặt.': {
    en: 'The app needs camera access. Please grant it in Settings.',
    zh: '应用需要相机权限，请在设置中授予。',
  },
  'GPS không khả dụng. Vui lòng kiểm tra vị trí.': {
    en: 'GPS is unavailable. Please check your location settings.',
    zh: 'GPS 不可用，请检查定位设置。',
  },
  'Độ chính xác GPS thấp (> 15m), dữ liệu có thể không chính xác.': {
    en: 'Low GPS accuracy (> 15 m); the data may be imprecise.',
    zh: 'GPS 精度低（> 15 米），数据可能不准确。',
  },
  'Vị trí không chính xác': { en: 'Inaccurate location', zh: '定位不准确' },
  'Độ chính xác: > 15m. Dữ liệu có thể không đúng.': {
    en: 'Accuracy: > 15 m. The data may be wrong.',
    zh: '精度：> 15 米，数据可能有误。',
  },
  'Cần bật định vị (GPS) để tạo/nhận diện cây. Hãy bật Vị trí rồi thử lại.': {
    en: 'Location (GPS) must be on to create or identify trees. Turn on Location and try again.',
    zh: '创建或识别树木需要开启定位（GPS）。请开启定位后重试。',
  },

  // ── Xác thực / danh tính ───────────────────────────────────────────────────
  'Xác thực lại': { en: 'Authenticate again', zh: '重新验证' },
  'Xác thực thất bại': { en: 'Authentication failed', zh: '验证失败' },
  'Vui lòng xác thực bằng sinh trắc học': { en: 'Please authenticate with biometrics', zh: '请使用生物识别进行验证' },
  'Xác thực ký số thất bại. Vui lòng xác thực lại sinh trắc học.': {
    en: 'Digital signing authentication failed. Please authenticate with biometrics again.',
    zh: '数字签名验证失败，请重新进行生物识别验证。',
  },
  'Chưa kích hoạt': { en: 'Not activated', zh: '未激活' },
  'Kích hoạt tài khoản': { en: 'Activate the account', zh: '激活账户' },
  'Tài khoản chưa được kích hoạt. Vui lòng hoàn tất bước Kích hoạt.': {
    en: 'The account is not activated. Please complete the activation step.',
    zh: '账户尚未激活，请完成激活步骤。',
  },
  'Bạn đã huỷ xác thực sinh trắc.': { en: 'You cancelled biometric authentication.', zh: '你已取消生物识别验证。' },
  'Sinh trắc tạm khoá — thử lại sau ít phút.': {
    en: 'Biometrics temporarily locked — try again in a few minutes.',
    zh: '生物识别暂时锁定 — 请几分钟后重试。',
  },
  'Không thể ký giao dịch. Vui lòng thử lại.': { en: 'Could not sign the transaction. Please try again.', zh: '无法签署交易，请重试。' },
  'Không thể tạo giao dịch.': { en: 'Could not create the transaction.', zh: '无法创建交易。' },
  'Không thể ký giao dịch.': { en: 'Could not sign the transaction.', zh: '无法签署交易。' },
  'Chữ ký không hợp lệ. Thử lại.': { en: 'Invalid signature. Try again.', zh: '签名无效，请重试。' },
  'Blockchain bận. Thử lại sau vài phút.': { en: 'The blockchain is busy. Try again in a few minutes.', zh: '区块链繁忙，请几分钟后重试。' },
  'Mạng Cardano chậm. Đợi 1 phút rồi mở app lại.': {
    en: 'The Cardano network is slow. Wait a minute and reopen the app.',
    zh: 'Cardano 网络较慢，请等待 1 分钟后重新打开应用。',
  },
  'App phiên bản cũ. Cập nhật rồi thử lại.': { en: 'App version is out of date. Update and try again.', zh: '应用版本过旧，请更新后重试。' },
  'Tạo danh tính thất bại. Thử lại.': { en: 'Identity creation failed. Try again.', zh: '创建身份失败，请重试。' },
  'Không tạo được danh tính. Vui lòng thử lại.': { en: 'Could not create the identity. Please try again.', zh: '无法创建身份，请重试。' },
  'Thiết bị đã có khóa PhoenixKey nhưng chưa khôi phục được danh tính. Vui lòng thử đăng nhập lại hoặc liên hệ hỗ trợ.': {
    en: 'The device has a PhoenixKey key but the identity could not be restored. Try signing in again or contact support.',
    zh: '设备已有 PhoenixKey 密钥，但未能恢复身份。请重新登录或联系支持。',
  },
  'Chưa có danh tính PhoenixKey (DID) trên thiết bị.': {
    en: 'No PhoenixKey identity (DID) on this device.',
    zh: '本设备尚无 PhoenixKey 身份（DID）。',
  },
  'Chưa có danh tính (DID) để bật 2FA.': { en: 'No identity (DID) available to enable 2FA.', zh: '没有可用于启用双因素认证的身份（DID）。' },
  'Chưa có danh tính (DID) để ký xác nhận guardian.': {
    en: 'No identity (DID) available to sign the guardian confirmation.',
    zh: '没有可用于签署监护人确认的身份（DID）。',
  },
  'Chưa có danh tính (DID) để xoay khoá.': { en: 'No identity (DID) available to rotate the key.', zh: '没有可用于轮换密钥的身份（DID）。' },
  'Thiết bị chưa hỗ trợ khoá bảo mật (native Enclave).': {
    en: 'This device does not support the secure key (native Enclave).',
    zh: '本设备不支持安全密钥（原生 Enclave）。',
  },
  'Server không trả challenge.': { en: 'The server returned no challenge.', zh: '服务器未返回挑战值。' },
  'Chưa có refresh token — cần đăng nhập lại': { en: 'No refresh token — sign in again', zh: '没有刷新令牌 — 需要重新登录' },
  'Không kết nối được ProofChat': { en: 'Could not connect to ProofChat', zh: '无法连接 ProofChat' },

  // ── Nhắc ký (biometric prompt) ─────────────────────────────────────────────
  'Ký xác nhận': { en: 'Sign to confirm', zh: '签名确认' },
  'Xác minh dữ liệu để gửi lên backend': { en: 'Verify the data before sending it to the backend', zh: '验证数据后发送到后端' },
  'Kích hoạt tài khoản thực hiện trên phoenixkey.me — vui lòng mở dashboard web': {
    en: 'Account activation happens on phoenixkey.me — please open the web dashboard',
    zh: '账户激活在 phoenixkey.me 完成 — 请打开网页控制台',
  },
  'Ký bằng Ví Phượng hoàng': { en: 'Sign with the Phoenix wallet', zh: '使用凤凰钱包签名' },
  'Tạo danh tính mới': { en: 'Create a new identity', zh: '创建新身份' },
  'Ký bằng khóa phần cứng vừa sinh': { en: 'Sign with the newly generated hardware key', zh: '使用刚生成的硬件密钥签名' },
  'Khôi phục danh tính PhoenixKey': { en: 'Restore the PhoenixKey identity', zh: '恢复 PhoenixKey 身份' },
  'Xác thực để khôi phục danh tính trên thiết bị này': {
    en: 'Authenticate to restore the identity on this device',
    zh: '进行验证以在本机恢复身份',
  },
  'Xác nhận guardian': { en: 'Confirm guardian', zh: '确认监护人' },
  'Ký bằng khoá phần cứng của bạn': { en: 'Sign with your hardware key', zh: '使用你的硬件密钥签名' },
  'Xác nhận bằng khoá hiện tại của bạn': { en: 'Confirm with your current key', zh: '使用当前密钥确认' },
  'Kích hoạt ví': { en: 'Activate the wallet', zh: '激活钱包' },
  'Ký bằng khoá phần cứng để mở khoá dịch vụ ví': {
    en: 'Sign with the hardware key to unlock wallet services',
    zh: '使用硬件密钥签名以解锁钱包服务',
  },
  'Đăng nhập OriLife': { en: 'Sign in to OriLife', zh: '登录 OriLife' },
  'Ký bằng khoá PhoenixKey để nhận diện cây': {
    en: 'Sign with the PhoenixKey key to identify trees',
    zh: '使用 PhoenixKey 密钥签名以识别树木',
  },
  'Uỷ nhiệm phiên chat': { en: 'Delegate the chat session', zh: '委托聊天会话' },
  'Ký để bật bằng chứng toàn vẹn tin nhắn (12 giờ)': {
    en: 'Sign to enable message integrity proofs (12 hours)',
    zh: '签名以启用消息完整性证明（12 小时）',
  },
  'Tạo danh tính tổ chức': { en: 'Create the organisation identity', zh: '创建组织身份' },
  'Máy này chưa có danh tính (DID) để ký duyệt.': {
    en: 'This device has no identity (DID) to sign the approval.',
    zh: '本机没有可用于签署批准的身份（DID）。',
  },
  'Ký duyệt tổ chức': { en: 'Sign the organisation approval', zh: '签署组织批准' },

  // ── Định danh / re-ID ──────────────────────────────────────────────────────
  'Định danh thất bại. Vui lòng thử lại hoặc chụp lại hình.': {
    en: 'Identification failed. Please try again or retake the photo.',
    zh: '识别失败，请重试或重新拍照。',
  },
  'Yêu cầu định danh mất quá lâu. Vui lòng thử lại.': {
    en: 'The identification request took too long. Please try again.',
    zh: '识别请求耗时过长，请重试。',
  },
  'Các góc chụp gần như giống nhau. Hãy ĐI VÒNG QUANH cây thật và chụp các góc khác nhau (đừng đứng yên một chỗ).': {
    en: 'The angles are nearly identical. WALK AROUND the tree and shoot from genuinely different angles (do not stand in one place).',
    zh: '拍摄角度几乎相同。请围绕树木行走，从不同角度拍摄（不要站在原地）。',
  },
  'Ảnh lẫn nhiều vật khác nhau — hãy chụp tập trung vào MỘT cây, cùng một thân.': {
    en: 'The photos mix several objects — focus on ONE tree with the same trunk.',
    zh: '照片中混入多个物体 — 请只对准同一棵树的同一根树干拍摄。',
  },
  'Cây này có thể đã được tạo trước đó.': { en: 'This tree may have been created before.', zh: '这棵树可能之前已创建过。' },
  'Hệ thống phát hiện ảnh chứa nhiều cây khác nhau. Vui lòng chỉ chụp một cây duy nhất trong khung hình.': {
    en: 'The system detected several different trees in the photos. Please keep only one tree in frame.',
    zh: '系统检测到照片中包含多棵不同的树。请在取景框中只保留一棵树。',
  },
  'Các ảnh quá giống nhau hoặc chỉ nhìn từ một góc. Hãy đi vòng quanh cây và chụp từ nhiều hướng đa dạng hơn.': {
    en: 'The photos are too similar or taken from one angle only. Walk around the tree and shoot from more varied directions.',
    zh: '照片过于相似或仅来自一个角度。请绕树行走，从更多不同方向拍摄。',
  },

  // ── Lưu trữ ────────────────────────────────────────────────────────────────
  'Bộ nhớ thiết bị đầy. Vui lòng xoá dữ liệu cũ.': {
    en: 'Device storage is full. Please delete old data.',
    zh: '设备存储已满，请删除旧数据。',
  },
  'Xoá dữ liệu cũ': { en: 'Delete old data', zh: '删除旧数据' },
  'Lỗi lưu trữ dữ liệu. Vui lòng thử lại.': { en: 'Data storage error. Please try again.', zh: '数据存储错误，请重试。' },
  'Lỗi không xác định. Vui lòng liên hệ hỗ trợ.': { en: 'Unknown error. Please contact support.', zh: '未知错误，请联系支持。' },
  'Lỗi không xác định. Vui lòng thử lại.': { en: 'Unknown error. Please try again.', zh: '未知错误，请重试。' },

  // ── Ví Phượng hoàng / chuỗi ────────────────────────────────────────────────
  'Ví Phượng hoàng chưa sẵn sàng — backend did_payment (Phase 2) đang được triển khai.': {
    en: 'The Phoenix wallet is not ready — the did_payment backend (Phase 2) is still being rolled out.',
    zh: '凤凰钱包尚未就绪 — did_payment 后端（第二阶段）仍在部署中。',
  },
  'Ký giao dịch trên Cardano Mainnet đang bị khoá trong giai đoạn thử nghiệm.': {
    en: 'Signing transactions on Cardano Mainnet is locked during the trial phase.',
    zh: '试运行阶段暂不允许在 Cardano 主网上签署交易。',
  },
  'Chưa có khoá Phượng hoàng trên máy. Vui lòng kích hoạt danh tính trước.': {
    en: 'No Phoenix key on this device. Please activate your identity first.',
    zh: '本机没有凤凰密钥，请先激活身份。',
  },
  'Yêu cầu ký đã hết hạn — vui lòng tạo lại giao dịch.': {
    en: 'The signing request expired — please recreate the transaction.',
    zh: '签名请求已过期 — 请重新创建交易。',
  },
  'Yêu cầu ký đã bị huỷ.': { en: 'The signing request was cancelled.', zh: '签名请求已取消。' },
  'Yêu cầu ký đã hết hạn.': { en: 'The signing request expired.', zh: '签名请求已过期。' },
  'Không mở được luồng chờ ký.': { en: 'Could not open the signing wait stream.', zh: '无法打开签名等待流。' },
  'Luồng chờ ký đóng trước khi gom đủ chữ ký.': {
    en: 'The signing stream closed before enough signatures were collected.',
    zh: '签名流在收集到足够签名前已关闭。',
  },
  'Lỗi mạng khi chờ ký.': { en: 'Network error while waiting for signatures.', zh: '等待签名时发生网络错误。' },
  'Ví tổ chức chưa sẵn sàng — mint LAMP còn chờ LAMP chốt cap/authority và Enclave native ráp ký giao dịch.': {
    en: 'The organisation wallet is not ready — minting LAMP still awaits the LAMP cap/authority decision and native Enclave transaction signing.',
    zh: '组织钱包尚未就绪 — 铸造 LAMP 仍在等待 LAMP 上限/授权确定以及原生 Enclave 交易签名。',
  },
  'Bước đưa LAMP về ví (claim/vesting-release) chưa mở — PhoenixKey chưa cấp endpoint release. LAMP hiện đang nằm trong KHO Distribution.': {
    en: 'Moving LAMP to the wallet (claim/vesting-release) is not open yet — PhoenixKey has not provided a release endpoint. LAMP currently sits in the Distribution treasury.',
    zh: '将 LAMP 转入钱包（claim/vesting-release）尚未开放 — PhoenixKey 尚未提供 release 接口。LAMP 目前存放在 Distribution 金库中。',
  },
  'Chưa ráp Enclave native ký giao dịch (Thư). Bước dựng + ký CBOR đang chờ.': {
    en: 'The native Enclave transaction signing is not wired up yet. Building and signing the CBOR is still pending.',
    zh: '原生 Enclave 交易签名尚未接入。CBOR 的构建与签名仍在等待中。',
  },
  'Đang tạo yêu cầu mint…': { en: 'Creating the mint request…', zh: '正在创建铸造请求…' },
  'Đang chờ ký (sinh trắc)…': { en: 'Waiting for the signature (biometrics)…', zh: '等待签名（生物识别）…' },
  'Đang gửi giao dịch lên chuỗi…': { en: 'Submitting the transaction on-chain…', zh: '正在向链上提交交易…' },
  'Đã mint vào kho.': { en: 'Minted into the treasury.', zh: '已铸造到金库。' },
  'Không mint được. Vui lòng thử lại.': { en: 'Could not mint. Please try again.', zh: '无法铸造，请重试。' },
  'Chưa thể đưa LAMP về ví — vui lòng thử lại sau.': {
    en: 'LAMP cannot be moved to the wallet yet — please try again later.',
    zh: '暂时无法将 LAMP 转入钱包，请稍后重试。',
  },
  'Không derive được địa chỉ stake (KEK sai?).': { en: 'Could not derive the stake address (wrong KEK?).', zh: '无法派生质押地址（KEK 错误？）。' },
  'Không derive được địa chỉ ví (KEK sai?).': { en: 'Could not derive the wallet address (wrong KEK?).', zh: '无法派生钱包地址（KEK 错误？）。' },
  'Không derive được địa chỉ ví người gửi (KEK sai?).': {
    en: 'Could not derive the sender wallet address (wrong KEK?).',
    zh: '无法派生发送方钱包地址（KEK 错误？）。',
  },

  // ── Trợ lý ─────────────────────────────────────────────────────────────────
  'Lỗi mạng khi gọi trợ lý Aladin': { en: 'Network error while calling the Aladin assistant', zh: '调用 Aladin 助手时发生网络错误' },
  'Trợ lý Aladin phản hồi quá lâu': { en: 'The Aladin assistant took too long to respond', zh: 'Aladin 助手响应超时' },
  'Không gửi được yêu cầu tới Aladin': { en: 'Could not send the request to Aladin', zh: '无法向 Aladin 发送请求' },

  // ── Phí ────────────────────────────────────────────────────────────────────
  'Thu gọn chi tiết phí': { en: 'Collapse fee details', zh: '收起费用明细' },
  'Mở rộng để xem phân bổ phí theo bucket': { en: 'Expand to see the fee breakdown by bucket', zh: '展开查看按桶分配的费用明细' },
};
