/**
 * Cổng nguồn cho MÀN CHI TIẾT CÂY — ba mục, nút quả tròn, ô 3D của cây.
 *
 * ⛔ Yêu cầu từ thực địa: *"màn hình chi tiết cây có vẻ có quá nhiều panel trong
 *    1 màn hình, hãy thiết kế lại sao cho từng panel hay từng mục chiếm vừa đủ
 *    chiều cao màn hình... chia ra từng Section... Mục Ảnh cây thì thay thành
 *    'Cây này'... danh sách quả cũng lấy thiết kế hình tròn tương tự ở màn hình
 *    chi tiết farm, nhưng lưới gồm 3 cột, sử dụng ảnh quả cho background."*
 *
 * "Quá nhiều panel" đo được: tab Tổng quan trước bản này có CHÍN khối xếp dọc,
 * mỗi khối một nền riêng một viền riêng, và danh sách quả — thứ người ta mở màn
 * để xem — nằm sau sáu khối trong số đó.
 *
 * Bài này giữ ba thứ đừng trôi ngược: màn có MỤC, hai ô "nhìn" của mục Cây này,
 * và nút quả là nút TRÒN CÓ ẢNH chứ không phải thẻ hàng ngang.
 *
 * ── Bài này đo GÌ, và KHÔNG đo gì ──────────────────────────────────────────
 * Đo MÃ NGUỒN, cùng khuôn với năm bài `.gate.test.ts` bên cạnh: dựng màn này
 * trong jest kéo theo maplibre + máy ảnh + native, tức một việc khác hẳn về giá.
 *
 * Nó KHÔNG đo mỗi mục có thật sự vừa một tầm mắt trên máy hẹp không, ảnh quả có
 * tải về không, hay hình 3D quay có mượt không. Phép đo cuối cho ba câu đó là mở
 * màn thật trên máy thật.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const doc = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const SRC = doc(join(__dirname, 'TreeDetailScreen.tsx'));
const I18N = doc(join(__dirname, '..', '..', '..', 'i18n', 'keys', 'trace.ts'));
const KHONG_GIAN = join(__dirname, '..', '..', '..', 'features', 'space3d');

/**
 * Chỉ giữ MÃ CHẠY. Cần nó cho mọi phép so "KHÔNG được chứa": chú thích giải
 * thích một lỗi luôn NHẮC TÊN lỗi đó, nên phép so trần bắt trúng chính lời giải
 * thích rồi kết luận là lỗi còn nguyên.
 */
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const MA_CHAY = boChuThich(SRC);

/**
 * Mã của riêng tấm "Khác".
 *
 * Mốc cuối phải là `visible={farmPickerOpen}` chứ không phải chuỗi
 * `farmPickerOpen` trần: tên đó còn xuất hiện ở chỗ khai state và ở nút mở tấm
 * chọn vườn, cả hai đều đứng TRƯỚC tấm này — cắt theo nó thì ra một lát rỗng, và
 * mọi phép so "không chứa" bên dưới sẽ XANH OAN. Đã cắn đúng ca đó lúc viết bài.
 */
const tamKhac = (): string => {
  const i = MA_CHAY.indexOf('visible={moreOpen}');
  const j = MA_CHAY.indexOf('visible={farmPickerOpen}');
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return MA_CHAY.slice(i, j);
};

/** Thân của một component/khối, cắt từ tên tới dấu đóng của `return (`. */
const than = (hay: string, ten: string): string => {
  const i = hay.indexOf(ten);
  expect(i).toBeGreaterThan(-1);
  return hay.slice(i, hay.indexOf('};', hay.indexOf('return (', i)));
};

