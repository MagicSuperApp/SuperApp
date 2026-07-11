# SG8 — Tích hợp Work (AladinWork · JobMarketplace + escrow Pledge) vào SuperApp

> **Scope level**: L3 Feature Integration Spec (SG8 · F8.1) — chỉ đặc tả TÍCH HỢP app-side.
> **Status**: DRAFT v0.2.0 (2026-07-02) — chờ anh Aladin duyệt trước khi LOCK.
> **Inherit upstream (Hard Rule 4 — KHÔNG re-spec nghiệp vụ)**: `AladinWork/messages/05-SuperApp-spec.md` **v0.2.0** (spec backend đầy đủ: 34 endpoint, auth PhoenixKey **P-256**, 14 màn, mô hình 3 token MAGIC/CARP/LAMP, state machine Pledge, ProofChat token-safety, mô hình dữ liệu) + `aladin-backend` / `JobMarketplace`.
>
> **3 thay đổi cốt lõi so với v0.1 (lý do cập nhật):** (1) DID người dùng = `did:phoenix:<slot>:<hash>` (KHÔNG còn `did:cardano` — nợ ĐÃ GIẢI); (2) chữ ký challenge = **P-256 (secp256r1)** ECDSA/sha256/DER hex (KHÔNG secp256k1); (3) **mô hình 3 token** — MAGIC định giá, CARP thanh toán (Pledge + phí), LAMP backing.
> **Tuân**: PLATFORM-MASTER §4/§8 (SG8), INV-1/INV-3/INV-SEC · INTEGRATION-STANDARD §3/§7/§8 · UI-UX-STANDARD §2/§3/§10/§11.

---

## 0. Một câu định nghĩa

Work = feature module (kiểu **Feature**, hiện thành cụm màn trong vỏ) cho phép người dùng **đăng việc (vai Aladin) hoặc nhận việc (vai Genie) trên sàn AladinWork, khai năng lực có chứng cứ (Stamp/Jem), khớp ứng viên bằng Jem-Math, ký hợp đồng có ký quỹ Pledge (định giá MAGIC, khóa/hoàn bằng CARP) và trao đổi trong việc qua ProofChat E2EE**. Nghiệp vụ do AladinWork sở hữu; SuperApp chỉ **gọi endpoint REST + dựng UI + nối auth PhoenixKey** theo hợp đồng dưới đây.

Vai trò gắn theo hành động (đăng việc = Aladin, nhận việc = Genie), KHÔNG cứng theo tài khoản — vai chọn lúc onboarding chỉ định hướng UI, KHÔNG phải quyền hạn server (upstream §1).

---

## 1. Ranh giới — ai làm gì (NORMATIVE)

Theo UI-UX-STANDARD §2 (Frontend/UIUX ⟂ Backend) + Master §4 boundary:

| Lớp | Sở hữu | Nội dung |
|---|---|---|
| **Backend AladinWork** (`aladin-backend`, Express, ngữ cảnh `/api/v1`) | Team AladinWork | Toàn bộ nghiệp vụ: 34 endpoint, auth challenge/verify, JobType/template, matching Jem-Math, state machine Pledge + escrow, Stamp verify + cấp Jem, Treasury phí 4-ngả, adapter ProofChat/VeData/Cardano. **SuperApp KHÔNG re-implement.** |
| **App-side mobile** (native binding + auth) | SuperApp — **Thư** (mobile) | Nối SDK/relay PhoenixKey thật (QR → ký **P-256 / secp256r1**, khóa Secure Enclave/StrongBox — KHÔNG secp256k1); lưu `session` Bearer + accessToken ProofChat trong Keychain/Keystore; `deviceId` UUID/thiết bị persistent; nhúng WebView ProofChat + cầu `postMessage` origin-checked; vòng đời phiên; build app. |
| **App-side UI** (Frontend/UIUX) | SuperApp — **Tùng** (frontend) | 14 màn (gom cụm §3) + 4 trạng thái mỗi màn; tiêu thụ endpoint REST theo hợp đồng §4 upstream; design token; brand-strip. |

