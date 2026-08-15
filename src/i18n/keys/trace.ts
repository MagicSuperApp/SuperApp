/**
 * Chuỗi của module TRUY XUẤT, theo khoá `trace.<nhóm>.<tên>`.
 *
 * Quy ước đặt tên — ba tầng, không hơn:
 *   trace.section.*   tiêu đề mục
 *   trace.button.*    chữ trên nút
 *   trace.label.*     nhãn ngắn cạnh số liệu
 *   trace.empty.*     lúc chưa có gì
 *   trace.weather.*   thời tiết
 *   trace.news.*      tin tức
 *   trace.advice.*    câu khuyên việc nhà nông
 *
 * Chỗ thay viết `{tên}` — xem `tk('trace.news.more', { n: 5 })`.
 *
 * Tiếng Việt ở đây là BẢN DỊCH như mọi ngôn ngữ khác, không phải "khoá thật":
 * đổi câu tiếng Việt không đụng gì tới khoá, nên không mất bản dịch nào.
 */

import type { KeyMap } from './index';

export const TRACE_STRINGS = {
  // ── Lời chào ──────────────────────────────────────────────────────────────
  'trace.greeting.morning': { vi: 'Chào buổi sáng', en: 'Good morning', zh: '早上好', ja: 'おはようございます' },
  'trace.greeting.noon': { vi: 'Chào buổi trưa', en: 'Good afternoon', zh: '中午好', ja: 'こんにちは' },
  'trace.greeting.afternoon': { vi: 'Chào buổi chiều', en: 'Good afternoon', zh: '下午好', ja: 'こんにちは' },
  'trace.greeting.evening': { vi: 'Chào buổi tối', en: 'Good evening', zh: '晚上好', ja: 'こんばんは' },
  'trace.greeting.fallbackName': { vi: 'Bà con mình', en: 'Friend', zh: '朋友', ja: 'みなさん' },

  // ── Mục 1 — Vườn ──────────────────────────────────────────────────────────
  'trace.section.myGarden': { vi: 'Vườn của tôi', en: 'My garden', zh: '我的果园', ja: 'わたしの果樹園' },
  'trace.label.gardens': { vi: 'Vườn', en: 'Gardens', zh: '果园', ja: '果樹園' },
  'trace.label.trees': { vi: 'Cây', en: 'Trees', zh: '树木', ja: '樹木' },
  'trace.label.fruits': { vi: 'Quả', en: 'Fruits', zh: '果实', ja: '果実' },
  'trace.button.viewGardens': { vi: 'Xem vườn', en: 'View gardens', zh: '查看果园', ja: '果樹園を見る' },
  'trace.button.addTree': { vi: 'Thêm cây vào vườn', en: 'Add a tree', zh: '添加果树', ja: '木を追加' },
  'trace.button.createFirstGarden': { vi: 'Tạo vườn đầu tiên', en: 'Create your first garden', zh: '创建第一个果园', ja: '最初の果樹園を作る' },
  'trace.empty.noGarden': { vi: 'Chưa có vườn nào', en: 'No gardens yet', zh: '还没有果园', ja: 'まだ果樹園がありません' },

  // ── Mục 2 — Thời tiết ─────────────────────────────────────────────────────
  'trace.section.weather': { vi: 'Thời tiết', en: 'Weather', zh: '天气', ja: '天気' },
  'trace.weather.hint': { vi: 'Hôm nay và 7 ngày tới', en: 'Today and the next 7 days', zh: '今天与未来 7 天', ja: '今日と 7 日間' },
  'trace.weather.loading': { vi: 'Đang xem thời tiết ở vườn của bạn…', en: 'Checking the weather at your garden…', zh: '正在查看你果园的天气…', ja: '果樹園の天気を確認しています…' },
  'trace.weather.failTitle': { vi: 'Chưa xem được thời tiết', en: 'Weather unavailable', zh: '暂时无法获取天气', ja: '天気を取得できません' },
  'trace.weather.failBody': {
    vi: 'Cần mạng để tải dự báo. Bạn thử lại khi có sóng nhé.',
    en: 'A connection is needed for the forecast. Try again when you have signal.',
    zh: '获取预报需要网络。有信号时请重试。',
    ja: '予報の取得には通信が必要です。電波が入ったらもう一度お試しください。',
  },
  'trace.weather.humidity': { vi: 'Độ ẩm', en: 'Humidity', zh: '湿度', ja: '湿度' },
  'trace.weather.wind': { vi: 'Gió', en: 'Wind', zh: '风', ja: '風' },
  'trace.weather.rainChance': { vi: 'Khả năng mưa', en: 'Chance of rain', zh: '降雨概率', ja: '降水確率' },
  'trace.weather.defaultPlace': { vi: 'Đồng bằng sông Cửu Long', en: 'Mekong Delta', zh: '湄公河三角洲', ja: 'メコンデルタ' },
  'trace.weather.yourGarden': { vi: 'Vườn của bạn', en: 'Your garden', zh: '你的果园', ja: 'あなたの果樹園' },

  // ── Mục 3 — Tin ───────────────────────────────────────────────────────────
  'trace.section.news': { vi: 'Tin nhà nông', en: 'Farming news', zh: '农事资讯', ja: '農業ニュース' },
  'trace.news.hint': { vi: 'Giá cả · mùa vụ · sâu bệnh', en: 'Prices · seasons · pests', zh: '价格 · 农时 · 病虫害', ja: '価格 · 作期 · 病害虫' },
  'trace.news.loading': { vi: 'Đang lấy tin mới…', en: 'Fetching the latest news…', zh: '正在获取最新资讯…', ja: '最新のニュースを取得しています…' },
  'trace.news.loadingMore': { vi: 'Đang tải thêm tin…', en: 'Loading more…', zh: '正在加载更多…', ja: 'さらに読み込んでいます…' },
  'trace.news.failTitle': { vi: 'Chưa lấy được tin', en: 'No news yet', zh: '暂时没有资讯', ja: 'ニュースを取得できません' },
  'trace.news.failBody': {
    vi: 'Cần mạng để tải tin mới. Kéo màn hình xuống để thử lại.',
    en: 'A connection is needed. Pull down to try again.',
    zh: '需要网络。下拉可重试。',
    ja: '通信が必要です。下に引いて再試行してください。',
  },
  'trace.news.end': { vi: 'Hết tin mới rồi', en: 'That is all for now', zh: '暂时就这些', ja: 'ここまでです' },

  // ── Màn DANH SÁCH TRẠI ────────────────────────────────────────────────────
  'trace.farmList.title': { vi: 'Trang trại', en: 'Farms', zh: '农场', ja: '農場' },
  'trace.farmList.count': {
    vi: 'Đang chăm {n} vườn', en: 'Tending {n} gardens', zh: '正在管理 {n} 个果园', ja: '{n} か所の果樹園を管理中',
  },
  'trace.farmList.search': { vi: 'Tìm trang trại…', en: 'Search farms…', zh: '搜索农场…', ja: '農場を検索…' },
  'trace.farmList.noResults': { vi: 'Không tìm thấy trang trại nào', en: 'No farms found', zh: '没有找到农场', ja: '農場が見つかりません' },
  'trace.farmList.noResultsHint': {
    vi: 'Thử tìm bằng tên khác, hoặc xoá ô tìm kiếm để xem hết.',
    en: 'Try another name, or clear the search to see them all.',
    zh: '换个名字试试，或清空搜索查看全部。',
    ja: '別の名前で試すか、検索を消して全件を表示してください。',
  },
  'trace.empty.noFarmTitle': { vi: 'Chưa có trang trại nào', en: 'No farms yet', zh: '还没有农场', ja: 'まだ農場がありません' },
  'trace.empty.noFarmBody': {
    vi: 'Thêm mảnh vườn đầu tiên để bắt đầu ghi nhận cây và quả.',
    en: 'Add your first plot to start recording trees and fruit.',
    zh: '添加第一块园地，开始记录果树与果实。',
    ja: '最初の区画を追加して、木と果実の記録を始めましょう。',
  },
  'trace.button.addFarm': { vi: 'Thêm trang trại', en: 'Add a farm', zh: '添加农场', ja: '農場を追加' },
  'trace.status.active': { vi: 'Đang chăm', en: 'Tending', zh: '养护中', ja: '手入れ中' },
  'trace.status.inactive': { vi: 'Tạm nghỉ', en: 'Resting', zh: '休整中', ja: '休止中' },
  'trace.status.harvest': { vi: 'Mùa thu hoạch', en: 'Harvest season', zh: '采收季', ja: '収穫期' },
  'trace.unit.points': { vi: 'điểm ranh', en: 'boundary pts', zh: '边界点', ja: '境界点' },

  // ── Màn CHI TIẾT TRẠI ─────────────────────────────────────────────────────
  'trace.section.treeList': { vi: 'Cây trong vườn', en: 'Trees in this garden', zh: '园中的果树', ja: 'この果樹園の木' },
  'trace.label.code': { vi: 'Mã:', en: 'Code:', zh: '编号：', ja: 'コード：' },
  'trace.label.has3d': { vi: '3D · {n} quả', en: '3D · {n} fruits', zh: '3D · {n} 个果实', ja: '3D · 果実 {n} 個' },
  'trace.label.no3d': { vi: 'Chưa có 3D · {n} quả', en: 'No 3D yet · {n} fruits', zh: '尚无 3D · {n} 个果实', ja: '3D なし · 果実 {n} 個' },

  // ── Màn GHI HOẠT ĐỘNG ───────────────────────────────────────
  'trace.activity.title': { vi: 'Ghi việc đã làm', en: 'Log work done', zh: '记录已做的农事', ja: '行った作業を記録' },
  'trace.activity.guide': {
    vi: 'Chọn việc bạn vừa làm, quay một đoạn ngắn, rồi lưu lại. Máy tự chọn khung hình rõ nhất giúp bạn.',
    en: 'Pick what you just did, record a short clip, then save. The app keeps the clearest frames for you.',
    zh: '选择刚做的农事，录一段短视频，然后保存。系统会自动留下最清晰的画面。',
    ja: '行った作業を選び、短い動画を撮って保存します。最も鮮明なコマを自動で残します。',
  },
  'trace.activity.pick': { vi: 'Bạn vừa làm gì?', en: 'What did you just do?', zh: '你刚做了什么？', ja: '何をしましたか？' },
  'trace.activity.record': { vi: 'Quay lại việc đó', en: 'Record it', zh: '拍下来', ja: '撮影する' },
  'trace.activity.watering': { vi: 'Tưới nước', en: 'Watering', zh: '浇水', ja: '水やり' },
  'trace.activity.wateringDesc': { vi: 'Ghi lại lần tưới cho cây', en: 'Record a watering round', zh: '记录一次浇水', ja: '水やりを記録' },
  'trace.activity.fertilizing': { vi: 'Bón phân', en: 'Fertilising', zh: '施肥', ja: '施肥' },
  'trace.activity.fertilizingDesc': { vi: 'Ghi loại phân và lượng bón', en: 'Record the type and amount', zh: '记录肥料种类与用量', ja: '肥料の種類と量を記録' },
  'trace.activity.pesticide': { vi: 'Phun thuốc', en: 'Spraying', zh: '喷药', ja: '散布' },
  'trace.activity.pesticideDesc': { vi: 'Lia máy vào nhãn thuốc để ghi', en: 'Point the camera at the label', zh: '对准药物标签拍摄', ja: 'ラベルにカメラを向けます' },
  'trace.activity.harvesting': { vi: 'Thu hoạch', en: 'Harvesting', zh: '采收', ja: '収穫' },
  'trace.activity.harvestingDesc': { vi: 'Ghi số quả đã hái', en: 'Record the fruit picked', zh: '记录采收的果实', ja: '収穫した果実を記録' },
  'trace.activity.cost': { vi: 'Việc này tốn {n} MAGIC', en: 'This costs {n} MAGIC', zh: '此项消耗 {n} MAGIC', ja: 'この記録に {n} MAGIC' },
  'trace.activity.costLabel': { vi: 'Chi phí', en: 'Cost', zh: '费用', ja: '費用' },
  'trace.activity.needClip': { vi: 'Cần quay trước đã', en: 'Record a clip first', zh: '请先拍摄', ja: '先に撮影してください' },
  'trace.activity.startRecord': { vi: 'Bấm để quay', en: 'Tap to record', zh: '点击拍摄', ja: 'タップして撮影' },
  'trace.activity.startRecordHint': { vi: 'Lia máy vào chỗ cần ghi', en: 'Point the camera at the spot', zh: '对准要记录的地方', ja: '記録したい場所に向けます' },
  'trace.activity.gotClip': { vi: 'Đã chọn {n} hình rõ nhất', en: 'Kept the {n} clearest frames', zh: '已保留 {n} 张最清晰的画面', ja: '鮮明なコマを {n} 枚保存' },
  'trace.activity.gotClipHint': { vi: 'Sẵn sàng lưu', en: 'Ready to save', zh: '可以保存了', ja: '保存できます' },
  'trace.activity.retake': { vi: 'Quay lại', en: 'Retake', zh: '重拍', ja: '撮り直す' },
  'trace.activity.save': { vi: 'Lưu vào sổ', en: 'Save to the log', zh: '保存到记录', ja: '記録に保存' },
  'trace.activity.saving': { vi: 'Đang lưu…', en: 'Saving…', zh: '正在保存…', ja: '保存中…' },
  'trace.activity.syncTitle': { vi: 'Đang lưu việc vừa làm', en: 'Saving what you just did', zh: '正在保存刚才的农事', ja: '作業内容を保存中' },
  'trace.activity.syncDone': { vi: 'Đã lưu vào máy', en: 'Saved on this phone', zh: '已保存到本机', ja: 'この端末に保存しました' },
  // Hai bước THẬT. Bốn bước cũ (khoá hình · chia nhỏ · nhiều bản sao · ghi sổ
  // chung) tả bốn việc mà mã không hề làm — xem `ActivityScreen.tsx` mục
  // SYNC_STEPS. Câu chữ ở đây chỉ được hứa đúng thứ đã xảy ra.
  'trace.activity.stepSave': { vi: 'Ghi vào máy', en: 'Saving on this phone', zh: '保存到本机', ja: 'この端末に保存' },
  'trace.activity.stepQueue': { vi: 'Xếp hàng gửi máy chủ', en: 'Queued to send to the server', zh: '排队等待上传', ja: 'サーバー送信待ちに追加' },

  // ── Tab THÔNG TIN CÂY ────────────────────────────────────────
  'trace.meta.bio': { vi: 'Về cây này', en: 'About this tree', zh: '关于这棵树', ja: 'この木について' },
  'trace.meta.notes': { vi: 'Ghi chú', en: 'Notes', zh: '备注', ja: 'メモ' },
  'trace.meta.variety': { vi: 'Giống cây', en: 'Variety', zh: '品种', ja: '品種' },
  'trace.meta.varietyPick': { vi: 'Chọn giống cây', en: 'Choose a variety', zh: '选择品种', ja: '品種を選ぶ' },
  'trace.meta.varietyOther': { vi: 'Tên giống khác…', en: 'Other variety name…', zh: '其他品种名称…', ja: 'その他の品種名…' },
  'trace.meta.other': { vi: 'Khác', en: 'Other', zh: '其他', ja: 'その他' },
  'trace.meta.age': { vi: 'Cây mấy tuổi (năm)', en: 'Age of the tree (years)', zh: '树龄（年）', ja: '樹齢（年）' },
  'trace.meta.ageHint': { vi: 'Vd: 12', en: 'e.g. 12', zh: '例：12', ja: '例：12' },
  'trace.meta.ageError': { vi: 'Tuổi phải từ {range}', en: 'Age must be {range}', zh: '树龄必须在 {range}', ja: '樹齢は {range} の範囲です' },
  'trace.meta.health': { vi: 'Cây đang thế nào', en: 'How the tree is doing', zh: '树的状况', ja: '木の状態' },
  'trace.meta.lastHarvest': { vi: 'Lần thu hoạch gần nhất', en: 'Last harvest', zh: '上次采收', ja: '前回の収穫' },
  'trace.meta.notesHint': {
    vi: 'Vd: Cây ven bờ ao, lá xanh tốt, sai quả…',
    en: 'e.g. by the pond, healthy leaves, heavy with fruit…',
    zh: '例：塘边的树，叶片青翠，结果繁多…',
    ja: '例：池のそば、葉が元気、実が多い…',
  },
  'trace.meta.voice': { vi: 'Nói thành lời', en: 'Say it out loud', zh: '语音记录', ja: '声で残す' },
  'trace.meta.save': { vi: 'Lưu thông tin', en: 'Save', zh: '保存', ja: '保存' },
  'trace.meta.saved': { vi: 'Đã lưu', en: 'Saved', zh: '已保存', ja: '保存済み' },
  'trace.health.healthy': { vi: 'Khoẻ mạnh', en: 'Healthy', zh: '健康', ja: '健全' },
  'trace.health.flowering': { vi: 'Đang ra hoa', en: 'Flowering', zh: '开花中', ja: '開花中' },
  'trace.health.fruiting': { vi: 'Đang có quả', en: 'Fruiting', zh: '结果中', ja: '結実中' },
  'trace.health.pest': { vi: 'Sâu hại', en: 'Pest damage', zh: '虫害', ja: '害虫被害' },
  'trace.health.nutrient': { vi: 'Thiếu dinh dưỡng', en: 'Nutrient deficiency', zh: '缺肥', ja: '餌養不足' },
  'trace.health.diseased': { vi: 'Bệnh', en: 'Diseased', zh: '病害', ja: '病気' },
  'trace.health.dry': { vi: 'Khô héo', en: 'Drying out', zh: '干枯', ja: '乾燥' },
  'trace.health.dead': { vi: 'Chết', en: 'Dead', zh: '枯死', ja: '枯死' },
  'trace.health.unknown': { vi: 'Chưa rõ', en: 'Not sure', zh: '不确定', ja: '不明' },

  // ── Màn CHI TIẾT CÂY ─────────────────────────────────────────
  'trace.tree.title': { vi: 'Cây này', en: 'This tree', zh: '这棵树', ja: 'この木' },
  'trace.tree.tabOverview': { vi: 'Tổng quan', en: 'Overview', zh: '总览', ja: '概要' },
  'trace.tree.tabHistory': { vi: 'Lịch sử', en: 'History', zh: '历史', ja: '履歴' },
  'trace.tree.tabInfo': { vi: 'Thông tin', en: 'Details', zh: '信息', ja: '情報' },
  'trace.tree.photos': { vi: 'Ảnh cây ({n})', en: 'Photos ({n})', zh: '照片（{n}）', ja: '写真（{n}）' },
  'trace.tree.photosBroken': { vi: ' · {n} chưa xem được', en: ' · {n} unavailable', zh: ' · {n} 张打不开', ja: ' · {n} 枚は表示できません' },
  'trace.tree.videos': { vi: 'Video đã lưu ({n})', en: 'Saved videos ({n})', zh: '已保存视频（{n}）', ja: '保存した動画（{n}）' },
  'trace.tree.fruitList': { vi: 'Quả trên cây', en: 'Fruit on this tree', zh: '树上的果实', ja: 'この木の果実' },
  'trace.tree.fruitListN': { vi: 'Quả trên cây ({n})', en: 'Fruit on this tree ({n})', zh: '树上的果实（{n}）', ja: 'この木の果実（{n}）' },
  'trace.fruit.onTree': { vi: 'Trên cây', en: 'On the tree', zh: '树上', ja: '木にある' },
  'trace.fruit.harvested': { vi: 'Đã hái', en: 'Picked', zh: '已采收', ja: '収穫済み' },
  'trace.fruit.lost': { vi: 'Đã mất', en: 'Lost', zh: '已失去', ja: '失われた' },

  'trace.fruit.allStatus': { vi: 'Tất cả trạng thái', en: 'All statuses', zh: '全部状态', ja: 'すべての状態' },

  'trace.activity.noCamera': { vi: 'Chưa mở được máy ảnh', en: 'Camera unavailable', zh: '无法打开相机', ja: 'カメラを開けません' },
  'trace.activity.noCameraBody': {
    vi: 'Bản app này chưa mở được máy ảnh. Bạn cập nhật app rồi thử lại nhé.',
    en: 'This build cannot open the camera. Please update the app and try again.',
    zh: '此版本无法打开相机。请更新应用后重试。',
    ja: 'このビルドではカメラを開けません。アプリを更新して再度お試しください。',
  },
  'trace.activity.cameraErr': { vi: 'Máy ảnh gặp lỗi', en: 'Camera error', zh: '相机出错', ja: 'カメラのエラー' },
  'trace.activity.cameraErrBody': {
    vi: 'Không mở được máy ảnh. Kiểm tra lại quyền dùng máy ảnh.',
    en: 'Could not open the camera. Check the camera permission.',
    zh: '无法打开相机。请检查相机权限。',
    ja: 'カメラを開けません。カメラの権限を確認してください。',
  },
  'trace.activity.lowCredit': { vi: 'Không đủ tín dụng', en: 'Not enough credit', zh: '额度不足', ja: 'クレジット不足' },
  'trace.activity.lowCreditBody': { vi: 'Cần ít nhất {n} MAGIC', en: 'At least {n} MAGIC is needed', zh: '至少需要 {n} MAGIC', ja: '少なくとも {n} MAGIC が必要です' },
  'trace.activity.savedTitle': { vi: 'Đã lưu vào sổ', en: 'Saved to the log', zh: '已保存到记录', ja: '記録に保存しました' },
  // KHÔNG viết "Dùng hết {n} MAGIC" nữa: không có chỗ nào trừ MAGIC thật cả —
  // bản trước chỉ trừ trong bộ nhớ máy rồi lần đồng bộ sau số dư nhảy về cũ.
  'trace.activity.savedBody': { vi: 'Sẽ gửi lên máy chủ khi có mạng', en: 'It will be sent to the server when you are online', zh: '有网络时会自动上传', ja: 'オンラインになり次第サーバーへ送信します' },
  'trace.activity.saveFail': { vi: 'Chưa lưu được', en: 'Could not save', zh: '保存失败', ja: '保存できませんでした' },
  'trace.activity.saveFailBody': {
    vi: 'Có trục trặc khi ghi lên sổ chung. Bạn thử lại giúp nhé.',
    en: 'Something went wrong writing to the shared ledger. Please try again.',
    zh: '写入共享账本时出错。请重试。',
    ja: '共有台帳への書き込みで問題が起きました。もう一度お試しください。',
  },

  'trace.meta.dateIncomplete': { vi: 'Nhập đủ ngày/tháng/năm', en: 'Enter day, month and year', zh: '请填写完整日期', ja: '年月日をすべて入力' },
  'trace.meta.dateInvalid': { vi: 'Ngày không có thật', en: 'That date does not exist', zh: '日期不存在', ja: '存在しない日付です' },
  'trace.meta.savedBody': { vi: 'Đã cập nhật thông tin cây.', en: 'Tree details updated.', zh: '已更新果树信息。', ja: '木の情報を更新しました。' },
  'trace.meta.saveFail': { vi: 'Chưa lưu được', en: 'Could not save', zh: '保存失败', ja: '保存できませんでした' },
  'trace.meta.saveFailBody': { vi: 'Chưa lưu được thông tin. Bạn thử lại giúp nhé.', en: 'The details were not saved. Please try again.', zh: '信息未能保存，请重试。', ja: '保存できませんでした。もう一度お試しください。' },

  'trace.tree.unnamed': { vi: '(chưa đặt tên)', en: '(unnamed)', zh: '（未命名）', ja: '（名称なし）' },
  'trace.tree.noDate': { vi: 'chưa rõ ngày', en: 'date unknown', zh: '日期不详', ja: '日付不明' },
  'trace.tree.noGps': { vi: 'Chưa có vị trí GPS', en: 'No GPS position yet', zh: '尚无 GPS 位置', ja: 'GPS 位置がありません' },
  'trace.tree.statRecorded': { vi: 'quả đã ghi', en: 'recorded', zh: '已记录', ja: '記録済み' },
  'trace.tree.statOnTree': { vi: 'trên cây', en: 'on the tree', zh: '树上', ja: '木にある' },
  'trace.tree.statPicked': { vi: 'đã hái', en: 'picked', zh: '已采收', ja: '収穫済み' },
  'trace.tree.statLost': { vi: 'đã mất', en: 'lost', zh: '已失去', ja: '失われた' },
  'trace.tree.addFruit': { vi: 'Thêm quả', en: 'Add fruit', zh: '添加果实', ja: '果実を追加' },
  'trace.tree.addFirstFruit': { vi: 'Thêm quả đầu tiên', en: 'Add the first fruit', zh: '添加第一个果实', ja: '最初の果実を追加' },
  'trace.tree.noFruit': { vi: 'Chưa ghi nhận quả nào', en: 'No fruit recorded yet', zh: '还没有记录果实', ja: 'まだ果実の記録がありません' },
  'trace.tree.noFruitHint': {
    vi: 'Hướng máy vào chùm quả rồi bấm "Thêm quả".',
    en: 'Point the camera at a cluster, then tap "Add fruit".',
    zh: '把镜头对准果串，然后点“添加果实”。',
    ja: '果房にカメラを向けて「果実を追加」を押します。',
  },
  'trace.tree.noFruitHintTab': {
    vi: 'Bấm "Thêm quả" ở tab Tổng quan để ghi quả đầu tiên.',
    en: 'Tap "Add fruit" on the Overview tab to record the first one.',
    zh: '在“总览”页点“添加果实”，记录第一个果实。',
    ja: '「概要」タブの「果実を追加」から最初の 1 つを記録します。',
  },
  'trace.tree.loadingHistory': { vi: 'Đang tải lịch sử…', en: 'Loading history…', zh: '正在加载历史…', ja: '履歴を読み込み中…' },
  'trace.tree.fruitLoadFail': { vi: 'Chưa lấy được danh sách quả.', en: 'Could not load the fruit list.', zh: '无法加载果实列表。', ja: '果実の一覧を取得できませんでした。' },
  'trace.tree.photoNetFail': {
    vi: 'Chưa lấy được danh sách ảnh — kiểm tra mạng rồi thử lại. Ảnh vẫn còn trên máy chủ.',
    en: 'Could not load the photo list — check your connection and retry. The photos are still on the server.',
    zh: '无法加载照片列表——请检查网络后重试。照片仍在服务器上。',
    ja: '写真の一覧を取得できません。通信を確認して再試行してください。写真はサーバーに残っています。',
  },
  'trace.tree.photoServerFail': {
    vi: 'Máy chủ đang từ chối trả ảnh. Ảnh vẫn còn — thử lại sau.',
    en: 'The server is refusing to return photos. They are still there — try again later.',
    zh: '服务器暂时拒绝返回照片。照片仍在，请稍后重试。',
    ja: 'サーバーが写真を返していません。写真は残っています。後ほどお試しください。',
  },
  'trace.tree.photoOneFail': {
    vi: 'Chưa xem được ảnh này. Máy chủ đang từ chối — ảnh vẫn còn.',
    en: 'This photo will not load. The server is refusing it — the photo is still there.',
    zh: '这张照片打不开。服务器暂时拒绝——照片仍在。',
    ja: 'この写真を表示できません。サーバーが拒否していますが、写真は残っています。',
  },
  'trace.tree.notUploaded': { vi: 'Chưa lên được mạng · ', en: 'Not uploaded yet · ', zh: '尚未上传 · ', ja: '未アップロード · ' },
  'trace.tree.copied': { vi: 'Đã sao chép', en: 'Copied', zh: '已复制', ja: 'コピーしました' },
  'trace.tree.copiedBody': { vi: 'Mã lưu trữ đã vào bộ nhớ tạm.', en: 'The storage code is on the clipboard.', zh: '存储编号已复制到剪贴板。', ja: '保存コードをクリップボードにコピーしました。' },

  // ── Màn QUAY VIDEO QUẢ ───────────────────────────────────────
  'trace.fruitVideo.title': { vi: 'Quay video quả', en: 'Record fruit video', zh: '拍摄果实视频', ja: '果実の動画を撮る' },
  'trace.fruitVideo.stepRecord': { vi: 'Quay', en: 'Record', zh: '拍摄', ja: '撮影' },
  'trace.fruitVideo.stepTree': { vi: 'Chọn cây', en: 'Pick tree', zh: '选树', ja: '木を選ぶ' },
  'trace.fruitVideo.stepSend': { vi: 'Gửi', en: 'Send', zh: '发送', ja: '送信' },
  'trace.fruitVideo.tapToRecord': { vi: 'Bấm để quay chùm quả', en: 'Tap to record the cluster', zh: '点击拍摄果串', ja: 'タップして果房を撮影' },
  'trace.fruitVideo.tapHint': {
    vi: 'Lia chậm quanh chùm · đủ sáng · giữ chắc tay · dưới 20 giây',
    en: 'Pan slowly around the cluster · good light · steady hands · under 20 seconds',
    zh: '绕着果串慢慢移动 · 光线充足 · 手持稳定 · 不超过 20 秒',
    ja: '果房の周りをゆっくり · 明るく · 手ブレなく · 20 秒以内',
  },
  'trace.fruitVideo.recorded': { vi: 'Đã quay xong', en: 'Recorded', zh: '拍摄完成', ja: '撮影しました' },
  'trace.fruitVideo.retake': { vi: 'Quay lại', en: 'Retake', zh: '重拍', ja: '撮り直す' },
  'trace.fruitVideo.whichTree': { vi: 'Chùm quả này ở cây nào?', en: 'Which tree is this cluster on?', zh: '这串果实在哪棵树上？', ja: 'この果房はどの木ですか？' },
  'trace.fruitVideo.pickTree': { vi: 'Chọn cây…', en: 'Choose a tree…', zh: '选择果树…', ja: '木を選ぶ…' },
  'trace.fruitVideo.wrongOk': {
    vi: 'Chọn nhầm cũng không sao — sửa lại được sau.',
    en: 'Picking the wrong one is fine — it can be corrected later.',
    zh: '选错了也没关系——之后可以更正。',
    ja: '間違えても大丈夫です。あとで直せます。',
  },
  'trace.fruitVideo.searchTree': { vi: 'Tìm cây theo tên…', en: 'Search trees by name…', zh: '按名称搜索果树…', ja: '名前で木を検索…' },
  'trace.fruitVideo.noTree': { vi: 'Vườn chưa có cây nào.', en: 'This farm has no trees yet.', zh: '该农场还没有果树。', ja: 'この農場にはまだ木がありません。' },
  'trace.fruitVideo.noTreeMatch': { vi: 'Không có cây nào trùng tên đó.', en: 'No tree matches that name.', zh: '没有匹配的果树。', ja: 'その名前の木はありません。' },
  'trace.fruitVideo.note': { vi: 'Ghi thêm (không bắt buộc)', en: 'Note (optional)', zh: '备注（可选）', ja: 'メモ（任意）' },
  'trace.fruitVideo.noteHint': { vi: 'vd: chùm phía đông', en: 'e.g. cluster on the east side', zh: '例：东侧的果串', ja: '例：東側の果房' },
  'trace.fruitVideo.needClip': { vi: 'Quay clip trước đã', en: 'Record a clip first', zh: '请先拍摄', ja: 'まず撮影してください' },
  'trace.fruitVideo.needTree': { vi: 'Chọn cây trước đã', en: 'Pick a tree first', zh: '请先选树', ja: '先に木を選んでください' },
  'trace.fruitVideo.send': { vi: 'Gửi đi', en: 'Send', zh: '发送', ja: '送信' },
  'trace.fruitVideo.sending': { vi: 'Đang gửi… giữ app mở', en: 'Sending… keep the app open', zh: '正在发送…请保持应用打开', ja: '送信中…アプリを開いたままに' },
  'trace.fruitVideo.queueAuto': { vi: 'Còn {n} clip chờ gửi · tự gửi khi có sóng', en: '{n} clips waiting · they will send when you have signal', zh: '还有 {n} 段待发送 · 有信号时自动发送', ja: '{n} 件が送信待ち · 電波が入れば自動送信' },
  'trace.fruitVideo.queueManual': { vi: 'Còn {n} clip chờ gửi · {m} clip phải bấm gửi tay', en: '{n} clips waiting · {m} need a manual send', zh: '还有 {n} 段待发送 · {m} 段需手动发送', ja: '{n} 件が送信待ち · {m} 件は手動送信が必要' },
  'trace.fruitVideo.retrySend': { vi: 'Gửi lại', en: 'Retry', zh: '重新发送', ja: '再送信' },
  'trace.fruitVideo.sendingShort': { vi: 'Đang gửi…', en: 'Sending…', zh: '发送中…', ja: '送信中…' },
  'trace.fruitVideo.doneTitle': { vi: 'Đã lưu video quả', en: 'Fruit video saved', zh: '果实视频已保存', ja: '果実の動画を保存しました' },
  'trace.fruitVideo.doneSawN': { vi: 'Đã lưu video và thấy {n} quả.', en: 'Saved, and {n} fruits were spotted.', zh: '已保存，识别到 {n} 个果实。', ja: '保存し、果実を {n} 個見つけました。' },
  'trace.fruitVideo.doneSaved': { vi: 'Đã lưu video.', en: 'Video saved.', zh: '视频已保存。', ja: '動画を保存しました。' },
  'trace.fruitVideo.doneFrames': { vi: 'Chủ vườn sẽ xác nhận sau. ({n} khung hình)', en: 'The owner will confirm later. ({n} frames)', zh: '园主稍后确认。（{n} 帧）', ja: '所有者があとで確認します。（{n} フレーム）' },
  'trace.fruitVideo.doneSlower': {
    vi: 'Lần sau quay chậm hơn một chút sẽ rõ hơn. Chủ vườn xác nhận sau.',
    en: 'Panning a little slower next time helps. The owner will confirm later.',
    zh: '下次移动慢一点会更清楚。园主稍后确认。',
    ja: '次はもう少しゆっくり動かすと鮮明です。所有者があとで確認します。',
  },
  'trace.fruitVideo.storedCid': { vi: 'Đã cất vào kho an toàn · {cid}', en: 'Stored safely · {cid}', zh: '已安全存储 · {cid}', ja: '安全に保管 · {cid}' },
  'trace.fruitVideo.another': { vi: 'Quay clip khác', en: 'Record another', zh: '再拍一段', ja: 'もう一本撮る' },
  'trace.fruitVideo.finish': { vi: 'Xong', en: 'Done', zh: '完成', ja: '完了' },

  'trace.weather.today': { vi: 'Hôm nay', en: 'Today', zh: '今天', ja: '今日' },

  // ── Màn QUẢ TRÊN CÂY ─────────────────────────────────────────
  'trace.fruitList.title': { vi: 'Quả trên cây', en: 'Fruit on the tree', zh: '树上的果实', ja: '木になる果実' },
  'trace.fruitList.loading': { vi: 'Đang tải quả…', en: 'Loading fruit…', zh: '正在加载果实…', ja: '果実を読み込み中…' },
  'trace.fruitList.statAll': { vi: 'Tất cả', en: 'All', zh: '全部', ja: 'すべて' },
  'trace.fruitList.statNamed': { vi: 'Đã đặt tên', en: 'Named', zh: '已命名', ja: '名前あり' },
  'trace.fruitList.unnamed': { vi: 'Chưa đặt tên', en: 'Unnamed', zh: '未命名', ja: '名前なし' },
  'trace.fruitList.views': { vi: '{n} góc ảnh', en: '{n} angles', zh: '{n} 个角度', ja: 'アングル {n}' },
  'trace.fruitList.noFruit': { vi: 'Cây này chưa có quả nào', en: 'No fruit on this tree yet', zh: '这棵树还没有果实', ja: 'この木にはまだ果実がありません' },
  'trace.fruitList.noFruitHint': {
    vi: 'Chụp một tấm ảnh, khoanh quả vào vòng là xong.',
    en: 'Take a photo, circle the fruit, and you are done.',
    zh: '拍一张照片，把果实圈起来就行。',
    ja: '写真を撮って果実を丸で囲むだけです。',
  },
  'trace.fruitList.firstFruit': { vi: 'Khoanh quả đầu tiên', en: 'Circle the first fruit', zh: '圈出第一个果实', ja: '最初の果実を囲む' },
  'trace.fruitList.noneInFilter': { vi: 'Không có quả nào ở mục này', en: 'Nothing in this group', zh: '该分组中没有果实', ja: 'この分類には何もありません' },
  'trace.fruitList.loadFail': { vi: 'Không tải được', en: 'Could not load', zh: '无法加载', ja: '読み込めません' },
  'trace.fruitList.noSpecies': {
    vi: 'Chưa rõ cây giống gì — chọn giúp để biết cây có cho quả hay không',
    en: 'Species unknown — pick one so we know whether this tree bears fruit',
    zh: '树种未知——请选择，以便判断该树是否结果',
    ja: '樹種が不明です。実がなるか判断するため選んでください',
  },
  'trace.fruitList.speciesNoFruit': { vi: 'Giống này không cho quả', en: 'This species bears no fruit', zh: '该树种不结果', ja: 'この樹種は実をつけません' },
  'trace.fruitList.speciesNoFruitBody': {
    vi: '{name} không cho quả thương phẩm — dấu nhận dạng nằm ở thân và cành.',
    en: '{name} bears no commercial fruit — its identifying marks are on the trunk and branches.',
    zh: '{name} 不结商品果——识别特征在树干与枝条上。',
    ja: '{name} は商品果をつけません。識別の手がかりは幹と枝にあります。',
  },
  'trace.fruitList.pickTreeFirst': { vi: 'Hãy chọn cây trước, rồi mới xem quả của cây đó.', en: 'Pick a tree first, then view its fruit.', zh: '请先选树，再查看其果实。', ja: '先に木を選んでから果実を見ます。' },
  'trace.fruitList.pickTree': { vi: 'Chọn cây', en: 'Pick a tree', zh: '选择果树', ja: '木を選ぶ' },
  'trace.fruitList.addFruit': { vi: 'Thêm quả', en: 'Add fruit', zh: '添加果实', ja: '果実を追加' },
  'trace.fruitList.addAngle': { vi: 'Thêm góc ảnh', en: 'Add an angle', zh: '添加角度', ja: 'アングルを追加' },
  'trace.fruitList.addAngleFor': { vi: 'Chụp thêm một góc cho “{name}”.', en: 'Take another angle of “{name}”.', zh: '为“{name}”再拍一个角度。', ja: '「{name}」の別のアングルを撮ります。' },
  'trace.fruitList.pickPhoto': { vi: 'Chọn ảnh có quả, rồi khoanh quả vào vòng.', en: 'Choose a photo with fruit, then circle it.', zh: '选一张有果实的照片，然后圈起来。', ja: '果実が写った写真を選び、丸で囲みます。' },
  'trace.fruitList.shoot': { vi: 'Chụp ảnh', en: 'Take a photo', zh: '拍照', ja: '写真を撮る' },
  'trace.fruitList.shootDesc': { vi: 'Mở máy ảnh và chụp ngay', en: 'Open the camera and shoot', zh: '打开相机直接拍', ja: 'カメラを開いて撮る' },
  'trace.fruitList.fromLibrary': { vi: 'Chọn từ thư viện', en: 'Choose from library', zh: '从相册选择', ja: 'ライブラリから選ぶ' },
  'trace.fruitList.fromLibraryDesc': { vi: 'Lấy ảnh đã có trong máy', en: 'Use a photo already on the phone', zh: '使用手机里的照片', ja: '端末にある写真を使う' },
  'trace.fruitList.cancel': { vi: 'Huỷ', en: 'Cancel', zh: '取消', ja: 'キャンセル' },
  'trace.fruitList.angles': { vi: 'Góc ảnh', en: 'Angles', zh: '角度', ja: 'アングル' },
  'trace.fruitList.spot': { vi: 'Chỗ trên cây', en: 'Spot on the tree', zh: '树上位置', ja: '木の位置' },
  'trace.fruitList.recordedOn': { vi: 'Ghi ngày', en: 'Recorded', zh: '记录日', ja: '記録日' },
  'trace.fruitList.anglePhotos': { vi: 'Ảnh các góc', en: 'Angle photos', zh: '各角度照片', ja: '各アングルの写真' },
  'trace.fruitList.noAngles': { vi: 'Chưa có ảnh góc nào.', en: 'No angle photos yet.', zh: '还没有角度照片。', ja: 'アングル写真はまだありません。' },
  'trace.fruitList.place3d': { vi: 'Đặt vào sơ đồ', en: 'Place in the map', zh: '放入立体图', ja: '立体図に置く' },
  'trace.zone.base': { vi: 'Gốc', en: 'Base', zh: '树基', ja: '根元' },
  'trace.zone.mid': { vi: 'Giữa thân', en: 'Mid', zh: '树中', ja: '中段' },
  'trace.zone.canopy': { vi: 'Trên tán', en: 'Canopy', zh: '树冠', ja: '樹冠' },

  // ── Màn ĐẶT VỊ TRÍ QUẢ (sơ đồ 3D) ────────────────────────────
  'trace.place3d.title': { vi: 'Quả này nằm chỗ nào trên cây?', en: 'Where on the tree is it?', zh: '果实在树上的什么位置？', ja: '木のどこにありますか？' },
  'trace.place3d.step': { vi: 'Bước {i}/{n}', en: 'Step {i} of {n}', zh: '第 {i}/{n} 步', ja: 'ステップ {i}/{n}' },
  'trace.place3d.newFruit': { vi: 'Quả mới', en: 'New fruit', zh: '新果实', ja: '新しい果実' },
  'trace.place3d.viewFront': { vi: 'Nhìn trước', en: 'Front', zh: '正面', ja: '正面' },
  'trace.place3d.viewSide': { vi: 'Nhìn ngang', en: 'Side', zh: '侧面', ja: '側面' },
  'trace.place3d.viewTop': { vi: 'Nhìn trên', en: 'Top', zh: '俯视', ja: '上から' },
  'trace.place3d.next': { vi: 'Sang {view}', en: 'Next: {view}', zh: '下一步：{view}', ja: '次へ：{view}' },
  'trace.place3d.confirm': { vi: 'Xong, đặt ở đây', en: 'Done, place it here', zh: '完成，就放这里', ja: 'ここに置く' },
  'trace.place3d.reset': { vi: 'Đặt lại', en: 'Reset', zh: '重置', ja: 'リセット' },
  'trace.place3d.locked': { vi: 'đang khoá', en: 'locked', zh: '已锁定', ja: 'ロック中' },
  'trace.place3d.axisX': { vi: 'trái ⇄ phải', en: 'left ⇄ right', zh: '左 ⇄ 右', ja: '左 ⇄ 右' },
  'trace.place3d.axisY': { vi: 'gốc → ngọn', en: 'base → top', zh: '树基 → 树顶', ja: '根元 → 先端' },
  'trace.place3d.axisZ': { vi: 'trước ⇄ sau', en: 'front ⇄ back', zh: '前 ⇄ 后', ja: '前 ⇄ 後' },
  'trace.place3d.localOnly': {
    vi: 'Vị trí này mới chỉ nằm trên máy đang dùng. Máy khác chưa thấy — chụp thêm một góc cho quả để đẩy lên máy chủ.',
    en: 'This position lives only on this phone. Other phones will not see it — add another angle photo to push it to the server.',
    zh: '该位置仅保存在这台手机上，其他手机看不到——为果实再拍一个角度即可上传。',
    ja: 'この位置はこの端末にのみ保存されます。他の端末では見えません。別アングルを撮ると server に反映されます。',
  },

  'trace.fruitList.shootVideo': { vi: 'Quay video chùm quả', en: 'Record a video of the cluster', zh: '拍摄果串视频', ja: '果房の動画を撮る' },
  'trace.fruitList.shootVideoDesc': {
    vi: 'Chỉ để ĐẾM quả trên cây — không tạo từng quả riêng trong danh sách',
    en: 'Counts the fruit only — it does not create individual entries',
    zh: '仅用于清点果实数量——不会逐个建立条目',
    ja: '果実の数を数えるだけで、個別の記録は作られません',
  },

  'trace.tree.featuresTitle': { vi: 'Máy nhận ra cây này nhờ', en: 'The app recognises this tree by', zh: '系统靠这些特征认出这棵树', ja: 'この木を見分ける手がかり' },
  'trace.tree.featuresPending': {
    vi: 'Máy chủ chưa gửi mô tả đặc điểm cho cây này. Chụp thêm vài góc rồi mở lại — mô tả sẽ hiện ở đây.',
    en: 'The server has not sent a description for this tree yet. Add a few more angles and come back — it will appear here.',
    zh: '服务器尚未返回这棵树的特征描述。多拍几个角度后再回来查看。',
    ja: 'サーバーからこの木の特徴説明がまだ届いていません。角度をいくつか追加してから戻ってください。',
  },

  // ── Màn KHOANH QUẢ (hai bước sau) ────────────────────────────
  'trace.crop.step': { vi: 'Bước {i} / {n}', en: 'Step {i} of {n}', zh: '第 {i}/{n} 步', ja: 'ステップ {i}/{n}' },
  'trace.crop.whichFruit': { vi: 'Đây là quả nào?', en: 'Which fruit is this?', zh: '这是哪个果实？', ja: 'これはどの果実ですか？' },
  'trace.crop.whichFruitHint': {
    vi: 'Đã chốt vùng quả. Chọn quả đã có để thêm góc ảnh, hoặc lưu thành quả mới.',
    en: 'The area is set. Pick an existing fruit to add an angle, or save it as a new one.',
    zh: '区域已确定。选择已有果实以添加角度，或保存为新果实。',
    ja: '範囲を確定しました。既存の果実を選んでアングルを足すか、新しい果実として保存します。',
  },
  'trace.crop.isNew': { vi: 'Đây là quả mới', en: 'This is a new fruit', zh: '这是新的果实', ja: 'これは新しい果実です' },
  'trace.crop.seeOthers': { vi: 'Không phải — xem {n} quả khác', en: 'Not it — see {n} others', zh: '不是——查看其他 {n} 个', ja: '違う — ほか {n} 件を見る' },
  'trace.crop.collapse': { vi: 'Thu gọn', en: 'Collapse', zh: '收起', ja: '折りたたむ' },
  'trace.crop.allFruits': { vi: 'Tất cả quả của cây', en: 'Every fruit on this tree', zh: '这棵树的全部果实', ja: 'この木のすべての果実' },
  'trace.crop.nothingToMatch': { vi: 'Cây chưa có quả nào để đối chiếu — đặt tên để lưu quả mới.', en: 'Nothing to match against yet — name it to save a new fruit.', zh: '还没有可比对的果实——命名后保存为新果实。', ja: '照合できる果実がまだありません。名前を付けて新規保存します。' },
  'trace.crop.recrop': { vi: 'Khoanh lại vùng khác', en: 'Circle a different area', zh: '重新圈选', ja: '別の範囲を囲む' },
  'trace.crop.newFruit': { vi: 'Quả mới', en: 'New fruit', zh: '新果实', ja: '新しい果実' },
  'trace.crop.saveOnTree': { vi: 'Lưu thành quả mới trên cây {name}.', en: 'Save as a new fruit on {name}.', zh: '保存为 {name} 上的新果实。', ja: '{name} の新しい果実として保存します。' },
  'trace.crop.thisTree': { vi: 'này', en: 'this tree', zh: '这棵树', ja: 'この木' },
  'trace.crop.fruitName': { vi: 'Đặt tên cho quả', en: 'Name this fruit', zh: '给果实命名', ja: '果実に名前を付ける' },
  'trace.crop.fruitNameHint': { vi: 'vd: quả ngọn phía đông', en: 'e.g. top fruit, east side', zh: '例：东侧顶部的果实', ja: '例：東側の先端の果実' },
  'trace.crop.whereOnTree': { vi: 'Quả nằm ở đâu trên cây', en: 'Where on the tree it sits', zh: '果实在树上的位置', ja: '木のどこにあるか' },
  'trace.crop.place3d': { vi: 'Đặt vị trí trên cây', en: 'Place it on the tree', zh: '在树上定位', ja: '木の上に置く' },
  'trace.crop.place3dHint': { vi: 'Kéo hình quả theo ba hướng nhìn để đặt đúng chỗ', en: 'Drag the fruit across three views to place it', zh: '在三个视角中拖动果实以确定位置', ja: '3 つの視点で果実をドラッグして位置を決めます' },
  'trace.crop.save': { vi: 'Lưu quả mới', en: 'Save the new fruit', zh: '保存新果实', ja: '新しい果実を保存' },

  // ── Quay video → tạo hẳn MỘT QUẢ ─────────────────────────────
  'trace.fruitVideo.stepCover': { vi: 'Ảnh quả', en: 'Fruit photo', zh: '果实照片', ja: '果実の写真' },
  'trace.fruitVideo.stepName': { vi: 'Đặt tên', en: 'Name it', zh: '命名', ja: '名前' },
  'trace.fruitVideo.coverTitle': { vi: 'Chụp một tấm ảnh quả', en: 'Take one photo of the fruit', zh: '拍一张果实照片', ja: '果実の写真を 1 枚' },
  'trace.fruitVideo.coverHint': {
    vi: 'Đưa quả vào giữa khung. Tấm này là ảnh nhận dạng của quả — clip video chỉ dùng để đếm.',
    en: 'Put the fruit in the middle of the frame. This photo identifies the fruit — the clip only counts them.',
    zh: '把果实放在画面中央。这张照片用于识别果实——视频只用于清点。',
    ja: '果実を画面の中央に。この写真が果実の識別に使われます（動画は数を数えるだけです）。',
  },
  'trace.fruitVideo.coverDone': { vi: 'Đã có ảnh quả', en: 'Photo taken', zh: '照片已拍好', ja: '写真あり' },
  'trace.fruitVideo.needCover': { vi: 'Chụp ảnh quả trước đã', en: 'Take the fruit photo first', zh: '请先拍果实照片', ja: '先に果実の写真を' },
  'trace.fruitVideo.needName': { vi: 'Đặt tên cho quả trước đã', en: 'Name the fruit first', zh: '请先为果实命名', ja: '先に名前を付けてください' },
  'trace.fruitVideo.nameLabel': { vi: 'Đặt tên cho quả này', en: 'Name this fruit', zh: '给这个果实命名', ja: 'この果実の名前' },
  'trace.fruitVideo.nameHint': { vi: 'vd: quả ngọn phía đông', en: 'e.g. top fruit, east side', zh: '例：东侧顶部的果实', ja: '例：東側の先端の果実' },
  'trace.fruitVideo.savedFruit': { vi: 'Đã lưu thành quả “{name}”', en: 'Saved as the fruit “{name}”', zh: '已保存为果实“{name}”', ja: '果実「{name}」として保存しました' },
  'trace.fruitVideo.fruitFailTitle': { vi: 'Clip đã lưu, nhưng chưa tạo được quả', en: 'Clip saved, but the fruit was not created', zh: '视频已保存，但未能创建果实', ja: '動画は保存しましたが、果実を作成できませんでした' },
  'trace.fruitVideo.fruitFailBody': {
    vi: 'Clip đã cất an toàn. Riêng phần tạo quả chưa xong: {reason}. Bạn vào trang “Quả trên cây” thêm lại bằng ảnh nhé.',
    en: 'The clip is stored safely. Creating the fruit did not finish: {reason}. Add it from the “Fruit on the tree” page instead.',
    zh: '视频已安全保存，但创建果实未完成：{reason}。请到“树上的果实”页面用照片补建。',
    ja: '動画は安全に保存されました。果実の作成は完了していません：{reason}。「木になる果実」から写真で追加してください。',
  },
  'trace.fruitVideo.retakeCover': { vi: 'Chụp lại', en: 'Retake', zh: '重拍', ja: '撮り直す' },

  'trace.farmList.wayfind': { vi: 'Dẫn đường tới {name}', en: 'Navigate to {name}', zh: '导航到 {name}', ja: '{name} への道案内' },


  // ── Bầu trời (mã WMO → chữ, xem `describeWeather`) ────────────────────────
  'trace.sky.clear': { vi: 'Trời quang', en: 'Clear sky', zh: '晴朗', ja: '快晴' },
  'trace.sky.mostlyClear': { vi: 'Nắng nhẹ', en: 'Mostly clear', zh: '晴间少云', ja: 'おおむね晴れ' },
  'trace.sky.partlyCloudy': { vi: 'Có mây', en: 'Partly cloudy', zh: '多云间晴', ja: '晴れ時々くもり' },
  'trace.sky.cloudy': { vi: 'Nhiều mây', en: 'Cloudy', zh: '阴天', ja: 'くもり' },
  'trace.sky.fog': { vi: 'Sương mù', en: 'Fog', zh: '有雾', ja: '霧' },
  'trace.sky.drizzle': { vi: 'Mưa phùn', en: 'Drizzle', zh: '毛毛雨', ja: '霧雨' },
  'trace.sky.rain': { vi: 'Mưa', en: 'Rain', zh: '有雨', ja: '雨' },
  'trace.sky.freezingRain': { vi: 'Mưa lạnh', en: 'Freezing rain', zh: '冻雨', ja: '着氷性の雨' },
  'trace.sky.snow': { vi: 'Tuyết', en: 'Snow', zh: '下雪', ja: '雪' },
  'trace.sky.showers': { vi: 'Mưa rào', en: 'Showers', zh: '阵雨', ja: 'にわか雨' },
  'trace.sky.sleet': { vi: 'Mưa tuyết', en: 'Sleet', zh: '雨夹雪', ja: 'みぞれ' },
  'trace.sky.storm': { vi: 'Dông', en: 'Thunderstorm', zh: '雷雨', ja: '雷雨' },
  'trace.sky.unknown': { vi: 'Chưa rõ', en: 'Unknown', zh: '未知', ja: '不明' },

  // ── Chung ─────────────────────────────────────────────────────────────────
  'trace.button.retry': { vi: 'Thử lại', en: 'Try again', zh: '重试', ja: 'もう一度' },
  'trace.error.loadTitle': { vi: 'Lỗi', en: 'Error', zh: '出错了', ja: 'エラー' },
  'trace.error.loadBody': { vi: 'Không thể tải dữ liệu', en: 'Could not load your data', zh: '无法加载数据', ja: 'データを読み込めませんでした' },

  // ── Câu khuyên việc nhà nông (rút từ dự báo) ──────────────────────────────
  'trace.advice.storm': {
    vi: 'Đang có dông — tạm dừng việc ngoài vườn, cất máy móc vào chỗ khô.',
    en: 'Thunderstorms right now — pause outdoor work and move equipment somewhere dry.',
    zh: '正在打雷 — 暂停户外作业，把机具收到干燥处。',
    ja: '雷雨です — 屋外作業を中断し、機材を乾いた場所へ移してください。',
  },
  'trace.advice.rainLikely': {
    vi: 'Hôm nay khả năng mưa rất cao — hoãn phun thuốc, thuốc gặp mưa là trôi hết.',
    en: 'Rain is very likely today — hold off spraying, rain washes it straight off.',
    zh: '今天降雨概率很高 — 暂缓打药，遇雨会被冲掉。',
    ja: '今日は降水確率がとても高いです — 薬剤散布は見送りを。雨で流れてしまいます。',
  },
  'trace.advice.raining': {
    vi: 'Đang mưa — chờ tạnh và lá khô rồi hãy phun.',
    en: 'It is raining — wait until it stops and the leaves dry before spraying.',
    zh: '正在下雨 — 等雨停、叶面干了再打药。',
    ja: '雨が降っています — 止んで葉が乾いてから散布してください。',
  },
  'trace.advice.hot': {
    vi: 'Trời nắng gắt — tưới vào sáng sớm hoặc chiều mát, tưới giữa trưa cây dễ sốc nhiệt.',
    en: 'Harsh sun — water early morning or late afternoon; midday watering shocks the tree.',
    zh: '烈日当空 — 请在清晨或傍晚浇水，正午浇水易伤根。',
    ja: '日差しが強いです — 水やりは早朝か夕方に。真昼の水やりは木に負担がかかります。',
  },
  'trace.advice.dry': {
    vi: 'Trời khô ráo — hợp để phun thuốc và bón phân.',
    en: 'Dry weather — a good window for spraying and fertilising.',
    zh: '天气干爽 — 适合打药和施肥。',
    ja: '乾いた天気です — 散布や施肥に向いています。',
  },
} satisfies KeyMap;
