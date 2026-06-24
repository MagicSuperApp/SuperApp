/**
 * Remote Logger — React Native side
 *
 * Gửi log lên log server qua HTTP POST.
 * Endpoint phải khớp với ScannerRemoteLog.swift → static var endpoint.
 *
 * Dùng trong TreeIdentityScreen + treeReIDService để trace full flow:
 *   JS → native bridge → camera → capture → identify API → verdict
 *
 * Fire-and-forget: không cần await ở call site, lỗi network im lặng.
 */

import { Platform } from 'react-native';

// Hardcode cùng giá trị với ScannerRemoteLog.swift
const REMOTE_LOG_SERVER_URL =
  'https://gutless-renovator-distaste.ngrok-free.dev/logs';

// ── Device info (resolve 1 lần) ───────────────────────────────────────────────

const DEVICE_LABEL = `${Platform.OS === 'ios' ? 'iOS' : 'Android'} RN`;
const OS_VERSION   = String(Platform.Version);

// ── Sequence counter (per boot session, JS side) ───────────────────────────────

let _jsSeq = 0;
const nextSeq = () => ++_jsSeq;

// Boot session ID — lọc log sau khi app reload
const BOOT_SESSION = Math.random().toString(36).slice(2, 10);

// ── Core send ─────────────────────────────────────────────────────────────────

function send(event: string, data: Record<string, unknown>, level = 'info'): void {
  const payload = {
    event,
    device: DEVICE_LABEL,
    osVersion: OS_VERSION,
    appVersion: '',
    stackTrace: '',
    data: {
      ...data,
      level,
      jsSeq: nextSeq(),
      bootSession: BOOT_SESSION,
      platform: Platform.OS,
      timestamp: new Date().toISOString(),
    },
  };

  // Console echo để Xcode / Metro cũng thấy
  const tag = `[rLog:${event}]`;
  if (level === 'error') {
    console.error(tag, data);
  } else {
    console.log(tag, data);
  }

  fetch(REMOTE_LOG_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Lỗi network → im lặng, không crash app
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

const rLog = {
  info(phase: string, data: Record<string, unknown> = {}): void {
    send(phase, data, 'info');
  },

  error(phase: string, data: Record<string, unknown> = {}): void {
    send(phase, data, 'error');
  },

  // ── TreeIdentity specific events ────────────────────────────────────────────

  treeIdentity: {
    screenMount(params: { farmId?: string }): void {
      send('tree_identity_mount', { farmId: params.farmId ?? null });
    },

    startCapture(): void {
      send('tree_identity_start_capture', {});
    },

    captureTriggered(totalCaptures: number, round: number): void {
      send('tree_identity_capture_triggered', { totalCaptures, round });
    },

    advanceRound2(round1Count: number): void {
      send('tree_identity_advance_round2', { round1Count });
    },

    stopAndIdentifyStart(totalCaptures: number): void {
      send('tree_identity_identify_start', { totalCaptures });
    },

    stopSessionResult(ok: boolean, captureCount: number, err?: string): void {
      send('tree_identity_stop_session_result', {
        ok,
        captureCount,
        err: err ?? null,
      }, ok ? 'info' : 'error');
    },

    apiStart(captureCount: number, lat?: number, lon?: number): void {
      send('tree_identity_api_start', {
        captureCount,
        lat: lat ?? null,
        lon: lon ?? null,
      });
    },

    apiResult(
      status: string,
      confidence: string | null,
      treeId: string | null,
      queryId: string | null,
      similarity: number | null,
    ): void {
      send('tree_identity_api_result', {
        status,
        confidence,
        treeId,
        queryId,
        similarity,
      });
    },

    apiError(err: string, captureCount: number): void {
      send('tree_identity_api_error', { err, captureCount }, 'error');
    },

    verdictSend(verdict: string, queryId: string | null, correctTid?: string): void {
      send('tree_identity_verdict_send', {
        verdict,
        queryId,
        correctTid: correctTid ?? null,
      });
    },

    verdictResult(ok: boolean, err?: string): void {
      send('tree_identity_verdict_result', {
        ok,
        err: err ?? null,
      }, ok ? 'info' : 'error');
    },

    reset(): void {
      send('tree_identity_reset', {});
    },
  },

  // ── Bridge events (gọi từ native bridge subscription handlers) ──────────────

  nativeBridge: {
    headingUpdate(heading: number, pitch: number): void {
      // Throttle: chỉ log mỗi 30 update để không spam
      if (_jsSeq % 30 !== 0) return;
      send('native_heading_update', { heading, pitch });
    },

    roundComplete(round: number, captureCount: number): void {
      send('native_round_complete', { round, captureCount });
    },

    bridgeError(method: string, err: string): void {
      send('native_bridge_error', { method, err }, 'error');
    },
  },
};

export default rLog;
