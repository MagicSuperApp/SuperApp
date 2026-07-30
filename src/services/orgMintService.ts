/**
 * Ví tổ chức — SERVICE tạo OrgDID + mint LAMP bằng OrgDID.
 *
 * Tầng nghiệp-vụ trên orgMint-api.ts (REST + SSE). Chốt LUỒNG 2 BƯỚC mint và
 * gắn cờ ORG_MINT_ENABLED. Phần DỰNG + KÝ CBOR chạy ở Enclave NATIVE (Thư): service
 * NHẬN hàm `buildAndSignTx` từ ngoài (dependency injection) — KHÔNG tự viết ký ở đây.
 *
 * ── RÀNG BUỘC UX SỐNG CÒN ─────────────────────────────────────────────────────
 * Mint LAMP = vào KHO Distribution (dest_hash), KHÔNG ra thẳng ví user. Ví nhận ở
 * BƯỚC 2 claim/vesting-release RIÊNG sau. Endpoint release PhoenixKey CHƯA cấp →
 * claimReleaseToWallet() ném OrgReleaseNotAvailableError (UI: nút disabled + ghi
 * "chờ endpoint release"). TUYỆT ĐỐI không trộn 2 bước, không hiển thị "mint về ví".
 *
 * ── CHỜ ────────────────────────────────────────────────────────────────────────
 *   - Thư (native): buildAndSignTx — dựng CBOR mint + ký (m-of-n gom đủ m chữ ký).
 *   - LAMP: cap/authority/redeemer (đừng hardcode trong MintLampRequest).
 *   - PhoenixKey: endpoint claim/vesting-release (bước 2).
 */

import { PhoenixKeyApiError } from './phoenixKey-api';
import {
  orgMintApi,
  type CreateOrgResult,
  type MintLampResult,
  type SubmitMintTxResult,
  type WaitSignedHandle,
} from './orgMint-api';
import { isOrgMintEnabled } from '../config/orgMint';
import { signRaw, currentUserDid } from '../sdk/phoenixKey';
import taad from '../sdk/taadEnclave';

/**
 * Chuỗi challenge canonical backend verify cho `POST /identity/org/create`
 * (chép đúng từ `OrgCreateRequest.java` — KHÔNG suy đoán):
 *
 *   "PHOENIXKEY_ORG_MINT:" + ownerDid + ":" + name + ":"
 *                          + (registrationNumber || "") + ":" + nonce
 *
 * Backend verify chữ ký này với HW_Key ĐANG HOẠT ĐỘNG của ownerDid → chống mạo danh.
 * Lệch 1 ký tự = 403. Khi backend đổi chuỗi, CHỈ sửa ở đây.
 */
const CHALLENGE_ORG_MINT = 'PHOENIXKEY_ORG_MINT';

// UTF-8 → hex (native `sign` nhận dataHex). Tên tổ chức có dấu tiếng Việt →
// BẮT BUỘC xử-lý đa-byte đúng, không dùng charCodeAt thô.
const utf8ToHex = (s: string): string => {
  const push = (b: number) => b.toString(16).padStart(2, '0');
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const code = s.codePointAt(i)!;
    if (code < 0x80) {
      out += push(code);
    } else if (code < 0x800) {
      out += push(0xc0 | (code >> 6)) + push(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out += push(0xe0 | (code >> 12)) + push(0x80 | ((code >> 6) & 0x3f)) + push(0x80 | (code & 0x3f));
    } else {
      out += push(0xf0 | (code >> 18)) + push(0x80 | ((code >> 12) & 0x3f)) +
        push(0x80 | ((code >> 6) & 0x3f)) + push(0x80 | (code & 0x3f));
      i += 1; // cặp surrogate
    }
  }
  return out;
};

// Re-export type để tầng UI (OrgMintScreen) import từ service, không thò tay vào -api.
// Cùng lối như BuildAndSignMintTx export ở dưới; trước đây sót nên OrgMintScreen fail tsc.
export type { WaitSignedHandle } from './orgMint-api';

// ── Lỗi tường-minh cho UI ─────────────────────────────────────────────────────

export class OrgMintDisabledError extends Error {
  constructor() {
    super(
      'Ví tổ chức chưa sẵn sàng — mint LAMP còn chờ LAMP chốt cap/authority và ' +
        'Enclave native ráp ký giao dịch.',
    );
    this.name = 'OrgMintDisabledError';
  }
}

