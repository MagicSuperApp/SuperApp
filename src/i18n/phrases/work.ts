// i18n/phrases/work.ts — module Việc làm (AladinWork): tin việc, hợp đồng, thợ.
//
// CỐ Ý KHÔNG dịch: tên người/công ty trong dữ liệu mẫu (Anh Tuấn, Chị Linh, HTX
// Tân Phú…) và mô tả công việc mẫu — đó là NỘI DUNG/tên riêng, không phải nhãn
// giao diện.

import type { PhraseMap } from '../types';

export const WORK: PhraseMap = {
  // ── Ngành nghề ─────────────────────────────────────────────────────────────
  'Xây dựng': { en: 'Construction', zh: '建筑' },
  'Giúp việc': { en: 'Housekeeping', zh: '家政' },
  'IT · Văn phòng': { en: 'IT · Office', zh: 'IT · 办公' },
  'Sự kiện': { en: 'Events', zh: '活动' },
  'Làm đẹp': { en: 'Beauty', zh: '美容' },
  'Tài xế': { en: 'Driving', zh: '司机' },
  'Gia sư': { en: 'Tutoring', zh: '家教' },
  'Sửa chữa': { en: 'Repair', zh: '维修' },
  'Vận chuyển': { en: 'Delivery', zh: '运输' },
  'Sáng tạo': { en: 'Creative', zh: '创意' },
  'Dịch vụ': { en: 'Services', zh: '服务' },

  // ── Màn chính ──────────────────────────────────────────────────────────────
  'Bạn cần tìm công việc gì hôm nay?': { en: 'What work are you looking for today?', zh: '今天想找什么工作？' },
  'Việc mới đăng': { en: 'Newly posted', zh: '最新发布' },
  'Vừa đăng': { en: 'Just posted', zh: '刚刚发布' },
  'Cần đăng nhập lại': { en: 'Sign in again', zh: '需要重新登录' },
  'Phiên làm việc đã hết hạn. Vui lòng đăng nhập PhoenixKey lại.': {
    en: 'Your session has expired. Please sign in with PhoenixKey again.',
    zh: '会话已过期，请重新使用 PhoenixKey 登录。',
  },
  'Không có việc phù hợp': { en: 'No matching jobs', zh: '没有匹配的工作' },
  'Thử bỏ lọc hoặc tìm từ khóa khác.': { en: 'Try clearing filters or a different keyword.', zh: '请尝试清除筛选或换个关键词。' },
  'Không giới hạn': { en: 'No limit', zh: '不限' },
  'Việc': { en: 'Job', zh: '工作' },
  'Người đăng': { en: 'Posted by', zh: '发布者' },
  'Cộng tác viên': { en: 'Collaborator', zh: '合作者' },
  'Loại việc': { en: 'Job type', zh: '工作类型' },

  // ── Chi tiết tin việc ──────────────────────────────────────────────────────
  'Không tìm thấy tin tuyển dụng': { en: 'Job posting not found', zh: '未找到招聘信息' },
  'Tin này có thể đã bị gỡ hoặc không còn tồn tại.': {
    en: 'This posting may have been removed or no longer exists.',
    zh: '该信息可能已被删除或不再存在。',
  },
  'Xác nhận ứng tuyển': { en: 'Confirm application', zh: '确认应聘' },
  'Ứng tuyển': { en: 'Apply', zh: '应聘' },
  'Ứng tuyển ngay': { en: 'Apply now', zh: '立即应聘' },
  'Đã ứng tuyển': { en: 'Applied', zh: '已应聘' },
  'Phòng chat Aladin sẽ mở để bạn trao đổi với người thuê.': {
    en: 'An Aladin chat room will open so you can talk with the hirer.',
    zh: '将打开 Aladin 聊天室，方便你与雇主沟通。',
  },

  // ── Đăng tin ───────────────────────────────────────────────────────────────
  'Thiếu thông tin': { en: 'Missing information', zh: '信息不完整' },
  'Vui lòng điền đầy đủ các ô bắt buộc.': { en: 'Please fill in all required fields.', zh: '请填写所有必填项。' },
  'Đăng tin thành công': { en: 'Posted successfully', zh: '发布成功' },
  'Chưa đăng được tin': { en: 'Could not post', zh: '发布失败' },
  'Không gửi được tin lúc này. Kiểm tra kết nối, đăng nhập PhoenixKey và loại việc rồi thử lại.': {
    en: 'Could not submit right now. Check your connection, PhoenixKey sign-in and job type, then try again.',
    zh: '当前无法提交。请检查网络、PhoenixKey 登录状态和工作类型后重试。',
  },
  'Tiêu đề công việc': { en: 'Job title', zh: '工作标题' },
  'VD: Cần thợ điện sửa đường dây tầng 2': {
    en: 'e.g. Electrician needed to fix 2nd-floor wiring',
    zh: '例如：需要电工维修二楼线路',
  },
  'Ngành nghề': { en: 'Trade', zh: '行业' },
  'Mô tả chi tiết': { en: 'Detailed description', zh: '详细描述' },
  'Mô tả công việc, dụng cụ cần, yêu cầu kỹ năng…': {
    en: 'Describe the work, tools needed, required skills…',
    zh: '描述工作内容、所需工具、技能要求…',
  },
  'Ngân sách (VND)': { en: 'Budget (VND)', zh: '预算（越南盾）' },

  // ── Hợp đồng ───────────────────────────────────────────────────────────────
  'Chưa có hợp đồng': { en: 'No contracts yet', zh: '暂无合约' },
  'Khi bạn thuê hoặc nhận việc, hợp đồng ký quỹ sẽ hiện ở đây.': {
    en: 'Escrow contracts appear here once you hire or take a job.',
    zh: '当你雇佣或接单后，托管合约会显示在这里。',
  },
  'Bạn thuê': { en: 'You hire', zh: '你雇佣' },
  'Bạn nhận': { en: 'You work', zh: '你接单' },
  'Không tìm thấy hợp đồng': { en: 'Contract not found', zh: '未找到合约' },
  'Mở tranh chấp hợp đồng này?': { en: 'Open a dispute on this contract?', zh: '对该合约发起争议？' },
  'Chế độ demo': { en: 'Demo mode', zh: '演示模式' },
  'Cần backend AladinWork để thực thi bước này.': {
    en: 'The AladinWork backend is required for this step.',
    zh: '此步骤需要 AladinWork 后端。',
  },
  'Không thực hiện được': { en: 'Could not perform the action', zh: '无法执行' },
  'Cần backend để mở phòng chat của hợp đồng.': {
    en: 'The backend is required to open the contract chat room.',
    zh: '打开合约聊天室需要后端支持。',
  },
  'Chat chưa sẵn sàng': { en: 'Chat not ready', zh: '聊天尚未就绪' },
  'ProofChat chưa được cấu hình cho hợp đồng này. Bạn có thể nối lại sau.': {
    en: 'ProofChat is not configured for this contract. You can connect it later.',
    zh: '该合约尚未配置 ProofChat，可稍后再连接。',
  },
  'Không mở được phòng chat, thử lại.': { en: 'Could not open the chat room. Try again.', zh: '无法打开聊天室，请重试。' },
  'Người thuê (Aladin)': { en: 'Hirer (Aladin)', zh: '雇主（Aladin）' },
  'Người nhận (Genie)': { en: 'Worker (Genie)', zh: '接单方（Genie）' },
  '· đã khoá': { en: '· locked', zh: '· 已锁定' },
  '· chờ': { en: '· pending', zh: '· 等待中' },

  // ── Trạng thái hợp đồng ────────────────────────────────────────────────────
  'Khởi tạo': { en: 'Created', zh: '已创建' },
  'Chờ khoá cọc': { en: 'Awaiting deposit lock', zh: '等待锁定保证金' },
  'Đã khoá cọc': { en: 'Deposit locked', zh: '保证金已锁定' },
  'Đang thực hiện': { en: 'In progress', zh: '进行中' },
  'Đã giao việc': { en: 'Delivered', zh: '已交付' },
  'Đã giải phóng': { en: 'Released', zh: '已释放' },
  'Mất cọc': { en: 'Deposit forfeited', zh: '保证金没收' },
  'Tranh chấp': { en: 'Dispute', zh: '争议' },
  'Tạm khoá': { en: 'On hold', zh: '暂时锁定' },
  'Khoá cọc': { en: 'Lock deposit', zh: '锁定保证金' },
  'Kích hoạt': { en: 'Activate', zh: '激活' },
  'Thực hiện': { en: 'Start work', zh: '开始执行' },
  'Giao việc': { en: 'Deliver', zh: '交付' },
  'Giải phóng': { en: 'Release', zh: '释放' },
  'Kích hoạt hợp đồng': { en: 'Activate the contract', zh: '激活合约' },
  'Giao việc (kèm bằng chứng)': { en: 'Deliver (with evidence)', zh: '交付（附证据）' },
  'Xác nhận đã thanh toán': { en: 'Confirm payment received', zh: '确认已付款' },
  'Giải phóng cọc': { en: 'Release the deposit', zh: '释放保证金' },
  'Tạo hợp đồng': { en: 'Create contract', zh: '创建合约' },
  'Kích hoạt — bắt đầu làm việc': { en: 'Activate — start working', zh: '激活 — 开始工作' },
  'Chưa tới bước này trong quy trình ký quỹ — tải lại rồi thử lại.': {
    en: 'The escrow flow has not reached this step — reload and try again.',
    zh: '托管流程尚未到达此步骤 — 请重新加载后重试。',
  },
  'Số dư CARP không đủ để khoá cọc.': { en: 'Not enough CARP to lock the deposit.', zh: 'CARP 余额不足以锁定保证金。' },
  'Cần đăng bằng chứng trước khi giao việc.': { en: 'Evidence must be posted before delivering.', zh: '交付前需要先提交证据。' },
  'Bạn không phải một trong hai bên của hợp đồng này.': {
    en: 'You are not a party to this contract.',
    zh: '你不是该合约的任何一方。',
  },
  'Thao tác thất bại, thử lại.': { en: 'The action failed. Try again.', zh: '操作失败，请重试。' },

  // ── Bằng chứng ─────────────────────────────────────────────────────────────
  'Chưa có mục': { en: 'No items yet', zh: '暂无条目' },
  'Thêm ít nhất 1 mục bằng chứng.': { en: 'Add at least one piece of evidence.', zh: '请至少添加 1 项证据。' },
  'Đã đăng': { en: 'Posted', zh: '已提交' },
  'Bằng chứng đã lưu. Bạn có thể quay lại giao việc.': {
    en: 'Evidence saved. You can go back and deliver.',
    zh: '证据已保存，可返回并交付。',
  },
  'Cần máy chủ AladinWork để đăng bằng chứng.': { en: 'The AladinWork server is required to post evidence.', zh: '提交证据需要 AladinWork 服务器。' },
  'Không đăng được': { en: 'Could not post', zh: '提交失败' },
  'Bằng chứng chưa đủ — thêm mô tả/liên kết cụ thể hơn.': {
    en: 'Not enough evidence — add a more specific description or link.',
    zh: '证据不足 — 请补充更具体的描述或链接。',
  },
  'Ghi chú': { en: 'Note', zh: '备注' },
  'Liên kết': { en: 'Link', zh: '链接' },
  'Mô tả việc đã làm': { en: 'Describe the work done', zh: '描述已完成的工作' },
  'bằng chứng': { en: 'evidence', zh: '证据' },

  // ── Năng lực / chứng chỉ ───────────────────────────────────────────────────
  'Thiếu mẫu': { en: 'Template missing', zh: '缺少模板' },
  'Chọn loại việc (mẫu năng lực) trước.': { en: 'Choose a job type (capability template) first.', zh: '请先选择工作类型（能力模板）。' },
  'Chưa kết nối máy chủ': { en: 'Server not connected', zh: '未连接服务器' },
  'Cần máy chủ AladinWork để khai năng lực.': { en: 'The AladinWork server is required to declare capabilities.', zh: '申报能力需要 AladinWork 服务器。' },
  'Không tạo được': { en: 'Could not create', zh: '创建失败' },
  'Chỉ số chưa hợp lệ theo mẫu — kiểm tra lại.': { en: 'The values do not match the template — check them.', zh: '指标不符合模板要求 — 请检查。' },
  'Chưa đạt': { en: 'Not passed', zh: '未通过' },
  'VeData chưa duyệt chứng chỉ này. Xem lại chỉ số/bằng chứng.': {
    en: 'VeData has not approved this credential. Review the values/evidence.',
    zh: 'VeData 尚未批准该凭证，请检查指标/证据。',
  },
  'Cần máy chủ để xác minh.': { en: 'A server is required to verify.', zh: '验证需要服务器。' },
  'Không xác minh được': { en: 'Could not verify', zh: '无法验证' },
  'Chưa có mẫu việc': { en: 'No job templates yet', zh: '暂无工作模板' },
  'Danh sách mẫu cần máy chủ AladinWork.': { en: 'The template list requires the AladinWork server.', zh: '模板列表需要 AladinWork 服务器。' },
  'Máy chủ chưa khai mẫu nào.': { en: 'The server has not declared any templates.', zh: '服务器尚未声明任何模板。' },
  '✓ Đã xác minh': { en: '✓ Verified', zh: '✓ 已验证' },
  '⏳ Chờ xác minh': { en: '⏳ Awaiting verification', zh: '⏳ 等待验证' },

  // ── Chào dịch vụ ───────────────────────────────────────────────────────────
  'Tại chỗ': { en: 'On site', zh: '现场' },
  'Cả hai': { en: 'Both', zh: '两者皆可' },
  'Chọn loại dịch vụ (mẫu việc) trước.': { en: 'Choose a service type (job template) first.', zh: '请先选择服务类型（工作模板）。' },
  'Đã chào dịch vụ': { en: 'Service offered', zh: '服务已上架' },
  'Dịch vụ của bạn đã lên chợ.': { en: 'Your service is now on the marketplace.', zh: '你的服务已上架市场。' },
  'Cần máy chủ AladinWork để chào dịch vụ. Thử lại khi dịch vụ sống.': {
    en: 'The AladinWork server is required to offer a service. Try again when it is up.',
    zh: '上架服务需要 AladinWork 服务器，请在服务可用时重试。',
  },
  'Dữ liệu chưa hợp lệ — kiểm tra lại giá / các trường theo mẫu.': {
    en: 'Invalid data — check the price and the template fields.',
    zh: '数据无效 — 请检查价格和模板字段。',
  },
  'Danh sách mẫu dịch vụ cần máy chủ AladinWork.': {
    en: 'The service template list requires the AladinWork server.',
    zh: '服务模板列表需要 AladinWork 服务器。',
  },
  'Máy chủ chưa khai mẫu việc nào.': { en: 'The server has not declared any job templates.', zh: '服务器尚未声明任何工作模板。' },
  'Tên dịch vụ': { en: 'Service name', zh: '服务名称' },
  'Giá tối thiểu (VND)': { en: 'Minimum price (VND)', zh: '最低价格（越南盾）' },
  'Bán kính phục vụ (km)': { en: 'Service radius (km)', zh: '服务半径（公里）' },
  'Lịch làm việc': { en: 'Working hours', zh: '工作时间' },
  'vd T2–T6, 8h–17h': { en: 'e.g. Mon–Fri, 8am–5pm', zh: '例如：周一至周五 8:00–17:00' },
  'Mô tả': { en: 'Description', zh: '描述' },
  'Giới thiệu ngắn về dịch vụ của bạn': { en: 'A short introduction to your service', zh: '简要介绍你的服务' },

  // ── Lịch rảnh ──────────────────────────────────────────────────────────────
  'Đã khai': { en: 'Declared', zh: '已申报' },
  'Không lưu được lịch, thử lại.': { en: 'Could not save the schedule. Try again.', zh: '无法保存日程，请重试。' },
  'Ngừng nhận việc': { en: 'Stop taking jobs', zh: '停止接单' },
  'Bạn sẽ không hiện trong danh sách ứng viên rảnh cho tới khi khai lại.': {
    en: 'You will not appear in the available-candidate list until you declare again.',
    zh: '在重新申报前，你不会出现在空闲候选人列表中。',
  },
  'Đang nhận việc': { en: 'Taking jobs', zh: '接单中' },
  'Chưa khai — không nhận việc': { en: 'Not declared — not taking jobs', zh: '未申报 — 不接单' },

  // ── Ghép việc ──────────────────────────────────────────────────────────────
  'Chưa thuê được': { en: 'Could not hire', zh: '雇佣失败' },
  'Cần máy chủ AladinWork để tạo hợp đồng. Thử lại khi dịch vụ sống.': {
    en: 'The AladinWork server is required to create a contract. Try again when it is up.',
    zh: '创建合约需要 AladinWork 服务器，请在服务可用时重试。',
  },
  'Đã có hợp đồng với ứng viên này cho tin việc.': {
    en: 'A contract with this candidate already exists for this posting.',
    zh: '该职位已与此候选人签有合约。',
  },
  'Chưa có ứng viên đạt yêu cầu': { en: 'No qualifying candidates yet', zh: '暂无符合条件的候选人' },
  'Thử nới yêu cầu năng lực hoặc mở rộng khu vực để tăng số ứng viên khớp.': {
    en: 'Try relaxing the capability requirements or widening the area to match more candidates.',
    zh: '可放宽能力要求或扩大区域，以匹配更多候选人。',
  },
  'Đạt năng lực': { en: 'Qualified', zh: '能力达标' },
  'Đang rảnh': { en: 'Available', zh: '空闲' },
  'Bận': { en: 'Busy', zh: '忙碌' },
  'Thuê ứng viên này': { en: 'Hire this candidate', zh: '雇佣该候选人' },
  'Chưa đủ điều kiện': { en: 'Not eligible yet', zh: '尚不符合条件' },
  'Chưa đặt được': { en: 'Could not book', zh: '预约失败' },
  'Chưa có thợ trong danh bạ': { en: 'No workers in the directory yet', zh: '通讯录中暂无师傅' },
  'Danh bạ thợ cần máy chủ AladinWork. Sẽ hiện khi dịch vụ sống.': {
    en: 'The worker directory requires the AladinWork server. It will appear once the service is up.',
    zh: '师傅通讯录需要 AladinWork 服务器，服务可用后即会显示。',
  },
  'Chưa có ai chào năng lực (chứng chỉ / dịch vụ / lịch rảnh). Quay lại sau.': {
    en: 'Nobody has declared capabilities yet (credentials / services / availability). Check back later.',
    zh: '目前还没有人申报能力（凭证 / 服务 / 空闲时间），请稍后再来。',
  },

  // ── Hồ sơ thợ ──────────────────────────────────────────────────────────────
  'việc hoàn thành': { en: 'jobs completed', zh: '已完成工作' },
  'năm kinh nghiệm': { en: 'years of experience', zh: '年经验' },
  'Đánh giá': { en: 'Reviews', zh: '评价' },
  'Kỹ năng': { en: 'Skills', zh: '技能' },
  'CMND/CCCD đã xác thực': { en: 'ID card verified', zh: '身份证已验证' },
  'Đã xác thực sinh trắc qua PhoenixKey': { en: 'Biometrics verified via PhoenixKey', zh: '已通过 PhoenixKey 验证生物识别' },
  'Chứng chỉ nghề (đã upload)': { en: 'Trade certificate (uploaded)', zh: '职业证书（已上传）' },

  // ── Ký phiên làm việc ──────────────────────────────────────────────────────
  'Đăng nhập Aladin Work': { en: 'Sign in to Aladin Work', zh: '登录 Aladin Work' },
  'Ký bằng khoá phần cứng để mở phiên làm việc': {
    en: 'Sign with the hardware key to open a work session',
    zh: '使用硬件密钥签名以开启工作会话',
  },
};
