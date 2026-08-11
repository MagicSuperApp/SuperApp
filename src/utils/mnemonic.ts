/**
 * mnemonic — chuẩn hoá cụm từ khôi phục trước khi ĐẾM và trước khi đối chiếu BIP39.
 *
 * Người dùng chép cụm từ từ chỗ khác thường kéo theo số thứ tự ("1. abandon
 * 2. ability …"), dấu phẩy, gạch đầu dòng hay xuống dòng. Nhìn trên màn vẫn là 24
 * từ, nhưng cắt thô theo khoảng trắng thì ra 48 "từ" — nút Khôi phục khoá lại mà
 * không có gì chỉ ra chỗ sai. Bỏ chữ số + dấu câu rồi mới đếm.
 *
 * Cụm từ gửi đi khôi phục cũng phải dùng bản đã chuẩn hoá: BIP39 đối chiếu theo
 * TỪ, dấu câu dính vào là trượt hết wordlist.
 *
 * KHÔNG bỏ ký-tự có dấu / chữ không phải a–z: wordlist BIP39 có bản tiếng Pháp
 * (chữ có dấu) và tiếng Nhật (kana). Chỉ bỏ đúng chữ số và dấu câu.
 */

/** Chữ số + dấu câu hay dính vào cụm từ khi chép. */
const NOISE = /[0-9.,;:_|/\\()[\]{}"'“”‘’`~!?*+=<>@#$%^&–—-]+/g;

/** Cụm từ đã bỏ nhiễu, gộp khoảng trắng, viết thường. Chuỗi rỗng nếu không còn gì. */
export function normalizeMnemonic(raw: string): string {
  return raw.replace(NOISE, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Số từ THẬT của cụm từ (sau chuẩn hoá). */
export function countMnemonicWords(raw: string): number {
  const clean = normalizeMnemonic(raw);
  return clean ? clean.split(' ').length : 0;
}
