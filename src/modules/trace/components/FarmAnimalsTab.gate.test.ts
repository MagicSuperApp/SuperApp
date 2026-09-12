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
    // này thuộc chỗ khác".
    expect(MA_TAB).toContain('name="actionBarn"');
    expect(MA_THAN).toContain('name="actionBarn"');
    expect(MA_TAB).not.toContain('ORG_TONE.primary');
  });
});

describe('thẻ cá thể: ô VUÔNG bo góc, ảnh trên, chữ dưới', () => {
  it('KHÔNG còn nút tròn', () => {
    // Nút tròn là khuôn của `TreeChip`, và ở đó nó có lý do: viền hình tròn
    // CHÍNH LÀ thanh tiến độ thu hoạch. Bên vật nuôi không có cung nào đáng vẽ,
    // nên hình tròn chỉ còn là cái khung cắt cụt bốn góc của mặt con vật.
    expect(MA_TAB).not.toContain('RingProgress');
    expect(MA_TAB).toContain('const AnimalCard');
  });

  it('ô ảnh VUÔNG suy theo bề ngang thẻ, không gõ chiều cao', () => {
    // Bề ngang thẻ suy từ bề ngang màn; một chiều cao cố định sẽ méo ô ảnh trên
    // máy hẹp và máy rộng theo hai kiểu khác nhau.
    const i = MA_TAB.indexOf('theAnh: {');
    expect(i).toBeGreaterThan(-1);
    expect(MA_TAB.slice(i, i + 200)).toContain('aspectRatio: 1');
  });

  it('vẫn là lưới BA cột, và bề ngang thẻ suy theo đúng số cột đó', () => {
    expect(MA_TAB).toContain('numColumns={3}');
    expect(MA_TAB).toContain('Math.floor((width - 12 * 2 - 12 * 2) / 3)');
  });

  it('chữ nằm DƯỚI ảnh, không đè lên ảnh', () => {
    // Chữ đè lên ảnh chụp thật thì đọc được hay không tuỳ vào ảnh — mà ảnh là
    // thứ app không kiểm soát. Một dải chữ riêng thì luôn đọc được.
    const i = MA_TAB.indexOf('theChu: {');
    expect(i).toBeGreaterThan(-1);
    expect(MA_TAB.slice(i, i + 160)).not.toContain("position: 'absolute'");
  });

  it('ba nguồn ảnh, đúng thứ tự, và nguồn cuối KHÔNG phải ô trống', () => {
    const i = MA_TAB.indexOf('const AnimalCard');
    const than = MA_TAB.slice(i, i + 2500);
    // 1) ảnh thật của chính con này → 2) ảnh loài → 3) biểu tượng.
    // Hai nguồn sau do `AnhLoai` lo, nên ở đây chỉ còn hai nhánh phải đúng thứ tự.
    expect(than.indexOf('dungAnhRieng')).toBeLessThan(than.indexOf('<AnhLoai'));
    expect(than).toContain('species={item.species}');
  });

  it('ảnh riêng CHẾT thì tụt xuống ảnh loài, không để lại ô trống', () => {
    // Ảnh nằm trong vùng nhớ tạm của máy ảnh — Android dọn khi thiếu chỗ. Tin
    // rằng "có khoá trong bảng thì có ảnh trên đĩa" là chỗ sinh ra ô đen.
    const i = MA_TAB.indexOf('const AnimalCard');
    const than = MA_TAB.slice(i, i + 2500);
    expect(than).toContain('onError={() => setHongAnh(true)}');
    expect(than).toContain('!!anhRieng && !hongAnh');
  });

  it('số ảnh là HUY HIỆU ở góc, và `null` ra dấu hỏi chứ không ra 0', () => {
    expect(MA_TAB).toContain('theHuyHieu');
    const i = MA_TAB.indexOf('theHuyHieuTxt}>');
    expect(MA_TAB.slice(i, i + 120)).toContain("item.n_images == null ? '?'");
    const kieu = MA_TAB.indexOf('theHuyHieu: {');
    expect(MA_TAB.slice(kieu, kieu + 120)).toContain("position: 'absolute'");
  });
});

