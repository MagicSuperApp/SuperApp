/**
 * Cryptography Utilities (Mock)
 * Real implementation would use native crypto (e.g., libsodium)
 */

// React Native provides `Buffer` via its polyfill and `btoa`/`atob` as runtime
// globals, but the project's tsconfig omits the node/DOM libs. Declare them here
// so the type-checker matches the actual runtime surface.
declare const Buffer:
  | {
      from(data: string, encoding?: string): { toString(encoding?: string): string };
    }
  | undefined;
declare function btoa(data: string): string;
declare function atob(data: string): string;

/**
 * Generate mock signature using simple hash
 * Real SDK would use Ed25519 or similar
 */
export const generateMockSignature = (data: string): string => {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `sig_${Math.abs(hash).toString(16)}_${Date.now()}`;
};

/**
 * Generate nonce (number used once) for replay attack prevention
 */
export const generateNonce = (): string => {
  return `nonce_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Mock hash function (SHA256-like)
 * Real implementation would use proper crypto library
 */
export const hashData = (data: string): string => {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16).padStart(16, '0')}`;
};

/**
 * Mock base64 encoding
 */
export const encodeBase64 = (data: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  // Fallback for browser
  return btoa(data);
};

/**
 * Mock base64 decoding
 */
export const decodeBase64 = (encoded: string): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(encoded, 'base64').toString('utf8');
  }
  // Fallback for browser
  return atob(encoded);
};
