/**
 * Câu mở của Genie — DẪN một việc, không hỏi chung chung.
 *
 * ── Vì sao tệp này tồn tại ─────────────────────────────────────────────────
 *
 * Câu cũ, ở mọi app: *"Xin chào, mình là trợ lý của bạn trên {brand}. Mình có thể
 * giúp gì cho bạn?"* — chủ sở hữu bác 2026-09-19, và phép thử chủ sở hữu đưa ra
 * đáng giữ nguyên văn vì nó dùng lại được cho mọi câu mở về sau:
 *
 *   **Một bà cụ 70 tuổi, mở app lần đầu, đọc câu này xong có biết gõ gì tiếp không?**
 *
 * Câu cũ trượt phép thử đó. Nó không sai điều gì, nó chỉ đẩy toàn bộ việc nghĩ
 * sang phía người ít có khả năng nghĩ ra nhất — người chưa biết app làm được gì.
 *
 * ── Ranh giới hai nhà ──────────────────────────────────────────────────────
 *
 * NỘI DUNG câu mời là của nhà Wish, cho mọi app (chủ sở hữu phân 2026-09-19).
 * Tệp này là chỗ CẮM phía app: nó lắp câu từ ba thứ chỉ app mới biết — người dùng
 * tên gì, đã dùng Genie lần nào chưa, và app đang dựng có những module nào.
 *
 * Bảng `INVITATIONS` dưới đây là bản VIẾT TẠM để tính năng chạy được trước khi bộ
 * sinh của Wish có loại mục mới. Khi thư `ma:sa0919wb` được trả lời và
 * `playbooks.generated.ts` chở được lời mời, bảng này gỡ đi và đọc từ đó.
 *
 * ── Ràng buộc KHÔNG được nới ───────────────────────────────────────────────
 *
 * **Mọi lời mời phải dẫn tới một màn MỞ ĐƯỢC.** Nên mỗi mục mang một `playbookId`
 * và `openingInvitationsAreReachable.test.ts` đối chiếu nó với `GENIE_PLAYBOOKS`.
 *
 * Đây không phải cẩn thận thừa: một nút mời chết ở câu chào ĐẦU TIÊN là chỗ người
 * dùng mới bỏ app, và nó là đúng kiểu lỗi nhà này đã đo được ở chỗ khác (nút đăng
 * nhập bấm ba lần không phản hồi trên máy chưa ghi sinh trắc). Ở đó người dùng đã
 * tin app rồi nên họ thử lại; ở đây họ chưa có lý do nào để thử lại.
 *
 * Hệ quả phải chịu, và chịu có chủ ý: ba việc chủ sở hữu nêu — **chat với ai đó**,
 * **thời tiết mùa màng**, **bản tin khuyến nông xã** — hiện KHÔNG có playbook nào,
 * nên chúng KHÔNG nằm trong bảng. Thà thiếu một lời mời còn hơn có một lời mời
 * rỗng. Đã nêu trong thư gửi Wish; chúng vào bảng ngay khi có playbook.
 */
import type { ModuleId } from '../../navigation/moduleIds';

/** Một việc cụ thể Genie mời người dùng làm. */
export interface Invitation {
  /** Khoá ổn định — dùng cho `key` của React và cho bài kiểm, không hiện ra màn. */
  key: string;
  /** Playbook mà lời mời này dẫn tới. PHẢI có thật trong `GENIE_PLAYBOOKS`. */
  playbookId: string;
  /** Lời mời chỉ hiện khi app đang dựng có module này. */
  needs: ModuleId;
  /** Chữ trên nút — ngắn, là một VIỆC, không phải một danh từ. */
  label: string;
  /** Câu gửi vào Genie khi người dùng bấm, viết như người ta nói. */
  utterance: string;
  /** Cụm điền vào câu mở ở dạng động từ: "… muốn {phrase} …". */
  phrase: string;
}

/**
 * Bảng lời mời. Thứ tự trong bảng là thứ tự ƯU TIÊN khi phải cắt bớt.
 *
 * `needs` lấy từ `MODULE_IDS` — Aladin khai `modules: 'all'` nên có đủ bốn;
 * CheckFarm khai `['trace', 'join']` nên mọi mục `work`/`chat` tự vắng mặt ở đó
 * mà không cần một nhánh `if` nào nói tên app ra.
 */
export const INVITATIONS: readonly Invitation[] = [
  {
    key: 'tree-identity',
    playbookId: 'tree.scan',
    needs: 'trace',
    label: 'Định danh cây trồng',
    utterance: 'Tôi muốn định danh cây trồng',
    phrase: 'định danh cây trồng',
  },
  {
    key: 'trace-scan',
    playbookId: 'trace.scan',
    needs: 'trace',
    label: 'Tra nguồn gốc một quả',
    utterance: 'Tôi muốn tra nguồn gốc quả này',
    phrase: 'tra nguồn gốc một quả',
  },
  {
    key: 'care-scan',
    playbookId: 'care.scan',
    needs: 'trace',
    label: 'Quét nhãn bao thuốc',
    utterance: 'Tôi muốn quét nhãn bao thuốc',
    phrase: 'quét nhãn bao thuốc',
  },
  {
    key: 'farm-add',
    playbookId: 'farm.add',
    needs: 'trace',
    label: 'Lập vườn đầu tiên',
    utterance: 'Tôi muốn lập vườn',
    phrase: 'lập vườn đầu tiên',
  },
  {
    key: 'animal-scan',
    playbookId: 'animal.scan',
    needs: 'trace',
    label: 'Định danh vật nuôi',
    utterance: 'Tôi muốn định danh con vật này',
    phrase: 'định danh vật nuôi',
  },
  {
    key: 'activity-log',
    playbookId: 'activity.log',
    needs: 'trace',
    label: 'Ghi việc vừa làm',
    utterance: 'Tôi muốn ghi lại việc vừa làm ngoài vườn',
    phrase: 'ghi lại việc vừa làm ngoài vườn',
  },
  {
    key: 'work-post',
    playbookId: 'work.post',
    needs: 'work',
    label: 'Đặt người dọn dẹp',
    utterance: 'Tôi muốn đặt người dọn dẹp',
    phrase: 'đặt người dọn dẹp',
  },
  {
    key: 'wallet-open',
    playbookId: 'wallet.open',
    needs: 'join',
    label: 'Xem số MAGIC',
    utterance: 'Cho tôi xem số MAGIC',
    phrase: 'xem số MAGIC đang có',
  },
];

