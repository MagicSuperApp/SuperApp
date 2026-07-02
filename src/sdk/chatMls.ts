/**
 * chatMls — JS wrapper cho Rust core `chat_mls` (ProofChat E2EE, 3 tầng khớp web).
 *
 * Native module `ChatMlsModule` (iOS Swift + Android Kotlin) gọi vào Rust FFI:
 *   - iOS:     ios/LocalPods/ScannerModule/Core/Enclave/ChatMlsModule.swift (import chat_mls)
 *   - Android: android/.../ChatMlsModule.kt → System.loadLibrary("chat_mls") + JNI shim
 *              (rust/chat_mls/src/android_jni.rs)
 *
 * Mô hình: module giữ 1 danh tính hiện hành (con trỏ 64-bit) NỘI BỘ (không đẩy qua JS).
 * Gọi `newIdentity(stakeAddress)` hoặc `importState(blob)` để khởi tạo, rồi các thao tác.
 * Hàm thao tác native trả CHUỖI JSON `{ok, ...}`; wrapper parse & ném nếu ok=false.
 *
 * Xem rust/chat_mls/README.md + spikes/chat-mls-interop/PHA0-FINDINGS.md.
 */

import { NativeModules, Platform } from 'react-native';

// ── Kết quả có kiểu ────────────────────────────────────────────────────────────

/** Trạng thái nhóm sau create/join/commit. */
export interface GroupState {
  epoch: number;
  /** epoch_secret hex của epoch hiện tại (dùng nội bộ; thường không cần ở JS). */
  epochSecret: string | null;
  /** Welcome (base64 wire) để gửi cho người mới — có khi create+add hoặc add-member. */
  welcome: string | null;
  /** Commit (base64 wire) để gửi lên WS cho thành viên hiện hữu (epoch-sync). */
  commit: string | null;
}

/** Kết quả mã hoá 1 tin (tầng 2). `salt` dùng để tạo Merkle leaf (tầng 3) khớp. */
export interface EncryptResult {
  /** `encryptedContent.body` gửi lên WS (base64 của JSON tầng 2). */
  body: string;
  epoch: number;
  messageId: string;
  salt: string;
}

export interface DecryptResult {
  plaintext: string;
  salt: string;
  epoch: number;
}

// ── Bridge ─────────────────────────────────────────────────────────────────────

interface ChatMlsNativeBridge {
  newIdentity(stakeAddress: string): Promise<boolean>;
  importState(stateB64: string): Promise<boolean>;
  hasIdentity(): Promise<boolean>;
  freeIdentity(): Promise<boolean>;
  exportState(): Promise<string>;
  generateKeyPackage(): Promise<string>;
  createGroup(conversationId: string, memberKeyPackagesJson: string): Promise<string>;
  joinFromWelcome(welcomeB64: string): Promise<string>;
  processCommit(conversationId: string, commitB64: string): Promise<string>;
  encrypt(conversationId: string, plaintext: string): Promise<string>;
  decrypt(conversationId: string, bodyB64: string): Promise<string>;
}

const moduleNotAvailable = (): ChatMlsNativeBridge => {
  const reject = (method: string) =>
    Promise.reject(
      new Error(
        `ChatMls native module not available on ${Platform.OS}. ` +
          `Method '${method}' requires the Rust core (chat_mls).`,
      ),
    );
  return {
    newIdentity: () => reject('newIdentity') as never,
    importState: () => reject('importState') as never,
    hasIdentity: () => reject('hasIdentity') as never,
    freeIdentity: () => reject('freeIdentity') as never,
    exportState: () => reject('exportState') as never,
    generateKeyPackage: () => reject('generateKeyPackage') as never,
    createGroup: () => reject('createGroup') as never,
    joinFromWelcome: () => reject('joinFromWelcome') as never,
    processCommit: () => reject('processCommit') as never,
    encrypt: () => reject('encrypt') as never,
    decrypt: () => reject('decrypt') as never,
  };
};

