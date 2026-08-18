/**
 * TaadEnclave — JS wrapper cho Rust core `taad_enclave_core` (PhoenixKey Enclave).
 *
 * Native module `TaadEnclaveModule` (iOS Swift + Android Kotlin) gọi vào Rust FFI:
 *   - iOS:     ios/LocalPods/ScannerModule/Core/Enclave/TaadEnclaveModule.swift
 *              → import taad_enclave_core (pod, libtaad_enclave_core.a + cbindgen .h)
 *   - Android: android/.../TaadEnclaveModule.kt → System.loadLibrary + JNI shim
 *              (rust/taad_enclave_core/src/android_jni.rs)
 *
 * Phase 1 — chỉ seed/Master_KEK (BIP39 24 từ):
 *   generateMasterKek()        → 64-hex Master_KEK ngẫu nhiên (256-bit entropy)
 *   masterKekToMnemonic(kek)   → cụm 24 từ BIP39 (= bản sao lưu KEK)
 *   mnemonicToMasterKek(words) → 64-hex KEK (ném nếu cụm từ sai checksum/wordlist)
 *
 * SECURITY: Master_KEK / 24 từ TƯƠNG ĐƯƠNG gốc-tin-cậy. KHÔNG log/persist thô;
 * chỉ hiển thị 1 lần cho người dùng tự lưu (xem SeedExportScreen).
 */

import { NativeModules, Platform } from 'react-native';

