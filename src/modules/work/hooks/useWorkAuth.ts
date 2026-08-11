// modules/work/hooks/useWorkAuth.ts
//
// Cầu nối đăng nhập AladinWork (SPEC §2): challenge → KÝ → verify → lưu session.
//
// ══════════════════════════════════════════════════════════════════════════
// PHẦN KÝ P-256 (secp256r1) = VIỆC CỦA THƯ / lớp native PhoenixKey.
//   Chữ ký challenge dùng ĐƯỜNG CONG P-256 (secp256r1 / prime256v1) ECDSA,
//   hash sha256, DER hex — KHÔNG phải secp256k1. Lý do: HW_Key PhoenixKey sinh
//   trong Secure Enclave (iOS) / StrongBox (Android) CHỈ đẻ được P-256; verifier
//   server dùng @noble/curves/p256, skew ±60s, KHÔNG ép lowS (SPEC §2).
// Hook này CHỈ:
//   1. validate DID (did:phoenix regex) rồi gọi authChallenge(did)
//      → nhận { challenge, domain, messageTemplate }
//   2. ký message = `${challenge}:${domain}:${timestamp}` (timestamp = GIÂY epoch)
//      bằng khóa riêng P-256 của DID → signature DER hex
//   3. gọi authVerify({ did, challenge, signature, timestamp }) → session Bearer
//   4. saveWorkSession(...)
// signChallenge được TRUYỀN VÀO từ ngoài — bản THẬT là `signWorkChallenge`
// (services/signWorkChallenge.ts, ký bằng signRaw PhoenixKey HW key). Luồng nền
// KHÔNG dùng hook: interceptor tự gọi `ensureWorkSession` (workAuthService) khi
// call cần-auth mà chưa có token. Hook này còn cho màn login TƯỜNG MINH nếu cần.
// ══════════════════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import { authChallenge, authVerify, WorkApiError, type WorkErrorKind } from '../services/workApi';
import { isValidPhoenixDid } from '../services/types';
import { saveWorkSession, getValidWorkSession, clearWorkSession, type WorkSession } from '../services/session';

/**
 * Hàm ký do Thư cấp: nhận message chuẩn (challenge:domain:timestamp) + trả
 * signature DER hex. Ký bằng P-256 (secp256r1) ECDSA / sha256 — KHÔNG secp256k1.
 * Timestamp (giây) đã dựng sẵn để đảm bảo khớp giữa message ký và body verify.
 */
export type SignChallengeFn = (args: {
  did: string;
  message: string;
  challenge: string;
  domain: string;
  timestamp: number; // giây epoch
}) => Promise<string>;

export interface WorkAuthState {
  session: WorkSession | null;
  loading: boolean;
  errorKind: WorkErrorKind | null;
  errorCode: string | null;
  accountCreated: boolean;
}

export const useWorkAuth = () => {
  const [state, setState] = useState<WorkAuthState>({
    session: null, loading: false, errorKind: null, errorCode: null, accountCreated: false,
  });

  /** Đọc phiên đã lưu (tự loại nếu hết hạn 12h). */
  const restore = useCallback(async (): Promise<WorkSession | null> => {
    const s = await getValidWorkSession();
    setState(prev => ({ ...prev, session: s }));
    return s;
  }, []);

  /**
   * Đăng nhập đầy đủ. Truyền `signWorkChallenge` (services/signWorkChallenge.ts) để
   * ký P-256 bằng PhoenixKey HW key thật. (Luồng nền dùng ensureWorkSession, không
   * qua hook — hook này cho màn login tường minh.)
   */
  const login = useCallback(async (did: string, signChallenge: SignChallengeFn): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, errorKind: null, errorCode: null }));
    // DID người dùng LUÔN là did:phoenix — chặn sớm để không tốn 1 vòng /challenge.
    if (!isValidPhoenixDid(did)) {
      setState(prev => ({ ...prev, loading: false, errorKind: 'client', errorCode: 'BAD_DID' }));
      return false;
    }
    try {
      const ch = await authChallenge(did);
      // timestamp = GIÂY epoch (SPEC §8: khác availability = ms).
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `${ch.challenge}:${ch.domain}:${timestamp}`;
      // ── điểm ký (Thư) ──────────────────────────────────────────────
      const signature = await signChallenge({
        did, message, challenge: ch.challenge, domain: ch.domain, timestamp,
      });
      const v = await authVerify({ did, challenge: ch.challenge, signature, timestamp });
      const session: WorkSession = { session: v.session, expiresAt: v.expiresAt, did: v.did };
      await saveWorkSession(session);
      setState({
        session, loading: false, errorKind: null, errorCode: null,
        accountCreated: v.accountCreated,
      });
      return true;
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      const code = err instanceof WorkApiError ? err.code : 'UNKNOWN';
      console.warn('[Work] login failed:', err);
      setState(prev => ({ ...prev, loading: false, errorKind: kind, errorCode: code }));
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await clearWorkSession();
    setState({ session: null, loading: false, errorKind: null, errorCode: null, accountCreated: false });
  }, []);

  return { ...state, restore, login, logout };
};
