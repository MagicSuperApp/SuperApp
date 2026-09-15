/**
 * diagnosticReport — bản báo cáo người thử ĐI THỰC ĐỊA tự gửi về, không cần máy chủ.
 *
 * ── Vì sao tệp này tồn tại ───────────────────────────────────────────────────
 * Hai đường thu số liệu đang có (`analyticsApi`, `remoteLogger`) đều cần MỘT máy
 * chủ và MỘT khoá, và cả hai tự tắt khi thiếu cấu hình. Tắt là đúng chiều — thà
 * không gửi gì còn hơn gửi nhật ký người dùng lên một tên miền tạm. Nhưng nó để
 * lại một lỗ đúng ở chỗ cần nhất: đội đi vườn cả tuần, về không có một dòng nào,
 * và cái tắt ấy im lặng nên không ai biết là mình đang không thu được gì.
 *
 * Máy chủ đo lường KHÔNG phải điều kiện để gỡ lỗi. Điều kiện là biết:
 *   · người dùng ĐƯỢC BẢO cái gì, và vào lúc nào;
 *   · bản đang chạy là bản nào.
 * Hai thứ đó đều nằm sẵn trong máy. Tệp này chỉ giữ chúng lại rồi dựng thành một
 * đoạn văn bản người thử bấm một nút là gửi đi bằng Zalo hay thư — không hạ tầng,
 * không khoá, không thêm nhà cung cấp nào vào đường đi của dữ liệu.
 *
 * ── Vì sao ghi CẢ thông báo THÀNH CÔNG ──────────────────────────────────────
 * Họ lỗi đắt nhất của app này không phải lỗi ném ra: là màn hình nói "Đã lưu"
 * cho một lượt ghi máy chủ đã từ chối. Một bản ghi chỉ chứa lỗi thì không bắt
 * được ca đó — nó không có lỗi nào. Cặp dữ kiện phá được ca đó là "màn hình nói
 * Đã lưu lúc 10:32" đặt cạnh "máy chủ từ chối lúc 10:32". Nên ghi đủ bốn loại.
 *
 * ── Vì sao KHÔNG dùng `telemetryGate.filterBeforeSend` ─────────────────────
 * Cổng đó là danh sách CHO PHÉP theo tên trường, và nó đúng cho đường ra MẠNG:
 * ở đó không ai xem trước, nên thà mất một trường chẩn đoán. Báo cáo này đi
 * đường khác — người dùng thấy toàn văn trước khi gửi, và tự chọn gửi cho ai.
 * Chạy danh sách cho phép lên đây sẽ bỏ mất chính `title`/`body`, tức bỏ đúng
 * phần duy nhất có giá trị.
 *
 * Nhưng tầng HAI của cổng đó thì vẫn áp: `forbiddenShape` soi HÌNH DẠNG giá trị.
 * Một thông điệp lỗi có thể mang theo thứ thư viện bên ngoài nhét vào — cụm 24
 * từ khôi phục, một khoá, một thẻ phiên — và người thử sẽ dán nguyên vào nhóm
 * chat mà không biết mình vừa dán cái gì.
 */

import { redactForbidden } from './telemetryGate';

/** Loại thông báo đã hiện cho người dùng. Trùng `AlertType` của `alert.ts`. */
export type DiagKind = 'error' | 'warning' | 'success' | 'info';

export interface DiagEntry {
  /** Giờ máy, dạng ISO. Dùng để đặt cạnh nhật ký máy chủ. */
  at: string;
  kind: DiagKind;
  title: string;
  body: string;
}

/**
 * Số dòng giữ lại. Bốn mươi vì một lượt thử một luồng (chọn vườn → chọn cây →
 * chụp → lưu) sinh dưới mười thông báo; bốn mươi phủ được bốn lượt liền nhau mà
 * đoạn văn bản vẫn dán được vào một tin nhắn.
 */
export const MAX_ENTRIES = 40;

let ring: DiagEntry[] = [];

/**
 * Che đoạn mang hình dạng bí mật, GIỮ phần còn lại của câu — xem `redactForbidden`.
 * Dấu để lại có nhãn, vì che im lặng thì người đọc tưởng máy không nói gì.
 */
function scrub(text: string): string {
  return redactForbidden(text).text;
}

/**
 * Ghi một thông báo vừa hiện ra. Gọi từ `utils/alert.ts`, chỗ DUY NHẤT dựng hộp
 * thoại — đặt ở từng màn thì màn quên không có gì báo.
 */
export function recordDiag(kind: DiagKind, title: string, body: string): void {
  ring.push({
    at: new Date().toISOString(),
    kind,
    title: scrub(String(title ?? '')),
    body: scrub(String(body ?? '')),
  });
  if (ring.length > MAX_ENTRIES) ring = ring.slice(ring.length - MAX_ENTRIES);
}

/** Bản chụp hiện tại, mới nhất ở CUỐI (đọc xuôi như một dòng thời gian). */
export function diagEntries(): readonly DiagEntry[] {
  return ring.slice();
}

/** Chỉ dùng cho phép kiểm và cho nút "xoá" nếu về sau có. */
export function resetDiag(): void {
  ring = [];
}

const KIND_MARK: Record<DiagKind, string> = {
  error: '✖ lỗi',
  warning: '▲ cảnh báo',
  success: '✔ thành công',
  info: '· thông tin',
};

/** Giờ phút giây, bỏ phần ngày — báo cáo đã có ngày ở đầu. */
function clockOf(iso: string): string {
  const t = iso.indexOf('T');
  return t < 0 ? iso : iso.slice(t + 1, t + 9);
}

/**
 * Dựng đoạn văn bản để gửi.
 *
 * `head` là các dòng nhận dạng bản dựng (phiên bản, số bản dựng, commit, máy
 * chủ, nền) — người gọi đưa vào, vì chúng nằm ở màn Tài khoản chứ không ở đây.
 *
 * Ràng buộc hình dạng: khi CHƯA ghi được dòng nào, báo cáo phải NÓI RA điều đó.
 * Một báo cáo chỉ có phần đầu trông y như một báo cáo đầy đủ của một lượt chạy
 * êm — mà nó lại là dấu hiệu cơ chế ghi đã chết.
 */
export function buildDiagnosticReport(head: Record<string, string>): string {
  const now = new Date();
  const lines: string[] = [
    `BÁO CÁO THỬ THỰC ĐỊA — ${now.toISOString().slice(0, 19).replace('T', ' ')}`,
    '',
  ];

  for (const [k, v] of Object.entries(head)) {
    if (String(v ?? '').trim()) lines.push(`${k}: ${v}`);
  }

  lines.push('', `NHỮNG GÌ MÁY ĐÃ HIỆN RA (${ring.length}/${MAX_ENTRIES} dòng gần nhất)`);

  if (ring.length === 0) {
    lines.push(
      '(chưa có dòng nào — hoặc app vừa mở lại, hoặc chưa hiện thông báo nào.',
      ' Nếu vừa gặp lỗi mà chỗ này trống thì chính cơ chế ghi đã hỏng: nói lại giúp.)',
    );
  } else {
    for (const e of ring) {
      lines.push(`${clockOf(e.at)} ${KIND_MARK[e.kind]} — ${e.title}`);
      if (e.body) lines.push(`    ${e.body.replace(/\n/g, '\n    ')}`);
    }
  }

  lines.push(
    '',
    'Người thử ghi thêm (đang làm gì, bấm gì, mong đợi gì):',
    '- ',
  );

  return lines.join('\n');
}