/** Ba thứ chỉ phía app biết. */
export interface OpeningContext {
  /** Tên người dùng; `null`/rỗng khi chưa có — KHÔNG đệm một cái tên giả. */
  name: string | null;
  /** Đã từng nói chuyện với Genie chưa. */
  returning: boolean;
  /** Module của app đang dựng (`ENABLED_MODULES`). */
  modules: readonly ModuleId[];
  /**
   * Số xoay vòng, để hai lần mở liên tiếp không ra cùng bộ lời mời — chủ sở hữu
   * muốn "mới mẻ chứ k nhàm chán". Người gọi truyền một số tăng dần (số lần mở
   * Genie chẳng hạn). Bỏ trống thì luôn lấy bộ đầu bảng, tức tất định — và đó là
   * điều bài kiểm cần, nên mặc định KHÔNG phải `Date.now()`.
   */
  seed?: number;
}

export interface OpeningLine {
  /** Câu mở, đã lắp tên và hai việc đầu. */
  greeting: string;
  /** Các việc mời làm; rỗng khi app không có module nào khớp bảng. */
  invitations: Invitation[];
  /**
   * Chở nguyên `ctx.returning` ra ngoài.
   *
   * Không phải dữ liệu thừa: tầng vẽ cần nó để quyết có nhắc TÊN APP hay không,
   * mà tên app phải ghép ở tầng vẽ chứ không ở đây (hàm này không gọi `t()` —
   * xem chú thích `buildOpeningLine`). Trả lại ở đây rẻ hơn bắt nơi gọi giữ
   * riêng một bản `returning` thứ hai và tự lo cho hai bản khớp nhau.
   */
  returning: boolean;
}

/** Bao nhiêu nút mời hiện cùng lúc. Ba là chỗ mắt còn đọc hết trong một nhịp. */
const HOW_MANY = 3;

/**
 * Chọn `HOW_MANY` lời mời, xoay theo `seed`.
 *
 * Xoay bằng phép quay vòng chứ không bằng ngẫu nhiên: ngẫu nhiên có thể cho ra
 * đúng bộ cũ hai lần liền, mà "nhàm chán" chính là thứ đang phải chữa. Quay vòng
 * bảo đảm lần sau khác lần trước chừng nào bảng còn nhiều hơn `HOW_MANY` mục.
 */
function pick(pool: Invitation[], seed: number): Invitation[] {
  if (pool.length <= HOW_MANY) return pool;
  const start = ((seed % pool.length) + pool.length) % pool.length;
  const out: Invitation[] = [];
  for (let i = 0; i < HOW_MANY; i++) out.push(pool[(start + i) % pool.length]);
  return out;
}

/**
 * Lắp câu mở.
 *
 * KHÔNG nhắc tên app ở đây. Tên app đi qua chỗ thay `{brand}` của `i18n`, và
 * `i18n/brandSlot.test.ts` đòi lời gọi dịch nằm CÙNG DÒNG với chỗ thay — nên chỗ
 * ghép tên app là ở tầng hiển thị, không phải ở hàm thuần này. Hàm này chỉ trả
 * phần chữ phụ thuộc người dùng và module.
 */
export function buildOpeningLine(ctx: OpeningContext): OpeningLine {
  const pool = INVITATIONS.filter(i => ctx.modules.includes(i.needs));
  const invitations = pick(pool, ctx.seed ?? 0);
  const name = ctx.name?.trim() || null;

  // Không còn việc nào mời được (app khai một tập module bảng chưa phủ). Nói một
  // câu thật thà và NGẮN, đừng quay về câu chung chung — câu chung chung là thứ
  // vừa bị bác.
  if (invitations.length === 0) {
    return {
      greeting: name ? `${name} ơi, mình nghe đây.` : 'Mình nghe đây.',
      invitations,
      returning: ctx.returning,
    };
  }

  const a = invitations[0].phrase;
  const b = invitations[1]?.phrase;
  const two = b ? `${a} hay ${b}` : a;

  const greeting = ctx.returning
    ? name
      ? `${name} ơi, hôm nay mình ${two}?`
      : `Hôm nay mình ${two}?`
    : name
      ? `Chào ${name}. Mình giúp được ngay: ${two}? Bấm một việc bên dưới là mình dẫn đi.`
      : `Chào bà con. Mình giúp được ngay: ${two}? Bấm một việc bên dưới là mình dẫn đi.`;

  return { greeting, invitations, returning: ctx.returning };
}
