// config/runtimeGateBootstrap.ts
//
// Nối cổng runtime với host thật (đọc từ @env, giữ 1 nguồn host) rồi probe.
// Tách khỏi runtimeGate.ts để runtimeGate.ts thuần (không import @env/module).

import {
  registerCapability,
  loadGateCache,
  probeAllCapabilities,
} from './runtimeGate';
import { WORK_BASE_URL } from '../modules/work/services/config';
import { baseURL as PHOENIX_BASE_URL } from '../services/phoenixKey-api';
// PROOFCHAT_API_URL khai ở src/types/env.d.ts (global @env).
import { PROOFCHAT_API_URL } from '@env';

let registered = false;

/**
 * Đăng ký host + nạp cache lần trước + probe lần đầu. Gọi 1 lần lúc app khởi động.
 * health URL = BASE (giữ path `/api/v1`) + đường health riêng của nền — xem
 * `HEALTH_PATH` trong runtimeGate.ts (đo bằng curl thật, mỗi nền một kiểu).
 */
export const bootstrapRuntimeGate = async (): Promise<void> => {
  if (!registered) {
    registered = true;
    registerCapability('work', WORK_BASE_URL || undefined);
    registerCapability('proofchat', (PROOFCHAT_API_URL as string | undefined) || undefined);
    registerCapability('phoenix', PHOENIX_BASE_URL || undefined);
  }
  await loadGateCache();
  await probeAllCapabilities();
};

/** Probe lại — gọi mỗi lần app quay lại foreground. Fire-and-forget. */
export const refreshRuntimeGate = (): void => {
  void probeAllCapabilities();
};
