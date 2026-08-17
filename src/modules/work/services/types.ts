// modules/work/services/types.ts
//
// Mô hình dữ liệu AladinWork (JSON THÔ từ backend — KHÔNG bọc envelope).
// Khớp SPEC §5 (SG8-Work-Integration.md, v0.2.0). Đây là schema BACKEND; UI hiện
// dùng schema mock riêng (data/mockData.ts) — chuyển đổi qua data/adapters.ts.
//
// ── DID người dùng: did:phoenix ──────────────────────────────────────
//   Danh tính người dùng LUÔN là `did:phoenix:<slot 13 base32>:<hash 64 hex>`
//   (regex `^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$`). KHÔNG dùng did:cardano
//   cho danh tính người (did:cardano chỉ định danh TÀI SẢN của VeData — khác nhóm).
//
// ── Mô hình 3 token (SPEC §1 v0.2.0) ─────────────────────────────────
//   - MAGIC = đơn vị KẾ TOÁN / ĐỊNH GIÁ (phi-chuyển-nhượng, decay). Giá/Pledge/
//     phí TÍNH bằng MAGIC nhưng KHÔNG rời vault.
//   - CARP  = đồng THANH TOÁN thật (chuyển nhượng, ổn định). Pledge (khóa/hoàn/
//     forfeit→Treasury) + phí nền tảng GIỮ và CHUYỂN bằng CARP.
//   - LAMP  = backing ẩn.
//   Quy tắc vàng: giá/phí TÍNH bằng MAGIC nhưng GIỮ/CHUYỂN bằng CARP.
//   Số dư khả dụng để trả (Pledge/phí) = walletCARP; `402 NO_FUNDS` = thiếu CARP.

/** Regex chuẩn DID người dùng (did:phoenix). Dùng để validate trước khi ký. */
export const DID_PHOENIX_RE = /^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$/;
export const isValidPhoenixDid = (did: string): boolean => DID_PHOENIX_RE.test(did);

// ── Account (khóa = DID) ─────────────────────────────────────────────
export interface WorkAccount {
  id: string;
  did: string;
  kind: 'person' | 'org' | 'admin';
  name: string;
  avatar: string;
  title: string;
  walletAddress: string;
  walletLAMP: number;   // backing (ẩn)
  walletMAGIC: number;  // đơn vị KẾ TOÁN/ĐỊNH GIÁ — phi-chuyển-nhượng, decay
  walletCARP: number;   // đồng THANH TOÁN — Pledge + phí trừ/hoàn ở ĐÂY; số dư khả dụng
  /**
   * Uy tín HIỆU DỤNG `r̂ × D` (đã chiết khấu chống-gaming), thang **0..100**.
   * KHÔNG phải bộ đếm cộng dồn. Nguồn: AladinWork `Core/server.js:2351`
   * (`Math.round(d.combined*1000)/10`), nhà đó xác nhận 2026-08-11.
   */
  reputation: number;
  /** Bộ đếm THÔ cũ, giữ để tương thích ngược. ĐỪNG nối vào — dùng `reputation`. */
  reputationRaw?: number;
  /** Cơ sở của điểm uy tín — dùng khi cần hiện "vì sao điểm này", đừng tự suy. */
  reputationBasis?: {
    settledRecords?: number;
    independentPartners?: number;
    antiGamingDiscount?: number;
  };
  /**
   * Số hợp đồng ĐÃ TẤT TOÁN mà người này đứng vai Genie (`Core/server.js:2339`).
   * KHÁC hẳn `jems.length` — jem là việc nhận, không phải việc đã tất toán.
   */
  completedJobs?: number;
  skills: string[];
  jems: Jem[];
  delegate?: { name: string; role: string; avatar: string; note: string };
  roles?: string[];
  pubkeyHex?: string;
  createdVia?: string;
  createdAt?: number;
  credentials?: Credential[];
}

