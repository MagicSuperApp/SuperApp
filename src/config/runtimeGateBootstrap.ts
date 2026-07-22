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
// PROOFCHAT_API_URL khai ở src/types/env.d.ts (global @env).
import { PROOFCHAT_API_URL } from '@env';

let registered = false;

/**
 * Đăng ký host + nạp cache lần trước + probe lần đầu. Gọi 1 lần lúc app khởi động.
 * health URL suy từ ORIGIN của mỗi base (xem deriveHealthUrl) → '/health'.
 */
export const bootstrapRuntimeGate = async (): Promise<void> => {
  if (!registered) {
    registered = true;
    registerCapability('work', WORK_BASE_URL || undefined);
    registerCapability('proofchat', (PROOFCHAT_API_URL as string | undefined) || undefined);
  }
  await loadGateCache();
  await probeAllCapabilities();
};

/** Probe lại — gọi mỗi lần app quay lại foreground. Fire-and-forget. */
export const refreshRuntimeGate = (): void => {
  void probeAllCapabilities();
};
