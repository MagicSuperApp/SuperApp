/**
 * MỖI BƯỚC `pod install` PHẢI CÓ CỔNG CANH BẢN KHAI QUYỀN RIÊNG TƯ ĐI KÈM.
 *
 * `ios/SuperApp/PrivacyInfo.xcprivacy` là tệp Apple ĐỌC khi duyệt bản nộp. `pod
 * install` ghi lại nhiều thứ dưới `ios/`, và một nhà khác trong hệ báo gặp ca tệp
 * này bị ghi cụt. Mất nó thì bản dựng vẫn xanh, `.ipa` vẫn ra, chỗ hỏng chỉ lộ ở
 * khâu duyệt — sau khi đã tốn một lượt nộp.
 *
 * ── Vì sao bài này tồn tại, chứ không chỉ cái cổng ──────────────────────────
 * Bản đầu của cổng đó đặt ở MỘT chỗ. `codemagic.yaml` khai `CocoaPods install` ở
 * HAI chỗ, và hai chỗ đó phục vụ BỐN luồng iOS qua neo YAML. Nên bản đầu phủ đúng
 * `ios-adhoc-ipa` — luồng dựng thử — và để ba luồng NỘP BẢN THẬT đi qua cửa mở.
 * Tức nó gác đúng luồng không cần gác, và mở đúng ba luồng nó sinh ra để canh.
 * Đó là §"Cổng phải gác MỌI lối vào khái niệm đó", và nó lặp lại được.
 *
 * ── Bài này đo bằng CẶP, không đo bằng tên luồng ────────────────────────────
 * Kho này không có thư viện đọc YAML (cố ý — không thêm phụ thuộc cho một phép
 * kiểm), nên không tra được neo YAML từ văn bản. Nhưng bất biến cần giữ không
 * cần tới neo: **mỗi `CocoaPods install` phải có cổng đứng NGAY SAU.** Giữ được
 * bất biến đó thì neo tự mang cả cặp đi tới mọi luồng dùng nó — dù sau này có
 * thêm luồng thứ năm, thứ sáu.
 *
 * ── Bài này KHÔNG đo gì ─────────────────────────────────────────────────────
 * Không đo cổng có CHẠY ĐÚNG không (việc đó cần một lượt dựng thật), cũng không
 * đo nội dung bản khai có hợp lệ với Apple không. Chỉ đo một điều: không có bước
 * `pod install` nào đứng trần.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const CM = readFileSync(join(__dirname, '..', '..', 'codemagic.yaml'), 'utf8');
const DONG = CM.split('\n');

const LA_POD = (s: string) => /^\s*- name: CocoaPods install\s*$/.test(s);
const LA_CONG = (s: string) => /^\s*- name: Bản khai quyền riêng tư còn nguyên sau pod install\s*$/.test(s);

const viTri = (test: (s: string) => boolean) =>
  DONG.map((s, i) => (test(s) ? i : -1)).filter((i) => i >= 0);

describe('cổng bản khai quyền riêng tư', () => {
  it('có ít nhất một bước `pod install` — nếu không thì bài này đang đo hư không', () => {
    // Ca đối chứng: bài dưới ("số cổng bằng số pod") sẽ ĐẠT một cách vô nghĩa khi
    // cả hai bằng 0. Chốt này là thứ làm nó không tự xanh.
    expect(viTri(LA_POD).length).toBeGreaterThan(0);
  });

  it('số cổng BẰNG số bước `pod install`', () => {
    expect(viTri(LA_CONG).length).toBe(viTri(LA_POD).length);
  });

  it('mỗi cổng đứng NGAY SAU bước `pod install` của nó, không xen bước khác', () => {
    // "Ngay sau" = giữa hai dòng `- name:` đó không có dòng `- name:` thứ ba.
    const pods = viTri(LA_POD);
    const congs = viTri(LA_CONG);
    for (let k = 0; k < pods.length; k++) {
      const p = pods[k];
      const c = congs[k];
      expect(c).toBeGreaterThan(p);
      const xen = DONG.slice(p + 1, c).filter((s) => /^\s*- name:/.test(s));
      expect(xen).toEqual([]);
    }
  });

  it('cổng đo bằng `git diff`, KHÔNG đo bằng "tệp có tồn tại"', () => {
    // Một tệp bị ghi rỗng vẫn tồn tại — đó đúng là hình dạng hỏng được báo.
    const than = CM.slice(CM.indexOf('Bản khai quyền riêng tư còn nguyên'));
    expect(than).toContain('git diff --quiet -- "$MANIFEST"');
  });

  it('cổng FAIL-SAFE: không đo được thì ĐỎ, không im', () => {
    // Chiều đúng cho cổng CI theo bảng ở Forall: cổng chặn thao tác hỏng thì người
    // BIẾT mình bị chặn; cổng CI cho qua thì không ai biết, và màu xanh đó đi thẳng
    // vào quyết định nộp bản.
    const than = CM.slice(CM.indexOf('Bản khai quyền riêng tư còn nguyên'));
    expect(than).toContain('CỔNG KHÔNG CHẠY ĐƯỢC');
  });

  it('đường dẫn cổng canh trỏ đúng tệp đang được git theo dõi', () => {
    expect(CM).toContain('MANIFEST=ios/SuperApp/PrivacyInfo.xcprivacy');
  });
});