**Ranh giới dữ liệu:** màu/bo-góc/font/spacing = Frontend (UI-UX-STANDARD §3 token). Endpoint/format wire (JSON thô, KHÔNG envelope) + DID + error code + đơn vị thời gian = hợp đồng FE⟂BE (INTEGRATION §3/§7). SuperApp KHÔNG tự định nghĩa nghiệp vụ Work, chỉ *tiêu thụ*.

### 1.1 DID người dùng + Mô hình 3 token (NORMATIVE — inherit upstream §1 v0.2.0)

**DID người dùng = `did:phoenix`.** Danh tính người dùng LUÔN là `did:phoenix:<slot 13 base32>:<hash 64 hex>` (regex `^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$`). Backend đã CHỐT did:phoenix — **nợ `did:cardano`→PhoenixKey ĐÃ GIẢI** (v0.1 dựng theo did:cardano tạm). `did:cardano` chỉ định danh **tài sản** của VeData, KHÔNG dùng cho danh tính người và **KHÔNG được rò vào UI/logic Work**.

**Mô hình 3 token — KHÔNG coi MAGIC là đồng-hợp-đồng duy nhất (đảo mô hình v0.1):**

| Token | Vai | Trong luồng Work |
|---|---|---|
| **MAGIC** | Đơn vị **KẾ TOÁN / ĐỊNH GIÁ** (phi-chuyển-nhượng, decay) | Giá dịch vụ, mức Pledge, phí nền tảng **TÍNH bằng MAGIC** — nhưng MAGIC KHÔNG rời vault, KHÔNG chuyển cho ai. |
| **CARP** | Đồng **THANH TOÁN thật** (chuyển nhượng, ổn định) | **Pledge (khóa/hoàn/forfeit→Treasury) + phí nền tảng GIỮ và CHUYỂN bằng CARP.** Số dư khả dụng để trả = `walletCARP`. |
| **LAMP** | **Backing ẩn** | Không xuất hiện trực tiếp trong luồng hợp đồng. |

**Quy tắc vàng: giá/phí TÍNH bằng MAGIC nhưng GIỮ/CHUYỂN bằng CARP.** Pledge ghi "300 MAGIC" là đơn vị định giá; số CARP thực khóa được quy đổi từ mức MAGIC đó. Hệ quả cho UI:
- `/me` trả **3 ví**: `walletMAGIC` (định giá), `walletCARP` (số dư thanh toán khả dụng), `walletLAMP` (backing). SuperApp hiển thị đủ 3 nhưng số dư "khả dụng để trả" = CARP.
- Nhãn tiền UI Pledge/phí: **"định giá MAGIC · khóa/hoàn bằng CARP"** (helper `pledgeLabel`, `toUiWallet` trong `data/adapters.ts`).
- Lỗi `402 NO_FUNDS` = thiếu **CARP** (KHÔNG phải MAGIC) → thông điệp "thiếu CARP để khóa Pledge/trả phí".
- Treasury phí 4-ngả (`{ magiclamp, aladinwork, app, rice }`) thu bằng **CARP** (định giá MAGIC).
- Giá dịch vụ (VND) vẫn trả OFF-CHAIN giữa 2 bên; nền tảng KHÔNG cầm tiền công, chỉ giữ cờ `vndPaid` làm trigger settle.

---

## 2. Xác thực PhoenixKey (inherit upstream §2)

Nguyên lý (first-principles): chứng minh "tôi là chủ DID" = ký một **challenge** ngẫu nhiên bằng khóa riêng ứng với public key PhoenixKey đã neo. Server KHÔNG giữ khóa riêng; resolve pubkey qua PhoenixKey rồi verify cục bộ bằng **P-256 (secp256r1 / prime256v1)**, hash `sha256`. AladinWork tự cấp phiên HMAC riêng (TTL 12 giờ), độc lập session PhoenixKey.

🔴 **Đường cong = P-256, KHÔNG phải secp256k1.** HW_Key PhoenixKey sinh trong **Secure Enclave (iOS) / StrongBox (Android)** — các module này CHỈ đẻ được P-256. W3C DID document PhoenixKey ghi thẳng "KHÔNG secp256k1". Verifier server dùng `@noble/curves/p256` (mirror `PhoenixKey-SDK verifier.ts`), skew ±60 giây, KHÔNG ép `lowS`. Client PHẢI mặc định P-256 khi verify/render danh tính.

