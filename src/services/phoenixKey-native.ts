/**
 * PhoenixKey native bridge — typed wrapper around the hardware-key module.
 *
 * Cả hai nền-tảng đã có native module (cùng tên `PhoenixKeyModule`, cùng hợp-đồng:
 * EC P-256 / SHA256withECDSA, pubkey `04||X||Y` hex, sign trả HEX của DER):
 *   - Android: `android/app/src/main/java/com/aladincontract/company/PhoenixKeyModule.kt`
 *     (Android Keystore + BiometricPrompt)
 *   - iOS:     `ios/LocalPods/ScannerModule/UI/PhoenixKeyModule.swift`
 *     (Secure Enclave + LocalAuthentication)
 *
 * Nếu module vắng mặt (nền-tảng chưa build), các hàm reject "not available" để caller
 * fallback an-toàn (xem isAvailable()).
 */

import { NativeModules, Platform } from 'react-native';

interface PhoenixKeyNativeBridge {
  generateKeypair(
    alias: string,
    requireBiometric: boolean,
  ): Promise<{ alias: string; publicKeyHex: string }>;
  getPublicKeyHex(alias: string): Promise<string>;
  hasKey(alias: string): Promise<boolean>;
  deleteKey(alias: string): Promise<boolean>;
  sign(
    alias: string,
    dataHex: string,
    promptTitle: string,
    promptSubtitle: string | null,
  ): Promise<string>;
}

const moduleNotAvailable = (): PhoenixKeyNativeBridge => {
  const reject = (method: string) =>
    Promise.reject(
      new Error(
        `PhoenixKey native module not available on ${Platform.OS}. ` +
          `Method '${method}' requires the hardware-key bridge ` +
          `(Android Keystore / iOS Secure Enclave).`,
      ),
    );
  return {
    generateKeypair: () => reject('generateKeypair') as never,
    getPublicKeyHex: () => reject('getPublicKeyHex') as never,
    hasKey: () => reject('hasKey') as never,
    deleteKey: () => reject('deleteKey') as never,
    sign: () => reject('sign') as never,
  };
};

const bridge: PhoenixKeyNativeBridge =
  NativeModules.PhoenixKeyModule
    ? (NativeModules.PhoenixKeyModule as PhoenixKeyNativeBridge)
    : moduleNotAvailable();

/** Native error codes thrown by PhoenixKeyModule.kt — switch on these in UI. */
export const PhoenixKeyNativeError = {
  KEY_EXISTS: 'E_KEY_EXISTS',
  NO_KEY: 'E_NO_KEY',
  KEYGEN_FAILED: 'E_KEYGEN_FAILED',
  SIGN_INIT: 'E_SIGN_INIT',
  SIGN_AFTER_AUTH: 'E_SIGN_AFTER_AUTH',
  USER_CANCELED: 'E_USER_CANCELED',
  BIOMETRIC_LOCKOUT: 'E_BIOMETRIC_LOCKOUT',
  NO_ACTIVITY: 'E_NO_ACTIVITY',
} as const;

export type PhoenixKeyNativeErrorCode =
  (typeof PhoenixKeyNativeError)[keyof typeof PhoenixKeyNativeError];

export const generateKeypair = (
  alias: string,
  requireBiometric = true,
): Promise<{ alias: string; publicKeyHex: string }> =>
  bridge.generateKeypair(alias, requireBiometric);

export const getPublicKeyHex = (alias: string): Promise<string> =>
  bridge.getPublicKeyHex(alias);

export const hasKey = (alias: string): Promise<boolean> => bridge.hasKey(alias);

export const deleteKey = (alias: string): Promise<boolean> => bridge.deleteKey(alias);

export const sign = (
  alias: string,
  dataHex: string,
  promptTitle: string,
  promptSubtitle?: string,
): Promise<string> =>
  bridge.sign(alias, dataHex, promptTitle, promptSubtitle ?? null);

/** True when the native bridge is reachable on the current platform. */
export const isAvailable = (): boolean => !!NativeModules.PhoenixKeyModule;
