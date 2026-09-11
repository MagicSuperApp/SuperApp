/**
 * Chuỗi CỬA VÀO DANH TÍNH (`identity.*`) — màn hỏi-trước-rồi-rẽ và bước sao lưu
 * sau khi đăng ký.
 *
 * Cùng nếp với `trace.ts`/`onboarding.ts` — xem chú thích đầu `keys/index.ts`.
 *
 * ── Vì sao có màn hỏi này ──────────────────────────────────────────────────
 * Màn đăng nhập cũ đặt nút sinh trắc TRÒN, XANH, TO NHẤT ở giữa màn và không có
 * một chữ nào trên nút. Bấm nút đó khi máy chưa có danh tính thì đi THẲNG sang
 * màn tạo mới — tức người dùng chọn một trong ba luồng mà không được hỏi lấy
 * một câu. Ba luồng đó khác hẳn nhau:
 *
 *   A. chưa từng dùng app nào của hệ            → tạo danh tính mới
 *   B. CÙNG app, MÁY KHÁC (đổi máy / cài lại)   → 24 từ
 *   C. CÙNG máy, APP KHÁC của hệ                → 24 từ, và app kia bị đăng xuất
 *
 * Bấm nhầm sang A là sinh một DID THỨ HAI cho cùng một người: `farmService` lấy
 * `owner_did` từ phiên nên danh sách vườn hiện RỖNG, mà rỗng trùng khớp với
 * "tôi chưa ghi gì" — nên nó không phải triệu chứng, nó là một hiểu lầm.
 *
 * ── Vì sao B và C phải tách, dù cùng dẫn tới 24 từ ─────────────────────────
 * Câu chữ cũ ở thẻ khôi phục là "Đã dùng một app KHÁC của hệ này?" — nó tả đúng
 * ca C và LOẠI NHẦM ca B: người đổi điện thoại dùng CÙNG app trên MÁY KHÁC, đọc
 * chữ "app khác" thì tự loại mình ra. Hai ca cũng khác nhau ở cái GIÁ phải trả:
 * ca B văng phiên ở những máy khác, ca C văng luôn app kia trên chính máy này.
 *
 * ── Vì sao mỗi lối rẽ phải nói HỆ QUẢ trước khi bấm ────────────────────────
 * B và C đều dẫn tới `identity.recoverDevice`. Máy chủ tăng `users.token_epoch`
 * mỗi lần khôi phục rồi bác MỌI phiên mang epoch cũ — xem
 * `screens/RestoreIdentityScreen.tsx` khối chú thích trên `handleRestore`. Nói
 * cái giá đó SAU khi người dùng đã chọn thì đã muộn một bước.
 */

