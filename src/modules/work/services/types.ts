// modules/work/services/types.ts
//
// Mô hình dữ liệu AladinWork (JSON THÔ từ backend — KHÔNG bọc envelope).
// Khớp SPEC §5 (SG8-Work-Integration.md). Đây là schema BACKEND; UI hiện dùng
// schema mock riêng (data/mockData.ts) — chuyển đổi qua data/adapters.ts.

// ── Account (khóa = DID) ─────────────────────────────────────────────
export interface WorkAccount {
  id: string;
  did: string;
  kind: 'person' | 'org' | 'admin';
  name: string;
  avatar: string;
  title: string;
  walletAddress: string;
  walletLAMP: number;
  walletMAGIC: number;
  reputation: number;
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
  mirageCid?: string;
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
  createdAt: number;
  service: string;
  jobId?: string | null;
  offeringId?: string | null;
  postedBy?: string;
  serviceFeeVND?: number;
  floor?: number;
  platformFeeMagic?: number;
  feeGenieMagic?: number;
  feeAladinMagic?: number;
  state: ContractState;
  parties: { aladin: ContractParty; genie: ContractParty };
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
  signature: string;
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
