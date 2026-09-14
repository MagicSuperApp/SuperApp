/**
 * Cổng chặn tái phát cho một đợt vá "im lặng nuốt việc" trong module truy xuất.
 *
 * Các chỗ dưới đây có chung MỘT hình dạng: mã biến một lần hỏng thành một màn
 * hình trông bình thường, hoặc biến một điều CHƯA xảy ra thành một câu khẳng
 * định rằng nó đã xảy ra. Không phép kiểm kiểu nào bắt được — chúng đều hợp lệ
 * về kiểu — nên cổng này đối chiếu VĂN BẢN NGUỒN, cùng cách với
 * `ActivityScreen.keyboard.gate.test.ts`.
 *
 * ⚠ Mỗi ca ở đây ghim ĐÚNG MỘT chốt, và đã thử hai bên đột biến: khôi phục dòng
 * cũ thì ca tương ứng đỏ, chứ không trượt xuống ca kế tiếp.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const VOICE = read('components/VoiceMemoButton.tsx');
const META = read('screens/TreeMetadataTab.tsx');
const SHEET = read('components/TreePublicSheet.tsx');
const CARD = read('components/TreePublicCard.tsx');
const NEWS = read('screens/TraceNewsScreen.tsx');
const TREE = read('screens/TreeDetailScreen.tsx');
const ANIMALS = read('components/FarmAnimalsTab.tsx');
const POPUP = read('components/CommonPopup.tsx');
const FARM = read('screens/FarmDetailScreen.tsx');
const KEYS = fs.readFileSync(path.join(__dirname, '../../i18n/keys/trace.ts'), 'utf8');

/** Cắt thân một hàm/khối theo mốc mở và mốc đóng. */
const sliceBetween = (source: string, from: string, to: string): string => {
  const i = source.indexOf(from);
  const j = source.indexOf(to, i + from.length);
  if (i < 0 || j < 0) throw new Error(`Không tìm thấy đoạn giữa \`${from}\` và \`${to}\``);
  return source.slice(i, j);
};

