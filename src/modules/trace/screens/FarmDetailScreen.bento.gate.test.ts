/**
 * Cổng nguồn cho LƯỚI BENTO của màn chi tiết vườn.
 *
 * ⛔ Yêu cầu từ thực địa: *"màn hình chi tiết vườn trông khá rối đối với một
 *    nông dân"*. Đi đo thì "rối" hoá ra không phải một cảm giác mơ hồ — nó là
 *    ba thứ đếm được, và bài này giữ cho cả ba đừng quay lại.
 *
 * ── 1. MỘT VIỆC, MỘT LỐI VÀO ───────────────────────────────────────────────
 * Trước bản này `onActivityUpdate` được gắn ở HAI chỗ: một biểu tượng `file-pen`
 * không nhãn trên header, và nút lớn ở thanh đáy. Hai lối vào cho một việc là
 * hai chỗ người dùng phải tự hỏi "hai cái này có khác nhau không" — và câu hỏi
 * đó tốn nhiều sức hơn cả việc bấm nhầm.
 *
 * Bài dưới đếm LỜI GẮN (`onPress={...}`), không đếm tên hàm: tên hàm còn xuất
 * hiện ở chỗ khai tham số, nên đếm tên là đếm nhầm.
 *
 * ── 2. Ô KHÔNG ĐƯỢC TRỘN LOẠI ──────────────────────────────────────────────
 * Dải cũ (`statsBanner`) có ba ô trông ngang hàng: "cây", "quả dự kiến", và
 * "điểm GPS (nhấn xem)". Hai cái đầu là THÔNG TIN, cái thứ ba là NÚT — và nhãn
 * của nó phải xuống dòng để tự giải thích rằng mình bấm được. Một ô phải tự nói
 * được nó là gì mà không cần chú thích trong ngoặc.
 *
 * ── 3. SỐ ƯỚC TÍNH PHẢI TỰ KHAI LÀ ƯỚC TÍNH ────────────────────────────────
 * `totalFruits` là tổng `fruitCount` cộng dồn — một con số suy ra, không phải
 * số đếm được. Trước bản này nó hiện y hệt số cây. Một con số không nói mình là
 * ước tính là một con số sẽ bị mang đi dùng như số thật.
 *
 * ── Bài này đo GÌ, và KHÔNG đo gì ──────────────────────────────────────────
 * Đo MÃ NGUỒN, cùng khuôn với hai bài `.gate.test.ts` bên cạnh và vì cùng lý
 * do: dựng cả màn này (hơn 3.000 dòng, kéo theo bản đồ + máy ảnh + native)
 * trong jest là việc khác hẳn về giá.
 *
 * Nó KHÔNG đo màn có đẹp không, và không đo lưới có xuống dòng đúng trên máy
 * hẹp không. Phép đo cuối cho hai câu đó là mở màn thật trên máy thật.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
// `core.autocrlf=true` (xem `.gitattributes`).
const SRC = readFileSync(join(__dirname, 'FarmDetailScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');

/**
 * Đếm số lần một chuỗi xuất hiện TRONG MÃ CHẠY.
 *
 * Đếm trên `SRC` gốc là sai, và nó đã sai thật: một chú thích giải thích vì sao
 * ô `tone="space"` cần chữ sáng có nhắc nguyên văn `tone="space"`, thế là phép
 * đếm ra 2 và cổng báo "trang có hai ô tối". Cổng bắt lời giải thích rồi kết
 * luận về mã — cùng cái bẫy mà `MA_CHAY` bên dưới sinh ra để tránh, chỉ khác là
 * `dem` chưa được nối vào.
 *
 * `MA_CHAY` khai SAU `dem` trong tệp này, nhưng thân hàm mũi tên chỉ chạy lúc
 * GỌI — và mọi lượt gọi đều nằm trong `it(...)`, tức sau khi module dựng xong.
 */
const dem = (needle: string): number => MA_CHAY.split(needle).length - 1;

