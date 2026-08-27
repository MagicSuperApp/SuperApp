/**
 * Bài kiểm cho `provenanceView`.
 *
 * Thân mẫu dưới đây CHÉP TỪ lượt gọi thật ngày 2026-08-19:
 *   GET https://api.orilife.io/api/tree_by_code/ORI-w7er6uf-Z9MMB2PS
 * Giữ nguyên hình dạng — kể cả việc nó KHÔNG có `gps_precision` và KHÔNG có
 * trường nào về chủ vườn. Đó chính là hai ca mà màn hình phải nói ra chứ không
 * được lấp liếm, nên chúng phải nằm trong thân mẫu chứ không phải trong một ca
 * "giả định" bên lề.
 */

import {
  anchorView, coverageLine, galleryUrls, gpsPoint, milestones, model3dUrl,
  ownerLine, shortHash, trustBadge,
} from './provenanceView';
import type { Provenance } from '../../services/provenanceService';

const REAL: Provenance = {
  code: 'ORI-w7er6uf-Z9MMB2PS',
  tree_id: 'e1d39d35-4900-42d6-b194-e7ae89a0832f',
  name: 'Cây 1',
  gps: [20.989, 105.944],
  created_at: '2026-08-19T02:35:54Z',
  images: [
    { cid: 'ln1q_be2474c83e734189_file' },
    { cid: 'ln1q_1c5d971864734cb3_file' },
  ],
  model3d: {
    format: 'ply',
    n_points: 2048,
    n_cams: 2,
    cid: 'ln1q_7da38f774a97ca3a_file',
    coverage: {
      covered_deg: 60, max_gap_deg: 180, full: false,
      advice: 'Mới chụp ~60° (một phía cây).',
    },
  },
  n_views: 2,
  anchor: {
    status: 'confirmed',
    tx_hash: '9d7e54a61223d9ec2f36a2178f9344dd23d180956be623ce0bfa98ae22980b09',
    explorer_url:
      'https://preview.cexplorer.io/tx/9d7e54a61223d9ec2f36a2178f9344dd23d180956be623ce0bfa98ae22980b09',
    network: 'preview',
    submitted_at: '2026-08-19T02:36:34Z',
  },
  lampnet_view: 'https://lampnet.cloud',
};

describe('galleryUrls', () => {
  it('ghép cid với lampnet_view đúng như URL người dùng đưa', () => {
    expect(galleryUrls(REAL)).toEqual([
      'https://lampnet.cloud/ln1q_be2474c83e734189_file',
      'https://lampnet.cloud/ln1q_1c5d971864734cb3_file',
    ]);
  });

  it('bỏ ảnh thiếu cid thay vì dựng URL cụt', () => {
    const p = { ...REAL, images: [{ cid: 'a' }, {}, { cid: '' }] };
    expect(galleryUrls(p)).toEqual(['https://lampnet.cloud/a']);
  });

  it('không có lampnet_view thì không có ảnh nào — chứ không phải URL tương đối', () => {
    const p = { ...REAL, lampnet_view: undefined };
    expect(galleryUrls(p)).toEqual([]);
  });
});

describe('model3dUrl', () => {
  it('trả đúng URL mà người dùng đã mở được', () => {
    expect(model3dUrl(REAL)).toBe('https://lampnet.cloud/ln1q_7da38f774a97ca3a_file');
  });

  it('ĐỊNH DẠNG LẠ ⇒ null, không để bộ xem tải về rồi hỏng lặng lẽ', () => {
    expect(model3dUrl({ ...REAL, model3d: { ...(REAL.model3d as any), format: 'glb' } })).toBeNull();
  });

  it('không có model3d ⇒ null', () => {
    expect(model3dUrl({ ...REAL, model3d: null })).toBeNull();
  });
});

describe('gpsPoint', () => {
  it('đọc [lat, lon] theo đúng thứ tự máy chủ gửi', () => {
    expect(gpsPoint(REAL)).toEqual({ lat: 20.989, lon: 105.944 });
  });

  it('toạ độ ngoài dải Trái Đất ⇒ null, không vẽ lên bản đồ', () => {
    expect(gpsPoint({ ...REAL, gps: [200, 10] as any })).toBeNull();
  });

  it('gps null (chủ ẩn vị trí) ⇒ null', () => {
    expect(gpsPoint({ ...REAL, gps: null })).toBeNull();
  });
});

