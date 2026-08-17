// Cổng chặn tái phát: bộ đổi hình AladinWork KHÔNG được mang DID người dùng ra
// khỏi máy, và KHÔNG được bịa trường mà dây không cấp.

import { toUiJob, toUiWorker } from './adapters';
import type { WorkJob, WorkAccount } from '../services/types';

const baseJob: WorkJob = {
  id: 'job-1',
  ownerDid: 'did:phoenix:z6Mk-BI-MAT-KHONG-DUOC-RA-NGOAI',
  templateKey: 'video',
  title: 'Quay một đoạn giới thiệu vườn',
  status: 'open',
};

const baseAcc: WorkAccount = {
  did: 'did:phoenix:z6Mk-GENIE-BI-MAT',
  name: 'Genie A',
} as WorkAccount;

describe('adapters — không rò DID, không bịa dữ liệu', () => {
  it('không nhét DID vào bất kỳ đường dẫn nào khi dây không có ảnh', () => {
    const ui = toUiJob(baseJob);
    expect(ui.postedBy.avatar).toBe('');
    // Soi toàn bộ chuỗi kết quả, không chỉ trường avatar — DID không được
    // xuất hiện ở BẤT KỲ đâu có dạng URL.
    const asText = JSON.stringify(ui);
    expect(asText).not.toContain('pravatar');
    expect(asText).not.toContain(baseJob.ownerDid);
    expect(asText).not.toContain(encodeURIComponent(baseJob.ownerDid));
  });

  it('cũng vậy với hồ sơ Genie', () => {
    const ui = toUiWorker(baseAcc);
    expect(ui.avatar).toBe('');
    expect(JSON.stringify(ui)).not.toContain('pravatar');
  });

  it('giữ nguyên ảnh THẬT khi dây có trả', () => {
    const ui = toUiJob({ ...baseJob, ownerAvatar: 'https://cdn.aladin.work/a/1.jpg' });
    expect(ui.postedBy.avatar).toBe('https://cdn.aladin.work/a/1.jpg');
  });

  it('bỏ đường dẫn không phải http(s) — không để lọt `javascript:` hay đường dẫn máy', () => {
    const ui = toUiJob({ ...baseJob, ownerAvatar: 'file:///etc/passwd' });
    expect(ui.postedBy.avatar).toBe('');
  });

  it('không bịa điểm đánh giá, thời điểm đăng, số người ứng tuyển', () => {
    const ui = toUiJob(baseJob);
    expect(ui.postedBy.rating).toBe(0); // dây AladinWork không cấp `rating`
    expect(ui.postedAt).toBe(''); // `WorkJob` không có trường thời gian nào
    expect(ui.applicantCount).toBe(0); // dây không cấp số ứng tuyển
  });
});
