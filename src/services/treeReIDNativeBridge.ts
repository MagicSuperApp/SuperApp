/**
 * TreeReID Native Bridge - TypeScript wrapper for TreeReIDBridgeModule (iOS)
 *
 * Provides:
 * - Capture session management (start/stop)
 * - Heading/pitch sensor events
 * - Image capture callbacks
 * - Round state management
 *
 * Based on native bridge pattern
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedImage {
  id: string;
  fileURL: string;
  heading: number;
  pitch: number;
  roll: number;
  round: 1 | 2;
  capturedAt: number;
  width: number;
  height: number;
}

export interface SessionState {
  sessionId: string | null;
  round: 1 | 2 | null;
  roundName: string | null;
  totalCaptures: number;
  capturesByRound: [number, number];
  lastHeading: number | null;
  lastPitch: number | null;
  gps: { lat: number; lng: number; accuracy: number } | null;
}

export interface HeadingUpdate {
  heading: number;
  pitch: number;
  roll: number;
  deltaHeading: number | null;
  deltaPitch: number | null;
  shouldCapture: boolean;
  timestamp: number;
}

export interface CaptureTriggered {
  captureId: string;
  heading: number;
  pitch: number;
  round: number;
  totalCaptures: number;
}

export interface RoundComplete {
  round: number;
  captures: number;
  nextRound: number;
  nextRoundName: string;
  nextGuidance: string;
}

export interface SessionStartResult {
  sessionId: string;
  round: number;
  roundName: string;
  guidance: string;
}

export interface SessionStopResult {
  sessionId: string;
  totalCaptures: number;
  captures: CapturedImage[];
  duration: number;
}

// ---------------------------------------------------------------------------
// Native Module Interface
// ---------------------------------------------------------------------------

type TreeReIDNativeModule = {
  startCaptureSession(options: Record<string, unknown>): Promise<SessionStartResult>;
  stopCaptureSession(options?: Record<string, unknown>): Promise<SessionStopResult | null>;
  addCapturedImage(imageData: { data: string; heading?: number; pitch?: number; roll?: number }): Promise<{
    captureId: string;
    fileURL: string;
    totalCaptures: number;
    round: number;
  }>;
  advanceToRound2(): Promise<{ round: number; roundName: string; guidance: string }>;
  getSessionState(): Promise<SessionState | null>;
  getCapturedImages(): Promise<CapturedImage[]>;
  getCurrentHeading(): Promise<{ heading: number | null; pitch: number | null }>;
  // Cam controls (flash + lens 0.5x). Native trả trạng-thái THỰC đã áp (an-toàn nếu
  // máy không hỗ-trợ → no-op + trả false/khả-năng false).
  getCameraCapabilities?(): Promise<{ hasTorch: boolean; supportsUltraWide: boolean }>;
  setTorch?(on: boolean): Promise<boolean>;
  setUltraWide?(on: boolean): Promise<boolean>;
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
};

const NativeBridge: TreeReIDNativeModule | undefined =
  (NativeModules as any).TreeReIDBridge;

const NOT_AVAILABLE_ERROR = new Error(
  Platform.OS === 'android'
    ? 'TreeReID native module chưa hỗ trợ trên Android'
    : 'TreeReID native module chưa sẵn sàng'
);

function ensureNative(): TreeReIDNativeModule {
  if (!NativeBridge) {
    throw NOT_AVAILABLE_ERROR;
  }
  return NativeBridge;
}

// ---------------------------------------------------------------------------
// Bridge API
// ---------------------------------------------------------------------------

export const TreeReIDBridge = {
  isAvailable(): boolean {
    // Android đã có native TreeReIDBridge (CameraX guided capture) → bật cả 2 nền.
    // Máy chưa cập nhật (thiếu module) → NativeBridge undefined → tự fallback picker.
    return Boolean(NativeBridge) && (Platform.OS === 'ios' || Platform.OS === 'android');
  },

  async startCaptureSession(options?: Record<string, unknown>): Promise<SessionStartResult> {
    const native = ensureNative();
    return native.startCaptureSession(options ?? {});
  },

  async stopCaptureSession(options?: Record<string, unknown>): Promise<SessionStopResult | null> {
    const native = ensureNative();
    return native.stopCaptureSession(options ?? {});
  },

  async addCapturedImage(imageData: { data: string; heading?: number; pitch?: number; roll?: number }): Promise<{
    captureId: string;
    fileURL: string;
    totalCaptures: number;
    round: number;
  }> {
    const native = ensureNative();
    return native.addCapturedImage(imageData);
  },

  async advanceToRound2(): Promise<{ round: number; roundName: string; guidance: string }> {
    const native = ensureNative();
    return native.advanceToRound2();
  },

  async getSessionState(): Promise<SessionState | null> {
    const native = ensureNative();
    return native.getSessionState();
  },

  async getCapturedImages(): Promise<CapturedImage[]> {
    const native = ensureNative();
    return native.getCapturedImages();
  },

  async getCurrentHeading(): Promise<{ heading: number | null; pitch: number | null }> {
    const native = ensureNative();
    return native.getCurrentHeading();
  },

  /** Khả-năng cam: có đèn / có lens 0.5x. Máy cũ (thiếu method) → cả hai false. */
  async getCameraCapabilities(): Promise<{ hasTorch: boolean; supportsUltraWide: boolean }> {
    const fallback = { hasTorch: false, supportsUltraWide: false };
    if (!NativeBridge?.getCameraCapabilities) return fallback;
    try {
      return await NativeBridge.getCameraCapabilities();
    } catch {
      return fallback;
    }
  },

  /** Bật/tắt đèn pin. Trả trạng-thái THỰC (false nếu máy không có đèn / lỗi). */
  async setTorch(on: boolean): Promise<boolean> {
    if (!NativeBridge?.setTorch) return false;
    try {
      return await NativeBridge.setTorch(on);
    } catch {
      return false;
    }
  },

  /** Chuyển lens 0.5x (on) ↔ 1x (off). Trả trạng-thái THỰC đã áp. */
  async setUltraWide(on: boolean): Promise<boolean> {
    if (!NativeBridge?.setUltraWide) return false;
    try {
      return await NativeBridge.setUltraWide(on);
    } catch {
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Event Names
// ---------------------------------------------------------------------------

export const TreeReIDEventNames = {
  HEADING_UPDATE: 'onTreeReIDHeadingUpdate',
  CAPTURE_TRIGGERED: 'onTreeReIDCaptureTriggered',
  ROUND_COMPLETE: 'onTreeReIDRoundComplete',
  SESSION_COMPLETE: 'onTreeReIDSessionComplete',
  IDENTIFICATION_RESULT: 'onTreeReIDIdentificationResult',
  ERROR: 'onTreeReIDError',
} as const;

// ---------------------------------------------------------------------------
// Event Emitter
// ---------------------------------------------------------------------------

export const TreeReIDEvents = NativeBridge
  ? new NativeEventEmitter(NativeBridge as any)
  : null;

// ---------------------------------------------------------------------------
// Event Subscriptions
// ---------------------------------------------------------------------------

export function subscribeHeadingUpdate(handler: (e: HeadingUpdate) => void): () => void {
  if (!TreeReIDEvents) return () => {};
  const sub = TreeReIDEvents.addListener(TreeReIDEventNames.HEADING_UPDATE, handler);
  return () => sub.remove();
}

export function subscribeCaptureTriggered(handler: (e: CaptureTriggered) => void): () => void {
  if (!TreeReIDEvents) return () => {};
  const sub = TreeReIDEvents.addListener(TreeReIDEventNames.CAPTURE_TRIGGERED, handler);
  return () => sub.remove();
}

export function subscribeRoundComplete(handler: (e: RoundComplete) => void): () => void {
  if (!TreeReIDEvents) return () => {};
  const sub = TreeReIDEvents.addListener(TreeReIDEventNames.ROUND_COMPLETE, handler);
  return () => sub.remove();
}

export function subscribeSessionComplete(handler: (e: { sessionId: string; captures: CapturedImage[] }) => void): () => void {
  if (!TreeReIDEvents) return () => {};
  const sub = TreeReIDEvents.addListener(TreeReIDEventNames.SESSION_COMPLETE, handler);
  return () => sub.remove();
}

export function subscribeTreeReIDError(handler: (e: { code: string; message: string }) => void): () => void {
  if (!TreeReIDEvents) return () => {};
  const sub = TreeReIDEvents.addListener(TreeReIDEventNames.ERROR, handler);
  return () => sub.remove();
}

// ---------------------------------------------------------------------------
// Cleanup Helper
// ---------------------------------------------------------------------------

export function unsubscribeAll(): void {
  if (TreeReIDEvents) {
    TreeReIDEvents.removeAllListeners(TreeReIDEventNames.HEADING_UPDATE);
    TreeReIDEvents.removeAllListeners(TreeReIDEventNames.CAPTURE_TRIGGERED);
    TreeReIDEvents.removeAllListeners(TreeReIDEventNames.ROUND_COMPLETE);
    TreeReIDEvents.removeAllListeners(TreeReIDEventNames.SESSION_COMPLETE);
    TreeReIDEvents.removeAllListeners(TreeReIDEventNames.ERROR);
  }
}
