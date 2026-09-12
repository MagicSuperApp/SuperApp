/**
 * Cổng nguồn cho NÚT "Dựng hình 3D" và cho LỐI VÀO NHÌN THẤY ĐƯỢC của vật nuôi.
 *
 * ── Vì sao bài này tồn tại ──────────────────────────────────────────────────
 * Hai chỗ dưới đây thuộc cùng một lớp hỏng, và lớp đó không cổng kiểu nào bắt
 * được: **hàm ở tầng dịch vụ viết xong, chạy đúng, có bài kiểm riêng xanh — mà
 * không đường nào từ giao diện gọi tới.** Mọi bài kiểm hàm thuần đều xanh suốt
 * thời gian lỗ đó tồn tại, vì bản thân hàm không hỏng.
 *
 *   1. `buildTree3D` — cửa duy nhất bảo máy chủ dựng mô hình 3D cho một cây.
 *      Lời gọi duy nhất của nó nằm trong `TreeViewer3DScreen`, mà màn ấy không
 *      tuyến nào mở tới (mọi lối vào 3D nay đổ về `Space3DScreen`). Cùng lúc,
 *      `treePoints.ts` bảo người dùng *"Chụp thêm ảnh quanh cây rồi bấm dựng"* —
 *      một mệnh lệnh trỏ vào cái nút không tồn tại.
 *
 *   2. Nhánh vật nuôi — bốn màn, bốn tuyến, dịch vụ đủ, nhưng lối vào duy nhất
 *      là KÉO nút giữa rồi thả trúng một cung con. Cử chỉ đó chạy đúng và vẫn
 *      giữ nguyên; cái thiếu là một chữ "vật nuôi" NHÌN THẤY ĐƯỢC ở đâu đó.
 *
 * ── Bài này đo GÌ ───────────────────────────────────────────────────────────
 * Đo MÃ NGUỒN, cùng khuôn với các bài `.gate.test.ts` bên cạnh và cùng lý do:
 * dựng `Space3DScreen` trong jest kéo theo expo-gl + three + WebView.
 *
 * Nó KHÔNG đo nút có bấm được trên máy thật không, và KHÔNG đo máy chủ trả gì.
 * Phép đo cuối cho hai câu đó là mở app thật trên một cây chưa có bản dựng.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Chuẩn hoá CRLF ngay tại cửa đọc: máy dựng chính là Windows đặt
// `core.autocrlf=true` (xem `.gitattributes`).
const read = (...p: string[]) => readFileSync(join(__dirname, ...p), 'utf8').replace(/\r\n/g, '\n');

const SPACE3D = read('Space3DScreen.tsx');
const TREE_POINTS = read('..', 'features', 'space3d', 'treePoints.ts');
const TREE_MODEL = read('..', 'features', 'space3d', 'scene', 'TreeModel.tsx');
const FARM_DETAIL = read('..', 'modules', 'trace', 'screens', 'FarmDetailScreen.tsx');
const NAV = read('..', 'navigation', 'index.tsx');

describe('Nút dựng hình 3D — dây nối từ màn tới cửa máy chủ', () => {
  it('màn không gian 3D gọi `buildTree3D` thật, không chỉ nhập khẩu', () => {
    expect(SPACE3D).toContain("import { buildTree3D } from '../services/treeReIDService'");
    // `treeId` chứ không `focusTree.id`: mã cây phải được CHỐT một lần trước khi
    // gọi mạng, rồi dùng lại đúng cái đó lúc ghi kết quả. Đọc `focusTree.id` ở
    // hai thời điểm khác nhau là cách đường đua đổi cây chui vào.
    expect(SPACE3D).toContain('const treeId = focusTree.id;');
    expect(SPACE3D).toContain('await buildTree3D(ORILIFE_BASE, treeId)');
  });

  it('nút gắn vào đúng hàm xử lý, và có điều kiện bày', () => {
    expect(SPACE3D).toContain('onPress={askBuild3D}');
    expect(SPACE3D).toContain('{canBuild3D ?');
  });

  /**
   * Đây là phần dễ hỏng nhất và cũng là phần rẻ nhất để ghim.
   *
   * `meta.status === 'building'` nghĩa là máy chủ ĐÃ có một lượt đang chạy. Bày
   * nút ở đó là mời người dùng xếp hàng chồng lên chính mình. Cách sai để biết
   * điều đó là dò câu chữ trong `message` — câu chữ đổi thì phép so sánh chết
   * im lặng, nút hiện lại mà không ai biết. Nên `serverStatus` là một trường
   * riêng, mang nguyên văn của máy chủ, và bài này ghim cả ba mắt xích của nó.
   */
  it('trạng thái thô của máy chủ đi hết ba chặng: treePoints → TreeModel → màn', () => {
    expect(TREE_POINTS).toContain("kind: 'unavailable'; message: string; serverStatus?: string");
    expect(TREE_POINTS).toContain('serverStatus: status');
    expect(TREE_MODEL).toContain('serverStatus?: string');
    expect(TREE_MODEL).toContain("serverStatus: r.kind === 'unavailable' ? r.serverStatus : undefined");
    expect(SPACE3D).toContain("focusPointsStatus.serverStatus !== 'building'");
  });

  /**
   * Nút phải đọc trạng thái ĐÁM MÂY ĐIỂM, không đọc trạng thái của model người
   * dùng đang chọn để xem. Tra theo `focusTree.modelId` thì chọn kiểu "cây tự
   * tạo" cho dễ nhìn lại làm nút dựng biến mất, trong khi cây vẫn thật sự chưa
   * có bản dựng — một lựa chọn HIỂN THỊ đóng mất một cửa GHI.
   */
  it('điều kiện bày nút tra theo model mặc định, không theo model đang xem', () => {
    expect(SPACE3D).toContain(
      'findTreeModelStatus(modelStatuses, DEFAULT_TREE_MODEL_ID, focusTree.id)',
    );
    expect(SPACE3D).toContain("focusPointsStatus?.state === 'missing'");
  });

  it('không dò câu chữ tiếng Việt để đoán máy chủ đang dựng', () => {
    // Một phép so sánh kiểu `message.includes('đang dựng')` là chỗ hỏng câm mà
    // trường `serverStatus` sinh ra để tránh — nó không được phép quay lại.
    expect(SPACE3D).not.toMatch(/message[^\n]*(includes|indexOf|startsWith)\s*\(\s*['"`]đang dựng/);
  });

  /**
   * `building: true` của máy chủ nghĩa là ĐÃ XẾP HÀNG, không phải "đang dựng
   * ngay" — làn 3D chỉ chạy khi làn xuất xứ rảnh (ghi ở docstring `buildTree3D`).
   * Viết "đang dựng" là hứa hộ máy chủ một mốc nó không hứa.
   */
  it('câu báo thành công nói "đã xếp hàng", không nói "đang dựng"', () => {
    expect(SPACE3D).toContain('Đã xếp hàng dựng hình 3D');
  });

  it('ca 404 có câu riêng, không gộp vào câu lỗi chung', () => {
    expect(SPACE3D).toContain('if (r.noProvenance)');
    expect(SPACE3D).toContain('chưa có hồ sơ xuất xứ');
  });

  /**
   * Lời gọi mạng mất vài giây, và trong quãng đó người dùng chạm được sang cây
   * khác. Bản đầu dọn bằng một `useEffect` theo `focusTreeId` — KHÔNG đủ, và
   * thiếu theo một chiều khó thấy: `askBuild3D` đóng trên `focusTree` của lúc
   * bấm, nên khi nó trả về, nó ghi state vô điều kiện ĐÈ lên thứ `useEffect` vừa
   * dọn. Kết quả: câu "Đã xếp hàng dựng hình 3D" của cây A hiện dưới tên cây B,
   * còn B thì chưa hề được gửi yêu cầu nào.
   *
   * Cách chắc là mang mã cây THEO state rồi lọc ở lúc vẽ — thứ duy nhất đọc được
   * cả cây-lúc-bấm lẫn cây-lúc-vẽ.
   */
  it('kết quả một lượt bấm chỉ nói về đúng cây đã bấm', () => {
    expect(SPACE3D).toContain('setBuild3d({ treeId, state:');
    expect(SPACE3D).toContain("build3d.treeId && build3d.treeId === focusTreeId");
    // Và cách cũ không được quay lại: dọn theo `focusTreeId` là cái bẫy ở trên.
    expect(SPACE3D).not.toContain("useEffect(() => { setBuild3d({ state: 'idle' }); }, [focusTreeId]);");
  });

  /**
   * Một lần rớt mạng KHÔNG được lấy mất đường thử lại. Gộp nhánh hỏng vào `done`
   * thì `canBuild3D` tắt nút vĩnh viễn: người dùng đọc "chưa gửi được yêu cầu
   * dựng hình" rồi hết cách bấm lại, trừ khi rời màn và quay vào — mà không có
   * gì trên màn nói điều đó.
   */
  it('lỗi mạng ra trạng thái riêng, không khoá luôn đường thử lại', () => {
    expect(SPACE3D).toContain("state: 'error'");
    expect(SPACE3D).toContain("build3dHere.state !== 'done'");
  });

  /** Màn tháo giữa chừng thì thôi ghi state. */
  it('không ghi trạng thái sau khi màn đã tháo', () => {
    expect(SPACE3D).toContain('if (!aliveRef.current) return;');
  });

  /**
   * Dải nhắc trước đây là `pointerEvents="none"` — đúng, vì nó chỉ là chữ và
   * không được ăn mất cử chỉ xoay cảnh. Đặt một nút vào trong nó mà quên đổi
   * thì nút vẽ ra, trông bấm được, và không bao giờ nhận được cú chạm nào.
   * `box-none` giữ nguyên ý cũ cho phần chữ và chỉ mở đường cho con bên trong.
   */
  it('dải nhắc cho cú chạm đi qua tới nút', () => {
    expect(SPACE3D).toContain('style={styles.modelWarn} pointerEvents="box-none"');
    expect(SPACE3D).not.toContain('style={styles.modelWarn} pointerEvents="none"');
  });
});

describe('Vật nuôi — lối vào nhìn thấy được', () => {
  it('màn chi tiết vườn mở sổ vật nuôi KÈM mã vườn', () => {
    expect(FARM_DETAIL).toContain(
      "navigate('AnimalManagement', { farmId: String(farm.id) })",
    );
  });

  /**
   * Mã vườn không phải chi tiết trang trí. Màn sổ lọc theo `farmId`
   * (`AnimalManagementScreen.tsx` ▸ `listAnimals(BASE_URL, farmId, …)`), nên mở
   * nó không kèm mã thì nó liệt kê vật nuôi của MỌI vườn dưới tiêu đề một vườn
   * — sai theo đúng chiều người dùng không nhận ra.
   */
  it('ô chỉ hiện khi đã biết mã vườn', () => {
    expect(FARM_DETAIL).toContain('{dichDuong || farm?.id ? (');
  });

  it('cung con vẫn trỏ màn CÓ máy ảnh, không trỏ màn danh sách', () => {
    const gate = read('..', 'navigation', 'resolveGateItems.ts');
    expect(gate).toContain("label: 'Quét con vật', route: 'AnimalIdentity'");
  });
});

describe('FruitLookup — chú thích phải nói đúng trạng thái', () => {
  /**
   * Chú thích cũ khai màn này "vào từ TraceScanScreen". Đo lại: `TraceScanScreen`
   * không có lời gọi nào tới nó, và chính nó đã tự tra quả bằng cùng một
   * `lookupFruit`. Một chú thích khai một lối vào không tồn tại là thứ dẫn người
   * đọc sau đi nối lại một bản thứ hai của việc đã có.
   */
  it('không còn khai một lối vào không tồn tại', () => {
    expect(NAV).not.toContain("Vào từ màn \"Quét truy xuất\" (`TraceScanScreen`)");
    expect(NAV).toContain('BẢN THỨ HAI đã chết của đường NGƯỜI MUA');
  });
});