const bridge: ChatMlsNativeBridge = NativeModules.ChatMlsModule
  ? (NativeModules.ChatMlsModule as ChatMlsNativeBridge)
  : moduleNotAvailable();

/** True khi native bridge (Rust core chat_mls) sẵn sàng trên nền-tảng hiện tại. */
export const isAvailable = (): boolean => !!NativeModules.ChatMlsModule;

/** Parse JSON native `{ok, ...}`; ném Error nếu ok=false. */
function parse<T>(jsonStr: string): T {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    throw new Error(`chat_mls: phản hồi native không phải JSON hợp lệ: ${jsonStr}`);
  }
  if (obj.ok !== true) {
    throw new Error(`chat_mls: ${(obj.error as string) ?? 'lỗi không rõ'}`);
  }
  return obj as unknown as T;
}

// ── Vòng đời danh tính ───────────────────────────────────────────────────────

/** Tạo danh tính MLS mới cho stakeAddress (sinh khoá ký P-256). */
export const newIdentity = (stakeAddress: string): Promise<boolean> =>
  bridge.newIdentity(stakeAddress);

/** Khôi phục danh tính từ blob `exportState` (base64). */
export const importState = (stateB64: string): Promise<boolean> =>
  bridge.importState(stateB64);

/** Có danh tính hiện hành chưa. */
export const hasIdentity = (): Promise<boolean> => bridge.hasIdentity();

/** Giải phóng danh tính hiện hành. */
export const freeIdentity = (): Promise<boolean> => bridge.freeIdentity();

/** Xuất toàn bộ trạng thái (base64) để lưu mã hoá (vd qua TaadEnclave secureStore). */
export const exportState = async (): Promise<string> =>
  parse<{ state: string }>(await bridge.exportState()).state;

// ── MLS (tầng 1) ───────────────────────────────────────────────────────────────

/** Sinh KeyPackage (base64 wire) để publish lên BE `/mls/keypackage`. */
export const generateKeyPackage = async (): Promise<string> =>
  parse<{ keyPackage: string }>(await bridge.generateKeyPackage()).keyPackage;

/** Tạo nhóm cho conversationId, tuỳ chọn add danh sách KeyPackage (base64 wire). */
export const createGroup = async (
  conversationId: string,
  memberKeyPackages: string[] = [],
): Promise<GroupState> =>
  parse<GroupState>(
    await bridge.createGroup(conversationId, JSON.stringify(memberKeyPackages)),
  );

/** Join nhóm từ Welcome (base64 wire). */
export const joinFromWelcome = async (welcomeB64: string): Promise<GroupState> =>
  parse<GroupState>(await bridge.joinFromWelcome(welcomeB64));

/** Xử lý Commit đến (epoch-sync) cho conversationId. */
export const processCommit = async (
  conversationId: string,
  commitB64: string,
): Promise<GroupState> =>
  parse<GroupState>(await bridge.processCommit(conversationId, commitB64));

// ── Mã hoá / giải mã tin (tầng 2) ──────────────────────────────────────────────

/** Mã hoá 1 tin văn bản trong nhóm. Tự sinh salt + messageId. */
export const encrypt = async (
  conversationId: string,
  plaintext: string,
): Promise<EncryptResult> =>
  parse<EncryptResult>(await bridge.encrypt(conversationId, plaintext));

/** Giải mã 1 tin (`body` = encryptedContent.body nhận từ WS). */
export const decrypt = async (
  conversationId: string,
  bodyB64: string,
): Promise<DecryptResult> =>
  parse<DecryptResult>(await bridge.decrypt(conversationId, bodyB64));

export default {
  isAvailable,
  newIdentity,
  importState,
  hasIdentity,
  freeIdentity,
  exportState,
  generateKeyPackage,
  createGroup,
  joinFromWelcome,
  processCommit,
  encrypt,
  decrypt,
};
