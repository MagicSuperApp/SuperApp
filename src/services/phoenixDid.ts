export const PHOENIX_DID_RE = /^did:phoenix:[a-z2-7]+:[0-9a-f]{64}$/;
export const CARDANO_DID_RE = /^did:cardano:(mainnet|preprod|preview):[0-9a-f]{64}$/;

export type CardanoNetwork = 'mainnet' | 'preprod' | 'preview';

/**
 * Lấy mạng Cardano TỪ chính DID (định danh thật), không đoán.
 * - did:cardano:<network>:<hash> → network nằm thẳng trong chuỗi DID.
 * - did:phoenix:<slot>:<hash>   → mạng KHÔNG nằm trong chuỗi (phải hỏi backend),
 *   trả null để caller resolve qua /document hoặc fallback env.
 */
export function parseDidNetwork(
  did: string | null | undefined,
): CardanoNetwork | null {
  if (typeof did !== 'string') return null;
  const m = CARDANO_DID_RE.exec(did);
  return m ? (m[1] as CardanoNetwork) : null;
}

export function isCanonicalPhoenixDid(did: string | null | undefined): did is string {
  return typeof did === 'string' && PHOENIX_DID_RE.test(did);
}

export function isLegacyCardanoDid(did: string | null | undefined): did is string {
  return typeof did === 'string' && CARDANO_DID_RE.test(did);
}

export function isSupportedBackendDid(did: string | null | undefined): did is string {
  return isCanonicalPhoenixDid(did) || isLegacyCardanoDid(did);
}

export function isMalformedPhoenixDid(did: string | null | undefined): boolean {
  return typeof did === 'string' && did.startsWith('did:phoenix:') && !isCanonicalPhoenixDid(did);
}

export function assertSupportedBackendDid(did: string, context = 'PhoenixKey DID'): string {
  if (!isSupportedBackendDid(did)) {
    throw new Error(`${context} không đúng định dạng backend: ${did}`);
  }
  return did;
}
