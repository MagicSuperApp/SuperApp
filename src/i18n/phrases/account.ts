// i18n/phrases/account.ts — màn Tài khoản / Cài đặt, ví, danh tính, bảo mật.

import type { PhraseMap } from '../types';

export const ACCOUNT: PhraseMap = {
  // ── Tiêu đề nhóm ───────────────────────────────────────────────────────────
  'TÀI SẢN BLOCKCHAIN': { en: 'BLOCKCHAIN ASSETS', zh: '区块链资产', ja: 'ブロックチェーン資産' },
  'VÍ & DANH TÍNH': { en: 'WALLET & IDENTITY', zh: '钱包与身份', ja: 'ウォレットと本人確認' },
  'CÀI ĐẶT': { en: 'SETTINGS', zh: '设置', ja: '設定' },
  'VÍ': { en: 'WALLET', zh: '钱包', ja: 'ウォレット' },
  'BẢO MẬT & KHÔI PHỤC': { en: 'SECURITY & RECOVERY', zh: '安全与恢复', ja: 'セキュリティと復旧' },
  'HỖ TRỢ': { en: 'SUPPORT', zh: '支持', ja: 'サポート' },

  // ── Hồ sơ ──────────────────────────────────────────────────────────────────
  'Người dùng': { en: 'User', zh: '用户', ja: 'ユーザー' },
  // 'Chưa có danh tính' khai ở mục Tổ chức bên dưới — cùng một câu, dùng chung.
  'Danh tính đã xác minh': {
    en: 'Identity verified',
    zh: '身份已验证',
    ja: '本人確認済み',
  },

  // ── Thẻ token ──────────────────────────────────────────────────────────────
  'Tín dụng sử dụng dịch vụ': { en: 'Service usage credit', zh: '服务使用额度', ja: 'サービス利用クレジット' },
  'Sinh MAGIC mỗi 5 ngày': { en: 'Generates MAGIC every 5 days', zh: '每 5 天产出 MAGIC', ja: '5 日ごとに MAGIC を生成' },
  'Token hệ sinh thái': { en: 'Ecosystem token', zh: '生态代币', ja: 'エコシステムトークン' },
  'TÀI SẢN KHÁC': { en: 'OTHER ASSETS', zh: '其他资产', ja: 'その他の資産' },
  'Tài sản khác': { en: 'Other assets', zh: '其他资产', ja: 'その他の資産' },
  'Xem ›': { en: 'View ›', zh: '查看 ›', ja: '見る ›' },
  'ADA · token · hợp đồng': { en: 'ADA · tokens · contracts', zh: 'ADA · 代币 · 合约', ja: 'ADA · トークン · 契約' },
  'Các token khác và hợp đồng đang còn hạn sẽ hiển thị ở đây khi có dữ liệu.': {
    en: 'Other tokens and active contracts will appear here once data is available.',
    zh: '其他代币和有效合约将在有数据时显示在这里。',
    ja: 'その他のトークンと有効な契約は、データが揃い次第ここに表示されます。',
  },

  // ── Ví ─────────────────────────────────────────────────────────────────────
  'Ví cơ bản': { en: 'Basic wallet', zh: '基础钱包', ja: 'ベーシックウォレット' },
  'Bạn tự giữ khoá (từ cụm 24 từ)': {
    en: 'You hold the key yourself (from the 24-word phrase)',
    zh: '密钥由您自行保管（源自 24 个助记词）',
    ja: '鍵はご自身で保管します（24 語のフレーズから生成）',
  },
  'Ví Phượng Hoàng': { en: 'Phoenix wallet', zh: '凤凰钱包', ja: 'フェニックスウォレット' },
  'Ví Phượng hoàng': { en: 'Phoenix wallet', zh: '凤凰钱包', ja: 'フェニックスウォレット' },
  'Hệ thống giữ hộ — gắn với danh tính của bạn': {
    en: 'Held in custody by the system — bound to your identity',
    zh: '由系统托管 — 与你的身份绑定',
    ja: 'システムが預かります — あなたの本人情報に紐づけ',
  },
  'Địa chỉ': { en: 'Address', zh: '地址', ja: 'アドレス' },
  'Địa chỉ ví (giữ tài sản)': { en: 'Wallet address (holds assets)', zh: '钱包地址（持有资产）', ja: 'ウォレットアドレス（資産を保有）' },
  'Khoá điều khiển (quản trị danh tính)': {
    en: 'Controller key (identity administration)',
    zh: '控制密钥（身份管理）',
    ja: 'コントローラー鍵（本人情報の管理）',
  },
  'Chuẩn khoá': { en: 'Key standard', zh: '密钥标准', ja: '鍵の規格' },
  'Mạng': { en: 'Network', zh: '网络', ja: 'ネットワーク' },
  'Cardano Preprod (Testnet)': { en: 'Cardano Preprod (Testnet)', zh: 'Cardano Preprod（测试网）', ja: 'Cardano Preprod（テストネット）' },
  'Cardano Preview (Testnet)': { en: 'Cardano Preview (Testnet)', zh: 'Cardano Preview（测试网）', ja: 'Cardano Preview（テストネット）' },
  'Cardano Preprod (Thử nghiệm)': { en: 'Cardano Preprod (Test)', zh: 'Cardano Preprod（测试）', ja: 'Cardano Preprod（テスト）' },
  'Cardano Preview (Thử nghiệm)': { en: 'Cardano Preview (Test)', zh: 'Cardano Preview（测试）', ja: 'Cardano Preview（テスト）' },
  'Xem địa chỉ trên trình duyệt chuỗi': { en: 'View address on a chain explorer', zh: '在链浏览器中查看地址', ja: 'チェーンエクスプローラーでアドレスを見る' },

  'Mã hoá': { en: 'Encryption', zh: '加密', ja: '暗号化' },
  'AES-256 đầu cuối': { en: 'AES-256 end-to-end', zh: 'AES-256 端到端', ja: 'AES-256 エンドツーエンド' },
  'Mảnh dữ liệu': { en: 'Data shards', zh: '数据分片', ja: 'データ断片' },
  'Thiết bị lưu trữ': { en: 'Storage devices', zh: '存储设备', ja: '保存デバイス' },

  // ── Mục Cài đặt ────────────────────────────────────────────────────────────
  'Thông báo': { en: 'Notifications', zh: '通知', ja: '通知' },
  'Quản lý thông báo đẩy': { en: 'Manage push notifications', zh: '管理推送通知', ja: 'プッシュ通知を管理' },
  'Ngôn ngữ': { en: 'Language', zh: '语言', ja: '言語' },
  // CỐ Ý không khai 'Tiếng Việt' / 'English' / '中文': tên ngôn ngữ luôn hiển thị
  // bằng CHÍNH nó (endonym) trong bộ chọn — dịch đi sẽ mất tác dụng cứu người
  // lỡ đặt sai ngôn ngữ. Xem LANGUAGES ở src/i18n/types.ts.
  'Chọn ngôn ngữ': { en: 'Choose language', zh: '选择语言', ja: '言語を選択' },
  'Cài đặt ngôn ngữ của bạn': {
    en: 'Set your language preference',
    zh: '设置您的语言偏好',
    ja: '言語の設定'
  },
  'Sinh trắc học': { en: 'Biometrics', zh: '生物识别', ja: '生体認証' },
  'Xác thực khuôn mặt & vân tay': { en: 'Face and fingerprint authentication', zh: '面容与指纹认证', ja: '顔と指紋による認証' },
  'Trợ lý ảo': { en: 'Virtual assistant', zh: '虚拟助手', ja: 'アシスタント' },
  'Bong bóng đang hiển thị': { en: 'Bubble is showing', zh: '悬浮气泡已显示', ja: 'バブルを表示中' },
  'Đang tắt — bật để hiện bong bóng': { en: 'Off — turn on to show the bubble', zh: '已关闭 — 开启以显示悬浮气泡', ja: 'オフです — オンにするとバブルが表示されます' },
  'Chạy luồng hướng dẫn': { en: 'Run the walkthrough', zh: '运行操作引导', ja: 'チュートリアルを実行' },
  'Xem lại hướng dẫn thao tác cơ bản': { en: 'Review the basic walkthrough', zh: '重看基础操作引导', ja: '基本操作のガイドをもう一度見る' },
  'Chế độ offline': { en: 'Offline mode', zh: '离线模式', ja: 'オフラインモード' },
  'Lưu cục bộ khi mất mạng': { en: 'Store locally when the network drops', zh: '断网时保存在本地', ja: '圏外のときは端末に保存' },

  // ── Mục Ví ─────────────────────────────────────────────────────────────────
  // 'Ví của tôi' khai ở navigation.ts — dùng chung.
  'Số dư ADA/LAMP/MAGIC + địa chỉ Cardano (từ cụm 24 từ)': {
    en: 'ADA/LAMP/MAGIC balance + Cardano address (from the 24-word phrase)',
    zh: 'ADA/LAMP/MAGIC 余额 + Cardano 地址（源自 24 个助记词）',
    ja: 'ADA/LAMP/MAGIC の残高と Cardano アドレス（24 語のフレーズから）',
  },
  'Xuất danh tính': { en: 'Export identity', zh: '导出身份', ja: '本人情報を書き出す' },
  'Xem/sao chép mã định danh, khoá công khai, địa chỉ ví': {
    en: 'View/copy your identifier, public key and wallet address',
    zh: '查看/复制标识码、公钥、钱包地址',
    ja: '識別子・公開鍵・ウォレットアドレスを表示/コピー',
  },
  'Đặt tên tra cứu để người khác tìm bạn': {
    en: 'Set a handle so others can find you',
    zh: '设置一个查找名，方便他人找到你',
    ja: '検索用の名前を設定して見つけてもらう',
  },
  'Người bảo hộ': { en: 'Guardians', zh: '监护人', ja: 'ガーディアン' },
  'Thêm guardian để khôi phục khi mất thiết bị': {
    en: 'Add a guardian to recover if you lose your device',
    zh: '添加监护人，设备丢失时可恢复',
    ja: '端末紛失時に復旧できるようガーディアンを追加',
  },
  'Nhật ký hoạt động': { en: 'Activity log', zh: '活动日志', ja: '操作履歴' },
  'Lịch sử ký, xoay khoá, khôi phục': {
    en: 'History of signing, key rotation and recovery',
    zh: '签名、轮换密钥与恢复的历史记录',
    ja: '署名・鍵のローテーション・復旧の履歴',
  },

  // ── Mục Bảo mật ────────────────────────────────────────────────────────────
  'Tái sinh danh tính': { en: 'Identity rebirth', zh: '身份重生', ja: '本人情報の再生' },
  'Khôi phục khi MẤT thiết bị (giữ nguyên danh tính cũ)': {
    en: 'Recover after LOSING your device (keeps your original identity)',
    zh: '设备丢失后恢复（保留原身份）',
    ja: '端末を紛失したときの復旧（元の本人情報を保持）',
  },
  'Xoay khoá': { en: 'Rotate key', zh: '轮换密钥', ja: '鍵のローテーション' },
  'Thay bộ khoá khi nghi bị lộ (vẫn giữ thiết bị)': {
    en: 'Replace the key set if you suspect a leak (device still in hand)',
    zh: '怀疑密钥泄露时更换密钥（设备仍在手中）',
    ja: '漏えいが疑われるとき鍵を交換（端末は手元にある場合）',
  },
  'Đăng nhập web (quét QR)': { en: 'Web login (scan QR)', zh: '网页登录（扫码）', ja: 'ウェブログイン（QR を読み取る）' },
  'Duyệt đăng nhập phoenixkey.me bằng khoá trên máy': {
    en: 'Approve phoenixkey.me sign-in with the key on this device',
    zh: '用本机密钥批准 phoenixkey.me 登录',
    ja: '端末内の鍵で phoenixkey.me のログインを承認',
  },
  'Xuất cụm 24 từ khôi phục': { en: 'Export the 24-word recovery phrase', zh: '导出 24 个恢复助记词', ja: '24 語の復旧フレーズを書き出す' },
  'Sao lưu gốc-tin-cậy (BIP39) — ghi ra giấy, cất an toàn': {
    en: 'Back up the root of trust (BIP39) — write it on paper and store it safely',
    zh: '备份信任根（BIP39）— 抄在纸上并妥善保管',
    ja: '信頼の起点をバックアップ（BIP39）— 紙に書いて安全に保管',
  },
  'Khôi phục bằng cụm 24 từ': { en: 'Recover with the 24-word phrase', zh: '用 24 个助记词恢复', ja: '24 語のフレーズで復旧' },
  'Nhập cụm từ để khôi phục danh tính trên máy này': {
    en: 'Enter the phrase to restore your identity on this device',
    zh: '输入助记词以在本机恢复身份',
    ja: 'フレーズを入力してこの端末で本人情報を復旧',
  },
  'Thiết bị tin cậy': { en: 'Trusted devices', zh: '受信任设备', ja: '信頼済みデバイス' },
  'Quản lý các thiết bị đã đăng nhập': { en: 'Manage signed-in devices', zh: '管理已登录的设备', ja: 'ログイン済みの端末を管理' },

  // ── Hỗ trợ ─────────────────────────────────────────────────────────────────
  'Trung tâm hỗ trợ': { en: 'Help centre', zh: '帮助中心', ja: 'ヘルプセンター' },
  'Điều khoản & Chính sách': { en: 'Terms & Policies', zh: '条款与政策', ja: '利用規約とポリシー' },
  'Phiên bản ứng dụng': { en: 'App version', zh: '应用版本', ja: 'アプリのバージョン' },

  // ── Nạp tín dụng / đăng xuất ───────────────────────────────────────────────
  'Nạp tín dụng MAGIC': { en: 'Top up MAGIC credit', zh: '充值 MAGIC 额度', ja: 'MAGIC クレジットをチャージ' },
  'Quẹt mã · Chuyển token LAMP': { en: 'Scan a code · Transfer LAMP tokens', zh: '扫码 · 转账 LAMP 代币', ja: 'コードを読み取る · LAMP トークンを送る' },
  'Đăng xuất': { en: 'Sign out', zh: '退出登录', ja: 'ログアウト' },
  'Bạn có chắc muốn đăng xuất khỏi tài khoản?': {
    en: 'Are you sure you want to sign out?',
    zh: '确定要退出登录吗？',
    ja: 'ログアウトしてもよろしいですか？',
  },

  // ── Hộp thoại Tái sinh / Xoay khoá (chuỗi ghép trong mã — khoá là bản ĐẦY ĐỦ) ──
  'Tái sinh danh tính (thử nghiệm)': { en: 'Identity rebirth (experimental)', zh: '身份重生（实验性）', ja: '本人情報の再生（試験機能）' },
  'Dùng khi bạn MẤT thiết bị hoặc mất khoá. Hệ thống khôi phục lại CHÍNH danh tính cũ của bạn thông qua người bảo trợ và thời gian chờ an toàn — không tạo danh tính mới, không mất liên kết với cây và dữ liệu đã ghi. Tính năng đang phát triển; nếu bạn mất thiết bị, vui lòng liên hệ đội hỗ trợ.': {
    en: 'Use this when you have LOST your device or your key. The system restores your ORIGINAL identity through your guardians and a safe waiting period — no new identity is created, and links to your trees and recorded data are preserved. This feature is under development; if you have lost your device, please contact the support team.',
    zh: '在设备或密钥丢失时使用。系统会通过你的监护人和安全等待期恢复你原有的身份——不会创建新身份，也不会丢失与树木和已记录数据的关联。该功能仍在开发中；若设备已丢失，请联系支持团队。',
    ja: '端末や鍵をなくしたときに使います。保護者と安全な待機期間を通じて、元の本人情報そのものを復旧します — 新しい本人情報は作られず、樹木や記録済みデータとのつながりも失われません。この機能は開発中です。端末を紛失された場合はサポートチームにご連絡ください。',
  },
  'Xoay khoá (thử nghiệm)': { en: 'Key rotation (experimental)', zh: '密钥轮换（实验性）', ja: '鍵のローテーション（試験機能）' },
  'Dùng khi bạn NGHI khoá bị lộ nhưng vẫn còn giữ thiết bị. Hệ thống thay khoá điều khiển bằng khoá mới và cập nhật lên chuỗi khối — danh tính của bạn GIỮ NGUYÊN. Cách đổi khoá an toàn đang được hoàn thiện để tránh rủi ro mất quyền truy cập nếu lỗi giữa chừng. Vui lòng liên hệ đội hỗ trợ nếu cần gấp.': {
    en: 'Use this when you SUSPECT your key has leaked but you still hold the device. The system replaces the controller key with a new one and records it on the blockchain — your identity stays the SAME. The safe key-swap flow is still being finished to avoid losing access if it fails midway. Please contact the support team if this is urgent.',
    zh: '在怀疑密钥泄露但设备仍在手中时使用。系统会用新的控制密钥替换旧密钥并更新到区块链上——你的身份保持不变。安全换密钥流程仍在完善中，以避免中途失败导致失去访问权限。如有紧急需要，请联系支持团队。',
    ja: '鍵の漏えいが疑われるが端末は手元にある、というときに使います。コントローラー鍵を新しいものに置き換え、ブロックチェーン上に記録します — 本人情報はそのままです。途中で失敗してアクセスを失う事故を防ぐため、安全な鍵交換の流れは仕上げ中です。お急ぎの場合はサポートチームにご連絡ください。',
  },

  // ── Sinh trắc học ──────────────────────────────────────────────────────────
  'Không thể lưu cài đặt': { en: 'Could not save the setting', zh: '无法保存设置', ja: '設定を保存できません' },
  'Không tìm thấy thông tin người dùng. Vui lòng đăng nhập lại.': {
    en: 'User information not found. Please sign in again.',
    zh: '未找到用户信息，请重新登录。',
    ja: 'ユーザー情報が見つかりません。もう一度ログインしてください。',
  },
  'Thiết lập sinh trắc học mở khoá': { en: 'Set up biometric unlock', zh: '设置生物识别解锁', ja: '生体認証によるロック解除を設定' },
  'Đã bật xác thực sinh trắc học': { en: 'Biometric authentication enabled', zh: '已开启生物识别认证', ja: '生体認証を有効にしました' },
  'Thiết lập thất bại': { en: 'Setup failed', zh: '设置失败', ja: '設定に失敗しました' },
  'Tắt xác thực sinh trắc học': { en: 'Turn off biometric authentication', zh: '关闭生物识别认证', ja: '生体認証をオフにする' },
  'Bạn có chắc muốn tắt tính năng này?': { en: 'Are you sure you want to turn this off?', zh: '确定要关闭此功能吗？', ja: 'この機能をオフにしてもよろしいですか？' },
  'Đã tắt xác thực sinh trắc học': { en: 'Biometric authentication turned off', zh: '已关闭生物识别认证', ja: '生体認証をオフにしました' },
  'Vân tay': { en: 'Fingerprint', zh: '指纹', ja: '指紋' },
  'Khuôn mặt': { en: 'Face', zh: '面容', ja: '顔' },

  // ── Xuất danh tính ─────────────────────────────────────────────────────────
  'Khoá công khai (giữ trong máy)': {
    en: 'Public key (kept on this device)',
    zh: '公钥（保存在本机）',
    ja: '公開鍵（この端末に保管）',
  },
  'Khoá HW': { en: 'HW key', zh: '硬件密钥', ja: 'ハードウェア鍵' },
  'Khoá công khai TAAD (Ed25519)': { en: 'TAAD public key (Ed25519)', zh: 'TAAD 公钥（Ed25519）', ja: 'TAAD 公開鍵（Ed25519）' },
  'Khoá TAAD': { en: 'TAAD key', zh: 'TAAD 密钥', ja: 'TAAD 鍵' },
  'Ví cố định (account 0)': { en: 'Fixed wallet (account 0)', zh: '固定钱包（账户 0）', ja: '固定ウォレット（アカウント 0）' },
  'ví cố định': { en: 'fixed wallet', zh: '固定钱包', ja: '固定ウォレット' },
  'ví hoạt động': { en: 'active wallet', zh: '活动钱包', ja: 'アクティブウォレット' },
  'Xuất cụm 24 từ': { en: 'Export the 24-word phrase', zh: '导出 24 个助记词', ja: '24 語のフレーズを書き出す' },

  // ── Ví PhoenixKey ──────────────────────────────────────────────────────────
  'Bảo mật 2 lớp (DeviceKey)': { en: 'Two-layer security (DeviceKey)', zh: '双层安全（DeviceKey）', ja: '二重のセキュリティ（DeviceKey）' },
  'Sinh khoá thiết bị để tăng bảo vệ khi ký giao dịch. Khoá lưu an toàn trên máy này.': {
    en: 'Generate a device key for stronger protection when signing transactions. The key is stored securely on this device.',
    zh: '生成设备密钥，在签署交易时提供更强保护。密钥安全存储于本机。',
    ja: '取引に署名するときの保護を強めるため、端末鍵を生成します。鍵はこの端末に安全に保存されます。',
  },
  'Bảo mật 2 lớp đã kích hoạt trên máy này.': {
    en: 'Two-layer security is now active on this device.',
    zh: '本机已启用双层安全。',
    ja: 'この端末で二重のセキュリティを有効にしました。',
  },
  'Không bật được': { en: 'Could not enable', zh: '无法开启', ja: '有効にできません' },
  'Thử lại sau (cần cập nhật app + máy chủ hỗ trợ).': {
    en: 'Try again later (needs an app update and server support).',
    zh: '请稍后重试（需要更新应用并由服务器支持）。',
    ja: 'しばらくしてからお試しください（アプリの更新とサーバー側の対応が必要です）。',
  },
  'Xoay khoá bảo mật': { en: 'Rotate the security key', zh: '轮换安全密钥', ja: 'セキュリティ鍵をローテーション' },
  'Sinh khoá mới thay khoá hiện tại (nghi lộ hoặc định kỳ). Cần xác nhận sinh trắc bằng khoá cũ. Danh tính của bạn không đổi.': {
    en: 'Generate a new key to replace the current one (suspected leak or routine rotation). Requires biometric confirmation with the old key. Your identity does not change.',
    zh: '生成新密钥替换当前密钥（怀疑泄露或定期轮换）。需用旧密钥进行生物识别确认。你的身份不变。',
    ja: '現在の鍵を新しい鍵に置き換えます（漏えいの疑い、または定期的な交換）。古い鍵での生体認証が必要です。本人情報は変わりません。',
  },
  'Đã xoay khoá': { en: 'Key rotated', zh: '密钥已轮换', ja: '鍵をローテーションしました' },
  'Xoay khoá thất bại': { en: 'Key rotation failed', zh: '密钥轮换失败', ja: '鍵のローテーションに失敗しました' },
  'Đã giữ nguyên khoá cũ, thử lại sau.': { en: 'The old key was kept. Try again later.', zh: '已保留旧密钥，请稍后重试。', ja: '古い鍵はそのままです。しばらくしてからお試しください。' },
  'Địa chỉ ví đã được sao chép.': { en: 'Wallet address copied.', zh: '钱包地址已复制。', ja: 'ウォレットアドレスをコピーしました。' },
  'Địa chỉ ví hoạt động đã sao chép.': { en: 'Active wallet address copied.', zh: '活动钱包地址已复制。', ja: 'アクティブウォレットのアドレスをコピーしました。' },
  'Đã xoay ví': { en: 'Wallet rotated', zh: '钱包已轮换', ja: 'ウォレットをローテーションしました' },
  'Không xoay được ví.': { en: 'Could not rotate the wallet.', zh: '无法轮换钱包。', ja: 'ウォレットをローテーションできません。' },
  'Xoay ví hoạt động?': { en: 'Rotate the active wallet?', zh: '轮换活动钱包？', ja: 'アクティブウォレットをローテーションしますか？' },
  'Xoay ví': { en: 'Rotate wallet', zh: '轮换钱包', ja: 'ウォレットをローテーション' },
  'Không derive được địa chỉ': { en: 'Could not derive the address', zh: '无法派生地址', ja: 'アドレスを導出できません' },

  // ── Username ───────────────────────────────────────────────────────────────
  'Chỉ chữ thường, số và dấu _': { en: 'Lowercase letters, digits and _ only', zh: '仅限小写字母、数字和下划线', ja: '小文字・数字・アンダースコアのみ' },
  'Đã đặt username': { en: 'Username set', zh: '用户名已设置', ja: 'ユーザー名を設定しました' },
  'Không đặt được': { en: 'Could not set it', zh: '设置失败', ja: '設定できません' },
  'Username đã có người dùng. Chọn tên khác.': {
    en: 'That username is taken. Pick another one.',
    zh: '该用户名已被占用，请换一个。',
    ja: 'そのユーザー名は使われています。別の名前を選んでください。',
  },
  'Đang trong thời gian chờ (cooldown). Thử lại sau.': {
    en: 'You are in the cooldown period. Try again later.',
    zh: '正处于冷却期，请稍后重试。',
    ja: 'クールダウン中です。しばらくしてからお試しください。',
  },
  'Đặt username thất bại.': { en: 'Failed to set the username.', zh: '设置用户名失败。', ja: 'ユーザー名の設定に失敗しました。' },

  // ── Guardian ───────────────────────────────────────────────────────────────
  'Mã định danh chưa đúng': {
    en: 'Invalid identifier',
    zh: '标识码不正确',
    ja: '識別子が正しくありません',
  },
  'Nhập mã định danh của người giám hộ.': {
    en: 'Enter the guardian’s identifier.',
    zh: '请输入监护人的标识码。',
    ja: '保護者の識別子を入力してください。',
  },
  'Thiếu tên': { en: 'Name missing', zh: '缺少名称', ja: '名前が未入力です' },
  'Nhập tên hiển thị cho guardian.': { en: 'Enter a display name for the guardian.', zh: '请输入监护人的显示名称。', ja: 'ガーディアンの表示名を入力してください。' },
  'Guardian này đã trong danh sách.': { en: 'This guardian is already on the list.', zh: '该监护人已在列表中。', ja: 'このガーディアンはすでに登録されています。' },
  'Thêm thất bại': { en: 'Could not add', zh: '添加失败', ja: '追加できません' },
  'Bớt guardian': { en: 'Remove guardian', zh: '移除监护人', ja: 'ガーディアンを外す' },
  'Gỡ thất bại': { en: 'Could not remove', zh: '移除失败', ja: '削除できません' },

  // ── Nhật ký hoạt động ──────────────────────────────────────────────────────
  'Chưa có hoạt động': { en: 'No activity yet', zh: '暂无活动', ja: '操作履歴はまだありません' },
  'Các thao tác ký, xoay khoá, khôi phục sẽ hiện ở đây.': {
    en: 'Signing, key rotation and recovery actions will appear here.',
    zh: '签名、密钥轮换和恢复操作将显示在这里。',
    ja: '署名・鍵のローテーション・復旧の操作がここに表示されます。',
  },

  // ── Yêu cầu ký ─────────────────────────────────────────────────────────────
  'Yêu cầu ký giao dịch': { en: 'Transaction signing request', zh: '交易签名请求', ja: '取引の署名リクエスト' },
  'Loại': { en: 'Type', zh: '类型', ja: '種類' },
  'Ứng dụng': { en: 'Application', zh: '应用', ja: 'アプリ' },
  'Mã yêu cầu': { en: 'Request ID', zh: '请求编号', ja: 'リクエスト番号' },
  'Trạng thái': { en: 'Status', zh: '状态', ja: 'ステータス' },
  'Đã duyệt': { en: 'Approved', zh: '已批准', ja: '承認しました' },
  'Giao dịch đã được ký và gửi.': { en: 'The transaction was signed and submitted.', zh: '交易已签名并提交。', ja: '取引に署名して送信しました。' },
  'Ký thất bại': { en: 'Signing failed', zh: '签名失败', ja: '署名に失敗しました' },
  'Từ chối yêu cầu': { en: 'Reject the request', zh: '拒绝请求', ja: 'リクエストを拒否' },
  'Bạn chắc chắn từ chối ký giao dịch này?': {
    en: 'Are you sure you want to refuse signing this transaction?',
    zh: '确定拒绝签署此交易吗？',
    ja: 'この取引への署名を拒否してもよろしいですか？',
  },
  'Không từ chối được, thử lại.': { en: 'Could not reject. Try again.', zh: '无法拒绝，请重试。', ja: '拒否できません。もう一度お試しください。' },
  'Không tải được yêu cầu ký (hết hạn hoặc mạng lỗi).': {
    en: 'Could not load the signing request (expired or network error).',
    zh: '无法加载签名请求（已过期或网络错误）。',
    ja: '署名リクエストを読み込めません（期限切れまたは通信エラー）。',
  },
  'Không tìm thấy khoá — hãy đăng nhập lại.': {
    en: 'Key not found — please sign in again.',
    zh: '未找到密钥 — 请重新登录。',
    ja: '鍵が見つかりません — もう一度ログインしてください。',
  },

  // ── Đăng nhập web ──────────────────────────────────────────────────────────
  'Đăng nhập web': { en: 'Web sign-in', zh: '网页登录', ja: 'ウェブログイン' },
  'Đăng nhập web thất bại.': { en: 'Web sign-in failed.', zh: '网页登录失败。', ja: 'ウェブログインに失敗しました。' },
  'Mã QR đã hết hạn. Làm mới trang web rồi quét lại.': {
    en: 'The QR code has expired. Refresh the web page and scan again.',
    zh: '二维码已过期，请刷新网页后重新扫描。',
    ja: 'QR コードの有効期限が切れました。ウェブページを更新してから読み取り直してください。',
  },
  'Chưa có danh tính trên thiết bị này. Hãy tạo/khôi phục ví trước.': {
    en: 'No identity on this device yet. Create or restore a wallet first.',
    zh: '本机尚无身份，请先创建或恢复钱包。',
    ja: 'この端末にはまだ本人情報がありません。先にウォレットを作成または復旧してください。',
  },

  // ── Cụm 24 từ ──────────────────────────────────────────────────────────────
  'Sao chép cụm từ?': { en: 'Copy the phrase?', zh: '复制助记词？', ja: 'フレーズをコピーしますか？' },
  'Vẫn sao chép': { en: 'Copy anyway', zh: '仍然复制', ja: 'それでもコピー' },
  'Hãy dán vào nơi an toàn rồi xoá clipboard.': {
    en: 'Paste it somewhere safe, then clear your clipboard.',
    zh: '请粘贴到安全的地方，然后清空剪贴板。',
    ja: '安全な場所に貼り付けてから、クリップボードを消去してください。',
  },
  'Xác nhận đã lưu': { en: 'Confirm you saved it', zh: '确认已保存', ja: '保存したことを確認' },
  'Không tạo được cụm từ khôi phục.': { en: 'Could not generate the recovery phrase.', zh: '无法生成恢复助记词。', ja: '復旧フレーズを生成できません。' },
  'Chưa đủ': { en: 'Not enough', zh: '数量不足', ja: '足りません' },
  'Cụm từ không hợp lệ': { en: 'Invalid phrase', zh: '助记词无效', ja: 'フレーズが正しくありません' },
  'không hợp lệ': { en: 'invalid', zh: '无效', ja: '無効' },
  'Kiểm tra lại: đúng 24 từ, đúng chính tả, đúng thứ tự (tiếng Anh, viết thường).': {
    en: 'Check again: exactly 24 words, correct spelling, correct order (English, lowercase).',
    zh: '请检查：恰好 24 个词、拼写正确、顺序正确（英文小写）。',
    ja: 'もう一度ご確認ください：ちょうど 24 語、綴りが正しいこと、順序が正しいこと（英語の小文字）。',
  },
  'Không khôi phục được từ cụm từ này.': { en: 'Could not restore from this phrase.', zh: '无法用此助记词恢复。', ja: 'このフレーズでは復旧できません。' },
  'Máy mới — cần nhập mã định danh': {
    en: 'New device — enter your identifier',
    zh: '新设备 — 需输入标识码',
    ja: '新しい端末です — 識別子の入力が必要です',
  },
  'Mã định danh không khớp cụm từ': {
    en: 'Identifier does not match the phrase',
    zh: '标识码与助记词不匹配',
    ja: '識別子がフレーズと一致しません',
  },
  'Không tìm thấy tài khoản khớp': { en: 'No matching account found', zh: '未找到匹配的账户', ja: '一致するアカウントが見つかりません' },
  'Đã khôi phục & đăng nhập': { en: 'Restored and signed in', zh: '已恢复并登录', ja: '復旧してログインしました' },
  'Nhận diện danh tính từ cụm 24 từ và đăng nhập thành công.': {
    en: 'Identity recognised from the 24-word phrase and signed in successfully.',
    zh: '已从 24 个助记词识别身份并成功登录。',
    ja: '24 語のフレーズから本人情報を確認し、ログインしました。',
  },
  'Không mở được danh tính sau khôi phục (thiếu khoá HW?).': {
    en: 'Could not unlock the identity after recovery (hardware key missing?).',
    zh: '恢复后无法解锁身份（缺少硬件密钥？）。',
    ja: '復旧後に本人情報を開けません（ハードウェア鍵がない可能性）。',
  },
  'Master_KEK trả về không hợp lệ': { en: 'Master_KEK returned is invalid', zh: '返回的 Master_KEK 无效', ja: '返された Master_KEK が正しくありません' },
  'Lõi bảo mật (Rust core) chưa được tích hợp trong bản build này.': {
    en: 'The security core (Rust core) is not integrated in this build.',
    zh: '此版本尚未集成安全核心（Rust core）。',
    ja: 'このビルドにはセキュリティコア（Rust core）が組み込まれていません。',
  },

  // ── Tổ chức ────────────────────────────────────────────────────────────────
  'Tổ chức': { en: 'Organisation', zh: '组织', ja: '組織' },
  'Tạo tổ chức': { en: 'Create organisation', zh: '创建组织', ja: '組織を作成' },
  'Đã tạo tổ chức': { en: 'Organisation created', zh: '组织已创建', ja: '組織を作成しました' },
  'Không tạo được tổ chức. Vui lòng thử lại.': { en: 'Could not create the organisation. Please try again.', zh: '无法创建组织，请重试。', ja: '組織を作成できません。もう一度お試しください。' },
  'Chưa có danh tính': { en: 'No identity yet', zh: '尚无身份', ja: '本人情報がありません' },
  'Vui lòng kích hoạt danh tính trước khi tạo tổ chức.': {
    en: 'Please activate your identity before creating an organisation.',
    zh: '请先激活身份再创建组织。',
    ja: '組織を作成する前に本人情報を有効化してください。',
  },
  'Thiếu danh tính': { en: 'Identity missing', zh: '缺少身份', ja: '本人情報がありません' },
  'Máy này chưa có danh tính.': {
    en: 'This device has no identity yet.',
    zh: '本机尚无身份。',
    ja: 'この端末にはまだ本人情報がありません。',
  },
  'Nhập tên tổ chức.': { en: 'Enter the organisation name.', zh: '请输入组织名称。', ja: '組織名を入力してください。' },
  'Thiếu mã định danh tổ chức': {
    en: 'Organisation identifier missing',
    zh: '缺少组织标识码',
    ja: '組織の識別子がありません',
  },
  'Nhập OrgDID cần nâng quyền.': { en: 'Enter the OrgDID to upgrade.', zh: '请输入需要提权的 OrgDID。', ja: '権限を引き上げる OrgDID を入力してください。' },
  'Thiếu thành viên': { en: 'Members missing', zh: '缺少成员', ja: 'メンバーがいません' },
  'Cần ≥ 1 đồng-sáng-lập/thành-viên khác.': { en: 'At least 1 other co-founder/member is required.', zh: '至少需要 1 位其他联合创始人/成员。', ja: '他の共同創設者／メンバーが 1 名以上必要です。' },
  'Ngưỡng không hợp lệ': { en: 'Invalid threshold', zh: '阈值无效', ja: 'しきい値が正しくありません' },
  'Không tạo được challenge.': { en: 'Could not create the challenge.', zh: '无法创建挑战值。', ja: 'チャレンジを作成できません。' },
  'Đã tạo tổ chức m/n': { en: 'm/n organisation created', zh: '已创建 m/n 组织', ja: 'm/n 組織を作成しました' },
  'Đã nâng quyền': { en: 'Permissions upgraded', zh: '权限已提升', ja: '権限を引き上げました' },
  'Thất bại': { en: 'Failed', zh: '失败', ja: '失敗しました' },
  'Kiểm tra chữ ký các thành viên rồi thử lại.': { en: 'Check the member signatures and try again.', zh: '请检查成员签名后重试。', ja: 'メンバーの署名を確認してからもう一度お試しください。' },
  'Không ký được.': { en: 'Could not sign.', zh: '无法签名。', ja: '署名できません。' },
  'Tạo m/n': { en: 'Create m/n', zh: '创建 m/n', ja: 'm/n を作成' },
  'Nâng quyền': { en: 'Upgrade', zh: '提权', ja: '権限を引き上げる' },
  'Ký duyệt': { en: 'Sign approval', zh: '签名批准', ja: '承認に署名' },
  'Mã định danh + chữ ký': {
    en: 'Identifier + signature',
    zh: '标识码 + 签名',
    ja: '識別子 + 署名',
  },
  'chủ hiện tại': { en: 'current owner', zh: '当前所有者', ja: '現在の所有者' },
  '(chưa có)': { en: '(none)', zh: '（暂无）', ja: '（なし）' },
  'Thành viên MỚI': { en: 'NEW member', zh: '新成员', ja: '新しいメンバー' },
  'Đồng-sáng-lập khác': { en: 'Other co-founders', zh: '其他联合创始人', ja: '他の共同創設者' },
  'Dán chữ ký của thành viên này': { en: 'Paste this member’s signature', zh: '粘贴该成员的签名', ja: 'このメンバーの署名を貼り付け' },

  // ── Uỷ thác / staking ──────────────────────────────────────────────────────
  'Uỷ thác': { en: 'Delegate', zh: '委托', ja: '委任' },
  'Uỷ quyền': { en: 'Delegate', zh: '委托', ja: '委任' },
  'Đang uỷ quyền': { en: 'Delegating', zh: '委托中', ja: '委任中' },
  'Lợi suất': { en: 'Yield', zh: '收益率', ja: '利回り' },
  'Bão hoà': { en: 'Saturation', zh: '饱和度', ja: '飽和度' },
  'Phí': { en: 'Fee', zh: '手续费', ja: '手数料' },
  'Chưa uỷ quyền được.': { en: 'Could not delegate.', zh: '无法委托。', ja: '委任できません。' },
  'Chưa có pool nào để hiển thị.': { en: 'No pools to show yet.', zh: '暂无可显示的矿池。', ja: '表示できるプールがありません。' },
  'Xác nhận uỷ thác': { en: 'Confirm delegation', zh: '确认委托', ja: '委任を確認' },
  'Đã gửi uỷ thác': { en: 'Delegation submitted', zh: '委托已提交', ja: '委任を送信しました' },
  'Uỷ thác thất bại': { en: 'Delegation failed', zh: '委托失败', ja: '委任に失敗しました' },
  'Không tìm thấy pool': { en: 'Pool not found', zh: '未找到矿池', ja: 'プールが見つかりません' },
  'Kiểm tra lại pool id (pool1...).': { en: 'Check the pool id (pool1...).', zh: '请检查矿池 ID（pool1...）。', ja: 'プール ID をご確認ください（pool1...）。' },
  'Không tải được trạng thái uỷ thác.': { en: 'Could not load delegation status.', zh: '无法加载委托状态。', ja: '委任の状態を読み込めません。' },
  'Chưa có ví trên máy này. Hãy tạo/khôi phục ví trước.': {
    en: 'No wallet on this device yet. Create or restore one first.',
    zh: '本机尚无钱包，请先创建或恢复。',
    ja: 'この端末にはまだウォレットがありません。先に作成または復旧してください。',
  },
  'do hệ thống giữ hộ theo danh tính của bạn — dùng cho kích hoạt và dịch vụ.': {
    en: 'held for you by the system against your identity — used for activation and services.',
    zh: '由系统按你的身份代为保管 — 用于激活和各项服务。',
    ja: 'あなたの本人情報に紐づけてシステムが預かっています — 有効化とサービスに使われます。',
  },

  // ── Xoá tài khoản (issue #144 — Apple 5.1.1(v) + Google Play bắt buộc) ────────
  'Xoá tài khoản': { en: 'Delete account', zh: '删除账户', ja: 'アカウントを削除' },
  'Xoá tài khoản là việc không thể hoàn tác. Hãy đọc kỹ trước khi tiếp tục.': {
    en: 'Deleting your account cannot be undone. Please read carefully before continuing.',
    zh: '删除账户无法撤销。请在继续前仔细阅读。',
    ja: 'アカウントの削除は取り消せません。続行する前によくお読みください。',
  },
  'Xoá khỏi máy này': { en: 'Remove from this device', zh: '从本机移除', ja: 'この端末から削除' },
  'Mọi khoá, danh tính, phiên đăng nhập và dữ liệu tạm trên điện thoại — kể cả clip chưa gửi. Sau bước này bạn không đăng nhập lại được trên thiết bị này.': {
    en: 'All keys, identity, login sessions and temporary data on the phone — including clips not yet sent. After this you cannot sign in again on this device.',
    zh: '手机上的所有密钥、身份、登录会话和临时数据 — 包括尚未发送的短片。此后你无法在本设备重新登录。',
    ja: '端末上のすべての鍵・本人情報・ログインセッション・一時データ（未送信のクリップを含む）。この後、この端末では再ログインできません。',
  },
  'Gửi yêu cầu xoá tới máy chủ': { en: 'Send a deletion request to the servers', zh: '向服务器发送删除请求', ja: 'サーバーへ削除リクエストを送信' },
  'Yêu cầu xoá dữ liệu gắn với danh tính của bạn: hồ sơ vườn, công việc, hội thoại.': {
    en: 'Request deletion of the data tied to your identity: farm records, work, conversations.',
    zh: '请求删除与你身份关联的数据：农场记录、工作、会话。',
    ja: 'あなたの本人情報に紐づくデータ（農園記録・仕事・会話）の削除を要求します。',
  },
  'Có thứ không xoá được': { en: 'Some data cannot be removed', zh: '有些数据无法删除', ja: '削除できないデータがあります' },
  'Dữ liệu đã ghi lên chuỗi và đặc trưng ảnh đã gộp vào mô hình nhận diện chung thì không thể gỡ. Đây là giới hạn kỹ thuật, không phải lựa chọn.': {
    en: 'Data already written on-chain and image features already merged into the shared recognition model cannot be removed. This is a technical limit, not a choice.',
    zh: '已写入链上的数据、以及已并入共享识别模型的图像特征无法删除。这是技术限制，并非选择。',
    ja: 'すでにチェーンに記録されたデータや、共有の認識モデルに統合された画像特徴は削除できません。これは技術的な制約であり、選択の問題ではありません。',
  },
  'Nhập XOÁ để xác nhận': { en: 'Type DELETE to confirm', zh: '输入 删除 以确认', ja: '確認のため「削除」と入力' },
  'Xoá vĩnh viễn': { en: 'Delete permanently', zh: '永久删除', ja: '完全に削除' },
  'Đang xoá tài khoản…': { en: 'Deleting account…', zh: '正在删除账户…', ja: 'アカウントを削除しています…' },
  'Đã xoá tài khoản': { en: 'Account deleted', zh: '账户已删除', ja: 'アカウントを削除しました' },
  'Dữ liệu trên máy này đã được xoá. Yêu cầu xoá phía máy chủ đã được ghi nhận và sẽ được xử lý.': {
    en: 'Data on this device has been removed. The server-side deletion request has been recorded and will be processed.',
    zh: '本机数据已删除。服务器端的删除请求已记录，将会处理。',
    ja: 'この端末のデータは削除されました。サーバー側の削除リクエストは記録され、処理されます。',
  },
  'Chưa xoá được. Thử lại khi có mạng tốt.': {
    en: 'Could not delete. Try again with a good connection.',
    zh: '无法删除。请在网络良好时重试。',
    ja: '削除できませんでした。通信状態の良いときに再試行してください。',
  },

  // ── Trạng thái ĐO ĐƯỢC trên màn Tài khoản ──────────────────────────────────
  // Ba chuỗi mạng thay cho một chữ "Đang xác định" cũ. Chúng nói ba việc KHÁC
  // nhau nên phải dịch riêng: đang chạy / đã hỏng, kéo xuống thử lại / chưa chạy.
  'Mã định danh': { en: 'Identity code', zh: '身份代码', ja: '識別コード' },
  'Đang kiểm tra…': { en: 'Checking…', zh: '正在检查…', ja: '確認中…' },
  'Chưa kiểm được — kéo xuống để thử lại': {
    en: 'Could not check — pull down to retry',
    zh: '无法检查 — 下拉重试',
    ja: '確認できません — 下に引いて再試行',
  },
  'Chưa kiểm': { en: 'Not checked', zh: '未检查', ja: '未確認' },
  'Chưa lập ví trên máy này': {
    en: 'No wallet set up on this device',
    zh: '此设备尚未建立钱包',
    ja: 'この端末にウォレットはまだありません',
  },
  'Chưa đọc được — kéo xuống để thử lại': {
    en: 'Could not read — pull down to retry',
    zh: '无法读取 — 下拉重试',
    ja: '読み取れません — 下に引いて再試行',
  },

  // Chỗ này trước ghi "Khoá phần cứng v1" — một câu app KHÔNG hề đo, kèm số
  // phiên bản nội bộ. Nay ba chuỗi dưới đúng bằng cái đo được.
  'Khoá bảo vệ': { en: 'Protection key', zh: '保护密钥', ja: '保護キー' },
  'Khoá nằm trong chip bảo mật của máy': {
    en: 'Key is held in this device’s secure chip',
    zh: '密钥保存在本机安全芯片中',
    ja: '鍵は本体のセキュアチップ内にあります',
  },
  'Chưa có khoá trên máy này': {
    en: 'No key on this device yet',
    zh: '此设备上尚无密钥',
    ja: 'この端末にはまだ鍵がありません',
  },

  // ── LAMPNET ────────────────────────────────────────────────────────────────
  'Nhận LAMP (Wakeme)': { en: 'Claim LAMP (Wakeme)', zh: '领取 LAMP (Wakeme)', ja: 'LAMP を受け取る (Wakeme)' },
  'Nhận phần LAMP khởi tạo vào vault của bạn': {
    en: 'Claim your initial LAMP into your vault',
    zh: '将初始 LAMP 领取到您的金库',
    ja: '初期 LAMP をご自身の保管庫に受け取ります',
  },
  'Tổ chức (OrgDID)': { en: 'Organization (OrgDID)', zh: '组织 (OrgDID)', ja: '組織 (OrgDID)' },
  'Tạo danh tính tổ chức và mint LAMP vào kho Distribution': {
    en: 'Create an organization identity and mint LAMP into the Distribution treasury',
    zh: '创建组织身份并将 LAMP 铸入 Distribution 库',
    ja: '組織の識別情報を作成し、LAMP を Distribution 金庫に発行します',
  },
  'Chưa mở nạp tín dụng': { en: 'Top-up not open yet', zh: '尚未开放充值', ja: 'チャージは未開放です' },
  'Đường nạp tín dụng MAGIC chưa mở trong bản này. Khi mở, nút này sẽ dẫn thẳng tới màn nạp.': {
    en: 'MAGIC credit top-up is not open in this build. Once it is, this button will lead straight to the top-up screen.',
    zh: '本版本尚未开放 MAGIC 额度充值。开放后，此按钮将直接进入充值页面。',
    ja: 'このビルドでは MAGIC クレジットのチャージは未開放です。開放後、このボタンからチャージ画面へ直接進めます。',
  },

  // ── Popup chia LAMP (bấm vào thẻ LAMP) ─────────────────────────────────────
  'Tổng cộng': { en: 'Total', zh: '合计', ja: '合計' },
  'Gồm cả phần còn khoá trong vault': {
    en: 'Includes the portion still locked in the vault',
    zh: '含仍锁定在金库中的部分',
    ja: '保管庫にロック中の分を含みます',
  },
  'LAMP của bạn': { en: 'Your LAMP', zh: '您的 LAMP', ja: 'あなたの LAMP' },
  'Nằm trong ví, dùng được ngay': {
    en: 'In your wallet, usable right away',
    zh: '在钱包中，可立即使用',
    ja: 'ウォレット内にあり、すぐ使えます',
  },
  'LAMP của Wakeme': { en: 'Wakeme LAMP', zh: 'Wakeme 的 LAMP', ja: 'Wakeme の LAMP' },
  'Đang hỏi máy chủ…': { en: 'Asking the server…', zh: '正在询问服务器…', ja: 'サーバーに問い合わせ中…' },
  'Trong vault, mở khoá dần theo ngày': {
    en: 'In the vault, unlocking day by day',
    zh: '在金库中，按日逐步解锁',
    ja: '保管庫内で、日ごとに解除されます',
  },
  'Chưa nhận': { en: 'Not claimed yet', zh: '尚未领取', ja: '未受け取り' },
  'Mỗi người chỉ nhận một lần': {
    en: 'One claim per person',
    zh: '每人仅可领取一次',
    ja: 'お一人につき一度だけ',
  },
  'LAMP trong vault Wakeme mở khoá dần theo ngày. Con số chưa hiện nghĩa là máy chủ chưa cho biết — app không tự điền.': {
    en: 'LAMP in the Wakeme vault unlocks day by day. A blank figure means the server has not said — the app does not fill it in.',
    zh: 'Wakeme 金库中的 LAMP 按日逐步解锁。数字为空表示服务器尚未告知 — 应用不会自行填写。',
    ja: 'Wakeme 保管庫の LAMP は日ごとに解除されます。数値が空欄なのはサーバーが未回答という意味で、アプリが勝手に補うことはありません。',
  },

  // ── Ví Phượng Hoàng: câu có giá trị động ───────────────────────────────────
  // Chuỗi có số/mã chèn vào thì tra-nguyên-chuỗi KHÔNG BAO GIỜ trúng khoá — mỗi
  // lần chạy sinh một chuỗi khác. Phải tách khung ra khoá riêng rồi mới chèn.
  'Khoá mới đã kích hoạt.\nTx: {tx}…': {
    en: 'The new key is active.\nTx: {tx}…',
    zh: '新密钥已启用。\n交易: {tx}…',
    ja: '新しい鍵が有効になりました。\nTx: {tx}…',
  },
  'Ví hoạt động đời #{n}. Cùng cụm 24 từ vẫn khôi phục mọi ví.': {
    en: 'Active wallet generation #{n}. The same 24-word phrase still recovers every wallet.',
    zh: '活动钱包第 {n} 代。同一组 24 词短语仍可恢复所有钱包。',
    ja: 'アクティブウォレット第 {n} 世代。同じ 24 語ですべてのウォレットを復元できます。',
  },
  'Tạo ví hoạt động mới (account {n}) từ cùng cụm 24 từ. Ví cố định (account 0) giữ nguyên. Dùng khi muốn địa chỉ nhận mới. KHÔNG mất tài sản ở ví cũ.': {
    en: 'Creates a new active wallet (account {n}) from the same 24-word phrase. The fixed wallet (account 0) is unchanged. Use this when you want a fresh receiving address. Nothing in the old wallet is lost.',
    zh: '从同一组 24 词短语创建新的活动钱包 (account {n})。固定钱包 (account 0) 保持不变。需要新的收款地址时使用。旧钱包中的资产不会丢失。',
    ja: '同じ 24 語から新しいアクティブウォレット (account {n}) を作成します。固定ウォレット (account 0) は変わりません。新しい受取アドレスが必要なときに使います。旧ウォレットの資産が失われることはありません。',
  },
  'VÍ HOẠT ĐỘNG (ĐỜI #{n})': { en: 'ACTIVE WALLET (GEN #{n})', zh: '活动钱包 (第 {n} 代)', ja: 'アクティブウォレット (第 {n} 世代)' },

  // ── Màn Wakeme (nhận LAMP khởi tạo) ────────────────────────────────────────
  'Tính năng chưa mở': { en: 'Not open yet', zh: '功能尚未开放', ja: 'この機能は未開放です' },
  'Máy chủ chưa bật phần nhận LAMP. Chưa cần làm gì — quay lại sau.': {
    en: 'The server has not switched on LAMP claiming. Nothing to do yet — come back later.',
    zh: '服务器尚未开启 LAMP 领取功能。暂时无需操作 — 请稍后再来。',
    ja: 'サーバー側で LAMP の受け取りがまだ有効になっていません。今は何もする必要はありません — 後ほどお越しください。',
  },
  'Danh tính chưa có khoá trên chuỗi': {
    en: 'Your identity has no on-chain key yet',
    zh: '您的身份尚无链上密钥',
    ja: 'この識別情報にはまだオンチェーン鍵がありません',
  },
  'Bạn cần thiết lập ví (cụm 24 từ) trước, để danh tính có khoá neo trên chuỗi.': {
    en: 'Set up your wallet (the 24-word phrase) first, so your identity has a key anchored on chain.',
    zh: '请先设置钱包（24 词短语），让您的身份在链上拥有锚定密钥。',
    ja: '先にウォレット（24 語）を設定し、識別情報の鍵をチェーン上に固定してください。',
  },
  'Danh tính đang bị khoá': { en: 'This identity is locked', zh: '此身份已被锁定', ja: 'この識別情報はロックされています' },
  'Liên hệ hỗ trợ để mở lại.': { en: 'Contact support to unlock it.', zh: '请联系支持以解锁。', ja: 'サポートに連絡して解除してください。' },
  'Kho LAMP tạm hết': { en: 'The LAMP pot is empty for now', zh: 'LAMP 储备暂时用尽', ja: 'LAMP のプールが一時的に空です' },
  'Kho sẽ được nạp lại. Quay lại sau.': {
    en: 'The pot will be topped up. Come back later.',
    zh: '储备将会补充。请稍后再来。',
    ja: 'プールは補充されます。後ほどお越しください。',
  },
  'Đăng nhập lại rồi thử lại.': { en: 'Sign in again, then retry.', zh: '请重新登录后再试。', ja: '再度ログインしてからお試しください。' },
  'Không nối được mạng Cardano': { en: 'Cannot reach the Cardano network', zh: '无法连接 Cardano 网络', ja: 'Cardano ネットワークに接続できません' },
  'Mạng chuỗi đang trục trặc. Thử lại sau.': {
    en: 'The chain network is having trouble. Try again later.',
    zh: '链上网络出现故障。请稍后再试。',
    ja: 'チェーンネットワークに不具合が出ています。後ほど再試行してください。',
  },
  'Kiểm tra kết nối rồi thử lại.': { en: 'Check your connection, then retry.', zh: '请检查网络连接后再试。', ja: '接続を確認してから再試行してください。' },
  'Chưa lấy được thông tin': { en: 'Could not fetch the information', zh: '无法获取信息', ja: '情報を取得できませんでした' },
  'Chưa kết nối được máy chủ': { en: 'Could not reach the server', zh: '无法连接服务器', ja: 'サーバーに接続できませんでした' },
  'Kiểm tra mạng rồi thử lại.': { en: 'Check your network, then retry.', zh: '请检查网络后再试。', ja: 'ネットワークを確認してから再試行してください。' },
  'Kho còn': { en: 'Pot remaining', zh: '储备余量', ja: 'プール残量' },

  'Nhận LAMP (Wakeme): tính năng chưa mở': {
    en: 'Claim LAMP (Wakeme): not open yet',
    zh: '领取 LAMP (Wakeme)：功能尚未开放',
    ja: 'LAMP を受け取る (Wakeme): 未開放です',
  },
  'Xem chi tiết ›': { en: 'See details ›', zh: '查看详情 ›', ja: '詳細を見る ›' },
};