describe('ghi âm — lượt dừng hỏng phải nói ra', () => {
  it('lượt dừng TỰ ĐỘNG không còn được miễn báo lỗi', () => {
    // Lỗi gốc: `catch { if (!auto) showError(...) }`. Mốc 30 giây là lần dừng HAY
    // HỎNG NHẤT (đĩa vừa đầy nhất, người dùng không chạm vào máy), và nó là lần
    // duy nhất bị bịt miệng. `onRecorded` không chạy ⟹ 30 giây nói mất trắng.
    expect(VOICE).not.toMatch(/if \(!auto\)\s*showError/);
  });

  it('nhánh hỏng của lượt dừng vừa BÁO vừa GIỮ thẻ đang ghi', () => {
    const stopFn = sliceBetween(VOICE, 'const handleStopInternal', 'const handleStop =');
    expect(stopFn).toMatch(/setStopFailed\(true\);/);
    expect(stopFn).toMatch(/showError\(/);
    // ⛔ `setRecording(false)` KHÔNG được nằm trong `finally`: ở đó nó chạy cả ở
    // nhánh hỏng, và thẻ ghi âm rơi về nút trống — tức app khẳng định "chưa có gì
    // được ghi" đúng lúc vừa mất một đoạn ghi có thật.
    const finallyBlock = sliceBetween(stopFn, '} finally {', '\n  };');
    expect(finallyBlock).not.toMatch(/setRecording\(false\)/);
  });

  it('câu nói ra lượt dừng hỏng là câu bảo người dùng làm gì tiếp', () => {
    expect(VOICE).toMatch(/Đoạn ghi âm vừa rồi không lưu được — bấm ghi lại/);
  });

  it('mốc tự dừng chỉ bắn MỘT lần cho mỗi lượt ghi', () => {
    // Không có cổng này thì đồng hồ vượt mốc mỗi nhịp và bắn lại một lượt dừng
    // đã hỏng — ra một chuỗi hộp thoại lỗi không dứt.
    expect(VOICE).toMatch(/!autoStopFiredRef\.current/);
  });
});

describe('ghi âm — "đã lưu" chỉ được nói khi đã lưu thật', () => {
  it('thẻ ghi âm KHÔNG còn nói "Ghi âm đã lưu"', () => {
    // Lúc đó `onRecorded` mới đặt state trong tab; đường lưu thật là nút "Lưu
    // thông tin" ở thanh dưới.
    expect(VOICE).not.toMatch(/Ghi âm đã lưu/);
    expect(VOICE).toMatch(/Đã ghi xong — bấm Lưu thông tin để giữ lại/);
  });

  it('bản ghi MỒ CÔI được nhặt lại khi mở tab', () => {
    // `getExistingRecording` khai trong `VoiceMemoNative` từ đầu mà 0 nơi gọi.
    // Không có lượt gọi này thì mở lại cây chỉ thấy "Bấm để ghi âm" dù tệp AAC
    // vẫn nằm nguyên trong máy, và người dùng ghi đè lên chính đoạn mình vừa nói.
    expect(VOICE).toMatch(/export async function getExistingRecording/);
    expect(META).toMatch(/getExistingRecording\(tree\.id\)/);
  });
});

describe('hồ sơ cây — nút không được khai đã lên máy chủ khi chưa', () => {
  it('`setDirty(false)` KHÔNG chạy trước nhánh `pending`', () => {
    // Lỗi gốc: nó chạy ngay sau `.unwrap()`, tức hạ cờ cho cả lượt gửi đã TRƯỢT.
    const beforeBranch = sliceBetween(
      META,
      'saveTreeMetadata({ treeId: tree.id, metadata })',
      'if (saved.pending)',
    );
    expect(beforeBranch).not.toMatch(/setDirty\(false\)/);
  });

  it('nhánh `pending` ghi nhận là CHƯA lên máy chủ', () => {
    const pendingBranch = sliceBetween(META, 'if (saved.pending) {', '} else {');
    expect(pendingBranch).toMatch(/setSaveState\('pending'\)/);
  });

  it('nhãn nút TÁCH khỏi `dirty` — ba nhãn cho ba sự thật', () => {
    // `dirty` là "form có khác KHO CỤC BỘ không", mà `saveTreeMetadata` ghi cục
    // bộ cả khi máy chủ từ chối. Treo nhãn vào `dirty` là đọc một phép đo trả lời
    // câu khác.
    expect(META).not.toMatch(/tk\(dirty \? 'trace\.meta\.save' : 'trace\.meta\.saved'\)/);
    expect(META).toMatch(/tk\(saveLabelKey\)/);
    expect(META).toMatch(/'trace\.meta\.savePending'/);
    expect(KEYS).toMatch(/'trace\.meta\.savePending':/);
  });

  it('lượt gửi trượt vẫn còn đường THỬ LẠI', () => {
    // `dirty` về `false` sau lượt trượt (kho cục bộ đã khớp form), nên nếu nút
    // chỉ mở theo `dirty` thì nó tắt và không còn cách nào gửi lại.
    expect(META).toMatch(/\(dirty \|\| saveState === 'pending'\)/);
  });
});

describe('trạng thái công khai — mất mạng không được đọc thành "chưa công khai"', () => {
  for (const [name, source] of [['TreePublicSheet', SHEET], ['TreePublicCard', CARD]] as const) {
    it(`${name}: ba nhánh của \`ProvenanceResult\` được đọc thành ba, không thành hai`, () => {
      // `getProvenance` trả `ok` · `not_public` · `error`. Gộp `error` vào
      // `not_public` thì sóng yếu hiện "Chưa công khai", nông dân bấm để bật, và
      // hạ mức thật của một cây đang bán được.
      expect(source).toMatch(/if \(r\.kind === 'error'\)/);
      expect(source).toMatch(/setReadError\(true\)/);
      expect(source).toMatch(/Chưa đọc được trạng thái — cần mạng/);
    });
  }

  it('TreePublicSheet: ba lựa chọn bị KHOÁ khi chưa đọc được trạng thái', () => {
    // Đổi mức mà không biết mức hiện tại là đổi mù.
    expect(SHEET).toMatch(/const locked = saving \|\| readError;/);
    expect(SHEET).toMatch(/disabled=\{locked\}/);
  });
});

describe('tin nhà nông — câu hướng dẫn phải khớp thứ màn hình nhận', () => {
  it('nhánh "chưa lấy được tin" có vùng KÉO ĐƯỢC thật', () => {
    // Câu `trace.news.failBody` bảo "Kéo màn hình xuống để thử lại", nhưng nhánh
    // đó trước đây là `<View>` thuần — `RefreshControl` nằm trên `FlatList` không
    // được dựng ở nhánh này.
    const emptyBranch = sliceBetween(NEWS, ') : news.length === 0 ? (', ') : (');
    expect(emptyBranch).toMatch(/<ScrollView/);
    expect(emptyBranch).toMatch(/refreshControl=\{/);
    expect(emptyBranch).toMatch(/trace\.news\.retry/);
  });

  it('chạm vào một tin mà mở không được thì PHẢI nói', () => {
    expect(NEWS).not.toMatch(/Linking\.openURL\([^)]*\)\.catch\(\(\) => \{\}\)/);
    expect(NEWS).toMatch(/Không mở được bài này/);
  });
});

describe('chi tiết cây — lỗi mạng không được hiện thành "chưa ghi nhận quả nào"', () => {
  it('tab Lịch sử dùng cùng THỨ TỰ ƯU TIÊN với tab Tổng quan', () => {
    const historyTab = sliceBetween(TREE, 'const historyBody = (', 'renderItem={({ item }) => {');
    expect(historyTab).toMatch(/fruitsLoading \?/);
    expect(historyTab).toMatch(/\) : fruitsError \? \(/);
    expect(historyTab).toMatch(/Không tải được quả/);
    // Nút Thử lại — bản trước đẩy lỗi xuống dòng phụ xám và KHÔNG có đường nào
    // thử lại, nên màn đứng ở đó vĩnh viễn.
    expect(historyTab).toMatch(/fetchFruits\(true\)/);
  });
});

describe('sổ đàn — một lượt ném không được khoá tab vĩnh viễn', () => {
  it('cờ đang-chạy đặt lại trong `finally`', () => {
    // Bản trước đặt `true` ở đầu và `false` ở dòng cuối, không `try/finally`.
    // MỘT lượt ném ở giữa là cờ kẹt `true` mãi: mọi lượt gọi sau thoát ngay ở
    // cổng đầu hàm, tab đứng ở "Đang đọc sổ đàn…" tới khi tắt ứng dụng.
    const loadFn = sliceBetween(ANIMALS, 'const tai = useCallback(', '}, [farmId]);');
    expect(loadFn).toMatch(/\} finally \{[\s\S]*?dangChay\.current = false;/);
    expect(loadFn).toMatch(/\} catch \(e: any\) \{[\s\S]*?setLoi\(/);
  });
});

describe('hộp nhập chung — chạm vào hộp thoại không được vứt chữ đã gõ', () => {
  it('ô hộp thoại nằm NGOÀI vùng chạm-để-đóng', () => {
    // Bản trước đặt `modalContent` BÊN TRONG `TouchableOpacity onPress={handleClose}`,
    // nên chạm vào tiêu đề, khoảng đệm, mép ô — phần lớn diện tích hộp thoại —
    // đều đóng hộp.
    const scrim = POPUP.match(/<TouchableOpacity\s+style=\{StyleSheet\.absoluteFill\}[\s\S]*?\/>/);
    expect(scrim).not.toBeNull();
    // Tấm đóng phải TỰ ĐÓNG (`/>`), tức không bọc gì; và ô hộp thoại đứng sau nó.
    expect(POPUP.indexOf('styles.modalContent')).toBeGreaterThan(
      POPUP.indexOf(scrim![0]) + scrim![0].length,
    );
    expect(POPUP).toMatch(/pointerEvents="box-none"/);
  });
});

describe('vẽ vườn — mất GPS và mất tiến trình đều phải có chỗ đỡ', () => {
  it('hàm LỖI của `watchPosition` đổi trạng thái màn, không chỉ ghi nhật ký', () => {
    // Bản trước chỉ `console.log`: màn vẫn đập nhịp đỏ và vẫn ghi "Đang ghi… đi
    // vòng quanh vườn" trong khi không điểm nào vào nữa.
    const errorHandler = sliceBetween(FARM, "console.log('[AddFarmMode] watchPosition error:'", '},');
    expect(errorHandler).toMatch(/setGpsLost\(true\)/);
  });

  it('câu gợi ý nói ra việc KHÔNG ghi thêm được điểm nào', () => {
    expect(FARM).toMatch(/Mất tín hiệu GPS — chưa ghi thêm điểm nào/);
  });

  it('đồng hồ dừng ghi chạy ĐỘC LẬP với callback định vị', () => {
    // Van 5 phút đã có (`GPS_BAD_HARD_TIMEOUT_MS`) không cứu được ca này: nó nằm
    // trong `decideWalkAway`, mà `decideWalkAway` chỉ chạy trong hàm THÀNH CÔNG.
    // Mất tín hiệu nghĩa là hàm thành công thôi chạy ⟹ van thôi chạy theo.
    expect(FARM).toMatch(/const GPS_NO_FIX_STOP_MS = 90_000;/);
    const watchdog = sliceBetween(FARM, 'if (!isAutoRecording) return;', '}, [isAutoRecording, setEditMode]);');
    expect(watchdog).toMatch(/setInterval\(/);
    expect(watchdog).toMatch(/GPS_NO_FIX_STOP_MS/);
    expect(watchdog).toMatch(/setIsAutoRecording\(false\)/);
  });

  it('các điểm GPS được GHI XUỐNG MÁY sau mỗi điểm', () => {
    // Câu "Các điểm GPS bạn đã ghi vẫn được giữ." chỉ đúng chừng nào màn còn
    // sống: `coordinates` chỉ nằm trong `useState`. Người dùng yên tâm thoát app,
    // hệ điều hành thu hồi tiến trình, hai mươi phút đi vòng biến mất.
    expect(FARM).toMatch(/const FARM_DRAFT_KEY = /);
    const draftWrite = sliceBetween(
      FARM,
      'const draft: FarmDraft = {',
      '}, [coordinates, farmNameInput, farm_id]);',
    );
    expect(draftWrite).toMatch(/AsyncStorage\.setItem\(FARM_DRAFT_KEY/);
    expect(draftWrite).toMatch(/coordinates,/);
    expect(draftWrite).toMatch(/farmName: farmNameInput,/);
  });

  it('mở lại màn thì HỎI có đi tiếp bản vẽ dở không', () => {
    expect(FARM).toMatch(/Còn một vườn đang vẽ dở/);
    expect(FARM).toMatch(/AsyncStorage\.getItem\(FARM_DRAFT_KEY\)/);
  });

  it('nháp được XOÁ khi vườn đã lên máy chủ và khi người dùng chủ ý thoát', () => {
    // Giữ lại thì lần mở màn sau app mời đi tiếp một vườn đã tạo xong.
    //
    // ⛔ Ghim ĐÚNG HAI CHỖ GỌI, không đếm số lần xuất hiện của tên hàm. Bản trước
    // của ca này là một phép đếm ngưỡng (`>= 3`), và nó đếm cả DÒNG KHAI hàm cùng
    // ba lượt gọi dọn dẹp khác — nên gỡ hẳn lượt xoá sau khi lưu xong thì con số
    // vẫn trên ngưỡng và ca vẫn xanh. Đo được: đột biến `M24-draft-clear` đi qua
    // với 37/37 xanh.
    expect(FARM).toMatch(/await clearFarmDraft\(\);\n\s*walkAwayStateRef\.current = initWalkAwayState\(\);/);
    expect(FARM).toMatch(/onBack=\{\(\) => \{ void clearFarmDraft\(\); navigation\.goBack\(\); \}\}/);
  });

  it('câu hứa "vẫn được giữ" không còn đứng một mình', () => {
    // Nhãn chắc phải kèm cơ chế giữ. Câu cũ nói đúng thứ KHÔNG có gì làm.
    expect(FARM).not.toMatch(/Các điểm GPS bạn đã ghi vẫn được giữ\./);
  });
});
