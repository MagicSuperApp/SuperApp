import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LAST_RUN_KEY, MAX_PER_RUN, MIN_RUN_GAP_MS, SENT_KEY, SENT_TTL_MS,
  pruneSent, rank, runAlertCheck,
} from './alertDispatcher';
import type { Alert } from './alertRules';

// Đường ra thật là notifee (mô-đun native). Test thay bằng bộ đếm để đo ĐÚNG cái
// đáng đo: ai được báo, báo mấy lần, và sổ "đã báo" ghi lúc nào.
const mockNotify = jest.fn(async (_input: unknown) => true);
jest.mock('./localNotify', () => ({
  notify: (input: unknown) => mockNotify(input),
  available: () => true,
}));

const NOW = Date.parse('2026-08-18T08:00:00+07:00');

/** Trời đang dông → `weatherAlerts` chắc chắn ra một cảnh báo. */
const stormy = { now: { code: 95, windKph: 5 }, days: [], hours: [], at: { lat: 0, lon: 0 } } as any;
const calm = { now: { code: 0, windKph: 5 }, days: [], hours: [], at: { lat: 0, lon: 0 } } as any;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockNotify.mockClear();
  mockNotify.mockResolvedValue(true);
});

describe('pruneSent — sổ "đã báo" phải quên, không thì chỉ có lớn lên', () => {
  it('giữ mục còn hạn, bỏ mục quá hạn', () => {
    const out = pruneSent({ a: NOW - 1000, b: NOW - SENT_TTL_MS - 1 }, NOW);
    expect(out).toEqual({ a: NOW - 1000 });
  });
  it('bỏ giá trị rác thay vì mang theo mãi', () => {
    expect(pruneSent({ a: NaN as any, b: 'hôm qua' as any }, NOW)).toEqual({});
  });
  it('không sửa bảng gốc', () => {
    const src = { a: NOW - SENT_TTL_MS - 1 };
    pruneSent(src, NOW);
    expect(Object.keys(src)).toEqual(['a']);
  });
});

describe('rank — thời tiết đứng trước tin, và cắt bớt', () => {
  const a = (kind: Alert['kind'], id: string): Alert =>
    ({ id, kind, titleKey: 't', vars: {}, body: '' });

  it('dông đứng trước tin thị trường', () => {
    const out = rank([a('trend', 'n1'), a('weather', 'w1')]);
    expect(out[0].kind).toBe('weather');
  });

  it('cắt còn tối đa MAX_PER_RUN — năm thông báo cùng lúc thì cái quan trọng bị khuất', () => {
    const many = Array.from({ length: 8 }, (_, i) => a('trend', `n${i}`));
    expect(rank(many)).toHaveLength(MAX_PER_RUN);
  });

  it('không sửa mảng gốc', () => {
    const src = [a('trend', 'n1'), a('weather', 'w1')];
    rank(src);
    expect(src[0].kind).toBe('trend');
  });
});

describe('runAlertCheck', () => {
  it('trời dông → gửi một thông báo và GHI sổ', async () => {
    const r = await runAlertCheck({ now: NOW, weather: stormy, news: [] });
    expect(r.skipped).toBeNull();
    expect(r.sent).toHaveLength(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    // Thời tiết dữ đi kênh ưu tiên cao; tin tức thì không.
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ urgent: true });

    const saved = JSON.parse((await AsyncStorage.getItem(SENT_KEY)) || '{}');
    expect(Object.keys(saved)).toHaveLength(1);
  });

  it('tiêu đề được DỊCH lúc gửi, không phải khoá thô', async () => {
    await runAlertCheck({ now: NOW, weather: stormy, news: [] });
    const arg = mockNotify.mock.calls[0][0] as any;
    expect(arg.title).not.toMatch(/^trace\./);
    expect(arg.body).not.toMatch(/^trace\./);
    expect(arg.body.length).toBeGreaterThan(0);
  });

  it('gọi lại ngay → chặn bởi nhịp tối thiểu, KHÔNG gửi lại', async () => {
    await runAlertCheck({ now: NOW, weather: stormy, news: [] });
    mockNotify.mockClear();
    const r = await runAlertCheck({ now: NOW + 60_000, weather: stormy, news: [] });
    expect(r.skipped).toBe('too_soon');
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('qua nhịp tối thiểu nhưng CÙNG cơn dông → vẫn im (chốt không-lặp)', async () => {
    await runAlertCheck({ now: NOW, weather: stormy, news: [] });
    mockNotify.mockClear();
    const r = await runAlertCheck({ now: NOW + MIN_RUN_GAP_MS + 1, weather: stormy, news: [] });
    expect(r.skipped).toBe('no_alerts');
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('`force` bỏ qua nhịp tối thiểu — cho nút người dùng tự bấm làm mới', async () => {
    await AsyncStorage.setItem(LAST_RUN_KEY, JSON.stringify(NOW));
    const r = await runAlertCheck({ now: NOW + 1000, weather: stormy, news: [], force: true });
    expect(r.skipped).toBeNull();
  });

  it('trời yên, không tin → không gửi gì', async () => {
    const r = await runAlertCheck({ now: NOW, weather: calm, news: [] });
    expect(r.skipped).toBe('no_alerts');
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('KHÔNG hiện được (thiếu quyền / chưa dựng native) thì KHÔNG ghi sổ', async () => {
    // Đây là chỗ dễ sai nhất: ghi sổ trước khi gửi thì một lượt gửi hỏng vẫn tính
    // là "đã báo", và cơn dông im lặng suốt 12 giờ.
    mockNotify.mockResolvedValue(false);
    const r = await runAlertCheck({ now: NOW, weather: stormy, news: [] });
    expect(r.skipped).toBe('notify_unavailable');
    expect(await AsyncStorage.getItem(SENT_KEY)).toBeNull();
  });

  it('sổ hỏng (JSON rác) → coi như chưa báo gì, không nổ', async () => {
    await AsyncStorage.setItem(SENT_KEY, 'không-phải-json');
    const r = await runAlertCheck({ now: NOW, weather: stormy, news: [] });
    expect(r.sent).toHaveLength(1);
  });

  it('thời tiết null vẫn chạy được (chỉ còn nhánh tin)', async () => {
    const r = await runAlertCheck({ now: NOW, weather: null, news: [] });
    expect(r.skipped).toBe('no_alerts');
  });
});
