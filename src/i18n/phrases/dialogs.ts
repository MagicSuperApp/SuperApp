// i18n/phrases/dialogs.ts — câu trong HỘP THOẠI, gom về một chỗ.
//
// Vì sao tách riêng: 196 hộp thoại trong app trước đây gọi `Alert.alert` gốc.
// Hộp thoại native do hệ điều hành vẽ, KHÔNG đi qua lớp dịch tự động — tiêu đề,
// nội dung và cả chữ trên nút đều hiện nguyên tiếng Việt với người chọn ngôn ngữ
// khác. Nay chúng dùng `showError/showWarning/showSuccess/showInfo`, tức là
// AlertPopup tự vẽ bằng `<Text>` của app, nên đi qua lớp dịch như mọi chỗ khác.
//
// Chuyển cửa mới chỉ làm chúng DỊCH ĐƯỢC. Còn dịch hay không thì phụ thuộc có
// khoá ở đây hay không — thiếu khoá là lại hiện tiếng Việt, im lặng, không lỗi.
// Tệp này là phần khoá còn thiếu sau lượt chuyển.
//
// Câu bị NỐI từ nhiều mảnh thì khoá phải là chuỗi ĐÃ NỐI, vì lớp dịch tra bằng
// đúng chuỗi lúc chạy, không tra từng mảnh.

import type { PhraseMap } from '../types';

