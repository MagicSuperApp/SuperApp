# NestJS Comprehensive API — Danh sách API & Cấu trúc dữ liệu

**Phiên bản:** 1.0 (OAS 3.0)
**Mô tả:** A comprehensive NestJS API with authentication, WebSocket, and database support

> Tài liệu này được tổng hợp từ trang Swagger UI, liệt kê toàn bộ endpoint theo nhóm (tag), kèm method, mô tả, tham số, request body và response mẫu.

---

## Mục lục

1. [auth](#1-auth)
2. [users / Users](#2-users--users)
3. [health](#3-health)
4. [default (crypto, messages, storage, mls cơ bản, trackmess)](#4-default)
5. [cardano](#5-cardano)
6. [Jobs](#6-jobs)
7. [Proposals](#7-proposals)
8. [Contracts](#8-contracts)
9. [Evaluations](#9-evaluations)
10. [Evidences](#10-evidences)
11. [E2E Live](#11-e2e-live)
12. [Support](#12-support)
13. [Faucets](#13-faucets)
14. [Conversations](#14-conversations)
15. [Member Requests](#15-member-requests)
16. [MLS (deprecated) & mls (bootstrap)](#16-mls-deprecated--mls-bootstrap)
17. [LampNet Storage](#17-lampnet-storage)
18. [Templates (Job Categories)](#18-templates-job-categories)
19. [Schemas / DTOs tổng hợp](#19-schemas--dtos-tổng-hợp)

---

## 1. auth
*Authentication endpoints*

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/auth/challenge` | Sinh challenge (nonce) để đăng nhập ví |
| POST | `/api/v1/auth/verify` | Xác thực chữ ký ví và đăng nhập |
| POST | `/api/v1/auth/update-profile` | Cập nhật hồ sơ người dùng đã mã hoá |
| GET | `/api/v1/auth/sessions/stats` | Thống kê phiên đăng nhập (giám sát) |
| POST | `/api/v1/auth/refresh` | Làm mới access token bằng refresh token |
| POST | `/api/v1/auth/phoenixkey/init` | Khởi tạo phiên đăng nhập QR PhoenixKey |
| GET | `/api/v1/auth/phoenixkey/session/{id}` | Poll trạng thái phiên đăng nhập QR |
| POST | `/api/v1/auth/phoenixkey/session/{id}/approve` | App Aladin duyệt phiên đăng nhập QR |
| POST | `/api/v1/auth/phoenixkey/login` | Đăng nhập bằng session token PhoenixKey DID |
| POST | `/api/v1/auth/logout` | Đăng xuất: xoá cookie, thu hồi refresh token |

### Request/Response mẫu

**POST /api/v1/auth/challenge**
```json
// Request (WalletChallengeRequestDto)
{
  "address": "addr_test1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0znl0yqtn3s0d2chjqntl829c4qe5fjfwr9l7esfl5z5g7a5r9qzvh5kqx9k7z8",
  "walletType": "LACE",
  "deviceId": "device-12345-abc"
}
```

**POST /api/v1/auth/verify**
```json
// Request (WalletVerifyRequestDto)
{
  "walletAddress": "addr_test1...",
  "nonce": "1a2b3c4d5e6f...",
  "coseSign1": "coseSign1-structure-base64...",
  "walletType": "LACE",
  "externalAad": "externalAad-base64url...",
  "publicKey": "a401010327200621582065eda..."
}
```

**POST /api/v1/auth/update-profile**
```json
// Request (WalletUpdateProfileRequestDto)
{
  "stakeAddress": "stake_test1uzm7h3k2qe0w9xjytckqulacfl3y68rhx8k8a49pf6j8kxsw8nwa3",
  "encryptedProfile": "U2FsdGVkX1+F3B0aR8...",
  "metadata": { "source": "mobile", "version": "1.0" }
}
```

**POST /api/v1/auth/refresh**
```json
{ "refreshToken": "a1b2c3d4e5f6...(128 hex characters)" }
```

**POST /api/v1/auth/phoenixkey/session/{id}/approve**
```json
{ "sessionToken": "string" }
```

**POST /api/v1/auth/phoenixkey/login**
```json
{ "sessionToken": "string" }
```

**POST /api/v1/auth/logout**
```json
{ "refreshToken": "string" }
```

---

## 2. users / Users
*User management endpoints*

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| PUT | `/api/v1/users/me` | ✔ | Cập nhật hồ sơ của chính mình |
| PATCH | `/api/v1/users/{id}` | ✔ | Cập nhật user theo ID (admin hoặc chính chủ) |
| DELETE | `/api/v1/users/{id}` | ✔ | Xoá user theo ID (chỉ chính chủ) |

**PUT /api/v1/users/me** – Response: 200 "Profile updated", 401 Unauthorized
**PATCH /api/v1/users/{id}** – Path: `id` (Cardano stake address). Response: 200 "User updated", 403, 404
**DELETE /api/v1/users/{id}** – Response: 204 "User deleted", 403, 404

`UpdateUserDto`: body tự do (object rỗng mẫu `{}`).

---

## 3. health

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/version` | Lấy phiên bản ứng dụng |

---

## 4. default
*(Các controller không gán tag riêng: Crypto, Messages, Storage, MLS cơ bản, Trackmess)*

### 4.1 Crypto
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/crypto` | Tạo bản ghi crypto |
| GET | `/api/v1/crypto` | Lấy tất cả |
| GET | `/api/v1/crypto/{id}` | Lấy theo ID |
| PUT | `/api/v1/crypto/{id}` | Cập nhật |
| DELETE | `/api/v1/crypto/{id}` | Xoá |

`CreateCryptoDto` / `UpdateCryptoDto`: schema rỗng (không có field bắt buộc công khai).

### 4.2 Messages
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/messages` | Gửi tin nhắn (mã hoá theo variant từng thiết bị) |
| GET | `/api/v1/messages/conversation/{conversationId}` | Lấy tin theo hội thoại (query: `limit=50`, `offset=0`) |
| GET | `/api/v1/messages/sender/{senderId}` | Lấy tin theo người gửi (query: `limit=50`, `offset=0`) |
| POST | `/api/v1/messages/{id}/reactions` | Thêm reaction |
| GET | `/api/v1/messages/{id}/reactions` | Lấy danh sách reaction |
| DELETE | `/api/v1/messages/{id}/reactions/{emoji}` | Xoá reaction |
| PUT | `/api/v1/messages/{id}/thumb` | Đặt thumbs (like/dislike) |
| DELETE | `/api/v1/messages/{id}/thumb` | Xoá thumbs |
| GET | `/api/v1/messages/{id}/thumb` | Lấy thumbs của 1 tin |
| GET | `/api/v1/conversations/{conversationId}/thumbs` | Lấy thumbs theo cả hội thoại |
| POST | `/api/v1/messages/{id}/delete` | Xoá tin (thu hồi, có `forEveryone`) |
| POST | `/api/v1/messages/{id}/saved` | Lưu tin nhắn |
| DELETE | `/api/v1/messages/{id}/saved` | Bỏ lưu |
| GET | `/api/v1/users/me/saved-messages` | Danh sách tin đã lưu (query: `cursor`, `limit=20`) |
| GET | `/api/v1/users/search` | Tìm user theo DID (`q`, `limit=20`) |
| POST | `/api/v1/conversations/{id}/pins` | Ghim tin nhắn |
| GET | `/api/v1/conversations/{id}/pins` | Lấy tin đã ghim |
| DELETE | `/api/v1/conversations/{id}/pins/{msgId}` | Bỏ ghim |
| POST | `/api/v1/polls/vote` | Bình chọn poll |
| GET | `/api/v1/polls/{id}/results` | Kết quả poll |
| POST | `/api/v1/conversations/{id}/scheduled` | Lên lịch gửi tin |
| GET | `/api/v1/conversations/{id}/scheduled` | Danh sách tin đã lên lịch |
| DELETE | `/api/v1/conversations/{id}/scheduled/{sId}` | Huỷ lịch gửi |

**CreateMessageDto**
```json
{
  "id": "uuid",
  "msgId": "M456-uuid",
  "conversationId": "uuid",
  "senderId": "uuid",
  "createdAt": 1739920000123,
  "merkleLeaf": {
    "v": 1, "ptCommit": "0xabc...", "leafHash": "0xdef...",
    "signature": "base64...", "signerPublicKey": "base64...",
    "algorithm": "ed25519", "delegationCert": "base64...", "walletCoseKey": "base64..."
  },
  "variants": [
    { "senderDeviceId": "device-123", "targetDeviceId": "device-456", "encryptedContent": "encrypted-base64-string..." }
  ],
  "ciphertext": "base64-ciphertext...",
  "epoch": 3
}
```

**AddReactionDto**: `{ "emoji": "👍" }`
**DeleteMessageDto**: `{ "forEveryone": false }`
**PinMessageDto**: `{ "messageId": "string" }`
**CastVoteDto**: `{ "pollId": "string", "optionIndex": 0 }`
**ScheduleMessageDto**:
```json
{ "encryptedPayload": {}, "scheduledAt": "2026-06-05T10:00:00.000Z", "epochAtSchedule": 5 }
```

### 4.3 Storage
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/storage` | Tạo bản ghi lưu trữ |
| GET | `/api/v1/storage` | Lấy tất cả |
| GET | `/api/v1/storage/{id}` | Lấy theo ID |
| PUT | `/api/v1/storage/{id}` | Cập nhật |
| DELETE | `/api/v1/storage/{id}` | Xoá |

`CreateStorageDto` / `UpdateStorageDto`: schema rỗng.

### 4.4 MLS (key package cơ bản)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/mls/keypackage` | Đăng ký key package MLS |
| GET | `/api/v1/mls/keypackage/status` | Trạng thái key package |
| POST | `/api/v1/mls/keypackages/batch` | Lấy nhiều key package cùng lúc |
| GET | `/api/v1/mls/keypackages/room/{conversationId}` | Key package theo phòng/hội thoại |
| GET | `/api/v1/mls/keypackage/{stakeAddress}` | Key package theo stake address |
| DELETE | `/api/v1/mls/keypackage/{deviceId}` | Xoá key package theo device |
| GET | `/api/v1/mls/groups/{conversationId}/verify` | Xác minh group MLS |
| GET | `/api/v1/mls/groups/{conversationId}/epoch-history` | Lịch sử epoch (query: `fromEpoch`, `toEpoch` bắt buộc) |
| POST | `/api/v1/mls/epoch-sync` | Đồng bộ epoch |
| GET | `/api/v1/mls/epoch-sync/{conversationId}/current` | Epoch hiện tại |
| GET | `/api/v1/mls/epoch-sync/{conversationId}` | Lấy khoảng epoch |

`PublishKeyPackageDto`, `BatchKeyPackagesDto`, `CreateEpochSyncDto`: schema rỗng công khai.

### 4.5 Trackmess
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/trackmess/signals` | Gửi lô tín hiệu đã-xem (Trục-1) cho Trackmess |

**IngestSignalsDto**
```json
{
  "conversationId": "string",
  "items": [ { "messageId": "string", "dwellMs": 0, "ts": 0 } ]
}
```

---

## 5. cardano

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/cardano/address/{stakeAddress}` | Lấy địa chỉ ví theo stake address |
| GET | `/api/v1/cardano/best-payment-address/{stakeAddress}` | Địa chỉ thanh toán tốt nhất |
| GET | `/api/v1/cardano/tx/{txHash}` | Thông tin giao dịch |
| GET | `/api/v1/cardano/address-info/{address}` | Thông tin địa chỉ |

---

## 6. Jobs

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/v1/jobs/search` | – | Tìm kiếm job nâng cao (nhiều bộ lọc) |
| GET | `/api/v1/jobs/browse` | ✔ | Duyệt job đang mở (OPEN), dành cho genie |
| GET | `/api/v1/jobs/summary` | ✔ | Thống kê job theo trạng thái (`userId` bắt buộc) |
| GET | `/api/v1/jobs` | ✔ | Lấy tất cả job (filter: search, minFundAmount, hasDeadline, role) |
| POST | `/api/v1/jobs` | ✔ | Tạo job mới |
| GET | `/api/v1/jobs/ids` | ✔ | Lấy toàn bộ Job ID của user hiện tại |
| GET | `/api/v1/jobs/my` | ✔ | Job của tôi (vai trò Aladin) |
| GET | `/api/v1/jobs/{id}` | ✔ | Chi tiết job |
| PATCH | `/api/v1/jobs/{id}` | ✔ | Cập nhật job |
| DELETE | `/api/v1/jobs/{id}` | ✔ | Huỷ/Xoá job |
| PATCH | `/api/v1/jobs/{id}/status` | ✔ | Cập nhật trạng thái job (`status` query: OPEN/IN_PROGRESS/COMPLETED/CANCELLED) |

### Query params quan trọng (search/browse)
`search`, `status`, `statuses[]`, `minBudget`, `maxBudget`, `createdAfter`, `createdBefore`, `aladinId`, `hasProposals`, `categoryId`, `categorySlug`, `sortBy` (createdAt|budget|title), `sortOrder` (asc|desc), `skip`, `take`

### CreateJobDto
```json
{
  "title": "Website Development Project",
  "description": "Develop a responsive e-commerce website with payment integration",
  "budget": 500,
  "additionalInfo": { "skills": ["React", "Node.js"] },
  "categoryId": "clxxxxxxxxxxxxxxxxxx"
}
```

### JobResponseDto (mẫu)
```json
{
  "id": "uuid", "aladinId": "uuid", "categoryId": "uuid",
  "title": "Website Development Project",
  "description": "Develop a responsive e-commerce website",
  "status": "OPEN",
  "deadline": "2024-12-31T23:59:59.000Z",
  "fundAmount": 5000000,
  "aladin": {}, "genie": {},
  "messageCount": 15, "evidenceCount": 3,
  "transactions": [
    { "id": "uuid", "txHash": "0x123abc...", "txType": "ESCROW", "truthAnchor": "0xdef456...", "status": "PENDING", "createdAt": "..." }
  ],
  "createdAt": "...", "updatedAt": "..."
}
```

### Enum trạng thái Job
`OPEN` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED`

---

## 7. Proposals

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/proposals` | ✔ | Nộp đề xuất cho job (genie) |
| GET | `/api/v1/proposals` | ✔ | Lấy tất cả (filter: jobId, genieId, status, skip, take) |
| GET | `/api/v1/proposals/my` | ✔ | Đề xuất của tôi (filter: status) |
| GET | `/api/v1/proposals/job/{jobId}` | ✔ | Đề xuất theo job |
| GET | `/api/v1/proposals/{id}` | ✔ | Chi tiết đề xuất |
| PATCH | `/api/v1/proposals/{id}` | ✔ | Cập nhật đề xuất |
| DELETE | `/api/v1/proposals/{id}` | ✔ | Xoá đề xuất |
| PATCH | `/api/v1/proposals/{id}/status` | ✔ | Duyệt/từ chối đề xuất |
| GET | `/api/v1/proposals/{id}/merkle-tree` | ✔ | Lấy Merkle tree của các tin nhắn trong đề xuất |
| GET | `/api/v1/proposals/{id}/merkle-proof/{messageId}` | ✔ | Lấy Merkle inclusion proof cho 1 tin nhắn |
| POST | `/api/v1/proposals/{id}/merkle-proof/verify` | ✔ | Xác minh Merkle proof |

**CreateProposalDto**
```json
{ "jobId": "string", "coverLetter": "string", "bidAmount": 0, "estimatedDate": "string" }
```

**UpdateProposalStatusDto**
```json
{ "status": "PENDING", "rejectedReason": "string" }
```
Enum status: `PENDING` | `ACCEPTED` | `REJECTED`

---

## 8. Contracts

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/contracts` | ✔ | Tạo hợp đồng từ đề xuất đã chấp nhận |
| GET | `/api/v1/contracts` | ✔ | Lấy tất cả (filter: skip, take, status) |
| GET | `/api/v1/contracts/proposal/{proposalId}` | ✔ | Hợp đồng theo proposal |
| GET | `/api/v1/contracts/{id}` | ✔ | Chi tiết hợp đồng |
| PATCH | `/api/v1/contracts/{id}` | ✔ | Cập nhật hợp đồng |
| PATCH | `/api/v1/contracts/{id}/status` | ✔ | Cập nhật trạng thái hợp đồng |

**CreateContractDto**
```json
{
  "proposalId": "string", "fundAmount": 0, "deadline": "string",
  "transaction": { "txHash": "string", "txType": "string", "signerId": "string", "truthAnchor": {} }
}
```

Enum status hợp đồng: `ACTIVE` | `FUNDED` | `REVIEW` | `COMPLETED` | `DISPUTED` | `CANCELLED`

**UpdateContractStatusDto**
```json
{ "status": "ACTIVE", "transaction": { "txHash": "string", "txType": "string", "signerId": "string", "truthAnchor": {} } }
```

---

## 9. Evaluations

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/evaluations` | ✔ | Tạo đánh giá cho hợp đồng |
| GET | `/api/v1/evaluations` | ✔ | Lấy tất cả (filter: contractId, reviewerId, skip, take) |
| GET | `/api/v1/evaluations/contract/{contractId}` | ✔ | Đánh giá theo hợp đồng |
| GET | `/api/v1/evaluations/newest` | ✔ | Đánh giá mới nhất của user hiện tại (vai trò Genie) |
| GET | `/api/v1/evaluations/{id}` | ✔ | Chi tiết đánh giá |

**CreateEvaluationDto**
```json
{
  "contractId": "string",
  "metadata": {
    "subInfo": {},
    "data": { "startTime": "string", "location": "string", "endTime": "string", "aladinId": "string", "comment": "string" },
    "calculatableAttributes": { "completed": true, "rating": 0 },
    "intangibleAttributes": {},
    "specializedIntangibleAttributes": {},
    "previousUri": "string"
  }
}
```

---

## 10. Evidences

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/evidences/upload` | ✔ | Upload file bằng chứng lên lưu trữ phi tập trung (multipart) |
| POST | `/api/v1/evidences` | ✔ | Tạo bằng chứng với txId đã có sẵn |
| GET | `/api/v1/evidences` | ✔ | Danh sách bằng chứng (filter: contractId, evidenceType, status, page, limit) |
| GET | `/api/v1/evidences/{id}` | ✔ | Chi tiết bằng chứng |
| PATCH | `/api/v1/evidences/{id}/status` | ✔ | Cập nhật trạng thái bằng chứng |
| GET | `/api/v1/evidences/contract/{contractId}` | ✔ | Bằng chứng theo hợp đồng |

**Upload (multipart/form-data):** `file` (binary, tối đa 10MB), `jobId` (uuid), `evidenceType` (SCOPE | PROOF)
- SCOPE: chỉ Aladin (chủ job) được upload
- PROOF: chỉ Genie (người thực hiện) được upload → tự động chuyển job sang trạng thái REVIEW

**CreateEvidenceDto**
```json
{
  "contractId": "uuid",
  "txId": "abc123xyz-arweave-tx-id",
  "storageIdentifierType": "ARWEAVE",
  "evidenceType": "PROOF",
  "description": "Screenshot of completed work"
}
```

**EvidenceResponseDto (mẫu)**
```json
{
  "id": "uuid", "contractId": "uuid", "txId": "arweave-tx-id-abc123",
  "uploaderId": "stake1...", "storageIdentifierType": "ARWEAVE",
  "evidenceType": "PROOF", "status": "PENDING",
  "description": {}, "rejectedReason": {},
  "url": "https://gateway.irys.xyz/abc123xyz",
  "createdAt": "..."
}
```
Enum: `evidenceType` = SCOPE | PROOF; `status` = PENDING | APPROVED | REJECTED

---

## 11. E2E Live
*Bootstrap cho kiểm thử Playwright MLS stress*

| Method | Path | Header |Mô tả |
|---|---|---|---|
| POST | `/api/v1/test/e2e/playwright/bootstrap` | `X-E2E-Secret` | Khởi tạo một run kiểm thử live |
| DELETE | `/api/v1/test/e2e/playwright/runs/{runId}` | `X-E2E-Secret` | Xoá run đã khởi tạo |
| POST | `/api/v1/test/e2e/playwright/runs/{runId}/actors/{actorId}/fork-device` | `X-E2E-Secret` | Fork thêm thiết bị cho actor |
| PATCH | `/api/v1/test/e2e/playwright/runs/{runId}/actors/{actorId}/devices/{deviceId}/mark-stale` | `X-E2E-Secret` | Backdate `lastSeenAt` |

**BootstrapLiveRunDto**
```json
{ "runId": "pw-live-group-uuid", "scenario": "GROUP_MULTI_USER_STRESS", "actorCount": 20, "devicesPerActor": 1 }
```

---

## 12. Support

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/v1/support/uploads/{id}/file` | ✔ | Lấy ảnh trong support chat từ MinIO |
| POST | `/api/v1/support/uploads` | ✔ | Upload ảnh support chat (multipart, `file`, tối đa 10MB) |

**SupportUploadResponseDto**
```json
{
  "id": "uuid.png",
  "url": "/api/v1/support/uploads/uuid.png/file",
  "mimeType": "image/png",
  "filename": "support-proof.png",
  "sizeBytes": 34567
}
```

---

## 13. Faucets

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/faucets/claim/{paymentAddress}` | ✔ | Claim testnet token (10 tADA + 1001 tLAMP), mỗi tài khoản chỉ 1 lần |
| GET | `/api/v1/faucets/history` | ✔ | Lịch sử claim của user |
| GET | `/api/v1/faucets/status` | ✔ | Kiểm tra đã claim hay chưa |

**FaucetClaimResponseDto**
```json
{
  "success": true, "message": "Faucet claim successful",
  "txHash": "7f4c2b3e...", "walletAddress": "addr_test1qz...",
  "adaAmount": "10000000", "lampAmount": "1001", "status": "SUCCESS"
}
```

---

## 14. Conversations

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/conversations` | ✔ | Tạo hội thoại mới |
| GET | `/api/v1/conversations` | ✔ | Lấy tất cả (filter: skip, take, type) |
| GET | `/api/v1/conversations/ids` | ✔ | Toàn bộ Conversation ID của user hiện tại |
| GET | `/api/v1/conversations/proposal/{proposalId}` | ✔ | Hội thoại theo proposal |
| GET | `/api/v1/conversations/{id}` | ✔ | Chi tiết hội thoại |
| PATCH | `/api/v1/conversations/{id}` | ✔ | Cập nhật hội thoại |
| POST | `/api/v1/conversations/{id}/participants` | ✔ | Thêm thành viên |
| POST | `/api/v1/conversations/{id}/join` | ✔ | Tham gia hội thoại (hoặc tạo join request) |
| PATCH | `/api/v1/conversations/{id}/participants/{userId}` | ✔ | Cập nhật thông tin thành viên (nickname) |
| DELETE | `/api/v1/conversations/{id}/participants/{userId}` | ✔ | Gỡ thành viên |
| POST | `/api/v1/conversations/{id}/leave` | ✔ | Rời hội thoại |
| GET | `/api/v1/conversations/{id}/messages` | ✔ | Lấy tin nhắn của hội thoại (`deviceId` bắt buộc, `limit`, `offset`) |
| POST | `/api/v1/conversations/{id}/archive` | ✔ | Lưu trữ hội thoại vào LampNet (chỉ admin) |

**CreateConversationDto**
```json
{
  "id": "string", "type": "JOB_NEGOTIATION", "proposalId": "string",
  "title": "string", "participantIds": ["string"], "avatar": "string"
}
```
Enum `type`: `JOB_NEGOTIATION` | `DIRECT` | `GROUP`
Enum role thành viên: `ADMIN` | ...

**JoinConversationResponseDto**
```json
{ "action": "JOINED", "conversationId": "string", "requestId": "string", "createdAt": 0 }
```

---

## 15. Member Requests
*Yêu cầu tham gia / mời vào hội thoại (liên quan MLS)*

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/conversations/{conversationId}/member-requests` | Tạo yêu cầu tham gia hội thoại |
| GET | `/api/v1/conversations/{conversationId}/member-requests` | Danh sách yêu cầu (filter: status) |
| POST | `/api/v1/conversations/{conversationId}/member-requests/invite` | Tạo lời mời (pending) cho 1 user |
| POST | `/api/v1/conversations/{conversationId}/member-requests/add-device` | Tạo yêu cầu ADD_DEVICE cho thiết bị mới của người gọi |
| GET | `/api/v1/conversations/{conversationId}/member-requests/my-status` | Trạng thái yêu cầu tham gia của tôi |
| GET | `/api/v1/conversations/{conversationId}/member-requests/my-bootstrap` | Bản ghi bootstrap MLS tự-duyệt (direct/job) |
| POST | `/api/v1/conversations/{conversationId}/member-requests/{requestId}/approve` | Duyệt yêu cầu tham gia |
| POST | `/api/v1/conversations/{conversationId}/member-requests/{requestId}/reject` | Từ chối yêu cầu |
| PATCH | `/api/v1/conversations/{conversationId}/member-requests/{requestId}/mls-bootstrap` | Gắn payload MLS bootstrap vào lời mời đang chờ |
| DELETE | `/api/v1/conversations/{conversationId}/member-requests/{requestId}` | Huỷ yêu cầu/lời mời đang chờ |
| GET | `/api/v1/member-requests/pending` | Lời mời đang chờ của user hiện tại |
| POST | `/api/v1/member-requests/{requestId}/accept` | Chấp nhận lời mời |
| POST | `/api/v1/member-requests/{requestId}/decline` | Từ chối lời mời |

**CreateMemberRequestDto**
```json
{ "conversationId": "string", "type": "INVITE", "message": "string" }
```
Enum `type`: `INVITE` | (các loại khác)
Enum `status`: `PENDING` | `APPROVED` | `REJECTED` | `EXPIRED` | `CANCELLED`

**MemberRequestResponseDto (mẫu)**
```json
{
  "id": "string", "conversationId": "string", "targetUserId": "string", "initiatorId": "string",
  "type": "INVITE", "status": "PENDING", "message": "string", "rejectReason": "string",
  "welcomeMessage": "string", "ratchetTree": "string", "epoch": 0,
  "createdAt": 0, "processedAt": 0, "expiresAt": 0,
  "conversationTitle": "string", "initiatorName": "string"
}
```

**ApproveRequestDto**: `{ "welcomeMessage": "string", "ratchetTree": "string", "epoch": 0 }`
**RejectRequestDto**: `{ "reason": "string" }`

---

## 16. MLS (deprecated) & mls (bootstrap)

### MLS (⚠️ DEPRECATED)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/v1/mls/invites` | Tạo lời mời MLS cho thành viên mới (DEPRECATED) |
| GET | `/api/v1/mls/invites/pending` | Lời mời đang chờ của user (DEPRECATED) |
| POST | `/api/v1/mls/invites/{id}/accept` | Chấp nhận lời mời (DEPRECATED) |
| POST | `/api/v1/mls/invites/{id}/decline` | Từ chối lời mời (DEPRECATED) |

### mls (bootstrap thiết bị mới)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/v1/mls/bootstrap/pending` | Danh sách hội thoại có thể cần bootstrap ADD_DEVICE (`deviceId` bắt buộc) |
| GET | `/api/v1/mls/bootstrap/committer-work` | Danh sách công việc ADD_DEVICE được giao cho thiết bị committer này |

---

## 17. LampNet Storage

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/conversations/{id}/archive` | ✔ (admin) | Lưu trữ hội thoại lên LampNet |
| POST | `/api/v1/media/upload` | ✔ | Upload file media lên LampNet |

Response lỗi đặc trưng: `503` khi LampNet bị tắt hoặc không khả dụng.

---

## 18. Templates (Job Categories)

*Danh mục / mẫu công việc. Nhóm này KHÔNG có trong bản 1.0 của tài liệu — bổ sung
2026-09-08 sau khi đối chiếu lại `GET /api/docs-json` trực tiếp (10 endpoint, tất cả
đều cần Bearer). Schema `CreateJobCategoryDto` / `UpdateJobCategoryDto` đã có sẵn ở
mục 19 từ trước — tức chỉ bảng endpoint bị thiếu, không phải cả nhóm.*

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/v1/templates` | ✔ | Tạo danh mục việc mới |
| GET | `/api/v1/templates` | ✔ | Liệt kê danh mục (query: `slug`, `parentId`, `skip`, `take`) |
| GET | `/api/v1/templates/categories` | ✔ | Lấy toàn bộ slug danh mục |
| GET | `/api/v1/templates/root` | ✔ | Danh mục gốc (không có cha) |
| GET | `/api/v1/templates/slug/{slug}` | ✔ | Mọi phiên bản của một slug |
| GET | `/api/v1/templates/slug/{slug}/latest` | ✔ | Phiên bản mới nhất của slug |
| GET | `/api/v1/templates/{id}` | ✔ | Lấy danh mục theo ID |
| GET | `/api/v1/templates/{id}/children` | ✔ | Danh mục con |
| PATCH | `/api/v1/templates/{id}` | ✔ | Cập nhật danh mục |
| DELETE | `/api/v1/templates/{id}` | ✔ | Xoá danh mục |

> App vỏ Aladin CHƯA gọi nhóm này (`src/services/proofchat-api.ts` không có đường
> `/templates` nào). Ghi ở đây để lần rà sau không tưởng là mình bỏ sót phía app.

---

## 19. Schemas / DTOs tổng hợp

Danh sách toàn bộ schema xuất hiện trong tài liệu (nhiều schema không công khai field chi tiết trên UI):

| Nhóm | Schema |
|---|---|
| Crypto | `CreateCryptoDto`, `UpdateCryptoDto` |
| Auth | `WalletChallengeRequestDto`, `WalletVerifyRequestDto`, `WalletUpdateProfileRequestDto`, `RefreshTokenRequestDto`, `PhoenixKeyApproveDto`, `PhoenixKeyLoginDto`, `LogoutRequestDto` |
| User | `UpdateUserDto` |
| Job | `JobListItemDto`, `SearchJobResponseDto`, `JobsSummaryDto`, `CreateJobDto`, `JobResponseDto`, `UpdateJobDto`, `TransactionResponseDto` |
| Message | `MessageMerkleLeafDto`, `MessageVariantDto`, `CreateMessageDto`, `AddReactionDto`, `SetThumbDto`, `DeleteMessageDto`, `PinMessageDto`, `CastVoteDto`, `ScheduleMessageDto` |
| Trackmess | `ViewSignalItemDto`, `IngestSignalsDto` |
| Job Category | `CreateJobCategoryDto`, `UpdateJobCategoryDto` |
| Proposal | `CreateProposalDto`, `UpdateProposalDto`, `UpdateProposalStatusDto` |
| Contract | `CreateTransactionDto`, `CreateContractDto`, `UpdateContractDto`, `UpdateContractStatusDto` |
| Evaluation | `EvaluationDataDto`, `CalculatableAttributesDto`, `EvaluationMetadataDto`, `CreateEvaluationDto` |
| Evidence | `EvidenceResponseDto`, `CreateEvidenceDto`, `EvidenceWithContractResponseDto`, `PaginationMetaDto`, `PaginatedEvidenceResponseDto`, `UpdateEvidenceStatusDto` |
| E2E | `BootstrapLiveRunDto`, `ForkDeviceBodyDto`, `MarkDeviceStaleBodyDto` |
| Support | `SupportUploadResponseDto` |
| Storage | `CreateStorageDto`, `UpdateStorageDto` |
| Faucet | `FaucetClaimResponseDto`, `FaucetClaimHistoryDto` |
| Conversation | `CreateConversationDto`, `UpdateConversationDto`, `AddParticipantDto`, `JoinConversationDto`, `JoinConversationResponseDto`, `UpdateParticipantDto` |
| Member Request | `CreateMemberRequestDto`, `CreateMemberRequestResponseDto`, `CreateInviteDto`, `CreateAddDeviceRequestDto`, `MemberRequestResponseDto`, `ApproveRequestDto`, `ProcessRequestResponseDto`, `RejectRequestDto`, `AttachInviteMlsBootstrapDto` |
| MLS | `PublishKeyPackageDto`, `BatchKeyPackagesDto`, `CreateMLSInviteDto`, `CreateInviteResponseDto`, `MLSInviteDto`, `AcceptDeclineResponseDto`, `CreateEpochSyncDto` |

> Ghi chú: Nhiều DTO trong Swagger hiển thị schema rỗng `{}` vì controller không khai báo `@ApiBody`/decorator chi tiết cho class-validator — cấu trúc thực tế cần tham chiếu code nguồn NestJS (DTO class) để biết đầy đủ field & kiểu dữ liệu.

---

### Ghi chú chung
- Đa số endpoint yêu cầu xác thực (khoá 🔒 "Authorize" trên Swagger UI dùng JWT/session).
- Prefix chung của API: `/api/v1`.
- Các mã lỗi phổ biến: `400` (invalid request), `403` (not authorized), `404` (not found), `409` (conflict), `503` (dịch vụ phụ trợ không khả dụng, ví dụ LampNet).