/**
 * Chuỗi của màn SỐ DƯ MAGIC (`magicVault.*`). Tách tệp riêng theo yêu cầu task —
 * KHÔNG chèn vào `trace.ts` (có nhà khác đang sửa tệp đó cùng lúc).
 *
 * MAGIC ở đây là TÍN DỤNG dùng thử trên mạng Preprod, KHÔNG phải tiền thật — mọi câu
 * dưới đây tránh gọi nó là "tiền"/"giá trị", và luôn có một dòng nhắc Preprod ở màn.
 */

export const MAGIC_VAULT_STRINGS = {
  'magicVault.title': { vi: 'Số dư MAGIC', en: 'MAGIC balance', zh: 'MAGIC 余额', ja: 'MAGIC 残高' },

  // ── Ba trạng thái không được gộp ─────────────────────────────────────────────
  'magicVault.loading': { vi: 'Đang hỏi máy chủ…', en: 'Checking with the server…', zh: '正在查询服务器…', ja: 'サーバーに確認しています…' },
  'magicVault.notConfigured': {
    vi: 'Bản này chưa được cấu hình để đọc vault MAGIC. Chưa có gì để hiện, kể cả số 0.',
    en: 'This build has not been configured to read a MAGIC vault yet. There is nothing to show, not even zero.',
    zh: '本版本尚未配置读取 MAGIC 金库。暂无内容可显示，包括 0。',
    ja: 'このビルドは MAGIC ボールトを読む設定がまだありません。0 を含め、表示できるものはありません。',
  },
  'magicVault.retry': { vi: 'Thử lại', en: 'Try again', zh: '重试', ja: 'もう一度' },

  // ── Lỗi — mỗi loại một câu, đừng gộp về "có lỗi xảy ra" ──────────────────────
  'magicVault.errorNetwork': {
    vi: 'Không nối được tới máy chủ vault. Kiểm tra sóng hoặc Wi-Fi rồi thử lại.',
    en: 'Could not reach the vault server. Check your signal or Wi-Fi, then try again.',
    zh: '无法连接金库服务器。请检查信号或 Wi-Fi 后重试。',
    ja: 'ボールトサーバーに接続できません。電波か Wi-Fi を確認して、もう一度お試しください。',
  },
  'magicVault.errorTimeout': {
    vi: 'Máy chủ vault trả lời quá lâu nên máy đã dừng chờ. Thử lại nhé.',
    en: 'The vault server took too long, so the app stopped waiting. Try again.',
    zh: '金库服务器响应太慢，应用已停止等待。请重试。',
    ja: 'ボールトサーバーの応答が遅すぎたため待機を中止しました。もう一度お試しください。',
  },
  'magicVault.errorBadResponse': {
    vi: 'Máy chủ vault có trả lời nhưng trả về thứ đọc không được. Thử lại; còn vậy thì báo người hướng dẫn.',
    en: 'The vault server replied with something unreadable. Try again; if it persists, tell your field contact.',
    zh: '金库服务器有回应，但内容无法解析。请重试；若仍如此，请联系现场指导人员。',
    ja: 'ボールトサーバーは応答しましたが内容を読み取れません。もう一度お試しください。改善しない場合は担当者に連絡してください。',
  },
  'magicVault.errorUnauthorized': {
    vi: 'Bản này chưa có quyền đọc vault MAGIC (thiếu hoặc sai thẻ bài). Báo người hướng dẫn.',
    en: 'This build is not authorized to read the MAGIC vault (missing or wrong token). Tell your field contact.',
    zh: '本版本无权读取 MAGIC 金库（令牌缺失或错误）。请联系现场指导人员。',
    ja: 'このビルドは MAGIC ボールトの読み取り権限がありません（トークン不足または誤り）。担当者に連絡してください。',
  },
  'magicVault.errorServer': {
    vi: 'Máy chủ vault đang gặp sự cố (không đọc được chuỗi). Đây KHÔNG phải là số dư 0 — thử lại sau ít phút.',
    en: 'The vault server is having trouble (could not read the chain). This is NOT a zero balance — try again in a few minutes.',
    zh: '金库服务器出现故障（无法读取链上数据）。这并不代表余额为 0——请稍后重试。',
    ja: 'ボールトサーバーに問題があります（チェーンを読み取れません）。残高が 0 というわけではありません。数分後にもう一度お試しください。',
  },
  'magicVault.errorCode': { vi: 'Mã tham chiếu: {code}', en: 'Reference code: {code}', zh: '参考代码：{code}', ja: '参照コード：{code}' },

  // ── Có số dư ──────────────────────────────────────────────────────────────
  'magicVault.availableLabel': { vi: 'Dùng được ngay bây giờ', en: 'Usable right now', zh: '当前可用', ja: '今すぐ使える' },
  'magicVault.accruedLabel': { vi: 'Đã sinh trong kỳ (gồm cả phần đã hết hạn)', en: 'Generated this period (including expired)', zh: '本期已生成（含已过期）', ja: 'この期間の発生分（期限切れ含む）' },
  'magicVault.expiredLabel': { vi: 'Đã hết hạn, sắp bị dọn', en: 'Expired, about to be cleared', zh: '已过期，即将清除', ja: '期限切れ、まもなく整理されます' },
  'magicVault.vaultCount': { vi: '{n} vault', en: '{n} vault(s)', zh: '{n} 个金库', ja: '{n} 個のボールト' },
  'magicVault.unit': { vi: 'MAGIC', en: 'MAGIC', zh: 'MAGIC', ja: 'MAGIC' },

  // ── Danh sách lô (batch) ─────────────────────────────────────────────────
  'magicVault.batchesTitle': { vi: 'Các lô MAGIC', en: 'MAGIC batches', zh: 'MAGIC 批次', ja: 'MAGIC バッチ' },
  'magicVault.noBatches': { vi: 'Chưa có lô MAGIC nào', en: 'No MAGIC batches yet', zh: '暂无 MAGIC 批次', ja: 'MAGIC バッチはまだありません' },
  'magicVault.sourceInstant': { vi: 'Cấp tức thời', en: 'Instant', zh: '即时发放', ja: '即時付与' },
  'magicVault.sourceSchedule': { vi: 'Xả theo lịch', en: 'Scheduled', zh: '按计划发放', ja: 'スケジュール配布' },
  'magicVault.sourceInstantHint': {
    vi: 'Cấp ngay khi mở vault.',
    en: 'Granted as soon as the vault opens.',
    zh: '金库开启后立即发放。',
    ja: 'ボールト開設と同時に付与されます。',
  },
  'magicVault.sourceScheduleHint': {
    vi: 'Xả mỗi ngày một lượt, bắt đầu 2 ngày sau khi cam kết.',
    en: 'Releases once a day, starting 2 days after commitment.',
    zh: '每天发放一次，自承诺之日起 2 天后开始。',
    ja: '毎日 1 回配布され、コミットから 2 日後に開始します。',
  },
  'magicVault.batchLive': { vi: 'Còn sống', en: 'Live', zh: '有效', ja: '有効' },
  'magicVault.batchExpired': { vi: 'Đã hết hạn', en: 'Expired', zh: '已过期', ja: '期限切れ' },
  // {hhmm}/{day}/{month}/{year} điền bằng `expiresAtEpochToVnMoment` — decay_window=1
  // nên hầu như luôn là 07:00 sáng (00:00 UTC), nhưng vẫn truyền số thật, không hardcode câu.
  'magicVault.batchExpiry': {
    vi: 'Hết hạn lúc {hhmm} sáng {day}/{month}/{year} (giờ Việt Nam)',
    en: 'Expires at {hhmm} on {day}/{month}/{year} (Vietnam time)',
    zh: '{year}年{month}月{day}日 {hhmm}（越南时间）到期',
    ja: '{year}年{month}月{day}日 {hhmm}（ベトナム時間）に期限切れ',
  },

  // ── Nhắc đây là tín dụng thử nghiệm, không phải tiền ─────────────────────
  'magicVault.testnetNotice': {
    vi: 'MAGIC là tín dụng dùng trong ứng dụng, đang thử trên mạng Preprod — không phải tiền thật.',
    en: 'MAGIC is in-app credit, currently on the Preprod test network — not real money.',
    zh: 'MAGIC 是应用内信用额度，目前在 Preprod 测试网络上 —— 并非真实货币。',
    ja: 'MAGIC はアプリ内クレジットで、現在 Preprod テストネットで試験中です。実際のお金ではありません。',
  },
} as const;