describe('ownerLine', () => {
  it('thân THẬT không có chủ vườn ⇒ null, để màn nói thẳng là chưa công khai', () => {
    expect(ownerLine(REAL)).toBeNull();
  });

  it('ngày máy chủ mở thêm owner_name thì hiện ra ngay, không cần bản app mới', () => {
    expect(ownerLine({ ...REAL, owner_name: 'Bác Tư' } as any)).toBe('Bác Tư');
  });

  it('đọc được cả dạng lồng { farm: { name } }', () => {
    expect(ownerLine({ ...REAL, farm: { name: 'Vườn Ba Sương' } } as any)).toBe('Vườn Ba Sương');
  });
});

describe('anchorView', () => {
  it('đọc đủ trạng thái, mạng, băm rút gọn và explorer', () => {
    const a = anchorView(REAL)!;
    expect(a.status).toBe('confirmed');
    expect(a.network).toBe('preview');
    expect(a.txShort).toBe('9d7e54a6…22980b09');
    expect(a.explorer).toContain('https://preview.cexplorer.io/tx/');
  });

  it('LỌC explorer_url không phải http(s) — một trường JSON không được mở deep-link lạ', () => {
    const p = { ...REAL, anchor: { ...(REAL.anchor as any), explorer_url: 'javascript:alert(1)' } };
    expect(anchorView(p)!.explorer).toBeNull();
  });

  it('không có anchor ⇒ null', () => {
    expect(anchorView({ ...REAL, anchor: null })).toBeNull();
  });
});

describe('shortHash', () => {
  it('chuỗi ngắn giữ nguyên, không thêm dấu ba chấm vô nghĩa', () => {
    expect(shortHash('abc')).toBe('abc');
  });
  it('chuỗi rỗng ⇒ null', () => {
    expect(shortHash('   ')).toBeNull();
  });
});

describe('coverageLine', () => {
  it('ưu tiên NGUYÊN VĂN câu của máy chủ', () => {
    expect(coverageLine(REAL)).toBe(
      'Mới chụp ~60° (một phía cây).',
    );
  });

  it('máy chủ không khuyên gì thì mới tự ghép số độ phủ — và câu ghép ĐI QUA lớp dịch', () => {
    // Câu này trước đây là một chuỗi mẫu nối tay, nên nó KHÔNG tra được từ điển:
    // người chọn tiếng khác vẫn đọc tiếng Việt, im lặng, không lỗi nào bật. Nay nó
    // qua `tf`, và bài kiểm chạy dưới ngôn ngữ mặc định `en` nên thấy bản tiếng
    // Anh — chính đó là bằng chứng chỗ rò đã bịt. Đổi lại thành tiếng Việt là
    // dựng lại chỗ rò rồi khoá nó bằng một bài kiểm xanh.
    const p = { ...REAL, model3d: { format: 'ply', coverage: { covered_deg: 130 } } };
    expect(coverageLine(p)).toBe('About 130° around the tree has been photographed.');
  });

  it('không có coverage ⇒ null, không bịa một câu trấn an', () => {
    expect(coverageLine({ ...REAL, model3d: { format: 'ply' } })).toBeNull();
  });
});

describe('milestones', () => {
  it('dựng hai mốc từ hồ sơ, xếp CŨ TRƯỚC — đây là tiểu sử, không phải bảng tin', () => {
    const m = milestones(REAL);
    expect(m.map((x) => x.key)).toEqual(['enroll', 'anchor']);
    expect(m[0].note).toBe('Chụp 2 góc làm dấu nhận dạng');
    expect(m[1].title).toBe('Đã neo lên chuỗi khối');
  });

  it('chưa neo xong thì đổi chữ, không nói "đã neo"', () => {
    const p = { ...REAL, anchor: { status: 'pending', submitted_at: '2026-08-19T02:36:34Z' } };
    expect(milestones(p)[1].title).toBe('Gửi neo lên chuỗi khối');
  });

  it('không có anchor thì chỉ còn mốc đăng ký', () => {
    expect(milestones({ ...REAL, anchor: null }).map((x) => x.key)).toEqual(['enroll']);
  });

  it('hồ sơ rỗng ⇒ không mốc nào, không dựng mốc giả cho đẹp', () => {
    expect(milestones({})).toEqual([]);
  });
});

describe('trustBadge', () => {
  it('ba nhánh, và "chưa neo" khác hẳn "chưa biết"', () => {
    expect(trustBadge(true).tone).toBe('ok');
    expect(trustBadge(false).tone).toBe('warn');
    expect(trustBadge(null).tone).toBe('dim');
    expect(trustBadge(null).text).toMatch(/chưa cho biết/);
  });
});
