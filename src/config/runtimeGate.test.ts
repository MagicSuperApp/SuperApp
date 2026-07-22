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
  it('lấy origin + /health, bỏ path phía sau', () => {
    expect(deriveHealthUrl('https://api.aladin.work/api/v1')).toBe(
      'https://api.aladin.work/health',
    );
    expect(deriveHealthUrl('https://api.proofchat.me/api/v1')).toBe(
      'https://api.proofchat.me/health',
    );
    expect(deriveHealthUrl('http://localhost:8080/api/v1')).toBe(
      'http://localhost:8080/health',
    );
  });
  it('base rỗng/không hợp lệ → chuỗi rỗng', () => {
    expect(deriveHealthUrl(undefined)).toBe('');
    expect(deriveHealthUrl('')).toBe('');
    expect(deriveHealthUrl('not-a-url')).toBe('');
  });
});

describe('cổng runtime — probe health', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    __resetRuntimeGateForTest();
    global.fetch = realFetch;
  });

  it('mặc định false (mock) khi chưa probe', () => {
    expect(isCapabilityLive('work')).toBe(false);
    expect(isCapabilityLive('proofchat')).toBe(false);
  });

  it('health 2xx → live=true', async () => {
    registerCapability('work', 'https://api.aladin.work/api/v1');
    global.fetch = jest.fn(async () => ({ ok: true }) as Response);
    await probeAllCapabilities();
    expect(isCapabilityLive('work')).toBe(true);
  });

  it('health 502/404 → giữ mock (false)', async () => {
    registerCapability('work', 'https://api.aladin.work/api/v1');
    global.fetch = jest.fn(async () => ({ ok: false }) as Response);
    await probeAllCapabilities();
    expect(isCapabilityLive('work')).toBe(false);
  });

  it('fetch ném (mạng lỗi) → mock (false), không crash', async () => {
    registerCapability('proofchat', 'https://api.proofchat.me/api/v1');
    global.fetch = jest.fn(async () => {
      throw new Error('network');
    });
    await probeAllCapabilities();
    expect(isCapabilityLive('proofchat')).toBe(false);
  });

  it('chưa đăng ký host → luôn false', async () => {
    global.fetch = jest.fn(async () => ({ ok: true }) as Response);
    await probeAllCapabilities();
    expect(isCapabilityLive('work')).toBe(false);
  });

  it('notify subscriber khi cờ lật', async () => {
    registerCapability('work', 'https://api.aladin.work/api/v1');
    const listener = jest.fn();
    const unsub = subscribeRuntimeGate(listener);
    global.fetch = jest.fn(async () => ({ ok: true }) as Response);
    await probeAllCapabilities();
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});
