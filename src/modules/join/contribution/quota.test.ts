// modules/join/contribution/quota.test.ts
//
// Kiểm chứng hợp đồng thanh trượt — `Join/Join-Integration.md` §6.1a, §6.3, §6.7 quy tắc 5.
// Mỗi test neo vào một câu cụ thể của spec; sửa test mà không sửa spec là sai chỗ.

import {
  BYTES_PER_GB,
  DEFAULT_ENABLED,
  DEFAULT_POSITION_IS_MAX_SHARE,
  RESERVE_FLOOR_BYTES,
  clampShare,
  computeReserveBytes,
  decideRelease,
  planQuota,
  toHwDiskGb,
} from './quota';

const GB = BYTES_PER_GB;

describe('computeReserveBytes — dự trữ = max(10% dung lượng máy, 5 GB)', () => {
  it('máy lớn: vế 10% thắng', () => {
    expect(computeReserveBytes(128 * GB)).toBe(12.8 * GB);
  });

  it('máy nhỏ: vế sàn 5 GB thắng — 10% của 32 GB chỉ là 3,2 GB', () => {
    expect(computeReserveBytes(32 * GB)).toBe(RESERVE_FLOOR_BYTES);
  });
});

describe('planQuota — trần và vị trí đặt sẵn', () => {
  it('ví dụ của §6.1a: máy còn 200 GB ⇒ thanh trượt đặt sẵn ~180 GB', () => {
    const plan = planQuota({ freeBytes: 200 * GB, totalBytes: 200 * GB });
    expect(plan.maxShareBytes).toBe(180 * GB);
    expect(plan.defaultPositionBytes).toBe(180 * GB);
    expect(plan.showSlider).toBe(true);
  });

  it('vị trí đặt sẵn LUÔN bằng trần — anh Aladin chốt "để sẵn mức tối đa"', () => {
    const plan = planQuota({ freeBytes: 90 * GB, totalBytes: 256 * GB });
    expect(DEFAULT_POSITION_IS_MAX_SHARE).toBe(true);
    expect(plan.defaultPositionBytes).toBe(plan.maxShareBytes);
  });

  it('SỐ LƯỢNG đặt sẵn, SỰ ĐỒNG Ý thì không — mở tab rồi thoát là không byte nào vào máy', () => {
    // Phép thử một câu của §6.1a. Hai hằng số này phải luôn ngược nhau:
    // vị trí thanh trượt đặt sẵn hết cỡ (hợp lệ) — nhưng tính năng KHÔNG tự bật (cấm).
    expect(DEFAULT_POSITION_IS_MAX_SHARE).toBe(true);
    expect(DEFAULT_ENABLED).toBe(false);
  });

  it('§6.7 quy tắc 5: chỗ trống dưới ngưỡng dự trữ ⇒ trần 0, KHÔNG vẽ thanh trượt', () => {
    const plan = planQuota({ freeBytes: 3 * GB, totalBytes: 128 * GB });
    expect(plan.maxShareBytes).toBe(0);
    expect(plan.showSlider).toBe(false);
  });

  it('chỗ trống đúng bằng dự trữ ⇒ vẫn là 0, không âm', () => {
    const plan = planQuota({ freeBytes: 12.8 * GB, totalBytes: 128 * GB });
    expect(plan.maxShareBytes).toBe(0);
    expect(plan.showSlider).toBe(false);
  });
});

describe('planQuota — chưa đo được thì KHÔNG đoán (LDC §6 quy tắc 4)', () => {
  it.each([
    ['thiếu chỗ trống', { freeBytes: null, totalBytes: 128 * GB }],
    ['thiếu tổng dung lượng', { freeBytes: 50 * GB, totalBytes: null }],
    ['NaN', { freeBytes: Number.NaN, totalBytes: 128 * GB }],
    ['âm', { freeBytes: -1, totalBytes: 128 * GB }],
    ['vô cực', { freeBytes: Number.POSITIVE_INFINITY, totalBytes: 128 * GB }],
  ])('%s ⇒ measured=false, không thanh trượt, trần 0', (_label, reading) => {
    const plan = planQuota(reading);
    expect(plan.measured).toBe(false);
    expect(plan.showSlider).toBe(false);
    expect(plan.maxShareBytes).toBe(0);
    expect(plan.reserveBytes).toBeNull();
  });
});

