// i18n/phrases/chat.ts — ProofChat, ví/ký quỹ trong chat, Kết đèn (LampNet), Pool.
//
// CỐ Ý KHÔNG dịch: nội dung tin nhắn mẫu và tên người trong dữ liệu demo — đó là
// nội dung/tên riêng, không phải nhãn giao diện.

import type { PhraseMap } from '../types';

export const CHAT: PhraseMap = {
  // ── Danh sách phòng ────────────────────────────────────────────────────────
  'Cuộc trò chuyện': { en: 'Conversations', zh: '会话' },
  'Phòng': { en: 'Rooms', zh: '房间' },
  'Chưa đọc': { en: 'Unread', zh: '未读' },
  'Có ký quỹ': { en: 'With escrow', zh: '含托管' },
  'Tìm phòng theo tên, công việc…': { en: 'Search rooms by name or job…', zh: '按名称或工作搜索房间…' },
  'Không tìm thấy phòng nào': { en: 'No rooms found', zh: '未找到房间' },
  'Chưa có cuộc trò chuyện': { en: 'No conversations yet', zh: '暂无会话' },
  'Thử từ khóa khác hoặc xóa bộ lọc.': { en: 'Try a different keyword or clear the filters.', zh: '请换个关键词或清除筛选。' },
  'Tất cả tin nhắn đã được đọc.': { en: 'All messages have been read.', zh: '所有消息均已读。' },
  'Tất cả tin nhắn đã được đọc 🎉': { en: 'All messages have been read 🎉', zh: '所有消息均已读 🎉' },
  'Chưa có job nào có ký quỹ.': { en: 'No jobs with escrow yet.', zh: '暂无含托管的工作。' },
  'Khi bạn tạo job hoặc nhận job, phòng chat sẽ xuất hiện ở đây.': {
    en: 'Chat rooms appear here once you create or take a job.',
    zh: '当你创建或接受工作后，聊天室会显示在这里。',
  },
  'Không tải được danh sách trò chuyện. Kéo để thử lại.': {
    en: 'Could not load conversations. Pull to retry.',
    zh: '无法加载会话列表，下拉重试。',
  },

  // ── Tạo / tham gia phòng ───────────────────────────────────────────────────
  'Đã tạo cuộc trò chuyện': { en: 'Conversation created', zh: '会话已创建' },
  'Chưa chọn thành viên': { en: 'No members selected', zh: '未选择成员' },
  'Cần ít nhất 1 người để tạo nhóm.': { en: 'At least one person is needed to create a group.', zh: '创建群组至少需要 1 人。' },
  'Trò chuyện riêng chỉ 1 người': { en: 'A direct chat holds only one person', zh: '私聊仅限 1 人' },
  'Bỏ bớt người, hoặc đổi sang Nhóm để thêm nhiều thành viên.': {
    en: 'Remove people, or switch to Group to add more members.',
    zh: '请移除部分成员，或切换为群组以添加更多成员。',
  },
  'Đang tạo nhóm…': { en: 'Creating the group…', zh: '正在创建群组…' },
  'Đã tạo nhóm — chưa mời được ai': { en: 'Group created — nobody invited yet', zh: '群组已创建 — 尚未邀请任何人' },
  'Mạng yếu nên lời mời chưa gửi đi. App sẽ tự gửi lại khi mở chat lúc có mạng.': {
    en: 'The invitations were not sent because of a weak network. The app resends them next time you open chat online.',
    zh: '网络较弱，邀请未发出。下次联网打开聊天时应用会自动重发。',
  },
  'Đã tạo nhóm': { en: 'Group created', zh: '群组已创建' },
  'Tạo nhóm thất bại': { en: 'Group creation failed', zh: '创建群组失败' },
  'Đã tham gia phòng': { en: 'Joined the room', zh: '已加入房间' },
  'Đã gửi yêu cầu tham gia': { en: 'Join request sent', zh: '加入请求已发送' },
  'Yêu cầu sẽ chờ admin của phòng phê duyệt.': { en: 'The request awaits approval by the room admin.', zh: '请求需等待房间管理员批准。' },
  'Đã chấp nhận lời mời.': { en: 'Invitation accepted.', zh: '已接受邀请。' },
  'Đã từ chối lời mời': { en: 'Invitation declined', zh: '已拒绝邀请' },
  'Đã tham gia': { en: 'Joined', zh: '已加入' },
  'Đã từ chối': { en: 'Declined', zh: '已拒绝' },
  'Không có lời mời mới': { en: 'No new invitations', zh: '没有新邀请' },
  'Vui lòng nhập tiêu đề.': { en: 'Please enter a title.', zh: '请输入标题。' },
  'URL avatar không hợp lệ.': { en: 'Invalid avatar URL.', zh: '头像链接无效。' },
  'Chọn ít nhất 1 thành viên.': { en: 'Select at least one member.', zh: '请至少选择 1 名成员。' },
  'Tiêu đề': { en: 'Title', zh: '标题' },
  'VD: Đội kỹ thuật - sửa máy giặt LG': { en: 'e.g. Tech team – LG washing machine repair', zh: '例如：技术组 – 维修 LG 洗衣机' },
  'Tùy chọn — dán đường dẫn ảnh đại diện.': { en: 'Optional — paste an avatar image URL.', zh: '可选 — 粘贴头像图片链接。' },
  'Thành viên': { en: 'Members', zh: '成员' },
  'Tìm theo DID hoặc tên người dùng để thêm vào nhóm.': {
    en: 'Search by DID or username to add to the group.',
    zh: '按 DID 或用户名搜索以添加到群组。',
  },
  'did:phoenix:… hoặc tên': { en: 'did:phoenix:… or a name', zh: 'did:phoenix:… 或名称' },
  'Vui lòng nhập ID cuộc trò chuyện.': { en: 'Please enter the conversation ID.', zh: '请输入会话 ID。' },
  'ID quá ngắn.': { en: 'The ID is too short.', zh: 'ID 太短。' },
  'Phòng công khai · sẽ tham gia ngay': { en: 'Public room · you join immediately', zh: '公开房间 · 立即加入' },
  'Phòng riêng tư · cần admin duyệt': { en: 'Private room · admin approval required', zh: '私密房间 · 需管理员批准' },
  'Tùy chọn — chỉ dùng khi cần admin duyệt': { en: 'Optional — only used when admin approval is needed', zh: '可选 — 仅在需要管理员批准时使用' },

  // ── Loại phòng ─────────────────────────────────────────────────────────────
  'Tin nhắn trực tiếp': { en: 'Direct message', zh: '私聊' },
  '1-1 giữa bạn và một người': { en: 'One-to-one between you and one person', zh: '你与一个人的一对一聊天' },
  'Nhóm': { en: 'Group', zh: '群组' },
  'Nhiều thành viên cùng trao đổi': { en: 'Many members talking together', zh: '多名成员共同交流' },
  'Chủ đề': { en: 'Topic', zh: '话题' },
  'Trao đổi theo một chủ đề cụ thể': { en: 'Discussion on one specific topic', zh: '围绕特定话题的讨论' },
  'Đàm phán công việc': { en: 'Job negotiation', zh: '工作洽谈' },
  'Thoả thuận điều khoản cho một job': { en: 'Agreeing terms for a job', zh: '就某项工作达成条款' },

  // ── Màn chat ───────────────────────────────────────────────────────────────
  'Nhắn tin…': { en: 'Type a message…', zh: '输入消息…' },
  'Không gửi được': { en: 'Could not send', zh: '发送失败' },
  'Vui lòng thử lại.': { en: 'Please try again.', zh: '请重试。' },
  'Mất kết nối, thử lại.': { en: 'Connection lost. Try again.', zh: '连接中断，请重试。' },
  'Tin nhắn đã giải mã thành công.': { en: 'Message decrypted successfully.', zh: '消息解密成功。' },
  'Chưa có tin nhắn': { en: 'No messages yet', zh: '暂无消息' },
  'Hãy gửi tin nhắn đầu tiên để bắt đầu trao đổi.': { en: 'Send the first message to start the conversation.', zh: '发送第一条消息以开始交流。' },
  'Tin nhắn được mã hóa': { en: 'Message is encrypted', zh: '消息已加密' },
  'mã hóa': { en: 'encrypted', zh: '已加密' },
  'Đã mã hóa': { en: 'Encrypted', zh: '已加密' },
  'Phiên đã hết hạn': { en: 'Session expired', zh: '会话已过期' },

  // ── Vòng đời tin nhắn ──────────────────────────────────────────────────────
  'Đang mã hóa…': { en: 'Encrypting…', zh: '加密中…' },
  'Đang ký…': { en: 'Signing…', zh: '签名中…' },
  'Đang giải mã…': { en: 'Decrypting…', zh: '解密中…' },
  'Đang xác thực chữ ký…': { en: 'Verifying the signature…', zh: '正在验证签名…' },
  'Đang kiểm tra tính toàn vẹn…': { en: 'Checking integrity…', zh: '正在校验完整性…' },
  'Đang soạn': { en: 'Composing', zh: '编辑中' },
  'Mã hóa': { en: 'Encryption', zh: '加密' },
  'Ký số': { en: 'Digital signature', zh: '数字签名' },
  'Chờ đồng bộ': { en: 'Waiting to sync', zh: '等待同步' },
  'Đã chuyển': { en: 'Delivered', zh: '已送达' },
  'Gửi thất bại': { en: 'Send failed', zh: '发送失败' },
  'Giải mã': { en: 'Decryption', zh: '解密' },
  'Xác thực chữ ký': { en: 'Signature verification', zh: '签名验证' },
  'Kiểm tra toàn vẹn': { en: 'Integrity check', zh: '完整性校验' },

  // ── Ví / ký quỹ trong chat ─────────────────────────────────────────────────
  'Khóa ký quỹ': { en: 'Lock escrow', zh: '锁定托管' },
  'Giải ngân ký quỹ': { en: 'Release escrow', zh: '释放托管' },
  'Hoàn ký quỹ': { en: 'Refund escrow', zh: '退还托管' },
  'Chờ nạp': { en: 'Awaiting funding', zh: '待充值' },
  'Đang khóa': { en: 'Locked', zh: '锁定中' },
  'Đã chi': { en: 'Paid out', zh: '已支付' },
  'Đang giải ngân…': { en: 'Releasing…', zh: '正在释放…' },
  'Approve — Xác nhận hoàn thành': { en: 'Approve — confirm completion', zh: 'Approve — 确认完成' },
  'Cancel — Hủy ký quỹ': { en: 'Cancel — cancel the escrow', zh: 'Cancel — 取消托管' },
  'Tạo & Pending': { en: 'Created & pending', zh: '已创建并待处理' },
  'Nạp tiền (Locked)': { en: 'Funded (locked)', zh: '已充值（锁定）' },
  'Giải ngân (Released)': { en: 'Released', zh: '已释放' },
  'Phí giao dịch': { en: 'Transaction fee', zh: '交易手续费' },
  'Nạp từ ví ngoài': { en: 'Top-up from an external wallet', zh: '从外部钱包充值' },

  // ── Kết đèn (LampNet) ──────────────────────────────────────────────────────
  'Nhẹ nhàng': { en: 'Light', zh: '轻度' },
  'Ít ảnh hưởng pin & máy — góp khi rảnh.': {
    en: 'Minimal battery and device impact — contributes when idle.',
    zh: '对电池和设备影响很小 — 空闲时贡献。',
  },
  'Cân bằng': { en: 'Balanced', zh: '均衡' },
  'Góp đều, máy vẫn mượt cho việc hằng ngày.': {
    en: 'Steady contribution, the device stays smooth for daily use.',
    zh: '稳定贡献，日常使用依然流畅。',
  },
  'Tối đa': { en: 'Maximum', zh: '最大' },
  'Góp nhiều nhất — nên cắm sạc & dùng Wi-Fi.': {
    en: 'Highest contribution — keep it plugged in and on Wi-Fi.',
    zh: '贡献最多 — 建议连接充电器并使用 Wi-Fi。',
  },
  'Mất kết nối tới mạng LampNet.': { en: 'Lost connection to the LampNet network.', zh: '与 LampNet 网络的连接已断开。' },
  'Chưa đủ quyền hoặc chưa đủ bậc tham gia.': {
    en: 'Insufficient permission or participation tier.',
    zh: '权限不足或参与等级不够。',
  },
  'Daemon LampNet đang trục trặc.': { en: 'The LampNet daemon is having trouble.', zh: 'LampNet 守护进程出现故障。' },
  'Chưa tải được trạng thái node': { en: 'Could not load node status', zh: '无法加载节点状态' },
  'Daemon LampNet đang bận hoặc chưa phản hồi. Vui lòng thử lại.': {
    en: 'The LampNet daemon is busy or not responding. Please try again.',
    zh: 'LampNet 守护进程繁忙或无响应，请重试。',
  },
  'Chưa đóng góp': { en: 'Not contributing', zh: '未贡献' },
  "Máy bạn chưa tham gia mạng. Vào 'Kết đèn' để bắt đầu góp sức.": {
    en: 'Your device has not joined the network. Open “Connect” to start contributing.',
    zh: '你的设备尚未加入网络。请打开“连灯”开始贡献。',
  },
  'Việc đang chạy': { en: 'Running tasks', zh: '进行中的任务' },
  'Việc đã kiểm chứng': { en: 'Verified tasks', zh: '已验证的任务' },
  'Chưa có việc nào đang chạy. Mạng sẽ tự giao việc khi có nhu cầu.': {
    en: 'No tasks running. The network assigns work automatically when needed.',
    zh: '当前没有运行中的任务。网络会在有需求时自动分配。',
  },
  'Chưa tham gia được': { en: 'Could not join', zh: '无法加入' },
  'Mạng đang trục trặc': { en: 'The network is having trouble', zh: '网络出现故障' },
  'Cần danh tính PhoenixKey và ví nhận thưởng hợp lệ, hoặc chưa đủ bậc tham gia.': {
    en: 'A PhoenixKey identity and a valid reward wallet are required, or your participation tier is too low.',
    zh: '需要 PhoenixKey 身份和有效的奖励钱包，或参与等级不足。',
  },
  'Daemon LampNet đang bận. Vui lòng thử lại sau ít phút.': {
    en: 'The LampNet daemon is busy. Please try again in a few minutes.',
    zh: 'LampNet 守护进程繁忙，请几分钟后重试。',
  },
  'Đang đóng góp': { en: 'Contributing', zh: '贡献中' },
  'Đang kết đèn…': { en: 'Connecting…', zh: '连灯中…' },
  'Kết đèn — Tham gia ngay': { en: 'Connect — join now', zh: '连灯 — 立即参与' },

  // ── Pool ───────────────────────────────────────────────────────────────────
  'Mất kết nối tới máy chủ Pool.': { en: 'Lost connection to the Pool server.', zh: '与矿池服务器的连接已断开。' },
  'Chưa đủ quyền xem/uỷ quyền Pool.': { en: 'Not enough permission to view/delegate to the Pool.', zh: '没有查看/委托矿池的权限。' },
  'Máy chủ Pool đang trục trặc.': { en: 'The Pool server is having trouble.', zh: '矿池服务器出现故障。' },
  'Uỷ quyền chưa nối ví ký — đang chờ hợp đồng ví + endpoint Pool.': {
    en: 'Delegation is not wired to a signing wallet yet — awaiting the wallet contract and Pool endpoint.',
    zh: '委托尚未接入签名钱包 — 等待钱包合约与矿池接口。',
  },
};
