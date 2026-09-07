/**
 * Cổng nguồn cho đường ĐỔI TÊN VƯỜN.
 *
 * Đường này từng chỉ ghi SQLite trên máy: tên mới hiện đúng, không lỗi, rồi mất
 * khi gỡ app hoặc đổi máy — và người dùng không có cách nào nhìn ra. Không phép
 * kiểm nào bắt được, vì màn hình vẫn đúng và mọi bài kiểm vẫn xanh.
 *
 * ── Bài kiểm này đo GÌ, và KHÔNG đo gì ──────────────────────────────────────
 * Đo MÃ NGUỒN. Nó bắt được ca "ai đó gỡ lời gọi máy chủ đi", không bắt được ca
 * "lời gọi còn đó nhưng chạy sai". Dựng cả `FarmDetailScreen` (hơn 3.000 dòng,
 * kéo theo bản đồ + máy ảnh + native) trong jest là việc khác hẳn về giá.
 *
 * Phần HÀNH VI thật của lời gọi nằm ở `services/farmServiceUpdate.test.ts` —
 * chỗ đó chạy hàm thật và đọc thân yêu cầu thật. Hai bài bù nhau, không thay
 * nhau: bài này canh CÓ GỌI, bài kia canh GỌI ĐÚNG.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'FarmDetailScreen.tsx'), 'utf8');

/**
 * Vị trí một câu lệnh trong nguồn — khớp kèm dấu chấm phẩy/ngoặc để KHÔNG dính
 * chính câu chú thích nói về nó. Đã cắn một lần ở màn khác: chú thích giải thích
 * nằm TRÊN mã, nên phép khớp trần bắt trúng chú thích rồi kết luận sai thứ tự.
 */
function at(needle: string): number {
  const i = SRC.indexOf(needle);
  expect(i).toBeGreaterThan(-1);
  return i;
}

describe('đổi tên vườn phải ĐI TỚI MÁY CHỦ, không dừng ở kho máy', () => {
  it('màn này có nhập và có gọi `updateFarm`', () => {
    expect(SRC).toContain("updateFarm } from '../../../services/farmService'");
    expect(SRC).toContain('await updateFarm(ORILIFE_BASE, farm_id, { name: trimmed })');
  });

  it('gọi máy chủ TRƯỚC khi ghi kho máy', () => {
    const handler = SRC.indexOf('const handleUpdateFarmName');
    expect(handler).toBeGreaterThan(-1);
    const server = SRC.indexOf('await updateFarm(ORILIFE_BASE, farm_id', handler);
    const local = SRC.indexOf('dispatch(saveFarm({', handler);
    expect(server).toBeGreaterThan(handler);
    expect(local).toBeGreaterThan(server);
  });

  it('máy chủ trượt thì THOÁT, không rơi xuống ghi kho máy', () => {
    // `return` sau nhánh báo lỗi là thứ giữ cho tên cũ ở nguyên trên màn. Gỡ nó
    // là quay về đúng cái vỏ im lặng: báo xong mà không gì rời khỏi máy.
    const handler = SRC.indexOf('const handleUpdateFarmName');
    const guard = SRC.indexOf('if (!saved.ok)', handler);
    const local = SRC.indexOf('dispatch(saveFarm({', handler);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(local);
    const block = SRC.slice(guard, local);
    expect(block).toContain('return;');
  });

  it('KHÔNG gửi ranh kèm lúc đổi tên — hợp đồng máy chủ xoá nguồn-gốc ranh', () => {
    const handler = SRC.indexOf('const handleUpdateFarmName');
    const end = SRC.indexOf('\n  };', SRC.indexOf('setFarm((prev: any)', handler));
    const body = SRC.slice(handler, end);
    for (const cam of ['boundary:', 'boundaryMethod', 'boundaryAccM']) {
      expect(body).not.toContain(cam);
    }
  });
});
