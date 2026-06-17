import { useEffect, useState, useCallback } from 'react';
import {
  ScannerSDK,
  EVENTS,
  ScanCompleteData,
  ScanErrorData,
  SlotUpdateData,
} from './ScannerSDK';

export interface UseScannerOptions {
  /** Fired when a circular capture session completes (native onScanComplete). */
  onScanComplete?: (data: ScanCompleteData) => void;
  /** Fired per-frame as slots are classified during capture (native onSlotUpdate). */
  onSlotUpdate?: (data: SlotUpdateData) => void;
  /** Fired on scan/initialization errors. */
  onError?: (error: string) => void;
  autoStart?: boolean;
}

/**
 * React hook around ScannerSDK. Mirrors the actual native event/method surface
 * (onScanComplete / onScanError / onSlotUpdate, startScanner / stopScanner).
 */
export const useScanner = (options: UseScannerOptions = {}) => {
  const { onScanComplete, onSlotUpdate, onError, autoStart = false } = options;
  const [isRunning, setIsRunning] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize scanner and setup listeners - single unified effect
  useEffect(() => {
    let isMounted = true;

    const initializeScanner = async () => {
      try {
        await ScannerSDK.initialize();
        if (isMounted) {
          setIsInitialized(true);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to initialize scanner';
        if (isMounted) {
          setError(errorMsg);
          if (onError) onError(errorMsg);
        }
      }
    };

    const setupListeners = () => {
      if (onScanComplete) {
        ScannerSDK.addListener(EVENTS.SCAN_COMPLETE, (data: ScanCompleteData) => {
          onScanComplete(data);
        });
      }

      if (onSlotUpdate) {
        ScannerSDK.addListener(EVENTS.SLOT_UPDATE, (data: SlotUpdateData) => {
          onSlotUpdate(data);
        });
      }

      // Errors are surfaced both to the hook state and the optional callback.
      ScannerSDK.addListener(EVENTS.SCAN_ERROR, (data: ScanErrorData) => {
        const msg = data?.error || 'Scan error';
        if (isMounted) setError(msg);
        if (onError) onError(msg);
      });
    };

    initializeScanner();
    setupListeners();

    return () => {
      isMounted = false;
      ScannerSDK.removeAllListeners();
    };
  }, [onScanComplete, onSlotUpdate, onError]);

  const startScanning = useCallback(async () => {
    if (!isInitialized) {
      setError('Scanner not initialized');
      return;
    }
    try {
      await ScannerSDK.startScanner();
      setIsRunning(true);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start scanning';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    }
  }, [isInitialized, onError]);

  // Auto start if requested
  useEffect(() => {
    if (autoStart && isInitialized && !isRunning) {
      startScanning();
    }
  }, [isInitialized, autoStart, isRunning, startScanning]);

  const stopScanning = useCallback(async () => {
    try {
      await ScannerSDK.stopScanner();
      setIsRunning(false);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop scanning';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    }
  }, [onError]);

  const release = useCallback(async () => {
    try {
      await ScannerSDK.release();
      setIsRunning(false);
      setIsInitialized(false);
      setError(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to release scanner';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    }
  }, [onError]);

  return {
    isRunning,
    isInitialized,
    error,
    startScanning,
    stopScanning,
    release,
  };
};
