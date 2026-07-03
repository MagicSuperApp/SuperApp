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
}): Promise<CreateOrgResult> {
  return orgMintApi.createOrg({
    owner_did: args.ownerDid,
    org_name: args.orgName,
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
