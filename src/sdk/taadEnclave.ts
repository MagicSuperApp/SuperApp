/**
 * TaadEnclave — JS wrapper cho Rust core `taad_enclave_core` (PhoenixKey Enclave).
 *
 * Native module `TaadEnclaveModule` (iOS Swift + Android Kotlin) gọi vào Rust FFI:
 *   - iOS:     ios/LocalPods/ScannerModule/Core/Enclave/TaadEnclaveModule.swift
 *              → import taad_enclave_core (pod, libtaad_enclave_core.a + cbindgen .h)
 *   - Android: android/.../TaadEnclaveModule.kt → System.loadLibrary + JNI shim
 *              (rust/taad_enclave_core/src/android_jni.rs)
 *
 * Phase 1 — seed/Master_KEK (BIP39 24 từ):
 *   generateMasterKek()        → 64-hex Master_KEK ngẫu nhiên (256-bit entropy)
 *   masterKekToMnemonic(kek)   → cụm 24 từ BIP39 (= bản sao lưu KEK)
 *   mnemonicToMasterKek(words) → 64-hex KEK (ném nếu cụm từ sai checksum/wordlist)
 *
 * Phase 2 — OrgDID + mint LAMP (bản B canonical, xem rust/taad_enclave_core/
 * src/mint_lamp.rs + registry_mint.rs, đồng bộ từ PhoenixKey-Core commit 2c63ad7):
 *   constructDid / anchorAssetName / deriveTaadPublicKey / deriveWalletSeed /
 *   deriveCardanoAddress — helper suy khoá/địa chỉ/DID, KHÔNG build tx.
 *   buildCreateChildTaadUtxoTx  → tạo OrgDID (GenesisChild, owner ký).
 *   buildMintLampViaDid         → ký tx mint LAMP (Registry-gate + SupplyState + KHO).
 *
 * SECURITY: Master_KEK / 24 từ TƯƠNG ĐƯƠNG gốc-tin-cậy. KHÔNG log/persist thô;
 * chỉ hiển thị 1 lần cho người dùng tự lưu (xem SeedExportScreen). Wallet seed /
 * TAAD pubkey suy TRONG RAM lúc cần, KHÔNG cache lại.
 */

import { NativeModules, Platform } from 'react-native';

/** Shape `UtxoInput` (khớp `taad_did.rs`/`mint_lamp.rs` Rust — SỐ, không phải chuỗi). */
export interface UtxoInput {
  tx_hash: string;
  index: number;
  amount_lovelace: number;
  assets: Array<{ policy_id: string; asset_name_hex: string; quantity: number }>;
}

/** UTxO owner hiện sống — dùng làm reference input khi tạo child DID. */
export interface OwnerUtxoRef {
  tx_hash: string;
  index: number;
  amount_lovelace: number;
  assets: Array<{ policy_id: string; asset_name_hex: string; quantity: number }>;
}

/** UTxO Registry — chỉ giữ field builder cần (tx_hash/index/inline_datum_hex). */
export interface RegistryUtxoRef {
  tx_hash: string;
  index: number;
  inline_datum_hex: string;
}

/** UTxO SupplyState — SPEND (redeemer Advance), builder decode datum tại Rust. */
export interface SupplyStateUtxoRef {
  tx_hash: string;
  index: number;
  amount_lovelace: number;
  assets: Array<{ policy_id: string; asset_name_hex: string; quantity: number }>;
  inline_datum_hex: string;
}

/** UTxO KHO — reference input, `address` = A-DEST nơi Δ LAMP rót vào. */
export interface KhoUtxoRef {
  tx_hash: string;
  index: number;
  address: string;
}

/** `mint_json` — Δ oil cần mint (token_name_hex bake sẵn trong lamp_mint đã deploy). */
export interface MintInstruction {
  token_name_hex: string;
  amount: number;
}