/**
 * Chỉ giữ MÃ CHẠY: bỏ chú thích khối `/* *​/` và chú thích dòng `//`.
 *
 * Cần nó cho mọi phép so "KHÔNG được chứa". Chú thích giải thích một lỗi luôn
 * NHẮC TÊN lỗi đó, nên phép so trần bắt trúng chính lời giải thích rồi kết luận
 * là lỗi còn nguyên. Đã cắn ngay ở lượt viết bài này: ca "không còn nhãn (nhấn
 * xem)" đỏ vì chuỗi ấy nằm trong khối chú thích mô tả dải ô cũ.
 *
 * ⚠ Phép lọc này KHÔNG hiểu chuỗi ký tự: một `'http://…'` trong mã sẽ bị cắt từ
 * dấu `//` trở đi. Chấp nhận được ở đây vì mọi phép so bên dưới đều là "không
 * chứa" — cắt nhầm chỉ có thể làm bài XANH oan, không làm nó đỏ oan, và các ca
 * "phải chứa" thì dùng `SRC` gốc.
 */
const MA_CHAY = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('một việc chỉ có MỘT lối vào', () => {
  it('`onActivityUpdate` được gắn đúng MỘT chỗ', () => {
    expect(dem('onPress={onActivityUpdate}')).toBe(1);
  });

  it('xem sơ đồ 3D được gắn đúng MỘT chỗ', () => {
    // Trước bản này nó nằm ở thanh đáy; nay nó là một ô Bento. Gắn cả hai chỗ là
    // quay lại đúng lỗi vừa gỡ, chỉ đổi tên việc.
    expect(dem('onPress={onView3DFarm}')).toBe(1);
  });

  it('header KHÔNG còn biểu tượng ghi hoạt động không nhãn', () => {
    // `file-pen` là biểu tượng của lối vào thứ hai đã gỡ. Một biểu tượng không
    // nhãn trên header là thứ người dùng phải bấm thử mới biết nó làm gì.
    expect(MA_CHAY).not.toContain('name="file-pen"');
  });
});

describe('ô không trộn loại, và số phụ thì thu gọn', () => {
  it('dải ba ô thống kê cũ KHÔNG quay lại', () => {
    for (const chet of ['statsBanner', 'statBannerItem', 'statBannerVal', 'statBannerLabel']) {
      expect(MA_CHAY).not.toContain(chet);
    }
  });

  it('không còn nhãn phải xuống dòng để tự giải thích mình bấm được', () => {
    // `'điểm GPS\n(nhấn xem)'` — một nhãn phải nói "nhấn xem" là một ô chưa nói
    // được nó là nút.
    expect(MA_CHAY).not.toContain('(nhấn xem)');
  });

  it('số quả tự khai là ƯỚC TÍNH, ngay cạnh con số', () => {
    const i = SRC.indexOf('totalFruits.toLocaleString');
    expect(i).toBeGreaterThan(-1);
    // Trong phạm vi cùng một khối chữ, không phải ở một chú thích cuối trang.
    expect(SRC.slice(i, i + 200)).toContain('ước tính');
  });
});

describe('dòng thời gian là Ô LỚN NHẤT, không phải phần đuôi', () => {
  it('chỉ còn MỘT chỗ vẽ dòng thời gian của vườn', () => {
    // Trước bản này nó nằm trong `ListFooterComponent`, tức phải cuộn qua cả
    // danh sách cây mới thấy — chính bản ghi GỐC của mọi việc đồng áng là thứ
    // khuất nhất màn.
    expect(dem('<EntityTimeline')).toBe(1);
  });

  it('nó nằm trong ô hero, và ô hero nằm trong phần đầu cuộn được', () => {
    expect(SRC).toContain('ListHeaderComponent={bentoHeader}');
    const hero = SRC.indexOf('<BentoTile tone="hero"');
    const timeline = SRC.indexOf('<EntityTimeline');
    const dongHeader = SRC.indexOf('const bentoHeader');
    expect(dongHeader).toBeGreaterThan(-1);
    expect(hero).toBeGreaterThan(dongHeader);
    expect(timeline).toBeGreaterThan(hero);
  });
});

