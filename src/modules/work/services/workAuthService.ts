// modules/work/services/workAuthService.ts
//
// Lấy phiên AladinWork KHÔNG qua hook (cho interceptor/flow nền tự đăng nhập lazy):
// có phiên còn hạn → dùng lại; chưa → challenge → KÝ (PhoenixKey HW key) → verify →
// lưu. Mirror useWorkAuth.login nhưng là hàm thuần. Dedup _inflight: nhiều lời gọi
// cần-auth bắn đồng thời → CHỈ 1 lần ký sinh-trắc (không hiện Face ID chồng nhau).

import { authChallenge, authVerify } from './workApi';
import { getValidWorkSession, saveWorkSession, type WorkSession } from './session';
import { isValidPhoenixDid } from './types';
import { signWorkChallenge } from './signWorkChallenge';
import { currentUserDid } from '../../../sdk/phoenixKey';

let _inflight: Promise<string | null> | null = null;

export async function ensureWorkSession(opts?: { force?: boolean }): Promise<string | null> {
  if (!opts?.force) {
    const existing = await getValidWorkSession();
    if (existing) return existing.session;
  }
  if (_inflight) return _inflight; // gộp các lời gọi song song vào 1 lần ký
  _inflight = (async () => {
    try {
      const did = await currentUserDid();
      // Không có danh tính PhoenixKey trên máy → không thể ký → không có phiên.
      if (!did || !isValidPhoenixDid(did)) return null;
      const ch = await authChallenge(did);
      const timestamp = Math.floor(Date.now() / 1000); // GIÂY (SPEC §8)
      const message = `${ch.challenge}:${ch.domain}:${timestamp}`;
      const signature = await signWorkChallenge({
        did, message, challenge: ch.challenge, domain: ch.domain, timestamp,
      });
      const v = await authVerify({ did, challenge: ch.challenge, signature, timestamp });
      const session: WorkSession = { session: v.session, expiresAt: v.expiresAt, did: v.did };
      await saveWorkSession(session);
      return session.session;
    } catch (err) {
      // Offline / PhoenixKey chết (503) / chữ ký sai → không có phiên, thử lại lần sau.
      console.warn('[Work] ensureWorkSession failed:', err);
      return null;
    } finally {
      _inflight = null;
    }
  })();
  return _inflight;
}
