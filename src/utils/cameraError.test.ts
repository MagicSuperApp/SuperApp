/**
 * Ghim MỘT điều: ba nguyên nhân mở máy ảnh hỏng phải ra BA câu khác nhau.
 *
 * Bản trước gộp cả ba vào một câu "kiểm tra lại quyền dùng máy ảnh". Đo trên máy ảo
 * iPhone 17 ngày 14/09/2026: quyền vừa được cấp xong (bấm **Allow**), chọn "Tưới
 * nước" ở `ActivityScreen`, và màn hiện đúng câu đó. Quyền đang BẬT; thứ thiếu là
 * cái máy ảnh. Người dùng được chỉ sang Cài đặt và không có gì để sửa ở đó.
 *
 * Nên bài này không hỏi "có câu nào hiện ra không" — câu nào cũng hiện ra ở bản cũ.
 * Nó hỏi **ba ca có phân biệt được nhau không**, vì đó mới là thứ bản cũ trượt.
 */
import { cameraErrorBody } from './cameraError';

describe('cameraErrorBody — ba mã, ba câu, không câu nào trùng câu nào', () => {
  // `tk` trả câu theo ngôn ngữ ĐANG CHẠY, và trong jest đó là tiếng Anh — nên khớp
  // theo một thứ tiếng thôi thì bài đỏ khi ai đó đổi ngôn ngữ mặc định, chứ không
  // phải khi mã sai. Hai mẫu dưới nhận cả hai thứ tiếng vì thứ cần ghim là NGHĨA.
  const NOI_VE_QUYEN = /quyền|permission|allow/i;
  const CHI_TOI_CAI_DAT = /Cài đặt|Settings/i;

  it('máy không có máy ảnh ⟹ KHÔNG được chỉ người dùng đi mở quyền', () => {
    const s = cameraErrorBody({ errorCode: 'camera_unavailable' });
    expect(s).toMatch(/chưa mở được máy ảnh|cannot open the camera/i);
    // Vế bắt lỗi: đây chính là câu bản cũ trả về cho ca này.
    expect(s).not.toMatch(NOI_VE_QUYEN);
    expect(s).not.toMatch(CHI_TOI_CAI_DAT);
  });

  it('ca không có máy ảnh phải nói rõ VIỆC HÔM NAY CHƯA VÀO SỔ, không chỉ kể lỗi', () => {
    // `ActivityScreen.canSave` đòi có tệp mới cho lưu, nên máy ảnh không mở được nghĩa
    // là buổi tưới/bón hôm nay không ghi được. Câu chỉ kể lỗi để người dùng tưởng đã
    // lưu xong rồi đi làm việc khác — hỏng đắt hơn chính cái lỗi máy ảnh.
    const s = cameraErrorBody({ errorCode: 'camera_unavailable' });
    expect(s).toMatch(/chưa ghi vào sổ|nothing has been recorded/i);
  });

  it('thiếu quyền ⟹ chỉ đúng chỗ bật quyền', () => {
    const s = cameraErrorBody({ errorCode: 'permission' });
    expect(s).toMatch(NOI_VE_QUYEN);
    expect(s).toMatch(CHI_TOI_CAI_DAT);
  });

  it('nguyên nhân thô ⟹ đưa MÃ tra ngược được, không đoán hướng dẫn', () => {
    const s = cameraErrorBody({ errorCode: 'others' });
    expect(s).toContain('others');
    // Không được mượn câu của hai ca kia — ở đây mình KHÔNG đo được trạng thái máy.
    expect(s).not.toMatch(CHI_TOI_CAI_DAT);
  });

  it('mã rỗng vẫn ra ca "không rõ", và nói rõ là không rõ', () => {
    expect(cameraErrorBody({})).toContain('unknown');
  });

  // ── Ba bài dưới ĐẢO DẤU một bài cũ, cố ý ────────────────────────────────────
  // Bài cũ ghim: "máy ảnh tự nói được thì để NÓ nói — lời của nó thắng câu của mình",
  // và nó XANH ở bản cũ. Chính sách đó sai: `errorMessage` của thư viện này là chuỗi
  // cho lập trình viên (`README.md:136` — *"use it for debug purpose only"*), một
  // trong các giá trị thật là câu tiếng Anh nói về `Manifest.permission.CAMERA`. Lật
  // chính sách thì phải đi tìm bài kiểm cũ và đảo dấu kỳ vọng của nó, chứ không để
  // nó nằm lại canh cho bản sai.
  it('`errorMessage` KHÔNG được làm cả câu — nó là chuỗi cho lập trình viên', () => {
    const s = cameraErrorBody({
      errorCode: 'others',
      errorMessage: 'This library does not require Manifest.permission.CAMERA',
    });
    expect(s).not.toBe('This library does not require Manifest.permission.CAMERA');
    // Câu hướng dẫn tiếng người vẫn phải còn nguyên ở đầu.
    expect(s).toMatch(/chụp lại màn hình|screenshot this message/i);
  });

  it('nhưng cũng KHÔNG được bỏ mất nó — nó là thứ duy nhất nói ca `others` là ca gì', () => {
    const s = cameraErrorBody({ errorCode: 'others', errorMessage: 'Activity error' });
    expect(s).toContain('Activity error');
    expect(s).toContain('others');
  });

  it('`errorMessage` KHÔNG được đè câu của hai ca ĐÃ BIẾT nguyên nhân', () => {
    // Ca `permission` có câu chỉ đúng chỗ bật quyền. Một chuỗi gỡ lỗi thay được câu
    // đó là mất đường đi duy nhất người dùng có.
    const s = cameraErrorBody({ errorCode: 'permission', errorMessage: 'SecurityException' });
    expect(s).toMatch(CHI_TOI_CAI_DAT);
    expect(s).not.toContain('SecurityException');
  });

  it('ba ca ra ba chuỗi ĐÔI MỘT khác nhau — nếu không bài trên chẳng kiểm gì', () => {
    const ba = ['camera_unavailable', 'permission', 'others'].map(c =>
      cameraErrorBody({ errorCode: c }),
    );
    expect(new Set(ba).size).toBe(3);
  });
});
