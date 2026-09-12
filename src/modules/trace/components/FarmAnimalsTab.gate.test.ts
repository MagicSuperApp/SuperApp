/**
 * Cổng nguồn cho TAB VẬT NUÔI và thanh tab của màn chi tiết vườn.
 *
 * ⛔ Yêu cầu từ thực địa: *"nút mở màn quản lý Vật nuôi đang đặt ở vị trí rất
 *    thiếu chuyên nghiệp"*. Đi đo thì "thiếu chuyên nghiệp" là ba thứ đếm được,
 *    và bài này giữ cho cả ba đừng quay lại:
 *
 *   1. SAI CẤP. Vật nuôi là một NHÁNH nội dung ngang hàng với cây — nó có danh
 *      sách riêng, bộ lọc riêng, luồng nhận diện riêng. Nó từng là một ô nhỏ
 *      nằm cạnh "Chỉ đường tới vườn", tức ngang hàng với một việc bấm phát xong.
 *
 *   2. TỰ ẨN HIỆN. Cả hàng ô đó chỉ dựng khi `dichDuong || farm?.id`, nên lối
 *      vào một nửa nội dung của vườn có mặt hay không tuỳ vào việc vườn đã vẽ
 *      ranh giới hay chưa — một lý do chẳng liên quan gì tới nó.
 *
 *   3. CUỘN MẤT. Ô đó nằm trong `bentoHeader`, mà phần đầu Bento cuộn theo danh
 *      sách cây. Xem tới cây thứ 90 thì lối sang đàn biến mất khỏi màn.
 *
 * Bài này đo MÃ NGUỒN, cùng khuôn và cùng lý do với các `.gate.test.ts` bên
 * cạnh: dựng cả màn chi tiết vườn trong jest kéo theo bản đồ, máy ảnh, native.
 * Nó KHÔNG đo tab có đẹp không — phép đo cuối cho câu đó là mở máy thật.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const doc = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const TAB = doc(join(__dirname, 'FarmAnimalsTab.tsx'));
const MAN = doc(join(__dirname, '..', 'screens', 'FarmDetailScreen.tsx'));
const THAN = doc(join(__dirname, 'animal', 'AnimalWizard.tsx'));

/** Chỉ giữ MÃ CHẠY — chú thích giải thích một lỗi luôn NHẮC TÊN lỗi đó. */
const chay = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const MA_TAB = chay(TAB);
const MA_THAN = chay(THAN);
const MA_MAN = chay(MAN);
const dem = (s: string, needle: string) => s.split(needle).length - 1;

describe('vật nuôi là một NHÁNH, không phải một ô hành động', () => {
  it('màn có thanh tab với đủ hai nhánh', () => {
    expect(MA_MAN).toContain('styles.tabBar');
    expect(MA_MAN).toContain("nhan: 'Cây trồng'");
    expect(MA_MAN).toContain("nhan: 'Vật nuôi'");
  });

  it('thanh tab đứng NGOÀI phần cuộn được', () => {
    // Trong `bentoHeader` thì nó cuộn theo danh sách cây và biến mất khỏi màn ở
    // cây thứ 90 — đúng một trong ba lỗi bài này giữ.
    const dauHeader = MA_MAN.indexOf('const bentoHeader');
    const cuoiHeader = MA_MAN.indexOf('return (', dauHeader);
    const tab = MA_MAN.indexOf('styles.tabBar');
    expect(dauHeader).toBeGreaterThan(-1);
    expect(tab).toBeGreaterThan(cuoiHeader);
  });

  it('ô "Vật nuôi" trong lưới Bento KHÔNG quay lại', () => {
    // Lưới Bento là của nhánh CÂY. Một ô mở sang nhánh kia đặt ở đó là dựng lại
    // đúng cái vừa gỡ, chỉ khác chỗ đứng.
    expect(MA_MAN).not.toContain('AnimalManagement');
    const i = MA_MAN.indexOf('styles.bentoActions');
    expect(i).toBeGreaterThan(-1);
    expect(MA_MAN.slice(i, MA_MAN.indexOf('</BentoRow>', i))).not.toContain('paw');
  });

  it('hàng ô hành động KHÔNG còn phụ thuộc `farm?.id` để có mặt', () => {
    // Nó chỉ còn chứa chỉ đường, nên điều kiện duy nhất đúng là có đường để chỉ.
    expect(MA_MAN).not.toContain('{dichDuong || farm?.id ?');
  });

  it('tab vật nuôi chỉ dựng khi BIẾT mã vườn', () => {
    // Sổ đàn lọc theo `farmId`; mở nó không kèm mã thì nó liệt kê vật nuôi của
    // MỌI vườn dưới tiêu đề một vườn.
    const i = MA_MAN.indexOf('<FarmAnimalsTab');
    expect(i).toBeGreaterThan(-1);
    expect(MA_MAN.slice(i, i + 160)).toContain('farmId={String(farm.id)}');
    expect(MA_MAN.slice(Math.max(0, i - 200), i)).toContain('farm?.id ?');
  });
});

