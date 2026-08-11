// config/runtimeGate.test.ts — kiểm logic cổng runtime (không cần backend thật).

import {
  deriveHealthUrl,
  registerCapability,
  probeAllCapabilities,
  isCapabilityLive,
  subscribeRuntimeGate,
  __resetRuntimeGateForTest,
} from './runtimeGate';

// AsyncStorage mock (probe ghi cache).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

describe('deriveHealthUrl', () => {
  // Neo vào ĐƯỜNG THẬT đã curl 2026-07-24, không phải quy ước đoán:
  //   api.aladin.work/api/v1/health → 200  (api.aladin.work/health → 404)
  it('GIỮ path của base rồi mới nối /health (không cắt về origin)', () => {
    expect(deriveHealthUrl('https://api.aladin.work/api/v1')).toBe(
      'https://api.aladin.work/api/v1/health',
    );
    expect(deriveHealthUrl('https://api.proofchat.me/api/v1')).toBe(
      'https://api.proofchat.me/api/v1/health',
    );
    expect(deriveHealthUrl('http://localhost:8080/api/v1')).toBe(
      'http://localhost:8080/api/v1/health',
    );
  });
  it('bỏ dấu / thừa cuối base', () => {
    expect(deriveHealthUrl('https://api.aladin.work/api/v1/')).toBe(
      'https://api.aladin.work/api/v1/health',
    );
  });
  it('nhận đường health riêng theo nền (Phoenix: /health/cardano)', () => {
    expect(deriveHealthUrl('https://api.phoenixkey.me/api/v1', '/health/cardano')).toBe(
      'https://api.phoenixkey.me/api/v1/health/cardano',
    );
    // không có dấu / đầu vẫn đúng
    expect(deriveHealthUrl('https://x.dev/api/v1', 'health')).toBe(
      'https://x.dev/api/v1/health',
    );
  });
  it('base rỗng/không hợp lệ → chuỗi rỗng', () => {
    expect(deriveHealthUrl(undefined)).toBe('');
    expect(deriveHealthUrl('')).toBe('');
    expect(deriveHealthUrl('not-a-url')).toBe('');
    expect(deriveHealthUrl('ftp://api.aladin.work/api/v1')).toBe('');
  });
});

describe('cổng runtime — probe health', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    __resetRuntimeGateForTest();
    globalThis.fetch = realFetch;
  });

  it('mặc định false (mock) khi chưa probe', () => {
    expect(isCapabilityLive('work')).toBe(false);
    expect(isCapabilityLive('proofchat')).toBe(false);
  });

  it('health 2xx → live=true', async () => {
    registerCapability('work', 'https://api.aladin.work/api/v1');
    globalThis.fetch = jest.fn(async () => ({ ok: true }) as Response);
    await probeAllCapabilities();
    expect(isCapabilityLive('work')).toBe(true);
  });

  it('health 502/404 → giữ mock (false)', async () => {
    registerCapability('work', 'https://api.aladin.work/api/v1');
    globalThis.fetch = jest.fn(async () => ({ ok: false }) as Response);
    await probeAllCapabilities();
    expect(isCapabilityLive('work')).toBe(false);
  });

  it('fetch ném (mạng lỗi) → mock (false), không crash', async () => {
    registerCapability('proofchat', 'https://api.proofchat.me/api/v1');
    globalThis.fetch = jest.fn(async () => {
      throw new Error('network');
    });
    await probeAllCapabilities();
    expect(isCapabilityLive('proofchat')).toBe(false);
  });

  it('chưa đăng ký host → luôn false', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: true }) as Response);
    await probeAllCapabilities();
    expect(isCapabilityLive('work')).toBe(false);
  });

  it('notify subscriber khi cờ lật', async () => {
    registerCapability('work', 'https://api.aladin.work/api/v1');
    const listener = jest.fn();
    const unsub = subscribeRuntimeGate(listener);
    globalThis.fetch = jest.fn(async () => ({ ok: true }) as Response);
    await probeAllCapabilities();
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});
