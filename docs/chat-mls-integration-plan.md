# Kế hoạch tích hợp Chat (ProofChat) — Mobile ↔ BE/WS với MLS E2EE native

> Trạng thái: **BẢN DUYỆT (chưa code)** · Ngày: 2026-07-01 · Quyết định đã chốt:
> (1) Bộ mã hoá làm **native Rust/OpenMLS**, không dùng ts-mls trên RN.
> (2) MVP làm **đủ 3 tầng E2EE + Merkle ngay từ đầu** (không cắt bớt).
> UI giữ nguyên React Native; logic nặng (crypto, socket, ký) hạ xuống native Swift/Kotlin, lõi Rust dùng chung.

---

## 0. Bối cảnh & hiện trạng (đã khảo sát)

### 0.1 Ba thành phần server (ĐÃ HOÀN CHỈNH — không cần sửa để tích hợp)

| Thành phần | Vị trí | Cổng | Vai trò |
|---|---|---|---|
| **BE** (NestJS REST) | `D:\BE` | `8080` (`/api/v1`) | Lưu DB (Postgres), hội thoại, tin nhắn, MLS keypackage/epoch-sync/bootstrap, member-request, upload ảnh support. Auth JWT qua CIP-30 wallet DID **hoặc** PhoenixKey DID. |
| **WS** (NestJS socket.io) | `D:\WS` | `8090` (namespace `/chat`) | Realtime: `contract:message.send/new`, `mls:sync.epoch`, typing/read/pin, presence, WebRTC call. Nhận tin → queue BullMQ → BE lưu DB. |
| **FE web** (Next.js) | `D:\FE` | — | **Bản tham chiếu** MLS đang chạy production. Client mobile phải khớp giao thức của nó. |

Kiến trúc runtime: `App → WS (realtime) → BullMQ → BE (persist)`; lịch sử tin app gọi thẳng REST của BE.

### 0.2 Hiện trạng chat trong app mobile (`d:\SuperApp`)

- 100% **mock**. HTTP client [proofchat-api.ts](../src/services/proofchat-api.ts) có sẵn nhưng feature-flag `PROOFCHAT_BACKEND_ENABLED` mặc định OFF.
- **Không có** socket.io-client, **không có** bộ crypto MLS. Các bước "mã hoá/ký/gửi" chỉ là animation timer trong [ChatScreen.tsx](../src/modules/chat/features/chat/screens/ChatScreen.tsx).
- `PROOFCHAT_API_URL` mặc định sai (`localhost:3000`), thực tế BE=8080, WS=8090.
- Ghi chú trong code: gửi/nhận thật hoãn tới v2.1 vì "MLS/LampNet RN client chưa publish". → Chính là việc plan này giải quyết.

### 0.3 Nền tảng đã có để tái dùng

- **PhoenixKey / TAAD Enclave Rust core** đã port vào app (native bridge + codemagic). Dùng chung cho: khoá ký, session delegation, quản lý identity. Xem memory `taad-enclave-rust-port`.
- Ví Cardano (Master_KEK/BIP39) đã có → nguồn định danh cho chuỗi tin cậy Merkle.

---

## 1. Giao thức phải khớp (HỢP ĐỒNG với web FE)

Đây là phần **bắt buộc khớp 1:1** để app ↔ web nhắn được cho nhau. Nguồn: `D:\FE`.

### 1.1 Ba tầng mã hoá

```
Tầng 1 — MLS (RFC 9420):  thoả thuận khoá nhóm → sinh epochSecret
         ciphersuite = MLS_128_DHKEMP256_AES128GCM_SHA256_P256  (P-256, AES-128-GCM, SHA-256)
         credential = basic (identity = stakeAddress Cardano)
         wire objects: KeyPackage / Welcome / Commit / GroupInfo  (base64 của binary MLS)

Tầng 2 — Message layer (KHÔNG phải MLS application message thuần):
         messageKey = HKDF-SHA256(epochSecret, info = "mls-msg:{messageId}")
         iv         = random 12 byte
         ct, tag    = AES-256-GCM(messageKey, JSON({salt, nonce, plaintext}), iv)
         body       = base64( JSON{ epoch, messageId, iv:b64, ciphertext:b64, tag:b64 } )
         → cho phép giải mã out-of-order, không phụ thuộc ratchet state.

Tầng 3 — Merkle identity proof (CHỈ hội thoại DIRECT & JOB_NEGOTIATION):
         ptCommit  = Poseidon(plaintext, salt)
         leafHash  = Poseidon(conversationId, senderId, timestamp, ptCommit)
         signature = Ed25519.sign(leafHash, sessionPrivateKey)
         MerkleLeaf = { v:1, leafHash, ptCommit, signature, signerPublicKey,
                        delegationCert(COSE_Sign1 b64), walletCoseKey(b64), algorithm:"pos-b2b" }
```