describe('hai ô xem trước HIỆN thứ chúng mở, không phải icon + chữ', () => {
  it('cả hai ô đều vẽ chính mảnh vườn này', () => {
    // `space` cho ô sơ đồ 3D, `flat` cho ô ranh giới — cùng một mảnh đất, hai
    // cách nhìn, cả hai dựng từ `farm.coordinates` thật.
    expect(dem('<FarmShape')).toBe(2);
    expect(MA_CHAY).toContain('mode="space"');
    expect(MA_CHAY).toContain('mode="flat"');
  });

  it('ô sơ đồ 3D là ô TỐI, và là ô tối DUY NHẤT của trang', () => {
    // `space` chỉ đúng trên nền tối: vầng sáng cần nền tối để đọc ra không gian.
    // Và luật Bento cho phép đúng MỘT ô tối mỗi trang — cái thứ hai làm cả hai
    // mất tác dụng làm dấu "khác loại".
    expect(MA_CHAY).toContain('tone="space"');
    expect(dem('tone="space"')).toBe(1);
  });

  it('KHÔNG có biểu tượng nào ĐỨNG THAY NHÃN trong hai ô đó', () => {
    // Hình đã là nhãn. Một biểu tượng đặt giữa ô kèm dòng chữ là quay lại đúng
    // thứ vừa gỡ: hình vẽ chung chung nói "bấm vào đây mở một thứ tên vậy", đè
    // lên một hình cụ thể vốn đã nói được nhiều hơn.
    //
    // Huy hiệu "3D" ở GÓC thì khác loại và được phép — nó không thay hình, nó
    // xác nhận hình đang xem là không gian. Nên phép so ở đây bắt cái NHÃN
    // (`bentoActionTxt`, kiểu chữ của ô có nhãn), không bắt mọi `<Icon`.
    const i = MA_CHAY.indexOf('<BentoRow style={styles.bentoPreviews}>');
    expect(i).toBeGreaterThan(-1);
    const ket = MA_CHAY.indexOf('</BentoRow>', i);
    expect(ket).toBeGreaterThan(i);
    const khoi = MA_CHAY.slice(i, ket);
    expect(khoi).not.toContain('styles.bentoActionTxt');
  });

  it('ô sơ đồ 3D có huy hiệu ở GÓC, không phải nhãn giữa ô', () => {
    const i = MA_CHAY.indexOf('<BentoRow style={styles.bentoPreviews}>');
    const ket = MA_CHAY.indexOf('</BentoRow>', i);
    // Khớp CẢ thuộc tính, không khớp tên trần: `styles.bentoBadge3D` là TIỀN TỐ
    // của `styles.bentoBadge3DTxt`, nên phép so tên trần vẫn xanh sau khi ai đó
    // gỡ hẳn khung huy hiệu mà để lại kiểu chữ. Đã cắn đúng ca đó lúc chạy đột
    // biến — bài kiểm xanh trong khi huy hiệu đã biến mất.
    expect(MA_CHAY.slice(i, ket)).toContain('style={styles.bentoBadge3D}');
    // `position: 'absolute'` là thứ giữ nó ở GÓC. Bỏ dòng đó thì huy hiệu rơi
    // vào dòng chảy và đẩy hình vườn xuống — thành đúng cái nhãn vừa gỡ.
    const kieu = MA_CHAY.indexOf('bentoBadge3D: {');
    expect(kieu).toBeGreaterThan(-1);
    expect(MA_CHAY.slice(kieu, kieu + 160)).toContain("position: 'absolute'");
  });
});

describe('thanh đáy còn đúng một việc', () => {
  it('hai nút đã chuyển thành ô Bento KHÔNG còn ở thanh đáy', () => {
    for (const chet of ['view3DFarmBtn', 'view3DFarmBtnText']) {
      expect(MA_CHAY).not.toContain(chet);
    }
  });

  it('vẫn giữ phép đo chiều cao — thanh mỏng đi thì ô chừa phải theo', () => {
    // Thanh vừa rút từ hai hàng xuống một. Nếu ô chừa chỗ còn là hằng gõ tay
    // (bản trước #309) thì bản này để lại một khoảng trắng bằng nửa thanh cũ.
    // Giữ lời gọi này là giữ cho hai thứ đó không lệch nhau được nữa.
    expect(SRC).toContain('height: chieuCaoThanhDay || CHUA_DO_THANH_DAY');
    expect(SRC).toContain('setChieuCaoThanhDay(');
  });
});

