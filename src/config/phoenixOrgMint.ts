/**
 * Config cho module "tạo OrgDID + mint LAMP" (`src/modules/phoenixOrgMint`).
 *
 * TẤT CẢ giá trị dưới đây là artifact deploy on-chain THẬT (policy-id/CBOR
 * script/asset-name) — KHÔNG hard-code trong code, đọc từ `.env` (react-native-
 * dotenv, cùng quy ước `src/config/phoenixWallet.ts`). Thiếu config → màn hình
 * PHẢI chặn rõ (xem `getMissingOrgMintConfig`), TUYỆT ĐỐI không build tx với
 * giá trị rỗng/giả (audit finding: "thiếu config thì màn chặn rõ, không build
 * tx sai âm thầm").
 *
 * Nguồn artifact: LAMP Genesis deploy (bản B canonical) — xin từ đội LAMP khi
 * Preview/preprod deploy xong (xem PhoenixKey-Core `.env` cùng bộ khoá để đối
 * chiếu, KHÔNG tự đoán giá trị).
 */

// @ts-ignore — provided by react-native-dotenv at build time.
import {
  PHOENIX_ORG_MINT_ENABLED,
  BLOCKFROST_KEY,
  CARDANO_NETWORK,
  TAAD_SCRIPT_CBOR_HEX,
  TAAD_POLICY_ID_HEX,
  LAMP_POLICY_CBOR_HEX,
  SUPPLY_STATE_SCRIPT_CBOR_HEX,
  REGISTRY_NFT_POLICY_ID,
  THREAD_NFT_POLICY_ID,
  THREAD_NFT_NAME_HEX,
  KHO_NFT_POLICY_ID,
  KHO_NFT_NAME_HEX,
  LAMP_TOKEN_TAG_HEX,
  LAMP_TOKEN_NAME_HEX,
} from '@env';

/** Cờ bật/tắt module — mặc định false cho tới khi artifact deploy sẵn sàng. */
export function isPhoenixOrgMintEnabled(): boolean {
  return String(PHOENIX_ORG_MINT_ENABLED ?? '').toLowerCase() === 'true';
}

/** networkId Blockfrost nội bộ: 0=preprod (mặc định), 1=mainnet, 2=preview. */
export function chainNetworkId(): 0 | 1 | 2 {
  const n = String(CARDANO_NETWORK ?? 'preprod').toLowerCase();
  if (n === 'mainnet') return 1;
  if (n === 'preview') return 2;
  return 0;
}

/** network id truyền cho Rust builder: 0=testnet (preprod VÀ preview), 1=mainnet. */
export function rustNetworkId(): 0 | 1 {
  return chainNetworkId() === 1 ? 1 : 0;
}

export interface PhoenixOrgMintConfig {
  blockfrostKey: string;
  taadScriptCborHex: string;
  taadPolicyIdHex: string;
  lampPolicyCborHex: string;
  supplyStateScriptCborHex: string;
  registryNftPolicyId: string;
  threadNftPolicyId: string;
  threadNftNameHex: string;
  khoNftPolicyId: string;
  khoNftNameHex: string;
  lampTokenTagHex: string;
  lampTokenNameHex: string;
}

export function getPhoenixOrgMintConfig(): PhoenixOrgMintConfig {
  return {
    blockfrostKey: String(BLOCKFROST_KEY ?? ''),
    taadScriptCborHex: String(TAAD_SCRIPT_CBOR_HEX ?? ''),
    taadPolicyIdHex: String(TAAD_POLICY_ID_HEX ?? ''),
    lampPolicyCborHex: String(LAMP_POLICY_CBOR_HEX ?? ''),
    supplyStateScriptCborHex: String(SUPPLY_STATE_SCRIPT_CBOR_HEX ?? ''),
    registryNftPolicyId: String(REGISTRY_NFT_POLICY_ID ?? ''),
    threadNftPolicyId: String(THREAD_NFT_POLICY_ID ?? ''),
    threadNftNameHex: String(THREAD_NFT_NAME_HEX ?? ''),
    khoNftPolicyId: String(KHO_NFT_POLICY_ID ?? ''),
    khoNftNameHex: String(KHO_NFT_NAME_HEX ?? ''),
    lampTokenTagHex: String(LAMP_TOKEN_TAG_HEX ?? ''),
    lampTokenNameHex: String(LAMP_TOKEN_NAME_HEX ?? ''),
  };
}

/** Tên biến .env thiếu, cần cho luồng TẠO OrgDID (genesis child). */
export function getMissingCreateOrgConfig(): string[] {
  const c = getPhoenixOrgMintConfig();
  const missing: string[] = [];
  if (!c.blockfrostKey) missing.push('BLOCKFROST_KEY');
  if (!c.taadScriptCborHex) missing.push('TAAD_SCRIPT_CBOR_HEX');
  if (!c.taadPolicyIdHex) missing.push('TAAD_POLICY_ID_HEX');
  return missing;
}

/** Tên biến .env thiếu, cần cho luồng MINT LAMP (bản B). */
export function getMissingMintConfig(): string[] {
  const c = getPhoenixOrgMintConfig();
  const missing: string[] = [];
  if (!c.blockfrostKey) missing.push('BLOCKFROST_KEY');
  if (!c.lampPolicyCborHex) missing.push('LAMP_POLICY_CBOR_HEX');
  if (!c.supplyStateScriptCborHex) missing.push('SUPPLY_STATE_SCRIPT_CBOR_HEX');
  if (!c.registryNftPolicyId) missing.push('REGISTRY_NFT_POLICY_ID');
  if (!c.threadNftPolicyId) missing.push('THREAD_NFT_POLICY_ID');
  if (!c.threadNftNameHex) missing.push('THREAD_NFT_NAME_HEX');
  if (!c.khoNftPolicyId) missing.push('KHO_NFT_POLICY_ID');
  if (!c.khoNftNameHex) missing.push('KHO_NFT_NAME_HEX');
  if (!c.lampTokenTagHex) missing.push('LAMP_TOKEN_TAG_HEX');
  if (!c.lampTokenNameHex) missing.push('LAMP_TOKEN_NAME_HEX');
  return missing;
}