### 1.2 Chuỗi tin cậy định danh

```
Ví Cardano (stake addr)
   └─ signData(CIP-30)  ⇒  Session Delegation (hạn 7 ngày, COSE_Sign1)
                              { sessionPublicKey, sessionPrivateKey, certificate, walletCoseKey, expiresAt }
                                   └─ Ed25519 ký từng leafHash (tầng 3)
```
Verify khi nhận: recover walletPubKey từ `delegationCert` → verify COSE → khớp `sessionPublicKey` → verify Ed25519 sig → tính lại `leafHash`/`ptCommit` và so.

### 1.3 Payload socket & REST (tên field CHÍNH XÁC)

**Emit `contract:message.send`** (Client→WS, có ack `{success, error?}`):
```jsonc
{
  "id": "uuid", "senderId": "stake1...", "conversationId": "...", "timestamp": 0,
  "messageType": "text", "senderDeviceId": 0,
  "encryptedContent": {
    "opkId": "mls", "type": 2, "body": "<base64 JSON tầng 2>",
    "mlsMessageType": "application", "mlsEpoch": 0,
    "mlsWelcome": "<b64?>", "mlsRatchetTree": "<b64?>"   // chỉ tin đầu khi thêm thành viên
  },
  "variants": [{ "senderDeviceId": 0, "targetDeviceId": "*", "encryptedContent": { } }],
  "merkleLeaf": { }   // chỉ DIRECT/JOB_NEGOTIATION
}
```
**Nhận `contract:message.new`** (WS→Client): cùng shape trên.
**`mls:sync.epoch`** (2 chiều, ack): `{ conversationId, id, epoch, mlsMessageType, commitMessage(b64), welcomeMessage(b64), ratchetTree?(b64), createdAt?, createdBy }`.

**REST BE (`:8080/api/v1`)** — các endpoint chính client cần:
- Auth: `POST /auth/challenge` → `POST /auth/verify` (CIP-30) **hoặc** `POST /auth/phoenixkey/login`; `POST /auth/refresh`.
- MLS: `POST /mls/keypackage`, `GET /mls/keypackages/room/:conversationId`, `POST /mls/keypackages/batch`, `GET /mls/keypackage/status`.
- Epoch: `GET /mls/epoch-sync/:conversationId/current`, `GET /mls/epoch-sync/:conversationId?fromEpoch&toEpoch`, `POST /mls/epoch-sync` (admin).
- Bootstrap: `GET /mls/bootstrap/pending?deviceId`, `GET /mls/bootstrap/committer-work?deviceId`.
- Conversations: `POST/GET /conversations`, `GET /conversations/:id/messages?deviceId&limit&offset`, participants, member-requests/invite/accept.
- Lịch sử tin lấy từ REST; realtime lấy từ WS.

### 1.4 Khác biệt quan trọng web vs mobile
Web offload crypto sang **route Next.js server-side** (`/api/mls/encrypt|decrypt`) rồi giữ group-state (base64) ở IndexedDB. **Mobile phải làm crypto ON-DEVICE** (đó là mục đích native) và giữ group-state ở SQLite/Keystore. Wire ra ngoài (KeyPackage/Welcome/Commit/message body) **giống hệt**, nên interop được.

---

## 2. Kiến trúc mục tiêu trên mobile

