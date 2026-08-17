/**
 * Chuỗi màn CHÀO (hỏi-một-lần lúc mới cài), theo khoá `onboarding.<tên>`.
 *
 * Cùng nếp với `trace.ts`/`map.ts` — xem chú thích đầu `trace.ts`.
 *
 * VÌ SAO MÀN NÀY TỒN TẠI: app đã lên hai cửa hàng từ v1.0 mà KHÔNG có chỗ nào
 * nói Aladin là cái gì. Người tải về thấy ngay màn đăng nhập sinh trắc, phải giao
 * khuôn mặt/vân tay cho một cái tên chưa từng được giải thích. Ba màn onboarding
 * cũ đã bị gỡ (xem `navigation/index.tsx`, khối `initServices`); đây là bản dựng
 * lại, MỘT màn, bỏ qua được.
 */

export const ONBOARDING_STRINGS = {
  'onboarding.title': {
    vi: 'Aladin',
    en: 'Aladin',
    zh: 'Aladin',
    ja: 'Aladin',
  },
  'onboarding.tagline': {
    vi: 'Một ứng dụng, bốn việc — và danh tính là của chính anh chị.',
    en: 'One app, four jobs — and the identity stays yours.',
    zh: '一个应用，四件事 —— 身份始终属于你自己。',
    ja: '一つのアプリで四つの仕事 — 本人確認はあなたのものです。',
  },

  // ── Bốn khe module ────────────────────────────────────────────────────────
  'onboarding.trace.title': {
    vi: 'Truy xuất vườn',
    en: 'Farm traceability',
    zh: '果园溯源',
    ja: '農園トレーサビリティ',
  },
  'onboarding.trace.body': {
    vi: 'Chụp cây, chụp quả — máy nhận ra đúng con cây đó lần sau, kể cả khi đổi điện thoại.',
    en: 'Photograph a tree or a fruit — the app recognises that same one next time, even on a new phone.',
    zh: '拍下果树或果实 —— 下次仍能认出同一棵，换手机也一样。',
    ja: '木や実を撮れば、次回も同じ個体を認識します。機種変更後も同じです。',
  },
  'onboarding.chat.title': {
    vi: 'Trò chuyện',
    en: 'Chat',
    zh: '聊天',
    ja: 'チャット',
  },
  'onboarding.chat.body': {
    vi: 'Nhắn tin mã hoá đầu-cuối, khoá nằm trong máy anh chị, không nằm trên máy chủ của ai.',
    en: 'End-to-end encrypted messages. The keys live on your device, not on anyone else’s server.',
    zh: '端到端加密消息。密钥保存在你的设备上，而不是别人的服务器。',
    ja: 'エンドツーエンド暗号化。鍵は端末内にあり、他人のサーバーにはありません。',
  },
  'onboarding.work.title': {
    vi: 'Công việc',
    en: 'Work',
    zh: '工作',
    ja: '仕事',
  },
  'onboarding.work.body': {
    vi: 'Giao việc, chấm công, đối soát — nối với aladin.work.',
    en: 'Assign work, log hours, reconcile — connected to aladin.work.',
    zh: '派工、记工、对账 —— 与 aladin.work 相连。',
    ja: '作業の割当・記録・照合 — aladin.work と連携します。',
  },
  'onboarding.join.title': {
    vi: 'Kết đèn',
    en: 'Join',
    zh: '共建',
    ja: '参加',
  },
  'onboarding.join.body': {
    vi: 'Góp phần vào mạng lưới và nhận phần thưởng theo đóng góp thật.',
    en: 'Contribute to the network and earn according to real contribution.',
    zh: '为网络做贡献，按真实贡献获得回报。',
    ja: 'ネットワークに貢献し、実際の貢献に応じて報酬を受け取ります。',
  },

  // ── Câu về danh tính — chỗ người dùng đang được yêu cầu tin tưởng ─────────
  'onboarding.identity.title': {
    vi: 'Đăng nhập bằng sinh trắc',
    en: 'You sign in with biometrics',
    zh: '使用生物识别登录',
    ja: '生体認証でログインします',
  },
  'onboarding.identity.body': {
    vi: 'Khuôn mặt hoặc vân tay được máy điện thoại giữ, app không gửi chúng đi đâu. Anh chị xuất được danh tính ra để mang sang máy khác.',
    en: 'Your face or fingerprint stays with the phone; the app never sends them anywhere. You can export your identity and carry it to another device.',
    zh: '面容或指纹由手机本身保管，应用不会将其发送到任何地方。你可以导出身份并带到其他设备。',
    ja: '顔や指紋は端末が保持し、アプリが送信することはありません。本人確認情報は書き出して別の端末へ移せます。',
  },

  // ── Nút ───────────────────────────────────────────────────────────────────
  'onboarding.start': {
    vi: 'Bắt đầu',
    en: 'Get started',
    zh: '开始',
    ja: 'はじめる',
  },
  'onboarding.skip': {
    vi: 'Bỏ qua',
    en: 'Skip',
    zh: '跳过',
    ja: 'スキップ',
  },
  'onboarding.web': {
    vi: 'Tìm hiểu thêm tại aladin.work',
    en: 'Learn more at aladin.work',
    zh: '前往 aladin.work 了解更多',
    ja: 'aladin.work で詳しく見る',
  },

  // ── Màn mở trang web trong app ────────────────────────────────────────────
  'web.loading': {
    vi: 'Đang mở trang…',
    en: 'Opening page…',
    zh: '正在打开页面…',
    ja: 'ページを開いています…',
  },
  'web.failed': {
    vi: 'Không mở được trang. Kiểm tra mạng rồi thử lại.',
    en: 'Could not open the page. Check your connection and try again.',
    zh: '无法打开页面。请检查网络后重试。',
    ja: 'ページを開けませんでした。通信状況を確認して再試行してください。',
  },
  'web.retry': {
    vi: 'Thử lại',
    en: 'Retry',
    zh: '重试',
    ja: '再試行',
  },
  'web.openOutside': {
    vi: 'Mở bằng trình duyệt',
    en: 'Open in browser',
    zh: '用浏览器打开',
    ja: 'ブラウザで開く',
  },
  'web.notSignedIn': {
    vi: 'Trang web mở ở chế độ khách — phiên đăng nhập trong app chưa dùng chung được với trang.',
    en: 'The site opens signed-out — the app session is not shared with the website yet.',
    zh: '网页以未登录状态打开 —— 应用内的登录状态尚未与网站共享。',
    ja: 'サイトは未ログイン状態で開きます — アプリのセッションはまだ共有されていません。',
  },
} as const;

export type OnboardingStringKey = keyof typeof ONBOARDING_STRINGS;
