// services/treeRegions.test.ts
//
// KHOANH-CÂY: vùng khoanh theo TỪNG ảnh khi trong khung có hai cây liền nhau.
//
// VÌ SAO PHẢI KHOÁ Ở TẦNG NÀY. Cả ba luật dưới đây đều vá một lỗi mà máy chủ
// KHÔNG báo: gửi sai thì `/api/enroll` vẫn trả `200 {ok:true}`, cây vẫn được tạo,
// nông dân vẫn thấy màn báo thành công. Cái sai chỉ lộ ra nhiều tuần sau, dưới
// dạng "máy nhận nhầm sang cây bên cạnh" — lúc đó gallery đã nhiễm ảnh cắt sai
// và không truy ngược được lượt gửi nào gây ra.
//
// Nguồn hợp đồng: OriLife-Core/MassTreeIdentify/MOBILE-API-CONTRACT.md mục ⚠️5,
// và mã máy chủ `core/server.py` — `_parse_regions` (~:270) + `_region_item` (~:247).

import { buildTreeRegions, type TreeRegion } from './treeReIDService';

const R = (over: Partial<TreeRegion> = {}): TreeRegion => ({
  imgW: 1000,
  imgH: 800,
  bbox: [10, 20, 100, 200],
  ...over,
});

describe('buildTreeRegions — không khoanh gì thì KHÔNG gửi trường nào', () => {
  // Đây là luật đắt nhất. `_parse_regions` coi '[]' và '{}' là "không gửi" rồi rơi
  // về `points`/`bbox_*` cấp form. Nên gửi mảng rỗng KHÔNG tắt được vùng khoanh —
  // nó mở lại đúng đường cũ: MỘT vùng áp cho MỌI ảnh. Với 5 ảnh chụp 5 góc khác
  // nhau thì 4 ảnh bị cắt trúng nền hoặc trúng cây bên cạnh.
  it('mảng rỗng → null', () => {
    expect(buildTreeRegions([])).toBeNull();
  });

  it('toàn null → null, KHÔNG phải chuỗi "[null,null]"', () => {
    expect(buildTreeRegions([null, null, undefined])).toBeNull();
  });

  it('vùng có toạ độ nhưng thiếu kích thước ảnh → null', () => {
    // Không biết đo ở hệ nào thì con số vô nghĩa: máy chủ sẽ hiểu theo hệ ảnh
    // giải mã của nó, lệch bao nhiêu không ai biết trước.
    expect(buildTreeRegions([{ bbox: [1, 2, 3, 4] } as unknown as TreeRegion])).toBeNull();
    expect(buildTreeRegions([R({ imgW: 0 })])).toBeNull();
    expect(buildTreeRegions([R({ imgW: NaN })])).toBeNull();
  });

  it('đa giác dưới 3 đỉnh mà không có bbox → null', () => {
    expect(buildTreeRegions([R({ points: [[1, 1], [2, 2]], bbox: undefined })])).toBeNull();
  });
});

describe('buildTreeRegions — mỗi phần tử phải TỰ khai shape', () => {
  // footgun #127 trong `_region_item`: phần tử không có "shape" thì KẾ THỪA shape
  // cấp form. Nghĩa là gửi [{points:[...]}] kèm shape='rect' cấp trên sẽ cắt hình
  // chữ nhật thay vì cắt theo đa giác — mất che nền, cây bên cạnh lọt vào embed,
  // và không có một dòng lỗi nào. Client không được để chỗ trống đó tồn tại.
  it('có points mà không khai shape → tự điền "poly"', () => {
    const out = buildTreeRegions([R({ points: [[0, 0], [10, 0], [10, 10]], bbox: undefined })])!;
    expect(JSON.parse(out.regions)[0].shape).toBe('poly');
  });

  it('chỉ có bbox mà không khai shape → tự điền "rect"', () => {
    const out = buildTreeRegions([R()])!;
    expect(JSON.parse(out.regions)[0].shape).toBe('rect');
  });

  it('shape người dùng chọn được giữ nguyên', () => {
    const out = buildTreeRegions([R({ shape: 'ellipse' })])!;
    expect(JSON.parse(out.regions)[0].shape).toBe('ellipse');
  });

  it('MỌI phần tử không-null đều có shape', () => {
    const out = buildTreeRegions([R(), null, R({ points: [[1, 1], [2, 2], [3, 3]] })])!;
    for (const item of JSON.parse(out.regions)) {
      if (item !== null) expect(typeof item.shape).toBe('string');
    }
  });
});

