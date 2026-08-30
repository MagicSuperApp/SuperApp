# Aladin SuperApp Platform

## Formal Mathematical Specification

**Phiên bản**: v0.2 — DRAFT
**Cập nhật**: 2026-06-17

---

## §1. Abstract

Tài liệu này hình thức hoá và chứng minh các bất biến nền tảng (normative) của Aladin SuperApp Platform — một **nền tảng sản xuất super-app** (L1 Infrastructure). Trọng tâm v0.1 là chứng minh **ba bất biến tử huyệt** ổn định bất kể câu chữ Feat đổi sau review:

1. **INV-SEC (chống RCE — tử huyệt #1)**: hình thức hoá ngôn ngữ config (instance/theme/billing) như một **ngôn ngữ khai báo non-Turing-complete** với văn phạm `𝒢_cfg` có giới hạn (không đệ quy, không eval, không hàm bậc cao). **Theorem 7.1 (Termination)**: mọi đánh giá config dừng trong số bước đa thức theo kích thước AST. **Theorem 7.2 (No-RCE / Closed-form billing)**: ngữ nghĩa đánh giá không sinh được bất kỳ phép tính nào ngoài tập toán tử đóng ⟹ không thực thi mã tuỳ ý; billing hook = công thức đóng.
2. **INV-1 (nhất quán dữ liệu)**: store = nguồn-sự-thật-duy-nhất per-DID; mọi host = thin client ghi qua API versioned. **Theorem 7.3 (CRDT Convergence)** + **Theorem 7.4 (Sovereign-shard SEC)** chứng minh hội tụ mạnh (Strong Eventual Consistency) dưới (a) phân mảnh theo tài phán và (b) multi-device merge offline. **Theorem 7.5 (Durable-outbox No-loss)**: không mất ghi đã commit sau host-kill (idempotency + at-least-once + dedup).
3. **INV-3 (PII erasable + chủ quyền)**: on-chain chỉ chứa commitment hằng-kích-thước. **Theorem 7.6 (On-chain PII-hiding)**: không PPT adversary khôi phục được PII từ chuỗi (hiding của commitment). **Theorem 7.7 (Crypto-shred erasure)**: xoá khoá off-chain ⟹ pointer/ciphertext trở thành không-khôi-phục (IND-CPA).

Kèm: **§8 Attack Model** (module độc hại từ registry permissionless, confused-deputy federation, Sybil, griefing); **§9 Security Theorems** (capability default-deny soundness, token audience-binding, Sybil-cost qua VP geometric — INHERIT); **§12 Conservation Invariants** (bảo toàn LAMP 36 tỷ; demand-sink lock/collect chuyển trạng thái không tạo/mất cung). Residency enforcement + DID signature primitives được INHERIT (LampNet, PhoenixKey, LAMP) — không re-prove ở đây (§13/§14.5).

**Scope**: chứng minh tính chất nền tảng (config-as-DSL, federation convergence, PII erasability, conservation). **Không** cover: nghiệp vụ feature (Work/Trace/Chat — upstream Math), proof-of-residence (LampNet), DID recovery internals (PhoenixKey).

---

## §2. Notation

```
λ           security parameter (mặc định 128 bits)
negl(λ)     negligible function: ∀c>0, negl(λ) < λ^(-c) với λ đủ lớn
PPT         probabilistic polynomial time
x ←_R S     lấy mẫu x đều từ tập S
x ∥ y       nối chuỗi (length-prefixed canonical encoding)
H(·)        hash kháng-va-chạm (BLAKE2b-256 — INHERIT PhoenixKey §3)
Com(m;r)    commitment tới m với randomness r
Enc_k(·)    mã hoá đối xứng AEAD dưới khoá k (IND-CPA / IND-CCA2)
DID         did:phoenix:<slot>:<hash> — định danh pseudonymous (INHERIT PhoenixKey)
𝒢_cfg       văn phạm config khai báo (declarative grammar)
AST         abstract syntax tree của một config document
⟦e⟧_ρ       ngữ nghĩa đánh giá biểu thức config e dưới môi trường ρ (read-only)
size(t)     số node của AST t
depth(t)    chiều sâu lồng nhau tối đa của AST t
ℰ           tập toán tử nguyên thuỷ đóng (closed operator set) — §3.4
𝒱           value vector / version vector: DID-replica → ℕ (counter per replica)
⊔           CRDT merge (join trên semilattice)
⊑           thứ tự bộ phận của semilattice trạng thái store
S_j          shard tài phán j (sovereign shard)
cap_k        ngưỡng tham số VP thứ k (INHERIT VotingPower §1)
VP_i        voting power của cử tri i (INHERIT VotingPower)
protocol_cut_bps   tỷ lệ cắt Treasury, đơn vị basis-point (INHERIT Treasury)
Σcirc(LAMP) tổng LAMP đang lưu hành (circulating)
Σtreas(LAMP) tổng LAMP trong các Treasury instance (accounting)
Σlock(LAMP) tổng LAMP khoá trong UTxO (C4 holding / C2 schedule)
⊥           lỗi / không xác định
∎           kết thúc chứng minh
≜           định nghĩa
```

Custom — config DSL:
```
Lit         literal node (số, chuỗi, bool, enum đã whitelist)
Ref         tham chiếu khoá trong môi trường read-only ρ (token / theme var)
Op(f, a⃗)   áp dụng toán tử nguyên thuỷ f ∈ ℰ lên tham số đã đánh giá a⃗ (arity cố định)
Obj/Arr     bản ghi / mảng hữu hạn, không-đệ-quy-tự-tham-chiếu
```

---

## §3. Cryptographic Primitives & Assumptions

> **Module Boundary (Hard Rule 4)**: Platform-level Math kế thừa primitive từ PhoenixKey Math (DID/chữ ký) và LAMP Math (token conservation). Bảng dưới liệt kê primitive **dùng trực tiếp** trong các theorem nền tảng của tài liệu này; cái nào INHERIT được đánh dấu rõ.

### 3.1 Primitives

| Primitive | Định nghĩa | Standard (URL) | Security level | Nguồn |
|---|---|---|---|---|
| H | {0,1}* → {0,1}²⁵⁶ | [BLAKE2b — RFC 7693](https://www.rfc-editor.org/rfc/rfc7693) | 128-bit collision | INHERIT PhoenixKey |
| Sign | Ed25519 (TAAD key) | [RFC 8032](https://datatracker.ietf.org/doc/html/rfc8032) | EUF-CMA | INHERIT PhoenixKey |
| Sign_hw | ECDSA P-256 (Secure Enclave) | [FIPS 186-5](https://csrc.nist.gov/pubs/fips/186-5/final) | EUF-CMA | INHERIT PhoenixKey |
| Com | Pedersen / hash-commitment | [Pedersen 1991](https://link.springer.com/chapter/10.1007/3-540-46766-1_9) | computationally binding, perfectly/comp. hiding | platform-novel use |
| Enc | AES-256-GCM | [NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800-38d/final) | IND-CCA2 | off-chain PII vault |
| KDF | HKDF-SHA256 | [RFC 5869](https://datatracker.ietf.org/doc/html/rfc5869) | PRF | DEK derivation |
| Token | JWT/JWS audience-bound (issuer EdDSA/JWKS) | [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519) + [RFC 7515](https://datatracker.ietf.org/doc/html/rfc7515) | EUF-CMA on `aud` claim | INHERIT PhoenixKey (issuer-side, Long) |

### 3.2 Hardness Assumptions

- **Collision resistance** của BLAKE2b-256 ([RFC 7693](https://www.rfc-editor.org/rfc/rfc7693)): không PPT adversary tìm `x ≠ x'` với `H(x)=H(x')` xác suất > negl(λ).
- **EUF-CMA** của Ed25519 trên Curve25519 ([Bernstein et al.](https://ed25519.cr.yp.to/ed25519-20110926.pdf)): DLP trên Curve25519 không giải được < 2^λ.
- **IND-CPA/IND-CCA2** của AES-256-GCM ([NIST SP 800-38D](https://csrc.nist.gov/publications/detail/sp/800-38d/final)): ciphertext không phân biệt được với random nếu không có khoá.
- **Computational hiding** của Com ([Pedersen 1991](https://link.springer.com/chapter/10.1007/3-540-46766-1_9)): under DLP, `Com(m;r)` không tiết lộ thông tin về `m`.
- **Random Oracle Model** ([Bellare-Rogaway 1993](https://cseweb.ucsd.edu/~mihir/papers/ro.pdf)) cho các reduction dùng H như RO.

### 3.3 Cross-primitive consistency

Platform mix ECDSA-P256 (hardware) + Ed25519 (TAAD) — **đã được PhoenixKey Math phân tích** (composition qua TAAD tiered recovery; curve assignment ở method.md **§3** DID Document: `hw-key`=EcdsaSecp256r1, taad-key=Ed25519; security analysis ở **§5** Security Considerations). Tài liệu này dùng cả hai như black-box EUF-CMA, không re-derive. AEAD (GCM) + HKDF: chuẩn KDF-then-Enc, không có cross-interference (HKDF output dùng làm khoá độc lập cho GCM). [Sửa H-03 cite-path: trước đây ghi nhầm §6; §6 là Privacy, không liên quan curve/composition.]

> **Dependency (H-05, báo Long — phụ-thuộc-ngoài, KHÔNG phải lỗi Math)**: method.md §3 ghi `hw-key` curve = EcdsaSecp256r1 (P-256), pubkey nén ~33 byte / không nén ~65 byte. NHƯNG PhoenixKey TESTNET-PLAN §A.1 ghi `hw_key_pubkey: 32-byte Ed25519 từ Secure Enclave wrap` — **mâu thuẫn TRONG nguồn PhoenixKey** (P-256 pubkey ≠ 32-byte Ed25519). Math-Spec cite §3 (đúng phía nguồn chuẩn). Assumption §3.3: hw-key curve = P-256 per method.md §3; field naming TESTNET §A.1 (32B Ed25519) cần PhoenixKey reconcile. Loại = phụ-thuộc-ngoài (Long).

### 3.4 Config operator set ℰ (định nghĩa cho INV-SEC)

ℰ là tập **đóng, hữu hạn, total** các toán tử nguyên thuỷ mà platform định nghĩa sẵn — đây là trục then chốt của Theorem 7.1/7.2:

```
ℰ = {  +, −, ×, ÷sat, min, max, clamp,           // số học bão hoà (saturating)
       ==, ≠, <, ≤, >, ≥,                          // so sánh
       ∧, ∨, ¬, ite,                               // logic + if-then-else (eager, không nhánh-lười-đệ-quy)
       concat_n, lookup_finite,                    // chuỗi/bản ghi giới hạn độ dài
       fee_linear, fee_tiered,                     // billing hook = công thức ĐÓNG (§5.2)
       theme_resolve }                             // token override (§5.3)
```

Mỗi `f ∈ ℰ` có **arity cố định**, là **hàm toàn phần (total)**, **không nhận hàm làm tham số** (không higher-order), **không gọi đệ quy**, **không truy cập I/O / code host**. `÷sat` saturating (chia cho 0 → giá trị bão hoà định trước, không ⊥ runtime). Không có toán tử nào trong ℰ cho phép định nghĩa toán tử mới, vòng lặp, hay tham chiếu vòng. **ℰ KHÔNG chứa**: `eval`, `apply`, `lambda`, `fix`/Y-combinator, `import`, `require`, `while`, `goto`, con trỏ hàm.

### 3.4.1 Phân loại purity tường minh của ℰ (axiom — vá H-02/H-13)

> Hai tính chất **purity** và **non-Turing-complete** là ĐỘC LẬP và được đảm bảo bởi hai cơ chế khác nhau. Tài liệu liệt kê tường minh để Thm 7.2(ii) và Inv I5 tham chiếu trực tiếp, KHÔNG suy purity từ tính non-Turing.

**Axiom A-PURE (purity của ℰ)**: Mọi `f ∈ ℰ` là một **hàm toán học thuần** `f: D_f^(arity) → D_f` trên miền giá trị nguyên thuỷ `D = ℤ_sat ∪ 𝔹 ∪ Str_{≤L_max} ∪ Enum_wl` (số bão hoà, bool, chuỗi giới hạn độ dài, enum đã whitelist). Tường minh — KHÔNG toán tử nào trong ℰ:
- thực hiện I/O (đọc/ghi file, mạng, đồng hồ, RNG, biến môi trường host);
- đọc hoặc ghi `store`, `vault`, `chain`, `outbox`, hay bất kỳ trạng thái mutable nào của §4 State Space;
- giữ trạng thái ẩn giữa các lần gọi (mọi `f` là referentially-transparent: cùng đối ⟹ cùng giá trị);
- gọi lại evaluator `⟦·⟧` (xem Bổ đề 3.4.3 no-re-entry).

A-PURE là **định nghĩa của ℰ** (tiền-đề), KHÔNG phải hệ quả của Thm 7.1/7.2. Cơ chế đảm bảo: ℰ là tập đóng do platform cài sẵn (không mở rộng tại runtime — §3.4), nên purity của từng `f` kiểm được bằng inspection tĩnh tại thời điểm định nghĩa platform.

### 3.4.2 Ngữ nghĩa hình thức `theme_resolve` và `lookup_finite` (vá H-01)

> Hai toán tử này là điểm AT-1/AT-2 Hamen nêu (re-parse chuỗi / index trỏ vòng). Định nghĩa miền/đối/giá trị đầy đủ, chứng minh total + first-order + KHÔNG re-entrant + KHÔNG re-parse + index hữu hạn không trỏ vòng.

**Toán tử `theme_resolve : Str_wl → D`** (token override).

- **Miền (đối)**: một tham số duy nhất `k ∈ Str_wl`, trong đó `Str_wl ⊂ Str_{≤L_max}` là **tập khoá token đã whitelist hữu hạn** (DAO-bound, cố định tại deploy). `dom(theme_resolve)` = `Str_wl`. Nếu `k ∉ Str_wl` → reject lúc validate (KHÔNG runtime ⊥).
- **Giá trị**: `D` — giá trị nguyên thuỷ.
- **Định nghĩa (closed-form, KHÔNG đệ quy)**:
  ```
  theme_resolve(k) ≜ Θ[ chain_θ(k) ]
  ```
  với:
  - `Θ : Str_wl → D` là **bảng token TĨNH** (đóng băng từ ρ tại thời điểm validate), ánh xạ MỖI khoá token tới một **giá trị nguyên thuỷ trong D** — KHÔNG bao giờ tới một chuỗi-cần-parse, KHÔNG tới một AST, KHÔNG tới tên toán tử. `Θ` được vật chất hoá (materialized) một lần lúc validate; `theme_resolve` chỉ ĐỌC.
  - `chain_θ : Str_wl → Str_wl` là quan hệ token-trỏ-token (override: token A kế thừa giá trị token B). Resolve theo `chain_θ` đi qua đồ thị hữu hạn `G_θ = (Str_wl, chain_θ)`. **Ràng buộc validate-time TV-θ1**: `G_θ` phải **không có chu trình** (DAG) — kiểm bằng topo-sort lúc validate; nếu có cycle → reject. Do `|Str_wl|` hữu hạn và `G_θ` acyclic, `chain_θ(k)` kết thúc sau ≤ `D_max` bước (độ sâu kế thừa token bị chặn bởi `D_max`).
- **KHÔNG re-parse**: `Θ[·]` trả giá trị thuộc `D` (đã là literal nguyên thuỷ). Ngữ nghĩa `theme_resolve` **không** chứa lời gọi `parse(·)` hay `⟦·⟧` trên giá trị trả về. Một chuỗi trong `D` được đối xử như **dữ liệu chuỗi trơ** (opaque string), KHÔNG bao giờ được tái diễn giải thành cú pháp `op(...)`. Đây chính là đường AT-1 bị đóng tại định nghĩa.

**Toán tử `lookup_finite : Tbl × ℤ_sat → D`** (tra bảng hữu hạn).

- **Miền (đối)**: `(tbl, idx)` với `tbl ∈ Tbl` là **bảng TĨNH** (mảng giá trị nguyên thuỷ `D`, độ dài `|tbl| ≤ L_max`, materialized lúc validate, các phần tử ∈ `D` — KHÔNG chứa AST, KHÔNG chứa Ref, KHÔNG chứa con trỏ tới cấu trúc config khác); `idx ∈ ℤ_sat` là **giá trị số đã đánh giá**.
- **Giá trị**: `D`.
- **Định nghĩa (total, clamp biên)**:
  ```
  lookup_finite(tbl, idx) ≜ tbl[ clamp(idx, 0, |tbl|−1) ]        nếu |tbl| ≥ 1
                          ≜ default_D                              nếu |tbl| = 0
  ```
  `clamp` đưa mọi `idx ∈ ℤ_sat` (kể cả âm / vượt biên) vào `[0, |tbl|−1]` ⟹ **total trên mọi index** trong miền hữu hạn, không ⊥ runtime.
- **KHÔNG self-reference / KHÔNG trỏ vòng**: `tbl` là bảng giá trị nguyên thuỷ ĐÓNG BĂNG; phần tử `tbl[i] ∈ D` KHÔNG phải biểu thức, KHÔNG phải Ref, nên `lookup_finite` **không thể** trả về một con trỏ dẫn ngược vào bảng config hay khởi động một vòng đánh giá. Index `idx` chỉ chọn ô; ô chứa value trơ. Đây chính là đường AT-2 bị đóng tại định nghĩa. **Ràng buộc validate-time TV-L1**: mọi phần tử `tbl[i]` phải là `Lit` (literal nguyên thuỷ) — nếu một phần tử là `Op`/`Ref` → bảng KHÔNG đủ điều kiện làm đối của `lookup_finite` → reject.

**Hệ quả 3.4.2**: cả `theme_resolve` và `lookup_finite` đều **total** (xác định trên toàn miền đối hợp lệ), **first-order** (đối là giá trị nguyên thuỷ, không phải hàm), thoả **A-PURE** (chỉ đọc bảng tĩnh, không I/O, không mutate, không giữ trạng thái). ∎

### 3.4.3 Bổ đề no-re-entry (vá H-01 — chặn AT-1/AT-2)

**Bổ đề 3.4.3 (ℰ đóng dưới no-re-entry)**: Với mọi `f ∈ ℰ`, ngữ nghĩa `f(v₁,…,v_n)` được tính bằng một **bước nguyên thuỷ tất định** trên các giá trị đã đánh giá `vᵢ ∈ D`, và **KHÔNG gọi lại `⟦·⟧`** trên bất kỳ dữ liệu sinh-động nào (không re-enter parser/evaluator).

**Chứng minh**: Xét từng lớp toán tử trong ℰ.
1. *Số học / so sánh / logic* (`+,−,×,÷sat,min,max,clamp,==,…,∧,∨,¬,ite`): mỗi cái là phép toán nguyên thuỷ trên `D`; định nghĩa của chúng không chứa `⟦·⟧` hay `parse`. `ite(c,a,b)` nhận `c,a,b` **đã đánh giá** (eager, §5.1) rồi chọn — KHÔNG đánh giá lại nhánh (không lazy re-entry).
2. *`concat_n`*: nối ≤ `n` chuỗi đã đánh giá, kết quả ∈ `Str_{≤L_max}` (clamp độ dài). Không parse.
3. *`fee_linear`/`fee_tiered`*: hợp thành của `+,×,clamp,Σ` hữu hạn trên `D` (§5.2); `fee_tiered` lặp trên `≤ T_max` tier đã sắp tĩnh. Không `⟦·⟧`.
4. *`theme_resolve`*: theo §3.4.2, chỉ đọc bảng tĩnh `Θ` qua DAG `G_θ` acyclic depth ≤ `D_max`; giá trị trả là literal trơ. KHÔNG `parse`, KHÔNG `⟦·⟧`.
5. *`lookup_finite`*: theo §3.4.2, chỉ chỉ-mục một bảng giá trị tĩnh với index đã clamp. KHÔNG `⟦·⟧`.

Không lớp nào chứa lời gọi tới `⟦·⟧`/`parse`/`eval`. Vậy mọi `f ∈ ℰ` no-re-entrant. ∎

**Hệ quả no-re-entry**: đồ thị phụ thuộc đánh giá của `⟦c⟧_ρ` đúng bằng **AST tĩnh** của `c` (không có cạnh ẩn sinh ra lúc chạy do `f` gọi lại evaluator). Đây là tiền-đề mà Proof Thm 7.1 (μ giảm trên AST tĩnh) dựa vào — nay được chứng minh thay vì giả định ngầm.

---

## §4. System Model

### Entities & Roles

- **U** — người dùng cuối, sở hữu một `DID` (PhoenixKey, pseudonymous).
- **D₁,…,D_m** — thiết bị của cùng một U (multi-device); mỗi thiết bị là một CRDT replica.
- **Store 𝒮** — nguồn-sự-thật-logic per-DID; vật lý có thể **sharded theo tài phán** thành `{S_j}` (sovereign-shard).
- **Host H** — vỏ app / app nhúng; **thin client** (kênh 1+2 ta sở hữu; kênh 3 host ngoài — Phase 2). Host **không** có quyền uy dữ liệu; chỉ ghi qua API versioned.
- **Registry R** — kho module permissionless (đăng ký tự do, DAO hậu kiểm).
- **Capability broker B** — runtime trung gian default-deny giữa module và tài nguyên (data/wallet/biometric).
- **Chain ℬ** — Cardano; lưu commitment hằng-kích-thước (KHÔNG PII).
- **Adversary A** — §8.

### Communication Model

- **Partial synchrony** giữa thiết bị ↔ store (offline-first: thiết bị có thể offline tuỳ ý lâu rồi đồng bộ lại). Kênh ghi: **authenticated** (chữ ký thiết bị / token audience-bound) + **at-least-once delivery** (durable outbox), **không giả định ordered** xuyên thiết bị.
- **Chain finality** (k xác nhận) — INHERIT (OA: §14.5).

### Trust Assumptions

- Trust anchor danh tính = PhoenixKey DID (chữ ký EUF-CMA hold — §13.1).
- Store thực thi version-vector + idempotency đúng (OA1).
- Capability broker B trung thực (mediation đầy đủ — Theorem 9.1 phụ thuộc OA2).
- Residency enforcement = **LampNet** (KHÔNG trust-anchor nội bộ; dependency — §13/§14.5/AS-LN).

### State Space

```
State_t = (
  store:  DID → CvRDT_value,          // semilattice value per object
  vv:     DID → 𝒱,                    // version vector
  outbox: List⟨WriteOp⟩,              // durable, per device
  applied: Set⟨op_id⟩,                // idempotency dedup set
  chain:  List⟨Commitment⟩,           // hằng-kích-thước, no PII
  vault:  DID → Enc_{DEK}(PII)        // off-chain, erasable
)
Initial: store=∅, vv=λd.0⃗, outbox=[], applied=∅, chain=[], vault=∅
```

---

## §5. Protocol Definition

### 5.1 Config evaluation (cho INV-SEC)

```
Protocol: EvalConfig
Participants: Host player (interpreter), config document c
Precondition:  c parse được theo 𝒢_cfg (§6.P0); ρ = read-only env (theme tokens, instance params)
Postcondition: trả về value v ∈ ConcreteUI ∪ BillingParams; KHÔNG side-effect ngoài render

⟦Lit(x)⟧_ρ        = x
⟦Ref(k)⟧_ρ        = ρ[k]            nếu k ∈ dom(ρ) (whitelist); ngược lại reject lúc validate
⟦Op(f, a⃗)⟧_ρ      = f(⟦a₁⟧_ρ, …, ⟦a_n⟧_ρ)     với f ∈ ℰ (arity khớp), eager
⟦Obj{kᵢ:eᵢ}⟧_ρ    = { kᵢ ↦ ⟦eᵢ⟧_ρ }            (kᵢ literal, hữu hạn)
⟦Arr[e₁..e_L]⟧_ρ  = [⟦e₁⟧_ρ, …, ⟦e_L⟧_ρ]       (L ≤ L_max)

Validate-time rejects (trước eval, JSON-Schema + AST walk):
  - node không thuộc {Lit,Ref,Op,Obj,Arr}                → reject
  - Op với f ∉ ℰ hoặc arity sai                          → reject
  - Ref(k) với k ∉ whitelist                             → reject
  - size(c) > N_max  ∨  depth(c) > D_max                 → reject
  - bất kỳ trường nào khớp pattern eval/script/template-code → reject
Security goals: Termination, No-RCE, Closed-form billing (§7.1/7.2)
```

### 5.2 Billing hook (công thức đóng)

```
fee_linear(amount, rate_bps)         = ⌊ amount × clamp(rate_bps, 0, BPS_MAX) / 10000 ⌋
fee_tiered(amount, tiers)            = Σ_j  fee_linear(span_j(amount), tiers[j].rate)
  với tiers độ dài cố định ≤ T_max, span_j cắt amount theo mốc tiers[j].edge (đã sắp)
```
`rate_bps` admin chọn nằm trong RANGE DAO-bound `[0, BPS_MAX]` ([PARAM]). Admin **chỉ chọn tham số**, KHÔNG viết công thức (INV-SEC). `fee_linear`/`fee_tiered` ∈ ℰ — total, đóng, không higher-order.

### 5.3 Store write (cho INV-1)

```
Protocol: Write (thin-client, idempotent, durable)
Participants: Device D, Store 𝒮
Precondition: op = (op_id, DID, obj, Δ, vv_D) ; op_id = H(DID ∥ D ∥ seq_D)  (duy nhất)
Steps:
  1. D: append op vào outbox (durable, fsync); cập nhật vv_D[D]++
  2. D → 𝒮: gửi op (at-least-once; retry tới khi ack)
  3. 𝒮: nếu op_id ∈ applied → trả ack (no-op, idempotent)        // dedup
         ngược lại: store[obj] ← store[obj] ⊔ apply(Δ);            // CRDT join
                    vv_𝒮 ← vv_𝒮 ⊔ vv_D ; applied ← applied ∪ {op_id}
  4. 𝒮 → D: ack(op_id) ; D: xoá op khỏi outbox CHỈ sau ack
Failure modes:
  - host kill giữa bước 1–4 → op còn trong outbox → flush lại khi sống lại (Theorem 7.5)
  - 2 device ghi cùng obj offline → hội tụ qua ⊔ (Theorem 7.3)
```

### 5.4 Sovereign-shard read/write (cho INV-1 federated)

```
Mỗi DID gán shard chủ quyền S_j(DID) (theo residency policy — enforce bởi LampNet).
Write định tuyến tới S_j(DID); cross-shard chỉ trao đổi COMMITMENT + metadata version (không PII).
View per-DID = ⊔ trên các bản sao trong S_j(DID) (Theorem 7.4).
```

### 5.5 PII lifecycle (cho INV-3)

```
On-write:  c = Com(PII; r) hoặc H(pointer) → chain ; PII plaintext KHÔNG lên chain
           vault[DID] ← Enc_{DEK}(PII) off-chain trong S_j(DID)
On-erase:  destroy(DEK) (crypto-shred) ⟹ Enc_{DEK}(PII) không giải được (Theorem 7.7)
           chain giữ c (hằng-kích-thước, hiding — Theorem 7.6) — KHÔNG là PII
```

---

## §6. Properties to Prove

> Anti-pattern tránh: "secure" trần. Mỗi property có loại + bound.

**P0 (Correctness — Config well-formedness)**: ∀ config c pass validate ⟹ AST(c) chỉ chứa node ∈ {Lit,Ref,Op,Obj,Arr}, mọi Op dùng f ∈ ℰ, mọi Ref ∈ whitelist, size ≤ N_max, depth ≤ D_max.

**P1 (Safety — Termination)**: ∀ config c well-formed, ⟦c⟧_ρ dừng sau ≤ poly(size(c)) bước.

**P2 (Safety — No-RCE)**: ∀ config c well-formed, ∀ môi trường ρ, tập hiệu ứng của ⟦c⟧_ρ ⊆ {sinh value thuần qua ℰ}; KHÔNG tồn tại c well-formed mà ⟦c⟧_ρ thực thi toán tử ∉ ℰ hoặc gây side-effect ngoài render. Billing kết quả = ảnh của một hàm đóng trong ℰ.

**P3 (Correctness — Strong Eventual Consistency)**: ∀ tập thiết bị replica nhận cùng tập op (theo thứ tự bất kỳ, lặp tuỳ ý) ⟹ trạng thái store hội tụ về cùng một giá trị (SEC).

**P4 (Safety — Federated convergence)**: P3 vẫn đúng khi store sharded theo tài phán `{S_j}` và cross-shard chỉ trao đổi commitment/metadata.

**P5 (Liveness/Safety — No-loss durable outbox)**: ∀ op đã `append`+`fsync` vào outbox ⟹ op cuối cùng được store apply đúng-một-lần-hiệu-quả, kể cả sau ≤ K_crash lần host-kill.

**P6 (Privacy — On-chain PII-hiding)**: ∀ PPT A quan sát toàn bộ `chain`, Pr[A khôi phục PII | chain] ≤ negl(λ).

**P7 (Privacy — Erasure completeness)**: sau `destroy(DEK)`, ∀ PPT A: Pr[A khôi phục PII từ vault ∪ chain] ≤ negl(λ).

**P8 (Safety — Capability soundness)**: module m chỉ truy cập được tài nguyên trong `granted(m)` (default-deny); Pr[m truy cập r ∉ granted(m)] ≤ negl(λ) dưới mediation đầy đủ (OA2).

**P9 (Safety — Token audience-binding)**: token cấp cho host H₁ không dùng được ở host H₂ ≠ H₁ (chống confused-deputy); Adv ≤ negl(λ) (EUF-CMA trên `aud`).

**P10 (Economic — Sybil-cost)**: chi phí đạt VP mục tiêu ≥ chi phí đóng góp thật tương đương (INHERIT VotingPower — không re-prove, nêu composition §9.4).

**P11 (Conservation — LAMP supply)**: ∀t, `Σcirc + Σtreas + Σlock = 36·10⁹` (hằng), KHÔNG nhánh burn.

---

## §7. Theorems & Proofs

### Theorem 7.1 (Config Termination — INV-SEC phần 1)

**Statement**: Với mọi config `c` well-formed (P0), evaluator `⟦·⟧_ρ` dừng sau số bước `T(c) ≤ size(c)` phép gọi `⟦·⟧`, do đó `T(c) ≤ N_max`.

**Proof** (cấu trúc / well-founded induction trên AST):
Định nghĩa độ đo `μ(t) = size(t)` (số node con kể cả t). `μ` nhận giá trị trong ℕ — well-founded.
- **Base**: `⟦Lit(x)⟧_ρ` và `⟦Ref(k)⟧_ρ` trả ngay trong 1 bước; `μ = 1`.
- **Step**: `⟦Op(f,a⃗)⟧_ρ` gọi `⟦aᵢ⟧_ρ` cho mỗi con `aᵢ` (arity n cố định, hữu hạn), rồi áp `f ∈ ℰ`. Mỗi `aᵢ` là AST con thực sự nhỏ hơn: `μ(aᵢ) < μ(Op(f,a⃗))`. Tương tự `Obj`, `Arr` (số con ≤ L_max hữu hạn). Vì `f` total (mọi `f ∈ ℰ` total theo §3.4) nên áp `f` luôn dừng trong O(1) bước (arity + chiều dài chuỗi cố định).
Theo well-founded induction trên `μ`, mọi gọi `⟦·⟧` trên mọi AST con dừng; tổng số gọi = số node = `size(c) ≤ N_max`. **Điểm then chốt**: `𝒢_cfg` KHÔNG có production đệ quy không-giảm (không có `Ref` trỏ tới định nghĩa của chính mình tạo vòng; cycle bị reject lúc validate vì `Ref` chỉ trỏ vào `ρ` read-only, không trỏ node config khác). Không có toán tử lặp/đệ quy trong ℰ.

**Tính hợp lệ của μ-giảm-trên-AST-tĩnh (đóng AT-1/AT-2)**: Lập luận trên giả định đồ thị phụ thuộc đánh giá đúng bằng AST tĩnh — tức KHÔNG toán tử `f ∈ ℰ` nào sinh cạnh ẩn lúc chạy bằng cách gọi lại `⟦·⟧` trên dữ liệu sinh-động. Tiền-đề này nay được **chứng minh** bởi **Bổ đề 3.4.3 (no-re-entry)** và ngữ nghĩa hình thức §3.4.2: `theme_resolve` resolve qua DAG token `G_θ` acyclic (TV-θ1) depth ≤ `D_max` rồi đọc literal trơ — KHÔNG re-parse chuỗi thành AST (chặn AT-1); `lookup_finite` chỉ-mục bảng tĩnh literal với index đã `clamp` vào `[0,|tbl|−1]` — KHÔNG self-reference, KHÔNG khởi vòng (chặn AT-2). Vậy không toán tử nào mở rộng đồ thị phụ thuộc ngoài AST tĩnh ⟹ không có đường vô hạn. ∎

**Verification status**: Manual (peer-review pending Hamen). Mechanized: planned (Lean — Q-MECH-1, §16).

### Theorem 7.2 (No-RCE & Closed-form billing — INV-SEC phần 2, TỬ HUYỆT #1)

**Statement**: Với mọi config `c` well-formed và mọi `ρ`:
(i) Tập toán tử thực sự áp dụng trong `⟦c⟧_ρ` ⊆ ℰ.
(ii) `⟦c⟧_ρ` không gây side-effect nào ngoài việc trả về một value thuần (render data / billing params); đặc biệt không thực thi mã host, không I/O, không nạp code.
(iii) Mọi billing output là ảnh của một hàm đóng `g: Params → ℕ` lắp từ ℰ; do đó tính được tĩnh, kiểm tra được, giới hạn được.

**Proof**:
*(i) Tập toán tử áp dụng ⊆ ℰ.* Theo P0, mọi node `Op` chỉ mang `f ∈ ℰ` (validate reject `f ∉ ℰ`). Ngữ nghĩa §5.1 chỉ có một quy tắc áp dụng toán tử: `⟦Op(f,a⃗)⟧_ρ = f(...)`. Không quy tắc nào cho phép `f` được sinh động (không có `Ref` trả về toán tử — `ρ` chỉ chứa value nguyên thuỷ đã whitelist, không chứa hàm; §3.4 cấm higher-order). Vậy tập toán tử áp dụng đúng bằng các `f` xuất hiện cú pháp trong `c`, tất cả ∈ ℰ. **Hai toán tử resolve-động `theme_resolve`/`lookup_finite` cũng được bao phủ**: theo §3.4.2 chúng nhận đối nguyên thuỷ (first-order), trả giá trị ∈ `D`, và theo **Bổ đề 3.4.3** KHÔNG gọi lại `⟦·⟧`; nên chúng KHÔNG mở rộng tập toán tử áp dụng ngoài ℰ. (Trước v0.2 đây là tiền-đề chưa kiểm — H-01; nay đóng bằng §3.4.2 + Bổ đề 3.4.3.)

*(ii) Không side-effect ngoài render — suy từ purity, KHÔNG từ non-Turing.* Mệnh đề tách thành **hai claim độc lập** với hai cơ chế khác nhau:

  **(ii-a) No-side-effect ← purity (Axiom A-PURE §3.4.1).** Mọi `f ∈ ℰ` được định nghĩa tường minh là hàm thuần: không I/O, không đọc/ghi store/vault/chain/outbox, không trạng thái ẩn, không re-enter evaluator (A-PURE liệt kê 4 cấm; Bổ đề 3.4.3 chứng minh điều cấm thứ 4 cho TOÀN ℰ kể cả 2 toán tử resolve-động). Các quy tắc ngữ nghĩa §5.1 là cây tính thuần (substitution) trên các `f` thuần này; không construct nào gọi runtime ngoài ℰ. Vì hợp thành của các hàm thuần là hàm thuần, `⟦c⟧_ρ` thuần ⟹ không side-effect ngoài việc trả value (render data / billing params). **Tính no-side-effect đến TỪ A-PURE, KHÔNG suy từ tính non-Turing** — một ngôn ngữ hữu hạn vẫn có thể có toán tử I/O; ℰ không có chỉ vì A-PURE cấm tường minh, không vì nó non-Turing.

  **(ii-b) Non-Turing-complete ← expressiveness (cấu trúc grammar).** `𝒢_cfg` không có production nào ánh xạ sang lệnh thực thi (không `eval`/`import`/`require`), không đệ quy/lặp/higher-order (§3.4, Phụ lục B), JSON-Schema `additionalProperties:false` + AST-walk loại mọi trường executable. Closure ngữ nghĩa = **bounded-depth term algebra** trên ℰ (hẹp hơn primitive-recursive: không có cả đệ quy nguyên thuỷ vì không toán tử lặp). Vậy không tồn tại `c` well-formed nào nhúng được universal-TM.

  **Kết hợp (ii-a)+(ii-b)**: no-side-effect (ii-a) + không-tính-toán-tuỳ-ý (ii-b) ⟹ không thực thi mã host, không I/O, không nạp code ⟹ không RCE. Hai tính chất KHÔNG suy lẫn nhau; mỗi cái có chứng cứ riêng. (Vá H-02: bỏ bước nhảy cóc "non-Turing ⟹ no-side-effect".)

*(iii) Billing = hàm đóng.* Mỗi billing hook là một biểu thức cố định trên `{fee_linear, fee_tiered, +, ×, clamp, …} ⊆ ℰ`, tham số do admin chọn trong RANGE. Vì các toán tử này total và đóng, hợp thành của chúng là một hàm đóng `g`. `g` đánh giá được tĩnh trên mọi đầu vào (Theorem 7.1 dừng); bị chặn bởi `clamp` (rate ∈ [0,BPS_MAX]). ∎

**Hệ quả (Corollary 7.2.1 — invariant ổn định bất kể câu chữ Feat)**: Dù Feat đổi tên feature/đổi danh sách module/đổi UI copy, chừng nào (a) config vẫn parse theo `𝒢_cfg`, (b) ℰ vẫn đóng & total & first-order, (c) validate vẫn reject node ngoài grammar — thì INV-SEC giữ. Ba điều kiện này là **giao diện hình thức** Feat KHÔNG được phá; mọi nhu cầu "logic riêng" PHẢI thành module qua Registry (chịu gate §8/§9), không lẻn vào config.

**Verification status**: Manual (v0.2 — tiền-đề ngữ nghĩa 2 toán tử resolve-động đã đóng bằng §3.4.2 + Bổ đề 3.4.3; vector AT-1 theme_resolve re-parse và AT-2 lookup_finite trỏ vòng do Hamen nêu đã bị chặn TẠI ĐỊNH NGHĨA, không còn là tiền-đề chưa kiểm). Mechanized: planned (Lean — chứng minh `𝒢_cfg ⊭ universal-TM` + formal-hoá A-PURE và Bổ đề no-re-entry, Q-MECH-1). External: audit DSL (Tier 2) = lớp phòng thủ THỨ HAI (kiểm khoảng cách spec↔impl) sau khi proof tiền-đề đã đóng — TRƯỚC khi bật registry permissionless.

### Theorem 7.3 (CRDT Strong Eventual Consistency — INV-1 multi-device)

**Statement (tách 2 mệnh đề — vá H-09)**: Nếu trạng thái object store là một **join-semilattice** `(V, ⊑, ⊔)` và mỗi `WriteOp` áp dụng là một **inflation** (`s ⊑ apply(Δ)(s)`), thì với mọi tập replica nhận cùng tập op (giao hoán, kết hợp, lũy đẳng dưới ⊔):

- **(7.3-SEC) Strong Eventual Consistency — đúng với MỌI mergePolicy hợp lệ (lww / CRDT join-thuần / on-chain-total-order)**: mọi replica đã nhận đủ tập op hội tụ về cùng một giá trị `⊔ᵢ apply(oᵢ)(⊥)`, độc lập thứ tự/số lần delivery. Cùng một DID ghi từ ≥2 thiết bị offline KHÔNG tạo nhánh mâu thuẫn (hội tụ xác định).

- **(7.3-NoLoss) Không mất ghi — chỉ đúng cho CRDT join-thuần (inflation-only, vd G-Set/OR-Set/PN-Counter/grow-only register), KHÔNG đúng cho `lww`**: với policy join-thuần, mọi ghi đều được phản ánh trong giá trị hội tụ (⊔ giữ mọi nhánh). Với policy `lww` (last-writer-wins register theo `(timestamp, deviceId)`): SEC vẫn giữ (7.3-SEC) NHƯNG **mất ghi của writer thua** — đó là bản chất ngữ nghĩa của lww. No-loss của lww chỉ ở mức **register** (giá trị cuối hội tụ xác định), KHÔNG ở mức **mọi ghi** (writer thua bị bỏ). Liên kết **Q-CONF** (§16): object nào dùng policy nào để vừa SEC vừa không-mất-ý-nghĩa-nghiệp-vụ.

Lưu ý chống over-claim (pitfall #8): KHÔNG được phát biểu "Thm 7.3 ⟹ KHÔNG mất ghi" trần — chỉ SEC là phổ quát; no-loss có điều kiện trên lớp policy.

**Proof**: Đây là định lý CRDT chuẩn (Shapiro et al. 2011). `⊔` là **lub** trên semilattice ⟹ commutative (`a⊔b=b⊔a`), associative (`(a⊔b)⊔c=a⊔(b⊔c)`), idempotent (`a⊔a=a`). Hai tính chất sau cho phép apply lặp (at-least-once của outbox §5.3) và mọi thứ tự delivery vẫn cho cùng kết quả: với tập op `{o₁,…,o_k}`, mọi hoán vị/lặp đều cho `⊔ᵢ apply(oᵢ)(⊥)`. Idempotency của `⊔` + dedup `applied` set khiến delivery trùng vô hại. Vậy mọi replica đã nhận đủ tập op hội tụ về cùng giá trị — **(7.3-SEC)**. Trường hợp policy `lww`: dùng register `(timestamp, deviceId, val)` với thứ tự từ điển — vẫn là semilattice (max) ⟹ SEC giữ; NHƯNG `⊔` lww = chọn-một-nhánh-thắng nên **không** thoả inflation-giữ-mọi-nhánh ⟹ **(7.3-NoLoss) KHÔNG áp dụng cho lww** (writer thua mất ghi — đúng ngữ nghĩa lww, không phải lỗi hội tụ). Trường hợp CRDT join-thuần (G-Set/OR-Set/PN-Counter/grow-only): `⊔` giữ mọi nhánh ⟹ cả SEC và NoLoss. `on-chain-total-order`: thứ tự toàn phần từ chain → semilattice tầm thường (SEC; no-loss tuỳ có giữ lịch sử hay không). `mergePolicy` khai trong manifest (F1.5) CHỌN semilattice; module không khai → reject (đóng giả định). ∎

**Mệnh đề phụ (conflict không tự-giải)**: nếu hai cập nhật không so sánh được dưới policy đã chọn (vd hai văn bản tự do khác nhau) → đánh dấu `conflict` cho user/admin, KHÔNG ghi đè im lặng. Đây không phá SEC: trạng thái `conflict{a,b}` bản thân là một phần tử semilattice (tập các nhánh), hội tụ xác định.

**Verification status**: Manual + cite Shapiro 2011 (đã chứng minh hình thức trong literature). Mechanized: SEC của CvRDT có proof Coq trong literature (cite §17).

### Theorem 7.4 (Sovereign-shard preserves SEC — INV-1 federated, giải FZ-04)

**Giả thiết nền (H-SHARD, tường minh — vá H-08)**: Hàm gán shard `S_{j*} : DID → Shard` là **TOÀN PHẦN và ĐƠN TRỊ** (mỗi DID có ĐÚNG MỘT shard chính). Tức: kể cả DID đa-tài-phán (người 2 quốc tịch, tổ chức đa vùng), policy residency phải chọn **một primary jurisdiction xác định** làm `S_{j*}(DID)`; các tài phán khác chỉ giữ **read-replica** (đọc qua commitment, KHÔNG write-path độc lập). Đây là điều kiện well-defined của định lý, KHÔNG phải hệ quả — nếu `S_{j*}` đa-trị thì statement KHÔNG áp dụng (xem Giới hạn + Q-SHARD).

**Statement**: Cho store phân mảnh `{S_j}` theo tài phán và H-SHARD đúng (`S_{j*}` toàn phần + đơn trị). Nếu (a) mọi write của DID định tuyến tới `S_{j*}(DID)`, (b) cross-shard chỉ trao đổi commitment + metadata version-vector (không trao đổi giá trị PII), thì **view per-DID** vẫn thoả SEC (P4), và nhất-quán-LOGIC giữ dù KHÔNG có kho PII toàn cục.

**Proof**: View per-DID `v(DID)` = `⊔` trên các bản sao của DID đó, tất cả nằm trong cùng shard `S_{j*}(DID)` (theo (a)). Trong một shard, Theorem 7.3 áp dụng trực tiếp ⟹ SEC nội-shard. Cross-shard không thay đổi giá trị object của DID (theo (b): chỉ commitment/metadata di chuyển, là hằng-kích-thước, không-PII) ⟹ không có write-path thứ hai tới `v(DID)` từ shard khác ⟹ không tạo nhánh xuyên-shard. "Single source of truth" = `v(DID)` xác định duy nhất bởi `⊔` nội-shard, **độc lập với việc PII nằm vật lý ở đâu** — đây chính là nhất-quán-LOGIC-không-tập-trung-vật-lý (Master INV-1). Magiclamp = protocol operator điều phối commitment giữa shard (neutral), KHÔNG controller toàn cục: nó không bao giờ giữ giá trị PII nên không thể là single point of authority dữ liệu. ∎

**Composition note**: Placement thực tế (đặt `S_{j*}` đúng tài phán) + proof-of-residence = **LampNet enforce** (KHÔNG chứng minh ở đây — §13, AS-LN). Math SuperApp chỉ chứng minh: *nếu* placement đúng *thì* SEC + sovereignty-logic giữ.

**Giới hạn đa-tài-phán-per-DID (vá H-08, hở mô hình đã ghi rõ)**: Proof dựa H-SHARD (đơn-trị). Nếu một DID hợp pháp thuộc ≥2 tài phán mà residency policy KHÔNG chọn được primary đơn nhất (vd luật buộc dữ liệu phải ghi-được tại MỖI tài phán) thì `S_{j*}` đa-trị ⟹ tồn tại 2 write-path ⟹ split-brain xuyên shard (đạt G2) — định lý KHÔNG bao phủ trường hợp này. Hai hướng giải, đánh dấu **Q-SHARD (open)**:
- (i) **Primary-jurisdiction + read-replica** (đang chọn cho v0.2): chọn một shard chính xác định per-DID; tài phán khác là read-replica đồng bộ qua commitment. Giữ H-SHARD đơn-trị ⟹ Thm 7.4 áp dụng nguyên trạng. Đánh đổi: một tài phán "thứ cấp" không có write-authority cục bộ (cần xác nhận đủ tuân thủ pháp lý — câu hỏi residency, không phải Math).
- (ii) **Multi-primary cross-shard merge**: cho phép ≥2 write-path, nhưng phải chứng minh merge xuyên-shard cho DID đa-tài-phán vẫn SEC (cần `⊔` xuyên-shard giao hoán/kết hợp/lũy đẳng + định nghĩa version-vector liên-shard). CHƯA chứng minh — mở rộng mô hình ở v0.x sau, blocked-by residency policy founder.

### Theorem 7.5 (Durable-outbox No-loss — INV-1 host-kill)

**Statement**: Với mọi op đã `append`+`fsync` vào outbox của thiết bị D, sau ≤ K_crash lần host-kill bất kỳ (kể cả giữa gửi/ack), op cuối cùng được store apply với **hiệu ứng đúng-một-lần** (effectively-once). Không op committed nào mất.

**Proof**: Bất biến outbox: *op rời outbox CHỈ sau khi nhận ack từ store* (§5.3 bước 4). 
- *No-loss*: nếu host-kill xảy ra trước ack, op vẫn nằm trong outbox bền (fsync ⟹ tồn tại qua crash, OA1). Khi sống lại, D flush lại op (at-least-once). Quy nạp trên số lần crash `i ≤ K_crash`: mỗi crash giữ nguyên outbox ⟹ op tồn tại tới khi có ack ⟹ cuối cùng store nhận (giả định liveness mạng eventually — §14.5 OA3).
- *Effectively-once*: store dedup bằng `op_id = H(DID∥D∥seq_D)` duy nhất + `applied` set (§5.3 bước 3). Gửi lặp do retry/at-least-once → store thấy `op_id ∈ applied` → no-op. Kết hợp Theorem 7.3 (⊔ idempotent) ⟹ apply nhiều lần = apply một lần. ∎

**Giới hạn trung thực (khớp Feat AC F3.1/F3.7)**: op CHƯA kịp `fsync` vào outbox trước host-kill (vd mất điện ngay lúc thao tác) = mất — đây là giới hạn đã biết, nêu rõ cho user. Recovery DID device-loss: store-as-truth ⟹ máy mới đọc lại được toàn bộ store đã đồng bộ; chỉ op offline chưa đồng bộ trước khi mất máy mới mất (INHERIT PhoenixKey recovery — §13).

### Theorem 7.6 (On-chain PII-hiding — INV-3 phần 1)

**Statement**: ∀ PPT A quan sát toàn bộ `chain` (chỉ chứa `Com(PII;r)` và/hoặc `H(pointer)`), `Pr[A xuất ra PII] ≤ negl(λ)`.

**Proof**: chain chỉ chứa ảnh của commitment/hash hằng-kích-thước. Theo **computational hiding** của Com (§3.2, Pedersen under DLP): `Com(m;r)` với `r ←_R` không phân biệt được phân phối với `Com(m';r')` cho mọi `m,m'` ⟹ A không học gì về `m` ngoài negl(λ). Với `H(pointer)`: pointer có entropy cao (chứa randomness/DEK reference); under RO/collision-resistance, đảo `H` cần `2^λ` ⟹ không khôi phục pointer, càng không khôi phục PII (PII không nằm trong preimage trực tiếp). Vì on-chain KHÔNG BAO GIỜ chứa PII/sinh trắc raw (bất biến write §5.5, khớp Master INV-3 + Non-goal "đặt PII raw on-chain"), không có kênh nào để A trích PII từ chuỗi. ∎

### Theorem 7.7 (Crypto-shred Erasure — INV-3 phần 2)

**Statement**: Sau `destroy(DEK)` (xoá khoá off-chain bất khả-khôi-phục), ∀ PPT A: `Pr[A khôi phục PII từ (vault ∪ chain)] ≤ negl(λ)`.

**Proof**: vault chứa `Enc_{DEK}(PII)` (AES-256-GCM, IND-CPA §3.2). Sau khi DEK bị huỷ, A có ciphertext nhưng không có khoá. Theo IND-CPA, ciphertext không phân biệt được với mã hoá của message random ⟹ A không học PII (Adv ≤ negl(λ)). chain (Theorem 7.6) cũng không tiết lộ PII. Hai nguồn duy nhất chứa dấu vết PII (vault ciphertext + chain commitment) đều computationally độc lập với plaintext sau crypto-shred ⟹ erasure hoàn chỉnh (logical deletion = cryptographic inaccessibility). 

**Điều kiện (OA)**: `destroy(DEK)` thật sự huỷ mọi bản sao DEK (gồm backup, cache) — OA4 (§14.5). Nếu DEK còn sót ở đâu đó (vd LampNet shard chưa shred) thì erasure không hoàn chỉnh — đây là nghĩa vụ Tech (key-shredding protocol) + dependency LampNet. ∎

**Boundary**: cưỡng chế residency của vault (PII phải nằm trong tài phán) = LampNet (không chứng minh ở đây). Math chỉ chứng minh: *nếu* DEK shred *thì* PII không-khôi-phục, bất kể vault nằm đâu.

---

## §8. Attack Model

### 8.1 Adversary Capability (Dolev-Yao + economic)

- **Network**: drop, reorder, inject, replay message giữa thiết bị ↔ store ↔ host (KHÔNG kiểm soát chain finality — OA3).
- **Computational**: PPT bounded; không phá EUF-CMA/IND-CCA2/collision-resistance trừ negl(λ).
- **Registry**: A có thể đăng ký **module độc hại tuỳ ý** vào Registry permissionless (đăng ký tự do, DAO hậu kiểm) — module chạy trong sandbox. ⚠️ **Trạng thái ĐÍCH.** Hôm nay `src/navigation/registry.ts` là sổ TĨNH biên dịch sẵn (4 module, import tĩnh, không dynamic import) — chưa có đường đăng ký nào, nên chưa có bề mặt tấn công này.
- **Host**: ở kênh 3 (Phase 2), host ngoài **hostile-by-default** (WebView có thể đọc/sửa nội dung nó render).
- **Corruption**: A corrupt tới `f` thiết bị của user khác / tới một số DID (Sybil-bounded — §9.4).
- **Economic**: ngân sách $X để mua LAMP / thuê người (phân tích ROI Sybil — §9.4).
- **Config author**: admin/P6 có thể soạn config tuỳ ý (griefing config/billing).

### 8.2 Adversary Goals

- **G1 (RCE)**: nhét code thực thi qua config/theme/billing → chiếm host player xuyên mọi instance. (Tử huyệt #1.)
- **G2 (Data corruption / loss)**: làm store phân nhánh mâu thuẫn hoặc mất ghi qua multi-device/host-kill.
- **G3 (PII exfiltration)**: khôi phục PII/sinh trắc từ chain hoặc từ vault sau erasure.
- **G4 (Privilege escalation)**: module độc hại truy cập data/wallet/biometric ngoài capability được cấp.
- **G5 (Confused-deputy / identity-confusion)**: dùng token cấp cho host H₁ để hành động ở host H₂ (federation).
- **G6 (Sybil)**: tạo nhiều DID giả để chiếm governance / né cost.
- **G7 (Griefing)**: config gây vòng lặp/treo (đã chặn bởi 7.1); billing đặt phí phá hệ; Collect no-op contention (INHERIT Treasury F3).
- **G8 (Supply violation)**: tạo/đốt LAMP qua đường demand-sink.

### 8.3 Attack Tree

| Attack | Capability cần | Cost | Impact | Mitigation (theorem/inherit) |
|---|---|---|---|---|
| Config RCE (G1) | soạn config | thấp | tối đa (RCE xuyên instance) | **Thm 7.1+7.2** (non-Turing, no-eval); validate AST |
| Higher-order injection qua `Ref` | soạn config + biết ρ | thấp | RCE | §3.4 ℰ first-order; ρ chỉ value; Thm 7.2(i) |
| Template-engine code path | tìm trường executable | thấp | RCE | JSON-Schema `additionalProperties:false` + reject pattern (P0) |
| Multi-device split-brain (G2) | 2 thiết bị offline | thấp | phân nhánh dữ liệu | **Thm 7.3** (CRDT SEC); mergePolicy bắt buộc |
| Host-kill data loss (G2) | kill runtime | thấp | mất ghi | **Thm 7.5** (durable outbox + dedup) |
| Cross-shard branch (G2) | ghi 2 shard | trung bình | phân nhánh xuyên tài phán | **Thm 7.4** (write định tuyến 1 shard) |
| PII từ chain (G3) | đọc chain | thấp (public) | lộ PII | **Thm 7.6** (hiding); no-PII-on-chain invariant |
| PII sau erasure (G3) | giữ ciphertext cũ | trung bình | né quyền xoá | **Thm 7.7** (crypto-shred IND-CPA) |
| Malicious module escalation (G4) | đăng ký module | thấp (permissionless) | chiếm data/wallet | **Thm 9.1** (capability default-deny broker) |
| Confused-deputy federation (G5) | có token H₁ | trung bình | mạo danh xuyên host | **Thm 9.2** (token audience-bound) |
| Sybil DID (G6) | $ + thời gian | **cao** (sinh trắc + lịch sử + đốt LAMP) | chiếm governance | **§9.4** INHERIT VotingPower (geometric VP, BFT clamp) |
| Billing griefing (G7) | soạn config | thấp | phá kinh tế instance | clamp rate ∈ RANGE DAO-bound; **Thm 7.2(iii)** |
| Collect no-op contention (G7) | build settlement tx | thấp | DoS Treasury UTxO | INHERIT Treasury F3 (`Σcut>0`) + shard custody |
| LAMP mint/burn (G8) | tương tác Treasury | — | phá tổng cung | **Thm 12.1** INHERIT Treasury §5 (no-burn, value-preserving) |

### 8.4 Trust Boundaries

- **Trong boundary (Math giả định đúng)**: PhoenixKey chữ ký, store version-vector engine, capability broker mediation, chain finality, LAMP conservation contract.
- **Ngoài boundary (treated as adversary)**: host (kênh 3), module registry entries, mạng, config author.

### 8.5 Out-of-scope attacks (explicit)

- Side-channel phần cứng trên Secure Enclave (→ PhoenixKey Math / FIPS audit).
- Tấn công đồng thuận Cardano L1 (→ Ouroboros, ngoài phạm vi).
- Proof-of-residence forgery (→ LampNet Math — dependency).
- Quantum adversary (Ed25519 không post-quantum — ghi nhận limitation §14, migration là roadmap PhoenixKey).
- Social engineering recovery guardian (→ PhoenixKey recovery threat model).

---

## §9. Security Theorems

### Theorem 9.1 (Capability default-deny soundness — chống module độc hại G4)

**Statement**: Cho broker B mediation đầy đủ (mọi truy cập tài nguyên của module m đi qua B — OA2) và chính sách default-deny (`granted(m)` khai tường minh trong manifest, mặc định ∅), thì ∀ tài nguyên `r ∉ granted(m)`: `Pr[m truy cập r] ≤ negl(λ)`.

**Proof**: Mô hình tham chiếu giám sát (reference monitor): B chặn mọi lời gọi tài nguyên; cho phép iff `r ∈ granted(m)`. Default-deny ⟹ tập cho phép = đúng `granted(m)`; mọi `r ∉ granted(m)` bị từ chối tất định (xác suất bypass = xác suất giả mạo capability token của B, bị chặn bởi EUF-CMA của cơ chế ký capability ≤ negl(λ)). Manifest cấm `capabilities:"*"` (F1.3 reject) ⟹ không có đường xin toàn quyền. Sandbox cô lập module khỏi gọi trực tiếp OS/host (bypass B) — đây là OA2 (complete mediation), nghĩa vụ Tech. ∎

**Phụ thuộc**: OA2 (complete mediation) — nếu sandbox có lỗ thoát (module gọi tài nguyên không qua B) thì định lý vỡ ở mức operational, không mức crypto. Đây là lý do registry permissionless cần DAO hậu kiểm + trust-tier (defense-in-depth).

### Theorem 9.2 (Token audience-binding — chống confused-deputy G5)

**Statement**: Cho federation token `τ = Sign_issuer(DID ∥ aud=H₁ ∥ exp ∥ nonce)` với issuer EdDSA (EUF-CMA), token cấp cho host H₁ KHÔNG dùng được ở host H₂ ≠ H₁: `Pr[H₂ dùng τ thành công] ≤ negl(λ)`.

**Proof**: Verifier ở H₂ kiểm `aud == H₂`. Để τ qua, A phải tạo `τ' = Sign_issuer(... aud=H₂ ...)` — tức forge chữ ký issuer trên message mới. Theo EUF-CMA của Ed25519 (§3.2), `Pr[forge] ≤ negl(λ)`. Reuse τ nguyên gốc thất bại vì `aud=H₁ ≠ H₂`. `nonce`+`exp` chống replay trong cửa sổ. Credential/biometric/DID gốc KHÔNG vào WebView host (Non-goal + F3.5) ⟹ H₂ không trích được khoá để tự ký. ∎

**Boundary**: issuer-side EdDSA/JWKS = PhoenixKey (Long) — INHERIT (AS3). Phase 2. Nếu issuer dùng HS256 (khoá đối xứng chia sẻ) thay vì JWKS bất đối xứng thì audience-binding yếu (host biết khoá → tự ký) — đây là lý do Feat yêu cầu chuyển JWKS (KNOWLEDGE §A). Ghi assumption AS3.

### Theorem 9.3 (No-RCE under registry adversary — composition 7.2 + 9.1)

**Statement**: Kể cả khi A đăng ký module độc hại tuỳ ý VÀ soạn config tuỳ ý, A không đạt G1 (RCE xuyên instance qua config): config không nạp được code module (Thm 7.2), và module chỉ chạy trong sandbox với capability default-deny (Thm 9.1). "Logic riêng" buộc thành module → chịu gate, KHÔNG bypass qua config.

**Proof**: Hai đường duy nhất để A chèn logic: (1) qua config — chặn bởi Thm 7.2 (non-Turing, no-eval, không nạp executable; INV-SEC). (2) qua module — module KHÔNG chạy ở host-player-privilege mà trong sandbox + broker (Thm 9.1); không có đường từ module thoát lên thực thi tuỳ ý trên host player khác (cô lập per-instance). Vậy tập đường tấn công RCE = ∅ ở mức crypto/ngữ nghĩa; rủi ro còn lại = operational (lỗ sandbox OA2 / lỗ validate implementation) — chuyển sang nghĩa vụ Tech + external audit. ∎

### 9.4 Sybil resistance (INHERIT VotingPower — KHÔNG re-prove)

Sybil/Byzantine resistance của governance KHÔNG được re-prove ở đây (Hard Rule 4). INHERIT từ `LAMP/Governance/VotingPower/CONTRACT.md`:
- `VP_i = ∏_k min(C_{k,i}, cap_k)^{w_k}` — **công thức NHÂN (geometric)**: yếu một tham số kéo sụp VP ⟹ token đơn thuần không mua được quyền lực (nguyên lý 3).
- Sybil chết từ gốc: DID sinh trắc (1 người = 1 DID) + lịch sử C1 + uy tín C3 + đốt LAMP (nguyên lý 4).
- BFT clamp `VP_eff_i = min(VP_i, ΣVP/BFT_FLOOR)`, `BFT_FLOOR=21` ⟹ không DID > 4.76%; quyết trọng yếu cần ≥21 DID.

**Composition cho SuperApp (P10)**: mỗi instance/module đăng ký Registry sinh cử tri/quyền qua DID — Sybil-cost của SuperApp = Sybil-cost của VP model upstream. SuperApp KHÔNG thêm đường né cost (capability/billing không cấp VP). Điều kiện composition: C1/C2/C4 đọc đúng DID-bound (D4/D9 VotingPower — cross-repo binding). [PARAM] cap_k, w_k = DAO-bound, số cuối ở VotingPower Math.

---

## §10. Game-Theoretic Analysis

> Phần lớn cơ chế kinh tế (VP, Treasury release, fee floor) thuộc upstream (VotingPower/Treasury/MAGIC Math). Ở đây chỉ nêu **incentive-soundness ở mức invariant** cho demand-sink (yêu cầu prompt), số cụ thể [PARAM].

### 10.1 Demand-sink incentive-soundness (mức invariant)

**Player model**:
- Instance/module operator: utility = doanh thu dịch vụ − (phí Collect tier-3 + bond stake). Đăng ký Registry ⟹ trở thành caller `collectToTreasury` (INHERIT Treasury §3).
- DID holder (governance): utility = ảnh hưởng VP − chi phí khoá LAMP (C4 holding) / cam kết forward (C2).

**Tính chất incentive-soundness cần (phát biểu, số ở [PARAM], chứng minh định lượng ở Treasury/VP Math)**:
- **IS1 (cầu nội sinh)**: tăng số instance/module ⟹ tăng số caller `collectToTreasury` ⟹ tăng lượng LAMP hút vào Treasury. Cầu LAMP **tỷ lệ thuận** tăng trưởng platform (giải AS7). Đây là tính chất cấu trúc, không phụ thuộc giá.
- **IS2 (lock-as-commitment)**: C4 holding lock + C2 forward lock chuyển LAMP từ circulating sang locked — **không tạo/mất cung** (Thm 12.1). Khoá là chi-phí-cơ-hội thật ⟹ không mua-quyền-lực-rẻ (khớp VotingPower D8: `w_2+w_4 ≤ w_1+w_3`).
- **IS3 (no race-to-zero)**: sàn phí mạng MAGIC không-thể-zero (F5.4) ⟹ phủ chi phí biên per-DID; ngăn cân bằng phí→0 làm xói hạ tầng. [PARAM] sàn floor.

**Boundary**: `protocol_cut_bps` tối ưu, cap C4 tối ưu, floor MAGIC = **định lượng ở Treasury/VotingPower/MAGIC Math** (Hard Rule 4 — không re-derive). SuperApp Math chỉ khẳng định composition: app-factory + Registry = nguồn caller hợp lệ, conservation giữ (Thm 12.1).

---

## §11. Parameter Justification

> Tham số chưa chốt ghi [PARAM] kèm cấu trúc + ràng buộc (Hard Rule 3 — KHÔNG bịa giá trị). Số cuối nhiều tham số thuộc upstream (Treasury/VP) — INHERIT.

| Parameter | Value | Derived from | Constraint | Range (Feat) / Nguồn |
|---|---|---|---|---|
| λ | 128 bits | NIST SP 800-57 | collision/EUF-CMA bound | INHERIT |
| N_max (config AST size) | [PARAM] | Thm 7.1 (T(c) ≤ N_max) | đủ biểu đạt instance thật ∧ chặn DoS parse; phải pass Gate-A (≥2 instance không cần eval) | derive sau khi đo instance Aladin+TonFarm thật |
| D_max (config depth) | [PARAM] | Thm 7.1 | chặn nesting tấn công; ≥ depth instance thật | đo thực |
| L_max (array length) | [PARAM] | Thm 7.1 | chặn fan-out | đo thực |
| BPS_MAX (billing rate cap) | [PARAM] bps | Thm 7.2(iii) + DAO | rate ∈ [0, BPS_MAX]; chống griefing phí | DAO-bound (Feat §8.1 Tier-2) |
| T_max (số tier billing) | [PARAM] | Thm 7.1 | hữu hạn để total | đo nhu cầu thật |
| protocol_cut_bps | [PARAM] bps | Treasury Math | 0 ≤ cut ≤ 10000 (H2 S-CUT-0) | **INHERIT Treasury** |
| cap_C4 | 100·10⁶ LAMP | VotingPower §1 | chống tập trung | **INHERIT VotingPower** |
| BFT_FLOOR | 21 | VotingPower §2.5 | Nakamoto ≥ 21; trần 4.76% | **INHERIT VotingPower** |
| guardian threshold | ≥2/3 (min 2, max 5 guardians) | PhoenixKey TESTNET §A | recovery liveness vs an toàn | **INHERIT PhoenixKey** |
| recovery collateral | 50 ADA | PhoenixKey §A | chống spam recovery | **INHERIT PhoenixKey** |
| recovery timelock | 7 ngày (mainnet) / 1h (preprod) | PhoenixKey §A | chống chiếm DID nhanh | **INHERIT PhoenixKey** |
| K_crash | — (vô hạn, bị chặn liveness) | Thm 7.5 | outbox bền qua mọi crash | nghĩa vụ Tech (fsync) |
| MAGIC fee floor | [PARAM] | MAGIC Math (IS3) | > 0 (không-thể-zero) | **INHERIT MAGIC** |

**Sensitivity (N_max/D_max)**: chọn nhỏ → có thể không biểu đạt được instance phức tạp → buộc nhiều thứ thành module (Gate-A fail risk). Chọn lớn → bề mặt DoS parse rộng hơn (mitigate: hard cap + Thm 7.1 dừng poly). Trade-off chốt khi đo instance thật (Q9/Gate-A). [NEEDS-EVIDENCE: AST size instance Aladin/TonFarm thật]

---

## §12. Conservation & Invariants

### Invariant I1 (P11 — LAMP supply conservation) — INHERIT Treasury, composition

**Statement**: ∀t, `Σcirc(LAMP)_t + Σtreas(LAMP)_t + Σlock(LAMP)_t = 36·10⁹` (hằng tuyệt đối, KHÔNG nhánh burn).

**Proof** (composition, INHERIT Treasury §5 + §3.2): 
Theo Treasury contract §5: LAMP fixed-supply 36 tỷ, **không có nhánh burn**, không `deflation_bps`. Mọi transition Treasury bảo toàn value tuyệt đối: `Σ out = Σ in` (bất biến §3.2 incremental, T3). "Giảm lưu hành" = chuyển trạng thái circulating → treasury-accounting hoặc circulating → locked-UTxO, KHÔNG huỷ token. 
Quy nạp trên transition:
- `collectToTreasury`: chuyển `cut` từ circulating sang treasury bucket — `Σcirc giảm cut, Σtreas tăng cut`, tổng giữ.
- `C4 holding lock` / `C2 schedule lock`: chuyển từ circulating sang locked UTxO (một-LAMP-một-DID, D4) — `Σcirc giảm, Σlock tăng`, tổng giữ. UTxO bị tiêu khi khoá ⟹ không double-count.
- `Treasury release` (governance-gated): chuyển treasury → circulating, tổng giữ.
- Phạt stake (module/instance vi phạm): chuyển stake → treasury (kế toán), KHÔNG đốt (khớp Feat §8.2).
Không transition nào tạo hoặc huỷ LAMP ⟹ tổng = 36·10⁹ ∀t. ∎

**Composition cho SuperApp**: app-factory thêm caller `collectToTreasury` (mỗi instance/module) nhưng MỌI caller dùng cùng hàm thu bảo-toàn-value (Treasury §3.2) ⟹ thêm instance KHÔNG phá I1. Demand-sink (IS1) = nhiều caller hơn = nhiều chuyển-trạng-thái circulating→treasury hơn, tổng cung bất biến.

### Invariant I2 (DID uniqueness — INHERIT PhoenixKey)

**Statement**: ∀ người thật ⟹ ≤ 1 DID sinh trắc gốc (one-person-one-DID). 
INHERIT PhoenixKey (sinh trắc + zk-proof "1 DID = 1 người" không lộ sinh trắc). KHÔNG re-prove (§13.1). Là nền của Sybil-resistance (§9.4) và one-LAMP-one-DID (D4).

### Invariant I3 (Sequence-monotonicity — INHERIT PhoenixKey, dùng cho INV-1 rotation)

**Statement**: ∀ TAAD state transition, `seq` tăng nghiêm ngặt; tx với `seq ≤ on-chain seq` bị reject. 
INHERIT PhoenixKey method.md **§5 Security Considerations** (mục "Replay prevention": "Every TAAD state transition increments a monotonic sequence number enforced by the on-chain validator. Transactions with `seq ≤ on-chain seq` are rejected"). **Composition cho SuperApp**: khoá thiết bị cũ sau rotation/revocation (F3.9) mất quyền ghi store vì op của nó mang `seq` cũ → store reject (kết hợp idempotency §5.3). KHÔNG re-prove; GAP device-revocation-list = PhoenixKey bổ sung (AS3/DEP-2). [Sửa H-03: cite trước đây ghi nhầm §6 Privacy; replay-prevention/sequence-monotonic thực ở §5 Security Considerations.]

### Invariant I4 (Capability monotonicity)

**Statement**: ∀ module m, ∀t, `accessible(m)_t ⊆ granted(m)` (không leo thang ngầm). 
**Proof**: induction trên transition broker. Khởi tạo `granted(m)` = khai manifest (default ∅). Không transition nào mở rộng `accessible` ngoài `granted` (Thm 9.1 mediation). Thu hồi capability (revoke) chỉ co `accessible`. ∎

### Invariant I5 (Data⟂Experience — INV-2)

**Statement**: ∀ config c (experience layer), apply(c) KHÔNG thay đổi `store` (data layer): `store_{t+1} = store_t` qua mọi thao tác config.
**Proof**: Validate reject mọi config chạm data layer (F7.3): grammar `𝒢_cfg` không có production nào ghi store; `ρ` read-only. **Axiom A-PURE (§3.4.1)** liệt kê tường minh: KHÔNG `f ∈ ℰ` nào đọc/ghi `store/vault/chain/outbox` — đây là tiền-đề đã được formal-hoá (vá H-13: trước v0.2 dựa tiền-đề purity ngầm chung với H-02; nay reference axiom A-PURE thay vì giả định). Eval (§5.1) là hàm thuần trả UI/billing value ⟹ ảnh hưởng experience only. Quy nạp: store chỉ đổi qua Write protocol (§5.3), không qua EvalConfig. ∎

---

## §13. Composition & Boundary

### 13.1 Trust Boundary

**Math GIẢ ĐỊNH (đúng, không re-prove)**:
- PhoenixKey chữ ký EUF-CMA hold; DID one-person-one (I2); sequence-monotonic (I3 — INHERIT method.md **§5** Security Considerations); recovery state machine (`TAADStatus = Active | Recovering | Migrated | Revoked`, guardian 2/3 + 50 ADA + timelock 7d) đúng đặc tả — INHERIT PhoenixKey. **[INHERIT-with-known-gap — H-04, dependency báo Long, KHÔNG phải lỗi Math]**: TESTNET-PLAN §A.1 khai 4 state trong enum nhưng chỉ đặc tả 4 transition Rotate/InitRecovery/Cancel/Finalize — KHÔNG có cạnh nào dẫn tới/ra `Migrated` hay `Revoked`. Math-Spec INHERIT enum đúng nhưng KHÔNG tự định nghĩa transition thiếu (ngoài lane, §13/PhoenixKey backend Claude không sửa); báo Long bổ sung đặc tả cạnh cho `Migrated/Revoked` trước khi gate-out phụ thuộc state đó.
- LAMP conservation contract (Treasury §5) đúng — INHERIT.
- VotingPower geometric + BFT clamp đúng — INHERIT.
- Capability broker complete-mediation (OA2); store version-vector engine đúng (OA1).
- Chain finality (OA3).

**Math KHÔNG GIẢ ĐỊNH (treated as adversary)**:
- Host (kênh 3), module registry entries, mạng, config author.

### 13.2 Composition Theorems

- **Thm 9.3** (sequential composition 7.2 ∘ 9.1): RCE-free under registry adversary.
- **Thm 7.4** (federated composition của 7.3 trên shard): SEC giữ dưới sharding nếu write 1-shard.
- **Thm 12.1** (parallel composition Treasury callers): conservation giữ khi thêm N caller.

### 13.3 External Dependency Failure Mode

- **Nếu LampNet Data Sovereignty vỡ/CHƯA CÓ** (AS-LN / DEP-1): residency KHÔNG cưỡng chế được ở fabric ⟹ INV-3 residency chỉ còn cấu hình mềm. **NOT affected**: Thm 7.6 (hiding), 7.7 (erasure) vẫn đúng (chúng không phụ thuộc placement); chỉ tính chất "PII nằm đúng tài phán" mất. Mitigation: yêu cầu LampNet spec module (đã gửi).
- **Nếu issuer dùng HS256 thay JWKS** (AS3): Thm 9.2 audience-binding yếu. NOT affected: Thm 7.x (data), INV-SEC. Mitigation: chuyển JWKS bất đối xứng (PhoenixKey roadmap).
- **Nếu sandbox có lỗ thoát** (OA2 false): Thm 9.1/9.3 vỡ ở mức operational. NOT affected: config-side INV-SEC (Thm 7.2 thuần ngữ nghĩa, không phụ thuộc sandbox). Mitigation: external audit DSL + sandbox.
- **Nếu PhoenixKey EUF-CMA vỡ**: toàn bộ identity-bound theorem vỡ — đây là single root-of-trust, ngoài phạm vi (catastrophic, cùng giả định mọi hệ Cardano).

---

## §14. Limitations & Out-of-Scope

### 14.1 What Math does NOT prove

- KHÔNG chứng minh proof-of-residence / placement đúng tài phán (→ LampNet Math).
- KHÔNG chứng minh DID recovery internals (guardian threshold soundness, key derivation) (→ PhoenixKey Math).
- KHÔNG chứng minh nghiệp vụ feature (escrow Work, fruit-fingerprint Trace, MLS Chat) (→ upstream Math).
- KHÔNG định lượng `protocol_cut_bps`/cap/floor tối ưu (→ Treasury/VP/MAGIC Math).
- KHÔNG chứng minh post-quantum security (Ed25519 cổ điển).

### 14.2 Known unproven / sketch-level

- Thm 7.1/7.2 mechanization (Lean) PENDING (Q-MECH-1) — hiện manual proof.
- Thm 7.3 dựa CRDT literature (Shapiro 2011) — không re-mechanize.
- OA2 complete-mediation = giả định operational, validate qua audit, KHÔNG proof toán.

### 14.3 Out-of-scope (separate docs)

- Residency enforcement → LampNet Data Sovereignty (CHƯA CÓ).
- Recovery/rotation crypto → PhoenixKey method.md §4 (CRUD: Update/Recovery) + §5 (Security Considerations). [Sửa H-03: không phải §6 Privacy.]
- Token economics định lượng → LAMP Treasury/VotingPower/MAGIC Math.

### 14.5 Operational Assumptions

| ID | Operational Assumption | Basis | Risk if false | Validated by |
|---|---|---|---|---|
| OA1 | Outbox `append` thực `fsync` bền; version-vector engine đúng | RN/SQLite spec | mất ghi / phân nhánh (Thm 7.5/7.3 vỡ) | property-based test (Exec) |
| OA2 | Capability broker complete-mediation; sandbox không lỗ thoát | Tech design | module escalation (Thm 9.1 vỡ) | external audit sandbox |
| OA3 | Chain finality (k xác nhận); mạng eventually-deliver | Cardano stats | liveness Thm 7.5 chậm | on-chain monitor |
| OA4 | `destroy(DEK)` huỷ MỌI bản sao DEK (gồm backup/cache/shard) | key-shred protocol | erasure không hoàn chỉnh (Thm 7.7 vỡ) | shred audit + LampNet dep |
| AS-LN | LampNet bổ sung Data Sovereignty (placement + proof-of-residence) | móng region-tag, CHƯA enforce | INV-3 residency mềm | LampNet spec (đã yêu cầu) |
| AS3 | Issuer PhoenixKey EdDSA/JWKS bất đối xứng sẵn; device-revocation-list bổ sung | recovery core đã có; GAP revocation-list | Thm 9.2 yếu; F3.9 thiếu | PhoenixKey (Long), Phase 2 |

---

## §15. Cross-Spec Contracts

### Math ← Feat (received)
- 4 invariant (INV-1/2/3/SEC) → §6 properties, §7/§12 theorems.
- Threat scope (host hostile-by-default, config-RCE, confused-deputy, Sybil) → §8 attack model.
- Tokenomics intent (demand-sink, LAMP 36 tỷ no-burn) → §10/§12.
- Scale target (offline-first, thiết bị yếu) → §11 (N_max derive sau Gate-A; Q9 cần baseline).

### Math → Tech (sent)
- **MUST implement**: EvalConfig với validate-time AST walk + JSON-Schema `additionalProperties:false` reject mọi node ngoài 𝒢_cfg / f ∉ ℰ / Ref ∉ whitelist (Thm 7.1/7.2); ℰ first-order total (§3.4). **theme_resolve**: bảng token Θ materialized tĩnh (giá trị literal trơ, KHÔNG re-parse), topo-sort đồ thị override `G_θ` reject cycle (TV-θ1, §3.4.2 — chặn AT-1). **lookup_finite**: bảng tĩnh chỉ literal (reject phần tử Op/Ref — TV-L1), index clamp `[0,|tbl|−1]` (chặn AT-2). Đây là nghĩa vụ giữ tiền-đề Bổ đề no-re-entry (§3.4.3) đúng ở impl.
- **MUST runtime-check / enforce**: idempotency `op_id` + `applied` dedup (Thm 7.5); CRDT semilattice merge per `mergePolicy` (Thm 7.3); write định tuyến 1-shard (Thm 7.4); capability broker complete-mediation default-deny (Thm 9.1); token `aud` verify (Thm 9.2); on-chain chỉ commitment hằng-kích-thước (Thm 7.6); DEK crypto-shred (Thm 7.7); LAMP value-preservation per Treasury contract (I1).
- **Hardcode params**: BPS_MAX clamp, N_max/D_max/L_max/T_max bounds (số sau Gate-A), cap_C4=100M, BFT_FLOOR=21, timelock/collateral từ PhoenixKey.
- **Boundary verify**: OA1–OA4 (fsync, sandbox mediation, finality, key-shred).

### Math → Exec (sent)
- Test obligation: property-based test mỗi invariant I1–I5 + SEC (Thm 7.3) qua fuzz multi-device/host-kill; DSL fuzz (config không bao giờ eval — Thm 7.2); crypto-shred test (PII không-khôi-phục sau destroy DEK).
- Audit obligation: external audit DSL/sandbox (Tier 2) TRƯỚC khi bật registry permissionless; INHERIT external audit Treasury/VP/PhoenixKey.

### Math → Feat (feedback)
- N_max/D_max chỉ chốt được sau Gate-A (đo instance thật) — Feat Q9 (baseline) là blocker gate-out: yêu cầu founder cung cấp instance config mẫu.
- Nếu Gate-A fail (config cần Turing-complete để biểu đạt instance) → request Feat re-scope (nhiều thứ thành module hơn) — đã có Exit/Pivot §12.4.

### Math → Math (next version)
- Mechanize Thm 7.1/7.2 (Lean): chứng minh `𝒢_cfg` không nhúng được universal-TM (Q-MECH-1).
- Định lượng N_max/D_max sau Gate-A.
- Tighten Thm 9.3 với mô hình sandbox hình thức (capability machine).

---

## §16. Open Mathematical Questions

| ID | Question | Status | Risk if false |
|---|---|---|---|
| Q-MECH-1 | Mechanize (Lean) `𝒢_cfg ⊭ universal-TM` + formal-hoá A-PURE (§3.4.1) + Bổ đề no-re-entry (§3.4.3) — INV-SEC formal | Planned (v0.2 đã đóng manual tiền-đề 2 toán tử resolve-động; mech còn pending) | Manual gap; RCE nếu grammar có production đệ quy ẩn |
| Q-SHARD | DID đa-tài-phán: primary-jurisdiction+read-replica (giữ H-SHARD đơn-trị) hay multi-primary cross-shard merge SEC? | Open — v0.2 chọn (i) primary+replica; (ii) blocked-by residency policy founder | Split-brain xuyên shard nếu `S_{j*}` đa-trị (Thm 7.4 không bao phủ) |
| Q-NMAX | N_max/D_max đủ biểu đạt instance thật mà không cần Turing-complete? | Open — chờ Gate-A | Gate-A fail → re-scope app-factory |
| Q-OA2 | Sandbox complete-mediation chứng minh được (capability machine model)? | Pending external | Module escalation (Thm 9.1) |
| Q-LN | LampNet proof-of-residence soundness (composition INV-3 residency) | Blocked-by-LampNet | INV-3 residency không cưỡng chế |
| Q-JWKS | Issuer JWKS bất đối xứng sẵn cho audience-binding mạnh (Thm 9.2)? | Blocked-by-PhoenixKey | Confused-deputy Phase 2 |
| Q-CONF | mergePolicy nào cho object nào (lww vs CRDT vs total-order) per feature? | Open (Tech+SG8) | Conflict resolution sai → mất ý nghĩa dữ liệu |

---

## §17. References

```
[1]  RFC 7693 — BLAKE2 Cryptographic Hash. https://www.rfc-editor.org/rfc/rfc7693
[2]  D. Bernstein et al. "Ed25519: high-speed high-security signatures."
     https://ed25519.cr.yp.to/ed25519-20110926.pdf
[3]  RFC 8032 — EdDSA. https://datatracker.ietf.org/doc/html/rfc8032
[4]  NIST FIPS 186-5 — Digital Signature Standard. https://csrc.nist.gov/pubs/fips/186-5/final
[5]  T. Pedersen. "Non-Interactive and Information-Theoretic Secure Verifiable Secret Sharing." CRYPTO'91.
     https://link.springer.com/chapter/10.1007/3-540-46766-1_9
[6]  NIST SP 800-38D — GCM. https://csrc.nist.gov/publications/detail/sp/800-38d/final
[7]  RFC 5869 — HKDF. https://datatracker.ietf.org/doc/html/rfc5869
[8]  RFC 7519 — JSON Web Token (JWT). https://datatracker.ietf.org/doc/html/rfc7519
[9]  RFC 7515 — JSON Web Signature (JWS). https://datatracker.ietf.org/doc/html/rfc7515
[10] M. Bellare, P. Rogaway. "Random Oracles are Practical." CCS'93.
     https://cseweb.ucsd.edu/~mihir/papers/ro.pdf
[11] M. Shapiro, N. Preguiça, C. Baquero, M. Zawirski. "Conflict-free Replicated Data Types." SSS 2011.
     https://inria.hal.science/inria-00609399/document
[12] NIST SP 800-57 Part 1 Rev.5 — Key Management.
     https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final
[INHERIT-1] PhoenixKey did:phoenix method spec. /Users/ductiger/Projects/PhoenixKeyDID/PhoenixKey-SDK/method.md
[INHERIT-2] PhoenixKey TESTNET-PLAN §A (recovery state machine). /Users/ductiger/Projects/PhoenixKeyDID/TESTNET-PLAN.md
[INHERIT-3] LAMP VotingPower CONTRACT. /Users/ductiger/Projects/LAMP/Governance/VotingPower/CONTRACT.md
[INHERIT-4] LAMP Treasury CONTRACT. /Users/ductiger/Projects/LAMP/Treasury/CONTRACT.md
```

> Hard Rule 1: [1]–[12] là RFC/NIST/paper standard URL (cần WebFetch 200 OK verify trước LOCK — chưa verify trong DRAFT này, đánh dấu để format-checker chạy). [INHERIT-*] = đường dẫn nội bộ repo.

---

## §18. Change Log

| Version | Date | Author | Changes | Reviewer |
|---|---|---|---|---|
| v0.2 | 2026-06-17 | Manto | **Vá Round-1 Hamen (3 HIGH + 2 MEDIUM).** **H-01**: thêm §3.4.2 ngữ nghĩa hình thức đầy đủ `theme_resolve` (bảng tĩnh Θ, DAG token `G_θ` acyclic depth≤D_max, KHÔNG re-parse chuỗi thành AST) + `lookup_finite` (bảng tĩnh literal, index clamp `[0,|tbl|−1]`, KHÔNG self-reference); §3.4.3 **Bổ đề no-re-entry** (mọi f∈ℰ KHÔNG gọi lại `⟦·⟧`); sửa Proof Thm 7.1 (μ-giảm-trên-AST-tĩnh nay đứng trên Bổ đề 3.4.3) + Thm 7.2(i) (cover 2 toán tử resolve-động). Chặn vector AT-1 (theme_resolve re-parse) + AT-2 (lookup trỏ vòng) TẠI ĐỊNH NGHĨA. **H-02**: thêm §3.4.1 Axiom **A-PURE** (liệt kê tường minh ℰ pure/total/first-order/no-re-enter); tách Thm 7.2(ii) thành (ii-a) no-side-effect←A-PURE và (ii-b) non-Turing←expressiveness — KHÔNG suy purity từ non-Turing. **H-03**: sửa cite I3 + §3.3 + §14.3 + §13.1: replay/sequence-monotonic INHERIT method.md **§5 Security Considerations** (không §6 Privacy). **H-08**: Thm 7.4 thêm giả thiết tường minh **H-SHARD** (`S_{j*}` toàn phần+đơn trị) + Giới hạn đa-tài-phán-per-DID + Q-SHARD (chọn primary+read-replica cho v0.2). **H-09**: Thm 7.3 Statement tách (7.3-SEC đúng mọi policy) vs (7.3-NoLoss chỉ CRDT join-thuần, KHÔNG lww); chống over-claim "không mất ghi". **H-13**: I5 reference A-PURE. Ghi dependency: **H-04** (Migrated/Revoked thiếu transition — báo Long), **H-05** (hw-key P-256 vs TESTNET 32B Ed25519 — báo Long), **H-12** (N_max [PARAM] — chờ Gate-A/Q9 founder). | (chờ Hamen R2) |
| v0.1 | 2026-06-17 | Manto | Khởi tạo Math-Spec L1. Ưu tiên 3 bất biến tử huyệt: INV-SEC (Thm 7.1 Termination + 7.2 No-RCE/closed-form billing, config-as-DSL non-Turing-complete + ℰ first-order total); INV-1 (Thm 7.3 CRDT SEC + 7.4 sovereign-shard + 7.5 durable-outbox no-loss); INV-3 (Thm 7.6 on-chain hiding + 7.7 crypto-shred erasure). Attack model §8 (registry độc hại, confused-deputy, Sybil, griefing). Security theorems §9 (9.1 capability default-deny, 9.2 token audience-bind, 9.3 no-RCE composition; 9.4 Sybil INHERIT VP). Conservation §12 (I1 LAMP 36 tỷ no-burn INHERIT Treasury; I2-I5). Demand-sink incentive-soundness §10 mức invariant. Params [PARAM] (N_max/D_max chờ Gate-A). | (chờ Hamen R1 + format-checker + bias-checker) |

---

## §19. Appendices

### A. MECE Coverage (invariant × theorem)

| Invariant (Master) | Property | Theorem | Trạng thái |
|---|---|---|---|
| INV-SEC | P0,P1,P2 | Thm 7.1, 7.2, 9.3 | Full proof (manual) — tiền-đề ngữ nghĩa 2 toán tử resolve-động đã đóng (§3.4.2 + Bổ đề no-re-entry §3.4.3, vá H-01); AT-1/AT-2 chặn tại định nghĩa; mech pending (Q-MECH-1) |
| INV-1 (multi-device) | P3,P5 | Thm 7.3, 7.5 | Full (7.3 cite literature) |
| INV-1 (federated) | P4 | Thm 7.4 | Full (placement INHERIT LampNet) |
| INV-2 | I5 | Inv I5 | Full |
| INV-3 (hiding) | P6 | Thm 7.6 | Full |
| INV-3 (erasure) | P7 | Thm 7.7 | Full (OA4 condition) |
| Capability | P8 | Thm 9.1 | Full (OA2 condition) |
| Federation | P9 | Thm 9.2 | Full (AS3 condition) |
| Sybil | P10 | §9.4 | INHERIT VotingPower |
| Conservation | P11 | I1 (Thm 12.1) | INHERIT Treasury |

### B. Config DSL grammar 𝒢_cfg (sketch, BNF)

```
config   ::= obj
obj      ::= "{" (key ":" expr ("," key ":" expr)*)? "}"     // key literal, hữu hạn
arr      ::= "[" (expr ("," expr)*)? "]"                       // length ≤ L_max
expr     ::= lit | ref | op | obj | arr
lit      ::= number | string | bool | enum_whitelisted
ref      ::= "$" key_in_ρ                                      // ρ read-only whitelist
op       ::= fname "(" expr ("," expr)* ")"                    // fname ∈ ℰ, arity cố định
fname    ::= "+" | "−" | "×" | "÷sat" | "min" | "max" | "clamp"
           | "==" | "≠" | "<" | "≤" | ">" | "≥" | "∧" | "∨" | "¬" | "ite"
           | "concat_n" | "lookup_finite" | "fee_linear" | "fee_tiered" | "theme_resolve"
```
KHÔNG production: lambda, apply, eval, import, while, recursion, self-reference. Đây là điểm hình thức của Thm 7.2.

**Ràng buộc validate-time bổ sung cho 2 toán tử resolve-động (§3.4.2)**:
- `theme_resolve(k)`: `k ∈ Str_wl` (whitelist token hữu hạn); bảng token `Θ` materialized tĩnh, mỗi khoá → literal nguyên thuỷ (KHÔNG chuỗi-cần-parse/AST); **TV-θ1**: đồ thị override `G_θ` phải acyclic (topo-sort lúc validate, depth ≤ D_max). KHÔNG re-parse → chặn AT-1.
- `lookup_finite(tbl, idx)`: `tbl` mảng tĩnh literal `|tbl| ≤ L_max`; **TV-L1**: mọi `tbl[i]` phải là `Lit` (reject nếu là `Op`/`Ref`); `idx` clamp vào `[0,|tbl|−1]` (total). KHÔNG self-reference → chặn AT-2.

### C. Test Vectors (cho Tech/Exec verify)

- TV1 (Thm 7.2 reject): config chứa `{"x": "eval(...)"}` → validate reject.
- TV2 (Thm 7.2 reject): config `Op("foobar", [1])` với foobar ∉ ℰ → reject.
- TV3 (Thm 7.3): D1 ghi `set A=1`, D2 ghi `set A=2` offline (policy lww, ts D2 > D1) → hội tụ A=2 ở cả hai; không nhánh.
- TV4 (Thm 7.5): kill host sau append trước ack → flush lại → store apply đúng-một-lần (op_id dedup).
- TV5 (Thm 7.7): write PII → destroy DEK → đọc vault trả ciphertext không-giải-được.
- TV6 (Thm 7.2 / AT-1 — H-01): config với token `Θ[k]` là chuỗi chứa cú pháp `op(...)` (vd `"+(1,2)"`) → `theme_resolve(k)` trả chuỗi trơ `"+(1,2)"`, KHÔNG đánh giá thành 3; và override token tạo cycle `G_θ` (k₁→k₂→k₁) → validate reject (TV-θ1). Xác nhận no re-parse, no eval ẩn.
- TV7 (Thm 7.2 / AT-2 — H-01): `lookup_finite(tbl, idx)` với `tbl` chứa phần tử `Op`/`Ref` → reject (TV-L1); với `idx` âm/vượt biên → clamp, trả ô hợp lệ, KHÔNG ⊥/vòng. Xác nhận no self-reference, total.

---

## Document Metadata

| Field | Value |
|---|---|
| Status | DRAFT |
| Scope level | L1 Platform |
| Math type | A (cryptographic protocol) + D (distributed/CRDT) + E (DSL correctness) |
| Predecessor | PLATFORM-MASTER.md v0.2; Platform-Feat-Spec.md v0.3 |
| Feat-Spec ref | Platform-Feat-Spec.md v0.3 (2026-06-17) |
| Tech-Spec ref | TBD (fan-out sau APPROVED) |
| Exec-Spec ref | TBD |
| Platform deps (INHERIT) | PhoenixKey (DID/recovery/sig), LAMP Treasury (conservation), LAMP VotingPower (Sybil/VP), LampNet (residency — CHƯA CÓ), MAGIC (fee floor) |
| Author | Manto — 2026-06-17 (v0.2) |
| Reviewers (AI) | Hamen R1 NOT_APPROVED (3 HIGH) → Manto vá v0.2 (đóng H-01/02/03/08/09/13) → chờ Hamen R2 + format-checker + bias-checker |
| Reviewers (internal) | (chờ Math lead + Founder) |
| External auditor | N/A (đề xuất: Tier-2 audit DSL/sandbox trước registry permissionless live) |
| Approver | (chờ Founder + Tech Lead) |
| Mechanized proofs | N/A (Q-MECH-1 planned) |
| Publishing target | Internal (default) |

---

## Self-review v0.2 (Manto — đối chiếu ledger Hamen R1)

**Trạng thái 13 entry H-01…H-13 sau vá:**

| id | sev | trạng thái v0.2 | cách đóng / lý do để lại |
|---|---|---|---|
| H-01 | HIGH | **ĐÓNG** | §3.4.2 (ngữ nghĩa đầy đủ theme_resolve/lookup_finite: miền/đối/giá trị) + §3.4.3 (Bổ đề no-re-entry) + sửa Proof Thm 7.1/7.2(i). AT-1 (re-parse) đóng vì Θ trả literal trơ, không `parse`; AT-2 (trỏ vòng) đóng vì bảng tĩnh literal + index clamp + TV-θ1 DAG acyclic. Tiền-đề "2 toán tử total+first-order+non-re-entrant" giờ là ĐỊNH LÝ, không còn giả định ngầm. |
| H-02 | HIGH | **ĐÓNG** | §3.4.1 Axiom A-PURE liệt kê tường minh purity; Thm 7.2(ii) tách (ii-a) no-side-effect←A-PURE và (ii-b) non-Turing←expressiveness. Bỏ bước nhảy "non-Turing ⟹ no-side-effect". |
| H-03 | HIGH | **ĐÓNG** | Sửa I3 + §3.3 + §14.3 + §13.1: cite method.md **§5 Security Considerations** (đã đối chiếu byte-level dòng 167-170: "Replay prevention… monotonic sequence number… `seq ≤ on-chain seq` rejected"). §6 là Privacy. |
| H-04 | MED | **để lại — phụ-thuộc-ngoài** | Migrated/Revoked khai enum nhưng thiếu transition trong TESTNET §A.1 = mâu thuẫn/gap TRONG nguồn PhoenixKey. Ghi INHERIT-with-known-gap ở §13.1, báo Long. Claude KHÔNG sửa PhoenixKey backend (ranh giới). |
| H-05 | MED | **để lại — phụ-thuộc-ngoài** | hw-key P-256 (method.md §3) vs TESTNET §A.1 "32B Ed25519" = mâu thuẫn TRONG nguồn PhoenixKey. Ghi dependency-note §3.3, báo Long. KHÔNG phải lỗi Math (cite §3 đúng phía nguồn chuẩn). |
| H-06 | MED | **để lại — author, chưa vá vòng này** | seq_D-persistence chưa tách OA1b riêng. Ngoài phạm vi 3 HIGH + 2 MEDIUM brief giao; đề xuất đóng ở R2 (tách OA1b hoặc đổi op_id derivation bền). |
| H-07 | MED | **để lại — author, chưa vá vòng này** | conflict-state semilattice embedding chưa chứng minh inflation/idempotent. Brief không liệt; đề xuất R2 (định nghĩa powerset-lattice + embedding) hoặc hạ "claim, mech pending". |
| H-08 | MED | **ĐÓNG** | Thm 7.4 thêm giả thiết tường minh H-SHARD (S_{j*} toàn phần+đơn trị) + Giới hạn đa-tài-phán + Q-SHARD: v0.2 chọn primary-jurisdiction+read-replica (giữ đơn-trị ⟹ proof nguyên trạng); multi-primary merge = mở rộng sau, blocked-by residency founder. |
| H-09 | MED | **ĐÓNG** | Thm 7.3 Statement tách (7.3-SEC: mọi policy) vs (7.3-NoLoss: chỉ CRDT join-thuần, KHÔNG lww). Proof + §1 nhất quán. Chống over-claim pitfall #8. |
| H-10 | LOW | **để lại — format-checker pipeline** | [1]–[12] verify URL 200 OK = nghĩa vụ format-checker trước LOCK, không phải lane Math author. Đã đánh dấu §17. |
| H-11 | LOW | **để lại — cosmetic, chưa vá** | I1 `Σout=Σin` đồng bộ ký hiệu `==` per Treasury F9. Cosmetic, không sai; đề xuất R2. |
| H-12 | gate | **để lại — chờ founder** | N_max/D_max/L_max/T_max [PARAM] chờ Gate-A/Q9 (đo instance Aladin+TonFarm thật). Hard Rule 3 (không bịa). Chặn-gate do dependency, không hạ verdict. |
| H-13 | LOW | **ĐÓNG** | I5 reference Axiom A-PURE (§3.4.1) thay tiền-đề purity ngầm. Mắt xích phụ thuộc H-02 nay vững. |

**Tóm tắt**: đóng **3/3 HIGH** (H-01/02/03) + **2 MEDIUM theo brief** (H-08/09) + H-13 (đi kèm H-02). Để lại: H-04/H-05/H-12 (phụ-thuộc-ngoài, báo Long/founder); H-06/H-07/H-11 (author, MEDIUM/LOW ngoài brief, đề xuất R2); H-10 (format-checker). Theo lộ trình Hamen: vá 3 HIGH ⟹ trần verdict R2 = **CONDITIONALLY_APPROVED** (MEDIUM còn lại + founder-gate không hạ thêm).

---

## Self-review gốc (Manto, v0.1 — giữ làm lịch sử)

Đội mũ adversary, em tự thấy các điểm yếu / [PARAM] / phụ thuộc ngoài:

**Điểm yếu chứng minh:**

1. **Thm 7.2 (No-RCE) là proof ngữ nghĩa, CHƯA mechanized.** Lập luận "𝒢_cfg không nhúng universal-TM" đúng ở mức cấu trúc (không có production đệ quy/lặp/higher-order), nhưng một implementation thật có thể vô tình thêm đường eval (vd `theme_resolve` nếu cho phép string-interpolation gọi lại parser, hoặc `lookup_finite` nếu index là biểu thức động trỏ ngược). **Đây là tử huyệt #1 nên rủi ro residual cao nhất nằm ở khoảng cách spec↔implementation, KHÔNG ở proof.** Mitigation đã ghi: Q-MECH-1 (Lean) + external audit DSL + TV1/TV2. Khuyến nghị mạnh: audit DSL TRƯỚC khi bật registry permissionless.

2. **ℰ định nghĩa đóng nhưng `theme_resolve`/`fee_tiered` chưa formal-hoá chi tiết.** Em khẳng định chúng total + first-order, nhưng chưa viết ngữ nghĩa đầy đủ từng toán tử. Nếu `theme_resolve` cần đệ quy resolve token-trỏ-token thì phải chứng minh đệ quy đó well-founded (depth-bounded). Đã chặn bằng D_max nhưng cần Tech đặc tả `theme_resolve` không tạo cycle. [NEEDS-EVIDENCE: ngữ nghĩa đầy đủ theme_resolve]

3. **Thm 7.3 (SEC) phụ thuộc mọi object là semilattice — nhưng nhiều dữ liệu thật KHÔNG tự nhiên là CRDT** (vd văn bản tự do, counter có ràng buộc nghiệp vụ). mergePolicy `lww` luôn cho semilattice nhưng `lww` MẤT GHI (last-writer-wins bỏ writer thua). Em đã nêu mệnh đề conflict-marker, nhưng ranh giới "object nào dùng policy nào" để vừa SEC vừa không-mất-ý-nghĩa-nghiệp-vụ = Q-CONF, chưa giải. Đây là hở thật của INV-1: SEC ≠ "không mất ghi có ý nghĩa" với lww.

4. **Thm 7.5 effectively-once giả định op_id thật sự duy nhất.** `op_id=H(DID∥D∥seq_D)` duy nhất NẾU `seq_D` strictly-increasing per-device và không reset khi reinstall. Reinstall mất seq_D → có thể trùng op_id → dedup sai. Cần Tech đảm bảo seq_D bền (cùng tầng bền outbox). Ghi OA1 nhưng đáng nhấn mạnh.

5. **Thm 7.4 sovereign-shard giả định mỗi DID có ĐÚNG MỘT shard chính.** Nếu một DID hợp pháp thuộc ≥2 tài phán (người 2 quốc tịch) thì write-1-shard không còn well-defined → có thể split-brain xuyên shard. Chưa xử lý đa-tài-phán-per-DID. Hở mô hình.

6. **§10 demand-sink chỉ phát biểu invariant, KHÔNG có equilibrium proof.** Đúng lane (định lượng thuộc Treasury/VP Math) nhưng IS1 "cầu tỷ lệ thuận tăng trưởng" là tính chất cấu trúc, chưa chứng minh cầu đó ĐỦ LỚN để LAMP có giá trị thị trường — đó là câu hỏi kinh tế vĩ mô ngoài tầm Math formal. Trung thực: Math chỉ đảm bảo conservation + cơ chế hút tồn tại, KHÔNG đảm bảo giá.

**[PARAM] (cấu trúc + ràng buộc, số chờ):**
- N_max, D_max, L_max, T_max (config bounds) — chờ Gate-A đo instance Aladin/TonFarm thật (Q-NMAX).
- BPS_MAX (billing rate cap) — DAO-bound.
- protocol_cut_bps, cap_C4, MAGIC floor — INHERIT (số cuối ở Treasury/VP/MAGIC Math).

**[NEEDS-EVIDENCE]:**
- AST size/depth instance thật (Gate-A).
- Ngữ nghĩa đầy đủ `theme_resolve`/`fee_tiered` (Tech).
- URL verify [1]–[12] (format-checker WebFetch — chưa chạy trong DRAFT).

**Phụ thuộc Tech/Long/LampNet:**
- **Tech**: implement validate-time AST walk đúng (khoảng cách spec↔code là rủi ro #1 — điểm 1); fsync outbox + seq_D bền (điểm 4); complete-mediation sandbox (OA2); crypto-shred mọi bản DEK (OA4); theme_resolve không-cycle (điểm 2).
- **Long (PhoenixKey)**: EUF-CMA issuer JWKS bất đối xứng cho Thm 9.2 (AS3); device-revocation-list cho I3/F3.9 (DEP-2).
- **LampNet**: proof-of-residence + placement cho Thm 7.4/INV-3 residency (AS-LN/DEP-1 — CHƯA CÓ).