describe('màn chia thành MỤC, không còn một chồng panel', () => {
  it('có đủ ba tiêu đề mục', () => {
    for (const ten of ['Tổng quan', 'Cây này', 'Quả']) {
      expect(MA_CHAY).toContain(`<Text style={styles.sectionTitle}>${ten}</Text>`);
    }
  });

  it('thẻ Tổng quan có NGĂN thông tin phụ, đóng sẵn', () => {
    // Vị trí GPS, giống, năm trồng, đặc điểm máy chủ tả, mã lưu trữ video — năm
    // thứ đó đều có người cần, nhưng không ai cần chúng MỖI LẦN mở màn. Bày sẵn
    // cả năm là đẩy danh sách quả xuống dưới nếp gấp.
    expect(MA_CHAY).toContain('useState(false)');
    expect(MA_CHAY).toContain('setMoRong');
    expect(MA_CHAY).toContain('Xem thêm');
    expect(MA_CHAY).toContain('Thu gọn');
  });

  it('bốn con số vào TRONG thẻ, thôi là bốn ô Bento rời', () => {
    // Chúng không phải bốn việc — chúng là bốn mặt của MỘT câu ("cây này đang
    // thế nào"), tức đúng nội dung của thẻ Tổng quan. Bốn ô rời là bốn nền, bốn
    // viền, hai hàng chiều cao cho một câu duy nhất.
    expect(MA_CHAY).toContain('styles.panelSo');
    expect(MA_CHAY).not.toContain('<BentoStat');
    expect(MA_CHAY).not.toContain('treeStatsRow');
  });

  it('các khối rời cũ đã về đúng mục, không còn đứng một mình', () => {
    for (const chet of ['heroCard', 'photoStripWrap', 'meshChipRow', 'estimateNote', 'featuresBox', 'proofWrap']) {
      expect(MA_CHAY).not.toContain(chet);
    }
  });
});

describe('nút "Khác" — ba chấm dọc, không chữ', () => {
  it('dùng `ellipsis-vertical`, và KHÔNG dùng `ellipsis`', () => {
    // ⛔ Tên `ellipsis` KHÔNG CÓ trong bộ icon của kho, nên nút cũ vẽ ra một ô
    //    TRỐNG bên cạnh chữ. Không lệnh nào báo: `Icon` nuốt tên lạ chứ không ném.
    expect(MA_CHAY).toContain('name="ellipsis-vertical"');
    expect(MA_CHAY).not.toContain('name="ellipsis"');
  });

  it('nút không còn mang chữ', () => {
    expect(MA_CHAY).not.toContain('headerMoreTxt');
  });

  it('tấm mở ra tên là "Khác"', () => {
    expect(I18N).toContain("'trace.tree.moreActions': { vi: 'Khác'");
  });

  it('ba hàng trong tấm là NÚT, không dùng chung style với hai tấm kia', () => {
    // ⛔ Bản trước ba hàng dùng chung `modalOption`, mà style đó có
    //    `justifyContent: 'space-between'` — đúng cho tấm lọc trạng thái (ở đó
    //    icon và chữ được bọc chung, vế phải là dấu tích), SAI ở đây vì không có
    //    vế phải và không có bọc: biểu tượng dính mép trái, cả câu chữ dính mép
    //    phải, giữa là một khoảng trống to tướng.
    const than3 = tamKhac();
    expect(than3).not.toContain('styles.modalOption');
    expect(than3).toContain('styles.khacHang');
    // `flex: 1` trên nhãn là thứ giữ chữ SÁT biểu tượng thay vì bị đẩy sang mép.
    const i = MA_CHAY.indexOf('khacNhan: {');
    expect(MA_CHAY.slice(i, i + 90)).toContain('flex: 1');
  });

  it('mỗi hàng mang MÀU RIÊNG theo nghĩa của việc', () => {
    // Ba biểu tượng cùng một màu xám là ba việc khác hẳn nhau trông y hệt nhau.
    // Riêng "chia sẻ" là việc DUY NHẤT đưa dữ liệu RA NGOÀI, nên nó phải khác
    // hạng với hai việc kia chứ không chỉ khác tên.
    const than3 = tamKhac();
    for (const mau of ['ORG_TONE.primary', 'ORG_TONE.rain', 'ORG_TONE.sun']) {
      expect(than3).toContain(mau);
    }
  });

  it('chạm vào chính tấm KHÔNG đóng tấm', () => {
    // Nền phải là một lớp RIÊNG. Bọc tấm trong một `TouchableOpacity` phủ kín màn
    // thì chạm hụt một hàng — kể cả khoảng đệm giữa hai hàng — là mất luôn tấm.
    expect(MA_CHAY).toContain('styles.khacNen');
    expect(MA_CHAY).toContain('<View style={styles.khacBoc} pointerEvents="box-none">');
  });
});

