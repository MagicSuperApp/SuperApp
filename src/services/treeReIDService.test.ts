import { appendGeoAndOrientation, toCaptureOrientations } from './treeReIDService';

/**
 * Bộ thu FormData tối giản — hàm đang kiểm chỉ gọi `append`.
 * Dùng stub thay vì FormData thật để ĐỌC ĐƯỢC tên khoá đã gửi; FormData của môi
 * trường test không cho duyệt lại nội dung.
 */
function collector() {
  const entries: Array<[string, string]> = [];
  const form = { append: (k: string, v: string) => entries.push([k, v]) } as unknown as FormData;
  return {
    form,
    keys: () => entries.map(e => e[0]),
    get: (k: string) => entries.find(e => e[0] === k)?.[1],
  };
}

describe('appendGeoAndOrientation — khoá tên trường TRÊN DÂY', () => {
  const poses = [{ heading: 12.5, pitch: -3, roll: 0 }, { heading: null, pitch: null, roll: null }];

  // ĐÂY LÀ BÀI KIỂM QUAN TRỌNG NHẤT TRONG TỆP.
  //
  // Máy chủ khai receiver dưới tên `view_poses` (`server.py:2382` enroll, `:2734`
  // verify_add; parser `_parse_view_poses` `:339`). Bản trước gửi `captures` — một
  // tên KHÔNG có trong toàn bộ `MassTreeIdentify/core/` (grep = 0 khớp). FastAPI bỏ
  // im lặng trường không khai, nên toàn bộ tư thế theo từng ảnh rơi mất mà không
  // một lỗi nào in ra, không một bài kiểm nào đỏ, không một màn hình nào trống.
  //
  // Sai tên ở đây KHÔNG làm gãy gì cả. Đó chính là lý do phải có bài kiểm này —
  // không còn cách nào khác để bắt.
  it('gửi tư thế từng ảnh dưới tên `view_poses`, KHÔNG phải `captures`', () => {
    const c = collector();
    appendGeoAndOrientation(c.form, { captures: poses });
    expect(c.keys()).toContain('view_poses');
    expect(c.keys()).not.toContain('captures');
    expect(JSON.parse(c.get('view_poses')!)).toEqual(poses);
  });

  it('mảng toàn null thì KHÔNG gửi — đừng làm nặng request cho một mảng rỗng nghĩa', () => {
    const c = collector();
    appendGeoAndOrientation(c.form, {
      captures: [{ heading: null, pitch: null, roll: null }],
    });
    expect(c.keys()).not.toContain('view_poses');
  });

  it('không có tư thế nào thì không gửi khoá đó', () => {
    const c = collector();
    appendGeoAndOrientation(c.form, { lat: 10, lon: 106 });
    expect(c.keys()).not.toContain('view_poses');
    expect(c.get('lat')).toBe('10');
    expect(c.get('lon')).toBe('106');
  });

  // Quy tắc OriLife chốt: thiếu số thì KHÔNG gửi khoá đó. Gửi chuỗi rỗng hay "null"
  // không làm máy chủ nổ, nhưng nhật ký lưu rác và về sau không phân biệt được
  // "không đo được" với "đo ra 0".
  it('trường số vắng mặt thì bỏ hẳn khoá, không gửi chuỗi rỗng', () => {
    const c = collector();
    appendGeoAndOrientation(c.form, { lat: 0 });
    expect(c.get('lat')).toBe('0');           // 0 là số thật, phải gửi
    expect(c.keys()).not.toContain('lon');
    expect(c.keys()).not.toContain('acc');
    expect(c.keys()).not.toContain('heading');
  });

  it('toCaptureOrientations giữ đúng số lượng, song song files[]', () => {
    const out = toCaptureOrientations([
      { heading: 1, pitch: 2, roll: 3 },
      { heading: null, pitch: null, roll: null },
      { heading: 359.9, pitch: -89, roll: 180 },
    ]);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ heading: 359.9, pitch: -89, roll: 180 });
  });
});