```
┌─────────────────────────────────────────────────────────────┐
│  React Native UI (GIỮ NGUYÊN)                                │
│  ChatScreen, ProofChatHomeScreen, Redux proofchatSlice       │
└───────────────┬─────────────────────────────────────────────┘
                │  RN NativeModule  (TurboModule/JSI)
┌───────────────▼─────────────────────────────────────────────┐
│  Bridge native:  Swift (iOS)  |  Kotlin (Android)            │
│  - gọi UniFFI    - map kiểu    - quản vòng đời               │
└───────────────┬─────────────────────────────────────────────┘
                │  UniFFI
┌───────────────▼─────────────────────────────────────────────┐
│  Rust core  `chat_mls`  (crate mới, cạnh TAAD Enclave)       │
│  · Tầng1 MLS  (OpenMLS/mls-rs, ciphersuite P256)             │
│  · Tầng2 message (HKDF-SHA256 + AES-256-GCM)                 │
│  · Tầng3 Merkle (Poseidon + Ed25519 + COSE delegation)       │
│  · Store group-state/epoch-secret  (SQLCipher/SQLite)        │
│  · Dùng chung khoá từ TAAD Enclave                           │
└───────────────┬─────────────────────────────────────────────┘
                │  (transport nằm ở JS)
┌───────────────▼─────────────────────────────────────────────┐
│  RN transport (JS/TS):                                       │
│  · socket.io-client → WS :8090 /chat  (JWT ở query)          │
│  · axios → BE :8080/api/v1  (Bearer, refresh single-flight)  │
└─────────────────────────────────────────────────────────────┘
```

**Nguyên tắc phân tầng:** crypto & lưu khoá ở Rust; transport (socket/REST) ở JS cho dễ nối UI & retry; bridge chỉ chuyển byte/string (base64), không giữ logic nghiệp vụ.

---

## 3. Chi tiết công việc theo Pha

### PHA 0 — Spike interop (BẮT BUỘC làm đầu, 1–2 ngày) ⚠️
Mục tiêu: chứng minh Rust MLS khớp wire với ts-mls/BE **trước khi** đầu tư Pha 1.
- [ ] So chọn **OpenMLS** vs **mls-rs (AWS)**: cả hai RFC 9420; kiểm ciphersuite `MLS_128_DHKEMP256_AES128GCM_SHA256_P256` (P-256) có được hỗ trợ sẵn không.
- [ ] Rust sinh KeyPackage (P256, credential basic = stakeAddress) → `POST /mls/keypackage` → BE nhận OK.
- [ ] Tạo nhóm 2 thành viên: 1 web (ts-mls) + 1 Rust; trao đổi Welcome/Commit; Rust `joinGroup` từ Welcome của web và ngược lại.
- [ ] Rút `epochSecret` ở Rust **giống cách web rút** → HKDF-SHA256 → AES-256-GCM → web giải mã được body Rust tạo, và ngược lại (test vector đối chiếu).
- **Cổng quyết định:** nếu lệch wire → cân nhắc build ts-mls thành wasm/native chạy nhúng, hoặc điều chỉnh ciphersuite. KHÔNG sang Pha 1 khi chưa xanh.

### PHA 1 — Rust core `chat_mls`
- [ ] Tạo crate `chat_mls` cạnh TAAD Enclave core (`D:\orilife-core\MassTreeIdentify\core` hoặc workspace tương ứng).
- [ ] **Tầng 1**: bọc OpenMLS/mls-rs: `create_group`, `join_from_welcome`, `add_members`, `process_commit`, `export_epoch_secret`, `encode/decode_group_state`.
- [ ] **Tầng 2**: `derive_message_key(epochSecret, messageId)` = HKDF-SHA256 info `"mls-msg:{id}"`; `aes256gcm_seal/open`; đóng/mở `body` JSON đúng format §1.1.
- [ ] **Tầng 3**: Poseidon (khớp tham số web — kiểm `merkle-leaf.ts`), Ed25519 ký/verify, tạo & verify COSE_Sign1 delegation; `create_merkle_leaf`, `verify_merkle_leaf`.
- [ ] **Store**: SQLite/SQLCipher cho `group-state`, `epoch-secret` (key theo `conversationId`, `conversationId:epoch`); khoá DB bảo vệ bằng Keychain/Keystore qua TAAD Enclave.
- [ ] **UniFFI**: định nghĩa interface §4; sinh binding Swift + Kotlin.
- [ ] **Test vector**: lấy input/output thật từ web (`/api/mls/encrypt` payload) làm golden test — bảo đảm byte-khớp.