describe('mục "Cây này" — hai ô NHÌN', () => {
  it('ô 3D là ô TỐI, mang hình của chính cây đó', () => {
    // Cùng khuôn với ô "Xem sơ đồ 3D" ở màn chi tiết vườn: nền tối, huy hiệu 3D
    // ở góc, hình bên trong là chính cái vật mà ô mở ra. Hai ô ở hai màn là một
    // CẶP — học một lần, dùng ở hai chỗ.
    expect(MA_CHAY).toContain('tone="space"');
    expect(MA_CHAY).toContain('<TreeModelPreview');
    expect(MA_CHAY).toContain('styles.badge3D');
  });

  it('ô ảnh dùng ẢNH BÌA làm nền, và khi chưa có ảnh thì mời làm việc gì đó', () => {
    // Ô trống báo thiếu là ngõ cụt. Ô này tự đổi thành lối quay video — đúng
    // lối DUY NHẤT để cây có thêm ảnh.
    expect(MA_CHAY).toContain('anhBia');
    expect(MA_CHAY).toContain('styles.anhChip');
    expect(MA_CHAY).toContain('handleTreeVideo()');
  });

  it('tên mục là "Cây này", không còn là "Ảnh cây"', () => {
    expect(SRC).not.toContain('Ảnh cây đã lưu');
  });
});

describe('ô 3D dùng BẢN DỰNG THẬT, không phải một model vẽ lại', () => {
  /**
   * ⛔ Bản trước ô này vẽ một khung tán bằng SVG (`layered/TreeShape.tsx`): mấy
   *    vòng elip co giãn theo góc quay, trông như một khối cầu đang quay. Nó rẻ
   *    và nó đẹp, nhưng mọi cây trong vườn cho ra CÙNG một hình, và hình đó
   *    không liên quan gì tới đám mây điểm chủ vườn đã chụp.
   *
   *    Yêu cầu nói thẳng: *"sử dụng 3D từ 3D place luôn, không tạo thêm 1 model
   *    giả"*. Tệp `TreeShape.tsx` đã gỡ hẳn; bài này canh nó đừng mọc lại dưới
   *    một cái tên khác.
   */
  it('không còn tệp hình cây tự vẽ nào', () => {
    const { existsSync } = require('fs') as typeof import('fs');
    expect(existsSync(join(__dirname, '..', 'components', 'layered', 'TreeShape.tsx'))).toBe(false);
    expect(MA_CHAY).not.toContain('TreeShape');
  });

  it('gắn ĐÚNG component xem trước của màn đặt cây 3D', () => {
    expect(SRC).toContain("from '../../../features/space3d/scene/TreeModelPreview'");
    // Cùng component, và màn 3D thật cũng dùng nó cho bộ chọn model.
    const space3d = doc(join(__dirname, '..', '..', '..', 'screens', 'Space3DScreen.tsx'));
    expect(space3d).toContain('TreeModelPreview');
  });

  it('lấy ĐÚNG model người dùng đã chọn cho cây đó', () => {
    // Đọc từ chính kho mà màn đặt cây 3D ghi. Hai chỗ đọc hai nguồn khác nhau là
    // hai chỗ hiện hai cây khác nhau cho cùng một cây.
    expect(SRC).toContain('loadTreeModelId');
    expect(SRC).toContain('DEFAULT_TREE_MODEL_ID');
  });

  it('chấm quả là lớp `FruitDots` của cảnh 3D thật, toạ độ qua `coordFromServer`', () => {
    expect(SRC).toContain('FruitDot');
    expect(SRC).toContain('coordFromServer(f)');
    const preview = doc(join(KHONG_GIAN, 'scene', 'TreeModelPreview.tsx'));
    expect(preview).toContain("import FruitDots, { type FruitDot } from './FruitDots'");
  });

  it('CHỈ quả còn trên cây mới có chấm', () => {
    // Quả đã hái / đã mất không còn trên tán. Vẽ chúng ra là nói sai về cái cây
    // đang đứng ngoài vườn.
    expect(MA_CHAY).toContain("f.status === 'on_tree'");
  });

  it('khung vẽ GL chỉ sống khi màn ĐANG mở, và lỗi của nó không kéo sập màn', () => {
    // Mỗi `<Canvas>` là một ngữ cảnh GL riêng — chính `TreeModelPreview` ghi cảnh
    // báo đó ở đầu tệp của nó. Giữ một ngữ cảnh sống khi người dùng đã đi sang
    // màn khác là tiền pin trả cho thứ không ai nhìn.
    expect(MA_CHAY).toContain('useIsFocused');
    expect(MA_CHAY).toContain('manDangMo && tree?.id');
    expect(MA_CHAY).toContain('<GLErrorBoundary tag="tree_detail_preview">');
  });

  it('hook của ô 3D nằm TRÊN câu `return` sớm', () => {
    // ⛔ Đã đặt sai một lần, ngay ở lượt viết chúng. Màn này có một `return` sớm
    //    cho lúc cây chưa về; hook đặt dưới đó thì số hook ĐỔI giữa hai lượt vẽ,
    //    và React ném "Rendered more hooks than during the previous render" —
    //    màn trắng, ở đúng đường mà người mở từ `TreeManagement` đều đi qua.
    //
    // `tsc` không thấy, `jest` render cũng không chạy tới. Bài này canh bằng thứ
    // duy nhất đo được từ nguồn: THỨ TỰ.
    const iReturn = MA_CHAY.indexOf('if (!tree) {');
    expect(iReturn).toBeGreaterThan(-1);
    for (const hook of ['useIsFocused()', 'loadTreeModelId(id)', 'const chamQua']) {
      const i = MA_CHAY.indexOf(hook);
      expect(i).toBeGreaterThan(-1);
      expect(i).toBeLessThan(iReturn);
    }
  });

  it('nền khung vẽ lấy đúng chặng tối của ô không gian', () => {
    // `<Canvas>` tô nền ĐẶC, nên nó không thể để lộ chuyển sắc của ô Bento phía
    // sau. Hai màu tối khác nhau cạnh nhau đọc ra "ảnh chưa tải xong".
    expect(MA_CHAY).toContain('ORG_GRADIENT.space.to');
    expect(MA_CHAY).toContain('background={NEN_KHONG_GIAN}');
  });
});

