/**
 * videoProofReconcile — đối chiếu bằng chứng video đã "lưu" với LampNet thật.
 *
 * VÌ SAO (issue #117 mục 6 + Module-Handoff H-34/H-35): `stored:true` chỉ nói "một node
 * đã nhận và trả CID", KHÔNG bảo đảm byte còn sống — vòng eviction của daemon từng xoá
 * bản gốc sau ~1800s (H-34: 22 tài liệu mất, có cả video cây/quả). Cách chắc nhất là đọc
 * lại (H-35: so `size`+`sha256`), nhưng đó là việc SERVER còn đang chặn. Bản NHẸ, KHÔNG
 * chặn gì, làm được ngay: sau khi có wifi, gọi `GET /v1/inspect/<cid>` một lượt; CID nào
 * `nodes` RỖNG (hoặc 404 = đã biến mất) thì báo NGƯỜI TRỰC MÁY CHỦ qua remoteLogger —
 * KHÔNG báo nông dân (họ không sửa được, chỉ khiến hoảng và mất tin).
 *
 * Chỉ CHẨN ĐOÁN: không xoá gì, không sửa sổ bằng chứng, không đụng hàng đợi gửi lại
 * (lớp chắn cuối của H-34 phải giữ nguyên). Fire-and-forget, lỗi mạng im lặng.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadAllVideoProofs } from './videoProofStore';
import rLog from './remoteLogger';

// api.lampnet.cloud phục vụ put/inspect (lampnet.cloud là cổng xem công khai theo CID).
// Khớp mặc định server (lampnet.py: LAMPNET_BASE_URL). Không đọc @env để khỏi phải khai
// thêm biến build trên Codemagic — prod chỉ có một địa chỉ này.
const LAMPNET_INSPECT_BASE = 'https://api.lampnet.cloud';

// Edge WAF chặn UA "Python-urllib" (403). UA thường thì qua — đặt tường minh cho chắc.
const UA = 'OriLifeApp/1.0 (proof-reconcile)';

const INSPECT_TIMEOUT_MS = 8000;
const MAX_INSPECT_PER_PASS = 300;     // chặn trần: một buổi thực địa hiếm vượt, vượt thì log rõ
const INSPECT_CONCURRENCY = 4;         // nhẹ tay với gateway
const THROTTLE_MS = 30 * 60 * 1000;    // tối đa 1 lượt / 30 phút, dù wifi chớp nhiều lần

const KEY_LAST_RUN = 'lampnet_reconcile:last_run';
const KEY_REPORTED = 'lampnet_reconcile:reported'; // CID đã báo mồ côi — khỏi báo lại mỗi lượt

let _running = false; // chống chạy chồng trong cùng phiên

/** CID thật của LampNet mới đối chiếu được; `local_…` là CID giả lúc LampNet tắt (bỏ qua). */
function isRealCid(cid: string): boolean {
  return typeof cid === 'string' && cid.startsWith('ln1q_');
}

type InspectVerdict = 'healthy' | 'orphaned' | 'inconclusive';

/**
 * `GET /v1/inspect/<cid>` → healthy (còn ≥1 node) / orphaned (nodes rỗng hoặc 404) /
 * inconclusive (mạng lỗi/timeout — KHÔNG kết luận, để lượt sau thử lại).
 */