describe('tab vật nuôi theo đúng luật Bento của tab cây', () => {
  it('có ô hero, và nó là ô trả lời "vườn đang nuôi gì"', () => {
    expect(MA_TAB).toContain('<BentoTile tone="heroBarn"');
    expect(MA_TAB).toContain('Cơ cấu đàn');
  });

  it('đúng MỘT ô tối trong trang', () => {
    // Luật Bento: hai ô tối là không ô nào còn làm được dấu "khác loại".
    // Ô tối của nhánh vật nuôi là `earth` (nâu), của nhánh cây là `space` (xanh
    // đen) — hai trang không bao giờ hiện cùng lúc nên luật vẫn đúng.
    expect(dem(MA_TAB, 'tone="earth"')).toBe(1);
    expect(MA_TAB).not.toContain('tone="space"');
  });

  it('chữ trong ô tối là chữ SÁNG', () => {
    // Ô không tự đổi màu chữ của con — nó không biết con là chữ hay hình.
    const i = MA_TAB.indexOf('tone="earth"');
    const khoi = MA_TAB.slice(i, MA_TAB.indexOf('</BentoTile>', i));
    expect(khoi).toContain('styles.oTxtToi');
    expect(khoi).not.toContain('styles.oTxt}');

    const kieu = MA_TAB.indexOf('oTxtToi: {');
    expect(MA_TAB.slice(kieu, kieu + 140)).toContain('ORG_NATURE.paper');
  });

  it('nhánh vật nuôi nói bằng NÂU, không mượn sắc của nhánh cây', () => {
    // Xanh lá là màu nhánh cây trồng. Một mảng xanh giữa trang nâu đọc ra "thứ
    // này thuộc chỗ khác" — kể cả cái vòng quanh nút cá thể, nên `RingProgress`
    // nhận màu qua tham số chứ không gõ cứng `TONE.primary` nữa.
    expect(MA_TAB).toContain('mau={ORG_TONE.barn}');
    expect(MA_TAB).toContain('name="actionBarn"');
    expect(MA_THAN).toContain('name="actionBarn"');
  });
});

describe('không con số nào được bịa ra', () => {
  it('số ảnh CHƯA BIẾT khác hẳn số ảnh BẰNG KHÔNG', () => {
    // `?? 0` ở đây dựng một con số mang hình dạng số đo mà không ai đo: "0 ảnh"
    // nói cá thể chưa có tấm nào, trong khi thật ra app không hỏi được.
    expect(MA_TAB).not.toContain('n_images ?? 0');
    expect(MA_TAB).toContain('item.n_images == null');
  });

  it('vòng quanh nút đo ĐÚNG thứ nó nói: hồ sơ ảnh so với mức tối thiểu', () => {
    const i = MA_TAB.indexOf('export function pctHoSo');
    expect(i).toBeGreaterThan(-1);
    const than = MA_TAB.slice(i, MA_TAB.indexOf('\n}', i));
    expect(than).toContain('ANH_TOI_THIEU');
    // Không phải số → CHƯA BIẾT, không phải 0. `RingProgress` vẽ nét đứt.
    expect(than).toContain('return null');
  });

  it('mức tối thiểu chỉ được khai MỘT chỗ', () => {
    // Trước đây con số này nằm rời ở hai tệp và bài kiểm phải so chúng với nhau.
    // Hai bản chép tay thì sớm muộn cũng lệch, và lúc lệch thì vòng quanh nút
    // báo "đủ ảnh" trong khi máy chủ vẫn coi hồ sơ là thiếu. Nay luồng đăng ký
    // xuất ra hằng đó và tab NHẬP về dùng.
    expect(MA_THAN).toMatch(/export const ANH_TOI_THIEU = \d+/);
    expect(MA_TAB).toContain("ANH_TOI_THIEU } from './animal/AnimalWizard'");
    expect(MA_TAB).not.toMatch(/const ANH_TOI_THIEU = \d+/);
  });
});

describe('danh sách rỗng vì HỎNG khác danh sách rỗng vì TRỐNG', () => {
  it('lỗi tải ra màn lỗi kèm nút thử lại, không ra lời mời thêm cá thể', () => {
    // "Vườn chưa có vật nuôi" là một khẳng định về dữ liệu của người dùng; app
    // chỉ được nói câu đó khi nó thật sự hỏi được máy chủ.
    const i = MA_TAB.indexOf('ListEmptyComponent');
    expect(i).toBeGreaterThan(-1);
    const khoi = MA_TAB.slice(i, MA_TAB.indexOf('ListFooterComponent', i));
    expect(khoi.indexOf('status="error"')).toBeGreaterThan(-1);
    // Nhánh lỗi phải đứng TRƯỚC nhánh rỗng, nếu không nó không bao giờ tới.
    expect(khoi.indexOf('status="error"')).toBeLessThan(khoi.indexOf('status="empty"'));
  });

  it('tải thiếu giữa chừng vẫn được nói ra', () => {
    // Một danh sách thiếu mà không nói gì là một danh sách nói dối: người dùng
    // gõ tên một con có thật và màn báo không tìm thấy.
    expect(MA_TAB).toContain('{loi && dan.length > 0 ?');
  });

  it('lọc tại máy chỉ chạy trên danh sách đã gom ĐỦ, và trần thì nói ra', () => {
    expect(MA_TAB).toContain('TRAN_TAI');
    expect(MA_TAB).toContain('quaTran');
  });
});

describe('biểu tượng loài lấy từ bộ ĐANG dùng ở module này', () => {
  it('KHÔNG mượn `speciesIcon` của bộ MaterialCommunityIcons', () => {
    // Tên lạ không ném lỗi: `<Icon>` trả `null` và để lại một ô trống. Kiểu
    // hỏng chỉ lộ ra khi có người mở đúng màn đó.
    expect(MA_TAB).not.toContain('speciesIcon');
    expect(MA_TAB).toContain("from './animal/speciesFa'");
    expect(MA_THAN).toContain("from './speciesFa'");
    // Bảng tra chỉ còn MỘT bản — hai bản chép tay thì sớm muộn cũng lệch.
    const fa = doc(join(__dirname, 'animal', 'speciesFa.ts'));
    expect(fa).toContain('export const HINH_LOAI');
    expect(MA_TAB).not.toContain('const HINH_LOAI');
  });
});
