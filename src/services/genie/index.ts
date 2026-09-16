// services/genie/index.ts
//
// CỬA VÀO DUY NHẤT của trợ lý Genie phía vỏ.
//
// ── TRẠNG THÁI HÔM NAY, NÓI THẲNG ──────────────────────────────────────────
// Ở đây mới có ĐƯỜNG TẮT: khớp câu với sổ playbook rồi mở thẳng màn. Chạy hoàn
// toàn trên máy, 0 token, không cần mạng.
//
// Vòng suy luận nhiều bước (ReAct) nằm ở service Genie — từ 15/09/2026 mã đó ở
// trong kho **Wish** (`D:\\ALADIN_PROJECT\\Wish`, cây con `src/genie`).
//
// **Trống `GENIE_URL` thì tệp này là TẤT CẢ những gì có**, và khi đó trợ lý là một
// BẢNG TRA, không phải một trí tuệ: câu nào không khớp sổ thì nó không nghĩ ra
// được gì cả. Đó là lý do người dùng thấy "fake".
//
// Đó là lý do người dùng thấy "fake". Cách chữa thật là nối mô hình (chặng G4).
// Trong lúc chờ, tệp này làm được hai thứ khiến lúc trượt bớt máy móc:
//
//   1. GẦN KHỚP — nêu đúng cái việc gần nhất ("có phải bác muốn *thêm vườn*?")
//      thay vì một lời từ chối chung chung.
//   2. XOAY VÒNG câu từ chối — cùng một câu lặp lại ba lần là thứ làm người ta
//      nhận ra mình đang nói chuyện với một cái máy.
//
// Cả hai KHÔNG thay cho việc nối mô hình. Chúng chỉ làm cái trần hiện tại bớt
// lộ liễu, và cái trần vẫn ở nguyên đó.

import { matchFastPath } from './fastPath';
import { genieOpenScreen } from './genieNav';
import type { GeniePlaybook } from './playbooks.generated';

export * from './fastPath';
export * from './genieNav';
export type { GeniePlaybook, GenieAnchor } from './playbooks.generated';
export { GENIE_PLAYBOOKS, GENIE_PLAYBOOK_COUNT } from './playbooks.generated';

export type GenieOutcome =
  /** Đã mở màn. `say` là câu đọc cho người dùng — KHAI TAY, không do mô hình sinh. */
  | { kind: 'opened'; say: string; route: string; playbookId: string }
  /** Khớp nhiều việc, hoặc gần khớp một việc — phải hỏi lại. */
  | { kind: 'ask'; say: string; options?: GeniePlaybook[] }
  /** Không tự làm được. `say` là câu nói ra; nơi gọi không cần tự nghĩ câu. */
  | { kind: 'passthrough'; say: string };

/**
 * Câu nói khi trượt hẳn.
 *
 * Nhiều câu và xoay vòng, vì cùng một câu lặp lại là thứ làm người ta nhận ra
 * mình đang nói chuyện với một cái máy. Và mỗi câu đều **thừa nhận giới hạn thật**
 * thay vì đổ cho người dùng: hôm nay trợ lý đúng là chưa hiểu được câu đó.
 */
export const MISS_LINES: readonly string[] = [
  'Dạ câu này em chưa hiểu được ạ. Em còn đang học dần, bác nói cách khác giúp em nhé.',
  'Chỗ này em chịu rồi bác ạ. Bác thử bảo em mở một tính năng nào đó trong máy xem sao.',
  'Dạ em chưa làm được việc này đâu ạ. Bác nói ngắn gọn hơn một chút thử xem em có hiểu không nhé.',
  'Em nghe rồi mà chưa biết làm gì với nó ạ. Bác chỉ em rõ hơn một chút được không?',
];

let missIdx = 0;

/** Chỉ dùng trong bài kiểm — cho câu xoay vòng về đầu. */
export function __resetMissLine(): void {
  missIdx = 0;
}

function missLine(): string {
  const s = MISS_LINES[missIdx % MISS_LINES.length];
  missIdx += 1;
  return s;
}

/**
 * Thử xử một câu bằng đường tắt.
 *
 * KHÔNG ném. Mọi nhánh đều trả về một câu nói được, nên nơi gọi chỉ việc hiện
 * `out.say` — không chỗ nào phải tự nghĩ ra câu từ chối, và cũng không chỗ nào
 * lỡ để trợ lý im lặng.
 */
export function handle(text: string): GenieOutcome {
  const m = matchFastPath(text);

  if (m.kind === 'hit') {
    const pb = m.hit.playbook;
    const r = genieOpenScreen(pb.route, pb.params);
    // Mở không được thì ĐỪNG nói "em mở rồi" — đó là câu sai sự thật, và người
    // dùng sẽ ngồi nhìn màn cũ mà tưởng mình bấm hụt.
    if (!r.ok) {
      return {
        kind: 'passthrough',
        say: 'Dạ em chưa mở được màn đó lúc này ạ. Bác thử lại giúp em một lát nữa nhé.',
      };
    }
    return { kind: 'opened', say: pb.say, route: pb.route, playbookId: pb.id };
  }

  if (m.kind === 'ambiguous') {
    const ten = m.options.map((p) => `"${p.utterances[0]}"`).join(', ');
    return {
      kind: 'ask',
      say: `Dạ em đang phân vân giữa mấy việc: ${ten}. Bác nhắc lại giúp em là việc nào ạ?`,
      options: m.options,
    };
  }

  if (m.kind === 'near') {
    // Nêu ĐÚNG cái việc gần nhất. Một câu hỏi lại có nội dung thì người dùng biết
    // phải gõ gì tiếp; một lời từ chối chung chung thì họ chỉ biết là mình vừa
    // thất bại.
    return {
      kind: 'ask',
      say: `Dạ có phải bác muốn **${m.phrase}** không ạ? Bác nói đúng câu đó giúp em là em làm ngay.`,
      options: [m.playbook],
    };
  }

  return { kind: 'passthrough', say: missLine() };
}