### PHA 2 — Native bridge + RN module
- [ ] iOS: Swift wrapper quanh UniFFI, đóng gói xcframework; nối build codemagic (đã có pattern TAAD).
- [ ] Android: Kotlin wrapper, `.so` per-ABI (arm64-v8a tối thiểu — khớp check trong `codemagic.yaml`).
- [ ] RN TurboModule/JSI `ChatCryptoModule` expose API §4; type d.ts.
- [ ] Xử lý byte lớn qua base64 string qua cầu; đo hiệu năng encrypt/decrypt.

### PHA 3 — Transport layer (JS/TS)
- [ ] Thêm `socket.io-client@^4.8` (khớp web 4.8.1). Service `chatSocket.ts`: namespace `/chat`, `query.token=<JWT>`, `transports:['websocket','polling']`, reconnection backoff (giống web §config).
- [ ] Mở rộng [proofchat-api.ts](../src/services/proofchat-api.ts): thêm endpoint §1.3; sửa base URL (env `PROOFCHAT_API_URL`→ BE :8080, thêm `PROOFCHAT_WS_URL`→ :8090).
- [ ] **Auth**: nối [phoenixKeyAuthService.ts](../src/services/phoenixKeyAuthService.ts) → `/auth/phoenixkey/login` **hoặc** luồng CIP-30 `challenge`→sign(ví)→`verify`. Lưu access/refresh; refresh single-flight (đã có sẵn interceptor).
- [ ] Publish KeyPackage lúc đăng nhập/đăng ký thiết bị: gọi Rust `generate_keypackage` → `POST /mls/keypackage`.

### PHA 4 — Nối UI hiện có (bỏ mock)
- [ ] Redux [chatSlice.ts](../src/modules/chat/store/chatSlice.ts): thay reducer mock bằng thunk thật.
- [ ] **Gửi**: UI text → Rust `encrypt_message` (+ `create_merkle_leaf` nếu DIRECT/JOB) → emit `contract:message.send` → lưu plaintext local (SQLite) → cập nhật trạng thái `sent`.
- [ ] **Nhận**: listen `contract:message.new` → check cache → Rust `decrypt_message` → `verify_merkle_leaf` → lưu cache → render. Xử lý `before_join`/`missing_epoch_secret`.
- [ ] **Epoch sync**: listen `mls:sync.epoch`; khi mở app so `localEpoch` vs `GET .../current`, thiếu thì kéo range `process_commit` tuần tự (offline recovery như web §5).
- [ ] Typing/read/pin; hàng đợi gửi offline (tái dùng ý tưởng [syncService.ts](../src/services/syncService.ts)).
- [ ] Bật `PROOFCHAT_BACKEND_ENABLED=true`.

### PHA 5 — Đủ tính năng + kiểm thử chéo
- [ ] Member-request / invite / accept; **add-device** (MLS multi-device: `POST /mls/bootstrap`, `mls:member.addDevice.*`).
- [ ] Reactions, polls, pin, scheduled, saved; upload ảnh support (`POST /support/uploads`, MinIO).
- [ ] **Test chéo app ↔ web**: nhắn 2 chiều DIRECT + GROUP, verify Merkle xanh, epoch tăng khi add member.
- [ ] Test đa thiết bị cùng user; mất mạng → khôi phục epoch.

---

## 4. Hợp đồng interface native (`ChatCryptoModule` qua UniFFI)

> Tất cả tham số/kết quả binary truyền dưới dạng **base64 string** qua cầu RN.

```ts
interface ChatCryptoModule {
  // --- Identity / KeyPackage ---
  initIdentity(stakeAddress: string): Promise<void>;               // nạp khoá từ TAAD Enclave
  generateKeyPackage(deviceId: string): Promise<{ keyPackage: string; ciphersuite: string; expiresAt: number }>;
  createSessionDelegation(): Promise<{ sessionPublicKey: string; certificate: string; walletCoseKey: string; expiresAt: number }>;

  // --- Group lifecycle (Tầng 1) ---
  createGroup(conversationId: string, memberKeyPackages: string[]): Promise<{ welcome?: string; ratchetTree?: string; epoch: number }>;
  joinFromWelcome(conversationId: string, welcome: string, ratchetTree?: string): Promise<{ epoch: number }>;
  processCommit(conversationId: string, commitMessage: string): Promise<{ epoch: number }>;
  currentEpoch(conversationId: string): Promise<number>;

  // --- Message (Tầng 2) ---
  encryptMessage(conversationId: string, plaintext: string, salt: string):
    Promise<{ body: string; epoch: number; mlsWelcome?: string; mlsRatchetTree?: string }>;
  decryptMessage(conversationId: string, body: string, messageEpoch?: number):
    Promise<{ plaintext: string; salt: string; epoch: number; undecryptableReason?: 'before_join'|'missing_epoch_secret' }>;

  // --- Merkle (Tầng 3, chỉ DIRECT/JOB_NEGOTIATION) ---
  createMerkleLeaf(conversationId: string, senderId: string, timestamp: number, plaintext: string, salt: string):
    Promise<MerkleLeaf>;
  verifyMerkleLeaf(leaf: MerkleLeaf, conversationId: string, senderId: string, timestamp: number, plaintext: string, salt: string):
    Promise<{ integrityValid: boolean; identityValid: boolean }>;
}
```

