// i18n/phrases/work.ts — module Việc làm (AladinWork): tin việc, hợp đồng, thợ.
//
// CỐ Ý KHÔNG dịch: tên người/công ty trong dữ liệu mẫu (Anh Tuấn, Chị Linh, HTX
// Tân Phú…) và mô tả công việc mẫu — đó là NỘI DUNG/tên riêng, không phải nhãn
// giao diện.

import type { PhraseMap } from '../types';

export const WORK: PhraseMap = {
  // ── Ngành nghề ─────────────────────────────────────────────────────────────
  'Xây dựng': { en: 'Construction', zh: '建筑', ja: '建設' },
  'Giúp việc': { en: 'Housekeeping', zh: '家政', ja: '家事代行' },
  'IT · Văn phòng': { en: 'IT · Office', zh: 'IT · 办公', ja: 'IT · オフィス' },
  'Sự kiện': { en: 'Events', zh: '活动', ja: 'イベント' },
  'Làm đẹp': { en: 'Beauty', zh: '美容', ja: '美容' },
  'Tài xế': { en: 'Driving', zh: '司机', ja: 'ドライバー' },
  'Gia sư': { en: 'Tutoring', zh: '家教', ja: '家庭教師' },
  'Sửa chữa': { en: 'Repair', zh: '维修', ja: '修理' },
  'Vận chuyển': { en: 'Delivery', zh: '运输', ja: '運送' },
  'Sáng tạo': { en: 'Creative', zh: '创意', ja: 'クリエイティブ' },
  'Dịch vụ': { en: 'Services', zh: '服务', ja: 'サービス' },

  // ── Màn chính ──────────────────────────────────────────────────────────────
  'Bạn cần tìm công việc gì hôm nay?': { en: 'What work are you looking for today?', zh: '今天想找什么工作？', ja: '今日はどんな仕事をお探しですか？' },
  'Việc mới đăng': { en: 'Newly posted', zh: '最新发布', ja: '新着の募集' },
  'Vừa đăng': { en: 'Just posted', zh: '刚刚发布', ja: '投稿したばかり' },
  'Cần đăng nhập lại': { en: 'Sign in again', zh: '需要重新登录', ja: '再ログインが必要です' },
  'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.': {
    en: 'Your session has expired. Please sign in again.',
    zh: '会话已过期，请重新登录。',
    ja: 'セッションの有効期限が切れました。もう一度ログインしてください。',
  },
  'Không có việc phù hợp': { en: 'No matching jobs', zh: '没有匹配的工作', ja: '条件に合う仕事がありません' },
  'Thử bỏ lọc hoặc tìm từ khóa khác.': { en: 'Try clearing filters or a different keyword.', zh: '请尝试清除筛选或换个关键词。', ja: '絞り込みを解除するか、別のキーワードでお試しください。' },
  'Không giới hạn': { en: 'No limit', zh: '不限', ja: '制限なし' },
  'Việc': { en: 'Job', zh: '工作', ja: '仕事' },
  'Người đăng': { en: 'Posted by', zh: '发布者', ja: '投稿者' },
  'Cộng tác viên': { en: 'Collaborator', zh: '合作者', ja: '協力者' },
  'Loại việc': { en: 'Job type', zh: '工作类型', ja: '仕事の種類' },

  // ── Chi tiết tin việc ──────────────────────────────────────────────────────
  'Không tìm thấy tin tuyển dụng': { en: 'Job posting not found', zh: '未找到招聘信息', ja: '募集が見つかりません' },
  'Tin này có thể đã bị gỡ hoặc không còn tồn tại.': {
    en: 'This posting may have been removed or no longer exists.',
    zh: '该信息可能已被删除或不再存在。',
    ja: 'この募集は取り下げられたか、すでに存在しない可能性があります。',
  },
  'Xác nhận ứng tuyển': { en: 'Confirm application', zh: '确认应聘', ja: '応募を確認' },
  'Ứng tuyển': { en: 'Apply', zh: '应聘', ja: '応募する' },
  'Ứng tuyển ngay': { en: 'Apply now', zh: '立即应聘', ja: '今すぐ応募' },
  'Đã ứng tuyển': { en: 'Applied', zh: '已应聘', ja: '応募済み' },
  'Phòng chat Aladin sẽ mở để bạn trao đổi với người thuê.': {
    en: 'An Aladin chat room will open so you can talk with the hirer.',
    zh: '将打开 Aladin 聊天室，方便你与雇主沟通。',
    ja: 'Aladin のチャットルームが開き、依頼主とやり取りできます。',
  },

  // ── Đăng tin ───────────────────────────────────────────────────────────────
  'Thiếu thông tin': { en: 'Missing information', zh: '信息不完整', ja: '情報が不足しています' },
  'Vui lòng điền đầy đủ các ô bắt buộc.': { en: 'Please fill in all required fields.', zh: '请填写所有必填项。', ja: '必須項目をすべて入力してください。' },
  'Đăng tin thành công': { en: 'Posted successfully', zh: '发布成功', ja: '投稿が完了しました' },
  'Chưa đăng được tin': { en: 'Could not post', zh: '发布失败', ja: '投稿できません' },
  'Không gửi được tin lúc này. Kiểm tra kết nối, đăng nhập và loại việc rồi thử lại.': {
    en: 'The post could not be sent right now. Check your connection, your sign-in and the job type, then try again.',
    zh: '暂时无法发布。请检查网络连接、登录状态和工作类型后重试。',
    ja: '今は投稿できませんでした。通信状態、ログイン、作業の種類を確認してからもう一度お試しください。',
  },
  'Tiêu đề công việc': { en: 'Job title', zh: '工作标题', ja: '仕事のタイトル' },
  'VD: Cần thợ điện sửa đường dây tầng 2': {
    en: 'e.g. Electrician needed to fix 2nd-floor wiring',
    zh: '例如：需要电工维修二楼线路',
    ja: '例：2 階の配線を直す電気工事士を募集',
  },
  'Ngành nghề': { en: 'Trade', zh: '行业', ja: '業種' },
  'Mô tả chi tiết': { en: 'Detailed description', zh: '详细描述', ja: '詳しい説明' },
  'Mô tả công việc, dụng cụ cần, yêu cầu kỹ năng…': {
    en: 'Describe the work, tools needed, required skills…',
    zh: '描述工作内容、所需工具、技能要求…',
    ja: '仕事の内容、必要な道具、求めるスキル…',
  },
  'Ngân sách (VND)': { en: 'Budget (VND)', zh: '预算（越南盾）', ja: '予算（ベトナムドン）' },

  // ── Hợp đồng ───────────────────────────────────────────────────────────────
  'Chưa có hợp đồng': { en: 'No contracts yet', zh: '暂无合约', ja: '契約がまだありません' },
  'Khi bạn thuê hoặc nhận việc, hợp đồng ký quỹ sẽ hiện ở đây.': {
    en: 'Escrow contracts appear here once you hire or take a job.',
    zh: '当你雇佣或接单后，托管合约会显示在这里。',
    ja: '依頼または受注をすると、エスクロー契約がここに表示されます。',
  },
  'Bạn thuê': { en: 'You hire', zh: '你雇佣', ja: 'あなたが依頼' },
  'Bạn nhận': { en: 'You work', zh: '你接单', ja: 'あなたが受注' },
  'Không tìm thấy hợp đồng': { en: 'Contract not found', zh: '未找到合约', ja: '契約が見つかりません' },
  'Mở tranh chấp hợp đồng này?': { en: 'Open a dispute on this contract?', zh: '对该合约发起争议？', ja: 'この契約について異議を申し立てますか？' },
  'Chế độ demo': { en: 'Demo mode', zh: '演示模式', ja: 'デモモード' },
  'Cần backend AladinWork để thực thi bước này.': {
    en: 'The AladinWork backend is required for this step.',
    zh: '此步骤需要 AladinWork 后端。',
    ja: 'この手順には AladinWork のバックエンドが必要です。',
  },
  'Không thực hiện được': { en: 'Could not perform the action', zh: '无法执行', ja: '実行できません' },
  'Cần backend để mở phòng chat của hợp đồng.': {
    en: 'The backend is required to open the contract chat room.',
    zh: '打开合约聊天室需要后端支持。',
    ja: '契約のチャットルームを開くにはバックエンドが必要です。',
  },
  'Chat chưa sẵn sàng': { en: 'Chat not ready', zh: '聊天尚未就绪', ja: 'チャットの準備ができていません' },
  'ProofChat chưa được cấu hình cho hợp đồng này. Bạn có thể nối lại sau.': {
    en: 'ProofChat is not configured for this contract. You can connect it later.',
    zh: '该合约尚未配置 ProofChat，可稍后再连接。',
    ja: 'この契約には ProofChat が設定されていません。あとから接続できます。',
  },
  'Không mở được phòng chat, thử lại.': { en: 'Could not open the chat room. Try again.', zh: '无法打开聊天室，请重试。', ja: 'チャットルームを開けません。もう一度お試しください。' },
  'Người thuê (Aladin)': { en: 'Hirer (Aladin)', zh: '雇主（Aladin）', ja: '依頼主（Aladin）' },
  'Người nhận (Genie)': { en: 'Worker (Genie)', zh: '接单方（Genie）', ja: '受注者（Genie）' },
  '· đã khoá': { en: '· locked', zh: '· 已锁定', ja: '· ロック済み' },
  '· chờ': { en: '· pending', zh: '· 等待中', ja: '· 待機中' },

  // ── Trạng thái hợp đồng ────────────────────────────────────────────────────
  'Khởi tạo': { en: 'Created', zh: '已创建', ja: '作成済み' },
  'Chờ khoá cọc': { en: 'Awaiting deposit lock', zh: '等待锁定保证金', ja: '保証金のロック待ち' },
  'Đã khoá cọc': { en: 'Deposit locked', zh: '保证金已锁定', ja: '保証金をロック済み' },
  'Đang thực hiện': { en: 'In progress', zh: '进行中', ja: '進行中' },
  'Đã giao việc': { en: 'Delivered', zh: '已交付', ja: '納品済み' },
  'Đã giải phóng': { en: 'Released', zh: '已释放', ja: '解放済み' },
  'Mất cọc': { en: 'Deposit forfeited', zh: '保证金没收', ja: '保証金の没収' },
  'Tranh chấp': { en: 'Dispute', zh: '争议', ja: '係争中' },
  'Tạm khoá': { en: 'On hold', zh: '暂时锁定', ja: '一時停止' },
  'Khoá cọc': { en: 'Lock deposit', zh: '锁定保证金', ja: '保証金をロック' },
  'Kích hoạt': { en: 'Activate', zh: '激活', ja: '有効化' },
  'Thực hiện': { en: 'Start work', zh: '开始执行', ja: '着手' },
  'Giao việc': { en: 'Deliver', zh: '交付', ja: '納品' },
  'Giải phóng': { en: 'Release', zh: '释放', ja: '解放' },
  'Kích hoạt hợp đồng': { en: 'Activate the contract', zh: '激活合约', ja: '契約を有効化' },
  'Giao việc (kèm bằng chứng)': { en: 'Deliver (with evidence)', zh: '交付（附证据）', ja: '納品する（証拠を添付）' },
  'Xác nhận đã thanh toán': { en: 'Confirm payment received', zh: '确认已付款', ja: '支払い済みを確認' },
  'Giải phóng cọc': { en: 'Release the deposit', zh: '释放保证金', ja: '保証金を解放' },
  'Tạo hợp đồng': { en: 'Create contract', zh: '创建合约', ja: '契約を作成' },
  'Kích hoạt — bắt đầu làm việc': { en: 'Activate — start working', zh: '激活 — 开始工作', ja: '有効化 — 作業を開始' },
  'Chưa tới bước này trong quy trình ký quỹ — tải lại rồi thử lại.': {
    en: 'The escrow flow has not reached this step — reload and try again.',
    zh: '托管流程尚未到达此步骤 — 请重新加载后重试。',
    ja: 'エスクローの流れはまだこの手順に達していません — 読み込み直してからお試しください。',
  },
  // Câu cũ chỉ nói "cọc". Từ `AladinWork/Core#65` phí thu tại `COMMITTED`, nên
  // `NO_FUNDS` có thể là thiếu tiền trả PHÍ — xem `hooks/useContracts.ts`.
  'Số dư CARP không đủ cho bước này (tiền cọc và phí nền tảng). Nạp thêm rồi thử lại — hợp đồng vẫn giữ nguyên.': {
    en: 'Not enough CARP for this step (deposit plus platform fee). Top up and try again — the contract stays as it is.',
    zh: 'CARP 余额不足以完成这一步（保证金与平台费）。充值后再试 — 合同保持原样。',
    ja: 'このステップに必要な CARP が足りません（保証金と手数料）。追加してからもう一度お試しください — 契約はそのまま残ります。',
  },
  'Cần đăng bằng chứng trước khi giao việc.': { en: 'Evidence must be posted before delivering.', zh: '交付前需要先提交证据。', ja: '納品の前に証拠を提出する必要があります。' },
  'Bạn không phải một trong hai bên của hợp đồng này.': {
    en: 'You are not a party to this contract.',
    zh: '你不是该合约的任何一方。',
    ja: 'あなたはこの契約の当事者ではありません。',
  },
  'Thao tác thất bại, thử lại.': { en: 'The action failed. Try again.', zh: '操作失败，请重试。', ja: '操作に失敗しました。もう一度お試しください。' },

  // ── Bằng chứng ─────────────────────────────────────────────────────────────
  'Chưa có mục': { en: 'No items yet', zh: '暂无条目', ja: '項目がありません' },
  'Thêm ít nhất 1 mục bằng chứng.': { en: 'Add at least one piece of evidence.', zh: '请至少添加 1 项证据。', ja: '証拠を 1 件以上追加してください。' },
  'Đã đăng': { en: 'Posted', zh: '已提交', ja: '提出済み' },
  'Bằng chứng đã lưu. Bạn có thể quay lại giao việc.': {
    en: 'Evidence saved. You can go back and deliver.',
    zh: '证据已保存，可返回并交付。',
    ja: '証拠を保存しました。戻って納品できます。',
  },
  'Cần máy chủ AladinWork để đăng bằng chứng.': { en: 'The AladinWork server is required to post evidence.', zh: '提交证据需要 AladinWork 服务器。', ja: '証拠の提出には AladinWork サーバーが必要です。' },
  'Không đăng được': { en: 'Could not post', zh: '提交失败', ja: '提出できません' },
  'Bằng chứng chưa đủ — thêm mô tả/liên kết cụ thể hơn.': {
    en: 'Not enough evidence — add a more specific description or link.',
    zh: '证据不足 — 请补充更具体的描述或链接。',
    ja: '証拠が足りません — より具体的な説明やリンクを追加してください。',
  },
  'Ghi chú': { en: 'Note', zh: '备注', ja: 'メモ' },
  'Liên kết': { en: 'Link', zh: '链接', ja: 'リンク' },
  'Mô tả việc đã làm': { en: 'Describe the work done', zh: '描述已完成的工作', ja: '行った作業の説明' },
  'bằng chứng': { en: 'evidence', zh: '证据', ja: '証拠' },

  // ── Năng lực / chứng chỉ ───────────────────────────────────────────────────
  'Thiếu mẫu': { en: 'Template missing', zh: '缺少模板', ja: 'テンプレートがありません' },
  'Chọn loại việc (mẫu năng lực) trước.': { en: 'Choose a job type (capability template) first.', zh: '请先选择工作类型（能力模板）。', ja: '先に仕事の種類（能力テンプレート）を選んでください。' },
  'Chưa kết nối máy chủ': { en: 'Server not connected', zh: '未连接服务器', ja: 'サーバーに接続していません' },
  'Cần máy chủ AladinWork để khai năng lực.': { en: 'The AladinWork server is required to declare capabilities.', zh: '申报能力需要 AladinWork 服务器。', ja: '能力の申告には AladinWork サーバーが必要です。' },
  'Không tạo được': { en: 'Could not create', zh: '创建失败', ja: '作成できません' },
  'Chỉ số chưa hợp lệ theo mẫu — kiểm tra lại.': { en: 'The values do not match the template — check them.', zh: '指标不符合模板要求 — 请检查。', ja: 'テンプレートの条件を満たしていません — ご確認ください。' },
  'Chưa đạt': { en: 'Not passed', zh: '未通过', ja: '不合格' },
  'Chứng chỉ này chưa được duyệt. Xem lại chỉ số và bằng chứng.': {
    en: 'This credential has not been approved yet. Review the values and evidence.',
    zh: '该凭证尚未通过审核。请检查指标和证据。',
    ja: 'この証明はまだ承認されていません。数値と証拠を見直してください。',
  },
  'Cần máy chủ để xác minh.': { en: 'A server is required to verify.', zh: '验证需要服务器。', ja: '検証にはサーバーが必要です。' },
  'Không xác minh được': { en: 'Could not verify', zh: '无法验证', ja: '検証できません' },
  'Chưa có mẫu việc': { en: 'No job templates yet', zh: '暂无工作模板', ja: '仕事のテンプレートがありません' },
  'Danh sách mẫu cần máy chủ AladinWork.': { en: 'The template list requires the AladinWork server.', zh: '模板列表需要 AladinWork 服务器。', ja: 'テンプレート一覧には AladinWork サーバーが必要です。' },
  'Máy chủ chưa khai mẫu nào.': { en: 'The server has not declared any templates.', zh: '服务器尚未声明任何模板。', ja: 'サーバーにテンプレートが登録されていません。' },
  '✓ Đã xác minh': { en: '✓ Verified', zh: '✓ 已验证', ja: '✓ 検証済み' },
  '⏳ Chờ xác minh': { en: '⏳ Awaiting verification', zh: '⏳ 等待验证', ja: '⏳ 検証待ち' },

  // ── Chào dịch vụ ───────────────────────────────────────────────────────────
  'Tại chỗ': { en: 'On site', zh: '现场', ja: '現地' },
  'Cả hai': { en: 'Both', zh: '两者皆可', ja: 'どちらも' },
  'Chọn loại dịch vụ (mẫu việc) trước.': { en: 'Choose a service type (job template) first.', zh: '请先选择服务类型（工作模板）。', ja: '先にサービスの種類（仕事テンプレート）を選んでください。' },
  'Đã chào dịch vụ': { en: 'Service offered', zh: '服务已上架', ja: 'サービスを出品しました' },
  'Dịch vụ của bạn đã lên chợ.': { en: 'Your service is now on the marketplace.', zh: '你的服务已上架市场。', ja: 'あなたのサービスがマーケットに掲載されました。' },
  'Cần máy chủ AladinWork để chào dịch vụ. Thử lại khi dịch vụ sống.': {
    en: 'The AladinWork server is required to offer a service. Try again when it is up.',
    zh: '上架服务需要 AladinWork 服务器，请在服务可用时重试。',
    ja: '出品には AladinWork サーバーが必要です。サービスが利用可能になってからお試しください。',
  },
  'Dữ liệu chưa hợp lệ — kiểm tra lại giá / các trường theo mẫu.': {
    en: 'Invalid data — check the price and the template fields.',
    zh: '数据无效 — 请检查价格和模板字段。',
    ja: 'データが正しくありません — 価格やテンプレートの項目をご確認ください。',
  },
  'Danh sách mẫu dịch vụ cần máy chủ AladinWork.': {
    en: 'The service template list requires the AladinWork server.',
    zh: '服务模板列表需要 AladinWork 服务器。',
    ja: 'サービステンプレートの一覧には AladinWork サーバーが必要です。',
  },
  'Máy chủ chưa khai mẫu việc nào.': { en: 'The server has not declared any job templates.', zh: '服务器尚未声明任何工作模板。', ja: 'サーバーに仕事テンプレートが登録されていません。' },
  'Tên dịch vụ': { en: 'Service name', zh: '服务名称', ja: 'サービス名' },
  'Giá tối thiểu (VND)': { en: 'Minimum price (VND)', zh: '最低价格（越南盾）', ja: '最低価格（ベトナムドン）' },
  'Bán kính phục vụ (km)': { en: 'Service radius (km)', zh: '服务半径（公里）', ja: '対応範囲（km）' },
  'Lịch làm việc': { en: 'Working hours', zh: '工作时间', ja: '対応時間' },
  'vd T2–T6, 8h–17h': { en: 'e.g. Mon–Fri, 8am–5pm', zh: '例如：周一至周五 8:00–17:00', ja: '例：月〜金 8:00〜17:00' },
  'Mô tả': { en: 'Description', zh: '描述', ja: '説明' },
  'Giới thiệu ngắn về dịch vụ của bạn': { en: 'A short introduction to your service', zh: '简要介绍你的服务', ja: 'あなたのサービスの簡単な紹介' },

  // ── Lịch rảnh ──────────────────────────────────────────────────────────────
  'Đã khai': { en: 'Declared', zh: '已申报', ja: '申告済み' },
  'Không lưu được lịch, thử lại.': { en: 'Could not save the schedule. Try again.', zh: '无法保存日程，请重试。', ja: '予定を保存できません。もう一度お試しください。' },
  'Ngừng nhận việc': { en: 'Stop taking jobs', zh: '停止接单', ja: '受注を停止' },
  'Bạn sẽ không hiện trong danh sách ứng viên rảnh cho tới khi khai lại.': {
    en: 'You will not appear in the available-candidate list until you declare again.',
    zh: '在重新申报前，你不会出现在空闲候选人列表中。',
    ja: 'もう一度申告するまで、空き候補者の一覧に表示されなくなります。',
  },
  'Đang nhận việc': { en: 'Taking jobs', zh: '接单中', ja: '受注中' },
  'Chưa khai — không nhận việc': { en: 'Not declared — not taking jobs', zh: '未申报 — 不接单', ja: '未申告 — 受注しません' },

  // ── Ghép việc ──────────────────────────────────────────────────────────────
  'Chưa thuê được': { en: 'Could not hire', zh: '雇佣失败', ja: '依頼できません' },
  'Cần máy chủ AladinWork để tạo hợp đồng. Thử lại khi dịch vụ sống.': {
    en: 'The AladinWork server is required to create a contract. Try again when it is up.',
    zh: '创建合约需要 AladinWork 服务器，请在服务可用时重试。',
    ja: '契約の作成には AladinWork サーバーが必要です。サービスが利用可能になってからお試しください。',
  },
  'Đã có hợp đồng với ứng viên này cho tin việc.': {
    en: 'A contract with this candidate already exists for this posting.',
    zh: '该职位已与此候选人签有合约。',
    ja: 'この募集について、その候補者とはすでに契約があります。',
  },
  'Chưa có ứng viên đạt yêu cầu': { en: 'No qualifying candidates yet', zh: '暂无符合条件的候选人', ja: '条件を満たす候補者がいません' },
  'Thử nới yêu cầu năng lực hoặc mở rộng khu vực để tăng số ứng viên khớp.': {
    en: 'Try relaxing the capability requirements or widening the area to match more candidates.',
    zh: '可放宽能力要求或扩大区域，以匹配更多候选人。',
    ja: '能力の条件を緩めるか、対象エリアを広げると候補者が増えます。',
  },
  'Đạt năng lực': { en: 'Qualified', zh: '能力达标', ja: '能力を満たす' },
  'Đang rảnh': { en: 'Available', zh: '空闲', ja: '空いています' },
  'Bận': { en: 'Busy', zh: '忙碌', ja: '対応中' },
  'Thuê ứng viên này': { en: 'Hire this candidate', zh: '雇佣该候选人', ja: 'この候補者に依頼' },
  'Chưa đủ điều kiện': { en: 'Not eligible yet', zh: '尚不符合条件', ja: '条件を満たしていません' },
  'Chưa đặt được': { en: 'Could not book', zh: '预约失败', ja: '予約できません' },
  'Chưa có thợ trong danh bạ': { en: 'No workers in the directory yet', zh: '通讯录中暂无师傅', ja: '名簿に職人がいません' },
  'Danh bạ thợ cần máy chủ AladinWork. Sẽ hiện khi dịch vụ sống.': {
    en: 'The worker directory requires the AladinWork server. It will appear once the service is up.',
    zh: '师傅通讯录需要 AladinWork 服务器，服务可用后即会显示。',
    ja: '職人名簿には AladinWork サーバーが必要です。サービスが利用可能になれば表示されます。',
  },
  'Chưa có ai chào năng lực (chứng chỉ / dịch vụ / lịch rảnh). Quay lại sau.': {
    en: 'Nobody has declared capabilities yet (credentials / services / availability). Check back later.',
    zh: '目前还没有人申报能力（凭证 / 服务 / 空闲时间），请稍后再来。',
    ja: 'まだ誰も能力（証明・サービス・空き状況）を申告していません。あとでお越しください。',
  },

  // ── Hồ sơ thợ ──────────────────────────────────────────────────────────────
  'việc hoàn thành': { en: 'jobs completed', zh: '已完成工作', ja: '件の完了実績' },
  'năm kinh nghiệm': { en: 'years of experience', zh: '年经验', ja: '年の経験' },
  'Đánh giá': { en: 'Reviews', zh: '评价', ja: '評価' },
  'Kỹ năng': { en: 'Skills', zh: '技能', ja: 'スキル' },
  'CMND/CCCD đã xác thực': { en: 'ID card verified', zh: '身份证已验证', ja: '身分証を確認済み' },
  'Đã xác thực sinh trắc học': {
    en: 'Biometrics verified',
    zh: '已通过生物识别验证',
    ja: '生体認証で確認済み',
  },
  'Chứng chỉ nghề (đã upload)': { en: 'Trade certificate (uploaded)', zh: '职业证书（已上传）', ja: '職業資格（アップロード済み）' },

  // ── Ký phiên làm việc ──────────────────────────────────────────────────────
  'Đăng nhập Aladin Work': { en: 'Sign in to Aladin Work', zh: '登录 Aladin Work', ja: 'Aladin Work にログイン' },
  'Ký bằng khoá phần cứng để mở phiên làm việc': {
    en: 'Sign with the hardware key to open a work session',
    zh: '使用硬件密钥签名以开启工作会话',
    ja: 'ハードウェア鍵で署名して作業セッションを開きます',
  },

  // ── Màn hình còn thiếu ─────────────────────────────────────────────────────
  'Hợp đồng của tôi': { en: 'My contracts', zh: '我的合同', ja: 'マイ契約' },
  'Ứng viên phù hợp': { en: 'Matching candidates', zh: '匹配的候选人', ja: '条件に合う候補者' },
  'Chỉ đang rảnh': { en: 'Available only', zh: '仅显示空闲', ja: '対応可能のみ' },
  'https://… (đường dẫn ảnh hoặc clip)': {
    en: 'https://… (link to a photo or clip)',
    zh: 'https://…（图片或片段链接）',
    ja: 'https://…（写真またはクリップのリンク）',
  },
  'Quận 1, TP. HCM': { en: 'District 1, Ho Chi Minh City', zh: '胡志明市第一郡', ja: 'ホーチミン市1区' },
  'Tin của bạn đã được ký số và đăng lên Aladin Work.\n\nThợ phù hợp sẽ liên hệ qua Aladin Chat trong vài phút.': {
    en: 'Your post has been digitally signed and published on Aladin Work.\n\nSuitable workers will get in touch through Aladin Chat within a few minutes.',
    zh: '你的招工信息已完成数字签名并发布到 Aladin Work。\n\n合适的师傅将在几分钟内通过 Aladin Chat 与你联系。',
    ja: '募集は電子署名されて Aladin Work に掲載されました。\n\n条件に合う職人が数分以内に Aladin Chat から連絡します。',
  },

  // ── Dữ liệu MẪU (mockData / workMockApi) ───────────────────────────────────
  // Đây là nội dung DEMO hiện thẳng lên màn, nên vẫn phải dịch. Tên RIÊNG của
  // người (Nguyễn Văn Tài, Phạm Thị Hằng…) CỐ Ý không khai — không khai thì giữ
  // nguyên ở mọi ngôn ngữ, đúng như tên thật của người dùng.
  'TP. Hồ Chí Minh': { en: 'Ho Chi Minh City', zh: '胡志明市', ja: 'ホーチミン市' },
  'Hà Nội': { en: 'Hanoi', zh: '河内', ja: 'ハノイ' },
  'Hà Nội · Online': { en: 'Hanoi · Online', zh: '河内 · 线上', ja: 'ハノイ · オンライン' },
  'Quận 2': { en: 'District 2', zh: '第二郡', ja: '2区' },
  'Quận 7': { en: 'District 7', zh: '第七郡', ja: '7区' },
  'Quận Tân Bình': { en: 'Tan Binh District', zh: '新平郡', ja: 'タンビン区' },
  'Quận Đống Đa': { en: 'Dong Da District', zh: '栋多郡', ja: 'ドンダー区' },
  'Quận Cầu Giấy': { en: 'Cau Giay District', zh: '纸桥郡', ja: 'カウザイ区' },
  'Anh Tuấn': { en: 'Mr. Tuan', zh: 'Tuấn 先生', ja: 'トゥアンさん' },
  'Chị Linh': { en: 'Ms. Linh', zh: 'Linh 女士', ja: 'リンさん' },
  'Chị Hoa': { en: 'Ms. Hoa', zh: 'Hoa 女士', ja: 'ホアさん' },
  'Chú Bình': { en: 'Mr. Binh', zh: 'Bình 先生', ja: 'ビンさん' },
  'Cty Bao Bì Phương Nam': { en: 'Phuong Nam Packaging Co.', zh: 'Phương Nam 包装公司', ja: 'Phương Nam 包装社' },
  'Nông trại Bảy Núi': { en: 'Bay Nui Farm', zh: 'Bảy Núi 农场', ja: 'Bảy Núi 農場' },
  'Vườn Chín Muồi': { en: 'Chin Muoi Orchard', zh: 'Chín Muồi 果园', ja: 'Chín Muồi 果樹園' },
  'HTX Tân Phú': { en: 'Tan Phu Co-op', zh: 'Tân Phú 合作社', ja: 'Tân Phú 協同組合' },
  'HTX Drone Sáu Miền': { en: 'Sau Mien Drone Co-op', zh: 'Sáu Miền 无人机合作社', ja: 'Sáu Miền ドローン協同組合' },
  'Đội bay Minh Khôi': { en: 'Minh Khoi Flight Crew', zh: 'Minh Khôi 飞行队', ja: 'Minh Khôi 飛行チーム' },
  'KS. Thu Hà': { en: 'Eng. Thu Ha', zh: 'Thu Hà 工程师', ja: 'Thu Hà 技師' },
  'Bạn (Genie)': { en: 'You (Genie)', zh: '你（Genie）', ja: 'あなた（Genie）' },

  // Tin tuyển việc mẫu
  'Cần thợ điện đi đường dây cho nhà 3 tầng — Quận 7': {
    en: 'Electrician needed to wire a 3-storey house — District 7',
    zh: '招电工为三层住宅布线 — 第七郡',
    ja: '3階建て住宅の配線工事の電気工事士募集 — 7区',
  },
  'Tìm tài xế xe tải 1.5T chở hàng nội thành — gấp': {
    en: 'Looking for a 1.5t truck driver for inner-city delivery — urgent',
    zh: '急招 1.5 吨货车司机，市内运输',
    ja: '市内配送の1.5tトラック運転手を急募',
  },
  'Thiết kế logo + bộ nhận diện cho thương hiệu cà phê': {
    en: 'Logo and brand identity design for a coffee brand',
    zh: '为咖啡品牌设计标志与视觉识别系统',
    ja: 'コーヒーブランドのロゴとブランドアイデンティティのデザイン',
  },
  'Cần người giúp việc nhà theo giờ — 4h/tuần': {
    en: 'Hourly house helper needed — 4 hrs/week',
    zh: '招钟点家政 — 每周 4 小时',
    ja: '時間制の家事手伝い募集 — 週4時間',
  },
  'Sửa máy lạnh Daikin không lạnh — Quận Cầu Giấy': {
    en: 'Daikin air conditioner not cooling — Cau Giay District',
    zh: '大金空调不制冷维修 — 纸桥郡',
    ja: 'ダイキンのエアコンが冷えない — カウザイ区',
  },
  'Gia sư tiếng Anh giao tiếp cho trẻ 10 tuổi — Online': {
    en: 'Conversational English tutor for a 10-year-old — Online',
    zh: '10 岁孩子的英语口语家教 — 线上',
    ja: '10歳向け英会話の家庭教師 — オンライン',
  },
  'Phun thuốc 2ha lúa — ĐBSCL': {
    en: 'Spray 2 ha of rice — Mekong Delta',
    zh: '2 公顷水稻喷药 — 湄公河三角洲',
    ja: '水田2haの薬剤散布 — メコンデルタ',
  },
  'Thiết kế logo hợp tác xã': { en: 'Co-op logo design', zh: '合作社标志设计', ja: '協同組合のロゴデザイン' },
  'Khảo sát sâu bệnh vườn sầu riêng': {
    en: 'Pest and disease survey for a durian orchard',
    zh: '榴莲园病虫害调查',
    ja: 'ドリアン果樹園の病害虫調査',
  },
  'Aladin khoá cọc 300': { en: 'Aladin locked a 300 deposit', zh: 'Aladin 锁定 300 押金', ja: 'Aladin が保証金300をロック' },
  'Genie khoá cọc 300': { en: 'Genie locked a 300 deposit', zh: 'Genie 锁定 300 押金', ja: 'Genie が保証金300をロック' },
  'Genie đã giao việc kèm bằng chứng': {
    en: 'Genie delivered the job with evidence',
    zh: 'Genie 已交付工作并附带凭证',
    ja: 'Genie が証跡付きで作業を納品しました',
  },
  'Nhận việc quanh ĐBSCL, bán kính 50km.': {
    en: 'Takes jobs across the Mekong Delta, within a 50 km radius.',
    zh: '承接湄公河三角洲一带、半径 50 公里内的工作。',
    ja: 'メコンデルタ一帯、半径50km以内の仕事を受けます。',
  },

  // Mô tả tin tuyển việc mẫu
  'Cần tài xế xe tải 1.5T chở 30 thùng giấy carton từ kho Tân Bình đến chợ Bình Tây. Tổng quãng đường ~15km. Thanh toán qua escrow ngay khi giao hàng xong.': {
    en: 'Need a 1.5t truck driver to move 30 cartons from the Tan Binh warehouse to Binh Tay market. About 15 km total. Paid through escrow as soon as delivery is done.',
    zh: '需要 1.5 吨货车司机将 30 箱纸箱从新平仓库运到平西市场，全程约 15 公里。送达后立即通过托管付款。',
    ja: 'タンビン倉庫からビンタイ市場まで段ボール30箱を運ぶ1.5tトラック運転手を募集。全行程約15km。配送完了後、エスクローで即支払い。',
  },
  'Thương hiệu cà phê đặc sản Việt Nam (origin: Sơn La) cần thiết kế trọn bộ: logo, bao bì 250g/500g, thẻ name card, signage cửa hàng. Phong cách: tối giản, văn hóa Việt, có yếu tố H\'Mông.': {
    en: 'A Vietnamese specialty coffee brand (origin: Son La) needs a full set: logo, 250 g/500 g packaging, business cards, store signage. Style: minimal, Vietnamese culture, with H\'Mong motifs.',
    zh: '越南精品咖啡品牌（产地：山萝）需要全套设计：标志、250g/500g 包装、名片、门店招牌。风格：极简、越南文化，融入赫蒙族元素。',
    ja: 'ベトナムのスペシャルティコーヒーブランド（産地：ソンラ）がフルセットのデザインを募集：ロゴ、250g/500gパッケージ、名刺、店舗サイン。スタイル：ミニマル、ベトナム文化、モン族のモチーフ入り。',
  },
  'Nhà 2 vợ chồng + 1 em bé, căn hộ 80m². Cần dọn vệ sinh + giặt ủi 4 giờ/tuần, sáng Thứ 7. Có thiết bị đầy đủ, chỉ cần người chăm chỉ và tin cậy.': {
    en: 'A couple with one baby, 80 m² apartment. Need cleaning and laundry 4 hrs/week, Saturday mornings. All equipment provided — just looking for someone diligent and reliable.',
    zh: '两口之家加一个婴儿，80 平方米公寓。需要每周 4 小时的清洁与洗熨，周六上午。设备齐全，只需勤快可靠的人。',
    ja: '夫婦と赤ちゃん1人、80m²のマンション。週4時間の掃除と洗濯、土曜午前。道具は揃っているので、まじめで信頼できる方を希望します。',
  },
  'Máy lạnh Daikin 1HP hoạt động bình thường nhưng không lạnh. Đã thử bật chế độ Cool, nhiệt độ 16°C nhưng vẫn không lạnh. Khoảng 3 năm chưa vệ sinh.': {
    en: 'A 1 HP Daikin air conditioner runs normally but does not cool. Tried Cool mode at 16°C and it still does not cool. Not cleaned for about 3 years.',
    zh: '1 匹大金空调运转正常但不制冷。已试过制冷模式 16°C 仍不制冷。约 3 年未清洗。',
    ja: '1馬力のダイキン製エアコンは動作するが冷えません。冷房16°Cで試しても冷えず。約3年間清掃していません。',
  },
  'Con trai 10 tuổi, lớp 5, đang học chương trình Cambridge. Cần gia sư người Việt nói chuẩn tiếng Anh để luyện giao tiếp 2 buổi/tuần, mỗi buổi 1h. Bài tập theo giáo trình của cô ở trường.': {
    en: 'A 10-year-old boy in grade 5 on the Cambridge programme. Looking for a Vietnamese tutor with solid English pronunciation for conversation practice, 2 sessions a week, 1 hr each. Homework follows his school teacher\'s syllabus.',
    zh: '10 岁男孩，五年级，正在学剑桥课程。需要英语发音标准的越南籍家教练口语，每周 2 次，每次 1 小时。作业按学校老师的教材布置。',
    ja: '10歳の男子、小学5年生、ケンブリッジ課程を履修中。英語の発音が確かなベトナム人家庭教師を希望、週2回・各1時間の会話練習。宿題は学校の先生の教材に沿って出してください。',
  },

  // Yêu cầu của tin tuyển việc
  'Kinh nghiệm ≥ 3 năm': { en: '3+ years of experience', zh: '3 年以上经验', ja: '経験3年以上' },
  'Có CMND/CCCD đã xác thực': { en: 'Verified national ID', zh: '已验证的身份证', ja: '本人確認済みの身分証' },
  'Có CMND đã xác thực Aladin': { en: 'ID verified with Aladin', zh: '已通过 Aladin 验证的身份证', ja: 'Aladin で確認済みの身分証' },
  'Cam kết bảo hành 12 tháng': { en: '12-month workmanship warranty', zh: '承诺 12 个月保修', ja: '12か月の保証をお約束' },
  'Cam kết bảo hành 1 tháng': { en: '1-month workmanship warranty', zh: '承诺 1 个月保修', ja: '1か月の保証をお約束' },
  'Cam kết tối thiểu 3 tháng': { en: 'Minimum 3-month commitment', zh: '至少承诺 3 个月', ja: '最低3か月の継続' },
  'Tự chuẩn bị dụng cụ': { en: 'Brings own tools', zh: '自备工具', ja: '道具は自前' },
  'Có bằng C trở lên': { en: 'Class C licence or above', zh: '持 C 类及以上驾照', ja: 'C種以上の免許', },
  'Xe tải riêng hoặc thuê': { en: 'Own or rented truck', zh: '自有或租赁货车', ja: '自車またはレンタルのトラック' },
  'Sẵn sàng đi trong 2 giờ tới': { en: 'Able to set off within 2 hours', zh: '可在 2 小时内出发', ja: '2時間以内に出発可能' },
  'Portfolio tối thiểu 5 dự án F&B': { en: 'Portfolio with at least 5 F&B projects', zh: '作品集至少含 5 个餐饮项目', ja: '飲食業の実績5件以上のポートフォリオ' },
  'Bàn giao file gốc AI/PSD': { en: 'Hand over source AI/PSD files', zh: '交付 AI/PSD 源文件', ja: 'AI/PSDの元データを納品' },
  'Sửa không giới hạn trong 2 vòng': { en: 'Unlimited edits within 2 rounds', zh: '2 轮内不限次数修改', ja: '2ラウンド以内は修正無制限' },
  'Sở hữu trí tuệ chuyển 100% cho khách': { en: 'Full IP transfer to the client', zh: '知识产权 100% 转让给客户', ja: '知的財産権は100%クライアントへ譲渡' },
  'Sạch sẽ, cẩn thận với đồ trẻ em': { en: 'Tidy and careful with baby items', zh: '干净整洁，对婴儿用品细心', ja: '清潔で、ベビー用品の扱いが丁寧' },
  'Có dụng cụ vệ sinh và bơm gas': { en: 'Has cleaning tools and a gas charger', zh: '备有清洗工具与加氟设备', ja: '清掃道具とガスチャージ機材あり' },
  'IELTS 7.0+ hoặc native speaker': { en: 'IELTS 7.0+ or native speaker', zh: '雅思 7.0 以上或母语者', ja: 'IELTS 7.0以上またはネイティブ' },
  'Có kinh nghiệm dạy trẻ em': { en: 'Experience teaching children', zh: '有教孩子的经验', ja: '子どもを教えた経験あり' },
  'Vui vẻ, kiên nhẫn': { en: 'Cheerful and patient', zh: '开朗有耐心', ja: '明るく忍耐強い' },

  // Hồ sơ thợ mẫu — nghề & kỹ năng
  'Thợ điện · 8 năm kinh nghiệm': { en: 'Electrician · 8 years of experience', zh: '电工 · 8 年经验', ja: '電気工事士 · 経験8年' },
  'Tài xế hạng C · 12 năm': { en: 'Class C driver · 12 years', zh: 'C 类驾照司机 · 12 年', ja: 'C種免許ドライバー · 12年' },
  'Gia sư tiếng Anh · IELTS 8.0': { en: 'English tutor · IELTS 8.0', zh: '英语家教 · 雅思 8.0', ja: '英語家庭教師 · IELTS 8.0' },
  'Thợ máy lạnh · Daikin, LG, Panasonic': { en: 'AC technician · Daikin, LG, Panasonic', zh: '空调师傅 · 大金、LG、松下', ja: 'エアコン技師 · ダイキン、LG、パナソニック' },
  'Điện dân dụng': { en: 'Residential wiring', zh: '民用电', ja: '住宅用電気' },
  'Điện công nghiệp': { en: 'Industrial wiring', zh: '工业用电', ja: '産業用電気' },
  'Lắp đặt CCTV': { en: 'CCTV installation', zh: '监控安装', ja: '防犯カメラの設置' },
  'Mạng LAN': { en: 'LAN networking', zh: '局域网', ja: 'LAN配線' },
  'Xe tải 1.5T': { en: '1.5t truck', zh: '1.5 吨货车', ja: '1.5tトラック' },
  'Xe tải 3.5T': { en: '3.5t truck', zh: '3.5 吨货车', ja: '3.5tトラック' },
  'Vận chuyển nội thành': { en: 'Inner-city delivery', zh: '市内运输', ja: '市内配送' },
  'Bốc xếp': { en: 'Loading and unloading', zh: '装卸', ja: '積み下ろし' },
  'Tiếng Anh giao tiếp': { en: 'Conversational English', zh: '英语口语', ja: '英会話' },
  'Tiếng Anh trẻ em': { en: 'English for children', zh: '少儿英语', ja: '子ども英語' },
  'Máy lạnh': { en: 'Air conditioner', zh: '空调', ja: 'エアコン' },
  'Máy giặt': { en: 'Washing machine', zh: '洗衣机', ja: '洗濯機' },
  'Tủ lạnh': { en: 'Refrigerator', zh: '冰箱', ja: '冷蔵庫' },
  'Bơm gas R32/R410': { en: 'R32/R410 gas charging', zh: '加注 R32/R410 冷媒', ja: 'R32/R410ガスチャージ' },

  // Hồ sơ thợ mẫu — giới thiệu
  'Thợ điện chuyên nghiệp với 8 năm kinh nghiệm. Chuyên kéo dây điện toàn bộ cho nhà mới xây, sửa chữa điện hư hỏng, lắp đặt hệ thống an ninh. Cam kết bảo hành 12 tháng cho mọi công trình.': {
    en: 'Professional electrician with 8 years of experience. Specialises in full wiring for new builds, electrical repairs and security system installation. Every job carries a 12-month warranty.',
    zh: '专业电工，8 年经验。擅长新建住宅整体布线、电路维修、安防系统安装。所有工程承诺 12 个月保修。',
    ja: '経験8年のプロの電気工事士。新築の全体配線、電気の修理、防犯システムの設置が専門。すべての工事に12か月の保証付き。',
  },
  'Designer với portfolio 100+ dự án thương hiệu. Tốt nghiệp ĐH Mỹ thuật Công nghiệp Hà Nội. Style: tối giản, có chiều sâu văn hóa. Đã làm cho các brand: Cộng Cà Phê, Phin Deli, Highlands.': {
    en: 'Designer with a portfolio of 100+ brand projects. Graduated from Hanoi University of Industrial Fine Arts. Style: minimal with cultural depth. Past brands: Cong Ca Phe, Phin Deli, Highlands.',
    zh: '设计师，作品集含 100 多个品牌项目。毕业于河内工业美术大学。风格：极简而有文化厚度。合作过的品牌：Cộng Cà Phê、Phin Deli、Highlands。',
    ja: 'ブランド案件100件超のポートフォリオを持つデザイナー。ハノイ工業美術大学卒。スタイルはミニマルながら文化的な奥行きあり。実績ブランド：Cộng Cà Phê、Phin Deli、Highlands。',
  },
  'Tài xế xe tải 12 năm kinh nghiệm, từng giao hàng cho Tiki, Shopee Express. Có xe tải riêng 1.5T và 3.5T. Sẵn sàng nhận hàng gấp trong 1 giờ.': {
    en: 'Truck driver with 12 years of experience, previously delivering for Tiki and Shopee Express. Owns a 1.5t and a 3.5t truck. Can pick up urgent loads within an hour.',
    zh: '12 年经验的货车司机，曾为 Tiki、Shopee Express 送货。自有 1.5 吨与 3.5 吨货车。可在 1 小时内接急单。',
    ja: '経験12年のトラック運転手。Tiki や Shopee Express の配送実績あり。1.5tと3.5tのトラックを自己所有。急ぎの荷物も1時間以内に対応可能。',
  },
  'Cô giáo Mai, IELTS 8.0, 5 năm dạy IELTS và tiếng Anh trẻ em. Học viên đã đạt 7.0+ trong 6 tháng. Phương pháp: giao tiếp tự nhiên, không học vẹt.': {
    en: 'Ms. Mai, IELTS 8.0, five years teaching IELTS and English for children. Students have reached 7.0+ in six months. Method: natural conversation, no rote learning.',
    zh: 'Mai 老师，雅思 8.0，教授雅思与少儿英语 5 年。学员 6 个月内考到 7.0 以上。方法：自然对话，不死记硬背。',
    ja: 'マイ先生、IELTS 8.0、IELTSと子ども英語の指導歴5年。生徒は6か月で7.0以上を達成。指導法は自然な会話重視で、丸暗記はしません。',
  },
  'Chuyên sửa máy lạnh các hãng. Vệ sinh, bơm gas, thay lốc, sửa board. Có đầy đủ dụng cụ chuyên nghiệp. Phục vụ tận nhà trong 2 giờ.': {
    en: 'Repairs air conditioners of all brands: cleaning, gas charging, compressor replacement, board repair. Fully equipped with professional tools. On-site within 2 hours.',
    zh: '维修各品牌空调：清洗、加氟、换压缩机、修主板。备有齐全的专业工具。2 小时内上门。',
    ja: '各メーカーのエアコン修理に対応：清掃、ガスチャージ、コンプレッサー交換、基板修理。専門工具を一式完備。2時間以内に訪問します。',
  },

  // Hồ sơ thợ — đánh giá & việc đã làm (WorkerProfileScreen)
  'Làm rất tỉ mỉ, đúng giờ, giá cả phải chăng. Sẽ thuê lại.': {
    en: 'Very meticulous, on time, fair price. Would hire again.',
    zh: '做工细致、准时、价格合理。还会再找他。',
    ja: 'とても丁寧で時間も正確、料金も妥当。またお願いします。',
  },
  'Anh Tài làm việc rất chuyên nghiệp. Có giấy phép, đầy đủ bảo hộ.': {
    en: 'Tai works very professionally. Licensed, with full safety gear.',
    zh: 'Tài 师傅非常专业，有执照，防护装备齐全。',
    ja: 'タイさんはとてもプロフェッショナル。資格もあり、保護具も万全でした。',
  },
  'Tốt, hài lòng. Chỉ một chút chậm so với hẹn nhưng chất lượng OK.': {
    en: 'Good, satisfied. A little late versus the appointment, but the quality was fine.',
    zh: '不错，满意。比约定时间稍晚，但质量没问题。',
    ja: '良かったです、満足。約束より少し遅れましたが、仕上がりは問題なし。',
  },
  'Kéo dây điện nhà mới': { en: 'Wiring for a new house', zh: '新房布线', ja: '新築の配線工事' },
  'Kéo dây điện nhà mới 3 tầng': { en: 'Wiring for a new 3-storey house', zh: '三层新房布线', ja: '3階建て新築の配線工事' },
  'Sửa hệ thống điện văn phòng': { en: 'Office electrical system repair', zh: '办公室电路维修', ja: 'オフィスの電気設備の修理' },
  'Lắp đèn LED và quạt trần': { en: 'LED light and ceiling fan installation', zh: '安装 LED 灯与吊扇', ja: 'LED照明とシーリングファンの設置' },
  'Lắp đặt CCTV cho cửa hàng': { en: 'CCTV installation for a shop', zh: '店铺监控安装', ja: '店舗への防犯カメラ設置' },
  'Sửa ổ cắm điện hỏng': { en: 'Faulty power socket repair', zh: '维修损坏的插座', ja: '故障したコンセントの修理' },
};
