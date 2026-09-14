/**
 * Hình học của màn đăng nhập mạng lưới.
 *
 * Bài này KHÔNG dựng ngữ cảnh OpenGL và không vẽ gì — nó không nói được màn có
 * đẹp không. Nó canh đúng một loại lỗi, loại mà mắt không bắt được và máy thì
 * chết ngay: BỘ ĐỆM SAI KÍCH THƯỚC.
 *
 * `Canh` trong `LoginNetworkScreen` ghi thẳng vào `viTriCham`/`viTriDuong` bằng
 * chỉ số tính tay (`i * 3`, `k * 6`). Nếu số ô cấp phát ở `doHoa.ts` lệch với số
 * ô mà vòng vẽ ghi vào, thì hoặc dữ liệu bị cắt cụt (mạng lưới thiếu một mảng),
 * hoặc ghi tràn ra ngoài `Float32Array` — và một chỉ số tràn trên `Float32Array`
 * KHÔNG ném lỗi, nó rơi vào hư không. Tức là hỏng mà không có lấy một dòng nhật ký.
 *
 * `three` chạy được trên Node vì hình học và vật liệu chỉ là mảng số; chỉ lúc
 * `WebGLRenderer` nạp chúng lên máy mới cần GPU, mà bài này không tới đó.
 */

import { dungDoHoa } from './doHoa';

const MAU = {
  loi: '#FFFFFF',
  quang: '#A8D4B0',
};

const SO = 100;

describe('bộ đệm', () => {
  it('đủ chỗ cho mọi chấm và MỌI CẶP chấm có thể nối', () => {
    const d = dungDoHoa(SO, MAU);
    expect(d.viTriCham).toHaveLength(SO * 3);
    expect(d.sangCham).toHaveLength(SO);
    // Trường hợp tệ nhất: mọi chấm đều đủ gần mọi chấm khác. `duyetCanh` khi ấy
    // gọi đúng n(n-1)/2 lần, và vòng vẽ ghi 6 số vị trí + 2 số sáng cho mỗi lần.
    const capToiDa = (SO * (SO - 1)) / 2;
    expect(d.viTriDuong).toHaveLength(capToiDa * 6);
    expect(d.sangDuong).toHaveLength(capToiDa * 2);
    d.huy();
  });

  it('ghi kín bộ đệm ở trường hợp tệ nhất mà không tràn', () => {
    const d = dungDoHoa(SO, MAU);
    const capToiDa = (SO * (SO - 1)) / 2;
    // Mô phỏng đúng phép tính chỉ số của vòng vẽ, ở lần ghi CUỐI CÙNG.
    const oCuoi = (capToiDa - 1) * 6 + 5;
    expect(oCuoi).toBe(d.viTriDuong.length - 1);
    const oSangCuoi = (capToiDa - 1) * 2 + 1;
    expect(oSangCuoi).toBe(d.sangDuong.length - 1);
    d.huy();
  });
});

describe('cập nhật mỗi khung hình', () => {
  it('đặt khung và đặt nút không ném, kể cả với khung 0×0', () => {
    const d = dungDoHoa(10, MAU);
    expect(() => {
      d.datDpr(1);
      d.datDpr(3);
      d.xongCham();
      d.xongDuong(0);
      d.xongDuong(45);
      d.ghiVet();
      d.ghiVet();
    }).not.toThrow();
    d.huy();
  });

  it('`huy` gọi được hai lần mà không ném', () => {
    const d = dungDoHoa(10, MAU);
    d.huy();
    expect(() => d.huy()).not.toThrow();
  });
});
