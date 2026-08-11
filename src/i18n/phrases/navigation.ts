// i18n/phrases/navigation.ts — thanh điều hướng, Trang chủ, header, hướng dẫn.

import type { PhraseMap } from '../types';

export const NAVIGATION: PhraseMap = {
  // ── Nhãn dịch vụ / tab ─────────────────────────────────────────────────────
  'Trang chủ': { en: 'Home', zh: '首页', ja: 'ホーム' },
  'Tôi': { en: 'Me', zh: '我', ja: 'マイ' },
  'Tài khoản': { en: 'Account', zh: '账户', ja: 'アカウント' },
  'Truy xuất': { en: 'Trace', zh: '溯源', ja: 'トレース' },
  'Trò chuyện': { en: 'Chat', zh: '聊天', ja: 'チャット' },
  'Việc làm': { en: 'Work', zh: '工作', ja: '仕事' },
  'Kết đèn': { en: 'Connect', zh: '连灯', ja: '参加' },
  'Trang trại': { en: 'Farm', zh: '农场', ja: '農場' },
  'Quản lý trang trại & truy xuất nguồn gốc nông sản': {
    en: 'Farm management & produce origin tracing',
    zh: '农场管理与农产品溯源',
    ja: '農場の管理と農産物のトレーサビリティ',
  },
  'Tin nhắn xác thực bằng chữ ký blockchain': {
    en: 'Messages authenticated by blockchain signatures',
    zh: '由区块链签名认证的消息',
    ja: 'ブロックチェーン署名で認証されたメッセージ',
  },
  'Tìm việc & đặt thợ mọi lĩnh vực': {
    en: 'Find work & book skilled help in any trade',
    zh: '寻找工作与预约各行业师傅',
    ja: 'あらゆる分野の仕事探しと職人の手配',
  },
  'Góp sức máy cho mạng lưới & nhận thưởng': {
    en: 'Contribute your device to the network & earn rewards',
    zh: '贡献你的设备算力给网络并获得奖励',
    ja: '端末の力をネットワークに提供して報酬を受け取る',
  },

  // ── Tab con (SubHome) ──────────────────────────────────────────────────────
  'Gọi': { en: 'Calls', zh: '通话', ja: '通話' },
  'Ghim': { en: 'Pins', zh: '置顶', ja: 'ピン' },
  'Tài liệu': { en: 'Docs', zh: '文档', ja: '書類' },
  'Vườn': { en: 'Garden', zh: '果园', ja: '果樹園' },
  'Cây': { en: 'Trees', zh: '树木', ja: '樹木' },
  'Chăm sóc': { en: 'Care', zh: '养护', ja: '手入れ' },

  // ── Cổng xoè (radial menu) ─────────────────────────────────────────────────
  'Chạm một dịch vụ để mở': { en: 'Tap a service to open it', zh: '点按服务即可打开', ja: 'サービスをタップして開きます' },
  'Kéo tới một dịch vụ rồi thả để mở': { en: 'Drag to a service and release to open', zh: '拖到服务上松手即可打开', ja: 'サービスまでドラッグして離すと開きます' },
  'Chạm ra ngoài để đóng · nhấn giữ 2 giây (khi kéo) để đặt mặc định': {
    en: 'Tap outside to close · hold 2 seconds while dragging to set as default',
    zh: '点击外部关闭 · 拖动时长按 2 秒设为默认',
    ja: '外側をタップで閉じる · ドラッグ中に 2 秒長押しで既定に設定',
  },
  'Kéo tiếp RA XA để mở mục con · giữ 2 giây trên dịch vụ để đặt mặc định': {
    en: 'Keep dragging OUTWARD to open sub-items · hold 2 seconds on a service to set it as default',
    zh: '继续向外拖动可展开子项 · 在服务上长按 2 秒设为默认',
    ja: 'さらに外側へドラッグするとサブ項目が開きます · サービス上で 2 秒長押しすると既定に設定できます',
  },
  '✓ Mặc định': { en: '✓ Default', zh: '✓ 默认', ja: '✓ 既定' },
  'Đã thêm Farm vào thanh': { en: 'Farm added to the bar', zh: '已将农场加入导航栏', ja: '農場をバーに追加しました' },
  'vì bạn vừa tạo vườn.': { en: 'because you just created a garden.', zh: '因为你刚创建了果园。', ja: '果樹園を作成したためです。' },

  // ── Hành động nhanh ────────────────────────────────────────────────────────
  'Quét cây': { en: 'Scan tree', zh: '扫描树木', ja: '樹木をスキャン' },
  'Quét quả': { en: 'Scan fruit', zh: '扫描果实', ja: '果実をスキャン' },
  'Quét vật': { en: 'Scan animal', zh: '扫描动物', ja: '家畜をスキャン' },
  'Quét con vật': { en: 'Scan animal', zh: '扫描动物', ja: '家畜をスキャン' },
  'Quét nhãn thuốc': { en: 'Scan product label', zh: '扫描药剂标签', ja: '薬剤ラベルをスキャン' },
  'Quét truy xuất': { en: 'Trace scan', zh: '溯源扫描', ja: 'トレースをスキャン' },
  'Video quả': { en: 'Fruit video', zh: '果实视频', ja: '果実の動画' },
  'Nhận diện\ncon vật': { en: 'Identify\nanimal', zh: '识别\n动物', ja: '家畜を\n識別' },
  'Quay video\nquả': { en: 'Record fruit\nvideo', zh: '录制果实\n视频', ja: '果実の動画を\n撮影' },
  'Thêm Vườn': { en: 'Add garden', zh: '添加果园', ja: '果樹園を追加' },
  'Thêm vườn': { en: 'Add garden', zh: '添加果园', ja: '果樹園を追加' },
  'Thêm đàn': { en: 'Add herd', zh: '添加畜群', ja: '群れを追加' },
  'Vườn của tôi': { en: 'My gardens', zh: '我的果园', ja: 'マイ果樹園' },
  'Mở ví': { en: 'Open wallet', zh: '打开钱包', ja: 'ウォレットを開く' },
  'Cho ăn': { en: 'Feed', zh: '喂食', ja: '給餌' },
  'Tiêm thuốc': { en: 'Vaccinate', zh: '注射', ja: '投薬' },
  'Cách quét cây': { en: 'How to scan a tree', zh: '如何扫描树木', ja: '樹木のスキャン方法' },
  'Truy xuất nguồn gốc quả': { en: 'Trace fruit origin', zh: '追溯果实来源', ja: '果実の産地をたどる' },

  // ── Trang chủ ──────────────────────────────────────────────────────────────
  'Truy xuất sầu riêng\ntới từng trái': { en: 'Trace durian\ndown to each fruit', zh: '榴莲溯源\n精确到每一颗', ja: 'ドリアンを\n一つひとつ追跡' },
  'Định danh blockchain Cardano': { en: 'Cardano blockchain identity', zh: 'Cardano 区块链身份', ja: 'Cardano ブロックチェーンによる識別' },
  'Tính năng Trò chuyện sắp\nra mắt': { en: 'Chat is coming\nsoon', zh: '聊天功能\n即将推出', ja: 'チャット機能は\n近日公開' },
  'Tin nhắn xác thực bằng chữ ký': { en: 'Messages authenticated by signature', zh: '由签名认证的消息', ja: '署名で認証されたメッセージ' },
  'Tìm việc · Đặt thợ\nmọi lĩnh vực': { en: 'Find work · Book help\nin any trade', zh: '找工作 · 预约师傅\n涵盖各行业', ja: '仕事探し · 職人の手配\nあらゆる分野で' },
  'Hợp đồng số · Ký quỹ blockchain': { en: 'Digital contracts · Blockchain escrow', zh: '数字合约 · 区块链托管', ja: '電子契約 · ブロックチェーンのエスクロー' },
  'Thu gọn thao tác nhanh': { en: 'Collapse quick actions', zh: '收起快捷操作', ja: 'クイック操作を折りたたむ' },
  'Mở thao tác nhanh': { en: 'Expand quick actions', zh: '展开快捷操作', ja: 'クイック操作を開く' },
  'Thông tin nhanh': { en: 'At a glance', zh: '快速信息', ja: 'ひと目でわかる情報' },
  'Chưa đồng bộ': { en: 'Not synced', zh: '未同步', ja: '未同期' },
  'Ví của tôi': { en: 'My wallet', zh: '我的钱包', ja: 'マイウォレット' },
  'Trang trại đang theo dõi': { en: 'Farms you follow', zh: '关注的农场', ja: 'フォロー中の農場' },
  'Tin nhắn ProofChat': { en: 'ProofChat messages', zh: 'ProofChat 消息', ja: 'ProofChat のメッセージ' },
  'Không có tin mới': { en: 'No new messages', zh: '没有新消息', ja: '新着メッセージはありません' },
  'Hoạt động gần đây': { en: 'Recent activity', zh: '最近活动', ja: '最近の動き' },

  // ── Trợ lý ảo ──────────────────────────────────────────────────────────────
  'Xin chào 👋 Mình là trợ lý Aladin. Bạn cần giúp gì hôm nay?': {
    en: 'Hello 👋 I am the Aladin assistant. How can I help you today?',
    zh: '你好 👋 我是 Aladin 助手，今天需要什么帮助？',
    ja: 'こんにちは 👋 Aladin アシスタントです。今日はどのようなご用件でしょうか？',
  },
  'Xin lỗi, mình chưa kết nối được tới trợ lý. Bạn thử lại sau nhé.': {
    en: 'Sorry, I could not reach the assistant. Please try again later.',
    zh: '抱歉，暂时无法连接到助手，请稍后再试。',
    ja: '申し訳ありません。アシスタントに接続できませんでした。しばらくしてからお試しください。',
  },
  'Hỏi trợ lý...': { en: 'Ask the assistant...', zh: '向助手提问...', ja: 'アシスタントに質問...' },
  'bạn': { en: 'there', zh: '你', ja: 'あなた' },

  // ── Luồng hướng dẫn (coach mark) ───────────────────────────────────────────
  'Xin chào 👋': { en: 'Hello 👋', zh: '你好 👋', ja: 'こんにちは 👋' },
  'Mình là trợ lý của bạn. Để mình dẫn bạn đi một vòng các thao tác cơ bản nhé — chỉ mất khoảng một phút.': {
    en: 'I am your assistant. Let me walk you through the basics — it takes about a minute.',
    zh: '我是你的助手。让我带你快速了解基本操作 — 只需大约一分钟。',
    ja: 'あなたのアシスタントです。基本の操作をひと通りご案内します — 1 分ほどで終わります。',
  },
  'Màn hình Chính': { en: 'Home screen', zh: '主屏幕', ja: 'ホーム画面' },
  'Đây là màn hình chính. Bạn thấy các nhóm: khu Dịch vụ (Truy xuất, Trò chuyện, Công việc…), Thao tác nhanh, và Thông tin nhanh. Chạm vào một dịch vụ để mở.': {
    en: 'This is the home screen. You will see: the Services area (Trace, Chat, Work…), Quick actions, and At a glance. Tap a service to open it.',
    zh: '这是主屏幕。你会看到：服务区（溯源、聊天、工作…）、快捷操作和快速信息。点按服务即可打开。',
    ja: 'これがホーム画面です。サービス欄（トレース・チャット・仕事…）、クイック操作、ひと目でわかる情報が並んでいます。サービスをタップすると開きます。',
  },
  'Nút Chính': { en: 'Main button', zh: '主按钮', ja: 'メインボタン' },
  'Nút tròn ở giữa thanh dưới là nút Chính. Chạm để quay về trang chủ bất cứ lúc nào; giữ và KÉO để mở nhanh vòng menu dịch vụ mà không cần về Home.': {
    en: 'The round button in the middle of the bottom bar is the Main button. Tap it to return home at any time; press and DRAG to open the service ring without going home first.',
    zh: '底部栏中间的圆形按钮是主按钮。点按可随时返回首页；按住并拖动可直接展开服务环，无需先回首页。',
    ja: '下部バー中央の丸いボタンがメインボタンです。タップするといつでもホームに戻れます。押したままドラッグすると、ホームに戻らずサービスのリングを開けます。',
  },
  'Nút Tài khoản (Tôi) mở hồ sơ của bạn và toàn bộ Cài đặt: thông báo, ngôn ngữ, sinh trắc học, trợ lý ảo… Bạn cũng chạy lại hướng dẫn này từ đây.': {
    en: 'The Account (Me) button opens your profile and all Settings: notifications, language, biometrics, the assistant… You can also replay this walkthrough from there.',
    zh: '账户（我）按钮可打开你的个人资料和全部设置：通知、语言、生物识别、虚拟助手…你也可以从这里重新播放本引导。',
    ja: 'アカウント（マイ）ボタンからプロフィールとすべての設定を開けます：通知、言語、生体認証、アシスタントなど。このガイドもそこから再生できます。',
  },
  'Chuông ở góc trên là nơi xem các cập nhật mới: hoạt động, nhắc việc và tin từ hệ thống.': {
    en: 'The bell in the top corner is where you see new updates: activity, reminders and system messages.',
    zh: '右上角的铃铛用于查看最新动态：活动、提醒和系统消息。',
    ja: '右上のベルでは新しいお知らせを確認できます：活動、リマインダー、システムからの連絡です。',
  },
  'Xong rồi! 🎉': { en: 'All set! 🎉', zh: '完成啦！🎉', ja: 'これで完了です！🎉' },
  'Bạn đã nắm các thao tác cơ bản. Muốn xem lại bất cứ lúc nào, vào Tài khoản → Cài đặt → “Chạy luồng hướng dẫn”.': {
    en: 'You know the basics now. To replay this any time, go to Account → Settings → “Run the walkthrough”.',
    zh: '你已掌握基本操作。想随时重看，请前往 账户 → 设置 → “运行操作引导”。',
    ja: '基本の操作はこれで大丈夫です。もう一度見たいときは アカウント → 設定 →「チュートリアルを実行」からどうぞ。',
  },
  'Tôi đã hiểu rồi!': { en: 'Got it!', zh: '我明白了！', ja: 'わかりました！' },
  'Tôi đã hiểu rồi, đóng hướng dẫn': { en: 'Got it, close the walkthrough', zh: '我明白了，关闭引导', ja: 'わかりました。ガイドを閉じる' },

  // ── Đăng nhập ──────────────────────────────────────────────────────────────
  'Chào mừng trở lại': { en: 'Welcome back', zh: '欢迎回来', ja: 'おかえりなさい' },
  'Quét khuôn mặt hoặc vân tay để mở khoá. Bảo mật tự chủ, không mật khẩu, không OTP.': {
    en: 'Scan your face or fingerprint to unlock. Self-sovereign security — no password, no OTP.',
    zh: '扫描面容或指纹解锁。自主安全，无需密码，无需验证码。',
    ja: '顔または指紋でロックを解除します。自分で管理するセキュリティ — パスワードもワンタイムコードも不要です。',
  },
  'Quét khuôn mặt hoặc vân tay để mở khoá danh tính của bạn.\nBảo mật tự chủ — không mật khẩu, không OTP.': {
    en: 'Scan your face or fingerprint to unlock your identity.\nSelf-sovereign security — no password, no OTP.',
    zh: '扫描面容或指纹以解锁你的身份。\n自主安全 — 无需密码，无需验证码。',
    ja: '顔または指紋であなたの本人情報のロックを解除します。\n自分で管理するセキュリティ — パスワードもワンタイムコードも不要です。',
  },
  // Dòng nhãn trên khu logo màn Đăng nhập. Bản cũ 'ALADIN · PHOENIXKEY DID'
  // không dấu nên lọt lưới kiểm; bản mới có dấu tiếng Việt ⇒ BẮT BUỘC khai ở đây,
  // không thì người dùng tiếng Nhật/Trung thấy nguyên tiếng Việt.
  'ALADIN · DANH TÍNH SỐ': { en: 'ALADIN · DIGITAL IDENTITY', zh: 'ALADIN · 数字身份', ja: 'ALADIN · デジタル ID' },

  // Nhãn trợ năng của nút sinh trắc ở màn Đăng nhập — nút chỉ có icon nên đây là
  // thứ DUY NHẤT trình đọc màn hình đọc được. Ba nhánh theo cảm biến của thiết bị.
  'Đăng nhập bằng khuôn mặt': { en: 'Sign in with face', zh: '使用面容登录', ja: '顔でログイン' },
  'Đăng nhập bằng vân tay': { en: 'Sign in with fingerprint', zh: '使用指纹登录', ja: '指紋でログイン' },
  'Đăng nhập bằng sinh trắc học': { en: 'Sign in with biometrics', zh: '使用生物识别登录', ja: '生体認証でログイン' },
  // Dòng chữ NGAY DƯỚI nút tròn ở màn Đăng nhập. Mệnh lệnh ngắn, không thuật ngữ
  // — người dùng đích là bà con nông dân, cần đọc một nhịp là hiểu phải làm gì.
  'Chạm để đăng nhập': { en: 'Tap to sign in', zh: '点击登录', ja: 'タップしてログイン' },
  'Bật Face ID hoặc vân tay trong Cài đặt máy để đăng nhập': {
    en: 'Turn on Face ID or fingerprint in your device Settings to sign in',
    zh: '请在设备设置中开启面容或指纹后登录',
    ja: '端末の設定で Face ID または指紋を有効にしてからログインしてください',
  },
  'Thiết bị chưa hỗ trợ sinh trắc học. Thử lập danh tính tạm thời trên thiết bị này.': {
    en: 'This device does not support biometrics. Try creating a temporary identity on it.',
    zh: '此设备不支持生物识别。请尝试在本机创建临时身份。',
    ja: 'この端末は生体認証に対応していません。この端末で一時的な本人情報を作成してみてください。',
  },
  // 'Chưa có danh tính' khai ở account.ts — dùng chung.
  'Chưa dùng được danh tính trên máy này': {
    en: 'Identity is not available on this device',
    zh: '本机暂时无法使用身份',
    ja: 'この端末では本人情報を利用できません',
  },
  'Đăng nhập sinh trắc học thất bại': { en: 'Biometric sign-in failed', zh: '生物识别登录失败', ja: '生体認証でのログインに失敗しました' },
  'Aladin Chat — phiên bản mới': { en: 'Aladin Chat — new version', zh: 'Aladin Chat — 新版本', ja: 'Aladin Chat — 新バージョン' },
  'Tin nhắn ký số · Escrow tích hợp': { en: 'Digitally signed messages · Built-in escrow', zh: '数字签名消息 · 内置托管', ja: '電子署名付きメッセージ · エスクロー内蔵' },
  'Đăng ký thợ — nhận 100 MAGIC': { en: 'Register as a pro — get 100 MAGIC', zh: '注册师傅 — 获得 100 MAGIC', ja: '職人登録で 100 MAGIC 進呈' },
  'Ưu đãi cho người mới đến 30/04': { en: 'New-user offer until 30 April', zh: '新用户优惠至 4 月 30 日', ja: '新規の方向け特典（4 月 30 日まで）' },
  'Sự kiện cộng đồng & airdrop': { en: 'Community events & airdrops', zh: '社区活动与空投', ja: 'コミュニティイベントとエアドロップ' },
  'Chọn tên đăng nhập (PhoenixUser), sau đó kích hoạt chip bảo mật bằng sinh trắc học. Khóa riêng sinh ngay trong chip và': {
    en: 'Choose a username (PhoenixUser), then activate the secure chip with biometrics. The private key is generated in the chip and',
    zh: '选择用户名（PhoenixUser），然后通过生物识别激活安全芯片。私钥在芯片中生成并',
    ja: 'ログイン名（PhoenixUser）を決めてから、生体認証でセキュリティチップを有効にします。秘密鍵はチップの中で生成され、',
  },
  'Tên đăng nhập': {
    en: 'Username',
    zh: '用户名',
    ja: 'ログイン名',
  },
  'ten_dang_nhap': {
    en: 'username',
    zh: '用户名',
    ja: 'login_name',
  },
  // ('Sinh trắc học' đã khai ở phrases/account.ts — không khai lại ở đây.)
  'Người dùng đã hủy thao tác dùng dấu vân tay': {
    en: 'User canceled fingerprint authentication',
    zh: '用户取消了指纹认证',
    ja: '指紋認証の操作をキャンセルしました',
  },
  'Khôi phục danh tính': {
    en: 'Recover identity',
    zh: '恢复身份',
    ja: '本人情報を復旧',
  },
  'Xác thực để khôi phục danh tính trên thiết bị này.': {
    en: 'Authenticate to recover your identity on this device.',
    zh: '请进行身份验证以在此设备上恢复您的身份。',
    ja: 'この端末で本人情報を復旧するために認証します。',
  },
  // ── Đăng ký ────────────────────────────────────────────────────────────────
  'Username 3–20 ký tự, bắt đầu bằng chữ thường, chỉ chứa a-z, 0-9, _': {
    en: 'Username: 3–20 characters, starts with a lowercase letter, only a-z, 0-9 and _',
    zh: '用户名：3–20 个字符，以小写字母开头，仅含 a-z、0-9 和下划线',
    ja: 'ユーザー名は 3〜20 文字。先頭は小文字、使えるのは a-z、0-9、アンダースコアのみです',
  },
  'Username này đã được đăng ký trên thiết bị': {
    en: 'This username is already registered on the device',
    zh: '该用户名已在本设备注册',
    ja: 'このユーザー名はすでに端末に登録されています',
  },
  'Vui lòng nhập username hợp lệ trước khi xác thực.': {
    en: 'Please enter a valid username before authenticating.',
    zh: '请先输入有效的用户名再进行验证。',
    ja: '認証の前に有効なユーザー名を入力してください。',
  },
  'Thiết bị này chưa thiết lập sinh trắc học. Vui lòng bật Face ID / vân tay trong cài đặt của thiết bị, sau đó thử lại. Không có cách thay thế cho bước này.': {
    en: 'Biometrics are not set up on this device. Please enable Face ID / fingerprint in your device settings and try again. There is no alternative for this step.',
    zh: '本设备尚未设置生物识别。请在系统设置中启用面容 ID / 指纹后重试。此步骤没有替代方案。',
    ja: 'この端末では生体認証が設定されていません。端末の設定で Face ID または指紋を有効にしてからお試しください。この手順に代わる方法はありません。',
  },
  'Kích hoạt chip bảo mật để sinh khóa': { en: 'Activate the secure chip to generate the key', zh: '激活安全芯片以生成密钥', ja: 'セキュリティチップを有効にして鍵を生成' },
  // 'Không tạo được danh tính. Vui lòng thử lại.' khai ở errors.ts — dùng chung.
  'Đang sinh khóa…': { en: 'Generating key…', zh: '正在生成密钥…', ja: '鍵を生成中…' },
  'Bắt đầu xác thực sinh trắc học': { en: 'Start biometric authentication', zh: '开始生物识别认证', ja: '生体認証を開始' },
  'Sinh khóa phần cứng': { en: 'Hardware key generation', zh: '硬件密钥生成', ja: 'ハードウェア鍵の生成' },
  'Khóa riêng nằm trong chip bảo mật, không thể xuất': {
    en: 'The private key lives in the secure chip and cannot be exported',
    zh: '私钥存放在安全芯片中，无法导出',
    ja: '秘密鍵はセキュリティチップの中にあり、取り出せません',
  },
  'Tạo danh tính': {
    en: 'Create your identity',
    zh: '创建身份',
    ja: '本人情報を作成',
  },
  'Public key được ghi vào danh sách khóa được phép': {
    en: 'The public key is written to the allowed-key list',
    zh: '公钥被写入允许密钥列表',
    ja: '公開鍵が許可鍵リストに書き込まれます',
  },
  'Mã hoá dữ liệu khôi phục': { en: 'Encrypt recovery data', zh: '加密恢复数据', ja: '復旧データを暗号化' },
  'Mã hoá mạnh bằng khoá lấy từ thiết bị của bạn': {
    en: 'Strong encryption with a key derived from your device',
    zh: '使用源自你设备的密钥进行强加密',
    ja: 'あなたの端末から得た鍵で強力に暗号化します',
  },
  'Chia nhỏ & lưu trên nhiều thiết bị': { en: 'Split and store across many devices', zh: '分片并存储在多台设备上', ja: '分割して複数の端末に保存' },
  'Lưu trên ít nhất 12 thiết bị — không có bản sao tập trung': {
    en: 'Stored on at least 12 devices — no central copy',
    zh: '存储于至少 12 台设备 — 无集中副本',
    ja: '12 台以上の端末に保存されます — 中央に控えは置きません',
  },
  'Vào ứng dụng': { en: 'Enter the app', zh: '进入应用', ja: 'アプリを始める' },

  // ── Header ─────────────────────────────────────────────────────────────────
  'Xin chào': { en: 'Hello', zh: '你好', ja: 'こんにちは' },
  // Khuôn có chỗ thay — dùng qua `tf` (xem components/AppHeader.tsx).
  'Xin chào {name}': { en: 'Hello {name}', zh: '你好，{name}', ja: '{name} さん、こんにちは' },

  // ── Cài đặt mở từ nav ──────────────────────────────────────────────────────
  // CHỈ khai ở đây những khoá CHƯA có nơi khác. 'Đăng xuất' · 'Thông báo' ·
  // 'Ngôn ngữ' · 'Trợ lý ảo' · 'Sinh trắc học' · 'Chạy luồng hướng dẫn' đã có
  // trong phrases/account.ts; 'Hủy' đã có trong phrases/common.ts. Khai trùng thì
  // bản nạp SAU đè bản trước (xem dictionary.ts) → hai chỗ dịch lệch nhau mà
  // không ai biết, nên đã gỡ.
  'Đổi ngôn ngữ': { en: 'Change language', zh: '更改语言', ja: '言語を変更' },
  'Cài đặt': { en: 'Settings', zh: '设置', ja: '設定' },
  'Phiên bản': { en: 'Version', zh: '版本', ja: 'バージョン' },

  'Kích Hoạt ví': { en: 'Activate wallet', zh: '激活钱包', ja: 'ウォレットを有効化' },
  'Ký bằng khóa phần cứng để mở khóa dịch vụ ví.': {
    en: 'Sign with the hardware key to unlock the wallet service.',
    zh: '使用硬件密钥签名以解锁钱包服务。',
    ja: 'ハードウェア鍵で署名してウォレット機能を解除します。',
  },
  // 'Cài đặt ngôn ngữ của bạn' đã khai ở phrases/account.ts (cùng khối "Ngôn ngữ"
  // của màn Cài đặt) — khai lại ở đây là trùng khoá, bản nạp sau đè bản trước.
  'Ví dụ: ': {
    en: 'For example:',
    zh: '例如：',
    ja: '例：'
  },
  'ĐẶT VỊ TRÍ QUẢ': { en: 'SET FRUIT LOCATION', zh: '设置果实位置', ja: '果実の位置を設定' },
};
