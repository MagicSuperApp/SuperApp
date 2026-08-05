// i18n/phrases/account.ts — màn Tài khoản / Cài đặt, ví, danh tính, bảo mật.

import type { PhraseMap } from '../types';

export const ACCOUNT: PhraseMap = {
  // ── Tiêu đề nhóm ───────────────────────────────────────────────────────────
  'TÀI SẢN BLOCKCHAIN': { en: 'BLOCKCHAIN ASSETS', zh: '区块链资产' },
  'VÍ & DANH TÍNH': { en: 'WALLET & IDENTITY', zh: '钱包与身份' },
  'CÀI ĐẶT': { en: 'SETTINGS', zh: '设置' },
  'VÍ': { en: 'WALLET', zh: '钱包' },
  'BẢO MẬT & KHÔI PHỤC': { en: 'SECURITY & RECOVERY', zh: '安全与恢复' },
  'HỖ TRỢ': { en: 'SUPPORT', zh: '支持' },

  // ── Hồ sơ ──────────────────────────────────────────────────────────────────
  'Người dùng': { en: 'User', zh: '用户' },
  'Chưa có DID': { en: 'No DID yet', zh: '尚无 DID' },
  'DID đã xác minh': { en: 'DID verified', zh: 'DID 已验证' },

  // ── Thẻ token ──────────────────────────────────────────────────────────────
  'Tín dụng sử dụng dịch vụ': { en: 'Service usage credit', zh: '服务使用额度' },
  'Sinh MAGIC mỗi 5 ngày': { en: 'Generates MAGIC every 5 days', zh: '每 5 天产出 MAGIC' },
  'Token hệ sinh thái': { en: 'Ecosystem token', zh: '生态代币' },
  'TÀI SẢN KHÁC': { en: 'OTHER ASSETS', zh: '其他资产' },
  'Tài sản khác': { en: 'Other assets', zh: '其他资产' },
  'Xem ›': { en: 'View ›', zh: '查看 ›' },
  'ADA · token · hợp đồng': { en: 'ADA · tokens · contracts', zh: 'ADA · 代币 · 合约' },
  'Các token khác và hợp đồng đang còn hạn sẽ hiển thị ở đây khi có dữ liệu.': {
    en: 'Other tokens and active contracts will appear here once data is available.',
    zh: '其他代币和有效合约将在有数据时显示在这里。',
  },

  // ── Ví ─────────────────────────────────────────────────────────────────────
  'Ví cơ bản': { en: 'Basic wallet', zh: '基础钱包' },
  'Bạn tự giữ khoá (từ cụm 24 từ)': {
    en: 'You hold the key yourself (from the 24-word phrase)',
    zh: '密钥由您自行保管（源自 24 个助记词）',
  },
  'Ví Phượng Hoàng': { en: 'Phoenix wallet', zh: '凤凰钱包' },
  'Ví Phượng hoàng': { en: 'Phoenix wallet', zh: '凤凰钱包' },
  'Hệ thống giữ hộ — gắn với DID': {
    en: 'Held in custody by the system — bound to your DID',
    zh: '由系统托管 — 与 DID 绑定',
  },
  'Địa chỉ': { en: 'Address', zh: '地址' },
  'Địa chỉ ví (giữ tài sản)': { en: 'Wallet address (holds assets)', zh: '钱包地址（持有资产）' },
  'Khoá điều-khiển (quản-trị DID)': { en: 'Controller key (DID administration)', zh: '控制密钥（DID 管理）' },
  'Chuẩn khoá': { en: 'Key standard', zh: '密钥标准' },
  'Mạng': { en: 'Network', zh: '网络' },
  'Cardano Preprod (Testnet)': { en: 'Cardano Preprod (Testnet)', zh: 'Cardano Preprod（测试网）' },
  'Cardano Preview (Testnet)': { en: 'Cardano Preview (Testnet)', zh: 'Cardano Preview（测试网）' },
  'Cardano Preprod (Thử nghiệm)': { en: 'Cardano Preprod (Test)', zh: 'Cardano Preprod（测试）' },
  'Cardano Preview (Thử nghiệm)': { en: 'Cardano Preview (Test)', zh: 'Cardano Preview（测试）' },
  'Xem địa chỉ trên trình duyệt chuỗi': { en: 'View address on a chain explorer', zh: '在链浏览器中查看地址' },

  'Mã hoá': { en: 'Encryption', zh: '加密' },
  'AES-256 đầu cuối': { en: 'AES-256 end-to-end', zh: 'AES-256 端到端' },
  'Mảnh dữ liệu': { en: 'Data shards', zh: '数据分片' },
  'Thiết bị lưu trữ': { en: 'Storage devices', zh: '存储设备' },

  // ── Mục Cài đặt ────────────────────────────────────────────────────────────
  'Thông báo': { en: 'Notifications', zh: '通知' },
  'Quản lý thông báo đẩy': { en: 'Manage push notifications', zh: '管理推送通知' },
  'Ngôn ngữ': { en: 'Language', zh: '语言' },
  // CỐ Ý không khai 'Tiếng Việt' / 'English' / '中文': tên ngôn ngữ luôn hiển thị
  // bằng CHÍNH nó (endonym) trong bộ chọn — dịch đi sẽ mất tác dụng cứu người
  // lỡ đặt sai ngôn ngữ. Xem LANGUAGES ở src/i18n/types.ts.
  'Chọn ngôn ngữ': { en: 'Choose language', zh: '选择语言' },
  'Áp dụng cho toàn bộ ứng dụng. Tên riêng và thuật ngữ giữ nguyên.': {
    en: 'Applies to the whole app. Proper nouns and technical terms stay unchanged.',
    zh: '适用于整个应用。专有名词和术语保持不变。',
  },
  'Sinh trắc học': { en: 'Biometrics', zh: '生物识别' },
  'Xác thực khuôn mặt & vân tay': { en: 'Face and fingerprint authentication', zh: '面容与指纹认证' },
  'Trợ lý ảo': { en: 'Virtual assistant', zh: '虚拟助手' },
  'Bong bóng đang hiển thị': { en: 'Bubble is showing', zh: '悬浮气泡已显示' },
  'Đang tắt — bật để hiện bong bóng': { en: 'Off — turn on to show the bubble', zh: '已关闭 — 开启以显示悬浮气泡' },
  'Chạy luồng hướng dẫn': { en: 'Run the walkthrough', zh: '运行操作引导' },
  'Xem lại hướng dẫn thao tác cơ bản': { en: 'Review the basic walkthrough', zh: '重看基础操作引导' },
  'Chế độ offline': { en: 'Offline mode', zh: '离线模式' },
  'Lưu cục bộ khi mất mạng': { en: 'Store locally when the network drops', zh: '断网时保存在本地' },

  // ── Mục Ví ─────────────────────────────────────────────────────────────────
  'Ví PhoenixKey': { en: 'PhoenixKey wallet', zh: 'PhoenixKey 钱包' },
  'Số dư ADA/LAMP/MAGIC + địa chỉ Cardano (từ cụm 24 từ)': {
    en: 'ADA/LAMP/MAGIC balance + Cardano address (from the 24-word phrase)',
    zh: 'ADA/LAMP/MAGIC 余额 + Cardano 地址（源自 24 个助记词）',
  },
  'Xuất danh tính': { en: 'Export identity', zh: '导出身份' },
  'Xem/copy DID, khoá công khai, địa chỉ ví': {
    en: 'View/copy DID, public key, wallet address',
    zh: '查看/复制 DID、公钥、钱包地址',
  },
  'Đặt tên tra cứu để người khác tìm bạn': {
    en: 'Set a handle so others can find you',
    zh: '设置一个查找名，方便他人找到你',
  },
  'Người bảo hộ': { en: 'Guardians', zh: '监护人' },
  'Thêm guardian để khôi phục khi mất thiết bị': {
    en: 'Add a guardian to recover if you lose your device',
    zh: '添加监护人，设备丢失时可恢复',
  },
  'Nhật ký hoạt động': { en: 'Activity log', zh: '活动日志' },
  'Lịch sử ký, xoay khoá, khôi phục': {
    en: 'History of signing, key rotation and recovery',
    zh: '签名、轮换密钥与恢复的历史记录',
  },

  // ── Mục Bảo mật ────────────────────────────────────────────────────────────
  'Tái sinh danh tính': { en: 'Identity rebirth', zh: '身份重生' },
  'Khôi phục DID khi MẤT thiết bị (giữ danh tính cũ)': {
    en: 'Recover your DID after LOSING the device (keeps the same identity)',
    zh: '设备丢失后恢复 DID（保留原身份）',
  },
  'Xoay khoá': { en: 'Rotate key', zh: '轮换密钥' },
  'Thay bộ khoá khi nghi bị lộ (vẫn giữ thiết bị)': {
    en: 'Replace the key set if you suspect a leak (device still in hand)',
    zh: '怀疑密钥泄露时更换密钥（设备仍在手中）',
  },
  'Đăng nhập web (quét QR)': { en: 'Web login (scan QR)', zh: '网页登录（扫码）' },
  'Duyệt đăng nhập phoenixkey.me bằng khoá trên máy': {
    en: 'Approve phoenixkey.me sign-in with the key on this device',
    zh: '用本机密钥批准 phoenixkey.me 登录',
  },
  'Xuất cụm 24 từ khôi phục': { en: 'Export the 24-word recovery phrase', zh: '导出 24 个恢复助记词' },
  'Sao lưu gốc-tin-cậy (BIP39) — ghi ra giấy, cất an toàn': {
    en: 'Back up the root of trust (BIP39) — write it on paper and store it safely',
    zh: '备份信任根（BIP39）— 抄在纸上并妥善保管',
  },
  'Khôi phục bằng cụm 24 từ': { en: 'Recover with the 24-word phrase', zh: '用 24 个助记词恢复' },
  'Nhập cụm từ để khôi phục danh tính trên máy này': {
    en: 'Enter the phrase to restore your identity on this device',
    zh: '输入助记词以在本机恢复身份',
  },
  'Thiết bị tin cậy': { en: 'Trusted devices', zh: '受信任设备' },
  'Quản lý các thiết bị đã đăng nhập': { en: 'Manage signed-in devices', zh: '管理已登录的设备' },

  // ── Hỗ trợ ─────────────────────────────────────────────────────────────────
  'Trung tâm hỗ trợ': { en: 'Help centre', zh: '帮助中心' },
  'Điều khoản & Chính sách': { en: 'Terms & Policies', zh: '条款与政策' },
  'Phiên bản ứng dụng': { en: 'App version', zh: '应用版本' },

  // ── Nạp tín dụng / đăng xuất ───────────────────────────────────────────────
  'Nạp tín dụng MAGIC': { en: 'Top up MAGIC credit', zh: '充值 MAGIC 额度' },
  'Quẹt mã · Chuyển token LAMP': { en: 'Scan a code · Transfer LAMP tokens', zh: '扫码 · 转账 LAMP 代币' },
  'Đăng xuất': { en: 'Sign out', zh: '退出登录' },
  'Bạn có chắc muốn đăng xuất khỏi tài khoản?': {
    en: 'Are you sure you want to sign out?',
    zh: '确定要退出登录吗？',
  },

  // ── Hộp thoại Tái sinh / Xoay khoá (chuỗi ghép trong mã — khoá là bản ĐẦY ĐỦ) ──
  'Tái sinh danh tính (thử nghiệm)': { en: 'Identity rebirth (experimental)', zh: '身份重生（实验性）' },
  'Dùng khi bạn MẤT thiết bị hoặc mất khoá. Hệ thống khôi phục lại CHÍNH danh tính (DID) cũ của bạn thông qua người bảo trợ và thời-gian-chờ an toàn — không tạo danh tính mới, không mất liên kết với cây/dữ-liệu đã ghi. Tính năng đang phát triển; nếu bạn mất thiết bị, vui lòng liên hệ đội hỗ trợ.': {
    en: 'Use this when you have LOST your device or your key. The system restores your ORIGINAL identity (DID) through your guardians and a safe waiting period — no new identity is created, and links to your trees and recorded data are preserved. This feature is under development; if you have lost your device, please contact the support team.',
    zh: '在设备或密钥丢失时使用。系统会通过您的监护人和安全等待期恢复您原有的身份（DID）——不会创建新身份，也不会丢失与树木/已记录数据的关联。该功能仍在开发中；若设备已丢失，请联系支持团队。',
  },
  'Xoay khoá (thử nghiệm)': { en: 'Key rotation (experimental)', zh: '密钥轮换（实验性）' },
  'Dùng khi bạn NGHI khoá bị lộ nhưng vẫn còn giữ thiết bị. Hệ thống thay bộ khoá điều-khiển bằng bộ khoá mới và cập nhật lên Cardano — danh tính (DID) của bạn GIỮ NGUYÊN. Luồng tráo khoá an toàn đang được đội kỹ thuật hoàn thiện để tránh rủi ro mất quyền truy cập nếu lỗi giữa chừng. Vui lòng liên hệ đội hỗ trợ nếu cần gấp.': {
    en: 'Use this when you SUSPECT your key has leaked but you still hold the device. The system replaces the controller key with a new one and updates it on Cardano — your identity (DID) stays the SAME. The safe key-swap flow is still being finished by the engineering team to avoid losing access if it fails midway. Please contact the support team if this is urgent.',
    zh: '在怀疑密钥泄露但设备仍在手中时使用。系统会用新的控制密钥替换旧密钥并更新到 Cardano——您的身份（DID）保持不变。安全换密钥流程仍在完善中，以避免中途失败导致失去访问权限。如有紧急需要，请联系支持团队。',
  },

  // ── Sinh trắc học ──────────────────────────────────────────────────────────
  'Không thể lưu cài đặt': { en: 'Could not save the setting', zh: '无法保存设置' },
  'Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.': {
    en: 'User information not found. Please sign in again.',
    zh: '未找到用户信息，请重新登录。',
  },
  'Thiết lập sinh trắc học mở khoá': { en: 'Set up biometric unlock', zh: '设置生物识别解锁' },
  'Đã bật xác thực sinh trắc học': { en: 'Biometric authentication enabled', zh: '已开启生物识别认证' },
  'Thiết lập thất bại': { en: 'Setup failed', zh: '设置失败' },
  'Tắt xác thực sinh trắc học': { en: 'Turn off biometric authentication', zh: '关闭生物识别认证' },
  'Bạn có chắc muốn tắt tính năng này?': { en: 'Are you sure you want to turn this off?', zh: '确定要关闭此功能吗？' },
  'Đã tắt xác thực sinh trắc học': { en: 'Biometric authentication turned off', zh: '已关闭生物识别认证' },
  'Vân tay': { en: 'Fingerprint', zh: '指纹' },
  'Khuôn mặt': { en: 'Face', zh: '面容' },

  // ── Xuất danh tính ─────────────────────────────────────────────────────────
  'Khoá công khai (HW · P-256)': { en: 'Public key (HW · P-256)', zh: '公钥（硬件 · P-256）' },
  'Khoá HW': { en: 'HW key', zh: '硬件密钥' },
  'Khoá công khai TAAD (Ed25519)': { en: 'TAAD public key (Ed25519)', zh: 'TAAD 公钥（Ed25519）' },
  'Khoá TAAD': { en: 'TAAD key', zh: 'TAAD 密钥' },
  'Ví cố định (account 0)': { en: 'Fixed wallet (account 0)', zh: '固定钱包（账户 0）' },
  'ví cố định': { en: 'fixed wallet', zh: '固定钱包' },
  'ví hoạt động': { en: 'active wallet', zh: '活动钱包' },
  'Xuất cụm 24 từ': { en: 'Export the 24-word phrase', zh: '导出 24 个助记词' },

  // ── Ví PhoenixKey ──────────────────────────────────────────────────────────
  'Bảo mật 2 lớp (DeviceKey)': { en: 'Two-layer security (DeviceKey)', zh: '双层安全（DeviceKey）' },
  'Sinh khoá thiết bị để tăng bảo vệ khi ký giao dịch. Khoá lưu an toàn trên máy này.': {
    en: 'Generate a device key for stronger protection when signing transactions. The key is stored securely on this device.',
    zh: '生成设备密钥，在签署交易时提供更强保护。密钥安全存储于本机。',
  },
  'Bảo mật 2 lớp đã kích hoạt trên máy này.': {
    en: 'Two-layer security is now active on this device.',
    zh: '本机已启用双层安全。',
  },
  'Không bật được': { en: 'Could not enable', zh: '无法开启' },
  'Thử lại sau (cần cập nhật app + máy chủ hỗ trợ).': {
    en: 'Try again later (needs an app update and server support).',
    zh: '请稍后重试（需要更新应用并由服务器支持）。',
  },
  'Xoay khoá bảo mật': { en: 'Rotate the security key', zh: '轮换安全密钥' },
  'Sinh khoá mới thay khoá hiện tại (nghi lộ/định kỳ). Cần xác nhận sinh trắc bằng khoá cũ. Danh tính (DID) không đổi.': {
    en: 'Generate a new key to replace the current one (suspected leak or routine rotation). Requires biometric confirmation with the old key. Your identity (DID) does not change.',
    zh: '生成新密钥替换当前密钥（怀疑泄露或定期轮换）。需用旧密钥进行生物识别确认。身份（DID）不变。',
  },
  'Đã xoay khoá': { en: 'Key rotated', zh: '密钥已轮换' },
  'Xoay khoá thất bại': { en: 'Key rotation failed', zh: '密钥轮换失败' },
  'Đã giữ nguyên khoá cũ, thử lại sau.': { en: 'The old key was kept. Try again later.', zh: '已保留旧密钥，请稍后重试。' },
  'Địa chỉ ví đã được sao chép.': { en: 'Wallet address copied.', zh: '钱包地址已复制。' },
  'Địa chỉ ví hoạt động đã sao chép.': { en: 'Active wallet address copied.', zh: '活动钱包地址已复制。' },
  'Đã xoay ví': { en: 'Wallet rotated', zh: '钱包已轮换' },
  'Không xoay được ví.': { en: 'Could not rotate the wallet.', zh: '无法轮换钱包。' },
  'Xoay ví hoạt động?': { en: 'Rotate the active wallet?', zh: '轮换活动钱包？' },
  'Xoay ví': { en: 'Rotate wallet', zh: '轮换钱包' },
  'Không derive được địa chỉ': { en: 'Could not derive the address', zh: '无法派生地址' },

  // ── Username ───────────────────────────────────────────────────────────────
  'Chỉ chữ thường, số và dấu _': { en: 'Lowercase letters, digits and _ only', zh: '仅限小写字母、数字和下划线' },
  'Đã đặt username': { en: 'Username set', zh: '用户名已设置' },
  'Không đặt được': { en: 'Could not set it', zh: '设置失败' },
  'Username đã có người dùng. Chọn tên khác.': {
    en: 'That username is taken. Pick another one.',
    zh: '该用户名已被占用，请换一个。',
  },
  'Đang trong thời gian chờ (cooldown). Thử lại sau.': {
    en: 'You are in the cooldown period. Try again later.',
    zh: '正处于冷却期，请稍后重试。',
  },
  'Đặt username thất bại.': { en: 'Failed to set the username.', zh: '设置用户名失败。' },

  // ── Guardian ───────────────────────────────────────────────────────────────
  'DID chưa đúng': { en: 'Invalid DID', zh: 'DID 不正确' },
  'Nhập DID guardian dạng did:phoenix.': { en: 'Enter a guardian DID in the did:phoenix form.', zh: '请输入 did:phoenix 格式的监护人 DID。' },
  'Thiếu tên': { en: 'Name missing', zh: '缺少名称' },
  'Nhập tên hiển thị cho guardian.': { en: 'Enter a display name for the guardian.', zh: '请输入监护人的显示名称。' },
  'Guardian này đã trong danh sách.': { en: 'This guardian is already on the list.', zh: '该监护人已在列表中。' },
  'Thêm thất bại': { en: 'Could not add', zh: '添加失败' },
  'Bớt guardian': { en: 'Remove guardian', zh: '移除监护人' },
  'Gỡ thất bại': { en: 'Could not remove', zh: '移除失败' },

  // ── Nhật ký hoạt động ──────────────────────────────────────────────────────
  'Chưa có hoạt động': { en: 'No activity yet', zh: '暂无活动' },
  'Các thao tác ký, xoay khoá, khôi phục sẽ hiện ở đây.': {
    en: 'Signing, key rotation and recovery actions will appear here.',
    zh: '签名、密钥轮换和恢复操作将显示在这里。',
  },

  // ── Yêu cầu ký ─────────────────────────────────────────────────────────────
  'Yêu cầu ký giao dịch': { en: 'Transaction signing request', zh: '交易签名请求' },
  'Loại': { en: 'Type', zh: '类型' },
  'Ứng dụng': { en: 'Application', zh: '应用' },
  'Mã yêu cầu': { en: 'Request ID', zh: '请求编号' },
  'Trạng thái': { en: 'Status', zh: '状态' },
  'Đã duyệt': { en: 'Approved', zh: '已批准' },
  'Giao dịch đã được ký và gửi.': { en: 'The transaction was signed and submitted.', zh: '交易已签名并提交。' },
  'Ký thất bại': { en: 'Signing failed', zh: '签名失败' },
  'Từ chối yêu cầu': { en: 'Reject the request', zh: '拒绝请求' },
  'Bạn chắc chắn từ chối ký giao dịch này?': {
    en: 'Are you sure you want to refuse signing this transaction?',
    zh: '确定拒绝签署此交易吗？',
  },
  'Không từ chối được, thử lại.': { en: 'Could not reject. Try again.', zh: '无法拒绝，请重试。' },
  'Không tải được yêu cầu ký (hết hạn hoặc mạng lỗi).': {
    en: 'Could not load the signing request (expired or network error).',
    zh: '无法加载签名请求（已过期或网络错误）。',
  },
  'Không tìm thấy khoá — hãy đăng nhập PhoenixKey.': {
    en: 'Key not found — please sign in with PhoenixKey.',
    zh: '未找到密钥 — 请使用 PhoenixKey 登录。',
  },

  // ── Đăng nhập web ──────────────────────────────────────────────────────────
  'Đăng nhập web': { en: 'Web sign-in', zh: '网页登录' },
  'Đăng nhập web thất bại.': { en: 'Web sign-in failed.', zh: '网页登录失败。' },
  'Mã QR đã hết hạn. Làm mới trang web rồi quét lại.': {
    en: 'The QR code has expired. Refresh the web page and scan again.',
    zh: '二维码已过期，请刷新网页后重新扫描。',
  },
  'Chưa có danh tính trên thiết bị này. Hãy tạo/khôi phục ví trước.': {
    en: 'No identity on this device yet. Create or restore a wallet first.',
    zh: '本机尚无身份，请先创建或恢复钱包。',
  },

  // ── Cụm 24 từ ──────────────────────────────────────────────────────────────
  'Sao chép cụm từ?': { en: 'Copy the phrase?', zh: '复制助记词？' },
  'Vẫn sao chép': { en: 'Copy anyway', zh: '仍然复制' },
  'Hãy dán vào nơi an toàn rồi xoá clipboard.': {
    en: 'Paste it somewhere safe, then clear your clipboard.',
    zh: '请粘贴到安全的地方，然后清空剪贴板。',
  },
  'Xác nhận đã lưu': { en: 'Confirm you saved it', zh: '确认已保存' },
  'Không tạo được cụm từ khôi phục.': { en: 'Could not generate the recovery phrase.', zh: '无法生成恢复助记词。' },
  'Chưa đủ': { en: 'Not enough', zh: '数量不足' },
  'Cụm từ không hợp lệ': { en: 'Invalid phrase', zh: '助记词无效' },
  'không hợp lệ': { en: 'invalid', zh: '无效' },
  'Kiểm tra lại: đúng 24 từ, đúng chính tả, đúng thứ tự (tiếng Anh, viết thường).': {
    en: 'Check again: exactly 24 words, correct spelling, correct order (English, lowercase).',
    zh: '请检查：恰好 24 个词、拼写正确、顺序正确（英文小写）。',
  },
  'Không khôi phục được từ cụm từ này.': { en: 'Could not restore from this phrase.', zh: '无法用此助记词恢复。' },
  'Máy mới — cần nhập DID': { en: 'New device — enter your DID', zh: '新设备 — 需输入 DID' },
  'DID không khớp cụm từ': { en: 'DID does not match the phrase', zh: 'DID 与助记词不匹配' },
  'Không tìm thấy tài khoản khớp': { en: 'No matching account found', zh: '未找到匹配的账户' },
  'Đã khôi phục & đăng nhập': { en: 'Restored and signed in', zh: '已恢复并登录' },
  'Nhận diện danh tính từ cụm 24 từ và đăng nhập thành công.': {
    en: 'Identity recognised from the 24-word phrase and signed in successfully.',
    zh: '已从 24 个助记词识别身份并成功登录。',
  },
  'Không mở được danh tính sau khôi phục (thiếu khoá HW?).': {
    en: 'Could not unlock the identity after recovery (hardware key missing?).',
    zh: '恢复后无法解锁身份（缺少硬件密钥？）。',
  },
  'Master_KEK trả về không hợp lệ': { en: 'Master_KEK returned is invalid', zh: '返回的 Master_KEK 无效' },
  'Lõi bảo mật (Rust core) chưa được tích hợp trong bản build này.': {
    en: 'The security core (Rust core) is not integrated in this build.',
    zh: '此版本尚未集成安全核心（Rust core）。',
  },

  // ── Tổ chức ────────────────────────────────────────────────────────────────
  'Tổ chức': { en: 'Organisation', zh: '组织' },
  'Tạo tổ chức': { en: 'Create organisation', zh: '创建组织' },
  'Đã tạo tổ chức': { en: 'Organisation created', zh: '组织已创建' },
  'Không tạo được tổ chức. Vui lòng thử lại.': { en: 'Could not create the organisation. Please try again.', zh: '无法创建组织，请重试。' },
  'Chưa có danh tính': { en: 'No identity yet', zh: '尚无身份' },
  'Vui lòng kích hoạt danh tính trước khi tạo tổ chức.': {
    en: 'Please activate your identity before creating an organisation.',
    zh: '请先激活身份再创建组织。',
  },
  'Thiếu danh tính': { en: 'Identity missing', zh: '缺少身份' },
  'Máy này chưa có DID.': { en: 'This device has no DID.', zh: '本机尚无 DID。' },
  'Nhập tên tổ chức.': { en: 'Enter the organisation name.', zh: '请输入组织名称。' },
  'Thiếu OrgDID': { en: 'OrgDID missing', zh: '缺少 OrgDID' },
  'Nhập OrgDID cần nâng quyền.': { en: 'Enter the OrgDID to upgrade.', zh: '请输入需要提权的 OrgDID。' },
  'Thiếu thành viên': { en: 'Members missing', zh: '缺少成员' },
  'Cần ≥ 1 đồng-sáng-lập/thành-viên khác.': { en: 'At least 1 other co-founder/member is required.', zh: '至少需要 1 位其他联合创始人/成员。' },
  'Ngưỡng không hợp lệ': { en: 'Invalid threshold', zh: '阈值无效' },
  'Không tạo được challenge.': { en: 'Could not create the challenge.', zh: '无法创建挑战值。' },
  'Đã tạo tổ chức m/n': { en: 'm/n organisation created', zh: '已创建 m/n 组织' },
  'Đã nâng quyền': { en: 'Permissions upgraded', zh: '权限已提升' },
  'Thất bại': { en: 'Failed', zh: '失败' },
  'Kiểm tra chữ ký các thành viên rồi thử lại.': { en: 'Check the member signatures and try again.', zh: '请检查成员签名后重试。' },
  'Không ký được.': { en: 'Could not sign.', zh: '无法签名。' },
  'Tạo m/n': { en: 'Create m/n', zh: '创建 m/n' },
  'Nâng quyền': { en: 'Upgrade', zh: '提权' },
  'Ký duyệt': { en: 'Sign approval', zh: '签名批准' },
  'DID + chữ ký': { en: 'DID + signature', zh: 'DID + 签名' },
  'chủ hiện tại': { en: 'current owner', zh: '当前所有者' },
  '(chưa có)': { en: '(none)', zh: '（暂无）' },
  'Thành viên MỚI': { en: 'NEW member', zh: '新成员' },
  'Đồng-sáng-lập khác': { en: 'Other co-founders', zh: '其他联合创始人' },
  'Dán chữ ký của thành viên này': { en: 'Paste this member’s signature', zh: '粘贴该成员的签名' },

  // ── Uỷ thác / staking ──────────────────────────────────────────────────────
  'Uỷ thác': { en: 'Delegate', zh: '委托' },
  'Uỷ quyền': { en: 'Delegate', zh: '委托' },
  'Đang uỷ quyền': { en: 'Delegating', zh: '委托中' },
  'Lợi suất': { en: 'Yield', zh: '收益率' },
  'Bão hoà': { en: 'Saturation', zh: '饱和度' },
  'Phí': { en: 'Fee', zh: '手续费' },
  'Chưa uỷ quyền được.': { en: 'Could not delegate.', zh: '无法委托。' },
  'Chưa có pool nào để hiển thị.': { en: 'No pools to show yet.', zh: '暂无可显示的矿池。' },
  'Xác nhận uỷ thác': { en: 'Confirm delegation', zh: '确认委托' },
  'Đã gửi uỷ thác': { en: 'Delegation submitted', zh: '委托已提交' },
  'Uỷ thác thất bại': { en: 'Delegation failed', zh: '委托失败' },
  'Không tìm thấy pool': { en: 'Pool not found', zh: '未找到矿池' },
  'Kiểm tra lại pool id (pool1...).': { en: 'Check the pool id (pool1...).', zh: '请检查矿池 ID（pool1...）。' },
  'Không tải được trạng thái uỷ thác.': { en: 'Could not load delegation status.', zh: '无法加载委托状态。' },
  'Chưa có ví trên máy này. Hãy tạo/khôi phục ví trước.': {
    en: 'No wallet on this device yet. Create or restore one first.',
    zh: '本机尚无钱包，请先创建或恢复。',
  },
};