**DID người dùng = `did:phoenix`** (regex `^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$`). App-side nên validate DID theo regex TRƯỚC khi gọi `/auth/challenge` (chặn sớm, tránh 1 vòng mạng thừa) — helper `isValidPhoenixDid` trong `services/types.ts`.

**Luồng 3 bước (mobile — Thư):**

| Bước | Gọi | Ghi chú tích hợp app |
|---|---|---|
| 1. Xin challenge | `POST /auth/challenge` `{ did }` | `did` PHẢI khớp regex did:phoenix (sai → `400 BAD_INPUT`). Nhận `{ challenge, domain, issuedAt, expiresAt, messageTemplate }`; nonce 1-lần, TTL 5 phút. `domain` LẤY từ response (server luôn dùng domain server-side). |
| 2. Ký (client/PhoenixKey) | — | dựng `` `${challenge}:${domain}:${timestamp}` ``; hash `sha256`; ký **P-256 (secp256r1) ECDSA** bằng khóa riêng DID (Secure Enclave/StrongBox) → `signature` DER hex. `timestamp` = **GIÂY epoch** (`Math.floor(Date.now()/1000)`). |
| 3. Xác minh | `POST /auth/verify` `{ did, challenge, signature, timestamp }` | nhận `{ ok, did, pubkey, session, expiresAt, accountCreated }`. `session` = vé Bearer. |

- `accountCreated === true` → DID lần đầu → đưa vào onboarding (chọn vai trò, tên/avatar).
- `session` gửi lại mọi request qua header `Authorization: Bearer <session>` (middleware fallback `x-session`). `expiresAt` phiên = **MILI-GIÂY epoch**.
- Phiên hết hạn 12 giờ, KHÔNG refresh-token → nhận `401 UNAUTH` bất kỳ đâu = coi phiên hỏng, điều hướng đăng nhập lại (lặp bước 1–3).

**Bảng mã lỗi — phân biệt 401 (danh tính/chữ ký) ⟂ 503 (dịch vụ chết), NORMATIVE cho UI trạng thái:**

| Status | reason | UI phải hiển thị |
|---|---|---|
| 401 | `BAD_INPUT` / `BAD_DID` | "thông tin đăng nhập chưa đúng" |
| 401 | `NO_CHALLENGE` / `CHALLENGE_EXPIRED` / `CHALLENGE_MISMATCH` | "phiên ký hết hạn — quét lại QR" |
| 401 | `BAD_DOMAIN` / `TIMESTAMP_SKEW` | "đồng bộ lại rồi thử lại" |
| 401 | `SIGNATURE_INVALID` | "chữ ký không hợp lệ" |
| 401 | `DID_NOT_REGISTERED` | "DID chưa neo trên PhoenixKey" |
| 503 | `PHOENIXKEY_UNAVAILABLE` | "hệ định danh tạm gián đoạn, thử lại sau" (KHÁC hẳn sai chữ ký — cho giám sát + retry) |

**Đơn vị thời gian (nguồn lỗi hay gặp — nêu rõ):** `timestamp` ký challenge = **GIÂY** epoch; `expiresAt` phiên + `availableFrom/availableUntil` = **MILI-GIÂY** epoch. Nhầm đơn vị → `TIMESTAMP_SKEW` hoặc availability sai cửa sổ.

**Ranh giới token (mobile — Thư):** `session` lưu Keychain/Keystore, **KHÔNG localStorage**. KHÔNG log, KHÔNG nhét token vào URL/query.

---

## 3. Nhóm màn (gom 14 màn upstream §3 thành cụm — mỗi cụm nêu endpoint + trạng thái bắt buộc)

Mọi màn (trừ Đăng nhập) yêu cầu phiên hợp lệ; chưa đăng nhập → điều hướng Đăng nhập. **KHÔNG chép lại 34 endpoint** — hợp đồng đầy đủ (body/response/lỗi) ở upstream §4. Mỗi cụm chỉ trỏ endpoint dùng + trạng thái state machine bắt buộc.

