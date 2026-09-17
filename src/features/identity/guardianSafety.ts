// features/identity/guardianSafety.ts
//
// MỨC AN TOÀN CỦA ĐƯỜNG KHÔI PHỤC QUA NGƯỜI THÂN — và điều app KHÔNG đo được.
//
// ══ Hai câu hỏi, chỉ một câu đo được ══════════════════════════════════════════
// Người dùng cần biết hai thứ khác hẳn nhau:
//
//   (a) BAO NHIÊU người đứng ra khôi phục hộ mình  — app đo được, bằng `guardians.list`.
//   (b) Từng người ấy có tự giữ nổi danh tính của CHÍNH HỌ không — app **không** đo được.
//
// Câu (b) mới là câu quyết định. Một người bảo hộ chưa lập phương thức xác thực
// nào thì chính họ có thể mất danh tính; lúc đó lời nhờ của người dùng mất theo,
// và người dùng không hề biết. Nhưng máy chủ chưa có cửa nào trả lời câu đó:
// `guardians.list` chỉ trả `guardianDid · status · createdAt`, và `status` LUÔN là
// `'active'` vì bảng chỉ trả dòng active (`phoenixKey-api.ts`, cụm `guardians`).
// `identity/health` thì suy chủ thể từ thẻ Bearer nên không hỏi hộ người khác được.
//
// ══ Vì sao module này tồn tại thay vì một dòng `if (n < 3)` trong màn ═════════
// Vì cái bẫy nằm ở CÂU CHỮ, không nằm ở con số. Đếm được ba người rồi in chữ
// "đã an toàn" là lấy phép đo của câu (a) trả lời cho câu (b) — một phép đo trả về
// giá trị hợp lệ đúng lúc nó không đo được gì. Nên ở đây:
//
//   · mức cao nhất chỉ được nói **"đã ghi danh N người"**, TUYỆT ĐỐI không nói
//     "an toàn", "đủ", "yên tâm";
//   · trường `unmeasured` đi kèm **MỌI** mức, kể cả mức cao nhất — đó là chỗ app
//     tự khai giới hạn của chính nó, và mức cao nhất mới là mức cần nó nhất.
//
// Bài kiểm `guardianSafety.test.ts` canh đúng hai điều trên, vì chúng là thứ một
// lượt sửa câu chữ "cho gọn" sẽ đánh rơi mà không gì đỏ.

/** Mức an toàn suy từ SỐ LƯỢNG người bảo hộ — không suy từ chất lượng của họ. */
export type GuardianSafetyLevel = 'none' | 'single-point' | 'thin' | 'spread';

export interface GuardianSafety {
  level: GuardianSafetyLevel;
  /** Câu ngắn in đậm trên đầu khung. */
  headline: string;
  /** Vì sao mức này đáng lo, và nên làm gì tiếp. */
  body: string;
  /**
   * Điều app KHÔNG đo được, in ở MỌI mức. Không phải phần phụ — nó là phần duy
   * nhất nói được rằng con số phía trên không trả lời câu quan trọng nhất.
   */
  unmeasured: string;
}

/**
 * Điều app không đo được — một câu, dùng chung cho mọi mức.
 *
 * Giữ ở một hằng vì nó phải GIỐNG NHAU ở cả bốn mức: viết lại bốn lần là mở khe
 * cho bốn bản trôi khỏi nhau, và mức người dùng đọc nhiều nhất sẽ là mức nhạt nhất.
 */
const UNMEASURED =
  'Ứng dụng chưa kiểm được từng người bảo hộ đã tự lập cách xác thực cho tài khoản ' +
  'của họ hay chưa. Người nào chưa lập thì chính họ cũng có thể mất tài khoản — và ' +
  'lời nhờ khôi phục của bạn mất theo. Hãy nhắc từng người mở ứng dụng và lập vân ' +
  'tay hoặc khuôn mặt cho tài khoản của họ.';

/**
 * Mô tả mức an toàn theo số người bảo hộ đã ghi danh.
 *
 * `count` âm hoặc không phải số nguyên đọc thành 0 — một con số vô nghĩa không
 * được biến thành một mức yên tâm hơn thực tế.
 */
export function describeGuardianSafety(count: number): GuardianSafety {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  if (n === 0) {
    return {
      level: 'none',
      headline: 'Chưa ai khôi phục hộ bạn được',
      body:
        'Mất máy và quên cụm 24 từ thì hiện chưa có đường nào lấy lại tài khoản. ' +
        'Hãy ghi danh ít nhất một người thân bạn tin.',
      unmeasured: UNMEASURED,
    };
  }

  if (n === 1) {
    return {
      level: 'single-point',
      headline: 'Chỉ một người — cả đường khôi phục dựa vào một người',
      body:
        'Người này mất máy, đổi số, hay không liên lạc được thì đường khôi phục của ' +
        'bạn đứt hẳn. Hãy ghi danh thêm người thứ hai, tốt nhất là người ở nơi khác ' +
        'và dùng máy khác.',
      unmeasured: UNMEASURED,
    };
  }

  if (n === 2) {
    return {
      level: 'thin',
      headline: 'Hai người — vẫn mỏng',
      body:
        'Một người không liên lạc được là chỉ còn một. Thêm người thứ ba thì mất ' +
        'liên lạc với một người vẫn còn đường đi.',
      unmeasured: UNMEASURED,
    };
  }

  return {
    level: 'spread',
    // CHỈ nói con số. Không "an toàn", không "đủ", không "yên tâm" — app không đo
    // được điều đó, và nói thay là nói hộ một phép đo chưa ai chạy.
    headline: `Đã ghi danh ${n} người`,
    body:
      'Càng nhiều người ở nhiều nơi, nhiều máy khác nhau thì đường khôi phục càng ' +
      'khó đứt cùng lúc.',
    unmeasured: UNMEASURED,
  };
}
