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
  // Đường "app cũ ký phê duyệt" NAY ĐÃ CÓ (`DevicePairScreen` + `authorizeDeviceKey`).
  // Câu cũ ở đây nói nó "chưa làm xong"; giữ lại là để một lời khai đã chết đứng
  // giữa hai lối rẽ và đẩy người dùng sang lối đắt hơn.
  'identity.gate.otherApp.temporary': {
    vi: 'Dòng này vẫn dẫn tới màn 24 từ. Nếu app kia trên máy này còn đang đăng nhập, dòng ngay bên dưới nhẹ hơn: nhờ nó duyệt, không cần 24 từ.',
    en: 'This one still leads to the 24-word screen. If the other app on this phone is still signed in, the line just below is lighter: let it approve this app, no 24 words needed.',
    zh: '这一条仍会进入 24 助记词页面。如果本机上的另一个应用仍在登录状态，下面那一条更轻松：让它来批准，无需 24 个助记词。',
    ja: 'この選択は今も 24 語の画面に進みます。同じ端末の別アプリがまだサインイン中なら、すぐ下の行のほうが軽く済みます。承認してもらえば 24 語は不要です。',
  },

  // ── Lối D — nhờ máy/app đang đăng nhập duyệt khoá của máy này (issue #233) ──
  // Đây là lối DUY NHẤT không thu hồi gì: `POST /keys/authorize` THÊM một khoá vào
  // DID, không đụng khoá nào đang có. Vì thế nó không mang dòng `cost`.
  'identity.gate.pair.title': {
    vi: 'Nhờ app đang đăng nhập duyệt cho máy này',
    en: 'Ask the app that is already signed in to approve this one',
    zh: '让已登录的应用来批准这一台',
    ja: 'すでにサインイン済みのアプリに承認してもらう',
  },
  'identity.gate.pair.body': {
    vi: 'App này hiện một mã QR; bạn mở app đang đăng nhập rồi quét mã đó. Hai bên dùng chung một danh tính, không phải nhập lại gì.',
    en: 'This app shows a QR code; you open the app that is already signed in and scan it. Both then share one identity, with nothing to re-enter.',
    zh: '本应用会显示一个二维码；你打开已登录的那个应用扫一扫即可。之后两边共用同一个身份，无需重新输入任何内容。',
    ja: 'このアプリが QR コードを表示します。サインイン済みのアプリで読み取ってください。以後は同じ本人情報を共有し、入力し直すものはありません。',
  },
  'identity.gate.pair.note': {
    vi: 'Không app nào bị thoát ra. Cần app kia đang mở được trong tầm tay bạn.',
    en: 'Neither app gets signed out. You do need the other app within reach and unlockable.',
    zh: '两个应用都不会被登出。前提是另一个应用就在手边且能解锁。',
    ja: 'どちらのアプリもサインアウトされません。ただし、別アプリが手元にあり開けることが前提です。',
  },

  // ── Màn GHÉP MÁY (`DevicePairScreen`) ─────────────────────────────────────
  'identity.pair.title': {
    vi: 'Ghép máy vào danh tính',
    en: 'Add a device to your identity',
    zh: '将设备加入你的身份',
    ja: '端末を本人情報に追加',
  },
  'identity.pair.mode.show': {
    vi: 'Máy này xin được duyệt',
    en: 'This device is asking to be approved',
    zh: '本设备请求获得批准',
    ja: 'この端末が承認を求めています',
  },
  'identity.pair.mode.scan': {
    vi: 'Quét mã của máy kia',
    en: 'Scan the other device’s code',
    zh: '扫描另一台设备的码',
    ja: 'もう一方の端末のコードを読み取る',
  },
  'identity.pair.show.lead': {
    vi: 'Mở app đang đăng nhập, vào “Thiết bị của tôi” rồi bấm “Thêm máy”, và quét mã dưới đây.',
    en: 'Open the app that is signed in, go to “My devices”, tap “Add a device”, and scan the code below.',
    zh: '打开已登录的应用，进入“我的设备”，点“添加设备”，然后扫描下面的码。',
    ja: 'サインイン済みのアプリを開き、「自分の端末」から「端末を追加」を選び、下のコードを読み取ってください。',
  },
  'identity.pair.show.keyLabel': {
    vi: 'Mã khoá của máy này',
    en: 'This device’s key',
    zh: '本设备的密钥',
    ja: 'この端末の鍵',
  },
  'identity.pair.show.preparing': {
    vi: 'Đang chuẩn bị khoá cho máy này…',
    en: 'Preparing this device’s key…',
    zh: '正在为本设备准备密钥…',
    ja: 'この端末の鍵を準備しています…',
  },
  'identity.pair.show.done': {
    vi: 'Máy kia đã duyệt xong — vào app',
    en: 'The other device approved — go in',
    zh: '另一台已批准 —— 进入应用',
    ja: '承認が終わりました — アプリへ',
  },
  'identity.pair.show.notYet': {
    vi: 'Máy chủ chưa thấy khoá của máy này được duyệt. Kiểm tra lại trên máy kia rồi bấm lần nữa.',
    en: 'The server does not see this device’s key approved yet. Check on the other device, then tap again.',
    zh: '服务器还没看到本设备的密钥获批。请在另一台上确认后再点一次。',
    ja: 'この端末の鍵が承認されたことをサーバーがまだ確認できません。もう一方の端末で確かめてから、もう一度押してください。',
  },
  'identity.pair.scan.hint': {
    vi: 'Đưa mã QR trên máy kia vào khung',
    en: 'Put the QR code on the other device inside the frame',
    zh: '把另一台设备上的二维码对准框内',
    ja: 'もう一方の端末の QR コードを枠に合わせてください',
  },
  'identity.pair.confirm.title': {
    vi: 'Duyệt cho máy này?',
    en: 'Approve this device?',
    zh: '批准这台设备吗？',
    ja: 'この端末を承認しますか？',
  },
  // ⛔ CÂU NÀY KHÔNG ĐƯỢC HỨA MỘT CHIỀU NÀO — xem chú thích đầu `DevicePairScreen`.
  // Chưa ai đo được vai `manager` bị chặn ở NHỮNG CỬA NÀO, nên cả "dùng được đầy
  // đủ" lẫn "quyền hạn chế" đều là khẳng định chưa có bằng chứng.
  'identity.pair.confirm.body': {
    vi: 'Máy mang mã khoá dưới đây sẽ vào được danh tính của bạn. Chỉ duyệt khi đó đúng là máy bạn đang cầm. Duyệt xong bạn vẫn gỡ được nó ở “Thiết bị của tôi”.',
    en: 'The device holding the key below will be able to enter your identity. Approve only if it is a device in your own hands. After approving you can still remove it from “My devices”.',
    zh: '持有下面这把密钥的设备将能够进入你的身份。只有确认那是你自己手上的设备时才批准。批准后仍可在“我的设备”中移除它。',
    ja: '下の鍵を持つ端末が、あなたの本人情報に入れるようになります。自分の手元にある端末の場合だけ承認してください。承認後も「自分の端末」から外せます。',
  },
  'identity.pair.confirm.button': {
    vi: 'Ký duyệt bằng khoá của tôi',
    en: 'Sign the approval with my key',
    zh: '用我的密钥签署批准',
    ja: '自分の鍵で承認に署名',
  },
  'identity.pair.signing': {
    vi: 'Đang ký duyệt…',
    en: 'Signing the approval…',
    zh: '正在签署批准…',
    ja: '承認に署名しています…',
  },
  'identity.pair.success.title': {
    vi: 'Đã duyệt máy đó',
    en: 'That device is approved',
    zh: '该设备已获批准',
    ja: 'その端末を承認しました',
  },
  'identity.pair.success.body': {
    vi: 'Khoá của máy đó nay nằm trong danh tính của bạn. Trên máy đó, bấm nút “Máy kia đã duyệt xong” để vào app.',
    en: 'That device’s key is now part of your identity. On that device, tap “The other device approved” to go in.',
    zh: '该设备的密钥现已属于你的身份。请在那台设备上点“另一台已批准”进入应用。',
    ja: 'その端末の鍵があなたの本人情報に入りました。その端末で「承認が終わりました」を押すと入れます。',
  },
  // Vai của khoá mới là `manager` (`keyAuthorizeService.ts`, `keyRole` cố định).
  // Câu này nói ĐÚNG những gì đã đo và DỪNG ở đó — xem `identity.pair.confirm.body`.
  'identity.pair.success.role': {
    vi: 'Máy vừa thêm nhận vai “Người quản lý”. Phạm vi chính xác của vai này do máy chủ quyết; nếu có cửa nào nó không mở được, máy đó sẽ báo ngay tại chỗ.',
    en: 'The new device gets the “Manager” role. What that role may do is decided by the server; if some door does not open for it, that device will say so on the spot.',
    zh: '新加入的设备获得“管理者”角色。该角色的具体权限由服务器决定；若某道门它打不开，那台设备会当场告知。',
    ja: '追加された端末は「マネージャー」の役割になります。その役割で何ができるかはサーバーが決めます。開かない扉があれば、その端末がその場で知らせます。',
  },
  'identity.pair.fail.title': {
    vi: 'Chưa duyệt được',
    en: 'Could not approve',
    zh: '未能批准',
    ja: '承認できませんでした',
  },
  'identity.pair.badCode': {
    vi: 'Mã vừa quét không phải mã ghép máy của hệ này.',
    en: 'The code you scanned is not a device-pairing code for this system.',
    zh: '你扫到的码不是本系统的设备配对码。',
    ja: '読み取ったコードは、このシステムの端末ペアリング用コードではありません。',
  },
  'identity.pair.retry': {
    vi: 'Quét lại',
    en: 'Scan again',
    zh: '重新扫描',
    ja: 'もう一度読み取る',
  },
  'identity.pair.close': {
    vi: 'Xong',
    en: 'Done',
    zh: '完成',
    ja: '完了',
  },

  // ── Nút vào luồng ghép máy từ màn "Thiết bị của tôi" ──────────────────────
  'identity.devices.addTitle': {
    vi: 'Thêm máy',
    en: 'Add a device',
    zh: '添加设备',
    ja: '端末を追加',
  },
  'identity.devices.addBody': {
    vi: 'Quét mã QR trên máy kia để nó dùng chung danh tính này. Không máy nào đang dùng bị gỡ ra.',
    en: 'Scan the QR code on the other device so it shares this identity. No device already in use gets removed.',
    zh: '扫描另一台设备上的二维码，让它共用这个身份。已在使用的设备都不会被移除。',
    ja: 'もう一方の端末の QR コードを読み取ると、この本人情報を共有できます。使用中の端末が外されることはありません。',
  },

  // ── Mã lỗi máy chủ 1403 vs 1405 (issue #274) ──────────────────────────────
  // Hai lỗi này TRƯỚC ĐÂY là một: máy chủ gộp lệch giờ vào 1403. Người bị lệch
  // giờ đọc "chữ ký không hợp lệ" thì không có gì để làm — họ thử lại mãi, vì
  // thứ phải sửa nằm ở Cài đặt của máy chứ không ở app.
  'identity.err.badSignature.title': {
    vi: 'Chữ ký không được chấp nhận',
    en: 'The signature was not accepted',
    zh: '签名未被接受',
    ja: '署名が受け付けられませんでした',
  },
  'identity.err.badSignature.body': {
    vi: 'Thử lại một lần. Nếu vẫn vậy, chụp màn hình này gửi hỗ trợ.',
    en: 'Try once more. If it keeps happening, screenshot this and send it to support.',
    zh: '再试一次。如果依旧如此，请截图发给客服。',
    ja: 'もう一度お試しください。続く場合はこの画面を撮って窓口へお送りください。',
  },
  'identity.err.clockSkew.title': {
    vi: 'Giờ trên máy đang lệch',
    en: 'This phone’s clock is off',
    zh: '手机时间不准',
    ja: '端末の時計がずれています',
  },
  'identity.err.clockSkew.body': {
    vi: 'Máy chủ từ chối vì đồng hồ máy bạn lệch quá nhiều. Mở Cài đặt → Ngày giờ, bật “Đặt tự động”, rồi thử lại. Chữ ký của bạn không có gì sai.',
    en: 'The server refused because this phone’s clock is too far off. Open Settings → Date & time, turn on “Set automatically”, then try again. There is nothing wrong with your signature.',
    zh: '服务器拒绝的原因是本机时钟偏差过大。请打开 设置 → 日期与时间，开启“自动设置”，然后重试。你的签名没有问题。',
    ja: 'サーバーは端末の時計のずれが大きすぎるため拒否しました。設定 →日付と時刻 で「自動設定」をオンにしてから、もう一度お試しください。署名自体に問題はありません。',
  },

  // ── Ba trạng thái của một mã định danh (`identity.isActiveAt`) ────────────
  // Gộp "chưa từng có" với "đã thu hồi" là mất đúng phần thông tin người dùng
  // cần để biết phải làm gì tiếp — xem `phoenixKey-api.ts` mục `isActiveAt`.
  'identity.did.neverExisted': {
    vi: 'Mã định danh này chưa từng được đăng ký trên máy chủ. Kiểm tra lại từng ký tự, hoặc để trống ô đó và gõ tên đăng nhập.',
    en: 'This identifier was never registered on the server. Check it character by character, or leave it blank and type your username instead.',
    zh: '这个标识从未在服务器上注册过。请逐字核对，或清空该栏改填用户名。',
    ja: 'この識別子はサーバーに登録されたことがありません。一文字ずつ確認するか、その欄を空にしてユーザー名を入力してください。',
  },
  'identity.did.revoked': {
    vi: 'Mã định danh này có thật, nhưng mọi khoá của nó đã bị thu hồi — nhiều khả năng nó đã được khôi phục ở một máy khác. Cụm 24 từ trên máy này không mở lại được nó.',
    en: 'This identifier is real, but every key on it has been revoked — most likely it was recovered on another device. The 24-word phrase on this phone cannot reopen it.',
    zh: '这个标识是真实的，但它的所有密钥都已被吊销 —— 很可能它已在另一台设备上被恢复。本机的 24 个助记词无法重新打开它。',
    ja: 'この識別子は実在しますが、鍵はすべて失効しています。別の端末で復元された可能性が高いです。この端末の 24 語では開き直せません。',
  },
  'identity.did.activeButNoMatch': {
    vi: 'Mã định danh này đang hoạt động, nhưng cụm 24 từ trên máy không ký được cho nó. Nhiều khả năng bạn nhập nhầm cụm từ, hoặc đây là mã của một tài khoản khác.',
    en: 'This identifier is active, but the 24-word phrase on this phone cannot sign for it. Most likely the phrase is wrong, or this identifier belongs to another account.',
    zh: '这个标识处于活跃状态，但本机的 24 个助记词无法为它签名。很可能是助记词输错了，或这个标识属于另一个账户。',
    ja: 'この識別子は有効ですが、この端末の 24 語では署名できません。フレーズの入力違いか、別のアカウントの識別子である可能性が高いです。',
  },

  // ── Người bảo hộ: danh sách lấy từ máy chủ (`guardians.list`) ─────────────
  // Danh sách RỖNG và lần gọi HỎNG phải ra hai màn khác nhau. Gộp lại thì một
  // lần mất sóng hiện thành "bạn chưa ghi danh ai" — và người đọc câu đó rất có
  // thể sẽ đi ghi danh lại một người đã có.
  'identity.guardian.loading': {
    vi: 'Đang lấy danh sách người bảo hộ…',
    en: 'Loading your guardians…',
    zh: '正在获取监护人名单…',
    ja: 'ガーディアンの一覧を取得しています…',
  },
  'identity.guardian.empty': {
    vi: 'Bạn chưa ghi danh người bảo hộ nào.',
    en: 'You have not registered any guardian yet.',
    zh: '你还没有登记任何监护人。',
    ja: 'まだガーディアンを登録していません。',
  },
  'identity.guardian.loadFailTitle': {
    vi: 'Chưa lấy được danh sách người bảo hộ',
    en: 'Could not load your guardians',
    zh: '未能获取监护人名单',
    ja: 'ガーディアンの一覧を取得できませんでした',
  },
  'identity.guardian.loadFailBody': {
    vi: 'Đây KHÔNG phải “bạn chưa có ai” — máy chủ chưa trả lời được. Thử lại để xem danh sách thật.',
    en: 'This is NOT “you have nobody” — the server did not answer. Retry to see the real list.',
    zh: '这并不代表“你一个都没有”—— 是服务器没有应答。请重试以查看真实名单。',
    ja: 'これは「誰もいない」という意味ではありません。サーバーが応答しませんでした。再試行して実際の一覧をご確認ください。',
  },
  'identity.guardian.retry': {
    vi: 'Thử lại',
    en: 'Retry',
    zh: '重试',
    ja: '再試行',
  },
  'identity.guardian.count': {
    vi: '{n} người bảo hộ',
    en: '{n} guardian(s)',
    zh: '{n} 位监护人',
    ja: 'ガーディアン {n} 名',
  },
  'identity.guardian.needSignIn': {
    vi: 'Cửa đọc danh sách đòi phiên đăng nhập. Đăng nhập lại rồi mở màn này.',
    en: 'Reading the list needs a signed-in session. Sign in again, then open this screen.',
    zh: '读取名单需要已登录的会话。请重新登录后再打开本页。',
    ja: '一覧の読み取りにはサインイン済みのセッションが必要です。サインインし直してからこの画面を開いてください。',
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
};