interface TaadEnclaveNativeBridge {
  generateMasterKek(): Promise<string>;
  masterKekToMnemonic(kekHex: string): Promise<string>;
  mnemonicToMasterKek(words: string): Promise<string>;
  constructDid(typeByte: number, creatorDid: string, slot: number): Promise<string>;
  anchorAssetName(did: string): Promise<string>;
  deriveTaadPublicKey(masterKekHex: string): Promise<string>;
  deriveWalletSeed(masterKekHex: string): Promise<string>;
  deriveCardanoAddress(walletSeedHex: string, network: number): Promise<string>;
  buildCreateChildTaadUtxoTx(
    childDid: string,
    ownerDid: string,
    entityType: number,
    hwPubHex: string,
    childTaadPubHex: string,
    ownerMasterKekHex: string,
    walletSeedHex: string,
    network: number,
    taadScriptCborHex: string,
    policyIdHex: string,
    ownerUtxoJson: string,
    utxoInputsJson: string,
    protocolParamsJson: string,
    currentSlot: number,
  ): Promise<string>;
  buildMintLampViaDid(
    authorityKeksJson: string,
    registryUtxoJson: string,
    tokenTagHex: string,
    supplyStateUtxoJson: string,
    supplyStateScriptCbor: string,
    khoUtxoJson: string,
    lampPolicyCborHex: string,
    mintJson: string,
    utxosJson: string,
    protocolParamsJson: string,
    walletSeedHex: string,
    network: number,
    currentSlot: number,
  ): Promise<string>;
}

const moduleNotAvailable = (): TaadEnclaveNativeBridge => {
  const reject = (method: string) =>
    Promise.reject(
      new Error(
        `TaadEnclave native module not available on ${Platform.OS}. ` +
          `Method '${method}' requires the Rust core (taad_enclave_core).`,
      ),
    );
  return {
    generateMasterKek: () => reject('generateMasterKek') as never,
    masterKekToMnemonic: () => reject('masterKekToMnemonic') as never,
    mnemonicToMasterKek: () => reject('mnemonicToMasterKek') as never,
    constructDid: () => reject('constructDid') as never,
    anchorAssetName: () => reject('anchorAssetName') as never,
    deriveTaadPublicKey: () => reject('deriveTaadPublicKey') as never,
    deriveWalletSeed: () => reject('deriveWalletSeed') as never,
    deriveCardanoAddress: () => reject('deriveCardanoAddress') as never,
    buildCreateChildTaadUtxoTx: () => reject('buildCreateChildTaadUtxoTx') as never,
    buildMintLampViaDid: () => reject('buildMintLampViaDid') as never,
  };
};

const bridge: TaadEnclaveNativeBridge =
  NativeModules.TaadEnclaveModule
    ? (NativeModules.TaadEnclaveModule as TaadEnclaveNativeBridge)
    : moduleNotAvailable();

/** True khi native bridge (Rust core) sẵn sàng trên nền-tảng hiện tại. */
export const isAvailable = (): boolean => !!NativeModules.TaadEnclaveModule;

/** Sinh Master_KEK 256-bit ngẫu nhiên → 64-hex. */
export const generateMasterKek = (): Promise<string> => bridge.generateMasterKek();

/** Master_KEK (64-hex) → cụm 24 từ BIP39. */
export const masterKekToMnemonic = (kekHex: string): Promise<string> =>
  bridge.masterKekToMnemonic(kekHex);

/** Cụm 24 từ BIP39 → Master_KEK (64-hex). Reject nếu cụm từ không hợp lệ. */
export const mnemonicToMasterKek = (words: string): Promise<string> =>
  bridge.mnemonicToMasterKek(words.trim().replace(/\s+/g, ' ').toLowerCase());

/**
 * Dựng chuỗi DID (`did:phoenix:...`). `typeByte`: 1..9 = Org..Character (0 =
 * root Person — KHÔNG dùng cho OrgDID). `creatorDid` = '' cho root identity.
 * `slot` = slot tip hiện tại (fetch từ chain-data trước khi gọi).
 */
export const constructDid = (
  typeByte: number,
  creatorDid: string,
  slot: number,
): Promise<string> => bridge.constructDid(typeByte, creatorDid, slot);

/** Asset-name hex (blake2b_256(did)) — tra Registry-NFT/anchor NFT qua Blockfrost. */
export const anchorAssetName = (did: string): Promise<string> => bridge.anchorAssetName(did);

/** TAAD_Key (controller) Ed25519 pubkey hex, suy từ Master_KEK (derive_taad_seed). */
export const deriveTaadPublicKey = (masterKekHex: string): Promise<string> =>
  bridge.deriveTaadPublicKey(masterKekHex);

/** Ví seed (32-byte entropy CIP-1852, hex) suy từ Master_KEK. */
export const deriveWalletSeed = (masterKekHex: string): Promise<string> =>
  bridge.deriveWalletSeed(masterKekHex);

/** Địa chỉ ví account-0 (phí + collateral + change) từ ví seed. 0=testnet, 1=mainnet. */
export const deriveCardanoAddress = (walletSeedHex: string, network: number): Promise<string> =>
  bridge.deriveCardanoAddress(walletSeedHex, network);