// ── JobType / template ───────────────────────────────────────────────
export interface JobTypeMetric {
  key: string;
  label: string;
  unit?: string;
  reqLabel?: string;
}
export interface JobTypeField {
  key: string;
  label: string;
  type: string;
  options?: string[];
  default?: string;
}
export interface JobType {
  key: string;
  label: string;
  icon: string;
  skill: string;
  archetype?: string;
  taskType?: string;
  credentialArchetype?: string;
  taskDims?: Record<string, string | number>;
  stampArchetypes?: string[];
  metrics: JobTypeMetric[];
  fields?: JobTypeField[];
  defaultPriceVND?: number;
  platformFeeMagic?: number;
  source?: 'seed' | 'dynamic';
  // Backend gỡ CID giả: khi node LampNet chưa ghi được, trường này là `null` +
  // `mirageStatus: 'pending'` (đừng coi chuỗi `mock:ln1q...` cũ là CID dùng được).
  mirageCid?: string | null;
  mirageStatus?: 'pending' | 'stored' | string;
  updatedAt?: string;
}

// ── Job (tin tuyển — phía cầu) ───────────────────────────────────────
export interface WorkJob {
  id: string;
  ownerDid: string;
  templateKey: string;
  postedByName?: string;
  postedByRole?: string;
  title: string;
  skill?: string;
  archetype?: string;
  taskType?: string;
  dims?: Record<string, unknown>;
  quantity?: number;
  priceVND?: number;
  aladinPledge?: number;
  geniePledge?: number;
  req?: Record<string, unknown>;
  deadlineDays?: number;
  desc?: string;
  status: 'open' | 'hired';
  hiredDid?: string;
  // decorate khi GET:
  ownerName?: string;
  ownerAvatar?: string;
  template?: { key: string; label: string; icon: string; metrics: JobTypeMetric[] };
}

// ── Offering (dịch vụ — phía cung) ───────────────────────────────────
export interface Offering {
  id: string;
  ownerDid: string;
  status: string;
  templateKey: string;
  name: string;
  icon: string;
  skill: string;
  archetype?: string;
  taskType?: string;
  dims?: Record<string, unknown>;
  mode?: 'online' | 'offline' | 'ca-hai';
  minPriceVND?: number;
  radiusKm?: number;
  schedule?: string;
  fields?: Record<string, unknown>;
  desc?: string;
}

// ── Contract (state machine) ─────────────────────────────────────────
export type ContractState =
  | 'INIT' | 'PENDING' | 'COMMITTED' | 'ACTIVE' | 'DELIVERED'
  | 'RELEASED' | 'SETTLED' | 'FORFEITED' | 'DISPUTED' | 'FROZEN';

export interface ContractParty {
  accId: string;
  name: string;
  role: string;
  // pledgeLocked/pledgeAsk = số ĐỊNH GIÁ bằng MAGIC; CARP thực khóa lưu ở walletCARP.
  pledgeLocked: number;
  pledgeAsk: number;
  vndPaid?: boolean;
  delivered?: boolean;
}
export interface ContractLog {
  ts: number;
  kind: string;
  msg: string;
}
export interface WorkContract {
  id: string;
  // Version lạc-quan: gửi lại qua header `If-Version` khi chạy action → server
  // 409 CONFLICT nếu lệch (chặn double-apply). Server trả trong body hợp-đồng.
  version?: string;
  createdAt: number;
  service: string;
  jobId?: string | null;
  offeringId?: string | null;
  postedBy?: string;
  serviceFeeVND?: number;   // giá dịch vụ VND — trả OFF-CHAIN giữa 2 bên
  floor?: number;           // Pledge tối thiểu (định giá MAGIC)
  // *Magic = số ĐỊNH GIÁ (đơn vị kế toán MAGIC); giá trị thật khóa/thu là CARP quy đổi.
  platformFeeMagic?: number;
  feeGenieMagic?: number;
  feeAladinMagic?: number;
  state: ContractState;
  parties: { aladin: ContractParty; genie: ContractParty };
  // treasuryMAGIC/platformFeeCharged = định giá MAGIC; CARP gom về Treasury 4-ngả.
  treasuryMAGIC?: number;
  platformFeeCharged?: number;
  settlement?: unknown;
  log?: ContractLog[];
  conversationId?: string | null;
  conversationUrl?: string | null;
  evidence?: unknown;
  onchain?: unknown;
  // rút gọn (GET /contracts):
  myRole?: 'aladin' | 'genie';
  otherName?: string;
}

// ── Match ────────────────────────────────────────────────────────────
export interface MatchCandidate {
  did: string;
  name?: string;
  avatar?: string;
  qualityTier?: string;
  score?: number;
  qualified?: boolean;
  available?: boolean;
  priceVND?: number;
  [k: string]: unknown;
}
export interface MatchResult {
  jobId: string;
  weights?: Record<string, number>;
  candidates: MatchCandidate[];
}