describe('không lớp phủ nào được cắt ngang một nền chuyển sắc', () => {
  it('nút "Cập nhật hoạt động" KHÔNG còn lớp `btnShine`', () => {
    // ⛔ `btnShine` phủ ĐÚNG NỬA TRÊN (`height: '50%'`), nên mép dưới của nó là
    //    một đường ngang cắt ngang nút. Trên nền màu phẳng gần như không thấy;
    //    trên nền chuyển sắc thì nửa trên bị nâng sáng còn nửa dưới thì không,
    //    và cái đường ấy hiện rõ thành ranh giới hai mảng màu.
    //
    // Nó ra đời để GIẢ một vệt sáng trên nền phẳng. Nay nền là chuyển sắc thật,
    // nên nó vừa thừa vừa phá đúng thứ nó từng giả.
    const i = MA_CHAY.indexOf('styles.activityLargeBtn');
    expect(i).toBeGreaterThan(-1);
    const ket = MA_CHAY.indexOf('</TouchableOpacity>', i);
    expect(ket).toBeGreaterThan(i);
    const nut = MA_CHAY.slice(i, ket);
    expect(nut).toContain('<GradientFill name="action" />');
    expect(nut).not.toContain('styles.btnShine');
  });
});

describe('cả hai ô xem trước đều vẽ cây trong vườn', () => {
  it('mỗi `FarmShape` đều được truyền `trees`', () => {
    // Ô ranh giới TỪNG thiếu vế này: nó vẽ mảnh đất trống không, và một mảnh đất
    // không cây đọc ra "vườn chưa có gì" — sai với vườn đang có cả trăm cây.
    expect(dem('<FarmShape')).toBe(dem('trees={filteredTrees}'));
    expect(dem('trees={filteredTrees}')).toBe(2);
  });
});

describe('nền dưới lớp phủ phải CÙNG HỌ MÀU với lớp phủ', () => {
  it('nút "Cập nhật hoạt động" lấy nền từ chính token chuyển sắc', () => {
    // ⛔ Đây là nguyên nhân THẬT của "nút hai màu", sau khi hai lượt vá trước
    //    sửa hai lỗi khác (id trùng, toạ độ dạng chuỗi phần trăm).
    //
    // Nút có một lớp `GradientFill name="action"` phủ lên. Nền dưới chỉ hiện ra
    // khi lớp phủ hở — và `COLORS.accent` ở lớp token mặc định là XANH DƯƠNG
    // `#3B6EA8`, trong khi `GRADIENT.action` là xanh lá. Hở một chút là thấy hai
    // màu khác hẳn nhau.
    //
    // Chốt này KHÔNG vá chỗ hở; nó làm chỗ hở thôi nhìn thấy được.
    const i = MA_CHAY.indexOf('activityLargeBtn: {');
    expect(i).toBeGreaterThan(-1);
    const khoi = MA_CHAY.slice(i, i + 260);
    expect(khoi).toContain('backgroundColor: ORG_GRADIENT.action.from');
    expect(khoi).not.toContain('backgroundColor: COLORS.accent');
  });
});

/**
 * DANH SÁCH CÂY — nút tròn, lưới ba cột, chạm mở popup.
 *
 * Yêu cầu từ thực địa, và nó là một danh sách BỎ nhiều hơn là THÊM: bỏ biểu
 * tượng cây, bỏ mũi tên phải, bỏ mã cây — chỉ còn tên. Ba thứ bỏ đi đều là thứ
 * lặp lại y hệt trên mọi thẻ, tức không phân biệt được thẻ nào với thẻ nào:
 *
 *   biểu tượng cây   cây nào cũng là cây
 *   mũi tên phải     cả danh sách đều bấm được
 *   mã cây           chuỗi băm ngắn, không ai đọc — tên mới là thứ nhà vườn gọi
 *
 * Danh sách "bỏ đi" là loại dễ trôi ngược nhất: mỗi lượt sau chỉ cần thêm lại
 * MỘT thứ, thấy hợp lý một mình, và vài lượt là thẻ cũ quay về nguyên hình.
 */
