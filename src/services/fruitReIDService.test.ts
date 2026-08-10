/**
 * Đường quả của nông dân — hai cổng từng NUỐT lỗi.
 *
 * Máy chủ OriLife từ chối bằng **HTTP 200 kèm `{ok:false}`** (cổng bồi góc), và
 * bằng **HTTP 409** mà `_apiCall` cố ý chuyển thành `{ok:true, data}` để caller
 * đọc cờ `duplicate` (cổng trùng quả). Cả hai bản cũ đều viết `if (r.ok) xong()`
 * ⟹ màn đóng lại như đã lưu, trong khi không có gì vào kho và không một chữ báo.
 *
 * Ngưỡng trùng dùng chung `ACCEPT_SIM = 0.72`; ở mức đó 73,0% (412/564) cặp
 * khác-quả-cùng-cây bị coi là khớp — nên đây không phải ca hiếm mà là ca nông
 * dân chạm liên tục từ quả thứ năm trở đi trên cùng một cây.
 */
import { outcomeOf } from './fruitReIDService';

describe('outcomeOf — ba nhánh, không phải hai', () => {
  it('tầng vận-chuyển hỏng → failed', () => {
    expect(outcomeOf({ ok: false, error: { type: 'network_error', detail: 'x', http_status: 0 } }))
      .toBe('failed');
  });

  it('HTTP 200 nhưng máy chủ TỪ CHỐI (`data.ok === false`) → needs_confirm, KHÔNG phải ok', () => {
    const r = { ok: true, data: { ok: false, warn: 'better_other' as const, message: 'Giống quả khác hơn.' } };
    expect(outcomeOf(r)).toBe('needs_confirm');
    expect(outcomeOf(r)).not.toBe('ok');
  });

  it('HTTP 409 trùng quả (đã được chuyển thành ok:true) → needs_confirm', () => {
    const r = { ok: true, data: { ok: false, duplicate: true, similar: { name: 'Quả 3' } } };
    expect(outcomeOf(r)).toBe('needs_confirm');
  });

  it('thành công thật → ok', () => {
    expect(outcomeOf({ ok: true, data: { ok: true, fruit_id: 'f1' } })).toBe('ok');
  });

  it('thân rỗng mà tầng vận-chuyển xanh → ok (một số endpoint không trả thân)', () => {
    expect(outcomeOf({ ok: true })).toBe('ok');
  });

  it('`ok` vắng mặt KHÔNG phải `false` — đừng nhầm undefined với từ chối', () => {
    expect(outcomeOf({ ok: true, data: {} })).toBe('ok');
  });

  it('KHÔNG lặp lại lỗi cũ: chỉ xét `r.ok` là bỏ qua ca máy chủ từ chối', () => {
    const tuChoi = { ok: true, data: { ok: false, message: 'Chưa chắc đây là quả đó.' } };
    // Đây là cách viết SAI đã gặp thật — giữ lại để chứng minh hàm không đồng ý.
    const sai = (r: { ok: boolean }) => (r.ok ? 'ok' : 'failed');
    expect(sai(tuChoi)).toBe('ok');            // bản cũ: đóng màn, mất dữ-liệu
    expect(outcomeOf(tuChoi)).toBe('needs_confirm');
  });
});