export const IDENTITY_STRINGS = {
  // ── Màn hỏi trước rồi rẽ ──────────────────────────────────────────────────
  'identity.gate.title': {
    vi: 'Bạn đã từng dùng app nào cùng nhóm với app này chưa?',
    en: 'Have you used any app in this system before?',
    zh: '你以前用过本系统的任何应用吗？',
    ja: 'このシステムのアプリを使ったことがありますか？',
  },
  'identity.gate.intro': {
    vi: 'Chọn đúng dòng nói về bạn. Chọn nhầm thì máy lập cho bạn một tài khoản THỨ HAI, và vườn cũ sẽ không hiện ra.',
    en: 'Pick the line that describes you. The wrong pick creates a SECOND identity for you, and your old farm will not appear.',
    zh: '请选择符合你情况的一项。选错会为你新建第二个身份，原来的果园就不会出现。',
    ja: 'ご自身に当てはまるものを選んでください。誤って選ぶと二つ目の本人情報が作られ、以前の農園は表示されません。',
  },

  // Lối A — người mới
  'identity.gate.new.title': {
    vi: 'Tôi là người mới',
    en: 'I am new here',
    zh: '我是新用户',
    ja: 'はじめて使います',
  },
  'identity.gate.new.body': {
    vi: 'Chưa dùng app nào cùng nhóm. Điện thoại này sẽ lập cho bạn một tài khoản mới.',
    en: 'Never used any app in this system. A new identity will be created right on your phone.',
    zh: '从未用过本系统的任何应用。将直接在你的手机上创建一个新身份。',
    ja: 'このシステムのアプリを使ったことがありません。新しい本人情報をこの端末で作成します。',
  },

  // Lối B — CÙNG app, MÁY KHÁC
  'identity.gate.sameApp.title': {
    vi: 'Tôi đổi điện thoại, hoặc vừa cài lại app này',
    en: 'I changed phone, or just reinstalled this app',
    zh: '我换了手机，或刚重装了这个应用',
    ja: '機種変更した、またはこのアプリを入れ直した',
  },
  'identity.gate.sameApp.body': {
    vi: 'Vẫn là app này, chỉ khác máy. Nhập cụm 24 từ để mở lại đúng tài khoản cũ — vườn, cây và ví theo bạn sang máy mới.',
    en: 'Same app, different device. Enter your 24-word phrase to reopen the same identity — your farms, trees and wallet come with you.',
    zh: '还是这个应用，只是换了设备。输入 24 个助记词即可重新打开原来的身份 —— 果园、树木和钱包都会跟着过来。',
    ja: '同じアプリで端末だけが違う状態です。24 語のフレーズを入力すると同じ本人情報を開き直せます。農園・樹木・ウォレットもそのまま引き継がれます。',
  },
  'identity.gate.sameApp.cost': {
    vi: 'Bạn sẽ mất gì: mọi máy khác đang dùng tài khoản này bị thoát ra ngay.',
    en: 'The cost: every other device using this identity is signed out immediately.',
    zh: '代价：正在使用该身份的其他设备会立即被登出。',
    ja: '代償：この本人情報を使っている他のすべての端末は直ちにサインアウトされます。',
  },

  // Lối C — CÙNG máy, APP KHÁC
  'identity.gate.otherApp.title': {
    vi: 'Máy này đang có một app khác cùng nhóm',
    en: 'This phone already has another app from this system',
    zh: '这台手机上已有本系统的另一个应用',
    ja: 'この端末にシステム内の別のアプリが入っている',
  },
  'identity.gate.otherApp.body': {
    vi: 'Mỗi app cất chìa khoá một chỗ riêng trong máy, app này không thấy chìa của app kia. Hiện giờ chỉ có một cách: nhập lại cụm 24 từ.',
    en: 'The two apps keep their keys in separate places on the device, so this app cannot see the other app’s key. Today the only way across is to re-enter the 24-word phrase.',
    zh: '两个应用把密钥存放在设备上彼此隔离的位置，所以本应用看不到另一个应用的密钥。目前唯一的办法是重新输入 24 个助记词。',
    ja: '二つのアプリは端末内の別々の場所に鍵を保管するため、このアプリは別アプリの鍵を見られません。現在の唯一の方法は 24 語のフレーズを入力し直すことです。',
  },
  'identity.gate.otherApp.cost': {
    vi: 'Bạn sẽ mất gì: app kia trên chính máy này bị thoát ra, muốn dùng lại phải nhập 24 từ ở bên đó.',
    en: 'The cost: the other app on this same phone is signed out, and getting back into it means entering the 24 words there.',
    zh: '代价：本机上的另一个应用会被登出，想继续使用就得在那边重新输入 24 个助记词。',
    ja: '代償：同じ端末の別アプリはサインアウトされ、使い直すにはそちらで 24 語を入力する必要があります。',
  },
  // Đường "app cũ ký phê duyệt" chưa có. Nói thẳng là đích tạm, đừng để người
  // dùng tưởng đây là đường riêng cho ca C.
  'identity.gate.otherApp.temporary': {
    vi: 'Cách nhờ app cũ xác nhận hộ thì chưa làm xong. Nên chọn dòng này cũng ra màn nhập 24 từ.',
    en: 'There is no “ask the old app to approve” path yet — today this leads to the same 24-word screen.',
    zh: '目前还没有“由旧应用确认”的通道 —— 这条路今天会带你到同一个 24 助记词页面。',
    ja: '「旧アプリに承認してもらう」経路はまだありません。今はこの選択も同じ 24 語入力画面に進みます。',
  },

  'identity.gate.back': {
    vi: 'Quay lại màn đăng nhập',
    en: 'Back to sign-in',
    zh: '返回登录页',
    ja: 'サインイン画面に戻る',
  },

  // ── Bước sao lưu sau khi đăng ký ──────────────────────────────────────────
  'identity.backup.title': {
    vi: 'Nếu mất điện thoại, chỉ một thứ lấy lại được vườn của bạn',
    en: 'If you lose this phone, only one thing gets your farm back',
    zh: '万一手机丢了，只有一样东西能找回你的果园',
    ja: 'この端末をなくしたとき、農園を取り戻せるものはひとつだけです',
  },
  'identity.backup.body': {
    vi: 'Đó là cụm 24 từ của riêng bạn. Không ai giữ hộ, và không ai cấp lại được. Xem và cất giữ bây giờ, hoặc để sau — tuỳ bạn.',
    en: 'It is your own 24-word phrase. No server keeps a copy, and nobody can issue a new one. View and store it now, or later — your call.',
    zh: '那就是你自己的 24 个助记词。没有服务器代为保管，也没有人能补发。现在查看并保存，或者以后再说 —— 由你决定。',
    ja: 'それはあなた自身の 24 語のフレーズです。控えを預かるサーバーはなく、再発行できる人もいません。今すぐ確認して保管しても、後回しにしても構いません。',
  },
  'identity.backup.now': {
    vi: 'Xem 24 từ và cất giữ ngay',
    en: 'Save my backup now',
    zh: '立即保存备份',
    ja: '今すぐバックアップを保存',
  },
  // Cố ý KHÔNG viết "Nhắc tôi sau": `seedBackupReminder.ts` mới có phần GHI mốc
  // (`markSeedBackupDeferred`, gọi ở `SignUpCompleteScreen.tsx:166`) và phần XOÁ.
  // Chưa mã nào ĐỌC mốc đó để nhắc, nên chữ "nhắc" là một lời hứa không ai giữ —
  // và không phép kiểm nào bắt được kiểu hứa này. Đổi lại khi phần đọc có người gọi.
  'identity.backup.later': {
    vi: 'Để sau',
    en: 'Not now',
    zh: '稍后再说',
    ja: 'あとで',
  },

  // ── Lỗi từ lõi bảo mật (Rust FFI) ─────────────────────────────────────────
  // Lõi nói được lý do CỤ THỂ (xem `services/enclaveErrorMessage.ts`), và câu
  // của lõi thì hiện thẳng vì nó nói được người dùng phải làm gì. Hai khoá dưới
  // đây chỉ dùng cho hai ca mà câu của lõi KHÔNG hiện được:
  //   · lõi im lặng  → nói thẳng là im lặng, đừng bịa một lý do
  //   · câu lỗi thô (vết ngăn xếp, đường dẫn nội bộ) → chỉ đưa MÃ TRA NGƯỢC.
  // Từng có một khoá đi ra ngoài theo vết ngăn xếp của một thư viện ngoài, nên
  // đường này đóng ở tầng mã chứ không nhờ người gọi nhớ.
  'identity.enclave.systemError': {
    vi: 'Lõi bảo mật gặp lỗi hệ thống. Mã tra cứu: {code}. Gửi mã này cho người hỗ trợ.',
    en: 'The secure core hit a system error. Reference code: {code}. Send this code to support.',
    zh: '安全核心发生系统错误。查询代码：{code}。请把此代码发给支持人员。',
    ja: 'セキュアコアでシステムエラーが発生しました。参照コード: {code}。このコードをサポートにお伝えください。',
  },
  'identity.enclave.noReason': {
    vi: 'Lõi bảo mật từ chối thao tác {method} nhưng không nêu lý do.',
    en: 'The secure core refused “{method}” without giving a reason.',
    zh: '安全核心拒绝了「{method}」，但没有给出原因。',
    ja: 'セキュアコアは「{method}」を拒否しましたが、理由を示していません。',
  },
};