describe('danh sách cây — nút TRÒN có ảnh, lưới ba cột', () => {
  /**
   * Nút tròn giữ nguyên, và lý do của nó cũng vậy: viền hình tròn CHÍNH LÀ cung
   * tiến độ, nên vòng và lòng là MỘT vật chứ không phải hai hình chồng nhau.
   * Hai mép không bao giờ khớp tuyệt đối — chúng để lại một đường chỉ mờ, và cái
   * vòng thôi đọc ra "viền của nút".
   *
   * Thứ đổi là LÒNG nút: từ chữ sang ẢNH THẬT của chính cây đó, và chữ dời
   * xuống dưới. Chữ đè lên một tấm ảnh chụp thì đọc được hay không là chuyện may
   * rủi theo từng tấm — mà ảnh là thứ app không kiểm soát.
   */
  it('lưới đúng BA cột', () => {
    expect(MA_CHAY).toContain('numColumns={3}');
  });

  it('bề ngang nút suy theo ĐÚNG số cột đó', () => {
    // Số cột và công thức chia phải đi cùng nhau. Lệch nhau thì cột cuối tràn
    // khỏi mép phải, và nó tràn ÂM THẦM — `FlatList` không kêu một tiếng nào.
    expect(MA_CHAY).toContain('Math.floor((width - 12 * 2 - 12 * 2) / 3)');
  });

  it('nút TRÒN, và tiến độ là VIỀN của chính nó — chỉ MỘT mép', () => {
    // Phải soi TRONG `TreeChip`, không soi cả tệp: popup chi tiết cũng dùng
    // `RingProgress`, nên phép so cả tệp vẫn xanh sau khi ai đó gỡ vòng khỏi nút.
    const iChip = MA_CHAY.indexOf('const TreeChip');
    expect(iChip).toBeGreaterThan(-1);
    const thanChip = MA_CHAY.slice(iChip, MA_CHAY.indexOf('};', MA_CHAY.indexOf('return (', iChip)));
    expect(thanChip).toContain('<RingProgress');
    expect(thanChip).toContain('pct={harvestPct}');

    // ⛔ KHÔNG được có một `View` bo tròn lồng vào giữa làm mép THỨ HAI. Ảnh
    //    trong lòng nút thì được bo tròn — nó KHÔNG phải một mép thứ hai, nó là
    //    chính cái ruột, và nó tiếp xúc mép trong của viền.
    expect(MA_CHAY).not.toContain('treeChipTron');
  });

  it('lòng nút là ẢNH ĐÃ CHỤP của chính cây đó', () => {
    const iChip = MA_CHAY.indexOf('const TreeChip');
    const thanChip = MA_CHAY.slice(iChip, MA_CHAY.indexOf('};', MA_CHAY.indexOf('return (', iChip)));
    expect(thanChip).toContain('anhBia');
    expect(thanChip).toContain('<Image');
    // Ảnh chụp thật phủ kín lòng nút; hình chung thì chừa lề vì nó là hình
    // minh hoạ xoá nền, phủ kín sẽ cắt cụt ngọn.
    expect(thanChip).toContain("coAnhThat ? 'cover' : 'contain'");
    // Đường dẫn chết (Android dọn vùng nhớ tạm) phải tụt về hình chung, không
    // để lại một ô trống giữa lòng nút.
    expect(thanChip).toContain('onError={() => setHongAnh(true)}');
    expect(thanChip).toContain('ANH_CAY_CHUNG');
  });

  it('ảnh lấy từ kho ảnh cây CÓ SẴN, không dựng thêm một kho thứ hai', () => {
    // `treeImageStore` đã giữ đường dẫn ảnh theo `tree_id` từ lúc đăng ký
    // (`appendTreeImages`). Dựng một kho nữa ở đây là hai bảng nói về cùng một
    // thứ, và chúng sẽ lệch nhau.
    expect(MA_CHAY).toContain("loadTreeCovers");
    expect(MA_CHAY).toContain("from '../../../services/treeImageStore'");
  });

  it('chỉ nạp ảnh cho MỘT TRANG, không cho cả vườn', () => {
    // Vườn 400 cây thì 400 lượt đọc đĩa để bày 12 thẻ, và 388 tấm không ai thấy.
    const i = MA_CHAY.indexOf('loadTreeCovers(');
    expect(i).toBeGreaterThan(-1);
    expect(MA_CHAY.slice(Math.max(0, i - 400), i)).toContain('paginatedTrees.map');
  });

  it('nút mang SỐ QUẢ, và số dùng chung sắc với cung tiến độ', () => {
    const iChip = MA_CHAY.indexOf('const TreeChip');
    const thanChip = MA_CHAY.slice(iChip, MA_CHAY.indexOf('};', MA_CHAY.indexOf('return (', iChip)));
    expect(thanChip).toContain('item.fruitCount');
    expect(thanChip).toContain('styles.cayQua');

    const iSo = MA_CHAY.indexOf('cayQua: {');
    expect(iSo).toBeGreaterThan(-1);
    expect(MA_CHAY.slice(iSo, iSo + 160)).toContain('ORG_TONE.primary');
  });

  it('"chưa biết" vẫn KHÁC "bằng không"', () => {
    const iChip = MA_CHAY.indexOf('const TreeChip');
    const thanChip = MA_CHAY.slice(iChip, MA_CHAY.indexOf('};', MA_CHAY.indexOf('return (', iChip)));
    expect(thanChip).toContain('item.harvestProgress ?? null');
    expect(thanChip).toContain('item.fruitCount ?? null');
    expect(thanChip).toContain('chưa đếm');
  });

  it('thẻ cũ KHÔNG quay lại', () => {
    for (const chet of ['TreeCard', 'treeIconWrap', 'treeHarvestTrack', 'treeCodeSub', 'cayThe']) {
      expect(MA_CHAY).not.toContain(chet);
    }
  });
});

