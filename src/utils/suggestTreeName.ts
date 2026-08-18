/**
 * suggestTreeName — đặt sẵn tên cho cây MỚI, để nông dân khỏi phải gõ.
 *
 * ── Vì sao ──────────────────────────────────────────────────────────────────
 * Đường QUẢ đã làm việc này từ lâu: `FruitCropperScreen` mở ra là ô tên đã có sẵn
 * "Quả {n+1}" (xem `FruitCropperScreen.tsx:270-271`). Đường CÂY thì không —
 * `TreeEnrollScreen` khởi tạo `useState('')`, và tên là một trong ba thứ CHẶN nút
 * "Đăng ký". Nghĩa là mỗi cây, người đứng giữa vườn phải mở bàn phím gõ tay một
 * lần. Vườn 50 cây là 50 lần, giữa nắng, tay bẩn, máy trơn.
 *
 * Tên gợi ý chỉ là chỗ ĐỖ TẠM — người dùng gõ đè lên bất cứ lúc nào. Nó không
 * thay quyền đặt tên, nó chỉ bỏ cái bắt buộc phải gõ.
 *
 * ── KHÔNG được trùng tên đã có ──────────────────────────────────────────────
 * Đếm số cây rồi +1 là chưa đủ: vườn có "Cây 1", "Cây 5" thì đếm ra 2, +1 thành
 * "Cây 3" — không trùng, nhưng vườn có "Cây 1","Cây 2","Mít" thì đếm ra 3, +1 là
 * "Cây 4" trong khi "Cây 3" còn trống, và tệ hơn: xoá "Cây 3" đi rồi thêm cây mới
 * là ra đúng một cái tên vừa bị xoá. Hai cây cùng tên trong một vườn thì mọi câu
 * "cây nào" sau đó đều mơ hồ — mà hồ sơ truy xuất sống bằng việc chỉ đúng cây.
 * Nên: lấy mốc là SỐ LỚN NHẤT đang dùng, rồi vẫn dò tiếp cho tới khi tên trống.
 *
 * ── Tiếng ───────────────────────────────────────────────────────────────────
 * `prefix` truyền từ ngoài vào (mặc định "Cây") để nơi gọi dịch được. Chưa nối vào
 * `tk()` ở đây vì đường quả cũng đang viết thẳng tiếng Việt — hai anh em cùng một
 * việc mà một bên dịch một bên không thì lệch còn khó lần hơn. Nối cả hai cùng lúc
 * là một việc riêng.
 */

/** Khớp đúng "Cây 12" — có số ở cuối, không có gì thêm. `Cây 12 góc` KHÔNG khớp. */
function numberedIndex(name: string, prefix: string): number | null {
  const m = name.trim().match(new RegExp(`^${prefix}\\s+(\\d+)$`, 'i'));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param existingNames tên các cây ĐANG có trong vườn (thứ tự không quan trọng)
 * @param prefix        tiền tố tên, mặc định `Cây`
 */
export function suggestTreeName(existingNames: readonly (string | null | undefined)[], prefix = 'Cây'): string {
  const names = (existingNames ?? []).map((n) => (n ?? '').trim()).filter(Boolean);
  const taken = new Set(names.map((n) => n.toLowerCase()));

  let start = names.length;
  for (const n of names) {
    const idx = numberedIndex(n, prefix);
    if (idx !== null && idx > start) start = idx;
  }

  // Dò từ mốc trở lên cho tới khi gặp tên chưa ai dùng. Trần để không quay vòng vô
  // hạn nếu dữ liệu bẩn (10.000 cây một vườn là đã sai từ chỗ khác rồi).
  for (let i = start + 1; i <= start + 10_000; i++) {
    const candidate = `${prefix} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${prefix} ${start + 1}`;
}
