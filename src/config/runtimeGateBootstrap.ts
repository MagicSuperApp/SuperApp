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
import { setWorkSessionProvider } from '../modules/work/services/workApi';
import { ensureWorkSession } from '../modules/work/services/workAuthService';
import { setProofChatSessionProvider } from '../services/proofchat-api';
import { ensureProofChatSession } from '../services/proofchatAuthBridge';
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
    // Lazy-login AladinWork: interceptor tự lấy phiên (ký PhoenixKey) khi call cần-auth
    // mà chưa có token — thay vì bắt màn nào cũng gọi login tay.
    setWorkSessionProvider(ensureWorkSession);
    // Cùng lý do với AladinWork: màn Trò chuyện nạp danh sách ngay khi mở, sớm hơn
    // lúc `proofchatService.init()` kịp đăng nhập xong. Không có provider thì lượt
    // đầu luôn 401 và màn báo "Chưa tải được" dù máy chủ sống.
    setProofChatSessionProvider(ensureProofChatSession);
  }
  await loadGateCache();
  await probeAllCapabilities();
};

/** Probe lại — gọi mỗi lần app quay lại foreground. Fire-and-forget. */
export const refreshRuntimeGate = (): void => {
  void probeAllCapabilities();
};