describe('chạm cây mở POPUP, màn chi tiết nằm sau một nút', () => {
  it('chạm nút cây KHÔNG điều hướng thẳng', () => {
    // Nhịp làm việc thật: quét mắt qua lưới, chạm xem nhanh, chạm cây kế. Mở
    // màn chi tiết cho mỗi lượt xem nhanh là bắt người ta đi và quay lại — mất
    // chỗ đang đứng trong lưới, mất cả trang phân trang.
    const i = MA_CHAY.indexOf('<TreeChip');
    expect(i).toBeGreaterThan(-1);
    const khoi = MA_CHAY.slice(i, MA_CHAY.indexOf('/>', i));
    expect(khoi).toContain('setCayDangXem(item)');
    expect(khoi).not.toContain('TreeDetail');
  });

  it('popup có nút mở màn chi tiết, và nó đóng popup trước khi đi', () => {
    // Không đóng thì lúc quay lại popup còn mở, đè lên lưới — người dùng phải
    // đóng một thứ họ không mở.
    const i = MA_CHAY.indexOf('cayPopupNut');
    expect(i).toBeGreaterThan(-1);
    const khoi = MA_CHAY.slice(i, i + 500);
    expect(khoi).toContain('setCayDangXem(null)');
    expect(khoi).toContain("'TreeDetail'");
  });

  it('popup mang đủ chi tiết cơ bản, và số ước tính tự khai', () => {
    const i = MA_CHAY.indexOf('cayPopupBang');
    expect(i).toBeGreaterThan(-1);
    const khoi = MA_CHAY.slice(i, i + 900);
    for (const nhan of ['Quả trên cây', 'Quả dự kiến', 'Giống', 'Năm trồng']) {
      expect(khoi).toContain(nhan);
    }
    // Khớp CỜ điều khiển, không khớp chuỗi hiện ra: chuỗi "ước tính" còn nằm ở
    // dòng thông tin phụ phía trên, nên phép so chuỗi vẫn xanh sau khi ai đó gỡ
    // `uoc: true` và nhánh hiện chữ chết hẳn. Đã cắn đúng ca đó lúc đột biến.
    expect(khoi).toContain('uoc: true');
    expect(MA_CHAY).toContain('styles.cayPopupUoc');
  });
});