interface TaadEnclaveNativeBridge {
  generateMasterKek(): Promise<string>;
  masterKekToMnemonic(kekHex: string): Promise<string>;
  mnemonicToMasterKek(words: string): Promise<string>;
  // Derive (composed, khớp Enclave)
  deriveTaadPubkey(kekHex: string): Promise<string>;
  deriveWalletSeed(kekHex: string): Promise<string>;
  deriveWalletAddress(kekHex: string, account: number, network: number): Promise<string>;
  deriveStakeAddress(kekHex: string, account: number, network: number): Promise<string>;
  // Ký proof-of-ownership /wallet/standard/register → JSON {"paymentPublicKeyHex","signature"}.
  signWalletRegister(kekHex: string, account: number, message: string): Promise<string>;
  // Dựng + ký tx Cardano (ADA/LAMP) → CBOR hex đã ký. amount* là chuỗi (u64 vượt bridge precision).
  buildSignedTransfer(
    kekHex: string, account: number, toAddress: string,
    amountLovelace: string, lampAmount: string,
    lampPolicyHex: string, lampAssetNameHex: string,
    utxosJson: string, protocolParamsJson: string, network: number,
  ): Promise<string>;
  // Dựng + ký tx uỷ thác stake vào 1 pool → CBOR hex đã ký.
  buildStakeDelegation(
    kekHex: string, account: number, poolBech32: string,
    utxosJson: string, protocolParamsJson: string, network: number,
  ): Promise<string>;
  // Witness (ký) tx CBOR đã dựng sẵn (GetLAMP) → CBOR hex đã ký.
  witnessUnsignedTx(kekHex: string, account: number, unsignedTxCborHex: string, network: number): Promise<string>;
  // Dựng + ký tx MINT LAMP bằng OrgDID (cổng Registry + SupplyState + A-DEST kho) → CBOR hex.
  buildMintLampViaDid(
    authorityKeksJson: string, registryUtxoJson: string, tokenTagHex: string,
    supplyStateUtxoJson: string, supplyStateScriptCbor: string, khoUtxoJson: string,
    lampPolicyCborHex: string, mintJson: string, utxosJson: string,
    protocolParamsJson: string, walletSeedHex: string,
    network: number, currentSlot: number,
  ): Promise<string>;
  // 2FA DeviceKey opt-in: sinh Ed25519 ngẫu nhiên + ký canonical → JSON {publicKeyHex,signature,secretHex}.
  deviceKeyOptin(userDid: string, nonce: string): Promise<string>;
  // Wrapping primitives
  generateSalt(): Promise<string>;
  pbkdf2Derive(pin: string, saltHex: string): Promise<string>;
  aesGcmEncrypt(keyHex: string, plaintextHex: string): Promise<string>;
  aesGcmDecrypt(keyHex: string, encryptedJson: string): Promise<string>;
  // Ký Ed25519 bằng TAAD_Key (từ Master_KEK) — recover-device, on-chain challenge.
  signEd25519(masterKekHex: string, message: string): Promise<string>;
  // Secure storage (Keychain iOS / Keystore-AES Android)
  secureStore(key: string, value: string): Promise<boolean>;
  secureLoad(key: string): Promise<string | null>;
  secureDelete(key: string): Promise<boolean>;
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
    deriveTaadPubkey: () => reject('deriveTaadPubkey') as never,
    deriveWalletSeed: () => reject('deriveWalletSeed') as never,
    deriveWalletAddress: () => reject('deriveWalletAddress') as never,
    deriveStakeAddress: () => reject('deriveStakeAddress') as never,
    signWalletRegister: () => reject('signWalletRegister') as never,
    buildSignedTransfer: () => reject('buildSignedTransfer') as never,
    buildStakeDelegation: () => reject('buildStakeDelegation') as never,
    witnessUnsignedTx: () => reject('witnessUnsignedTx') as never,
    buildMintLampViaDid: () => reject('buildMintLampViaDid') as never,
    deviceKeyOptin: () => reject('deviceKeyOptin') as never,
    generateSalt: () => reject('generateSalt') as never,
    pbkdf2Derive: () => reject('pbkdf2Derive') as never,
    aesGcmEncrypt: () => reject('aesGcmEncrypt') as never,
    aesGcmDecrypt: () => reject('aesGcmDecrypt') as never,
    signEd25519: () => reject('signEd25519') as never,
    secureStore: () => reject('secureStore') as never,
    secureLoad: () => reject('secureLoad') as never,
    secureDelete: () => reject('secureDelete') as never,
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

// ── Derive (composed, khớp Enclave) ───────────────────────────────────────────

/** TAAD_Key (Ed25519) pubkey hex từ Master_KEK. */
export const deriveTaadPubkey = (kekHex: string): Promise<string> =>
  bridge.deriveTaadPubkey(kekHex);

/** Wallet seed (32-byte hex) từ Master_KEK. */
export const deriveWalletSeed = (kekHex: string): Promise<string> =>
  bridge.deriveWalletSeed(kekHex);

/** Địa chỉ Cardano Shelley (Bech32). network: 0=preprod, 1=mainnet. account: 0=cố định, ≥1=hoạt động. */
export const deriveWalletAddress = (
  kekHex: string,
  account = 0,
  network = 0,
): Promise<string> => bridge.deriveWalletAddress(kekHex, account, network);

/**
 * Địa chỉ STAKE (reward) Cardano — bech32 `stake_test1…` (preprod) / `stake1…` (mainnet).
 * Cùng CIP-1852 với ví, chỉ khác nhánh role 2 (m/1852'/1815'/account'/2/0).
 * Dùng cho PhoenixKey `/wallet/standard/register` (field `stake_address`) + staking.
 * network: 0=preprod, 1=mainnet. account: 0=cố định, ≥1=hoạt động.
 */
export const deriveStakeAddress = (
  kekHex: string,
  account = 0,
  network = 0,
): Promise<string> => bridge.deriveStakeAddress(kekHex, account, network);

/** Proof-of-ownership cho ví Standard: pubkey + chữ ký payment key của `fixedAddress`. */
export interface WalletRegisterProof {
  paymentPublicKeyHex: string;
  signature: string;
}

/**
 * Ký challenge proof-of-ownership PhoenixKey `/wallet/standard/register` (Issue #47)
 * bằng PAYMENT key của `account` (từ Master_KEK). `message` = challenge canonical
 * (UTF-8) do caller dựng:
 *   "PHOENIXKEY_WALLET_STANDARD_REGISTER:" + userDid + ":" + fixedAddress + ":" + nonce
 * Trả { paymentPublicKeyHex (64 hex), signature (128 hex) }. Reject nếu KEK/seed sai.
 * KHÔNG lộ khoá — native chỉ trả pubkey + chữ-ký.
 */
export const signWalletRegister = async (
  kekHex: string,
  account: number,
  message: string,
): Promise<WalletRegisterProof> => {
  const json = await bridge.signWalletRegister(kekHex, account, message);
  const parsed = JSON.parse(json) as WalletRegisterProof;
  if (!parsed.paymentPublicKeyHex || !parsed.signature) {
    throw new Error('signWalletRegister: native trả thiếu pubkey/signature');
  }
  return parsed;
};

/**
 * Dựng + ký tx Cardano (ADA/LAMP) trong Enclave (Issue #74). Derive seed ví từ
 * Master_KEK trong native → build + witness → CBOR hex, KHÔNG lộ seed ra JS.
 * Kết quả submit qua `phoenixKeyApi.wallet.txSubmit(cbor)`.
 *
 * `amountLovelace`/`lampAmount` truyền dạng CHUỖI thập phân (u64 vượt precision của
 * cầu RN). `utxosJson`/`protocolParamsJson` = JSON THÔ Blockfrost (giữ snake_case —
 * đừng đưa qua axios camelCase interceptor). network: 0=preprod, 1=mainnet.
 */
export const buildSignedTransfer = async (args: {
  kekHex: string;
  account: number;
  toAddress: string;
  amountLovelace: string;
  lampAmount?: string;
  lampPolicyHex?: string;
  lampAssetNameHex?: string;
  utxosJson: string;
  protocolParamsJson: string;
  network: number;
}): Promise<string> => {
  const cbor = await bridge.buildSignedTransfer(
    args.kekHex,
    args.account,
    args.toAddress,
    args.amountLovelace,
    args.lampAmount ?? '0',
    args.lampPolicyHex ?? '',
    args.lampAssetNameHex ?? '',
    args.utxosJson,
    args.protocolParamsJson,
    args.network,
  );
  if (!cbor) {
    throw new Error('buildSignedTransfer: native trả rỗng (KEK/seed sai, UTXO trống, hoặc build lỗi)');
  }
  return cbor;
};

/**
 * Dựng + ký tx UỶ THÁC stake vào 1 pool trong Enclave. Cùng nguồn dữ-liệu với
 * buildSignedTransfer: `utxosJson`/`protocolParamsJson` = JSON THÔ Blockfrost.
 * `poolBech32` = pool id (`pool1...`). network: 0=preprod, 1=mainnet.
 * Kết quả submit qua `phoenixKeyApi.wallet.txSubmit(cbor)`.
 */
export const buildStakeDelegation = async (args: {
  kekHex: string;
  account: number;
  poolBech32: string;
  utxosJson: string;
  protocolParamsJson: string;
  network: number;
}): Promise<string> => {
  const cbor = await bridge.buildStakeDelegation(
    args.kekHex,
    args.account,
    args.poolBech32,
    args.utxosJson,
    args.protocolParamsJson,
    args.network,
  );
  if (!cbor) {
    throw new Error('buildStakeDelegation: native trả rỗng (KEK/seed sai, UTXO trống, hoặc build lỗi)');
  }
  return cbor;
};

/**
 * Witness (ký) tx CBOR ĐÃ DỰNG SẴN bằng payment key của account (GetLAMP §2). Dùng cho
 * luồng "BE build unsigned → client witness → BE submit". Trả CBOR hex đã ký (thêm vkey
 * witness vào witness-set có sẵn, không đụng body). network: 0=preprod, 1=mainnet.
 */
export const witnessUnsignedTx = async (
  kekHex: string,
  account: number,
  unsignedTxCborHex: string,
  network: number,
): Promise<string> => {
  const cbor = await bridge.witnessUnsignedTx(kekHex, account, unsignedTxCborHex, network);
  if (!cbor) {
    throw new Error('witnessUnsignedTx: native trả rỗng (KEK sai hoặc tx CBOR không hợp lệ)');
  }
  return cbor;
};

/**
 * Dựng + ký tx MINT LAMP bằng OrgDID — cổng on-chain THẬT (bản B): `supply_state`
 * (spend, cap) + `registry` (reference, AI được mint) + `lamp_mint` (mint, A-DEST).
 * Toàn bộ LAMP đúc ra rót vào KHO Distribution, **KHÔNG ra thẳng ví** — đưa về ví
 * là bước claim/vesting-release riêng.
 *
 * ⚠️ `authorityKeksHex` là mảng Master_KEK. SinglePkh cần ĐÚNG 1 khoá; MultiSig cần
 * đủ `threshold` khoá — nghĩa là **tất cả phải nằm trên chính máy này**. Mô hình m-of-n
 * mà mỗi người giữ khoá trên máy riêng thì đường này KHÔNG dùng được: phải có tầng gom
 * witness rời, chưa dựng. Đừng gọi hàm này cho ca đó rồi tưởng nó chạy.
 *
 * ⚠️ Master_KEK tương đương gốc-tin-cậy. Mảng này đi qua cầu RN dưới dạng chuỗi JSON —
 * KHÔNG log, KHÔNG lưu, KHÔNG gửi đi đâu.
 *
 * `*Json` là JSON THÔ (giữ snake_case — đừng cho qua interceptor camelCase của axios).
 * network: 0=preprod/preview, 1=mainnet. `currentSlot` = slot tip (TTL = slot + 7200).
 *
 * Ý nghĩa từng tham số: `rust/taad_enclave_core/src/lib.rs::taad_build_mint_lamp_via_did`.
 */
export const buildMintLampViaDid = async (args: {
  authorityKeksHex: string[];
  registryUtxoJson: string;
  tokenTagHex: string;
  supplyStateUtxoJson: string;
  supplyStateScriptCbor: string;
  khoUtxoJson: string;
  lampPolicyCborHex: string;
  mintJson: string;
  utxosJson: string;
  protocolParamsJson: string;
  walletSeedHex: string;
  network: number;
  currentSlot: number;
}): Promise<string> => {
  if (!Array.isArray(args.authorityKeksHex) || args.authorityKeksHex.length === 0) {
    throw new Error('buildMintLampViaDid: cần ít nhất 1 Master_KEK authority');
  }
  if (!Number.isInteger(args.currentSlot) || args.currentSlot < 0) {
    throw new Error(`buildMintLampViaDid: currentSlot phải là số nguyên ≥ 0 (nhận ${args.currentSlot})`);
  }

  const cbor = await bridge.buildMintLampViaDid(
    JSON.stringify(args.authorityKeksHex),
    args.registryUtxoJson,
    args.tokenTagHex,
    args.supplyStateUtxoJson,
    args.supplyStateScriptCbor,
    args.khoUtxoJson,
    args.lampPolicyCborHex,
    args.mintJson,
    args.utxosJson,
    args.protocolParamsJson,
    args.walletSeedHex,
    args.network,
    args.currentSlot,
  );
  if (!cbor) {
    // Rust trả NULL cho MỌI lỗi, không kèm thông điệp. Đừng đoán nguyên nhân ở đây —
    // liệt kê đúng những khả năng đã biết để người đọc log còn có chỗ bắt đầu.
    throw new Error(
      'buildMintLampViaDid: native trả rỗng — authority không khớp registry, ' +
        'token_tag không có trong registry, vượt cap, hoặc thiếu UTxO/collateral',
    );
  }
  return cbor;
};

export interface DeviceKeyOptInProof {
  /** Ed25519 raw pubkey 32 byte (64 hex) — gửi lên backend. */
  publicKeyHex: string;
  /** Ed25519 raw signature 64 byte (128 hex) trên canonical opt-in. */
  signature: string;
  /** 32-byte seed device key (64 hex) — caller LƯU K_bio (secureStore), KHÔNG gửi lên. */
  secretHex: string;
}

/**
 * 2FA DeviceKey opt-in (Issue #28): native sinh Ed25519 ngẫu nhiên (per-device) và ký
 * canonical "PHOENIXKEY_DEVICE_KEY_OPTIN:userDid:pubkey:nonce". Trả pubkey + signature
 * (gửi backend) + secretHex (caller lưu K_bio để cosign 2of2 sau). Reject nếu native lỗi.
 */
export const deviceKeyOptin = async (
  userDid: string,
  nonce: string,
): Promise<DeviceKeyOptInProof> => {
  const json = await bridge.deviceKeyOptin(userDid, nonce);
  const parsed = JSON.parse(json) as DeviceKeyOptInProof;
  if (!parsed.publicKeyHex || !parsed.signature || !parsed.secretHex) {
    throw new Error('deviceKeyOptin: native trả thiếu pubkey/signature/secret');
  }
  return parsed;
};

// ── Wrapping primitives (dùng để wrap/unwrap Master_KEK khi persist) ──────────

/** Sinh salt ngẫu nhiên (hex). */
export const generateSalt = (): Promise<string> => bridge.generateSalt();

/** Device_KEK 32-byte hex = PBKDF2-HMAC-SHA256(pin, salt). */
export const pbkdf2Derive = (pin: string, saltHex: string): Promise<string> =>
  bridge.pbkdf2Derive(pin, saltHex);

/** AES-256-GCM encrypt → JSON {"ciphertext","iv"}. */
export const aesGcmEncrypt = (keyHex: string, plaintextHex: string): Promise<string> =>
  bridge.aesGcmEncrypt(keyHex, plaintextHex);

/** AES-256-GCM decrypt (encryptedJson) → plaintext hex. Reject nếu sai khoá. */
export const aesGcmDecrypt = (keyHex: string, encryptedJson: string): Promise<string> =>
  bridge.aesGcmDecrypt(keyHex, encryptedJson);

/**
 * Ký Ed25519 bằng TAAD_Key phái sinh từ Master_KEK. Trả chữ-ký (hex).
 * Dùng cho recover-device (ký challenge khôi phục) + các thao-tác on-chain cần
 * chữ-ký khoá controller. `message` là chuỗi cần ký (UTF-8), khớp hợp-đồng backend.
 */
export const signEd25519 = (masterKekHex: string, message: string): Promise<string> =>
  bridge.signEd25519(masterKekHex, message);

// ── Secure storage (Keychain iOS / Keystore-AES Android) ──────────────────────

/** Lưu chuỗi an toàn (hardware-backed, device-bound). Ghi đè nếu key đã có. */
export const secureStore = (key: string, value: string): Promise<boolean> =>
  bridge.secureStore(key, value);

/** Đọc chuỗi đã lưu; null nếu chưa có. */
export const secureLoad = (key: string): Promise<string | null> =>
  bridge.secureLoad(key);

/** Xoá key khỏi secure storage. */
export const secureDelete = (key: string): Promise<boolean> =>
  bridge.secureDelete(key);

export default {
  isAvailable,
  generateMasterKek,
  masterKekToMnemonic,
  mnemonicToMasterKek,
  deriveTaadPubkey,
  deriveWalletSeed,
  deriveWalletAddress,
  deriveStakeAddress,
  signWalletRegister,
  buildSignedTransfer,
  buildStakeDelegation,
  witnessUnsignedTx,
  buildMintLampViaDid,
  deviceKeyOptin,
  generateSalt,
  pbkdf2Derive,
  aesGcmEncrypt,
  aesGcmDecrypt,
  signEd25519,
  secureStore,
  secureLoad,
  secureDelete,
};
