// config/runtimeGate.ts
//
// CẤU HÌNH RUNTIME — tự bật module khi backend sống, KHÔNG cần build lại.
//
// VẤN ĐỀ: các cờ *_BACKEND_ENABLED là BUILD-TIME (@env, nướng vào bundle lúc
// build). Backend đang 502/404 sống lại KHÔNG tự bật module — phải build lại app.
// Module cập nhật liên tục → build lại mỗi lần = việc vô nghĩa (anh Aladin chốt
// 2026-07-22: phải tự động).
//
// GIẢI: probe endpoint mỗi capability lúc khởi động + mỗi lần app quay lại
// foreground. Capability "live" khi health trả 2xx. Backend 502→200 ở lần probe
// kế tiếp → tự bật, 0 build. Backend sập lại → probe fail → về mock.
//
// AN TOÀN (mặc định đóng): trạng thái mặc định = false (mock) tới khi probe
// THÀNH CÔNG. fetch lỗi/timeout/mạng rớt → false (không đoán live). Kết quả cache
// AsyncStorage để lần chạy đầu (trước khi probe xong) không nhấp nháy mock↔live.
//
// KHÔNG áp cho mint (orgMint) và ký-ví (phoenixWallet): các luồng này có
// tiền-điều-kiện NGOÀI host (native signer Ed25519 còn stub, cap/authority chờ
// LAMP) → giữ cờ THỦ CÔNG, không health-auto (health 2xx không đủ để ký an toàn).
// Chỉ module ĐỌC/an-toàn (work, proofchat) mới health-auto.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Các capability được cổng runtime điều khiển (đọc-được, an toàn health-auto). */
export type GateCapability = 'work' | 'proofchat';

const ALL_CAPS: GateCapability[] = ['work', 'proofchat'];

const CACHE_KEY = '@runtimeGate/live';
const PROBE_TIMEOUT_MS = 6000;

/** URL health đã đăng ký cho mỗi capability (undefined = chưa cấu hình host). */
const healthUrls: Partial<Record<GateCapability, string>> = {};

/** Trạng thái live đọc ĐỒNG BỘ (default false = mock). */
const liveState: Record<GateCapability, boolean> = {
  work: false,
  proofchat: false,
};

// Subscription — probe chạy async, đổi liveState SAU khi component đã render.
// Component (qua hook useCapabilityLive) đăng ký listener để re-render khi cờ lật.
type Listener = () => void;
const listeners = new Set<Listener>();

/** Đăng ký nghe thay đổi trạng thái gate. Trả hàm huỷ đăng ký. */
export const subscribeRuntimeGate = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const notify = (): void => {
  listeners.forEach(fn => {
    try {
      fn();
    } catch {
      /* listener lỗi không được chặn các listener khác */
    }
  });
};

/**
 * Suy URL health từ base URL — lấy ORIGIN (scheme://host[:port]) + '/health'.
 * Dùng regex, KHÔNG dùng `new URL()` (Hermes/RN không đảm bảo có URL polyfill —
 * bài học adversary: L0/config không được phụ thuộc global ambient chưa chắc có).
 * Base rỗng/không hợp lệ → trả '' (capability coi như chưa cấu hình).
 */
export const deriveHealthUrl = (base: string | undefined): string => {
  if (!base) return '';
  const m = base.match(/^(https?:\/\/[^/]+)/i);
  return m ? `${m[1]}/health` : '';
};

/** Đăng ký endpoint health cho 1 capability (gọi lúc bootstrap, từ config module). */
export const registerCapability = (cap: GateCapability, base: string | undefined): void => {
  const url = deriveHealthUrl(base);
  if (url) healthUrls[cap] = url;
  else delete healthUrls[cap];
};

/** Kết quả live đọc đồng bộ. Default false = mock. Các gate module gọi hàm này. */
export const isCapabilityLive = (cap: GateCapability): boolean => liveState[cap] === true;

const setLive = (cap: GateCapability, next: boolean): void => {
  if (liveState[cap] !== next) {
    liveState[cap] = next;
    notify();
  }
};

const probeOne = async (cap: GateCapability): Promise<void> => {
  const url = healthUrls[cap];
  if (!url) {
    setLive(cap, false);
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    // CHỈ 2xx = live. 502/503/504 (host chưa cấp), 404 (route chưa deploy), 5xx
    // đều → mock (không kích hoạt nhầm vào backend chưa sẵn).
    setLive(cap, res.ok);
  } catch {
    // Abort/timeout/mạng lỗi → mock (an toàn, không đoán live).
    setLive(cap, false);
  }
};

/** Probe mọi capability đã đăng ký. Gọi lúc khởi động + mỗi lần foreground. */
export const probeAllCapabilities = async (): Promise<void> => {
  await Promise.all(ALL_CAPS.map(probeOne));
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(liveState));
  } catch {
    /* non-fatal — mất cache chỉ khiến lần chạy sau probe lại từ đầu */
  }
};

/**
 * Nạp kết quả probe lần trước từ AsyncStorage (fire trước probeAll để lần chạy
 * đầu không nhấp nháy). Chỉ nạp giá trị boolean hợp lệ.
 */
export const loadGateCache = async (): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as Partial<Record<GateCapability, unknown>>;
    for (const cap of ALL_CAPS) {
      if (typeof cached[cap] === 'boolean') liveState[cap] = cached[cap] as boolean;
    }
    notify();
  } catch {
    /* cache hỏng → bỏ qua, giữ default false */
  }
};

/** Reset (chỉ dùng cho test). */
export const __resetRuntimeGateForTest = (): void => {
  for (const cap of ALL_CAPS) {
    liveState[cap] = false;
    delete healthUrls[cap];
  }
};