describe('chip lọc loài: ảnh loài + số dạng huy hiệu', () => {
  it('chip dùng ẢNH loài, rơi về biểu tượng khi thiếu', () => {
    // Soi TỪ lời gắn style của chip TỚI thẻ đóng của nó, không soi một cửa sổ
    // đếm ký tự: cửa sổ cố định co lại thành sai ngay khi ai đó thêm một dòng.
    const i = MA_TAB.indexOf('styles.chipLoc, on && styles.chipLocOn');
    expect(i).toBeGreaterThan(-1);
    const khoi = MA_TAB.slice(i, MA_TAB.indexOf('</TouchableOpacity>', i));
    expect(khoi).toContain('<AnhLoai');
  });

  it('con số tách khỏi nhãn thành huy hiệu riêng', () => {
    // "Gà 12" dính liền đọc ra một cái tên; mắt phải tách ra mới thấy 12 là số
    // lượng. Huy hiệu làm việc tách đó bằng hình, không bắt người đọc làm.
    expect(MA_TAB).toContain('styles.chipLocSo');
    const i = MA_TAB.indexOf('chipLocSo: {');
    expect(i).toBeGreaterThan(-1);
    expect(MA_TAB.slice(i, i + 200)).toContain('borderRadius: 999');
  });

  it('ô "Tất cả" KHÔNG mượn ảnh của một loài bất kỳ', () => {
    // Nó là cả sáu loài; lấy hình con gà đại diện là nói sai.
    const i = MA_TAB.indexOf('styles.chipLoc, on && styles.chipLocOn');
    const khoi = MA_TAB.slice(i, MA_TAB.indexOf('</TouchableOpacity>', i));
    expect(khoi).toContain('khoa ? (');
    expect(khoi).toContain('name="paw"');
  });
});

describe('ảnh cá thể: máy chủ không trả, nên app tự giữ', () => {
  const CACHE = doc(join(__dirname, '..', 'utils', 'animalPhotoCache.ts'));

  it('luồng đăng ký nhớ lại một tấm, và KHÔNG chặn người dùng vì lượt ghi đó', () => {
    expect(MA_THAN).toContain('luuAnhCaThe(res.data.animal_did');
    // `void`, không `await`: đăng ký đã xong trên máy chủ rồi.
    expect(MA_THAN).toContain('void luuAnhCaThe');
  });

  it('đọc hỏng thì trả bảng RỖNG, không ném', () => {
    // Mất ảnh trang trí không được phép làm hỏng cả sổ đàn.
    const i = CACHE.indexOf('export async function docAnhCaThe');
    expect(i).toBeGreaterThan(-1);
    expect(CACHE.slice(i, i + 700)).toContain('return {}');
  });

  it('có trần số mục, không lớn vô hạn', () => {
    expect(CACHE).toMatch(/export const TRAN_MUC = \d+/);
  });
});

describe('không con số nào được bịa ra', () => {
  it('số ảnh CHƯA BIẾT khác hẳn số ảnh BẰNG KHÔNG', () => {
    // `?? 0` ở đây dựng một con số mang hình dạng số đo mà không ai đo: "0 ảnh"
    // nói cá thể chưa có tấm nào, trong khi thật ra app không hỏi được.
    expect(MA_TAB).not.toContain('n_images ?? 0');
    expect(MA_TAB).toContain('item.n_images == null');
  });

  it('số ảnh CHƯA BIẾT ra DẤU HỎI, không ra số 0', () => {
    // Vòng tiến độ đã nghỉ cùng nút tròn (xem nhóm "thẻ cá thể"), nên phép đo
    // dời sang huy hiệu — chỗ con số ấy sống bây giờ. Vẫn đúng một câu hỏi:
    // "chưa biết" và "bằng không" phải ra hai hình khác nhau.
    const i = MA_TAB.indexOf('theHuyHieuTxt}>');
    expect(i).toBeGreaterThan(-1);
    expect(MA_TAB.slice(i, i + 120)).toContain("item.n_images == null ? '?'");
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
    // Bảng tra chỉ còn MỘT bản, và chỉ `AnhLoai` đọc nó — hai bản chép tay thì
    // sớm muộn cũng lệch.
    const fa = doc(join(__dirname, 'animal', 'speciesFa.ts'));
    expect(fa).toContain('export const HINH_LOAI');
    expect(MA_TAB).not.toContain('const HINH_LOAI');
    const anhLoaiTs = doc(join(__dirname, 'animal', 'AnhLoai.tsx'));
    expect(anhLoaiTs).toContain("from './speciesFa'");
  });
});