export class OrgReleaseNotAvailableError extends Error {
  constructor() {
    super(
      'Bước đưa LAMP về ví (claim/vesting-release) chưa mở — PhoenixKey chưa cấp ' +
        'endpoint release. LAMP hiện đang nằm trong KHO Distribution.',
    );
    this.name = 'OrgReleaseNotAvailableError';
  }
}

const ensureEnabled = (): void => {
  if (!isOrgMintEnabled()) throw new OrgMintDisabledError();
};

// ── Hình dạng camelCase cho tầng UI tiêu thụ ──────────────────────────────────
// (Response interceptor đã đổi key sang camel; ta khai lại kiểu camel để UI dùng
//  tự-nhiên, không phải đụng snake_case wire.)

export interface Org {
  orgDid: string;
  orgName?: string;
  role?: string;
  threshold?: number;
}

export interface MintIntent {
  requestId: string;
  network?: string;
  threshold?: number;
  expiresAt?: number;
}

export interface MintSubmitResult {
  txHash: string;
  status?: string;
}

/**
 * Hàm dựng + ký CBOR mint — CUNG CẤP TỪ ENCLAVE NATIVE (Thư).
 *
 * Nhận requestId (để native lấy intent LAMP_MINT đã ký ở backend/gom chữ ký) và
 * trả về CBOR tx ĐÃ ký (hex). Với m-of-n: native/luồng gom đủ m chữ ký trước khi
 * trả (single = 1 chữ ký). Service KHÔNG biết chi tiết ký — chỉ chuyển tiếp CBOR.
 *
 * TODO(Thư): ráp hàm này với module Enclave. Witness Cardano cho tx mint LAMP
 * ON-CHAIN phải ký **Ed25519** (từ ví seed / khoá on-chain), KHÔNG dùng P-256.
 * ⚠️ ĐỪNG để P-256 chạm validator: `phoenixKey-native.sign` (P-256/secp256r1, HW key
 * Secure Enclave) CHỈ để verify OFF-CHAIN ở backend (challenge/verify đăng nhập, duyệt
 * intent sinh trắc) — KHÔNG dùng để ký witness tx on-chain. (k1 chỉ khi cần ECDSA on-chain.)
 * KHÔNG viết ký ở tầng JS.
 */
export type BuildAndSignMintTx = (args: {
  orgDid: string;
  requestId: string;
}) => Promise<{ signedTxCbor: string }>;

// ── OrgDID ────────────────────────────────────────────────────────────────────

/**
 * Tạo OrgDID single-owner. 🟢 live — không phụ thuộc cờ mint (tạo org là bước
 * độc-lập, cần trước khi mint). Nhưng vẫn để UI quyết bật/tắt qua isOrgMintEnabled
 * nếu muốn giấu toàn bộ tính năng org.
 */
export async function createOrg(args: {
  ownerDid: string;
  orgName: string;
  /** Mã số đăng ký kinh doanh (MST) — tuỳ chọn. Bỏ trống = chuỗi rỗng trong challenge. */
  registrationNumber?: string;
}): Promise<CreateOrgResult> {
  const name = args.orgName.trim();
  const registrationNumber = args.registrationNumber?.trim() ?? '';
  const nonce = await taad.generateSalt();

  // Dựng ĐÚNG chuỗi backend verify. Phần registrationNumber rỗng vẫn phải có dấu ':'
  // bao quanh — bỏ đi là lệch chuỗi → 403.
  const challenge =
    `${CHALLENGE_ORG_MINT}:${args.ownerDid}:${name}:${registrationNumber}:${nonce}`;

  const ownerSignature = await signRaw(
    utf8ToHex(challenge),
    'Tạo danh tính tổ chức',
    'Ký bằng khoá phần cứng của bạn',
  );

  return orgMintApi.createOrg({
    owner_did: args.ownerDid,
    name,
    // Chỉ gửi khi có — backend cho phép vắng mặt (@Size, không @NotBlank).
    ...(registrationNumber ? { registration_number: registrationNumber } : {}),
    owner_signature: ownerSignature,
    nonce,
  });
}

/**
 * Danh sách OrgDID người dùng điều-khiển.
 * [CHỜ PhoenixKey xác nhận endpoint list] — nếu backend chưa có, gọi này ném
 * PhoenixKeyApiError (404/tương-đương); UI rơi về danh sách lưu local (màn OrgDID
 * tự cache org vừa tạo). Trả camelCase cho UI.
 */
export async function listOrgs(): Promise<Org[]> {
  const rows = (await orgMintApi.listOrgs()) as unknown as Org[];
  return Array.isArray(rows) ? rows : [];
}