| Cụm | Màn upstream | Endpoint chính (§4 upstream) | Trạng thái bắt buộc |
|---|---|---|---|
| **A. Đăng nhập / Onboarding** | 3.1 Đăng nhập, 3.2 Onboarding, 3.3 Trang chủ | `POST /auth/challenge`, `POST /auth/verify`, `GET /me` | `accountCreated` → onboarding; 401 reason vs 503 (§2). Vai trò lưu cục bộ, KHÔNG gửi server. |
| **B. Đăng & duyệt việc** (Aladin) | 3.4 Danh mục JobType, 3.5 Đăng việc, 3.6 Danh sách việc, 3.7 Chi tiết việc | `GET /templates` `/:key`, `GET /jobs?openOnly=1`, `GET /jobs/:id`, `POST /jobs` | `404 NO_TEMPLATE`, `400 BAD_INPUT`, `404 NO_JOB`, `409 JOB_CLOSED`. Rỗng → trạng thái rỗng + nút Đăng việc. Ghi rõ tiền công VND trả OFF-CHAIN. |
| **C. Khớp ứng viên** | 3.8 Khớp ứng viên | `GET /jobs/:id/match` (public đọc) | Không ứng viên đạt → rỗng, gợi ý nới yêu cầu. Cờ `qualified` + `available` hiển thị rõ. |
| **D. Hợp đồng + state machine Pledge** | 3.9 Tạo/xem hợp đồng | `POST /contracts`, `GET /contracts` `/:id`, `POST /contracts/:id/:action` | State: `INIT→PENDING→COMMITTED→ACTIVE→DELIVERED→RELEASED` (+ `FORFEITED`/`DISPUTED`/`FROZEN`/`SETTLED`). Nút hành động ĐÚNG thứ tự: `lockPledge{side,amount}`→`activate`→(`evidence/register` nếu cần)→`deliver`→`confirmPayment`→`mutualRelease`. **Nhãn tiền: "định giá MAGIC · khóa/hoàn bằng CARP"** (`pledgeLabel`); số dư khả dụng = `walletCARP`. Lỗi: `409 ESCROW_RULE` (sai bước), **`402 NO_FUNDS` (thiếu CARP)**, `400 NO_EVIDENCE` (deliver thiếu bằng chứng), `403 FORBIDDEN` (không phải 2 bên). |
| **E. Năng lực / Jem** (Genie) | 3.12 Huy hiệu, 3.13 Hồ sơ/năng lực | `GET /me`, `POST /capabilities`, `POST /capabilities/:id/verify` | Hồ sơ hiển thị **3 ví** `walletMAGIC`/`walletCARP`/`walletLAMP` (số dư khả dụng = CARP — dùng `toUiWallet`). Khai → `pending` (tier D) → verify → `verified` + nâng hạng. Lỗi verify: `404 NO_CRED`, `409 ALREADY`, `422 STAMP_INVALID`. Jem đọc từ `me.jems[]`; chưa có → rỗng. |
| **F. Khai sẵn sàng** (Genie) | 3.11 Khai sẵn sàng | `GET/POST/DELETE /availability`, `GET /availability/:did` | Body POST `{ availableFrom, availableUntil, skills?, note? }` = **epoch ms** (`until >= from`). Chưa khai → `{ available:false }` (an toàn: mặc định KHÔNG sẵn sàng). Lỗi `400 BAD_INPUT`. |
| **G. Admin JobType** | 3.14 Quản lý JobType | `POST/PATCH/DELETE /templates[/:key]` (auth + admin) | Chỉ `account.kind==='admin'` \| `isAdmin` \| `roles⊇{admin,operator}`. Không admin → `403 FORBIDDEN`; validate sai → `400 BAD_TEMPLATE`/`BAD_DIM`/`FORBIDDEN_DIM_COMBO`; trùng seed → `409 SEED_CONFLICT`. |

**Tiêu thụ API (UI-UX §2.2 + INTEGRATION §7.3):** mọi lỗi phân biệt mạng ⟂ quyền ⟂ server; timeout → error; KHÔNG nuốt lỗi. Body wire JSON thô (`{ error, code }`), dùng đúng `code` BE trả, không tự bọc/đổi. Mọi màn feature đủ **4 trạng thái** loading/empty/offline/error (UI-UX §10).

---

## 4. Nhúng ProofChat + quy tắc AN TOÀN token (inherit upstream §6 — NORMATIVE, ĐIỂM SỐNG CÒN)