describe('buildTreeRegions — giữ đúng vị trí song song files[]', () => {
  // `_parse_regions` ghép regions[i] với files[i]. Lọc bỏ phần tử null là đẩy vùng
  // của ảnh 3 sang ảnh 2 — cắt nhầm ảnh, mà vẫn 200.
  it('ảnh không khoanh nằm giữa vẫn là null đúng chỗ', () => {
    const out = buildTreeRegions([R(), null, R({ shape: 'ellipse' })])!;
    const arr = JSON.parse(out.regions);
    expect(arr).toHaveLength(3);
    expect(arr[1]).toBeNull();
    expect(arr[0].shape).toBe('rect');
    expect(arr[2].shape).toBe('ellipse');
  });

  it('ảnh đầu không khoanh vẫn giữ chỗ null', () => {
    const out = buildTreeRegions([null, R()])!;
    const arr = JSON.parse(out.regions);
    expect(arr[0]).toBeNull();
    expect(arr[1]).not.toBeNull();
  });
});

describe('buildTreeRegions — quy mọi ảnh về MỘT hệ toạ độ', () => {
  // Máy chủ chỉ nhận đúng MỘT cặp img_w/img_h cho cả lượt gửi (`_ref_dims`, dùng ở
  // `server.py:2967` và `:4709`), rồi lấy cặp đó chia tỉ lệ cho từng ảnh. Ảnh nào đo
  // ở kích thước khác thì vùng khoanh trượt — trượt sang cây bên cạnh, đúng ca mà
  // tính năng này sinh ra để chặn.
  it('img_w/img_h lấy theo ảnh ĐƯỢC KHOANH đầu tiên, không phải ảnh đầu mảng', () => {
    const out = buildTreeRegions([null, R({ imgW: 640, imgH: 480 }), R()])!;
    expect(out.img_w).toBe('640');
    expect(out.img_h).toBe('480');
  });

  it('ảnh đo ở kích thước khác được nhân tỉ lệ về hệ quy chiếu', () => {
    // ảnh 0 đo ở 1000×800 (thành hệ quy chiếu); ảnh 1 đo ở 500×400 = đúng một nửa
    // ⟹ toạ độ ảnh 1 phải nhân đôi để cùng hệ.
    const out = buildTreeRegions([
      R({ bbox: [100, 80, 200, 160] }),
      R({ imgW: 500, imgH: 400, bbox: [50, 40, 100, 80] }),
    ])!;
    const arr = JSON.parse(out.regions);
    expect(arr[0].bbox).toEqual([100, 80, 200, 160]);
    expect(arr[1].bbox).toEqual([100, 80, 200, 160]);
  });

  it('điểm đa giác cũng được nhân tỉ lệ, không chỉ bbox', () => {
    const out = buildTreeRegions([
      R({ bbox: [0, 0, 10, 10] }),
      R({
        imgW: 500,
        imgH: 400,
        bbox: undefined,
        points: [[10, 20], [30, 40], [50, 60]],
      }),
    ])!;
    expect(JSON.parse(out.regions)[1].points).toEqual([[20, 40], [60, 80], [100, 120]]);
  });

  it('mọi ảnh cùng kích thước → toạ độ không đổi một pixel', () => {
    const pts: Array<[number, number]> = [[1, 2], [3, 4], [5, 6]];
    const out = buildTreeRegions([R({ points: pts, bbox: undefined }), R()])!;
    expect(JSON.parse(out.regions)[0].points).toEqual(pts);
  });
});
