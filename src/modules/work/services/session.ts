// modules/work/services/session.ts
//
// Quản phiên Bearer của AladinWork (độc lập phiên PhoenixKey — SPEC §2).
// AladinWork tự cấp session HMAC (TTL 12h), KHÔNG có refresh-token → hết hạn
// thì đăng nhập lại (challenge → ký → verify).
//
// PHẦN KÝ secp256k1 (challenge → signature) là việc của Thư / lớp native
// PhoenixKey. Ở đây chỉ:
//   - gọi /auth/challenge (lấy challenge)
//   - gọi /auth/verify (nộp signature Thư ký → nhận session)
//   - lưu / đọc / xoá session token an toàn.
//
// Prod: KHÔNG dùng localStorage. Dùng AsyncStorage như các service khác trong
// repo; khi Thư nối Keychain/Keystore thật có thể thay lớp lưu ở đây.

import AsyncStorage from '@react-native-async-storage/async-storage';

const WORK_SESSION_KEY = 'aladinwork_session';
const WORK_SESSION_EXP_KEY = 'aladinwork_session_exp';
const WORK_SESSION_DID_KEY = 'aladinwork_session_did';

export interface WorkSession {
  session: string;
  expiresAt: number; // epoch ms
  did: string;
}

/** Lưu phiên sau /auth/verify thành công. */
export const saveWorkSession = async (s: WorkSession): Promise<void> => {
  await AsyncStorage.multiSet([
    [WORK_SESSION_KEY, s.session],
    [WORK_SESSION_EXP_KEY, String(s.expiresAt)],
    [WORK_SESSION_DID_KEY, s.did],
  ]);
};

/** Đọc session token thô (chưa kiểm hạn). null nếu chưa đăng nhập. */
export const getWorkSessionToken = (): Promise<string | null> =>
  AsyncStorage.getItem(WORK_SESSION_KEY);

/** Đọc phiên đầy đủ + tự loại nếu đã hết hạn (12h). */
export const getValidWorkSession = async (): Promise<WorkSession | null> => {
  const [session, exp, did] = await Promise.all([
    AsyncStorage.getItem(WORK_SESSION_KEY),
    AsyncStorage.getItem(WORK_SESSION_EXP_KEY),
    AsyncStorage.getItem(WORK_SESSION_DID_KEY),
  ]);
  if (!session || !did) return null;
  const expiresAt = exp ? Number(exp) : 0;
  if (expiresAt && Date.now() >= expiresAt) {
    await clearWorkSession();
    return null;
  }
  return { session, expiresAt, did };
};

/** Xoá phiên (đăng xuất / nhận 401 UNAUTH). */
export const clearWorkSession = (): Promise<void> =>
  AsyncStorage.multiRemove([
    WORK_SESSION_KEY,
    WORK_SESSION_EXP_KEY,
    WORK_SESSION_DID_KEY,
  ]).then(() => undefined);