---

## 5. Rủi ro & giảm thiểu

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| ts-mls ↔ Rust MLS lệch wire (ciphersuite P256, serialize) | **Cao** | Pha 0 spike trước; test vector golden từ web; nếu hỏng → nhúng ts-mls (wasm) làm phương án B |
| Poseidon tham số không khớp web | Cao | Đối chiếu trực tiếp `D:\FE\lib\merkle-leaf.ts` + test vector |
| COSE_Sign1 delegation dựng sai → verify fail | TB | Tái dùng logic ví/CIP-30 đã có; test verify chéo với web |
| Hiệu năng crypto trên máy yếu | TB | Đo sớm ở Pha 2; cân nhắc cache messageKey theo epoch |
| Đồng bộ epoch khi offline lâu | TB | Bám đúng cơ chế range-fetch + process_commit tuần tự của web (§5 FE) |
| Build native đa ABI/codemagic | Thấp | Tái dùng pipeline TAAD Enclave đã chạy |

---

## 6. Cấu hình cần bổ sung (env)

```
PROOFCHAT_BACKEND_ENABLED=true
PROOFCHAT_API_URL=https://<host>:8080/api/v1      # BE REST (đang sai localhost:3000)
PROOFCHAT_WS_URL=https://<host>:8090              # WS socket.io, namespace /chat
```
JWT lấy từ luồng auth; secret/JWKS phía server đã cấu hình (`JWT_SECRET`, `PHOENIXKEY_*`).

---

## 7. Tiêu chí hoàn thành MVP (chốt: đủ E2EE + Merkle)

- [ ] Đăng nhập thật (CIP-30 hoặc PhoenixKey) → có JWT → publish KeyPackage.
- [ ] Tạo/nhận hội thoại **DIRECT**, gửi & nhận tin **mã hoá MLS thật** (3 tầng), Merkle verify **xanh**.
- [ ] Realtime qua WS (`contract:message.new`), lịch sử qua REST.
- [ ] Epoch sync hoạt động khi có thành viên/thiết bị mới.
- [ ] **Nhắn được với client web** (interop 2 chiều) — bằng chứng khớp giao thức.
- [ ] UI React Native giữ nguyên, chỉ thay lớp dữ liệu.

---

## 8. Tham chiếu file

**Mobile (`d:\SuperApp`):** `src/services/proofchat-api.ts`, `src/services/proofchatAuthBridge.ts`, `src/services/phoenixKeyAuthService.ts`, `src/modules/chat/store/chatSlice.ts`, `src/modules/chat/features/chat/screens/ChatScreen.tsx`, `src/sdk/taadEnclave.ts`, `src/sdk/phoenixKey.ts`.

**BE (`D:\BE`):** `src/modules/mls/*`, `src/modules/conversations/*`, `src/modules/messages/*`, `src/modules/auth/*`, `prisma/schemas/10-messages.prisma`, `11-signal.prisma`.

**WS (`D:\WS`):** `src/modules/messaging/messaging.gateway.ts`, `messaging-base.gateway.ts`, `messaging-events.types.ts`, `.env.example`.

**FE tham chiếu (`D:\FE`):** `lib/mls-crypto-utils.ts`, `lib/merkle-leaf.ts`, `lib/session-delegation.ts`, `lib/mls-message-integrity.ts`, `context/MLSContext.tsx`, `services/socketClient.ts`, `store/protocols/mls/persistence/*`, `app/api/mls/*/route.ts`.
