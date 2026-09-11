/**
 * MỘT luật toạ độ cho cả kho — không phải bảy bản gần giống nhau.
 *
 * ── Vì sao bài này tồn tại, và vì sao nó KHÔNG nằm trong `farmShapeGeo.test.ts` ──
 * Lỗi được báo nằm ở `farmShapeGeo.hopLe`: phép kiểm chỉ hỏi "có phải số hữu
 * hạn không", nên `lat=0,lng=0` (giá trị máy sinh ra khi chưa bắt được GPS) và
 * `lat=999` đều lọt. Vá đúng chỗ ấy thì hình thửa hết hỏng, và NGUYÊN NHÂN còn
 * nguyên: cùng phép kiểm ấy được chép ra bảy chỗ, mỗi bản thiếu một ràng buộc
 * khác nhau —
 *
 *   `farmShapeGeo.hopLe`        hữu hạn         (thiếu dải, thiếu 0/0)
 *   `farmShapeGeo.viTriCay`     hữu hạn         (thiếu dải, thiếu 0/0)
 *   `farmMapGeo._valid`         hữu hạn + dải   (thiếu 0/0)
 *   `FarmMapScreen.hopLe`       hữu hạn + dải   (thiếu 0/0)
 *   `treeGeo.parseGps`          hữu hạn         (thiếu dải, thiếu 0/0)
 *   `radar.asLatLon`            hữu hạn         (thiếu dải, thiếu 0/0)
 *   `provenanceView.gpsPoint`   hữu hạn + dải   (thiếu 0/0)
 *
 * Hệ quả không phải "một màn vẽ sai": cùng MỘT cái cây được màn này nhận và màn
 * kia loại, nên hai màn đếm ra hai con số cây và không màn nào tự khai là đang
 * lọc. Bài này ghim chiều ngược lại: mọi cửa nhận toạ độ đồng ý với nhau.
 *
 * Nguồn luật là `isValidLatLon` (`features/wayfind/wayfind.ts`) — bản NGHIÊM đã
 * có sẵn trong kho từ trước, ép đủ ba ràng buộc. Sáu bản kia nay trỏ về nó.
 *
 * ── Bài này đo GÌ ──────────────────────────────────────────────────────────
 * HÀNH VI, bằng cách gọi thật từng hàm với cùng một bộ đầu vào. Không đo mã
 * nguồn bằng biểu thức chính quy: một bản sao thứ tám viết đúng luật thì không
 * có gì sai, còn một bản trỏ về nguồn mà đảo dấu thì regex vẫn xanh.
 */
import { isValidLatLon } from '../../../features/wayfind/wayfind';
import { asLatLon } from '../../../features/wayfind/radar';
import { parseGps, farmOrigin } from '../../../features/space3d/treeGeo';
import { isUsableLatLng } from '../../../features/space3d/geo';
import { gpsPoint } from '../../../features/traceResult/provenanceView';
import { farmAnchor } from './farmMapGeo';
import { hopLe, viTriCay } from './farmShapeGeo';

/**
 * Mỗi mục là một cặp `[toạ độ, có dùng được không]`.
 *
 * Bảng cố ý chứa CẢ HAI cực. Chỉ liệt kê ca phải-bị-loại thì một hàm trả `false`
 * cho mọi thứ cũng xanh — và đó đúng là cách một phép kiểm siết quá tay đi lọt.
 */
const CASES: ReadonlyArray<readonly [{ lat: number; lng: number }, boolean, string]> = [
  [{ lat: 12.68, lng: 108.12 }, true, 'vườn thật ở Tây Nguyên'],
  [{ lat: 0, lng: 105.2 }, true, 'trên xích đạo — `0` ở MỘT trục vẫn thật'],
  [{ lat: 10.5, lng: 0 }, true, 'trên kinh tuyến gốc'],
  [{ lat: 90, lng: 180 }, true, 'sát biên trên'],
  [{ lat: -90, lng: -180 }, true, 'sát biên dưới'],

  [{ lat: 0, lng: 0 }, false, 'chưa bắt được GPS — Vịnh Guinea'],
  [{ lat: 91, lng: 105 }, false, 'vĩ độ ngoài dải'],
  [{ lat: 999, lng: 105 }, false, 'vĩ độ rác'],
  [{ lat: 10, lng: 181 }, false, 'kinh độ ngoài dải'],
  [{ lat: 10, lng: -5000 }, false, 'kinh độ rác'],
  [{ lat: NaN, lng: 105 }, false, 'không phải số'],
];

/** Bảng phải thật sự có hai cực, nếu không mọi phép so dưới đây vô nghĩa. */
it('bảng đầu vào phân biệt được hai cực', () => {
  expect(CASES.filter(([, ok]) => ok).length).toBeGreaterThan(2);
  expect(CASES.filter(([, ok]) => !ok).length).toBeGreaterThan(2);
});

describe('mọi cửa nhận toạ độ theo cùng một luật', () => {
  it.each(CASES)('%j → %s (%s)', (p, usable) => {
    expect(isValidLatLon({ lat: p.lat, lon: p.lng })).toBe(usable);
    expect(isUsableLatLng(p)).toBe(usable);

    // Hình thửa (`components/layered/FarmShape`).
    expect(hopLe(p)).toBe(usable);
    expect(viTriCay({ latitude: p.lat, longitude: p.lng }) !== null).toBe(usable);

    // Bản đồ vườn — ghim lấy `center` của máy chủ.
    expect(farmAnchor({ center: p } as any) !== null).toBe(usable);

    // Sơ đồ 3D + dẫn đường.
    expect(parseGps({ lat: p.lat, lng: p.lng }) !== null).toBe(usable);
    expect(parseGps([p.lat, p.lng]) !== null).toBe(usable);
    expect(asLatLon({ lat: p.lat, lng: p.lng }) !== null).toBe(usable);

    // Màn truy xuất.
    expect(gpsPoint({ gps: [p.lat, p.lng] } as any) !== null).toBe(usable);
  });
});

describe('một đỉnh rác KHÔNG được kéo cả vườn đi', () => {
  const FARM_RING = [
    { lat: 12.68, lng: 108.12 },
    { lat: 12.69, lng: 108.13 },
    { lat: 12.68, lng: 108.14 },
  ];

  it('gốc hệ toạ độ giữ nguyên khi thêm một đỉnh `0/0`', () => {
    // Đây là hình dạng thiệt hại thật: gốc lệch thì MỌI cây đặt tay dịch theo,
    // đều đặn, và không ai nghĩ ra là do đâu.
    const clean = farmOrigin(FARM_RING);
    const polluted = farmOrigin([...FARM_RING, { lat: 0, lng: 0 }]);
    expect(clean).not.toBeNull();
    expect(polluted).toEqual(clean);
  });

  it('ghim vườn vẫn nằm trong vườn khi ranh có một đỉnh `0/0`', () => {
    const pin = farmAnchor({ coordinates: [...FARM_RING, { lat: 0, lng: 0 }] } as any);
    expect(pin).not.toBeNull();
    expect(pin!.lat).toBeGreaterThan(12);
    expect(pin!.lng).toBeGreaterThan(108);
  });
});
