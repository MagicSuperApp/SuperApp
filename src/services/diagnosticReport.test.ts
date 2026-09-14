import {
  MAX_ENTRIES,
  buildDiagnosticReport,
  diagEntries,
  recordDiag,
  resetDiag,
} from './diagnosticReport';
import { redactForbidden } from './telemetryGate';

beforeEach(() => resetDiag());

describe('báo cáo thử thực địa — thứ người thử gửi về khi KHÔNG có máy chủ nào', () => {
  it('ghi cả thông báo THÀNH CÔNG, vì họ lỗi cần bắt không ném lỗi nào', () => {
    recordDiag('success', 'Đã lưu', 'Ghi nhận hoạt động thành công.');
    const ds = diagEntries();
    expect(ds).toHaveLength(1);
    expect(ds[0].kind).toBe('success');
    expect(buildDiagnosticReport({})).toContain('Đã lưu');
  });

  it('bốn loại thông báo đều vào báo cáo — không loại nào bị bỏ im', () => {
    recordDiag('error', 'E', 'e');
    recordDiag('warning', 'W', 'w');
    recordDiag('success', 'S', 's');
    recordDiag('info', 'I', 'i');
    const s = buildDiagnosticReport({});
    for (const t of ['E', 'W', 'S', 'I']) expect(s).toContain(t);
  });

  it('giữ ĐÚNG THỨ TỰ thời gian, mới nhất ở cuối — đây là lý do báo cáo dùng được', () => {
    recordDiag('info', 'một', '');
    recordDiag('info', 'hai', '');
    recordDiag('error', 'ba', '');
    const s = buildDiagnosticReport({});
    expect(s.indexOf('một')).toBeLessThan(s.indexOf('hai'));
    expect(s.indexOf('hai')).toBeLessThan(s.indexOf('ba'));
  });

  it('quá hạn thì bỏ dòng CŨ, giữ dòng MỚI — hỏng lúc nào cũng ở cuối', () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) recordDiag('info', `d${i}`, '');
    const ds = diagEntries();
    expect(ds).toHaveLength(MAX_ENTRIES);
    expect(ds[0].title).toBe('d5');
    expect(ds[ds.length - 1].title).toBe(`d${MAX_ENTRIES + 4}`);
  });

  it('CHƯA có dòng nào thì báo cáo phải NÓI RA — không được trông như một lượt chạy êm', () => {
    const s = buildDiagnosticReport({ Bản: 'CheckFarm v2.0 (64)' });
    // Phần đầu vẫn có, nên nó KHÔNG rỗng — và đó đúng là cái bẫy.
    expect(s).toContain('CheckFarm v2.0 (64)');
    expect(s).toMatch(/chưa có dòng nào/i);
    expect(s).toMatch(/cơ chế ghi đã hỏng/i);
  });

  it('phần đầu bỏ QUA trường rỗng, không in nhãn treo lơ lửng', () => {
    const s = buildDiagnosticReport({ Bản: 'X', Nhánh: '', 'Mã lượt dựng': '   ' });
    expect(s).toContain('Bản: X');
    expect(s).not.toContain('Nhánh:');
    expect(s).not.toContain('Mã lượt dựng:');
  });
});

describe('che bí mật — báo cáo đi qua tay người, nên phải che ĐOẠN chứ không xoá CÂU', () => {
  const CUM_KHOI_PHUC =
    'abandon ability able about above absent absorb abstract absurd abuse access accident';

  it('cụm từ khôi phục lọt vào thông điệp lỗi thì bị che, phần còn lại của câu GIỮ NGUYÊN', () => {
    recordDiag('error', 'Lỗi nạp ví', `Không đọc được: ${CUM_KHOI_PHUC} — thử lại sau.`);
    const s = buildDiagnosticReport({});
    expect(s).not.toContain('abandon ability able');
    expect(s).toContain('[bỏ:recovery-phrase]');
    // Đây là vế quan trọng: nếu che cả câu thì dòng duy nhất có giá trị mất sạch.
    expect(s).toContain('Không đọc được:');
    expect(s).toContain('thử lại sau');
  });

  it('64 ký tự hex và địa chỉ ví cũng bị che, mỗi thứ để lại nhãn riêng', () => {
    const hex = 'a'.repeat(64);
    const r1 = redactForbidden(`khoá ${hex} hỏng`);
    expect(r1.text).toContain('[bỏ:hex-64]');
    expect(r1.text).toContain('hỏng');

    const r2 = redactForbidden('gửi tới addr_test1qzabcdefghijklmnopqrstuvwxyz0123 rồi');
    expect(r2.text).toContain('[bỏ:wallet-address]');
    expect(r2.text).toContain('rồi');
  });

  it('câu chẩn đoán BÌNH THƯỜNG đi qua nguyên vẹn — che rộng quá thì báo cáo vô dụng', () => {
    const cau =
      'Máy chủ từ chối: uy tín 46,3 dưới ngưỡng 50,0. Mở https://orilife.vn/api/farms để đối chiếu.';
    const r = redactForbidden(cau);
    expect(r.text).toBe(cau);
    expect(r.dropped).toEqual([]);
  });

  it('hai mẫu khớp cùng lúc thì kể ĐỦ HAI tên — kể một là người đọc tưởng đã sạch', () => {
    const r = redactForbidden(`${'b'.repeat(64)} và ${CUM_KHOI_PHUC}`);
    expect(new Set(r.dropped)).toEqual(new Set(['recovery-phrase', 'hex-64']));
  });

  it('gọi lại nhiều lần cho CÙNG kết quả — mẫu dùng chung không được mang `lastIndex` trôi', () => {
    const cau = `x ${'c'.repeat(64)} y`;
    const lan1 = redactForbidden(cau).text;
    const lan2 = redactForbidden(cau).text;
    const lan3 = redactForbidden(cau).text;
    expect(lan2).toBe(lan1);
    expect(lan3).toBe(lan1);
  });
});