Chat trong việc (màn upstream 3.10) = ProofChat E2EE, loại `JOB_NEGOTIATION`, participants = 2 DID hợp đồng. AladinWork chỉ **mở/tham chiếu** conversation (`POST/GET /contracts/:id/conversation` → `conversationId`); SuperApp là bên trực tiếp render chat.

**Thứ tự khởi động (mobile — Thư):**
1. PhoenixKey login → `sessionToken`.
2. `POST https://api.proofchat.app/api/v1/auth/phoenixkey/login` `{ sessionToken }` → `{ accessToken, refreshToken, userDid }` (accessToken 15 phút, tự refresh; refreshToken 7 ngày, rotate).
3. `POST /contracts/:id/conversation` (backend AladinWork) → `conversationId`.
4. Render: dùng `accessToken` gọi trực tiếp API ProofChat, hoặc nhúng WebView FE ProofChat.

**Ràng buộc cứng — KHÔNG được vi phạm (INV-3 + INTEGRATION §3):**

- **KHÔNG BAO GIỜ** token trong URL/query-string. accessToken CHỈ đặt header `Authorization: Bearer <accessToken>` (hoặc `postMessage` khi nhúng WebView). Tránh rò qua log/referrer.
- Nhúng WebView: truyền token qua **`postMessage` sau khi frame load, origin-checked**, KHÔNG qua `?token=` trên URL nhúng.
- `session` (AladinWork) + `accessToken`/`refreshToken` (ProofChat) lưu **Keychain/Keystore**, KHÔNG `localStorage`.
- Tin nhắn = **ciphertext E2EE**; server ProofChat KHÔNG thấy plaintext. `createdAt` do client tạo (ký trong MerkleLeaf), KHÔNG override.
- Định danh participants bằng **PhoenixKey DID** (`participantIds[]`/`userDid`), KHÔNG `stakeAddress`.
- `deviceId` = 1 UUID/thiết bị, tạo khi cài, lưu persistent (cần khi lấy tin nhắn + build variants + đăng KeyPackage MLS).
- ProofChat chưa cấu hình (`PROOFCHAT_URL` trống / thiếu accessToken) → conversation trả `status:'unconfigured'`, `conversationId:null` — job vẫn tạo được, chat nối sau (KHÔNG vỡ luồng).

---

## 5. Phạm vi bản NÀY — làm được NGAY (upstream §5/§8)

Luồng Work end-to-end trên dev backend: đăng nhập PhoenixKey (ký **P-256**) → đăng việc → khai năng lực + verify → khớp ứng viên → tạo hợp đồng → vòng đời Pledge (`lockPledge`→…→`mutualRelease`) → cấp Jem + phí Treasury. Cả 3 token là accounting **OFF-CHAIN** (`/me.walletMAGIC` định giá, `/me.walletCARP` thanh toán Pledge/phí, `/me.walletLAMP` backing); Pledge/phí ghi sổ trên CARP. **Test thực địa được ngay** trên backend dev. Chat nối khi ProofChat cấu hình; escrow Cardano tùy chọn (không bắt buộc luồng cốt lõi).

**Schema chốt 1 lần — swap off-chain ↔ on-chain KHÔNG đổi (upstream §8):** 3 token (MAGIC định giá / CARP thanh toán Pledge+phí / LAMP backing), TreeID/Stamp (bằng chứng), conversation (chat) định nghĩa qua interface ổn định. Khi 3 token lên chain thật, invariant (bảo toàn Σ CARP khóa+hoàn, floor Pledge định giá MAGIC, 4-ngả phí CARP, `allAnchored` gate) GIỮ NGUYÊN. SuperApp build theo schema upstream §5 MỘT LẦN, không sửa khi backend chuyển on-chain.

---

## 6. Nợ kỹ thuật + phần chưa sẵn sàng (upstream §7 — AladinWork làm trước, SuperApp cập nhật sau)

