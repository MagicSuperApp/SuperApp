// services/genie/fastPath.ts
//
// ĐƯỜNG TẮT của trợ lý: câu ngắn → mở thẳng đúng màn, KHÔNG gọi mô hình.
//
// ── BA CÁI ĐƯỢC CÙNG LÚC ────────────────────────────────────────────────────
//   nhanh  — tức thì, so với 1–3 giây chờ mô hình nghĩ
//   rẻ     — 0 token. Người dùng chân chính gần như không bao giờ chạm hạn mức
//   sống   — CHẠY ĐƯỢC KHI MẤT MẠNG, mà ngoài vườn thì mất mạng là mặc định
//
// Cái thứ ba là lý do tệp này nằm trong app chứ không nằm ở máy chủ.
//
// ── VÌ SAO KHÔNG DÙNG ĐIỂM TƯƠNG ĐỒNG ───────────────────────────────────────
//
// Một điểm truy hồi là thứ XẾP HẠNG ĐƯỢC, không phải thứ TIN ĐƯỢC: "0.87" không
// có nghĩa "chắc 87%", nó chỉ có nghĩa "cao hơn cái 0.62 kia". Lấy nó làm cổng
// cho một hành động có thật (mở màn trước mặt người ta) là gán cho nó một ý
// nghĩa nó không có.
//
// Nên đường tắt hỏi một câu CẤU TRÚC, trả lời được bằng có/không:
//
//     Có một `utterance` nào nằm TRỌN trong câu người dùng không,
//     và phần câu còn thừa có phải chỉ là chữ đưa đẩy không?
//
//   "tôi muốn thêm vườn"            → chứa trọn "thêm vườn", thừa [tôi, muốn] ⇒ ĐI TẮT
//   "thêm vườn cho bác"             → thừa [cho, bác] ⇒ ĐI TẮT
//   "ghi lịch sử bón phân vườn 3"   → chứa "ghi lịch sử", thừa [bón, phân, vườn, 3]
//                                     ⇒ KHÔNG đi tắt. Câu này có ĐÍCH, và đích thì
//                                       phải tra mã thật — việc của vòng ReAct
//                                       phía máy chủ, không phải của tệp này.
//
// Phép này giải thích được cho người không đọc mã, và nó không trôi khi sổ lớn lên.

import { GENIE_PLAYBOOKS, GeniePlaybook } from './playbooks.generated';
import { amTiet, boDau, chuaCum, gan } from './viet';

/**
 * Chữ ĐƯA ĐẨY — xưng hô, gọi đáp, tiểu từ tình thái.
 *
 * Danh sách cố ý NGẮN, chỉ gồm chữ **không bao giờ mang nghĩa lệnh**. Cám dỗ là
 * nhét thêm "xem", "làm", "không" cho câu nào cũng khớp — đừng: "xem" có trong
 * "xem vườn", "làm" có trong "làm vườn mới", và "không" là cả một câu hỏi. Mỗi
 * chữ thêm vào đây là một câu bị hiểu thành câu khác.
 */
const DUA_DAY = new Set(
  [
    'toi', 'tui', 'minh', 'em', 'bac', 'anh', 'chi', 'co', 'chu', 'ong', 'ba',
    'oi', 'a', 'ah', 'nhe', 'nha', 'voi', 'giup', 'gium', 'dum', 'ho',
    'cho', 'hay', 'di', 'muon', 'can', 'lam', 'on', 'gio', 'nay',
  ].map(boDau),
);

/** [THAM SỐ THỬ NGHIỆM] Bao nhiêu âm tiết thừa thì vẫn coi là "đúng câu đó". */
export const LEFTOVER_BUDGET = 1;

