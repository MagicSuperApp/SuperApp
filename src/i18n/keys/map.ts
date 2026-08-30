/**
 * Chuỗi của màn DẪN ĐƯỜNG, theo khoá `map.<nhóm>.<tên>`.
 *
 * Cùng nếp với `trace.ts` — xem chú thích đầu tệp đó để biết vì sao dùng khoá
 * thay vì lấy chính câu tiếng Việt làm khoá.
 *
 * Chỗ thay viết `{tên}`: `tk('map.nav.distanceAway', { d: '120 m' })`.
 */

import type { KeyMap } from './index';

export const MAP_STRINGS = {
  // ── Đầu màn ───────────────────────────────────────────────────────────────
  'map.title': { vi: 'Đường tới {name}', en: 'Route to {name}', zh: '前往 {name}', ja: '{name} への道' },
  'map.target.farm': { vi: 'vườn', en: 'the farm', zh: '果园', ja: '果樹園' },
  'map.target.tree': { vi: 'cây', en: 'the tree', zh: '果树', ja: '木' },
  'map.target.farmCap': { vi: 'Vườn', en: 'Farm', zh: '果园', ja: '果樹園' },
  'map.target.treeCap': { vi: 'Cây', en: 'Tree', zh: '果树', ja: '木' },

  // ── Nút mở bản đồ ngoài ───────────────────────────────────────────────────
  'map.openmap': { vi: 'Mở bản đồ chỉ đường', en: 'Open in Maps', zh: '打开地图导航', ja: '地図アプリで開く' },
  'map.openmap.note': {
    vi: 'Bản đồ ngoài chỉ đưa được tới gần vườn. Đoạn cuối trong vườn thì đi theo kim ở trên.',
    en: 'Outside maps only get you near the farm. For the last stretch inside it, follow the needle above.',
    zh: '外部地图只能带你到果园附近。园内最后一段请跟着上面的指针走。',
    ja: '地図アプリは果樹園の近くまでです。園内の最後の区間は上の針に従ってください。',
  },
  'map.openmap.failTitle': { vi: 'Chưa mở được bản đồ', en: 'Could not open Maps', zh: '无法打开地图', ja: '地図を開けません' },
  'map.openmap.failBody': {
    vi: 'Máy chưa cài ứng dụng bản đồ nào. Bạn dùng kim và khoảng cách ở màn này để đi nhé.',
    en: 'No map app is installed. Use the needle and distance on this screen instead.',
    zh: '设备未安装地图应用。请改用本页的指针和距离。',
    ja: '地図アプリが入っていません。この画面の針と距離をお使いください。',
  },

  // ── Kim & khoảng cách ─────────────────────────────────────────────────────
  'map.nav.locating': { vi: 'Đang bắt vị trí…', en: 'Finding your position…', zh: '正在定位…', ja: '位置を取得中…' },
  'map.nav.unknownPos': { vi: 'Chưa biết bạn đang đứng đâu.', en: 'Your position is unknown.', zh: '还不知道你的位置。', ja: '現在地が分かりません。' },
  'map.nav.arrived': { vi: 'Đã tới {name}', en: 'You have arrived at {name}', zh: '已到达 {name}', ja: '{name} に到着しました' },
  'map.nav.arrivedHint': {
    vi: 'Đích ngay quanh chỗ bạn đứng — trong vòng vài bước chân.',
    en: 'The target is right around you — within a few steps.',
    zh: '目标就在你周围，几步之内。',
    ja: '目的地はすぐそば、数歩の範囲です。',
  },
  'map.nav.walkMinutes': { vi: 'Đi bộ khoảng {n} phút', en: 'About a {n} minute walk', zh: '步行约 {n} 分钟', ja: '徒歩およそ {n} 分' },
  'map.nav.headTowards': { vi: 'Hướng {dir}', en: 'Head {dir}', zh: '朝 {dir}', ja: '{dir} の方向' },

  // ── Nguồn hướng ───────────────────────────────────────────────────────────
  'map.heading.compass': { vi: 'Kim theo la bàn của máy', en: 'Needle follows the phone compass', zh: '指针跟随手机罗盘', ja: '針は端末のコンパスに従います' },
  'map.heading.course': { vi: 'Kim theo hướng bạn đang đi', en: 'Needle follows the way you are walking', zh: '指针跟随你的行进方向', ja: '針は進行方向に従います' },
  'map.heading.none': {
    vi: 'Máy này chưa có la bàn — đi vài bước để kim bắt được hướng.',
    en: 'No compass on this phone — take a few steps so the needle can find your heading.',
    zh: '此设备没有罗盘——走几步让指针找到方向。',
    ja: 'この端末にコンパスがありません。数歩歩くと針が向きを捉えます。',
  },
  'map.heading.northUp': { vi: 'Bắc', en: 'N', zh: '北', ja: '北' },

  // ── Đã tới vườn: mặt phẳng tìm cây ────────────────────────────────────────
  'map.zone.title': { vi: '{n} cây quanh đây', en: '{n} trees around you', zh: '你周围有 {n} 棵树', ja: '周りに {n} 本' },
  'map.zone.here': { vi: 'Trong tầm với', en: 'Within reach', zh: '触手可及', ja: '手の届く範囲' },
  'map.zone.near': { vi: 'Nhìn thấy được', en: 'In sight', zh: '目视可见', ja: '見える範囲' },
  'map.zone.far': { vi: 'Phải đi vài bước', en: 'A short walk', zh: '需走几步', ja: '少し歩きます' },
  'map.zone.empty': { vi: 'Chưa có cây nào được ghi toạ độ trong vườn này.', en: 'No tree in this farm has coordinates yet.', zh: '该农场还没有果树记录了坐标。', ja: 'この農場には座標のある木がまだありません。' },
  'map.radar.hint': {
    vi: 'Chấm xanh là cây. Chạm vào một cây để được chỉ tới đúng gốc.',
    en: 'Green dots are trees. Tap one to be guided to its trunk.',
    zh: '绿点是果树。点一棵即可导航到它的树干。',
    ja: '緑の点は木です。タップするとその木まで案内します。',
  },
  'map.radar.northUp': {
    vi: 'Chưa có la bàn — mặt phẳng đang lấy hướng Bắc làm trên.',
    en: 'No compass — the field is drawn with north up.',
    zh: '没有罗盘——平面以北为上。',
    ja: 'コンパスなし — 北を上にして表示しています。',
  },
  'map.tree.back': { vi: 'Về xem cả vườn', en: 'Back to the whole farm', zh: '返回查看整个果园', ja: '果樹園全体に戻る' },
  'map.tree.finding': { vi: 'Đang tìm {name}', en: 'Finding {name}', zh: '正在寻找 {name}', ja: '{name} を探しています' },
  'map.tree.arrived': { vi: 'Đây rồi — {name}', en: 'Here it is — {name}', zh: '就是这棵 — {name}', ja: 'ここです — {name}' },

  // ── Cảnh báo ──────────────────────────────────────────────────────────────
  'map.warn.denied': {
    vi: 'Chưa được cấp quyền vị trí nên màn này chưa biết bạn đang đứng đâu. Vẫn mở được bản đồ ở nút dưới.',
    en: 'Location permission was not granted, so this screen does not know where you are. The map button below still works.',
    zh: '未获得定位权限，本页不知道你的位置。下方的地图按钮仍可使用。',
    ja: '位置情報の許可がないため現在地が分かりません。下の地図ボタンは使えます。',
  },
  'map.warn.noFix': {
    vi: 'Chưa bắt được vị trí. Ra chỗ thoáng, tránh đứng dưới tán dày rồi chờ một chút.',
    en: 'No position yet. Move into the open, away from dense canopy, and wait a moment.',
    zh: '尚未定位。请到开阔处、避开茂密树冠，稍等片刻。',
    ja: 'まだ測位できません。開けた場所に出て、濃い樹冠を避けて少しお待ちください。',
  },
  'map.warn.accuracy': {
    vi: 'Sai số GPS đang ±{n} m — số đo chỉ là áng chừng.',
    en: 'GPS accuracy is ±{n} m — these figures are rough.',
    zh: 'GPS 误差约 ±{n} 米——数值仅供参考。',
    ja: 'GPS 誤差は ±{n} m です。数値は目安です。',
  },
  'map.warn.noCoord': {
    vi: '{target} này chưa có toạ độ nên chưa chỉ đường được.',
    en: 'This {target} has no coordinates yet, so no route can be shown.',
    zh: '这个{target}还没有坐标，无法指路。',
    ja: 'この{target}には座標がないため、道案内できません。',
  },
  'map.warn.noCoordFix': {
    vi: 'Toạ độ được ghi lúc đăng ký. Ra đứng tại {target} rồi đăng ký lại vị trí là chỉ đường được ngay.',
    en: 'Coordinates are recorded at registration. Stand at the {target} and register the position again to enable routing.',
    zh: '坐标在登记时记录。站到{target}处重新登记位置即可指路。',
    ja: '座標は登録時に記録されます。{target}に立って位置を登録し直せば案内できます。',
  },

  // ── Cây quanh đây ─────────────────────────────────────────────────────────
  'map.nearby.title': { vi: 'Cây quanh chỗ bạn đứng', en: 'Trees around you', zh: '你周围的果树', ja: '周りの木' },
  'map.nearby.unnamed': { vi: 'Cây {code}', en: 'Tree {code}', zh: '果树 {code}', ja: '木 {code}' },
  // Ba câu dưới TÁCH BẠCH ba tình huống trước đây cùng vẽ ra một màn trống:
  // chưa hỏi được máy chủ / vườn thật sự chưa có cây / có cây nhưng ngoài tầm.
  'map.nearby.error': {
    vi: 'Chưa hỏi được máy chủ nên chưa biết quanh đây có cây nào.',
    en: 'Could not reach the server, so nearby trees are unknown.',
    zh: '无法连接服务器，暂时不知道附近有哪些果树。',
    ja: 'サーバーに接続できないため、周りの木がわかりません。',
  },
  'map.nearby.retry': { vi: 'Thử lại', en: 'Try again', zh: '重试', ja: 'もう一度' },
  'map.nearby.empty': {
    vi: 'Vườn này chưa có cây nào được đăng ký.',
    en: 'No trees have been registered in this farm yet.',
    zh: '这个果园还没有登记果树。',
    ja: 'この果樹園にはまだ木が登録されていません。',
  },
  'map.nearby.outOfRange': {
    vi: 'Không có cây nào có toạ độ trong bán kính {n} m quanh bạn.',
    en: 'No tree with coordinates within {n} m of you.',
    zh: '你周围 {n} 米内没有带坐标的果树。',
    ja: '半径 {n} m 以内に座標のある木はありません。',
  },

  // ── Mốc vườn (cổng, máy bơm, gốc cây to…) ─────────────────────────────────
  // Mốc CHỈ nằm trong máy này — máy chủ chưa có chỗ nhận toạ độ mốc. Câu
  // `map.marker.localOnly` phải đứng ngay chỗ người dùng đặt mốc, không phải nằm
  // trong một trang trợ giúp nào đó: người ta đi bộ ngoài nắng để đặt nó, phải
  // biết trước là đổi máy thì mất.
  'map.marker.add': { vi: 'Đặt mốc ở đây', en: 'Drop a marker here', zh: '在此放置标记', ja: 'ここに目印を置く' },
  'map.marker.title': { vi: 'Mốc bạn tự đặt', en: 'Markers you placed', zh: '你放置的标记', ja: '自分で置いた目印' },
  'map.marker.dialog': { vi: 'Đặt mốc tại chỗ bạn đang đứng', en: 'Place a marker where you stand', zh: '在你站立的位置放置标记', ja: '今いる場所に目印を置く' },
  'map.marker.namePlaceholder': {
    vi: 'Ví dụ: cổng vườn, chỗ để máy bơm',
    en: 'e.g. farm gate, where the pump is',
    zh: '例如：果园大门、水泵位置',
    ja: '例：果樹園の門、ポンプの場所',
  },
  'map.marker.save': { vi: 'Lưu mốc', en: 'Save marker', zh: '保存标记', ja: '目印を保存' },
  'map.marker.cancel': { vi: 'Huỷ', en: 'Cancel', zh: '取消', ja: 'キャンセル' },
  'map.marker.photo': { vi: 'Chụp một ảnh (không bắt buộc)', en: 'Take a photo (optional)', zh: '拍一张照片（可选）', ja: '写真を撮る（任意）' },
  'map.marker.photoDone': { vi: 'Đã có ảnh — chạm để chụp lại', en: 'Photo attached — tap to retake', zh: '已有照片——点按可重拍', ja: '写真あり — タップで撮り直し' },
  'map.marker.localOnly': {
    vi: 'Mốc chỉ nằm trong máy này. Máy chủ chưa có chỗ lưu mốc, nên đổi máy hay xoá app là mất, và người khác trong nhà không thấy mốc của bạn.',
    en: 'Markers stay on this phone only. The server has no place to store them yet, so changing phone or deleting the app loses them, and nobody else in your household sees them.',
    zh: '标记只保存在这台手机上。服务器还没有存放标记的地方，换手机或删除应用就会丢失，家里其他人也看不到你的标记。',
    ja: '目印はこの端末にだけ残ります。サーバーに保存先がないため、機種変更やアプリ削除で消え、家族の他の人にも見えません。',
  },
  'map.marker.accuracy': {
    vi: 'GPS đang sai số ±{n} m — mốc ghi ra lệch chừng đó. Muốn chính xác hơn thì ra chỗ thoáng rồi đặt lại.',
    en: 'GPS accuracy is ±{n} m — the marker will be off by about that much. For a tighter fix, step into the open and place it again.',
    zh: 'GPS 误差约 ±{n} 米——标记也会有这么大的偏差。想更准就到开阔处重新放置。',
    ja: 'GPS 誤差は ±{n} m です。目印も同じくらいずれます。正確にしたい場合は開けた場所で置き直してください。',
  },
  'map.marker.accuracyUnknown': {
    vi: 'Máy không báo sai số GPS, nên chưa biết mốc này chính xác tới đâu.',
    en: 'The phone reports no GPS accuracy, so how precise this marker is remains unknown.',
    zh: '手机未报告 GPS 误差，因此不清楚这个标记有多准。',
    ja: '端末が GPS 誤差を返さないため、この目印の精度は不明です。',
  },
  'map.marker.noFix': {
    vi: 'Chưa bắt được vị trí nên chưa đặt mốc được. Chờ máy bắt xong GPS rồi thử lại.',
    en: 'No position yet, so no marker can be placed. Wait for a GPS fix and try again.',
    zh: '尚未定位，无法放置标记。等待 GPS 定位后重试。',
    ja: 'まだ測位できていないため目印を置けません。GPS が取れてから再試行してください。',
  },
  'map.marker.needName': { vi: 'Đặt cho mốc một cái tên đã.', en: 'Give the marker a name first.', zh: '请先给标记起个名字。', ja: 'まず目印に名前を付けてください。' },
  'map.marker.empty': {
    vi: 'Chưa có mốc nào. Đứng tại chỗ cần nhớ rồi bấm nút trên.',
    en: 'No markers yet. Stand where you want to remember and tap the button above.',
    zh: '还没有标记。站到想记住的位置，点上面的按钮。',
    ja: 'まだ目印がありません。覚えたい場所に立って上のボタンを押してください。',
  },
  'map.marker.count': { vi: '{n} mốc', en: '{n} markers', zh: '{n} 个标记', ja: '目印 {n} 件' },
  'map.marker.unnamed': { vi: 'Mốc không tên', en: 'Unnamed marker', zh: '未命名标记', ja: '名称なしの目印' },
  'map.marker.saveFail': {
    vi: 'Chưa lưu được mốc vào máy. Máy có thể đã hết chỗ trống.',
    en: 'Could not save the marker to this phone. Storage may be full.',
    zh: '无法把标记保存到手机。存储空间可能已满。',
    ja: '目印を端末に保存できませんでした。空き容量が不足している可能性があります。',
  },
  'map.marker.cameraFail': {
    vi: 'Chưa mở được máy ảnh. Mốc vẫn lưu được, chỉ là không có ảnh.',
    en: 'Could not open the camera. The marker still saves, just without a photo.',
    zh: '无法打开相机。标记仍可保存，只是没有照片。',
    ja: 'カメラを開けませんでした。写真なしでも目印は保存できます。',
  },
  'map.marker.deleteTitle': { vi: 'Xoá mốc này?', en: 'Delete this marker?', zh: '删除这个标记？', ja: 'この目印を削除しますか？' },
  'map.marker.deleteBody': {
    vi: '"{name}" sẽ mất hẳn khỏi máy. Không có bản nào trên máy chủ để lấy lại.',
    en: '“{name}” will be gone from this phone. There is no server copy to restore from.',
    zh: '“{name}”将从手机中彻底删除。服务器上没有副本可恢复。',
    ja: '「{name}」は端末から完全に消えます。サーバーに復元できる控えはありません。',
  },
  'map.marker.delete': { vi: 'Xoá', en: 'Delete', zh: '删除', ja: '削除' },
  'map.marker.finding': { vi: 'Đang tìm mốc {name}', en: 'Finding marker {name}', zh: '正在寻找标记 {name}', ja: '目印 {name} を探しています' },
  'map.marker.arrived': { vi: 'Tới mốc {name}', en: 'At marker {name}', zh: '已到标记 {name}', ja: '目印 {name} に到着' },
  'map.marker.hint': { vi: 'Chạm giữ một mốc để xoá.', en: 'Press and hold a marker to delete it.', zh: '长按标记可删除。', ja: '目印を長押しすると削除できます。' },

  // ── Tra một CÂY khi kho trong máy chưa có ─────────────────────────────────
  // Ba câu này do `modules/trace/screens/TreeDetailScreen` dùng, nên chỗ đúng
  // của chúng là `keys/trace.ts` với tiền tố `trace.tree.*`. Đặt tạm ở đây vì
  // `trace.ts` đang do người khác sửa trong cùng lượt việc này. Dời sang đó khi
  // tệp kia rảnh — chỉ là đổi tên khoá, không đổi hành vi.
  'map.tree.loading': {
    vi: 'Đang hỏi máy chủ về cây này…',
    en: 'Asking the server about this tree…',
    zh: '正在向服务器查询这棵果树…',
    ja: 'この木についてサーバーに問い合わせています…',
  },
  'map.tree.loadFail': {
    vi: 'Chưa hỏi được máy chủ về cây này. Kiểm tra mạng rồi thử lại — cây vẫn còn trên máy chủ.',
    en: 'Could not ask the server about this tree. Check your connection and retry — the tree is still on the server.',
    zh: '无法向服务器查询这棵果树。请检查网络后重试——果树仍在服务器上。',
    ja: 'この木についてサーバーに問い合わせできませんでした。通信を確認して再試行してください。木はサーバーに残っています。',
  },
  'map.tree.notFound': {
    vi: 'Không tìm thấy cây này trên máy chủ.',
    en: 'This tree was not found on the server.',
    zh: '服务器上找不到这棵果树。',
    ja: 'この木はサーバーに見つかりませんでした。',
  },

  // ── Xin quyền ─────────────────────────────────────────────────────────────
  'map.perm.title': { vi: 'Quyền truy cập vị trí', en: 'Location permission', zh: '定位权限', ja: '位置情報の許可' },
  'map.perm.body': {
    vi: '{brand} cần vị trí để chỉ đường tới vườn và tới đúng gốc cây.',
    en: '{brand} needs your location to guide you to the farm and to the right tree.',
    zh: '{brand} 需要你的位置，以便指引到果园和具体的果树。',
    ja: '果樹園と目的の木まで案内するために位置情報が必要です。',
  },
  'map.perm.allow': { vi: 'Cho phép', en: 'Allow', zh: '允许', ja: '許可' },
  'map.perm.deny': { vi: 'Từ chối', en: 'Deny', zh: '拒绝', ja: '拒否' },
  'map.perm.later': { vi: 'Hỏi lại sau', en: 'Ask later', zh: '稍后再问', ja: 'あとで' },
} satisfies KeyMap;