| Hạng mục | Trạng thái upstream | SuperApp làm sau | Ràng buộc thiết kế NGAY |
|---|---|---|---|
| **DID: `did:phoenix` (nợ did:cardano ĐÃ GIẢI)** | ✅ Backend CHỐT `did:phoenix:<slot>:<hash>` (regex `^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$`) cho danh tính người | — | did:cardano chỉ cho **tài sản** VeData, **KHÔNG rò vào UI/logic** danh tính người (INV-2). App validate DID theo regex did:phoenix trước khi ký (`isValidPhoenixDid`). |
| **QR PhoenixKey thật** | App tham chiếu mới có placeholder QR + demo dev-only (tự ký) | Nối SDK/relay PhoenixKey thật lấy chữ ký **P-256 (secp256r1)** từ Secure Enclave/StrongBox | Interface `challenge/verify` đã cố định — chỉ thay nguồn chữ ký. 🔴 Đường cong = **P-256, KHÔNG secp256k1**. Production BỎ "tài khoản thử" dev-only. |
| **3 token thật (on-chain)** | Nay cả 3 token accounting OFF-CHAIN — `walletMAGIC` (định giá), `walletCARP` (thanh toán Pledge/phí), `walletLAMP` (backing), escrow ghi sổ trên CARP | UI số dư 3 ví thật + lịch sử | Build UI theo `/me` 3 ví; số dư khả dụng = CARP; `402 NO_FUNDS`=thiếu CARP. **Schema KHÔNG đổi khi swap on-chain** — quy tắc: định giá MAGIC, thanh toán CARP. Ghi rõ "thử nghiệm". |
| **ProofChat token exchange (production)** | Adapter AladinWork KHÔNG tự đổi `sessionToken→accessToken` — việc tầng auth SuperApp/ProofChat | Nối JWKS + staging ProofChat; đổi token + MLS KeyPackage | Chat nối sau; conversation `unconfigured` KHÔNG vỡ job (§4). |
| **Cardano Preview escrow** (`/contracts/:id/onchain`) | Chỉ chạy khi cấu hình seed/blockfrost; chưa → `503 CARDANO_OFF` | Màn ví on-chain khi bật | Không bắt buộc luồng cốt lõi (Pledge off-chain đã đủ). |
| **Bằng chứng VeData `tree_id`** | Định danh + neo on-chain thuộc VeData/OriLife; Work chỉ tham chiếu | Cập nhật khi Mosaic mainnet | Gate `deliver` bằng `allAnchored`; pilot chạy Preview/mock. |
| **Availability + template động persistence** | `availability` lưu **in-memory** (mất khi restart tới khi wire vào account doc); template động = SQLite riêng | — | Không ảnh hưởng interface; cứ gọi endpoint §4 upstream. |

---

## 7. Cross-spec contracts (§13 pointer)

- **Danh tính** → PhoenixKey (inherit, không redefine) — INTEGRATION §3.1. DID người dùng = `did:phoenix` (nợ did:cardano ĐÃ GIẢI); did:cardano chỉ cho tài sản VeData, KHÔNG rò vào UI.
- **Ví/token** → SG5 Wallet (LAMP/MAGIC/CARP dùng chung); Work hiển thị **3 ví** (MAGIC định giá / CARP thanh toán / LAMP backing), Pledge+phí định giá MAGIC nhưng khóa/hoàn bằng CARP; KHÔNG tự cầm/chia tiền công VND (2 bên tự trả off-chain).
- **Chat** → ProofChat (E2EE MLS, F8.3 outbound dependency — spec ProofChat đang yêu cầu). Token-safety §4 là ràng buộc cứng.
- **Design system** → UI-UX-STANDARD (token dùng chung mọi platform).
- **Nghiệp vụ Work** → `AladinWork/messages/05-SuperApp-spec.md` (nguồn sự thật đầy đủ; bản NÀY KHÔNG re-spec).

---

## 8. Checklist READY (subset INTEGRATION §8 — Work-relevant; evidence output thật)

