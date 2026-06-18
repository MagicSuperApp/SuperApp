import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// Platform-specific native modules
// iOS: ScannerModule (from LocalPods/ScannerModule)
// Android: OriLifeModule (from android/app/.../OriLifeModule.kt)
const NativeScanner = Platform.select({
  ios: NativeModules.ScannerModule,
  android: NativeModules.OriLifeModule,
});

// iOS uses ScannerBridgeModule for events, Android uses OriLifeModule
const NativeEventModule = Platform.select({
  ios: NativeModules.ScannerBridgeModule,
  android: NativeModules.OriLifeModule,
});

export const EVENTS = {
  /** Emitted when scan completes successfully — contains tree IDs (Android) */
  SCAN_COMPLETE: 'onScanComplete',
  /** Emitted when an error occurs during scanning */
  SCAN_ERROR: 'onScanError',
  /** Emitted during upload progress */
  UPLOAD_PROGRESS: 'onUploadProgress',
  /** iOS: Emitted when circular capture completes */
  CAPTURE_COMPLETE: 'onCaptureComplete',
  /** iOS: Emitted when upload completes */
  UPLOAD_COMPLETE: 'onUploadComplete',
  /**
   * Build 52 — Emitted per frame during capture session.
   * Payload: SlotUpdateData. Native side emits event
   * mỗi khi classify xong slot cho frame mới hoặc re-evaluate quality.
   */
  SLOT_UPDATE: 'onSlotUpdate',
} as const;

export interface ScanCompleteData {
  /** Array of tree IDs from the circular capture session */
  treeIds: string[];
  /** Number of trees captured */
  count: number;
}

export interface ScanErrorData {
  /** Human-readable error message */
  error: string;
}

export interface UploadProgressData {
  /** Number of images uploaded so far */
  progress: number;
  /** Total number of images to upload */
  total: number;
}

/**
 * Build 52 — Per-frame slot classification event payload.
 *
 * status:
 *   'captured' — đã chụp đủ chất lượng cho slot này
 *   'warning'  — đã chụp nhưng cần làm lại (blur, exposure, low-confidence)
 *   'empty'    — explicit reset / quality regression cho slot
 *
 * slotKey format: `${HorizontalSlot}-${VerticalSlot}` (e.g. "E-mid").
 */
export interface SlotUpdateData {
  sessionId: string;
  slotKey: string;
  status: 'captured' | 'warning' | 'empty';
  frameIndex: number;
}

export interface ScannerOptions {
  /** Detection mode: 'single' or 'circular' (default: 'circular') */
  mode?: 'single' | 'circular';
  /** Scan target: 'tree' (15 sectors, trunk/branch) or 'fruit' (8 sectors, durian) */
  scanMode?: 'tree' | 'fruit';
  /** Virtual ID for this scanning session */
  virtualId?: string;
  /** Farm ID - passed to scanner and returned when scan completes */
  farm_id?: string;
  /** Region code for tree registration (e.g. 'VN-68') */
  region_code?: string;
}

export interface ScannerManagerType {
  /** Initialize the scanner — loads model, DB, security layer */
  initialize: () => Promise<string>;
  /** Launch full-screen native scanner activity */
  startScanner: (options?: ScannerOptions) => Promise<string>;
  /** Stop the active scanner activity */
  stopScanner: () => Promise<string>;
  /** Release scanner resources */
  release: () => Promise<string>;
  /** Get count of pending uploads in the offline queue */
  getPendingUploadCount: () => Promise<number>;
}

class ScannerManager implements ScannerManagerType {
  private eventEmitter: NativeEventEmitter | null = null;
  private listeners: Map<string, any> = new Map();

  constructor() {
    if (NativeEventModule) {
      this.eventEmitter = new NativeEventEmitter(NativeEventModule);
    }
  }

  // ── Event subscription ─────────────────────────────────────────────────────

  /**
   * Subscribe to scanner events.
   * Recommended: call in useEffect, unsubscribe on unmount.
   *
   * @example
   * useEffect(() => {
   *   const sub = ScannerSDK.addListener(EVENTS.SCAN_COMPLETE, handleScanComplete);
   *   return () => sub.remove();
   * }, []);
   */
  addListener(
    event: (typeof EVENTS)[keyof typeof EVENTS],
    callback: (data: any) => void,
  ): { remove: () => void } {
    if (!this.eventEmitter) {
      console.warn('[ScannerSDK] Native event module not available — events disabled');
      return { remove: () => {} };
    }
    const subscription = this.eventEmitter.addListener(event, callback);
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(subscription);
    return subscription;
  }

  removeListener(event: string): void {
    if (this.listeners.has(event)) {
      const subs = this.listeners.get(event);
      subs?.forEach((sub: any) => sub.remove?.());
      this.listeners.delete(event);
    }
  }

  removeAllListeners(): void {
    this.listeners.forEach((subs: any[]) => {
      subs.forEach((sub: any) => sub.remove?.());
    });
    this.listeners.clear();
  }

  // ── Native method wrappers ─────────────────────────────────────────────────

  async initialize(): Promise<string> {
    if (!NativeScanner) {
      throw new Error('Native scanner module not available — check native module registration');
    }

    // iOS requires explicit initialize() call, Android auto-initializes
    if (Platform.OS === 'ios') {
      return NativeScanner.initialize();
    }

    // Android: OriLifeModule doesn't have initialize method, return success
    return Promise.resolve('Scanner initialized (Android)');
  }

  /**
   * Launch the native scanner activity (full-screen camera + YOLO + circular capture).
   *
   * iOS: Presents ScannerViewController modally
   * Android: Launches MainActivity (full-screen activity)
   *
   * Results are sent back via the `onScanComplete` event when finished.
   */
  async startScanner(options?: ScannerOptions): Promise<string> {
    if (!NativeScanner) {
      throw new Error('Native scanner module not available — check native module registration');
    }

    if (Platform.OS === 'ios') {
      // iOS: ScannerModule.startScanning(options)
      return NativeScanner.startScanning(options || {});
    }

    // Android: OriLifeModule.startScanner(options)
    return NativeScanner.startScanner(options ?? null);
  }

  async stopScanner(): Promise<string> {
    if (!NativeScanner) {
      throw new Error('Native scanner module not available');
    }

    if (Platform.OS === 'ios') {
      // iOS: ScannerModule.stopScanning()
      return NativeScanner.stopScanning();
    }

    // Android: OriLifeModule.stopScanner()
    return NativeScanner.stopScanner();
  }

  async release(): Promise<string> {
    if (!NativeScanner) {
      throw new Error('Native scanner module not available');
    }

    if (Platform.OS === 'ios') {
      // iOS: ScannerModule.release()
      return NativeScanner.release();
    }

    // Android: OriLifeModule.release() - may not exist
    if (NativeScanner.release) {
      return NativeScanner.release();
    }

    return Promise.resolve('Scanner released (Android)');
  }

  async getPendingUploadCount(): Promise<number> {
    if (!NativeScanner) {
      return 0;
    }

    // Both iOS and Android have this method
    if (NativeScanner.getPendingUploadCount) {
      return NativeScanner.getPendingUploadCount();
    }

    return 0;
  }
}

export const ScannerSDK = new ScannerManager();