// ── OrgDID m-of-n: founding + upgrade-authority ───────────────────────────────
// ⚠️ m-of-n = NHIỀU người ký, MỖI người trên MÁY RIÊNG (khoá HW của họ). 1 máy chỉ
// ký được phần DID của mình → luồng: initiator dựng challenge (+nonce) → chia sẻ cho
// đồng-sáng-lập → mỗi người ký-hộ (signSharedOrgChallenge) trả {ownerDid,ownerSignature}
// → initiator gom đủ n chữ ký rồi foundOrg/upgradeAuthority.

export interface FounderSig {
  ownerDid: string;
  ownerSignature: string;
}

/**
 * Challenge canonical cho founding (đối chiếu OrgFoundingRequest.java):
 *   "PHOENIXKEY_ORG_FOUNDING:" + name + ":" + sortedFounderDids.join(",") + ":" + threshold + ":" + nonce
 * Founder DIDs SORT tăng dần trước khi join → chữ ký độc-lập với thứ tự client đóng gói.
 */
export function buildFoundingChallenge(args: {
  name: string; founderDids: string[]; threshold: number; nonce: string;
}): string {
  const sorted = [...args.founderDids].map(d => d.trim()).filter(Boolean).sort();
  return `PHOENIXKEY_ORG_FOUNDING:${args.name.trim()}:${sorted.join(',')}:${args.threshold}:${args.nonce}`;
}

/**
 * Challenge canonical cho upgrade-authority (đối chiếu OrgUpgradeAuthorityRequest.java):
 *   "PHOENIXKEY_ORG_UPGRADE:" + orgDid + ":" + sortedNewMemberDids.join(",") + ":" + newThreshold + ":" + nonce
 */
export function buildUpgradeChallenge(args: {
  orgDid: string; newMemberDids: string[]; newThreshold: number; nonce: string;
}): string {
  const sorted = [...args.newMemberDids].map(d => d.trim()).filter(Boolean).sort();
  return `PHOENIXKEY_ORG_UPGRADE:${args.orgDid}:${sorted.join(',')}:${args.newThreshold}:${args.nonce}`;
}

/**
 * KÝ-HỘ 1 challenge founding/upgrade được chia sẻ, bằng khoá HW của MÁY NÀY.
 * Trả {ownerDid (DID máy này), ownerSignature}. Dùng cho đồng-sáng-lập ký trên máy họ
 * rồi gửi lại initiator. Ném nếu máy chưa có DID.
 */
export async function signSharedOrgChallenge(challenge: string): Promise<FounderSig> {
  const ownerDid = await currentUserDid();
  if (!ownerDid) throw new Error('Máy này chưa có danh tính (DID) để ký duyệt.');
  const ownerSignature = await signRaw(
    utf8ToHex(challenge),
    'Ký duyệt tổ chức',
    'Ký bằng khoá phần cứng của bạn',
  );
  return { ownerDid, ownerSignature };
}

/**
 * Tạo OrgDID m-of-n. `founders` = ĐỦ n chữ ký (mỗi founder đã ký cùng challenge dựng từ
 * cùng name/threshold/nonce/danh-sách DID). threshold ≥ 2. Trả {orgDid, txHash}.
 */
export async function foundOrg(args: {
  name: string;
  registrationNumber?: string;
  threshold: number;
  founders: FounderSig[];
  nonce: string;
}): Promise<{ orgDid: string; txHash?: string }> {
  const res = (await orgMintApi.foundOrg({
    founders: args.founders.map(f => ({ owner_did: f.ownerDid, owner_signature: f.ownerSignature })),
    threshold: args.threshold,
    name: args.name.trim(),
    ...(args.registrationNumber?.trim() ? { registration_number: args.registrationNumber.trim() } : {}),
    nonce: args.nonce,
  })) as any;
  return { orgDid: res.orgDid ?? res.org_did, txHash: res.txHash ?? res.tx_hash };
}

/**
 * Nâng OrgDID single → threshold. `currentOwner` = chữ ký chủ hiện tại; `newMembers` =
 * ĐỦ chữ ký từng thành-viên mới (cùng challenge upgrade). newThreshold ≥ 2.
 */