/**
 * Màn trợ lý **KHÔNG BAO GIỜ** tự mở, kể cả trong phiên đã đăng nhập.
 *
 * ⚠ Đây KHÔNG phải bản sao của `NEVER_PUBLIC_ROUTES` (`navigation/authGate.tsx`),
 *   và trộn hai danh sách là một lỗi dễ mắc. Chúng trả lời hai câu khác nhau:
 *
 *     `NEVER_PUBLIC_ROUTES`  — "màn này mở được khi CHƯA đăng nhập không?"
 *     danh sách dưới đây     — "trợ lý có được TỰ MỞ màn này hộ người dùng không?"
 *
 *   `PhoenixWallet` nằm ở danh sách kia nhưng KHÔNG ở đây: ví phải có phiên mới
 *   xem được, nhưng "mở ví giúp bác" là một việc hợp lý — trợ lý mở đúng màn đó
 *   rồi DỪNG, không đụng gì thêm.
 *
 * Danh sách này lặp lại `Genie/src/policy/scope.js`. Hai bên phải khớp; máy chủ
 * gác lần nữa, nên đây là lớp thứ hai chứ không phải lớp duy nhất.
 */
export const GENIE_ROUTE_DENY: readonly string[] = [
  // Một khung hình là đủ để chụp màn 24 từ khôi phục.
  'SeedExport', 'ExportIdentity', 'RestoreIdentity',
  // Đụng thẳng vào danh tính / quyền của máy.
  'Guardian', 'SignRequest', 'MyDevices', 'DevicePair', 'BiometricSettings',
  'DeleteAccount', 'Username',
  // Màn CỬA VÀO không nằm trong `PUBLIC_ROUTES`. Chúng chạy trong lúc phiên cũ
  // còn trong store, nên chỉ gác bằng `isPublicRoute` là để lọt.
  'Activation', 'LanguageSelect', 'Onboarding', 'Terms', 'IdentityEntryChoice',
  'SignUpBiometric', 'SignUpComplete', 'Login',
  // Ra tiền.
  'WalletSend', 'Staking', 'Wakeme', 'ProofChatWallet', 'ProofChatEscrow', 'OrgMint',
  // Hội thoại riêng — MLS mã hoá đầu-cuối.
  'ChatRoom',
  // Đọc/ghi dữ liệu riêng của vườn sang người khác.
  'TreeDrift', 'TreeShare',
];

const DENY = new Set(GENIE_ROUTE_DENY);

export interface FastHit {
  playbook: GeniePlaybook;
  /** `utterance` đã khớp — để ghi nhật ký và để gỡ lỗi khi khớp nhầm. */
  matched: string;
  leftover: number;
}

export type FastResult =
  | { kind: 'hit'; hit: FastHit }
  /** Khớp nhiều việc ⇒ HỎI LẠI, tối đa 3. Người ta không nhớ nổi lựa chọn thứ tư. */
  | { kind: 'ambiguous'; options: GeniePlaybook[] }
  /** GẦN khớp — không đủ chắc để làm, nhưng đủ để hỏi lại cho có ích. */
  | { kind: 'near'; playbook: GeniePlaybook; phrase: string; score: number }
  | { kind: 'miss' };

/**
 * [THAM SỐ THỬ NGHIỆM] Bao nhiêu PHẦN của một cách-nói phải có mặt trong câu.
 */
export const NEAR_THRESHOLD = 0.6;

/**
 * Và ít nhất bao nhiêu ÂM TIẾT phải khớp.
 *
 * Hai điều kiện, không phải một — vì chỉ có tỉ lệ thì cách-nói hai âm tiết chỉ
 * cần trúng MỘT là đã đạt 0.5. Đo được: "hôm nay trời đẹp quá" trúng "quá" trong
 * "quay quả" và thành ra gợi ý quay video quả. Một gợi ý sai còn tệ hơn một lời
 * từ chối thật thà: người dùng đi theo nó rồi mới biết là trật.
 */
export const NEAR_MIN_SYLLABLES = 2;