// ── Taskers (danh bạ thợ — GET /taskers, công khai) ───────────────────
// CHỈ người đã chào năng lực lọt danh bạ (chứng chỉ duyệt gắn 1 JobType, hoặc dịch
// vụ đang mở, hoặc đã khai lịch rảnh). Thứ tự tất định: uy tín → việc tất toán →
// số chứng chỉ → did. Công khai: KHÔNG kèm ví/khoá phiên.
export interface TaskerCredential {
  taskType?: string;
  archetype?: string;
  metric?: Record<string, number>;
  quality_tier?: string;
}
export interface TaskerOffering {
  id: string;
  templateKey: string;
  name: string;
  minPriceVND?: number;
}
export interface Tasker {
  did: string;
  name?: string;
  avatar?: string;
  avatarUrl?: string;
  title?: string;
  kind?: string;
  /**
   * Uy tín là ĐIỂM 0..100 TÍNH ĐƯỢC, không phải trung bình số sao người ta bấm.
   * Nền tảng tính `r̂ × D` (uy tín hiệu dụng × hệ số dòng dõi) và neo vào việc đã
   * tất toán — thang sao thì bơm được bằng tài khoản phụ, thang này thì không.
   * Nhà AladinWork nói rõ: họ sẽ KHÔNG BAO GIỜ có "sao". Nên đừng ai nối lại một
   * khối "đánh giá 5 sao" ở đây; cái thiếu không phải endpoint, mà là khái niệm.
   */
  reputation?: number;
  reputationRaw?: number;
  /** CƠ SỞ của con số uy tín — để màn hình không phải bắt người xem tin một số trần. */
  reputationBasis?: string;
  skills?: string[];
  verifiedCredentials?: number;
  credentials?: TaskerCredential[];
  offerings?: TaskerOffering[];
  available?: boolean;
  availableFrom?: number | null; // epoch ms
  availableUntil?: number | null;
  completedJobs?: number;
}
export interface TaskersResult {
  total: number;
  taskers: Tasker[];
}

// ── Credential / Stamp ───────────────────────────────────────────────
export interface Credential {
  id: string;
  ownerDid: string;
  archetype?: string;
  archetypeName?: string;
  title?: string;
  taskType?: string;
  metric?: Record<string, number>;
  dims?: Record<string, unknown>;
  quality_tier?: 'A' | 'B' | 'C' | 'D';
  issuer?: string;
  verified: boolean;
  status: 'verified' | 'pending';
  source?: string;
  evidenceCids?: string[];
  stampRecordCid?: string | null;
  stampIdHex?: string;
  note?: string;
}

// ── Jem ──────────────────────────────────────────────────────────────
export interface Jem {
  emoji: string;
  title: string;
  note: string;
  contractId?: string;
  ts: number;
}

// ── Availability ─────────────────────────────────────────────────────
export interface Availability {
  did: string;
  availableFrom: number; // epoch ms
  availableUntil: number; // epoch ms
  skills?: string[];
  note?: string;
  updatedAt?: number;
}
export type AvailabilityResult = Availability | { available: false };

// ── Auth ─────────────────────────────────────────────────────────────
export interface ChallengeResult {
  did: string;
  challenge: string;
  domain: string;
  issuedAt: number;
  expiresAt: number;
  messageTemplate: string;
}
export interface VerifyResult {
  ok: boolean;
  did: string;
  pubkey: string;
  session: string;
  expiresAt: number;
  accountCreated: boolean;
}
export interface VerifyBody {
  did: string;
  challenge: string;
  signature: string; // chữ ký P-256 (secp256r1) ECDSA, sha256, DER hex (SPEC §2)
  timestamp: number; // GIÂY epoch (khác availability = ms)
}

// ── Health ───────────────────────────────────────────────────────────
export interface HealthResult {
  service: string;
  version: string;
  integrations: {
    db?: string;
    lampnet?: string;
    phoenixkey?: string;
    stamp?: string;
    cardano?: string;
  };
}

// ── Conversation (tham chiếu ProofChat) ──────────────────────────────
export interface ConversationRef {
  conversationId: string | null;
  url?: string | null;
  status?: string; // 'unconfigured' | 'error' | 'ok' ...
  [k: string]: unknown;
}
