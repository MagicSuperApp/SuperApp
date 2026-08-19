/**
 * Chuỗi của MÀN QUÉT TRUY XUẤT, theo khoá `scan.<nhóm>.<tên>`.
 *
 * Cùng nếp với `trace.ts` — xem chú thích đầu tệp đó để biết vì sao dùng khoá
 * thay vì lấy chính câu tiếng Việt làm khoá.
 *
 * Người đọc màn này là NGƯỜI MUA, không phải nhà vườn: họ chưa từng mở app bao
 * giờ, đang cầm quả trên tay ở chợ hoặc trong bếp. Nên chữ ở đây nói việc cần
 * làm ("đưa quả vào khung"), không nói tên kỹ thuật ("gửi truy vấn nhận dạng").
 */

import type { KeyMap } from './index';

export const SCAN_STRINGS = {
  // ── Đầu màn ───────────────────────────────────────────────────────────────
  'scan.title': { vi: 'Truy xuất nguồn gốc', en: 'Trace origin', zh: '溯源查询', ja: '産地をたどる' },
  'scan.mode.qr': { vi: 'Mã QR', en: 'QR code', zh: '二维码', ja: 'QR コード' },
  'scan.mode.fruit': { vi: 'Chụp quả', en: 'Photo', zh: '拍水果', ja: '果実を撮る' },

  'scan.hint.qr': {
    vi: 'Đưa mã QR trên sản phẩm vào khung',
    en: 'Point the product’s QR code at the frame',
    zh: '将产品上的二维码对准取景框',
    ja: '商品の QR コードを枠に合わせてください',
  },
  'scan.hint.fruit': {
    vi: 'Đưa quả vào giữa khung rồi bấm nút chụp',
    en: 'Centre the fruit in the frame, then tap the shutter',
    zh: '把水果放在取景框中间，然后点击快门',
    ja: '果実を枠の中央に入れてシャッターを押してください',
  },

  // ── Trạng thái một lượt tra ───────────────────────────────────────────────
  'scan.state.sending': { vi: 'Đang định vị quả...', en: 'Sending the photo…', zh: '正在发送照片…', ja: '写真を送信中…' },
  'scan.state.pickFruit': {
    vi: 'Máy chủ thấy nhiều quả — chạm vào vùng xanh của quả bạn muốn tra',
    en: 'Several fruits found — tap the green area of the one you mean',
    zh: '发现多个水果 — 点击你要查的那个绿色区域',
    ja: '果実が複数見つかりました — 調べたいものの緑の範囲をタップ',
  },
  'scan.state.oneFruit': {
    vi: 'Máy chủ chưa chắc bạn hỏi quả nào — lại gần, chụp riêng MỘT quả thôi',
    en: 'The server cannot tell which fruit you mean — get closer and shoot just ONE',
    zh: '服务器分不清你要查哪一个 — 请靠近，只拍一个水果',
    ja: 'どの果実か判別できません — 近づいて 1 個だけ撮ってください',
  },
  'scan.state.noMatch': {
    vi: 'Chưa tìm thấy quả nào giống. Thử lại gần hơn, đủ sáng.',
    en: 'No similar fruit found. Try again closer, in better light.',
    zh: '没找到相似的水果。请靠近些、光线好一点再试。',
    ja: '似た果実が見つかりません。もっと近く、明るい場所で試してください。',
  },
  'scan.state.tooLarge': {
    vi: 'Ảnh quá nặng để gửi đi. Thử chụp lại.',
    en: 'The photo is too large to send. Try again.',
    zh: '照片太大，无法发送。请重拍。',
    ja: '写真が大きすぎて送信できません。撮り直してください。',
  },
  'scan.state.tooLargeNoResizer': {
    vi: 'Bản ứng dụng này chưa co được ảnh. Hãy cập nhật ứng dụng, hoặc chọn ảnh từ thư viện.',
    en: 'This build cannot shrink photos. Update the app, or pick a photo from your library.',
    zh: '此版本无法压缩照片。请更新应用，或从相册中选择照片。',
    ja: 'このビルドは写真を縮小できません。アプリを更新するか、ライブラリから選んでください。',
  },
  'scan.state.imageUnusable': {
    vi: 'Ảnh chưa dùng được — lại gần hơn, đủ sáng, chụp lại giúp',
    en: 'Photo unusable — get closer, more light, shoot again',
    zh: '照片不可用 — 请靠近、加强光线，重拍一张',
    ja: '写真が使えません — 近づいて、明るくして撮り直してください',
  },
  'scan.state.rateLimited': {
    vi: 'Máy chủ đang bận — chờ {n} giây rồi thử lại',
    en: 'Server is busy — wait {n} seconds and try again',
    zh: '服务器繁忙 — 请等待 {n} 秒后重试',
    ja: 'サーバーが混雑しています — {n} 秒待って再試行してください',
  },
  'scan.state.qrLocked': { vi: 'Đã đọc mã — đang mở…', en: 'Code read — opening…', zh: '已读取 — 正在打开…', ja: 'コードを読み取りました — 開いています…' },

  // ── Nút ───────────────────────────────────────────────────────────────────
  'scan.btn.torch': { vi: 'Đèn', en: 'Light', zh: '照明', ja: 'ライト' },
  'scan.btn.gallery': { vi: 'Ảnh có sẵn', en: 'From library', zh: '相册', ja: 'ライブラリ' },
  'scan.btn.shutter': { vi: 'Chụp', en: 'Shoot', zh: '拍摄', ja: '撮影' },
  'scan.btn.close': { vi: 'Đóng', en: 'Close', zh: '关闭', ja: '閉じる' },
  'scan.btn.retry': { vi: 'Quét lại', en: 'Scan again', zh: '重新扫描', ja: 'もう一度' },

  // ── Kết quả tra quả ───────────────────────────────────────────────────────
  'scan.result.title': { vi: 'Quả nào giống nhất?', en: 'Which one matches?', zh: '哪一个最像？', ja: 'どれが一致しますか？' },
  'scan.result.sub': {
    vi: 'Máy chỉ gợi ý — bạn đối chiếu ảnh rồi chọn',
    en: 'These are suggestions — compare the photos and pick',
    zh: '这些只是建议 — 请对照照片自行选择',
    ja: 'これは候補です — 写真を見比べて選んでください',
  },
  'scan.result.anchored': { vi: 'Đã ghi lên chuỗi', en: 'Anchored on-chain', zh: '已上链', ja: 'チェーンに記録済み' },
  'scan.result.notAnchored': {
    vi: 'Chưa lên chuỗi',
    en: 'Not on-chain yet',
    zh: '尚未上链',
    ja: 'まだチェーンに未記録',
  },
  'scan.result.unknownAnchor': { vi: 'Chưa rõ', en: 'Unknown', zh: '未知', ja: '不明' },
  'scan.result.view': { vi: 'Xem nguồn gốc', en: 'See origin', zh: '查看溯源', ja: '産地を見る' },
  'scan.result.explorer': { vi: 'Xem bằng chứng trên chuỗi', en: 'View on-chain proof', zh: '查看链上凭证', ja: 'チェーン上の証跡を見る' },
  'scan.result.noTree': {
    vi: 'Quả này chưa gắn với cây nào công khai',
    en: 'This fruit is not linked to a public tree',
    zh: '该果实尚未关联公开的果树',
    ja: 'この果実は公開された木に紐づいていません',
  },

  // ── Mã lạ ─────────────────────────────────────────────────────────────────
  'scan.unknown.title': { vi: 'Chưa nhận diện được mã', en: 'Code not recognised', zh: '无法识别此码', ja: 'コードを認識できません' },
  'scan.unknown.body': {
    vi: 'Mã này chưa gắn dữ liệu truy xuất. Bạn thử chụp thẳng quả xem sao.',
    en: 'This code carries no trace data. Try photographing the fruit instead.',
    zh: '该码没有溯源数据。可以试试直接拍水果。',
    ja: 'このコードに追跡データはありません。果実を直接撮ってみてください。',
  },
  'scan.unknown.label': { vi: 'MÃ ĐỌC ĐƯỢC', en: 'CODE READ', zh: '读到的码', ja: '読み取ったコード' },

  // ── Quyền / lỗi ───────────────────────────────────────────────────────────
  'scan.perm.title': { vi: 'Cần quyền máy ảnh', en: 'Camera permission needed', zh: '需要相机权限', ja: 'カメラの許可が必要です' },
  'scan.perm.body': {
    vi: 'Màn này cần máy ảnh để đọc mã và chụp quả. Bạn mở quyền trong Cài đặt nhé.',
    en: 'This screen needs the camera to read codes and photograph fruit. Enable it in Settings.',
    zh: '本页需要相机来读码和拍摄水果。请在设置中开启。',
    ja: 'この画面はコード読み取りと撮影にカメラが必要です。設定で許可してください。',
  },
  'scan.perm.open': { vi: 'Mở Cài đặt', en: 'Open Settings', zh: '打开设置', ja: '設定を開く' },
  'scan.error.generic': { vi: 'Có trục trặc khi tra. Thử lại nhé.', en: 'Something went wrong. Try again.', zh: '查询出错，请重试。', ja: '問題が発生しました。もう一度お試しください。' },
} satisfies KeyMap;