/** Tham số tạo OrgDID — khớp 1:1 `taad_build_create_child_taad_utxo_tx` (Rust). */
export interface BuildCreateChildTaadUtxoTxParams {
  childDid: string;
  ownerDid: string;
  /** 1..9 (1=Org..9=Character). CẤM 0 (Person) — G-4. */
  entityType: number;
  /** HW_Key con (P-256, 32-byte/64-hex — vd public key từ PhoenixKeyModule.generateKeypair). */
  hwPubHex: string;
  /** TAAD_Key con (Ed25519 pubkey, suy từ Master_KEK con qua deriveTaadPublicKey). */
  childTaadPubHex: string;
  /** Master_KEK của OWNER — ký thay con (con KHÔNG ký genesis). */
  ownerMasterKekHex: string;
  /** Ví seed OWNER (account 0) — trả phí + collateral + change. */
  walletSeedHex: string;
  /** 0=preprod/preview (testnet id rust), 1=mainnet. */
  network: number;
  taadScriptCborHex: string;
  policyIdHex: string;
  ownerUtxo: OwnerUtxoRef;
  utxos: UtxoInput[];
  protocolParams: unknown;
  currentSlot: number;
}

/**
 * Tạo CHILD DID (OrgDID) on-chain qua cổng `GenesisChild`. Owner ký (con KHÔNG
 * ký genesis); UTxO owner đưa vào làm REFERENCE input, KHÔNG tiêu.
 * Trả hex signed tx CBOR — caller (chain-data/submit service) evaluate+submit.
 */
export const buildCreateChildTaadUtxoTx = (
  p: BuildCreateChildTaadUtxoTxParams,
): Promise<string> =>
  bridge.buildCreateChildTaadUtxoTx(
    p.childDid,
    p.ownerDid,
    p.entityType,
    p.hwPubHex,
    p.childTaadPubHex,
    p.ownerMasterKekHex,
    p.walletSeedHex,
    p.network,
    p.taadScriptCborHex,
    p.policyIdHex,
    JSON.stringify(p.ownerUtxo),
    JSON.stringify(p.utxos),
    JSON.stringify(p.protocolParams),
    p.currentSlot,
  );

/** Tham số mint LAMP — khớp 1:1 `taad_build_mint_lamp_via_did` (Rust, bản B). */
export interface BuildMintLampViaDidParams {
  /** MVP SinglePkh: mảng 1 phần tử = Master_KEK controller OrgDID. MultiSig: ≥ threshold. */
  authorityKeks: string[];
  registryUtxo: RegistryUtxoRef;
  /** Token tag bake trong lamp_mint đã deploy (KHÔNG phải lựa chọn tự do). */
  tokenTagHex: string;
  supplyStateUtxo: SupplyStateUtxoRef;
  supplyStateScriptCborHex: string;
  khoUtxo: KhoUtxoRef;
  lampPolicyCborHex: string;
  mint: MintInstruction;
  utxos: UtxoInput[];
  protocolParams: unknown;
  walletSeedHex: string;
  network: number;
  currentSlot: number;
}

/**
 * Ký tx MINT LAMP theo cổng on-chain THẬT (bản B — Registry-gate + SupplyState
 * cap + A-DEST kho). Registry + KHO là reference input (KHÔNG tiêu); SupplyState
 * bị spend + tái tạo (dist_minted += Δ). Toàn bộ LAMP rót vào KHO, KHÔNG ra ví.
 * Trả hex signed tx CBOR — caller PHẢI evaluate-then-submit (xem
 * `src/services/phoenixChainData.ts`).
 */
export const buildMintLampViaDid = (p: BuildMintLampViaDidParams): Promise<string> =>
  bridge.buildMintLampViaDid(
    JSON.stringify(p.authorityKeks),
    JSON.stringify(p.registryUtxo),
    p.tokenTagHex,
    JSON.stringify(p.supplyStateUtxo),
    p.supplyStateScriptCborHex,
    JSON.stringify(p.khoUtxo),
    p.lampPolicyCborHex,
    JSON.stringify(p.mint),
    JSON.stringify(p.utxos),
    JSON.stringify(p.protocolParams),
    p.walletSeedHex,
    p.network,
    p.currentSlot,
  );

export default {
  isAvailable,
  generateMasterKek,
  masterKekToMnemonic,
  mnemonicToMasterKek,
  constructDid,
  anchorAssetName,
  deriveTaadPublicKey,
  deriveWalletSeed,
  deriveCardanoAddress,
  buildCreateChildTaadUtxoTx,
  buildMintLampViaDid,
};
