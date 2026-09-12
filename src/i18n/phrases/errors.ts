// i18n/phrases/errors.ts — thông báo lỗi, cảnh báo, chuỗi dịch vụ nền.
//
// Nhiều chuỗi ở đây do service ném ra rồi hiện thẳng trong AlertPopup/StateView →
// vẫn là chữ NGƯỜI DÙNG đọc, nên phải dịch.

import type { PhraseMap } from '../types';

export const ERRORS: PhraseMap = {
  // ── Mặc định của utils/alert ───────────────────────────────────────────────
  'Đã xảy ra lỗi.': { en: 'Something went wrong.', zh: '发生错误。', ja: 'エラーが発生しました。' },
  'Đã có lỗi xảy ra.': { en: 'Something went wrong.', zh: '发生错误。', ja: 'エラーが発生しました。' },
  'Có lỗi xảy ra.': { en: 'Something went wrong.', zh: '发生错误。', ja: 'エラーが発生しました。' },
  'Có lỗi xảy ra. Bạn thử lại nhé.': { en: 'Something went wrong. Please try again.', zh: '发生错误，请重试。', ja: 'エラーが発生しました。もう一度お試しください。' },
  'Thao tác thành công.': { en: 'Done successfully.', zh: '操作成功。', ja: '操作が完了しました。' },
  'Cảnh báo.': { en: 'Warning.', zh: '警告。', ja: '警告。' },
  'Thông tin.': { en: 'Information.', zh: '提示。', ja: 'お知らせ。' },

  // ── Mạng / đồng bộ ─────────────────────────────────────────────────────────
  'Không có mạng': { en: 'No network', zh: '无网络', ja: 'ネットワークに接続していません' },
  'Không có kết nối mạng. App sẽ lưu dữ liệu cục bộ và đồng bộ sau.': {
    en: 'No network connection. The app will store data locally and sync later.',
    zh: '无网络连接。应用会将数据保存在本地并稍后同步。',
    ja: 'ネットワークに接続していません。データは端末に保存し、あとで同期します。',
  },
  'Kết nối mạng chậm. Vui lòng thử lại.': { en: 'Slow network connection. Please try again.', zh: '网络连接较慢，请重试。', ja: '通信が遅くなっています。もう一度お試しください。' },
  'Đẩy dữ liệu thất bại. Vui lòng kiểm tra mạng và thử lại.': {
    en: 'Upload failed. Please check your network and try again.',
    zh: '数据上传失败，请检查网络后重试。',
    ja: 'データの送信に失敗しました。通信状態を確認してからお試しください。',
  },
  'Tiếp tục ngoại tuyến': { en: 'Continue offline', zh: '继续离线使用', ja: 'オフラインのまま続ける' },
  'Dữ liệu sẽ được lưu cục bộ và đồng bộ khi có mạng': {
    en: 'Data will be stored locally and synced when you are back online',
    zh: '数据将保存在本地，联网后自动同步',
    ja: 'データは端末に保存され、通信が回復したときに同期されます',
  },
  'Mất kết nối mạng. Kiểm tra sóng/Wi-Fi rồi thử lại.': {
    en: 'Network connection lost. Check your signal or Wi-Fi and try again.',
    zh: '网络连接中断，请检查信号或 Wi-Fi 后重试。',
    ja: 'ネットワークが切断されました。電波や Wi-Fi を確認してからお試しください。',
  },
  'Mạng vẫn nối được nhưng quá chậm nên gửi ảnh chưa xong. Hãy ra chỗ sóng tốt hơn (hoặc ra ngoài trời) rồi thử lại.': {
    en: 'The connection is alive but too slow to finish sending the photos. Move somewhere with a better signal (or step outside) and try again.',
    zh: '网络仍然连通，但太慢，照片没能发完。请移动到信号更好的地方（或走到室外）后重试。',
    ja: '接続はできていますが遅すぎて写真を送り切れませんでした。電波の良い場所（屋外など）へ移動してからもう一度お試しください。',
  },
  'Máy chủ có trả lời nhưng trả về thứ đọc không được — thường là do mạng Wi-Fi đang chen một trang đăng nhập vào giữa. Hãy mở trình duyệt đăng nhập Wi-Fi đó, hoặc tắt Wi-Fi và dùng 4G, rồi thử lại.': {
    en: 'The server replied, but with something unreadable — usually a Wi-Fi sign-in page cutting in. Open a browser and sign in to that Wi-Fi, or turn Wi-Fi off and use mobile data, then try again.',
    zh: '服务器有响应，但返回的内容无法读取 — 通常是 Wi-Fi 的登录页面挡在中间。请打开浏览器登录该 Wi-Fi，或关闭 Wi-Fi 改用移动数据后重试。',
    ja: 'サーバーからの応答はありましたが、読み取れない内容でした — 多くは Wi-Fi のログインページが割り込んでいる場合です。ブラウザでその Wi-Fi にログインするか、Wi-Fi を切ってモバイル通信に切り替えてからお試しください。',
  },
  'Mất kết nối. Thử lại sau.': { en: 'Connection lost. Try again later.', zh: '连接中断，请稍后重试。', ja: '接続が切れました。しばらくしてからお試しください。' },
  'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.': {
    en: 'Could not reach the server. Check your network and try again.',
    zh: '无法连接服务器，请检查网络后重试。',
    ja: 'サーバーに接続できません。通信状態を確認してからお試しください。',
  },
  'Hết thời gian chờ': { en: 'Timed out', zh: '超时', ja: 'タイムアウトしました' },
  'Quá nhiều yêu cầu': { en: 'Too many requests', zh: '请求过多', ja: 'リクエストが多すぎます' },
  'Thao tác quá nhanh. Chờ một chút rồi thử lại.': {
    en: 'That was too fast. Wait a moment and try again.',
    zh: '操作过快，请稍等片刻后重试。',
    ja: '操作が速すぎます。少し待ってからお試しください。',
  },
  'Máy chủ đang bận. Thử lại sau ít phút.': { en: 'The server is busy. Try again in a few minutes.', zh: '服务器繁忙，请几分钟后重试。', ja: 'サーバーが混雑しています。数分後にお試しください。' },
  'Server lỗi. Thử lại sau.': { en: 'Server error. Try again later.', zh: '服务器错误，请稍后重试。', ja: 'サーバーエラーです。しばらくしてからお試しください。' },
  'Trùng lặp': { en: 'Duplicate', zh: '重复', ja: '重複' },
  'Trùng': { en: 'Duplicate', zh: '重复', ja: '重複' },
  'Token hết hạn hoặc không hợp lệ': { en: 'Token expired or invalid', zh: '令牌已过期或无效', ja: 'トークンの期限切れ、または無効です' },
  'Phiên hết hạn': { en: 'Session expired', zh: '会话已过期', ja: 'セッションの有効期限が切れました' },
  'Phiên đăng nhập hết hạn. Hãy đăng nhập lại.': { en: 'Your session expired. Please sign in again.', zh: '登录会话已过期，请重新登录。', ja: 'ログインセッションの有効期限が切れました。もう一度ログインしてください。' },

  // ── Ảnh / cảm biến ─────────────────────────────────────────────────────────
  'Ảnh mờ': { en: 'Blurry photo', zh: '照片模糊', ja: '写真がぼやけています' },
  'Ảnh mờ, giữ chắc tay.': { en: 'Blurry photo — hold the device steady.', zh: '照片模糊，请握稳设备。', ja: '写真がぼやけています。手をしっかり固定してください。' },
  'Giữ tay yên và chắc chắn ánh sáng đủ': { en: 'Hold still and make sure there is enough light', zh: '保持稳定并确保光线充足', ja: '手を動かさず、十分な明るさを確保してください' },
  'Thiết bị rung': { en: 'Device shaking', zh: '设备抖动', ja: '端末が揺れています' },
  'Thiết bị rung, vui lòng giữ yên.': { en: 'The device is shaking — please hold still.', zh: '设备抖动，请保持稳定。', ja: '端末が揺れています。動かさないでください。' },
  'Đặt thiết bị lên bề mặt cứng hoặc giữ chắc hơn': {
    en: 'Rest the device on a firm surface or hold it more steadily',
    zh: '请将设备放在稳固表面上或握得更稳',
    ja: '端末を固い面に置くか、もっとしっかり持ってください',
  },
  'App cần quyền truy cập camera. Vui lòng cấp quyền trong Cài đặt.': {
    en: 'The app needs camera access. Please grant it in Settings.',
    zh: '应用需要相机权限，请在设置中授予。',
    ja: 'カメラへのアクセス許可が必要です。設定から許可してください。',
  },
  'GPS không khả dụng. Vui lòng kiểm tra vị trí.': {
    en: 'GPS is unavailable. Please check your location settings.',
    zh: 'GPS 不可用，请检查定位设置。',
    ja: 'GPS を利用できません。位置情報の設定をご確認ください。',
  },
  'Độ chính xác GPS thấp (> 15m), dữ liệu có thể không chính xác.': {
    en: 'Low GPS accuracy (> 15 m); the data may be imprecise.',
    zh: 'GPS 精度低（> 15 米），数据可能不准确。',
    ja: 'GPS の精度が低いです（15 m 超）。データが不正確な可能性があります。',
  },
  'Vị trí không chính xác': { en: 'Inaccurate location', zh: '定位不准确', ja: '位置が正確ではありません' },
  'Độ chính xác: > 15m. Dữ liệu có thể không đúng.': {
    en: 'Accuracy: > 15 m. The data may be wrong.',
    zh: '精度：> 15 米，数据可能有误。',
    ja: '精度：15 m 超。データが正しくない可能性があります。',
  },
  'Cần bật định vị (GPS) để tạo/nhận diện cây. Hãy bật Vị trí rồi thử lại.': {
    en: 'Location (GPS) must be on to create or identify trees. Turn on Location and try again.',
    zh: '创建或识别树木需要开启定位（GPS）。请开启定位后重试。',
    ja: '樹木の登録・識別には位置情報（GPS）が必要です。位置情報をオンにしてからお試しください。',
  },

  // ── Xác thực / danh tính ───────────────────────────────────────────────────
  'Xác thực lại': { en: 'Authenticate again', zh: '重新验证', ja: 'もう一度認証' },
  'Xác thực thất bại': { en: 'Authentication failed', zh: '验证失败', ja: '認証に失敗しました' },
  'Vui lòng xác thực bằng sinh trắc học': { en: 'Please authenticate with biometrics', zh: '请使用生物识别进行验证', ja: '生体認証を行ってください' },
  'Xác thực ký số thất bại. Vui lòng xác thực lại sinh trắc học.': {
    en: 'Digital signing authentication failed. Please authenticate with biometrics again.',
    zh: '数字签名验证失败，请重新进行生物识别验证。',
    ja: '電子署名の認証に失敗しました。もう一度生体認証を行ってください。',
  },
  'Chưa kích hoạt': { en: 'Not activated', zh: '未激活', ja: '未有効化' },
  'Kích hoạt tài khoản': { en: 'Activate the account', zh: '激活账户', ja: 'アカウントを有効化' },
  'Tài khoản chưa được kích hoạt. Vui lòng hoàn tất bước Kích hoạt.': {
    en: 'The account is not activated. Please complete the activation step.',
    zh: '账户尚未激活，请完成激活步骤。',
    ja: 'アカウントが有効化されていません。有効化のステップを完了してください。',
  },
  'Bạn đã huỷ xác thực sinh trắc.': { en: 'You cancelled biometric authentication.', zh: '你已取消生物识别验证。', ja: '生体認証をキャンセルしました。' },
  'Sinh trắc tạm khoá — thử lại sau ít phút.': {
    en: 'Biometrics temporarily locked — try again in a few minutes.',
    zh: '生物识别暂时锁定 — 请几分钟后重试。',
    ja: '生体認証が一時的にロックされています。数分後にお試しください。',
  },
  'Không thể ký giao dịch. Vui lòng thử lại.': { en: 'Could not sign the transaction. Please try again.', zh: '无法签署交易，请重试。', ja: '取引に署名できません。もう一度お試しください。' },
  'Không thể tạo giao dịch.': { en: 'Could not create the transaction.', zh: '无法创建交易。', ja: '取引を作成できません。' },
  'Không thể ký giao dịch.': { en: 'Could not sign the transaction.', zh: '无法签署交易。', ja: '取引に署名できません。' },
  'Chữ ký không hợp lệ. Thử lại.': { en: 'Invalid signature. Try again.', zh: '签名无效，请重试。', ja: '署名が正しくありません。もう一度お試しください。' },
  'Blockchain bận. Thử lại sau vài phút.': { en: 'The blockchain is busy. Try again in a few minutes.', zh: '区块链繁忙，请几分钟后重试。', ja: 'ブロックチェーンが混雑しています。数分後にお試しください。' },
  'Mạng Cardano chậm. Đợi 1 phút rồi mở app lại.': {
    en: 'The Cardano network is slow. Wait a minute and reopen the app.',
    zh: 'Cardano 网络较慢，请等待 1 分钟后重新打开应用。',
    ja: 'Cardano ネットワークが遅くなっています。1 分ほど待ってからアプリを開き直してください。',
  },
  'App phiên bản cũ. Cập nhật rồi thử lại.': { en: 'App version is out of date. Update and try again.', zh: '应用版本过旧，请更新后重试。', ja: 'アプリのバージョンが古いです。更新してからお試しください。' },
  'Tạo danh tính thất bại. Thử lại.': { en: 'Identity creation failed. Try again.', zh: '创建身份失败，请重试。', ja: '本人情報の作成に失敗しました。もう一度お試しください。' },
  'Không tạo được danh tính. Vui lòng thử lại.': { en: 'Could not create the identity. Please try again.', zh: '无法创建身份，请重试。', ja: '本人情報を作成できません。もう一度お試しください。' },
  // Năm câu dưới thay cho MỘT câu cũ "Thiết bị đã có khoá nhưng chưa khôi phục được
  // danh tính…". Câu cũ đúng nhưng gộp năm nguyên nhân rất khác nhau vào một chỗ, nên
  // người dùng không biết nên thử lại vân tay, đợi sóng hay thật sự phải gọi hỗ trợ —
  // và báo lỗi ngoài thực địa không lần ngược về đâu được. Xem
  // `src/services/phoenixKeyAuthService.ts` (RECOVER_FAIL_MESSAGE).
  'Chưa xác thực được vân tay hoặc khuôn mặt nên không mở lại được danh tính trên máy này. Thử lại và giữ ngón tay tới khi máy báo xong.': {
    en: 'Fingerprint or face check did not go through, so the identity on this device could not be reopened. Try again and hold still until the device confirms.',
    zh: '指纹或人脸未通过验证，无法在本机重新打开身份。请重试，并保持不动直至设备确认。',
    ja: '指紋または顔の認証が通らず、この端末の本人情報を開き直せませんでした。もう一度、端末が確認を終えるまで動かさずにお試しください。',
  },
  'Máy này đã có khoá, nhưng chưa liên lạc được máy chủ danh tính để mở lại. Kiểm tra sóng rồi thử lại.': {
    en: 'This device already has a key, but the identity server could not be reached to reopen it. Check your signal and try again.',
    zh: '本机已有密钥，但无法连接身份服务器以重新打开。请检查网络后重试。',
    ja: 'この端末には鍵がありますが、本人情報サーバーに接続できず開き直せませんでした。電波を確認してからお試しください。',
  },
  'Máy chủ từ chối mở lại danh tính cho khoá đã có trên máy này. Đây là lỗi phía máy chủ — chụp màn hình này gửi hỗ trợ.': {
    en: 'The server refused to reopen an identity for the key already on this device. This is a server-side fault — send support a screenshot of this message.',
    zh: '服务器拒绝为本机已有的密钥重新打开身份。这是服务器端故障 — 请将此画面截图发给支持。',
    ja: 'この端末にある鍵に対して、サーバーが本人情報の再開を拒否しました。サーバー側の不具合です — この画面のスクリーンショットをサポートにお送りください。',
  },
  'Máy chủ trả về một mã danh tính app chưa hiểu được. Đây là lỗi phía máy chủ — chụp màn hình này gửi hỗ trợ.': {
    en: 'The server returned an identity code the app does not understand. This is a server-side fault — send support a screenshot of this message.',
    zh: '服务器返回了应用无法识别的身份编码。这是服务器端故障 — 请将此画面截图发给支持。',
    ja: 'アプリが解釈できない本人情報コードがサーバーから返されました。サーバー側の不具合です — この画面のスクリーンショットをサポートにお送りください。',
  },
  'Khoá trên máy này đã bị thu hồi, nhiều khả năng do trước đó có một lần khôi phục ở nơi khác. Cài lại ứng dụng không mở lại được. Hãy mở màn Khôi phục danh tính: nếu ví của bạn còn trong máy thì chỉ cần tên đăng nhập, không cần 24 từ.': {
    en: 'The key on this device has been revoked, most likely because the identity was recovered somewhere else earlier. Reinstalling the app will not bring it back. Open the Restore identity screen: if your wallet is still on this device, your username alone is enough — no 24-word phrase needed.',
    zh: '本机的密钥已被吊销，很可能是此前在别处恢复过身份。重新安装应用无法找回。请打开“恢复身份”页面：如果钱包仍在本机，只需用户名即可，不需要 24 个助记词。',
    ja: 'この端末の鍵は失効しています。以前に別の場所で本人情報を復元したためと思われます。アプリを入れ直しても戻りません。「本人情報の復元」画面を開いてください。ウォレットがこの端末に残っていれば、ユーザー名だけで足り、24単語は不要です。',
  },
  'Máy này đã có khoá của một danh tính đã tạo trước đó — có thể do một ứng dụng khác trên cùng điện thoại này. Một danh tính dùng chung cho mọi ứng dụng, nên chỉ cần nhập đúng tên đăng nhập đó là vào được ngay. Không nhớ tên thì mở màn Khôi phục danh tính.': {
    en: 'This device already holds the key of an identity created earlier — possibly by another app on this same phone. One identity works across all the apps, so entering that username is enough to get in. If you do not remember it, open the Restore identity screen.',
    zh: '本机已持有先前创建的某个身份的密钥 — 可能是同一部手机上的另一个应用创建的。一个身份可用于所有应用，因此只要输入该用户名即可进入。若记不清用户名，请打开“恢复身份”页面。',
    ja: 'この端末には、以前作成された本人情報の鍵がすでにあります — 同じ端末の別のアプリで作成された可能性があります。本人情報は一つですべてのアプリに使えるので、そのユーザー名を入力すれば入れます。思い出せない場合は「本人情報の復元」画面を開いてください。',
  },
  'Máy này đã có danh tính của bạn, nhưng bước xác thực để mở lại chưa xong. Bấm lại và làm hết CẢ HAI lần hỏi vân tay hoặc khuôn mặt — lần thứ hai có tên "Khôi phục danh tính".': {
    en: 'This device already holds your identity, but the check needed to reopen it did not finish. Tap again and complete BOTH fingerprint or face prompts — the second one is titled “Restore identity”.',
    zh: '本机已持有你的身份，但用于重新打开它的验证没有完成。请再点一次，并完成两次指纹或面容验证——第二次名为「恢复身份」。',
    ja: 'この端末にはあなたの本人情報がありますが、開き直すための認証が完了していません。もう一度タップし、指紋または顔認証を2回とも完了してください— 2回目は「本人情報の復元」という名前です。',
  },
  'Tên đăng nhập này thuộc về một danh tính khác, không phải danh tính đang có khoá trên máy. Kiểm tra lại tên, hoặc dùng máy đã tạo danh tính đó.': {
    en: 'This username belongs to a different identity, not the one whose key is on this device. Check the name, or use the device where that identity was created.',
    zh: '该用户名属于另一个身份，并非本机持有密钥的那个身份。请核对用户名，或改用创建该身份的设备。',
    ja: 'このユーザー名は別の本人情報のものであり、この端末に鍵がある本人情報ではありません。名前を確認するか、その本人情報を作成した端末をお使いください。',
  },
  'Máy này đã có khoá nhưng chưa mở lại được danh tính, chưa rõ vì sao. Thử lại một lần; nếu vẫn vậy, chụp màn hình này gửi hỗ trợ.': {
    en: 'This device already has a key but the identity could not be reopened, and the reason is not yet clear. Try once more; if it repeats, send support a screenshot of this message.',
    zh: '本机已有密钥，但未能重新打开身份，原因尚不明确。请再试一次；若仍如此，请将此画面截图发给支持。',
    ja: 'この端末には鍵がありますが本人情報を開き直せず、原因はまだ不明です。もう一度お試しください。それでも同じ場合は、この画面のスクリーンショットをサポートにお送りください。',
  },
  // ── TIÊU ĐỀ hộp thoại của màn tạo danh tính ────────────────────────────────
  // Năm câu dài phía trên là phần THÂN. Trước bản này chúng được truyền vào ô
  // TIÊU ĐỀ (`showError(x)` một tham số), nên phần thân rơi về chuỗi độn
  // "Đã xảy ra lỗi." gõ cứng trong `utils/alert.ts:88` — thấy đúng thế trong ảnh
  // chụp từ thực địa 11/09. Nay mỗi hộp có tiêu đề thật, và tiêu đề cũng phải
  // dịch được: `AlertPopup.tsx` KHÔNG gọi `t` một lần nào, nên chuỗi nào không
  // bọc ở chỗ gọi là chuỗi nằm nguyên tiếng Việt trên màn người đọc tiếng khác.
  'Chưa tạo được danh tính': { en: 'Could not create the identity', zh: '无法创建身份', ja: '本人情報を作成できませんでした' },
  'Máy này đã có một danh tính': { en: 'This device already has an identity', zh: '本机已有一个身份', ja: 'この端末にはすでに本人情報があります' },
  'Tên đăng nhập chưa dùng được': { en: 'That username cannot be used yet', zh: '该用户名暂时无法使用', ja: 'そのユーザー名はまだ使えません' },
  'Máy chưa bật sinh trắc học': { en: 'Biometrics is not set up on this device', zh: '本机尚未启用生物识别', ja: 'この端末で生体認証が設定されていません' },
  'Khoá trên máy này đã bị thu hồi': { en: 'The key on this device has been revoked', zh: '本机的密钥已被吊销', ja: 'この端末の鍵は失効しています' },
  'Một máy chỉ giữ được một danh tính': { en: 'One device holds only one identity', zh: '一台设备只能保存一个身份', ja: '1台の端末には本人情報を1つしか保持できません' },
  'Chưa mở lại được danh tính': { en: 'Could not reopen the identity', zh: '未能重新打开身份', ja: '本人情報を開き直せませんでした' },
  // Nhãn nút. `confirmText`/`cancelText` cũng đi thẳng vào `AlertPopup` không qua `t`.
  'Mở lại danh tính đó': { en: 'Reopen that identity', zh: '重新打开该身份', ja: 'その本人情報を開き直す' },
  'Mở màn khôi phục': { en: 'Open the restore screen', zh: '打开恢复页面', ja: '復元画面を開く' },
  'Thử lại ngay': { en: 'Try again now', zh: '立即重试', ja: '今すぐ再試行' },

  'Thiết bị chưa có danh tính.': {
    en: 'This device has no identity yet.',
    zh: '本机尚无身份。',
    ja: 'この端末にはまだ本人情報がありません。',
  },
  'Chưa có danh tính để bật xác thực hai lớp.': {
    en: 'No identity yet, so two-factor authentication cannot be enabled.',
    zh: '尚无身份，无法开启两步验证。',
    ja: '本人情報がないため、二段階認証を有効にできません。',
  },
  'Chưa có danh tính để ký xác nhận người giám hộ.': {
    en: 'No identity yet, so the guardian confirmation cannot be signed.',
    zh: '尚无身份，无法签署监护人确认。',
    ja: '本人情報がないため、保護者の確認に署名できません。',
  },
  'Chưa có danh tính để đổi khoá.': {
    en: 'No identity yet, so the key cannot be rotated.',
    zh: '尚无身份，无法更换密钥。',
    ja: '本人情報がないため、鍵を交換できません。',
  },
  'Thiết bị chưa hỗ trợ khoá bảo mật.': {
    en: 'This device does not support secure keys.',
    zh: '本机不支持安全密钥。',
    ja: 'この端末はセキュリティ鍵に対応していません。',
  },
  'Server không trả challenge.': { en: 'The server returned no challenge.', zh: '服务器未返回挑战值。', ja: 'サーバーがチャレンジを返しませんでした。' },
  'Chưa có refresh token — cần đăng nhập lại': { en: 'No refresh token — sign in again', zh: '没有刷新令牌 — 需要重新登录', ja: 'リフレッシュトークンがありません — 再ログインが必要です' },
  'Không kết nối được ProofChat': { en: 'Could not connect to ProofChat', zh: '无法连接 ProofChat', ja: 'ProofChat に接続できません' },

  // ── Nhắc ký (biometric prompt) ─────────────────────────────────────────────
  'Ký xác nhận': { en: 'Sign to confirm', zh: '签名确认', ja: '確認のため署名' },
  'Xác minh dữ liệu để gửi lên backend': { en: 'Verify the data before sending it to the backend', zh: '验证数据后发送到后端', ja: 'バックエンドに送る前にデータを検証します' },
  'Kích hoạt tài khoản thực hiện trên phoenixkey.me — vui lòng mở dashboard web': {
    en: 'Account activation happens on phoenixkey.me — please open the web dashboard',
    zh: '账户激活在 phoenixkey.me 完成 — 请打开网页控制台',
    ja: 'アカウントの有効化は phoenixkey.me で行います — ウェブのダッシュボードを開いてください',
  },
  'Ký bằng Ví Phượng hoàng': { en: 'Sign with the Phoenix wallet', zh: '使用凤凰钱包签名', ja: 'フェニックスウォレットで署名' },
  'Tạo danh tính mới': { en: 'Create a new identity', zh: '创建新身份', ja: '新しい本人情報を作成' },
  'Ký bằng khóa phần cứng vừa sinh': { en: 'Sign with the newly generated hardware key', zh: '使用刚生成的硬件密钥签名', ja: '生成したばかりのハードウェア鍵で署名' },
  // 'Khôi phục danh tính' khai ở navigation.ts — dùng chung.
  'Xác thực để khôi phục danh tính trên thiết bị này': {
    en: 'Authenticate to restore the identity on this device',
    zh: '进行验证以在本机恢复身份',
    ja: 'この端末で本人情報を復旧するために認証します',
  },
  'Xác nhận guardian': { en: 'Confirm guardian', zh: '确认监护人', ja: 'ガーディアンを確認' },
  'Ký bằng khoá phần cứng của bạn': { en: 'Sign with your hardware key', zh: '使用你的硬件密钥签名', ja: 'ご自身のハードウェア鍵で署名' },
  'Xác nhận bằng khoá hiện tại của bạn': { en: 'Confirm with your current key', zh: '使用当前密钥确认', ja: '現在の鍵で確認します' },
  'Kích hoạt ví': { en: 'Activate the wallet', zh: '激活钱包', ja: 'ウォレットを有効化' },
  'Ký bằng khoá phần cứng để mở khoá dịch vụ ví': {
    en: 'Sign with the hardware key to unlock wallet services',
    zh: '使用硬件密钥签名以解锁钱包服务',
    ja: 'ハードウェア鍵で署名してウォレット機能を解除します',
  },
  'Đăng nhập': {
    en: 'Sign in',
    zh: '登录',
    ja: 'ログイン',
  },
  'Ký bằng khoá trên máy để nhận diện cây': {
    en: 'Sign with the key on this device to identify the tree',
    zh: '使用本机密钥签名以识别树木',
    ja: 'この端末の鍵で署名して樹木を識別します',
  },
  'Uỷ nhiệm phiên chat': { en: 'Delegate the chat session', zh: '委托聊天会话', ja: 'チャットセッションを委任' },
  'Ký để bật bằng chứng toàn vẹn tin nhắn (12 giờ)': {
    en: 'Sign to enable message integrity proofs (12 hours)',
    zh: '签名以启用消息完整性证明（12 小时）',
    ja: '署名してメッセージの整合性証明を有効にします（12 時間）',
  },
  'Tạo danh tính tổ chức': { en: 'Create the organisation identity', zh: '创建组织身份', ja: '組織の本人情報を作成' },
  'Máy này chưa có danh tính để ký duyệt.': {
    en: 'This device has no identity to sign the approval with.',
    zh: '本机尚无用于签署批准的身份。',
    ja: 'この端末には承認に署名するための本人情報がありません。',
  },
  'Ký duyệt tổ chức': { en: 'Sign the organisation approval', zh: '签署组织批准', ja: '組織の承認に署名' },

  // ── Định danh / re-ID ──────────────────────────────────────────────────────
  'Định danh thất bại. Vui lòng thử lại hoặc chụp lại hình.': {
    en: 'Identification failed. Please try again or retake the photo.',
    zh: '识别失败，请重试或重新拍照。',
    ja: '識別に失敗しました。もう一度お試しいただくか、写真を撮り直してください。',
  },
  'Yêu cầu định danh mất quá lâu. Vui lòng thử lại.': {
    en: 'The identification request took too long. Please try again.',
    zh: '识别请求耗时过长，请重试。',
    ja: '識別リクエストに時間がかかりすぎました。もう一度お試しください。',
  },
  'Các góc chụp gần như giống nhau. Hãy ĐI VÒNG QUANH cây thật và chụp các góc khác nhau (đừng đứng yên một chỗ).': {
    en: 'The angles are nearly identical. WALK AROUND the tree and shoot from genuinely different angles (do not stand in one place).',
    zh: '拍摄角度几乎相同。请围绕树木行走，从不同角度拍摄（不要站在原地）。',
    ja: '撮影角度がほぼ同じです。実際に木のまわりを歩いて、違う角度から撮ってください（同じ場所に立ったままにしないでください）。',
  },
  'Ảnh lẫn nhiều vật khác nhau — hãy chụp tập trung vào MỘT cây, cùng một thân.': {
    en: 'The photos mix several objects — focus on ONE tree with the same trunk.',
    zh: '照片中混入多个物体 — 请只对准同一棵树的同一根树干拍摄。',
    ja: '写真に複数の対象が写っています — 同じ幹の 1 本の木だけに絞って撮ってください。',
  },
  'Cây này có thể đã được tạo trước đó.': { en: 'This tree may have been created before.', zh: '这棵树可能之前已创建过。', ja: 'この木はすでに登録されている可能性があります。' },
  'Hệ thống phát hiện ảnh chứa nhiều cây khác nhau. Vui lòng chỉ chụp một cây duy nhất trong khung hình.': {
    en: 'The system detected several different trees in the photos. Please keep only one tree in frame.',
    zh: '系统检测到照片中包含多棵不同的树。请在取景框中只保留一棵树。',
    ja: '写真に複数の異なる木が写っています。画面内には 1 本の木だけを収めてください。',
  },
  'Các ảnh quá giống nhau hoặc chỉ nhìn từ một góc. Hãy đi vòng quanh cây và chụp từ nhiều hướng đa dạng hơn.': {
    en: 'The photos are too similar or taken from one angle only. Walk around the tree and shoot from more varied directions.',
    zh: '照片过于相似或仅来自一个角度。请绕树行走，从更多不同方向拍摄。',
    ja: '写真が似すぎているか、一方向からしか撮られていません。木のまわりを歩いて、もっと多様な方向から撮ってください。',
  },

  // ── Lưu trữ ────────────────────────────────────────────────────────────────
  'Bộ nhớ thiết bị đầy. Vui lòng xoá dữ liệu cũ.': {
    en: 'Device storage is full. Please delete old data.',
    zh: '设备存储已满，请删除旧数据。',
    ja: '端末の空き容量がありません。古いデータを削除してください。',
  },
  'Xoá dữ liệu cũ': { en: 'Delete old data', zh: '删除旧数据', ja: '古いデータを削除' },
  'Lỗi lưu trữ dữ liệu. Vui lòng thử lại.': { en: 'Data storage error. Please try again.', zh: '数据存储错误，请重试。', ja: 'データの保存でエラーが発生しました。もう一度お試しください。' },
  'Lỗi không xác định. Vui lòng liên hệ hỗ trợ.': { en: 'Unknown error. Please contact support.', zh: '未知错误，请联系支持。', ja: '不明なエラーです。サポートにご連絡ください。' },
  'Lỗi không xác định. Vui lòng thử lại.': { en: 'Unknown error. Please try again.', zh: '未知错误，请重试。', ja: '不明なエラーです。もう一度お試しください。' },

  // ── Ví Phượng hoàng / chuỗi ────────────────────────────────────────────────
  'Ví Phượng hoàng chưa sẵn sàng — backend did_payment (Phase 2) đang được triển khai.': {
    en: 'The Phoenix wallet is not ready — the did_payment backend (Phase 2) is still being rolled out.',
    zh: '凤凰钱包尚未就绪 — did_payment 后端（第二阶段）仍在部署中。',
    ja: 'フェニックスウォレットはまだ利用できません — did_payment バックエンド（フェーズ 2）を展開中です。',
  },
  'Ký giao dịch trên Cardano Mainnet đang bị khoá trong giai đoạn thử nghiệm.': {
    en: 'Signing transactions on Cardano Mainnet is locked during the trial phase.',
    zh: '试运行阶段暂不允许在 Cardano 主网上签署交易。',
    ja: '試験期間中は Cardano メインネットでの取引署名を停止しています。',
  },
  'Chưa có khoá Phượng hoàng trên máy. Vui lòng kích hoạt danh tính trước.': {
    en: 'No Phoenix key on this device. Please activate your identity first.',
    zh: '本机没有凤凰密钥，请先激活身份。',
    ja: 'この端末にフェニックス鍵がありません。先に本人情報を有効化してください。',
  },
  'Yêu cầu ký đã hết hạn — vui lòng tạo lại giao dịch.': {
    en: 'The signing request expired — please recreate the transaction.',
    zh: '签名请求已过期 — 请重新创建交易。',
    ja: '署名リクエストの有効期限が切れました — 取引を作り直してください。',
  },
  'Yêu cầu ký đã bị huỷ.': { en: 'The signing request was cancelled.', zh: '签名请求已取消。', ja: '署名リクエストは取り消されました。' },
  'Yêu cầu ký đã hết hạn.': { en: 'The signing request expired.', zh: '签名请求已过期。', ja: '署名リクエストの有効期限が切れました。' },
  'Không mở được luồng chờ ký.': { en: 'Could not open the signing wait stream.', zh: '无法打开签名等待流。', ja: '署名待ちのストリームを開けません。' },
  'Luồng chờ ký đóng trước khi gom đủ chữ ký.': {
    en: 'The signing stream closed before enough signatures were collected.',
    zh: '签名流在收集到足够签名前已关闭。',
    ja: '必要な署名が集まる前に、署名待ちのストリームが閉じました。',
  },
  'Lỗi mạng khi chờ ký.': { en: 'Network error while waiting for signatures.', zh: '等待签名时发生网络错误。', ja: '署名を待っている間に通信エラーが発生しました。' },
  'Ví tổ chức chưa sẵn sàng — tính năng phát hành LAMP sẽ mở ở bản sau.': {
    en: 'The organisation wallet is not ready — LAMP issuance will open in a later release.',
    zh: '组织钱包尚未就绪 — LAMP 发行将在后续版本开放。',
    ja: '組織ウォレットはまだ準備できていません — LAMP の発行は今後のバージョンで開放されます。',
  },
  'Bước đưa LAMP về ví chưa mở — sẽ có ở bản sau. LAMP của bạn vẫn đang được giữ an toàn trong kho.': {
    en: 'Moving LAMP into your wallet is not open yet — it will arrive in a later release. Your LAMP is still held safely in the vault.',
    zh: '将 LAMP 转入钱包的步骤尚未开放 — 将在后续版本推出。你的 LAMP 仍安全存放在金库中。',
    ja: 'LAMP をウォレットへ移す手順はまだ開放されていません — 今後のバージョンで提供します。あなたの LAMP は保管庫で安全に保持されています。',
  },
  'Tính năng ký giao dịch sẽ mở ở bản sau.': {
    en: 'Transaction signing will open in a later release.',
    zh: '交易签名功能将在后续版本开放。',
    ja: '取引の署名は今後のバージョンで開放されます。',
  },
  'Đang tạo yêu cầu mint…': { en: 'Creating the mint request…', zh: '正在创建铸造请求…', ja: '発行リクエストを作成中…' },
  'Đang chờ ký (sinh trắc)…': { en: 'Waiting for the signature (biometrics)…', zh: '等待签名（生物识别）…', ja: '署名を待っています（生体認証）…' },
  'Đang gửi giao dịch lên chuỗi…': { en: 'Submitting the transaction on-chain…', zh: '正在向链上提交交易…', ja: '取引をチェーンへ送信中…' },
  'Đã mint vào kho.': { en: 'Minted into the treasury.', zh: '已铸造到金库。', ja: '保管庫へ発行しました。' },
  'Không mint được. Vui lòng thử lại.': { en: 'Could not mint. Please try again.', zh: '无法铸造，请重试。', ja: '発行できません。もう一度お試しください。' },
  'Chưa thể đưa LAMP về ví — vui lòng thử lại sau.': {
    en: 'LAMP cannot be moved to the wallet yet — please try again later.',
    zh: '暂时无法将 LAMP 转入钱包，请稍后重试。',
    ja: 'LAMP をウォレットへ移せません — しばらくしてからお試しください。',
  },
  'Không derive được địa chỉ stake (KEK sai?).': { en: 'Could not derive the stake address (wrong KEK?).', zh: '无法派生质押地址（KEK 错误？）。', ja: 'ステークアドレスを導出できません（KEK が違う可能性）。' },
  'Không derive được địa chỉ ví (KEK sai?).': { en: 'Could not derive the wallet address (wrong KEK?).', zh: '无法派生钱包地址（KEK 错误？）。', ja: 'ウォレットアドレスを導出できません（KEK が違う可能性）。' },
  'Không derive được địa chỉ ví người gửi (KEK sai?).': {
    en: 'Could not derive the sender wallet address (wrong KEK?).',
    zh: '无法派生发送方钱包地址（KEK 错误？）。',
    ja: '送信元ウォレットのアドレスを導出できません（KEK が違う可能性）。',
  },

  // ── Trợ lý ─────────────────────────────────────────────────────────────────
  'Lỗi mạng khi gọi trợ lý Aladin': { en: 'Network error while calling the Aladin assistant', zh: '调用 Aladin 助手时发生网络错误', ja: 'Aladin アシスタントの呼び出しで通信エラーが発生しました' },
  'Trợ lý Aladin phản hồi quá lâu': { en: 'The Aladin assistant took too long to respond', zh: 'Aladin 助手响应超时', ja: 'Aladin アシスタントの応答に時間がかかりすぎました' },
  'Không gửi được yêu cầu tới Aladin': { en: 'Could not send the request to Aladin', zh: '无法向 Aladin 发送请求', ja: 'Aladin へリクエストを送信できません' },

  // ── Phí ────────────────────────────────────────────────────────────────────
  'Thu gọn chi tiết phí': { en: 'Collapse fee details', zh: '收起费用明细', ja: '手数料の内訳を折りたたむ' },
  'Mở rộng để xem phân bổ phí theo bucket': { en: 'Expand to see the fee breakdown by bucket', zh: '展开查看按桶分配的费用明细', ja: '展開してバケットごとの手数料内訳を見る' },
  'thu gọn': { en: 'collapse', zh: '收起', ja: '折りたたむ' },
  'xem chi tiết': { en: 'view details', zh: '查看详情', ja: '詳細を見る' },
  'Phí tác vụ: {fee}. Nhấn để {action}.': {
    en: 'Transaction fee: {fee}. Tap to {action}.',
    zh: '操作费用：{fee}。点击可{action}。',
    ja: '操作手数料：{fee}。タップで{action}。',
  },

  // ── Lỗi tầng nền (enclave, đồng bộ, tài nguyên 3D) ─────────────────────────
  // Đây là `Error.message` do lớp dưới ném ra; nhiều chỗ hiển thị nguyên văn lên
  // hộp thoại lỗi nên vẫn phải dịch. Chuỗi console.log THUẦN không khai ở đây.
  'signWalletRegister: native trả thiếu pubkey/signature': {
    en: 'signWalletRegister: the native layer returned no pubkey/signature',
    zh: 'signWalletRegister：原生层未返回 pubkey/signature',
    ja: 'signWalletRegister：ネイティブ層が pubkey/signature を返しませんでした',
  },
  'buildSignedTransfer: native trả rỗng (KEK/seed sai, UTXO trống, hoặc build lỗi)': {
    en: 'buildSignedTransfer: the native layer returned nothing (wrong KEK/seed, no UTXO, or a build error)',
    zh: 'buildSignedTransfer：原生层返回为空（KEK/seed 有误、无 UTXO，或构建出错）',
    ja: 'buildSignedTransfer：ネイティブ層が空を返しました（KEK/seed の誤り、UTXO なし、またはビルドエラー）',
  },
  'buildStakeDelegation: native trả rỗng (KEK/seed sai, UTXO trống, hoặc build lỗi)': {
    en: 'buildStakeDelegation: the native layer returned nothing (wrong KEK/seed, no UTXO, or a build error)',
    zh: 'buildStakeDelegation：原生层返回为空（KEK/seed 有误、无 UTXO，或构建出错）',
    ja: 'buildStakeDelegation：ネイティブ層が空を返しました（KEK/seed の誤り、UTXO なし、またはビルドエラー）',
  },
  'witnessUnsignedTx: native trả rỗng (KEK sai hoặc tx CBOR không hợp lệ)': {
    en: 'witnessUnsignedTx: the native layer returned nothing (wrong KEK or invalid tx CBOR)',
    zh: 'witnessUnsignedTx：原生层返回为空（KEK 有误或交易 CBOR 无效）',
    ja: 'witnessUnsignedTx：ネイティブ層が空を返しました（KEK の誤り、または tx CBOR が不正）',
  },
  'deviceKeyOptin: native trả thiếu pubkey/signature/secret': {
    en: 'deviceKeyOptin: the native layer returned no pubkey/signature/secret',
    zh: 'deviceKeyOptin：原生层未返回 pubkey/signature/secret',
    ja: 'deviceKeyOptin：ネイティブ層が pubkey/signature/secret を返しませんでした',
  },
  'TreeReID native module chưa hỗ trợ trên Android': {
    en: 'The TreeReID native module is not supported on Android yet',
    zh: 'TreeReID 原生模块尚不支持 Android',
    ja: 'TreeReID ネイティブモジュールはまだ Android に対応していません',
  },
  'TreeReID native module chưa sẵn sàng': {
    en: 'The TreeReID native module is not ready',
    zh: 'TreeReID 原生模块尚未就绪',
    ja: 'TreeReID ネイティブモジュールが未準備です',
  },
  'Phản hồi server không hợp lệ.': { en: 'The server response was invalid.', zh: '服务器响应无效。', ja: 'サーバーの応答が不正です。' },
  'network_info thiếu bootstrap_peer_id.': { en: 'network_info is missing bootstrap_peer_id.', zh: 'network_info 缺少 bootstrap_peer_id。', ja: 'network_info に bootstrap_peer_id がありません。' },
  'farm_update thiếu id/owner_did/boundary — không đủ field cho POST /farms': {
    en: 'farm_update is missing id/owner_did/boundary — not enough fields for POST /farms',
    zh: 'farm_update 缺少 id/owner_did/boundary — 字段不足以调用 POST /farms',
    ja: 'farm_update に id/owner_did/boundary がありません — POST /farms に必要な項目が不足しています',
  },
  'tree_identification thiếu id/farmId/GPS — không đủ field cho POST /trees': {
    en: 'tree_identification is missing id/farmId/GPS — not enough fields for POST /trees',
    zh: 'tree_identification 缺少 id/farmId/GPS — 字段不足以调用 POST /trees',
    ja: 'tree_identification に id/farmId/GPS がありません — POST /trees に必要な項目が不足しています',
  },
  '[CẦN XÁC NHẬN CONTRACT] fruit_identification: không có POST /fruits; fruit sinh qua /captures/3d, payload hiện chưa đủ': {
    en: '[CONTRACT NEEDS CONFIRMING] fruit_identification: there is no POST /fruits; fruit is created through /captures/3d and the payload is not complete yet',
    zh: '[需确认接口约定] fruit_identification：没有 POST /fruits；果实通过 /captures/3d 创建，当前 payload 还不完整',
    ja: '[要契約確認] fruit_identification：POST /fruits は存在せず、果実は /captures/3d 経由で作成されます。現状ペイロードが不足しています',
  },
  '[CẦN XÁC NHẬN CONTRACT] activity: chưa có endpoint backend xác nhận': {
    en: '[CONTRACT NEEDS CONFIRMING] activity: no confirmed backend endpoint yet',
    zh: '[需确认接口约定] activity：后端尚无已确认的接口',
    ja: '[要契約確認] activity：確定したバックエンドのエンドポイントがありません',
  },
  'stored=false (byte chưa lên LampNet)': { en: 'stored=false (bytes have not reached LampNet)', zh: 'stored=false（字节尚未上传到 LampNet）', ja: 'stored=false（バイトが LampNet に未到達）' },
  'GLB quá ngắn': { en: 'The GLB file is too short', zh: 'GLB 文件过短', ja: 'GLB ファイルが短すぎます' },
  'Không phải tệp GLB (sai magic)': { en: 'Not a GLB file (wrong magic number)', zh: '不是 GLB 文件（magic 不符）', ja: 'GLB ファイルではありません（マジックナンバー不一致）' },
  'GLB thiếu chunk JSON': { en: 'The GLB file has no JSON chunk', zh: 'GLB 文件缺少 JSON 块', ja: 'GLB ファイルに JSON チャンクがありません' },
  'expo-asset không trả về uri': { en: 'expo-asset returned no uri', zh: 'expo-asset 未返回 uri', ja: 'expo-asset が uri を返しませんでした' },
  'resolveAssetSource không trả về uri': { en: 'resolveAssetSource returned no uri', zh: 'resolveAssetSource 未返回 uri', ja: 'resolveAssetSource が uri を返しませんでした' },
  // (Hai câu về ví tổ chức / đưa LAMP về ví đã khai ở đầu file này.)
};
