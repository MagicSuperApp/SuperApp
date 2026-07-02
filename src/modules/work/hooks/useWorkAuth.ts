// modules/work/hooks/useWorkAuth.ts
//
// Cầu nối đăng nhập AladinWork (SPEC §2): challenge → KÝ → verify → lưu session.
//
// ══════════════════════════════════════════════════════════════════════════
// PHẦN KÝ secp256k1 = VIỆC CỦA THƯ / lớp native PhoenixKey.
// Hook này CHỈ:
//   1. gọi authChallenge(did) → nhận { challenge, domain, messageTemplate }
//   2. [TODO THƯ] ký message = `${challenge}:${domain}:${timestamp}` (timestamp
//      = GIÂY epoch) bằng khóa riêng DID → signature hex
//   3. gọi authVerify({ did, challenge, signature, timestamp }) → session Bearer
//   4. saveWorkSession(...)
// signChallenge được TRUYỀN VÀO từ ngoài (do Thư cấp) — hook không tự ký.
// ══════════════════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import { authChallenge, authVerify, WorkApiError, type WorkErrorKind } from '../services/workApi';
import { saveWorkSession, getValidWorkSession, clearWorkSession, type WorkSession } from '../services/session';

/**
 * Hàm ký do Thư cấp: nhận message chuẩn (challenge:domain:timestamp) + trả
 * signature hex. Timestamp (giây) đã dựng sẵn để đảm bảo khớp giữa message ký
 * và body verify.
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
   * Đăng nhập đầy đủ. signChallenge do Thư cấp (ký secp256k1).
   * TODO THƯ: nối signChallenge vào SDK/relay PhoenixKey thật.
   */
  const login = useCallback(async (did: string, signChallenge: SignChallengeFn): Promise<boolean> => {
    setState(prev => ({ ...prev, loading: true, errorKind: null, errorCode: null }));
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