export async function upgradeAuthority(args: {
  orgDid: string;
  currentOwner: FounderSig;
  newMembers: FounderSig[];
  newThreshold: number;
  nonce: string;
}): Promise<{ orgDid: string; txHash?: string; threshold?: number }> {
  const res = (await orgMintApi.upgradeAuthority(args.orgDid, {
    current_owner_did: args.currentOwner.ownerDid,
    owner_signature: args.currentOwner.ownerSignature,
    new_members: args.newMembers.map(m => ({ owner_did: m.ownerDid, owner_signature: m.ownerSignature })),
    new_threshold: args.newThreshold,
    nonce: args.nonce,
  })) as any;
  return { orgDid: res.orgDid ?? res.org_did, txHash: res.txHash ?? res.tx_hash, threshold: res.threshold };
}

// ── Mint — BƯỚC 1: mint vào KHO Distribution ─────────────────────────────────

/**
 * BƯỚC 1a: tạo intent LAMP_MINT → trả requestId. Chưa submit gì lên chuỗi.
 * Mint vào KHO, KHÔNG ra ví. amount = số LAMP (đơn vị nhỏ nhất theo backend).
 * Cap/authority/redeemer KHÔNG truyền (chờ LAMP) — orgMint-api không nhận.
 */
export async function mintLampStep1(args: {
  orgDid: string;
  amount: string;
}): Promise<MintIntent> {
  ensureEnabled();
  const res = (await orgMintApi.mintLamp(args.orgDid, {
    amount: args.amount,
  })) as unknown as MintLampResult & {
    requestId: string;
    expiresAt?: number;
  };
  return {
    requestId: (res as any).requestId ?? (res as any).request_id,
    network: (res as any).network,
    threshold: (res as any).threshold,
    expiresAt: (res as any).expiresAt ?? (res as any).expires_at,
  };
}

/**
 * BƯỚC 1b: chờ intent được ký ("signed" qua SSE — m-of-n gom đủ m chữ ký, single=1).
 * Promise resolve khi có 'signed', reject nếu cancelled/expired/lỗi. Trả handle để
 * UI abort khi rời màn. Bọc SSE callback thành Promise cho tiện dùng ở màn hình.
 */
export function waitMintSigned(requestId: string): {
  signed: Promise<void>;
  handle: WaitSignedHandle;
} {
  let handle: WaitSignedHandle;
  const signed = new Promise<void>((resolve, reject) => {
    handle = orgMintApi.waitMintSigned(requestId, {
      onSigned: () => resolve(),
      onError: err => reject(err),
    });
  });
  return { signed, handle: handle! };
}

/**
 * BƯỚC 1c: native dựng + ký CBOR (Thư) → submit lên chuỗi. Trả txHash.
 * `buildAndSignTx` TIÊM TỪ NGOÀI (Enclave native) — service không tự ký.
 */
export async function submitMintTx(args: {
  orgDid: string;
  requestId: string;
  buildAndSignTx: BuildAndSignMintTx;
}): Promise<MintSubmitResult> {
  ensureEnabled();

  // Dựng + ký ở Enclave native (m-of-n gom đủ m chữ ký; single = 1). TODO(Thư).
  const { signedTxCbor } = await args.buildAndSignTx({
    orgDid: args.orgDid,
    requestId: args.requestId,
  });

  const res = (await orgMintApi.submitMintTx(args.orgDid, {
    request_id: args.requestId,
    signed_tx_cbor: signedTxCbor,
  })) as unknown as SubmitMintTxResult & { txHash: string };

  return {
    txHash: (res as any).txHash ?? (res as any).tx_hash,
    status: (res as any).status,
  };
}

// ── Mint — BƯỚC 2: claim/vesting-release về ví (CHƯA CÓ ENDPOINT) ─────────────

/**
 * BƯỚC 2: đưa LAMP từ KHO Distribution về ví user (claim/vesting-release).
 *
 * PhoenixKey CHƯA cấp endpoint này → LUÔN ném OrgReleaseNotAvailableError. UI hiện
 * nút disabled + ghi "chờ endpoint release". KHÔNG bịa path. Khi backend cấp: ráp
 * gọi ở đây (mẫu 2 bước như mint: request → ký → submit), UI mở nút.
 */
export async function claimReleaseToWallet(_args: {
  orgDid: string;
  recipientAddress: string;
  amount: string;
}): Promise<never> {
  throw new OrgReleaseNotAvailableError();
}

// ── Tiện cho UI ───────────────────────────────────────────────────────────────

/** Cờ nhanh cho UI: tính năng mint đã bật chưa (build-time). */
export function isOrgMintReady(): boolean {
  return isOrgMintEnabled();
}

export { PhoenixKeyApiError };