export const DIALOGS: PhraseMap = {
  // ── Quay clip quả ──────────────────────────────────────────────────────────
  'Máy hết dung lượng': { en: 'The device is out of space', zh: '设备存储空间已满', ja: '端末の空き容量がありません' },
  'Không ghi được clip vào hàng đợi nên chưa gửi đi được. Clip vẫn còn trong máy — hãy xoá bớt ảnh/video cũ rồi bấm gửi lại.': {
    en: 'The clip could not be written to the send queue, so it has not gone out. The clip is still on the device — free up space by deleting old photos or videos, then tap send again.',
    zh: '无法将短片写入发送队列，因此尚未发出。短片仍在设备上 — 请删除旧的照片或视频腾出空间，然后再次点击发送。',
    ja: 'クリップを送信キューに書き込めなかったため、まだ送信されていません。クリップは端末に残っています — 古い写真や動画を削除して空き容量を作り、もう一度送信してください。',
  },
    'Clip vượt 80MB — hãy quay ngắn hơn.': {
    en: 'The clip is over 80 MB — please film a shorter one.',
    zh: '短片超过 80MB — 请拍摄更短的片段。',
    ja: 'クリップが 80MB を超えています — もっと短く撮影してください。',
  },
  'Ảnh thiếu kích thước': { en: 'The photo has no dimensions', zh: '照片缺少尺寸信息', ja: '写真に寸法情報がありません' },
  'Máy không trả kích thước ảnh. Anh chụp lại giúp.': {
    en: 'The device did not report the photo’s dimensions. Please take it again.',
    zh: '设备未返回照片尺寸。请重新拍摄。',
    ja: '端末が写真の寸法を返しませんでした。もう一度撮影してください。',
  },

  // ── Quét quả ───────────────────────────────────────────────────────────────
  'Chưa biết quả này ở cây nào': { en: 'Which tree this fruit belongs to is unknown', zh: '尚不知此果属于哪棵树', ja: 'この果実がどの樹木のものか不明です' },
  'Máy chủ chưa cho biết cây của quả này, và nó không nằm trong các cây quanh chỗ anh đứng. Anh chọn cây thủ công rồi mở lại quả đó.': {
    en: 'The server has not said which tree this fruit belongs to, and it is not among the trees near where you are standing. Pick the tree by hand, then open the fruit again.',
    zh: '服务器未告知此果属于哪棵树，它也不在您所在位置附近的树木之中。请手动选择树木，然后重新打开该果实。',
    ja: 'サーバーはこの果実の樹木を返しておらず、現在地周辺の樹木にも含まれていません。樹木を手動で選んでから、もう一度その果実を開いてください。',
  },
  'Chưa có ảnh': { en: 'No photo yet', zh: '尚无照片', ja: '写真がありません' },
  'Anh chụp quả trước đã.': { en: 'Please photograph the fruit first.', zh: '请先拍摄果实。', ja: 'まず果実を撮影してください。' },
  'Chưa chọn được cây': { en: 'No tree selected', zh: '尚未选择树木', ja: '樹木が選択されていません' },
  'Anh chọn cây trước rồi đăng ký quả mới trên cây đó.': {
    en: 'Pick the tree first, then register the new fruit on that tree.',
    zh: '请先选择树木，然后在该树上登记新的果实。',
    ja: '先に樹木を選び、その樹木に新しい果実を登録してください。',
  },
  'Mã tra cứu đã vào bộ nhớ tạm.': { en: 'The lookup code has been copied.', zh: '查询编号已复制。', ja: '照会コードをコピーしました。' },

  // ── Nhận diện cây ──────────────────────────────────────────────────────────
    'Xoá góc ảnh này?': { en: 'Delete this angle?', zh: '删除此角度的照片？', ja: 'このアングルを削除しますか？' },
  'Cây sẽ còn ít góc nhận dạng hơn. Chỉ nên xoá ảnh chụp hỏng hoặc chụp nhầm cây.': {
    en: 'The tree will have fewer angles to be recognised by. Only delete shots that are spoiled or of the wrong tree.',
    zh: '该树可用于识别的角度将减少。请仅删除拍坏或拍错树的照片。',
    ja: '認識に使えるアングルが減ります。失敗した写真や別の樹木を撮ったものだけを削除してください。',
  },

  // ── Nhật ký thuốc ──────────────────────────────────────────────────────────
  'Chưa chọn cây hoặc vườn': { en: 'No tree or farm selected', zh: '尚未选择树木或农场', ja: '樹木も農園も選ばれていません' },
  'Nhật ký thuốc phải gắn vào một cây hoặc một vườn cụ thể thì sau này mới tra lại được. Anh/chị mở đúng cây (hoặc vườn) rồi bấm "Quét nhãn thuốc" từ đó.': {
    en: 'A treatment log has to be attached to a specific tree or farm to be findable later. Open the right tree (or farm), then tap “Scan product label” from there.',
    zh: '用药记录必须挂在具体的树木或农场上，以后才能查回。请打开对应的树木（或农场），再从那里点击“扫描药品标签”。',
    ja: '防除記録は後から辿れるよう、特定の樹木または農園に紐づける必要があります。該当する樹木（または農園）を開き、そこから「薬剤ラベルを読み取る」を押してください。',
  },

  // ── Công khai cây ──────────────────────────────────────────────────────────
  'Bật công khai cây này?': { en: 'Make this tree public?', zh: '将此树设为公开？', ja: 'この樹木を公開しますか？' },
  'Người mua sẽ tra được xuất xứ cây, và ẢNH QUẢ của cây này lọt vào tầm so khớp của mọi người lạ dùng chức năng tra cứu. Bạn tắt lại được bất cứ lúc nào.': {
    en: 'Buyers will be able to look up the tree’s provenance, and this tree’s FRUIT PHOTOS come within matching range of any stranger using the lookup feature. You can turn it back off at any time.',
    zh: '买家将能查询该树的来源，并且此树的果实照片会进入任何使用查询功能的陌生人的比对范围。您随时可以重新关闭。',
    ja: '購入者がこの樹木の来歴を照会できるようになり、この樹木の果実写真は照会機能を使う見知らぬ人の照合対象に入ります。いつでも再び非公開に戻せます。',
  },

  // ── Chia sẻ / việc làm ─────────────────────────────────────────────────────
  'Số ngày không hợp lệ': { en: 'Invalid number of days', zh: '天数无效', ja: '日数が正しくありません' },
  'Bỏ trống nếu muốn chia sẻ không hết hạn.': {
    en: 'Leave it empty for a share link that does not expire.',
    zh: '留空表示分享链接不过期。',
    ja: '期限なしで共有する場合は空欄のままにしてください。',
  },
  'Chưa mở ứng tuyển trong ứng dụng': { en: 'Applying in the app is not open yet', zh: '应用内投递尚未开放', ja: 'アプリからの応募は未開放です' },
  'Bản này chưa gửi được hồ sơ ứng tuyển tới người đăng tin. Đường ứng tuyển đang được nối; trong lúc chờ, tin vẫn xem và lưu lại được.': {
    en: 'This build cannot yet send an application to the poster. The applying path is being wired up; in the meantime the listing can still be viewed and saved.',
    zh: '此版本尚无法将应聘资料发送给发布者。投递通道正在接入；在此期间，招聘信息仍可查看和收藏。',
    ja: 'このビルドでは応募書類を投稿者へ送信できません。応募経路は接続作業中です。それまでの間も、募集内容の閲覧と保存は可能です。',
  },

  // ── Màn Xuất cụm 24 từ ─────────────────────────────────────────────────────
  // Câu bị cắt bởi <Text> in đậm lồng bên trong nên lớp dịch nhận TỪNG mảnh, mỗi
  // mảnh một khoá. Giữ đúng khoảng trắng ở mép — lớp dịch có trim nhưng dán lại
  // đúng khoảng trắng cũ, nên bản dịch không được tự thêm bớt.
  'Ghi cụm 24 từ ra giấy là': { en: 'Writing the 24 words on paper', zh: '把这 24 个词写在纸上', ja: '24 語を紙に書き留めることは' },
  'tự tạo một chìa khoá thứ hai': { en: 'creates a second key', zh: '等于为您的钱包再造一把钥匙', ja: '二本目の鍵を自分で作ることです' },
  'cho ví của bạn. Ai đọc được tờ giấy đó thì mở được ví, và bạn': {
    en: 'to your wallet. Anyone who reads that paper can open the wallet, and you',
    zh: '。任何读到那张纸的人都能打开钱包，而您',
    ja: '。その紙を読んだ人は誰でもウォレットを開けます。そして',
  },
  'không thu hồi được': { en: 'cannot revoke it', zh: '无法收回它', ja: 'それを取り消せません' },
  '— đổi khoá cũng không cứu, vì chính cụm từ sinh ra khoá.': {
    en: '— rotating the key does not help either, because the phrase is what generates the key.',
    zh: '— 更换密钥也无济于事，因为密钥正是由该短语生成的。',
    ja: '— 鍵を交換しても解決しません。鍵はその語句から生成されるからです。',
  },
  'Cách an toàn hơn: đặt người bảo hộ': {
    en: 'A safer way: appoint guardians',
    zh: '更安全的做法：设置监护人',
    ja: 'より安全な方法: 保護者を設定する',
  },
  'Không có giấy tờ nào để mất. Đặt ngay bây giờ thì lúc mất máy đã sẵn sàng.': {
    en: 'There is no piece of paper to lose. Set them up now and they are ready the day the device goes missing.',
    zh: '没有纸张可丢失。现在就设置好，设备丢失时便已就绪。',
    ja: '失くす紙がありません。今設定しておけば、端末を失くした日にすぐ使えます。',
  },
  'Hôm nay đường khôi phục bằng người bảo hộ chưa chạy được tới cuối, nên cụm 24 từ vẫn là bản dự phòng duy nhất nếu mất máy. Nó là bản sao': {
    en: 'The guardian recovery path does not yet run end to end, so the 24 words are still the only fallback if the device is lost. They are a',
    zh: '目前监护人恢复流程尚未完全跑通，因此设备丢失时这 24 个词仍是唯一的后备。它是一份',
    ja: '現時点では保護者による復旧は最後まで通っていないため、端末を失くした場合の備えは今も 24 語だけです。これは',
  },
  'tạm thời': { en: 'temporary', zh: '临时的', ja: '一時的な' },
  ', không phải cách hệ định vận hành. Khi đường kia mở, hãy xoay khoá trước rồi mới huỷ giấy — đừng huỷ trước.': {
    en: ' copy, not how the system is meant to work. When that path opens, rotate the key first and only then destroy the paper — never the other way round.',
    zh: '副本，并非系统设计的运作方式。等那条路开通后，请先更换密钥再销毁纸张 — 不要反过来。',
    ja: '控えであり、本来の運用方法ではありません。その経路が開いたら、先に鍵を交換してから紙を処分してください — 順序を逆にしないでください。',
  },
  'Bạn không bắt buộc phải xuất cụm từ. Nếu vẫn muốn, hãy chắc không ai nhìn màn hình của bạn.': {
    en: 'You are not required to export the phrase. If you still want to, make sure no one can see your screen.',
    zh: '您并非必须导出该短语。如果仍要导出，请确保没有人能看到您的屏幕。',
    ja: '語句を書き出す必要はありません。それでも行う場合は、画面を誰にも見られないようにしてください。',
  },
  'Vẫn hiện cụm 24 từ': { en: 'Show the 24 words anyway', zh: '仍然显示这 24 个词', ja: 'それでも 24 語を表示する' },

  // ── Câu có giá trị chèn vào ────────────────────────────────────────────────
  // Tra từ điển khớp NGUYÊN chuỗi, nên `` `${n} …` `` không bao giờ trúng khoá —
  // mỗi lần chạy sinh một chuỗi khác. Tách khung ra khoá riêng rồi mới chèn.
  'Đã đăng ký {loai} vào hệ thống.': {
    en: 'Registered {loai} in the system.',
    zh: '已将{loai}登记入系统。',
    ja: '{loai}をシステムに登録しました。',
  },
  'Ảnh vừa chụp vẫn giữ nguyên.': {
    en: 'The photo you just took is kept.',
    zh: '刚拍摄的照片仍保留。',
    ja: '撮影した写真はそのまま残ります。',
  },
  'Mã cây: {ma}': { en: 'Tree code: {ma}', zh: '树木编号：{ma}', ja: '樹木コード: {ma}' },
  'Bạn muốn làm gì?': { en: 'What would you like to do?', zh: '您想怎么做？', ja: 'どうしますか？' },
  'Nếu chắc đây là một cây KHÁC, chọn "Tạo cây mới".': {
    en: 'If you are sure this is a DIFFERENT tree, choose “Create new tree”.',
    zh: '如果确定这是另一棵树，请选择“新建树木”。',
    ja: 'これが別の樹木だと確信できる場合は「新しい樹木を作成」を選んでください。',
  },
  'Tx: {tx}…\nMất vài phút để lên chuỗi.': {
    en: 'Tx: {tx}…\nIt takes a few minutes to reach the chain.',
    zh: '交易: {tx}…\n上链需要几分钟。',
    ja: 'Tx: {tx}…\nチェーンに載るまで数分かかります。',
  },

  // ── Danh mục loài vật nuôi ─────────────────────────────────────────────────
  'Loài chưa rõ': { en: 'Unknown species', zh: '物种未知', ja: '種別不明' },
};