describe('clampShare — trần nằm trong mã client, máy chủ không nâng được (§6.3)', () => {
  const plan = planQuota({ freeBytes: 200 * GB, totalBytes: 200 * GB }); // trần 180 GB

  it('số hữu hạn vượt trần bị kẹp về trần — §6.4 "con số hiển thị phải là con số đã hạ"', () => {
    expect(clampShare(500 * GB, plan)).toBe(180 * GB);
  });

  it('Infinity ⇒ 0, KHÔNG kẹp về trần — rác không được đổi thành quyền lấy mức tối đa', () => {
    // Nếu kẹp, "máy chủ gửi xuống Infinity" thành đường ép máy nhận hết cỡ — đúng
    // thứ §6.3 sinh ra để chặn. Fail-closed: không hiểu con số thì không lấy gì.
    expect(clampShare(Number.POSITIVE_INFINITY, plan)).toBe(0);
  });

  it('mức âm / 0 / rác ⇒ 0', () => {
    expect(clampShare(-5, plan)).toBe(0);
    expect(clampShare(0, plan)).toBe(0);
    expect(clampShare(Number.NaN, plan)).toBe(0);
  });

  it('mức trong khoảng giữ nguyên', () => {
    expect(clampShare(20 * GB, plan)).toBe(20 * GB);
  });

  it('chưa đo được ⇒ 0 dù bên gọi xin bao nhiêu (LDC-2a điều 9: máy thứ hai hỏi lại)', () => {
    const unmeasured = planQuota({ freeBytes: null, totalBytes: null });
    expect(clampShare(20 * GB, unmeasured)).toBe(0);
  });
});

describe('toHwDiskGb — khai lên daemon qua trường sẵn có (§4)', () => {
  it('1 GB ⇒ 1', () => {
    expect(toHwDiskGb(1 * GB)).toBe(1);
  });

  it('làm tròn XUỐNG — khai thừa là hứa nhiều hơn thứ máy dành ra', () => {
    expect(toHwDiskGb(1.9 * GB)).toBe(1);
    expect(toHwDiskGb(0.9 * GB)).toBe(0);
  });

  it('0 / rác ⇒ 0', () => {
    expect(toHwDiskGb(0)).toBe(0);
    expect(toHwDiskGb(Number.NaN)).toBe(0);
  });
});

describe('decideRelease — trả chỗ TRƯỚC khi người dùng phải đi xin (LDC-2a điều 8)', () => {
  it('chỗ trống tụt dưới dự trữ ⇒ nhả hết, và PHẢI nói ra', () => {
    const decision = decideRelease({ freeBytes: 2 * GB, totalBytes: 128 * GB }, 412 * 1_000_000);
    expect(decision.releaseAll).toBe(true);
    expect(decision.releasedBytes).toBe(412 * 1_000_000);
    expect(decision.mustAnnounce).toBe(true);
  });

  it('còn đủ chỗ ⇒ không nhả', () => {
    expect(decideRelease({ freeBytes: 50 * GB, totalBytes: 128 * GB }, 1 * GB).releaseAll).toBe(false);
  });

  it('chưa đo được đĩa ⇒ KHÔNG nhả — nhả vì một phép đo hỏng là tự xoá dữ liệu vô cớ', () => {
    expect(decideRelease({ freeBytes: null, totalBytes: null }, 1 * GB).releaseAll).toBe(false);
    expect(decideRelease({ freeBytes: Number.NaN, totalBytes: 128 * GB }, 1 * GB).releaseAll).toBe(false);
  });

  it('không giữ gì thì không có gì để nhả, và không báo suông', () => {
    const decision = decideRelease({ freeBytes: 1 * GB, totalBytes: 128 * GB }, 0);
    expect(decision.releaseAll).toBe(false);
    expect(decision.mustAnnounce).toBe(false);
  });
});