async function inspectCid(cid: string): Promise<{ verdict: InspectVerdict; nodes: number; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INSPECT_TIMEOUT_MS);
  try {
    const res = await fetch(`${LAMPNET_INSPECT_BASE}/v1/inspect/${encodeURIComponent(cid)}`, {
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 404) return { verdict: 'orphaned', nodes: 0, status: 404 };
    if (!res.ok) return { verdict: 'inconclusive', nodes: -1, status: res.status };
    const body = await res.json().catch(() => null);
    const nodes = Array.isArray(body?.nodes) ? body.nodes.length : -1;
    if (nodes < 0) return { verdict: 'inconclusive', nodes: -1, status: res.status };
    return { verdict: nodes === 0 ? 'orphaned' : 'healthy', nodes, status: res.status };
  } catch {
    return { verdict: 'inconclusive', nodes: -1, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function loadReported(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY_REPORTED);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

async function saveReported(set: Set<string>): Promise<void> {
  try {
    // Giữ trần để khoá không phình: mới nhất trước.
    await AsyncStorage.setItem(KEY_REPORTED, JSON.stringify([...set].slice(0, 1000)));
  } catch {
    /* bỏ qua */
  }
}

/** Chạy pool có giới hạn song song trên `items`, gọi `fn` từng phần tử. */
async function pooled<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * Một lượt đối chiếu. Tự bỏ qua nếu vừa chạy trong THROTTLE_MS hoặc đang chạy dở.
 * KHÔNG ném — mọi lỗi nuốt êm. Trả về số CID đã báo mồ côi trong lượt này (test dùng).
 */
export async function reconcileVideoProofsOnce(opts?: { force?: boolean }): Promise<number> {
  if (_running) return 0;
  _running = true;
  try {
    if (!opts?.force) {
      try {
        const last = Number(await AsyncStorage.getItem(KEY_LAST_RUN)) || 0;
        if (Date.now() - last < THROTTLE_MS) return 0;
      } catch {
        /* đọc lỗi → cứ chạy */
      }
    }
    await AsyncStorage.setItem(KEY_LAST_RUN, String(Date.now())).catch(() => undefined);

    const all = await loadAllVideoProofs();
    // Chỉ đối chiếu cái ĐÃ tự nhận là lưu bền, và là CID LampNet thật. Khử trùng theo CID.
    const seen = new Set<string>();
    const targets = all.filter(p => {
      if (p.stored !== true || !isRealCid(p.videoCid)) return false;
      if (seen.has(p.videoCid)) return false;
      seen.add(p.videoCid);
      return true;
    });

    const capped = targets.length > MAX_INSPECT_PER_PASS;
    const batch = capped ? targets.slice(0, MAX_INSPECT_PER_PASS) : targets;
    if (batch.length === 0) return 0;

    const reported = await loadReported();
    let healthy = 0, orphaned = 0, inconclusive = 0, newlyReported = 0;

    await pooled(batch, INSPECT_CONCURRENCY, async (p) => {
      const r = await inspectCid(p.videoCid);
      if (r.verdict === 'healthy') { healthy++; return; }
      if (r.verdict === 'inconclusive') { inconclusive++; return; }
      // orphaned: byte đã "lưu" nhưng nay không node nào giữ → mất bằng chứng thực địa.
      orphaned++;
      if (!reported.has(p.videoCid)) {
        reported.add(p.videoCid);
        newlyReported++;
        // BÁO NGƯỜI TRỰC MÁY CHỦ — không có gì hiện ra cho nông dân.
        rLog.error('lampnet_proof_orphaned', {
          cid: p.videoCid,
          treeId: p.treeId,
          kind: p.kind,
          storedAt: p.at,
          httpStatus: r.status,
          note: 'stored=true nhưng /v1/inspect trả nodes rỗng — byte bằng chứng đã biến mất',
        });
      }
    });

    if (newlyReported > 0) await saveReported(reported);

    // Tổng kết mỗi lượt (info) để người trực thấy tỉ lệ, kể cả khi 0 mồ côi.
    rLog.info('lampnet_reconcile_done', {
      checked: batch.length,
      total: targets.length,
      capped,
      healthy,
      orphaned,
      inconclusive,
      newlyReported,
    });

    return newlyReported;
  } catch {
    return 0;
  } finally {
    _running = false;
  }
}

/**
 * Gọi từ listener NetInfo lúc mạng đổi. CHỈ chạy khi WIFI (đối chiếu tốn nhiều request
 * nhỏ — không tiêu data di động của nông dân). `state` là NetInfoState.
 */
export function maybeReconcileOnNetChange(state: {
  type?: string;
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}): void {
  const onWifi = state.type === 'wifi'
    && state.isConnected === true
    && state.isInternetReachable !== false;
  if (!onWifi) return;
  // fire-and-forget; throttle + _running tự lo phần chống dội.
  reconcileVideoProofsOnce().catch(() => undefined);
}