describe('danh sách quả — nút tròn có ảnh, lưới ba cột', () => {
  it('lưới đúng BA cột, và bề ngang nút suy theo đúng số cột đó', () => {
    expect(MA_CHAY).toContain('numColumns={3}');
    // Ba cột ⇒ lề danh sách hai bên + HAI khe. Lệch nhau thì cột cuối tràn khỏi
    // mép phải, và nó tràn ÂM THẦM — `FlatList` không kêu một tiếng nào.
    expect(MA_CHAY).toContain('Math.floor((width - 20 * 2 - 12 * 2) / 3)');
  });

  it('nút TRÒN, ảnh quả làm nền, tên nằm DƯỚI nút', () => {
    const chip = than(MA_CHAY, 'const FruitChip');
    expect(chip).toContain('borderRadius: size / 2');
    expect(chip).toContain('<RemoteImage');
    // Tên PHẢI ở ngoài khối tròn: chữ đè lên ảnh thì tương phản đổi theo từng
    // tấm, và chỗ tệ nhất quyết định chữ có đọc được hay không.
    expect(chip).toContain('</View>\n      <Text style={styles.quaTen}');
  });

  it('viền nút mang TRẠNG THÁI, lấy thẳng từ `STATUS_MAP`', () => {
    const chip = than(MA_CHAY, 'const FruitChip');
    expect(chip).toContain('borderColor: st.color');
    expect(chip).toContain('getStatus(item.status)');
  });

  it('chạm một quả mở POPUP, không mở thẳng màn khác', () => {
    expect(MA_CHAY).toContain('setQuaDangXem(item)');
    expect(MA_CHAY).toContain('styles.quaPopup');
    expect(MA_CHAY).toContain('Xem chi tiết');
  });

  it('thẻ quả hàng-ngang cũ KHÔNG quay lại', () => {
    for (const chet of ['FruitCard', 'fruitCardBody', 'fruitMetaRow', 'fruitCode']) {
      expect(MA_CHAY).not.toContain(chet);
    }
  });

  it('nút "Thêm quả" là nút ĐẶC, không còn giống ô lọc bên cạnh', () => {
    // Trước bản này nó có nền rất nhạt, viền `TONE.border`, chữ xanh — tức giống
    // HỆT ô tìm kiếm và ô lọc ngay dưới. Ba khối cùng sắc, mà chỉ MỘT trong ba
    // tạo ra dữ liệu mới.
    const i = MA_CHAY.indexOf('styles.addFruitBtnInner');
    expect(i).toBeGreaterThan(-1);
    expect(MA_CHAY.slice(i, i + 220)).toContain('<GradientFill name="action" />');
    const j = MA_CHAY.indexOf('addFruitBtnText: {');
    expect(MA_CHAY.slice(j, j + 120)).toContain('COLORS.white');
  });
});
