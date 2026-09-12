/**
 * Cổng nguồn cho LUỒNG VẬT NUÔI nhiều bước.
 *
 * ⛔ Bốn báo cáo từ thực địa, mỗi cái là một `describe` bên dưới:
 *
 *   1. *"nút Thêm cá thể nhấn vào thì lại thấy trang bị reload"* — `AnimalEnroll`
 *      đòi ĐỦ `species` + `farmId` rồi `goBack()` khi thiếu. Sổ đàn chỉ cầm
 *      `farmId`, nên mỗi lượt bấm là mở một màn rồi bị đá về ngay.
 *
 *   2. *"nhấn vào nút nhận diện mà lại mở được trang nhận diện luôn, không cần
 *      biết có đàn nào chưa"* — nhận diện là so với đàn ĐÃ đăng ký; đàn rỗng thì
 *      máy chủ trả `EMPTY_FARM`, nhưng chỉ sau khi người dùng đã chụp và chờ tải
 *      ảnh lên.
 *
 *   3. *"ảnh sau khi chụp lại hiển thị một màu đen thui"* — khung xem trước nền
 *      `#000` và không bắt `onError`.
 *
 *   4. *"luồng khá rối… chia nhỏ thành các bước"* — hai màn cũ bày loài, vườn,
 *      ảnh, tên, nút gửi cùng một lúc.
 *
 * Đo MÃ NGUỒN, cùng khuôn với các `.gate.test.ts` bên cạnh: dựng thật luồng này
 * trong jest kéo theo máy ảnh, native, và một vòng gọi mạng. Nó KHÔNG đo luồng
 * có dễ dùng không — phép đo cuối cho câu đó là đưa máy cho người nuôi.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const doc = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const chay = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const MAN = join(__dirname, '..', '..', '..', '..', 'screens');
const THAN = chay(doc(join(__dirname, 'AnimalWizard.tsx')));
const GHI = chay(doc(join(MAN, 'AnimalEnrollScreen.tsx')));
const NHAN = chay(doc(join(MAN, 'AnimalIdentityScreen.tsx')));

describe('1 · không bước nào đòi một tham số mà nơi gọi không thể có', () => {
  it('màn đăng ký KHÔNG còn tự quay lại khi thiếu loài', () => {
    // ⛔ Đúng dòng đã gây ra "trang bị reload": một `goBack()` nằm trong
    //    `useEffect` chạy ngay lúc dựng. Nó hỏng CÂM — không lỗi, không log.
    //
    // Khớp `goBack` NẰM TRONG `useEffect`, không khớp `goBack` trần: nút đóng
    // của tấm trượt cũng gọi `goBack`, và đó là việc đúng của nó. Cấm cả hai
    // là cấm nhầm cái còn lại.
    expect(GHI).not.toMatch(/useEffect\([\s\S]{0,300}goBack/);
    expect(GHI).not.toMatch(/if\s*\(!species/);
  });

  it('loài là BƯỚC MỘT của cả hai luồng, không phải tham số bắt buộc', () => {
    expect(THAN).toContain("identify: ['loai', 'vuon', 'chup']");
    expect(THAN).toContain("enroll: ['loai', 'vuon', 'anh', 'ten']");
  });

  it('vườn đã biết thì bỏ hẳn bước hỏi vườn', () => {
    // Hỏi lại một câu nơi gọi đã trả lời là thêm một bước vô nghĩa — sổ đàn của
    // một vườn luôn biết mình là vườn nào.
    expect(THAN).toContain("!(b === 'vuon' && vuonKhoa)");
  });

  it('sổ đàn mở luồng TẠI CHỖ, không điều hướng đi đâu', () => {
    const tab = chay(doc(join(__dirname, '..', 'FarmAnimalsTab.tsx')));
    expect(tab).toContain("setLuong('identify')");
    expect(tab).toContain("setLuong('enroll')");
    expect(tab).not.toContain("navigate('AnimalEnroll'");
    expect(tab).not.toContain("navigate('AnimalIdentity'");
  });
});

describe('2 · đàn rỗng thì nói TRƯỚC KHI chụp', () => {
  it('có lượt đếm đàn theo ĐÚNG loài và ĐÚNG vườn, chạy ở bước chụp', () => {
    const i = THAN.indexOf("buoc !== 'chup'");
    expect(i).toBeGreaterThan(-1);
    const khoi = THAN.slice(i, i + 700);
    // Lọc theo loài: đàn có bò mà không có dê thì nhận diện dê vẫn không có gì
    // để so — đếm cả vườn là đếm nhầm câu hỏi.
    expect(khoi).toContain('listAnimals(ORILIFE_BASE, vuon, loai, 1, 0)');
  });

  it('đàn rỗng CHẶN nút đi tiếp, không chỉ hiện một lời nhắc', () => {
    // Một lời nhắc mà nút vẫn bấm được thì nó chỉ là trang trí.
    const i = THAN.indexOf("case 'chup': return");
    expect(i).toBeGreaterThan(-1);
    expect(THAN.slice(i, i + 80)).toContain('soDan !== 0');
  });

  it('chặn xong thì mở đường, không bỏ người dùng đứng đó', () => {
    expect(THAN).toContain('reSangDangKy');
    // Rẽ sang đăng ký phải GIỮ loài và vườn đã chọn — bắt chọn lại là bắt làm
    // lại hai bước vừa làm xong.
    const i = THAN.indexOf('const reSangDangKy');
    const than = THAN.slice(i, THAN.indexOf('};', i));
    expect(than).not.toContain('setLoai(');
    expect(than).not.toContain('setVuon(');
  });
});

describe('3 · ảnh không hiện được thì nói ra, không để lại một mảng đen', () => {
  it('khung xem trước KHÔNG còn nền đen', () => {
    expect(THAN).not.toContain("backgroundColor: '#000'");
  });

  it('`Image` có bắt lỗi, và có đường dự phòng trước khi bỏ cuộc', () => {
    const i = THAN.indexOf('const AnhChup');
    expect(i).toBeGreaterThan(-1);
    const than = THAN.slice(i, THAN.indexOf('\n};', i));
    expect(than).toContain('onError=');
    // `originalPath` — đường tệp thật mà picker trả kèm trên Android.
    expect(than).toContain('anh.duPhong');
    expect(than).toContain('setHong(true)');
  });

  it('lượt chụp có giữ lại đường dự phòng ấy', () => {
    // Thiếu vế này thì `AnhChup` không có gì để thử, và nhánh dự phòng chết câm.
    expect(THAN).toContain('a.originalPath');
  });
});

describe('4 · mỗi khung hình hỏi đúng một câu', () => {
  it('nút đi tiếp tự khoá khi câu của bước đó chưa có trả lời', () => {
    const i = THAN.indexOf('const diTiepDuoc');
    expect(i).toBeGreaterThan(-1);
    const than = THAN.slice(i, THAN.indexOf('})();', i));
    for (const b of ['loai', 'vuon', 'anh', 'ten', 'chup']) {
      expect(than).toContain(`case '${b}':`);
    }
  });

  it('có vạch bước — người dùng thấy còn bao nhiêu quãng nữa', () => {
    expect(THAN).toContain('styles.vachDoan');
    expect(THAN).toContain('Bước ${viTri + 1}/${cacBuoc.length}');
  });

  it('danh sách ứng viên là một BƯỚC, không phải hộp thoại chồng hộp thoại', () => {
    // Hộp thoại lồng trong tấm trượt hay kẹt trên Android, và đóng nhầm một lớp
    // là mất luôn kết quả vừa chụp.
    expect(THAN).not.toContain('ReidConfirmDialog');
    expect(THAN).toContain('hangUngVien');
  });

  it('kết quả nhận diện vẫn tự khai rằng nó CHƯA phải kết luận', () => {
    // Số đo của OriLife: nhãn MATCH chỉ đúng khoảng một nửa số lượt. Câu này
    // phải đứng ngay dưới kết quả, không nằm ở chú thích cuối trang.
    const i = THAN.indexOf('function veNhanDienXong');
    expect(i).toBeGreaterThan(-1);
    expect(THAN.slice(i, i + 3000)).toContain('xin nhìn lại con vật');
  });
});

describe('ô chọn loài: ảnh thật nếu có, biểu tượng nếu chưa', () => {
  const ANH = doc(join(__dirname, 'speciesPhoto.ts'));

  it('ô chọn loài vẽ ẢNH khi bảng tra có, không gõ cứng biểu tượng', () => {
    const i = THAN.indexOf('styles.luoiLoai');
    expect(i).toBeGreaterThan(-1);
    const luoi = THAN.slice(i, i + 1600);
    expect(luoi).toContain('anhLoai(k)');
    expect(luoi).toContain('<Image');
    // `contain`, không `cover`: ảnh xoá nền mỗi loài một tỉ lệ, `cover` cắt cụt.
    expect(luoi).toContain('resizeMode="contain"');
  });

  it('loài CHƯA có ảnh rơi về biểu tượng, KHÔNG rơi về ô rỗng', () => {
    // Một ô xám rỗng đọc ra "app hỏng". Bước một của cả luồng không được phép
    // trông như hỏng chỉ vì bảng ảnh chưa điền.
    const i = THAN.indexOf('anhLoai(k)');
    const khoi = THAN.slice(i, i + 900);
    expect(khoi).toContain('hinhLoai(k)');
  });

  it('bảng ảnh KHÔNG `require` một tệp chưa có', () => {
    // `require` của RN là hằng văn bản đọc lúc đóng gói: trỏ vào tệp chưa có là
    // hỏng CẢ bản dựng, không phải mất một ô ảnh. Nên chỗ trống là `null`, và
    // dòng `require` nằm trong chú thích cho tới khi tệp có thật.
    const chayAnh = chay(ANH);
    const soRequire = (chayAnh.match(/require\(/g) ?? []).length;
    const soTep = readdirSync(join(__dirname, '..', '..', '..', '..', '..', 'assets', 'images', 'animals'))
      .filter((f) => f.toLowerCase().endsWith('.png')).length;
    expect(soRequire).toBe(soTep);
  });

  it('mỗi khoá loài của máy chủ đều có một ô trong bảng', () => {
    // Thiếu một khoá thì `anhLoai` trả `null` mãi mãi cho loài đó, và không ai
    // biết vì nó im lặng rơi về biểu tượng.
    for (const k of ['chicken', 'pig', 'goat', 'cattle', 'duck', 'dog']) {
      // Khớp cả DÒNG khai, không khớp tên trần: chữ "chicken" còn nằm trong
      // chú thích và trong đường dẫn tệp, nên phép so tên trần vẫn xanh sau khi
      // ai đó xoá hẳn một khoá khỏi bảng.
      expect(ANH).toContain(`
  ${k}:`);
    }
  });

  it('có chỉ dẫn để người khác điền nốt', () => {
    const rm = doc(join(__dirname, '..', '..', '..', '..', '..', 'assets', 'images', 'animals', 'README.md'));
    expect(rm).toContain('chicken.png');
    expect(rm).toContain('speciesPhoto.ts');
  });
});

describe('một luồng, một bản dựng', () => {
  it('cả hai màn ngoài đều mở ĐÚNG thành phần này', () => {
    for (const s of [GHI, NHAN]) {
      expect(s).toContain('<AnimalWizard');
      expect(s).toContain("from '../modules/trace/components/animal/AnimalWizard'");
    }
    expect(GHI).toContain('mode="enroll"');
    expect(NHAN).toContain('mode="identify"');
  });

  it('màn nhận diện vẫn xuất `toReidCandidates` cho bài kiểm đang khoá nó', () => {
    expect(NHAN).toContain('export { toReidCandidates }');
  });

  it('sắc NÂU của nhánh vật nuôi, không mượn xanh lá của nhánh cây', () => {
    expect(THAN).toContain('actionBarn');
    expect(THAN).not.toContain('name="action"');
  });
});
