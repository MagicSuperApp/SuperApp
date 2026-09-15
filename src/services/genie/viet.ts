// services/genie/viet.ts
//
// Chuẩn hoá tiếng Việt cho khâu khớp câu của trợ lý — bản CHẠY TRÊN MÁY.
//
// Đây là bản sao có chủ đích của `Genie/src/rag/viet.js`. Hai bản phải cho cùng
// kết quả, và `fastPath.test.ts` canh bằng đúng bộ ca của bên kia. Vì sao chép
// chứ không chia sẻ: Genie là một service Node riêng (không npm dependency), còn
// đây là gói app — nối hai bên bằng một package chung là thêm một bước dựng cho
// một tệp 80 dòng.
//
// ── BA CHỖ HỎNG, GẶP NGAY Ở CÂU ĐẦU TIÊN ────────────────────────────────────
//
// 1. Tách theo khoảng trắng là SAI ĐƠN VỊ. "thêm vườn" là một ý, hai âm tiết —
//    khớp theo từng âm tiết rời thì "thêm" trúng cả "thêm cây", "thêm đàn".
//    ⇒ khớp theo CỤM âm tiết liền nhau (`chuaCum`).
//
// 2. Người gõ KHÔNG DẤU. "them vuon", "ghi lich su". Với người 55 tuổi gõ một
//    ngón thì đây là mặc định, không phải ngoại lệ. ⇒ so sánh trên bản đã bỏ dấu.
//
// 3. ASR nghe LỆCH THANH ĐIỆU. "vườn"→"vương", "bón"→"bon". Bỏ dấu đã gánh phần
//    lớn; phần còn lại là lệch phụ âm cuối, xử bằng độ chịu lệch 1 ký tự.
//
// ⚠ Độ chịu lệch chỉ áp cho âm tiết ≥ 4 ký tự. Dưới ngưỡng đó, lệch một ký tự là
//   đổi hẳn từ: "bo" · "ba" · "bi" — và một trong số đó có thể là con vật của
//   người ta.

/** Dấu tổ hợp Unicode sau khi tách NFD. */
const COMBINING = /[̀-ͯ]/g;

/**
 * Dấu câu cắt bỏ. Khai TƯỜNG MINH thay vì dùng `\p{L}`/`\p{N}`: lớp ký tự
 * Unicode phụ thuộc phiên bản máy JS, và khi nó không được hỗ trợ thì regex ném
 * lúc CHẠY chứ không lúc dựng — tức là hỏng trên máy người dùng, không hỏng trên
 * máy lập trình viên.
 */
const PUNCT = /[.,!?;:'"`^~*+=<>@#$%&(){}\[\]/\\|_\-–—…]+/g;

/**
 * Bỏ dấu tiếng Việt.
 *
 * `đ` → `d` phải làm TAY: NFD không tách `đ` vì nó là một ký tự riêng, không phải
 * `d` cộng dấu. Quên chỗ này thì "đàn"/"dan" không bao giờ khớp nhau, và nó hỏng
 * CÂM — chỉ một phần từ vựng trượt, phần còn lại vẫn chạy nên không ai để ý.
 */
export function boDau(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Thường hoá, bỏ dấu câu, gộp khoảng trắng. GIỮ nguyên dấu thanh. */
export function chuanHoa(s: string): string {
  return String(s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Âm tiết = "từ" theo khoảng trắng sau chuẩn hoá. Tiếng Việt viết rời âm tiết. */
export function amTiet(s: string): string[] {
  const c = chuanHoa(s);
  return c ? c.split(' ') : [];
}

/** Levenshtein có trần — dừng sớm khi đã chắc vượt trần. */
function lev(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Hai âm tiết coi như MỘT, sau khi bỏ dấu.
 *
 * ⚠ Bỏ dấu gộp "bò" · "bơ" · "bố" · "bô" làm một. Đó là CÁI GIÁ của việc cho
 * người ta gõ không dấu, và nó chấp nhận được vì `utterances` là CỤM nhiều âm
 * tiết — một âm tiết nhập nhằng hiếm khi lật được cả cụm.
 */
export function gan(a: string, b: string): boolean {
  const x = boDau(a);
  const y = boDau(b);
  if (x === y) return true;
  if (x.length < 4 || y.length < 4) return false;
  return lev(x, y, 1) <= 1;
}

/**
 * Câu `hay` có chứa cụm `can` không, tính theo ÂM TIẾT LIỀN NHAU (có chịu lệch).
 *
 * Khớp theo âm tiết chứ không theo chuỗi con: `indexOf` trên chuỗi thì "vườn"
 * trúng cả trong "vườn ươm", và "thêm vườn ươm" hoá ra là "thêm vườn".
 *
 * @returns số âm tiết khớp được (0 nếu không chứa)
 */
export function chuaCum(hay: string, can: string): number {
  const H = amTiet(hay);
  const C = amTiet(can);
  if (!C.length || C.length > H.length) return 0;
  for (let i = 0; i + C.length <= H.length; i += 1) {
    let ok = true;
    for (let j = 0; j < C.length; j += 1) {
      if (!gan(H[i + j], C[j])) {
        ok = false;
        break;
      }
    }
    if (ok) return C.length;
  }
  return 0;
}
