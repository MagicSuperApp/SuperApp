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
import { REMOTE_LOG_URL } from '@env';
import { filterBeforeSend } from './telemetryGate';

// ⛔ KHÔNG có đường lui mặc định. Chỗ này từng viết cứng
// `https://gutless-renovator-distaste.ngrok-free.dev/logs` — một tunnel tạm trên máy
// lập trình viên. Nghĩa là MỌI bản phát hành đều đẩy nhật ký thiết bị của người dùng
// thật (luồng nhận diện cây, và cả `orilifeDidAuth`) lên một tên miền tạm mà bất kỳ ai
// cũng giành lại được sau khi tunnel tắt. Bản `app-release.aab` dựng tay 15/08 CÓ chuỗi
// đó nướng sẵn trong bundle — đo bằng `strings` trên chính tệp .aab.
// Thiếu cấu hình phải là TẮT. Địa chỉ cũ coi như đã lộ (còn trong lịch sử git).
// Cổng `.github/workflows/android-aab.yml` nay chặn `ngrok-free.dev` trong bundle.
const REMOTE_LOG_SERVER_URL = String(REMOTE_LOG_URL ?? '').trim();

/** Có nơi để gửi nhật ký không. Chưa cấu hình ⇒ chỉ in ra console, không đi mạng. */
export const remoteLogEnabled = (): boolean => REMOTE_LOG_SERVER_URL.length > 0;

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
  // ── CỔNG LỌC — đặt ở đây, không ở từng nơi gọi ────────────────────────────
  // `rLog.info`/`rLog.error` nhận `Record<string, unknown>` tuỳ ý, nên nơi gọi
  // đưa được BẤT CỨ gì vào. Đặt phép lọc ở nơi gọi thì mỗi chỗ phải nhớ, và chỗ
  // quên thì không gì báo. Đặt ở đây thì không đường nào ra mạng mà không qua.
  //
  // Console echo bên dưới CỐ Ý in bản GỐC: nó không rời máy, và người gỡ lỗi
  // bằng Metro/Xcode cần thấy đủ. Chỉ phần ĐI RA MẠNG mới bị lọc.
  const { safe, dropped } = filterBeforeSend(data);

  const payload = {
    event,
    device: DEVICE_LABEL,
    osVersion: OS_VERSION,
    appVersion: '',
    stackTrace: '',
    data: {
      ...safe,
      level,
      jsSeq: nextSeq(),
      bootSession: BOOT_SESSION,
      platform: Platform.OS,
      timestamp: new Date().toISOString(),
      // Bỏ thì phải KÊU. Thiếu dòng này, người đọc bản ghi thấy một trường vắng
      // mặt và tưởng đường mã không chạy tới đó — cổng tự thành vỏ im lặng.
      ...(dropped.length ? { gateDropped: dropped.join(',') } : {}),
    },
  };

  // Console echo để Xcode / Metro cũng thấy
  const tag = `[rLog:${event}]`;
  if (level === 'error') {
    console.error(tag, data);
  } else {
    console.log(tag, data);
  }

  // Chưa cấu hình đích ⇒ dừng ở console echo phía trên. Console vẫn chạy nên khi
  // gỡ lỗi bằng Metro/Xcode không mất gì; chỉ phần ĐI RA MẠNG là tắt.
  if (!REMOTE_LOG_SERVER_URL) {
    return;
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

    /**
     * `lat`/`lon` ĐÃ BỎ khỏi bản ghi đi ra mạng, và hai tham số giữ lại chỉ để
     * nơi gọi không phải sửa theo.
     *
     * Vì sao bỏ: toạ độ chính xác đi chung ống với `bootSession`, mà
     * `bootSession` lại đi chung với tên đăng nhập ở một sự kiện khác. Bên nhận
     * không cần làm gì thông minh — một câu `GROUP BY bootSession` là ra bảng
     * "tên người ↔ toạ độ vườn ↔ giờ". Cửa nhận đó cũng không xác thực gì.
     *
     * Đổi lại mất gì: không mất gì đo được. Toạ độ ở đây chưa từng dùng để chẩn
     * đoán lần gọi hỏng — `hasFix` trả lời đủ câu "máy có định vị được không",
     * mà không chở theo người dùng đang đứng ở đâu.
     */
    apiStart(captureCount: number, lat?: number, lon?: number): void {
      send('tree_identity_api_start', {
        captureCount,
        hasFix: lat != null && lon != null,
      });
    },

    /**
     * Probe reachability của backend identify TRƯỚC khi upload multipart.
     * Phân biệt "device không tới host" vs "RN không đọc được file ảnh"
     * (cả hai đều ném cùng message "Network request failed").
     *  - ok=true  → host tới được → nếu identify vẫn fail thì do file/upload.
     *  - ok=false → host KHÔNG tới được → lỗi mạng/tunnel/DNS phía device.
     */
    reachProbe(baseUrl: string, ok: boolean, status: number, err?: string): void {
      send('tree_identity_reach_probe', {
        baseUrl,
        ok,
        status,
        err: err ?? null,
      }, ok ? 'info' : 'error');
    },

    /** Log từng file ảnh sẽ upload (uri + đọc được hay không + size). */
    fileCheck(index: number, uri: string, exists: boolean, size: number, err?: string): void {
      send('tree_identity_file_check', {
        index,
        uri,
        exists,
        size,
        err: err ?? null,
      }, exists ? 'info' : 'error');
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

  // ── PhoenixKey self-pair + đăng-ký ví (trace vì sao ví không hiện) ──────────
  // Mỗi bước một event; catch log kèm code/httpStatus/message để biết CHẾT Ở ĐÂU.

  phoenixWallet: {
    sessionStart(hasExisting: boolean, force: boolean): void {
      send('pk_session_start', { hasExisting, force });
    },
    sessionIdentity(hasDid: boolean, hasPubkey: boolean): void {
      send('pk_session_identity', { hasDid, hasPubkey }, hasDid && hasPubkey ? 'info' : 'error');
    },
    sessionInit(sessionId: string, hasChallenge: boolean, hasTempToken: boolean): void {
      send('pk_session_init', { sessionId, hasChallenge, hasTempToken });
    },
    sessionSigned(sigLen: number): void {
      send('pk_session_signed', { sigLen });
    },
    sessionApprove(status: string): void {
      send('pk_session_approve', { status });
    },
    sessionStatus(status: string, hasSessionToken: boolean): void {
      send('pk_session_status', { status, hasSessionToken }, hasSessionToken ? 'info' : 'error');
    },
    sessionDone(saved: boolean): void {
      send('pk_session_done', { saved }, saved ? 'info' : 'error');
    },
    sessionError(step: string, code: number, httpStatus: number, message: string): void {
      send('pk_session_error', { step, code, httpStatus, message }, 'error');
    },

    walletStart(available: boolean): void {
      send('pk_wallet_start', { available }, available ? 'info' : 'error');
    },
    walletKek(hasKek: boolean): void {
      send('pk_wallet_kek', { hasKek }, hasKek ? 'info' : 'error');
    },
    walletDerive(hasFixed: boolean, hasActive: boolean, hasStake: boolean): void {
      send('pk_wallet_derive', { hasFixed, hasActive, hasStake }, hasFixed ? 'info' : 'error');
    },
    walletProof(hasPubkey: boolean, hasSignature: boolean): void {
      send('pk_wallet_proof', { hasPubkey, hasSignature }, hasPubkey && hasSignature ? 'info' : 'error');
    },
    walletRegisterDone(ok: boolean): void {
      send('pk_wallet_register_done', { ok }, ok ? 'info' : 'error');
    },
    walletError(step: string, code: number, httpStatus: number, message: string): void {
      send('pk_wallet_error', { step, code, httpStatus, message }, 'error');
    },
  },

  // ── Xem 3D (WebView /view/{code} + GL react-three-fiber Space3D) ────────────
  // Trace vì sao app CRASH khi mở 3D. Đọc event CUỐI trước khi mất log:
  //   space_mount (không có space_gl_created) → chết lúc tạo ngữ cảnh GL (expo-gl/New Arch).
  //   space_gl_created rồi im   → chết lúc render cảnh (glb/mesh) — boundary có thể bắt.
  //   boundary_error            → lỗi JS đã xử lý êm (đọc message/stack).
  //   webview_render_process_gone / content_process_terminated → renderer WebView chết.

  viewer3d: {
    // ── WebView 3D (TreeViewer3D → /view/{code}) ──
    webviewOpen(code: string | null, url: string): void {
      send('viewer3d_webview_open', { code, hasCode: !!code, url });
    },
    webviewLoadStart(url: string): void { send('viewer3d_webview_load_start', { url }); },
    webviewLoadEnd(url: string): void { send('viewer3d_webview_load_end', { url }); },
    webviewLoadError(url: string, desc?: string): void {
      send('viewer3d_webview_load_error', { url, desc: desc ?? null }, 'error');
    },
    webviewHttpError(url: string, status: number): void {
      send('viewer3d_webview_http_error', { url, status }, 'error');
    },
    webviewRenderGone(url: string, didCrash?: boolean): void {
      send('viewer3d_webview_render_process_gone', { url, didCrash: didCrash ?? null }, 'error');
    },
    webviewProcessTerminated(url: string): void {
      send('viewer3d_webview_content_process_terminated', { url }, 'error');
    },
    webviewClose(code: string | null): void { send('viewer3d_webview_close', { code }); },

    // ── GL 3D (Space3D → react-three-fiber/expo-gl) ──
    spaceNav(ctx: { treeId?: string; farmId?: string }): void {
      send('viewer3d_space_nav', { treeId: ctx.treeId ?? null, farmId: ctx.farmId ?? null });
    },
    spaceMount(ctx: { mode?: string; farmId?: string; treeId?: string }): void {
      send('viewer3d_space_mount', {
        mode: ctx.mode ?? null, farmId: ctx.farmId ?? null, treeId: ctx.treeId ?? null,
      });
    },
    spaceCanvasFocus(): void { send('viewer3d_space_canvas_focus', {}); },
    spaceGlCreated(): void { send('viewer3d_space_gl_created', {}); },
    spaceUnmount(): void { send('viewer3d_space_unmount', {}); },

    // ── GL 3D (FruitPlace3D → cũng expo-gl, camera trực giao) ──
    // Cùng bộ mốc với Space3D: mount → gl_created → unmount. Mốc CUỐI đọc được
    // cho biết chết lúc dựng ngữ-cảnh GL hay lúc render cảnh.
    placeMount(ctx: { treeId?: string; fruitId?: string }): void {
      send('viewer3d_place_mount', { treeId: ctx.treeId ?? null, fruitId: ctx.fruitId ?? null });
    },
    placeGlCreated(): void { send('viewer3d_place_gl_created', {}); },
    placeUnmount(): void { send('viewer3d_place_unmount', {}); },

    /**
     * Dò expo-gl ngay trước khi mở màn 3D (xem `_glAvailable` trong navigation/index).
     * ok=false ⇒ native chưa cài `globalThis.expo` → app hiện màn thay thế, KHÔNG crash.
     */
    glProbe(ok: boolean, message: string | null): void {
      send('viewer3d_gl_probe', { ok, message }, ok ? 'info' : 'error');
    },
    /** ErrorBoundary quanh cảnh 3D bắt được lỗi JS (không phải native crash). */
    boundaryError(tag: string, message: string, stack: string | null): void {
      send('viewer3d_boundary_error', { tag, message, stack }, 'error');
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
