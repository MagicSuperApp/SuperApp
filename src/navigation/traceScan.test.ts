// navigation/traceScan.test.ts
//
// SG9 §3 — kiểm chứng bộ phân giải mã QR truy xuất: chỉ nhận deep-link nội bộ
// magiclamp://, whitelist đích, tách params; mã lạ → null.

import { parseTraceCode } from './traceScan';

describe('parseTraceCode', () => {
  it('deep-link module có moduleId + route + params', () => {
    expect(parseTraceCode('magiclamp://trace/TreeDetail?treeId=abc123')).toEqual({
      route: 'TreeDetail',
      params: { treeId: 'abc123' },
    });
  });

  it('deep-link route trực tiếp (không moduleId)', () => {
    expect(parseTraceCode('magiclamp://FarmDetail?farmId=f1')).toEqual({
      route: 'FarmDetail',
      params: { farmId: 'f1' },
    });
  });

  it('không params → params bỏ trống', () => {
    expect(parseTraceCode('magiclamp://trace/Dashboard')).toEqual({ route: 'Dashboard' });
  });

  it('nhiều params + giải mã %', () => {
    expect(parseTraceCode('magiclamp://AnimalDetail?id=a1&name=B%C3%B2')).toEqual({
      route: 'AnimalDetail',
      params: { id: 'a1', name: 'Bò' },
    });
  });

  it('route NGOÀI whitelist → null (không điều hướng bừa)', () => {
    expect(parseTraceCode('magiclamp://trace/SeedExport')).toBeNull();
    expect(parseTraceCode('magiclamp://Login')).toBeNull();
  });

  it('mã KHÔNG phải magiclamp:// → null', () => {
    expect(parseTraceCode('https://example.com/x')).toBeNull();
    expect(parseTraceCode('just some text')).toBeNull();
    expect(parseTraceCode('')).toBeNull();
  });

  it('bỏ khoảng trắng thừa, không phân biệt hoa/thường ở scheme', () => {
    expect(parseTraceCode('  MAGICLAMP://trace/TreeDetail  ')).toEqual({ route: 'TreeDetail' });
  });
});