/**
 * Điểm gần-khớp: bao nhiêu phần âm tiết của `utterance` có mặt đâu đó trong câu.
 *
 * Khác `chuaCum` ở chỗ KHÔNG đòi liền nhau. "ghi lại hôm nay bón phân cho vườn"
 * không chứa trọn cụm "ghi nhật ký", nhưng nó có "ghi" — đủ để hỏi lại một câu
 * có ích thay vì đọc một lời từ chối chung chung.
 */
export function nearScore(
  pb: GeniePlaybook, query: string,
): { score: number; matched: number; phrase: string } {
  const qs = amTiet(query);
  let best = { score: 0, matched: 0, phrase: pb.utterances[0] ?? '' };
  for (const u of pb.utterances) {
    const us = amTiet(String(u));
    if (!us.length) continue;
    const matched = us.filter((x) => qs.some((y) => gan(x, y))).length;
    const score = matched / us.length;
    if (score > best.score || (score === best.score && matched > best.matched)) {
      best = { score, matched, phrase: String(u) };
    }
  }
  return best;
}

function hitOf(pb: GeniePlaybook, query: string): FastHit | null {
  const qs = amTiet(query);
  let best: FastHit | null = null;
  for (const u of pb.utterances) {
    const n = chuaCum(query, u);
    if (!n) continue;
    const leftover = Math.max(0, qs.filter((s) => !DUA_DAY.has(boDau(s))).length - n);
    if (!best || leftover < best.leftover) best = { playbook: pb, matched: u, leftover };
  }
  if (!best || best.leftover > LEFTOVER_BUDGET) return null;
  return best;
}

/**
 * Câu này đi tắt được không.
 *
 * KHÔNG ném. Câu không khớp là một CÂU TRẢ LỜI (`miss`), không phải một sự cố —
 * nơi gọi sẽ chuyển tiếp sang trợ lý đầy đủ.
 */
export function matchFastPath(
  text: string,
  playbooks: readonly GeniePlaybook[] = GENIE_PLAYBOOKS,
): FastResult {
  const q = String(text ?? '').trim();
  if (!q) return { kind: 'miss' };

  const hits: FastHit[] = [];
  for (const pb of playbooks) {
    // Màn cấm thì không khớp, chứ không phải khớp rồi chặn: khớp-rồi-chặn để lại
    // một câu "em không làm được" cho một việc mà lẽ ra trợ lý không nên nhận.
    if (DENY.has(pb.route)) continue;
    const h = hitOf(pb, q);
    if (h) hits.push(h);
  }

  if (hits.length === 1) return { kind: 'hit', hit: hits[0] };
  if (hits.length > 1) {
    hits.sort((a, b) => a.leftover - b.leftover);
    return { kind: 'ambiguous', options: hits.slice(0, 3).map((h) => h.playbook) };
  }

  // ── GẦN khớp ────────────────────────────────────────────────────────────
  // Không đủ chắc để LÀM, nhưng đủ để hỏi lại một câu CÓ ÍCH. Trả về một lời từ
  // chối chung chung cho mọi câu trượt là cách nhanh nhất biến trợ lý thành một
  // cái máy trả lời tự động — người dùng nghe đúng một câu đó ba lần rồi thôi.
  let gan_: { pb: GeniePlaybook; score: number; matched: number; phrase: string } | null = null;
  for (const pb of playbooks) {
    if (DENY.has(pb.route)) continue;
    const n = nearScore(pb, q);
    if (!gan_ || n.score > gan_.score || (n.score === gan_.score && n.matched > gan_.matched)) {
      gan_ = { pb, ...n };
    }
  }
  if (gan_ && gan_.score >= NEAR_THRESHOLD && gan_.matched >= NEAR_MIN_SYLLABLES) {
    return { kind: 'near', playbook: gan_.pb, phrase: gan_.phrase, score: gan_.score };
  }

  return { kind: 'miss' };
}

/** Trợ lý có được mở màn này không. Dùng ở nơi nào nhận route từ ngoài. */
export function genieMayOpen(route: string): boolean {
  return !DENY.has(String(route ?? ''));
}
