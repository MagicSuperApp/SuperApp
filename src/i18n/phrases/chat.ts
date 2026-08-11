// i18n/phrases/chat.ts — ProofChat, ví/ký quỹ trong chat, Kết đèn (LampNet), Pool.
//
// CỐ Ý KHÔNG dịch: nội dung tin nhắn mẫu và tên người trong dữ liệu demo — đó là
// nội dung/tên riêng, không phải nhãn giao diện.

import type { PhraseMap } from '../types';

export const CHAT: PhraseMap = {
  // ── Danh sách phòng ────────────────────────────────────────────────────────
  'Cuộc trò chuyện': { en: 'Conversations', zh: '会话', ja: '会話' },
  'Phòng': { en: 'Rooms', zh: '房间', ja: 'ルーム' },
  'Chưa đọc': { en: 'Unread', zh: '未读', ja: '未読' },
  'Có ký quỹ': { en: 'With escrow', zh: '含托管', ja: 'エスクローあり' },
  'Tìm phòng theo tên, công việc…': { en: 'Search rooms by name or job…', zh: '按名称或工作搜索房间…', ja: '名前や仕事でルームを検索…' },
  'Không tìm thấy phòng nào': { en: 'No rooms found', zh: '未找到房间', ja: 'ルームが見つかりません' },
  'Chưa có cuộc trò chuyện': { en: 'No conversations yet', zh: '暂无会话', ja: '会話はまだありません' },
  'Thử từ khóa khác hoặc xóa bộ lọc.': { en: 'Try a different keyword or clear the filters.', zh: '请换个关键词或清除筛选。', ja: '別のキーワードを試すか、フィルターを解除してください。' },
  'Tất cả tin nhắn đã được đọc.': { en: 'All messages have been read.', zh: '所有消息均已读。', ja: 'すべてのメッセージを読み終えました。' },
  'Tất cả tin nhắn đã được đọc 🎉': { en: 'All messages have been read 🎉', zh: '所有消息均已读 🎉', ja: 'すべてのメッセージを読み終えました 🎉' },
  'Chưa có job nào có ký quỹ.': { en: 'No jobs with escrow yet.', zh: '暂无含托管的工作。', ja: 'エスクロー付きの仕事はまだありません。' },
  'Khi bạn tạo job hoặc nhận job, phòng chat sẽ xuất hiện ở đây.': {
    en: 'Chat rooms appear here once you create or take a job.',
    zh: '当你创建或接受工作后，聊天室会显示在这里。',
    ja: '仕事を作成または受注すると、チャットルームがここに表示されます。',
  },
  'Không tải được danh sách trò chuyện. Kéo để thử lại.': {
    en: 'Could not load conversations. Pull to retry.',
    zh: '无法加载会话列表，下拉重试。',
    ja: '会話一覧を読み込めません。引っ張って再試行してください。',
  },

  // ── Tạo / tham gia phòng ───────────────────────────────────────────────────
  'Đã tạo cuộc trò chuyện': { en: 'Conversation created', zh: '会话已创建', ja: '会話を作成しました' },
  'Chưa chọn thành viên': { en: 'No members selected', zh: '未选择成员', ja: 'メンバーが未選択です' },
  'Cần ít nhất 1 người để tạo nhóm.': { en: 'At least one person is needed to create a group.', zh: '创建群组至少需要 1 人。', ja: 'グループの作成には 1 名以上が必要です。' },
  'Trò chuyện riêng chỉ 1 người': { en: 'A direct chat holds only one person', zh: '私聊仅限 1 人', ja: '個別チャットは 1 名のみです' },
  'Bỏ bớt người, hoặc đổi sang Nhóm để thêm nhiều thành viên.': {
    en: 'Remove people, or switch to Group to add more members.',
    zh: '请移除部分成员，或切换为群组以添加更多成员。',
    ja: '人数を減らすか、グループに切り替えて多くのメンバーを追加してください。',
  },
  'Đang tạo nhóm…': { en: 'Creating the group…', zh: '正在创建群组…', ja: 'グループを作成中…' },
  'Đã tạo nhóm — chưa mời được ai': { en: 'Group created — nobody invited yet', zh: '群组已创建 — 尚未邀请任何人', ja: 'グループを作成しました — まだ誰も招待できていません' },
  'Mạng yếu nên lời mời chưa gửi đi. App sẽ tự gửi lại khi mở chat lúc có mạng.': {
    en: 'The invitations were not sent because of a weak network. The app resends them next time you open chat online.',
    zh: '网络较弱，邀请未发出。下次联网打开聊天时应用会自动重发。',
    ja: '電波が弱く招待を送れませんでした。次に通信できる状態でチャットを開いたとき、自動で再送します。',
  },
  'Đã tạo nhóm': { en: 'Group created', zh: '群组已创建', ja: 'グループを作成しました' },
  'Tạo nhóm thất bại': { en: 'Group creation failed', zh: '创建群组失败', ja: 'グループの作成に失敗しました' },
  'Đã tham gia phòng': { en: 'Joined the room', zh: '已加入房间', ja: 'ルームに参加しました' },
  'Đã gửi yêu cầu tham gia': { en: 'Join request sent', zh: '加入请求已发送', ja: '参加リクエストを送信しました' },
  'Yêu cầu sẽ chờ admin của phòng phê duyệt.': { en: 'The request awaits approval by the room admin.', zh: '请求需等待房间管理员批准。', ja: 'リクエストはルーム管理者の承認待ちになります。' },
  'Đã chấp nhận lời mời.': { en: 'Invitation accepted.', zh: '已接受邀请。', ja: '招待を承認しました。' },
  'Đã từ chối lời mời': { en: 'Invitation declined', zh: '已拒绝邀请', ja: '招待を辞退しました' },
  'Đã tham gia': { en: 'Joined', zh: '已加入', ja: '参加済み' },
  'Đã từ chối': { en: 'Declined', zh: '已拒绝', ja: '辞退しました' },
  'Không có lời mời mới': { en: 'No new invitations', zh: '没有新邀请', ja: '新しい招待はありません' },
  'Vui lòng nhập tiêu đề.': { en: 'Please enter a title.', zh: '请输入标题。', ja: 'タイトルを入力してください。' },
  'URL avatar không hợp lệ.': { en: 'Invalid avatar URL.', zh: '头像链接无效。', ja: 'アイコン画像の URL が正しくありません。' },
  'Chọn ít nhất 1 thành viên.': { en: 'Select at least one member.', zh: '请至少选择 1 名成员。', ja: 'メンバーを 1 名以上選んでください。' },
  'Tiêu đề': { en: 'Title', zh: '标题', ja: 'タイトル' },
  'VD: Đội kỹ thuật - sửa máy giặt LG': { en: 'e.g. Tech team – LG washing machine repair', zh: '例如：技术组 – 维修 LG 洗衣机', ja: '例：技術チーム – LG 洗濯機の修理' },
  'Tùy chọn — dán đường dẫn ảnh đại diện.': { en: 'Optional — paste an avatar image URL.', zh: '可选 — 粘贴头像图片链接。', ja: '任意 — アイコン画像の URL を貼り付けてください。' },
  'Thành viên': { en: 'Members', zh: '成员', ja: 'メンバー' },
  'Tìm theo mã định danh hoặc tên người dùng để thêm vào nhóm.': {
    en: 'Search by identifier or username to add people to the group.',
    zh: '按标识码或用户名搜索以添加到群组。',
    ja: '識別子またはユーザー名で検索してグループに追加します。',
  },
  'did:phoenix:… hoặc tên': { en: 'did:phoenix:… or a name', zh: 'did:phoenix:… 或名称', ja: 'did:phoenix:… または名前' },
  'Vui lòng nhập ID cuộc trò chuyện.': { en: 'Please enter the conversation ID.', zh: '请输入会话 ID。', ja: '会話 ID を入力してください。' },
  'ID quá ngắn.': { en: 'The ID is too short.', zh: 'ID 太短。', ja: 'ID が短すぎます。' },
  'Phòng công khai · sẽ tham gia ngay': { en: 'Public room · you join immediately', zh: '公开房间 · 立即加入', ja: '公開ルーム · すぐに参加できます' },
  'Phòng riêng tư · cần admin duyệt': { en: 'Private room · admin approval required', zh: '私密房间 · 需管理员批准', ja: '非公開ルーム · 管理者の承認が必要です' },
  'Tùy chọn — chỉ dùng khi cần admin duyệt': { en: 'Optional — only used when admin approval is needed', zh: '可选 — 仅在需要管理员批准时使用', ja: '任意 — 管理者の承認が必要なときだけ使います' },

  // ── Loại phòng ─────────────────────────────────────────────────────────────
  'Tin nhắn trực tiếp': { en: 'Direct message', zh: '私聊', ja: 'ダイレクトメッセージ' },
  '1-1 giữa bạn và một người': { en: 'One-to-one between you and one person', zh: '你与一个人的一对一聊天', ja: 'あなたと相手の 1 対 1' },
  'Nhóm': { en: 'Group', zh: '群组', ja: 'グループ' },
  'Nhiều thành viên cùng trao đổi': { en: 'Many members talking together', zh: '多名成员共同交流', ja: '複数のメンバーで話し合います' },
  'Chủ đề': { en: 'Topic', zh: '话题', ja: 'トピック' },
  'Trao đổi theo một chủ đề cụ thể': { en: 'Discussion on one specific topic', zh: '围绕特定话题的讨论', ja: '特定のテーマについて話し合います' },
  'Đàm phán công việc': { en: 'Job negotiation', zh: '工作洽谈', ja: '仕事の交渉' },
  'Thoả thuận điều khoản cho một job': { en: 'Agreeing terms for a job', zh: '就某项工作达成条款', ja: 'ひとつの仕事について条件を取り決めます' },

  // ── Màn chat ───────────────────────────────────────────────────────────────
  'Nhắn tin…': { en: 'Type a message…', zh: '输入消息…', ja: 'メッセージを入力…' },
  'Không gửi được': { en: 'Could not send', zh: '发送失败', ja: '送信できません' },
  'Vui lòng thử lại.': { en: 'Please try again.', zh: '请重试。', ja: 'もう一度お試しください。' },
  'Mất kết nối, thử lại.': { en: 'Connection lost. Try again.', zh: '连接中断，请重试。', ja: '接続が切れました。もう一度お試しください。' },
  'Tin nhắn đã giải mã thành công.': { en: 'Message decrypted successfully.', zh: '消息解密成功。', ja: 'メッセージを復号しました。' },
  'Chưa có tin nhắn': { en: 'No messages yet', zh: '暂无消息', ja: 'メッセージはまだありません' },
  'Hãy gửi tin nhắn đầu tiên để bắt đầu trao đổi.': { en: 'Send the first message to start the conversation.', zh: '发送第一条消息以开始交流。', ja: '最初のメッセージを送って会話を始めましょう。' },
  'Tin nhắn được mã hóa': { en: 'Message is encrypted', zh: '消息已加密', ja: 'メッセージは暗号化されています' },
  'mã hóa': { en: 'encrypted', zh: '已加密', ja: '暗号化済み' },
  'Đã mã hóa': { en: 'Encrypted', zh: '已加密', ja: '暗号化済み' },
  'Phiên đã hết hạn': { en: 'Session expired', zh: '会话已过期', ja: 'セッションの有効期限が切れました' },

  // ── Vòng đời tin nhắn ──────────────────────────────────────────────────────
  'Đang mã hóa…': { en: 'Encrypting…', zh: '加密中…', ja: '暗号化中…' },
  'Đang ký…': { en: 'Signing…', zh: '签名中…', ja: '署名中…' },
  'Đang giải mã…': { en: 'Decrypting…', zh: '解密中…', ja: '復号中…' },
  'Đang xác thực chữ ký…': { en: 'Verifying the signature…', zh: '正在验证签名…', ja: '署名を検証中…' },
  'Đang kiểm tra tính toàn vẹn…': { en: 'Checking integrity…', zh: '正在校验完整性…', ja: '整合性を確認中…' },
  'Đang soạn': { en: 'Composing', zh: '编辑中', ja: '作成中' },
  'Mã hóa': { en: 'Encryption', zh: '加密', ja: '暗号化' },
  'Ký số': { en: 'Digital signature', zh: '数字签名', ja: '電子署名' },
  'Chờ đồng bộ': { en: 'Waiting to sync', zh: '等待同步', ja: '同期待ち' },
  'Đã chuyển': { en: 'Delivered', zh: '已送达', ja: '配信済み' },
  'Gửi thất bại': { en: 'Send failed', zh: '发送失败', ja: '送信に失敗しました' },
  'Giải mã': { en: 'Decryption', zh: '解密', ja: '復号' },
  'Xác thực chữ ký': { en: 'Signature verification', zh: '签名验证', ja: '署名の検証' },
  'Kiểm tra toàn vẹn': { en: 'Integrity check', zh: '完整性校验', ja: '整合性チェック' },

  // ── Ví / ký quỹ trong chat ─────────────────────────────────────────────────
  'Khóa ký quỹ': { en: 'Lock escrow', zh: '锁定托管', ja: 'エスクローをロック' },
  'Giải ngân ký quỹ': { en: 'Release escrow', zh: '释放托管', ja: 'エスクローを解放' },
  'Hoàn ký quỹ': { en: 'Refund escrow', zh: '退还托管', ja: 'エスクローを返金' },
  'Chờ nạp': { en: 'Awaiting funding', zh: '待充值', ja: '入金待ち' },
  'Đang khóa': { en: 'Locked', zh: '锁定中', ja: 'ロック中' },
  'Đã chi': { en: 'Paid out', zh: '已支付', ja: '支払い済み' },
  'Đang giải ngân…': { en: 'Releasing…', zh: '正在释放…', ja: '解放中…' },
  'Approve — Xác nhận hoàn thành': { en: 'Approve — confirm completion', zh: 'Approve — 确认完成', ja: 'Approve — 完了を確認' },
  'Cancel — Hủy ký quỹ': { en: 'Cancel — cancel the escrow', zh: 'Cancel — 取消托管', ja: 'Cancel — エスクローを取り消す' },
  'Tạo & Pending': { en: 'Created & pending', zh: '已创建并待处理', ja: '作成済み・保留中' },
  'Nạp tiền (Locked)': { en: 'Funded (locked)', zh: '已充值（锁定）', ja: '入金済み（ロック）' },
  'Giải ngân (Released)': { en: 'Released', zh: '已释放', ja: '解放済み' },
  'Phí giao dịch': { en: 'Transaction fee', zh: '交易手续费', ja: '取引手数料' },
  'Nạp từ ví ngoài': { en: 'Top-up from an external wallet', zh: '从外部钱包充值', ja: '外部ウォレットから入金' },

  // ── Kết đèn (LampNet) ──────────────────────────────────────────────────────
  'Nhẹ nhàng': { en: 'Light', zh: '轻度', ja: '軽め' },
  'Ít ảnh hưởng pin & máy — góp khi rảnh.': {
    en: 'Minimal battery and device impact — contributes when idle.',
    zh: '对电池和设备影响很小 — 空闲时贡献。',
    ja: '電池や動作への影響は小さく、空いているときに貢献します。',
  },
  'Cân bằng': { en: 'Balanced', zh: '均衡', ja: 'バランス' },
  'Góp đều, máy vẫn mượt cho việc hằng ngày.': {
    en: 'Steady contribution, the device stays smooth for daily use.',
    zh: '稳定贡献，日常使用依然流畅。',
    ja: '安定して貢献しつつ、普段の操作も快適なままです。',
  },
  'Tối đa': { en: 'Maximum', zh: '最大', ja: '最大' },
  'Góp nhiều nhất — nên cắm sạc & dùng Wi-Fi.': {
    en: 'Highest contribution — keep it plugged in and on Wi-Fi.',
    zh: '贡献最多 — 建议连接充电器并使用 Wi-Fi。',
    ja: '最も多く貢献します — 充電しながら Wi-Fi でのご利用をおすすめします。',
  },
  'Mất kết nối tới máy chủ.': {
    en: 'Lost connection to the server.',
    zh: '与服务器的连接已断开。',
    ja: 'サーバーとの接続が切れました。',
  },
  'Chưa đủ quyền hoặc chưa đủ bậc tham gia.': {
    en: 'Insufficient permission or participation tier.',
    zh: '权限不足或参与等级不够。',
    ja: '権限または参加ランクが足りません。',
  },
  'Máy chủ đang trục trặc.': {
    en: 'The server is having trouble.',
    zh: '服务器出现故障。',
    ja: 'サーバーに問題が発生しています。',
  },
  'Chưa tải được trạng thái node': { en: 'Could not load node status', zh: '无法加载节点状态', ja: 'ノードの状態を読み込めません' },
  'Máy chủ đang bận hoặc chưa phản hồi. Vui lòng thử lại.': {
    en: 'The server is busy or not responding. Please try again.',
    zh: '服务器繁忙或没有响应，请重试。',
    ja: 'サーバーが混み合っているか応答がありません。もう一度お試しください。',
  },
  'Chưa đóng góp': { en: 'Not contributing', zh: '未贡献', ja: '未参加' },
  "Máy bạn chưa tham gia mạng. Vào 'Kết đèn' để bắt đầu góp sức.": {
    en: 'Your device has not joined the network. Open “Connect” to start contributing.',
    zh: '你的设备尚未加入网络。请打开“连灯”开始贡献。',
    ja: 'この端末はまだネットワークに参加していません。「参加」を開いて貢献を始めましょう。',
  },
  'Việc đang chạy': { en: 'Running tasks', zh: '进行中的任务', ja: '実行中のタスク' },
  'Việc đã kiểm chứng': { en: 'Verified tasks', zh: '已验证的任务', ja: '検証済みのタスク' },
  'Chưa có việc nào đang chạy. Mạng sẽ tự giao việc khi có nhu cầu.': {
    en: 'No tasks running. The network assigns work automatically when needed.',
    zh: '当前没有运行中的任务。网络会在有需求时自动分配。',
    ja: '実行中のタスクはありません。必要になればネットワークが自動で割り当てます。',
  },
  'Chưa tham gia được': { en: 'Could not join', zh: '无法加入', ja: '参加できません' },
  'Mạng đang trục trặc': { en: 'The network is having trouble', zh: '网络出现故障', ja: 'ネットワークに問題が発生しています' },
  'Cần có danh tính và ví nhận thưởng hợp lệ, hoặc bạn chưa đủ bậc tham gia.': {
    en: 'You need an identity and a valid reward wallet, or your tier is not high enough yet.',
    zh: '需要身份和有效的奖励钱包，或你的等级尚未达标。',
    ja: '本人情報と有効な報酬ウォレットが必要です。または参加ランクがまだ足りません。',
  },
  // 'Máy chủ đang bận. Thử lại sau ít phút.' khai ở errors.ts — dùng chung.
  'Đang đóng góp': { en: 'Contributing', zh: '贡献中', ja: '貢献中' },
  'Đang kết đèn…': { en: 'Connecting…', zh: '连灯中…', ja: '参加中…' },
  'Kết đèn — Tham gia ngay': { en: 'Connect — join now', zh: '连灯 — 立即参与', ja: '参加 — 今すぐ加わる' },

  // ── Pool ───────────────────────────────────────────────────────────────────
  'Mất kết nối tới máy chủ Pool.': { en: 'Lost connection to the Pool server.', zh: '与矿池服务器的连接已断开。', ja: 'プールサーバーとの接続が切れました。' },
  'Chưa đủ quyền xem/uỷ quyền Pool.': { en: 'Not enough permission to view/delegate to the Pool.', zh: '没有查看/委托矿池的权限。', ja: 'プールの閲覧／委任の権限がありません。' },
  'Máy chủ Pool đang trục trặc.': { en: 'The Pool server is having trouble.', zh: '矿池服务器出现故障。', ja: 'プールサーバーに問題が発生しています。' },
  'Uỷ quyền chưa nối được ví ký — tính năng sẽ mở ở bản sau.': {
    en: 'Delegation is not yet connected to a signing wallet — this will open in a later release.',
    zh: '委托尚未连接签名钱包 — 该功能将在后续版本开放。',
    ja: '委任はまだ署名ウォレットに接続されていません — 今後のバージョンで開放されます。',
  },

  // ── Nút / nhãn còn thiếu ───────────────────────────────────────────────────
  'Làm mới': { en: 'Refresh', zh: '刷新', ja: '更新' },
  'SỐ TIỀN KÝ QUỸ': { en: 'ESCROW AMOUNT', zh: '托管金额', ja: 'エスクロー金額' },
  'Mở phòng mới (DIRECT, GROUP, THREAD, JOB_NEGOTIATION)': {
    en: 'Open a new room (DIRECT, GROUP, THREAD, JOB_NEGOTIATION)',
    zh: '新建房间（DIRECT、GROUP、THREAD、JOB_NEGOTIATION）',
    ja: '新しいルームを開く（DIRECT、GROUP、THREAD、JOB_NEGOTIATION）',
  },
  'Chọn pool để uỷ quyền stake': { en: 'Pick a pool to delegate your stake', zh: '选择矿池进行质押委托', ja: 'ステーク委任するプールを選択' },

  // ── Dữ liệu MẪU của khung chat (mock.ts) ───────────────────────────────────
  // Hội thoại DEMO hiện thẳng lên màn. Tên riêng của người không khai — giữ nguyên.
  'Sửa máy giặt LG tại nhà': { en: 'LG washing machine repair at home', zh: '上门维修 LG 洗衣机', ja: '出張でのLG洗濯機修理' },
  'Sửa máy giặt LG': { en: 'LG washing machine repair', zh: '维修 LG 洗衣机', ja: 'LG洗濯機の修理' },
  'Vận chuyển 20 thùng hàng — Hà Nội đi Hải Phòng': {
    en: 'Move 20 crates — Hanoi to Hai Phong',
    zh: '运送 20 箱货物 — 河内到海防',
    ja: '荷物20箱の輸送 — ハノイからハイフォン',
  },
  'Vận chuyển hàng Hà Nội đi Hải Phòng': { en: 'Freight from Hanoi to Hai Phong', zh: '河内到海防的货运', ja: 'ハノイからハイフォンへの輸送' },
  'Đàm phán job: Vận chuyển HN → HP': { en: 'Job negotiation: freight Hanoi → Hai Phong', zh: '工作洽谈：河内 → 海防货运', ja: '案件交渉：ハノイ → ハイフォンの輸送' },
  'Thiết kế logo cho quán cà phê': { en: 'Logo design for a coffee shop', zh: '咖啡店标志设计', ja: 'カフェのロゴデザイン' },
  'Dọn nhà cuối tuần — căn hộ 60m²': { en: 'Weekend house cleaning — 60 m² apartment', zh: '周末打扫 — 60 平方米公寓', ja: '週末の家事代行 — 60m²のマンション' },
  'Lập trình API tích hợp thanh toán': { en: 'Payment integration API development', zh: '支付集成 API 开发', ja: '決済連携APIの開発' },
  'Lập trình API thanh toán': { en: 'Payment API development', zh: '支付 API 开发', ja: '決済APIの開発' },
  'Đội kỹ thuật — sửa máy giặt LG': { en: 'Tech crew — LG washing machine repair', zh: '技术组 — 维修 LG 洗衣机', ja: '技術チーム — LG洗濯機の修理' },
  'Aladin · Tin tức cộng đồng': { en: 'Aladin · Community news', zh: 'Aladin · 社区动态', ja: 'Aladin · コミュニティニュース' },
  'Chủ đề: Mẹo bảo mật ví': { en: 'Topic: wallet security tips', zh: '主题：钱包安全小贴士', ja: 'トピック：ウォレットのセキュリティのコツ' },

  // Người tham gia mẫu (chức danh dịch, TÊN giữ nguyên)
  'Anh Hoàng — Thợ điện lạnh': { en: 'Mr. Hoang — Refrigeration technician', zh: 'Hoàng 先生 — 制冷维修师', ja: 'ホアンさん — 冷凍空調技師' },
  'Chị Linh — Vận tải Phú An': { en: 'Ms. Linh — Phu An Transport', zh: 'Linh 女士 — Phú An 运输', ja: 'リンさん — Phú An 運送' },
  'Bạn Mai — Designer freelance': { en: 'Mai — Freelance designer', zh: 'Mai — 自由设计师', ja: 'マイさん — フリーランスデザイナー' },
  'Cô Tâm — Dịch vụ vệ sinh': { en: 'Ms. Tam — Cleaning service', zh: 'Tâm 女士 — 保洁服务', ja: 'タムさん — 清掃サービス' },
  'Anh Tuấn — Backend Engineer': { en: 'Mr. Tuan — Backend engineer', zh: 'Tuấn 先生 — 后端工程师', ja: 'トゥアンさん — バックエンドエンジニア' },

  // Tin nhắn mẫu
  'Em có thể qua lúc 3h chiều nay được không?': {
    en: 'Could you come over at 3 pm today?',
    zh: '你今天下午 3 点能过来吗？',
    ja: '今日の午後3時に来てもらえますか？',
  },
  'Chị xác nhận đã nhận hàng đầy đủ.': { en: 'I confirm the goods arrived in full.', zh: '我确认货物已全部收到。', ja: '荷物はすべて受け取りました。' },
  'Chị xác nhận đã nhận hàng đầy đủ và đúng thời gian.': {
    en: 'I confirm the goods arrived in full and on time.',
    zh: '我确认货物已全部按时收到。',
    ja: '荷物はすべて時間どおりに受け取りました。',
  },
  'Vâng, hẹn cô sáng thứ 7 nhé.': { en: 'Sure, see you Saturday morning.', zh: '好的，那就周六上午见。', ja: 'はい、土曜の朝にお願いします。' },
  'Mình đã đẩy code lên repo, anh review giúp.': {
    en: 'I pushed the code to the repo — please review.',
    zh: '我已经把代码推到仓库了，麻烦你 review。',
    ja: 'コードをリポジトリにプッシュしました。レビューをお願いします。',
  },
  'Chào anh, em là thợ Hoàng. Em đã nhận job sửa máy giặt LG.': {
    en: 'Hello, this is Hoang the technician. I have taken the LG washing machine job.',
    zh: '您好，我是维修师傅 Hoàng，我接了这单 LG 洗衣机维修。',
    ja: 'こんにちは、技師のホアンです。LG洗濯機の修理を引き受けました。',
  },
  'Chào em, em sửa được model WD-12G33 không?': {
    en: 'Hello — can you fix model WD-12G33?',
    zh: '你好，你能修 WD-12G33 这个型号吗？',
    ja: 'こんにちは。WD-12G33 の型番も修理できますか？',
  },
  'Dạ được anh. Phí công khoảng 250 MAGIC chưa tính vật tư.': {
    en: 'Yes I can. Labour is about 250 MAGIC, parts not included.',
    zh: '可以的。工费约 250 MAGIC，不含材料。',
    ja: 'はい、できます。工賃は約250 MAGIC、部品代は別です。',
  },
  'OK em, anh đã nạp 250 MAGIC vào escrow rồi nhé.': {
    en: 'OK — I have funded 250 MAGIC into escrow.',
    zh: '好的，我已经把 250 MAGIC 存入托管了。',
    ja: '了解です。250 MAGIC をエスクローに入金しました。',
  },
  'Em đã nhận thông báo escrow. Cảm ơn anh!': {
    en: 'I got the escrow notification. Thank you!',
    zh: '我已收到托管通知，谢谢！',
    ja: 'エスクローの通知を受け取りました。ありがとうございます！',
  },
  'Cảm ơn anh đã sử dụng dịch vụ! Em đã nhận escrow.': {
    en: 'Thank you for using the service! I have received the escrow.',
    zh: '感谢您的惠顾！托管款项我已收到。',
    ja: 'ご利用ありがとうございました！エスクローを受け取りました。',
  },
  'Bạn báo giá thiết kế logo nhé.': { en: 'Please quote me for the logo design.', zh: '麻烦给个标志设计的报价。', ja: 'ロゴデザインの見積もりをお願いします。' },
  'Bạn chuyển khoản trước cho mình 100% nhé!': {
    en: 'Please transfer me 100% upfront!',
    zh: '请先把款项 100% 转给我！',
    ja: '先に全額をお振り込みください！',
  },
  'Cô có thể qua sáng thứ 7 dọn căn hộ giúp em không?': {
    en: 'Could you come clean the apartment on Saturday morning?',
    zh: '您周六上午能过来帮我打扫公寓吗？',
    ja: '土曜の朝にマンションの掃除に来ていただけますか？',
  },
  'Em đã clone repo và setup xong môi trường.': {
    en: 'I have cloned the repo and finished setting up the environment.',
    zh: '我已经克隆了仓库并配置好环境。',
    ja: 'リポジトリをクローンし、環境構築まで終えました。',
  },
  'Mời bạn vào nhóm trao đổi kỹ thuật cùng anh em nhé.': {
    en: 'Come join the group for technical discussion with the team.',
    zh: '欢迎加入群组，和大家一起交流技术。',
    ja: 'ぜひグループに参加して、みんなと技術の話をしましょう。',
  },
  'Em mời anh vào phòng để chốt giá và lịch trình.': {
    en: 'I have invited you to the room to settle the price and schedule.',
    zh: '我邀请你进房间来敲定价格和时间安排。',
    ja: '価格とスケジュールを決めるためにルームへ招待しました。',
  },
  'Em vừa kiểm tra lại — model anh sửa được, em chuẩn bị đồ nghề.': {
    en: 'I just double-checked — I can fix your model, I am getting the tools ready.',
    zh: '我刚又确认了一下 — 你这型号我能修，我这就准备工具。',
    ja: '確認しました — その型番は修理できます。道具を準備します。',
  },
  'Mình báo giá 450 MAGIC cho 3 phương án logo + 1 vòng chỉnh sửa.': {
    en: 'My quote is 450 MAGIC for 3 logo concepts plus 1 round of edits.',
    zh: '我的报价是 450 MAGIC，含 3 个标志方案和 1 轮修改。',
    ja: '見積もりは450 MAGIC、ロゴ案3点と修正1ラウンド込みです。',
  },

  // ── Lỗi tầng chat (proofchatService / chatSocket / proofchatMessage) ────────
  'Native chat_mls chưa sẵn sàng': { en: 'Native chat_mls is not ready', zh: '原生 chat_mls 尚未就绪', ja: 'ネイティブの chat_mls が未準備です' },
  'init thất bại': { en: 'Initialisation failed', zh: '初始化失败', ja: '初期化に失敗しました' },
  'chưa init': { en: 'Not initialised yet', zh: '尚未初始化', ja: 'まだ初期化されていません' },
  'gửi thất bại': { en: 'Sending failed', zh: '发送失败', ja: '送信に失敗しました' },
  'lỗi gửi': { en: 'Send error', zh: '发送出错', ja: '送信エラー' },
  'tạo hội thoại thất bại': { en: 'Could not create the conversation', zh: '创建会话失败', ja: '会話の作成に失敗しました' },
  'cần ít nhất 1 thành viên': { en: 'At least 1 member is required', zh: '至少需要 1 名成员', ja: 'メンバーが最低1人必要です' },
  'thiếu tiêu đề nhóm': { en: 'The group title is missing', zh: '缺少群组名称', ja: 'グループ名がありません' },
  'tạo nhóm thất bại': { en: 'Could not create the group', zh: '创建群组失败', ja: 'グループの作成に失敗しました' },
  'PROOFCHAT_WS_URL chưa cấu hình': { en: 'PROOFCHAT_WS_URL is not configured', zh: '未配置 PROOFCHAT_WS_URL', ja: 'PROOFCHAT_WS_URL が設定されていません' },
  'chatSocket: chưa connect()': { en: 'chatSocket: connect() has not been called', zh: 'chatSocket：尚未调用 connect()', ja: 'chatSocket：connect() が呼ばれていません' },
  'proofchatMessage: tin thiếu encryptedContent/variants': {
    en: 'proofchatMessage: the message is missing encryptedContent/variants',
    zh: 'proofchatMessage：消息缺少 encryptedContent/variants',
    ja: 'proofchatMessage：メッセージに encryptedContent/variants がありません',
  },
};