- [ ] Zero hardcode màu; chỉ tiêu thụ design token (lint CI xanh).
- [ ] Brand-strip về app chủ (kênh 1+2).
- [ ] `session` + accessToken ProofChat chỉ trong Keychain/Keystore; KHÔNG localStorage, KHÔNG log, KHÔNG vào URL (INV-3, §2/§4).
- [ ] Tin nhắn ProofChat E2EE ciphertext; token qua header/`postMessage` origin-checked; participants = PhoenixKey DID.
- [ ] Đủ 4 trạng thái loading/empty/offline/error mọi màn Work.
- [ ] Route/navSlot đăng ký theo navigation grammar (INTEGRATION §7.1), nav config-driven.
- [ ] Lỗi phân biệt mạng ⟂ quyền ⟂ server; 401 reason ⟂ 503 `PHOENIXKEY_UNAVAILABLE` hiển thị khác nhau; có retry.
- [ ] DID người dùng = `did:phoenix` (regex validate trước khi ký, `isValidPhoenixDid`); `did:cardano` KHÔNG rò vào UI/logic.
- [ ] Chữ ký challenge = **P-256 (secp256r1)** ECDSA/sha256/DER hex — KHÔNG secp256k1 (mọi comment/interface đã sửa).
- [ ] 3 ví hiển thị đúng: `walletMAGIC`/`walletCARP`/`walletLAMP`; số dư khả dụng = CARP; Pledge/phí nhãn "định giá MAGIC · khóa/hoàn CARP"; `402 NO_FUNDS` báo "thiếu CARP".
- [ ] Đơn vị thời gian đúng: `timestamp` ký = giây; `expiresAt`/availability = ms.
- [ ] State machine Pledge: nút hành động đúng thứ tự; `deliver` chặn khi `NO_EVIDENCE`; xử lý `409 ESCROW_RULE`/`402 NO_FUNDS` (thiếu CARP).
- [ ] **Verify (CLAUDE.md)**: `curl` từng endpoint (`/auth/challenge`→`/verify`, `/jobs`, `/contracts/:id/:action`, `/availability`) với payload thật trên backend dev; RN `analyze + test` CI xanh; chạy end-to-end đăng-nhập→hợp-đồng→Jem có evidence output thật.

---

## 9. Change Log
- **v0.2.0 (2026-07-02): Đồng bộ upstream 05-SuperApp-spec v0.2.0 — 3 thay đổi cốt lõi.** (1) **DID người dùng = `did:phoenix`** (regex `^did:phoenix:[a-z2-7]{13}:[0-9a-f]{64}$`) — nợ `did:cardano`→PhoenixKey **ĐÃ GIẢI** (backend chốt did:phoenix); did:cardano chỉ cho tài sản VeData, KHÔNG rò vào UI. (2) **Chữ ký challenge = P-256 (secp256r1)** ECDSA/sha256/DER hex — thay mọi `secp256k1` (HW_Key Secure Enclave/StrongBox chỉ đẻ P-256; verifier `@noble/curves/p256`, skew ±60s, không lowS). (3) **Mô hình 3 token** (đảo mô hình "MAGIC là đồng-hợp-đồng duy nhất"): MAGIC = định giá/kế toán (phi-chuyển-nhượng), CARP = thanh toán thật (Pledge khóa/hoàn/forfeit + phí nền tảng), LAMP = backing ẩn; quy tắc vàng "định giá MAGIC · giữ/chuyển CARP"; `/me` trả 3 ví; `402 NO_FUNDS`=thiếu CARP; Treasury 4-ngả thu CARP. Cập nhật §1.1 (mới), §2 (P-256+regex), cụm D/E §3, §5, §6, §7, §8. Code: `types.ts` (walletCARP + DID regex + P-256 comment), `adapters.ts` (`toUiWallet`/`pledgeLabel`), `useWorkAuth.ts`/`workApi.ts`/`session.ts` (P-256 + validate did:phoenix), 3 screen nhãn tiền. Chờ anh duyệt.
- v0.1 (2026-07-01): Khởi tạo spec tích hợp Work app-side (SG8 · F8.1) từ message AladinWork `05-SuperApp-spec.md`. Khoá ranh giới BE AladinWork ⟂ mobile Thư ⟂ UI Tùng; auth PhoenixKey challenge/verify (giây vs ms, 401 reason ⟂ 503); gom 14 màn thành 7 cụm (trỏ §4 upstream, KHÔNG chép 34 endpoint); state machine Pledge; ProofChat token-safety (ràng buộc cứng — KHÔNG token trong URL, Keychain, E2EE ciphertext, postMessage origin-checked); nợ `did:cardano`→PhoenixKey (cô lập adapter, INV-2), off-chain→on-chain schema giữ nguyên. Chờ anh duyệt.
