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

  // ── Xin quyền ─────────────────────────────────────────────────────────────
  'map.perm.title': { vi: 'Quyền truy cập vị trí', en: 'Location permission', zh: '定位权限', ja: '位置情報の許可' },
  'map.perm.body': {
    vi: 'Aladin cần vị trí để chỉ đường tới vườn và tới đúng gốc cây.',
    en: 'Aladin needs your location to guide you to the farm and to the right tree.',
    zh: 'Aladin 需要你的位置，以便指引到果园和具体的果树。',
    ja: '果樹園と目的の木まで案内するために位置情報が必要です。',
  },
  'map.perm.allow': { vi: 'Cho phép', en: 'Allow', zh: '允许', ja: '許可' },
  'map.perm.deny': { vi: 'Từ chối', en: 'Deny', zh: '拒绝', ja: '拒否' },
  'map.perm.later': { vi: 'Hỏi lại sau', en: 'Ask later', zh: '稍后再问', ja: 'あとで' },
} satisfies KeyMap;
