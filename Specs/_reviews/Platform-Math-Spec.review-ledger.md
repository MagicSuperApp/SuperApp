# Platform-Math-Spec — Review Ledger (Hamen)

> **Đối tượng**: `/Users/ductiger/Projects/SuperApp/Specs/Platform-Math-Spec.md` v0.1 (DRAFT, Manto, 2026-06-17)
> **Reviewer**: Hamen (Math-Spec adversary) · **Vai**: adversarial verifier — phá chứng minh, không co-author, không approver cuối
> **Chuẩn đối chiếu**: Math-Spec.standard.md v1.5 · HARD-RULES.md v1.0 (11 rules) · hamen 3-axis MECE (theorem verification | attack model | bottleneck & optimality) + 7 M-extensions
> **Nguồn invariant**: PLATFORM-MASTER v0.2 (§2 INV-1/2/3/SEC) · Platform-Feat-Spec v0.3 §13
> **Nguồn INHERIT đã đối chiếu byte-level**: VotingPower CONTRACT (geometric VP, BFT clamp 21, D4/D8/D9) · Treasury CONTRACT (§5 no-burn, §3 collect, F9) · PhoenixKey method.md (§5 replay, §6 privacy) · PhoenixKey TESTNET-PLAN §A (recovery state machine)
> **Scope verify**: **L1 Platform/Infrastructure** (Doc Metadata) → proof depth = Full proof, mechanized cho critical (INV-SEC). Manual proof + mech-pending = chấp nhận DRAFT, nhưng L1 critical theorem KHÔNG mechanized là điểm trừ Gate-out.

---

## Round 1 — 2026-06-17

### MECE Axis 1: Theorem verification

- **Theorems checked**: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 9.1, 9.2, 9.3 + Invariants I1–I5 = 15 mệnh đề.
- **Proof gaps phát hiện**: H-01 (theme_resolve/lookup_finite không có ngữ nghĩa → Thm 7.1/7.2 có lỗ), H-02 (Thm 7.2(ii) nhảy cóc "non-Turing ⟹ no side-effect"), H-08 (Thm 7.4 đa-tài-phán-per-DID), H-09 (Thm 7.3 lww mất-ghi-có-nghĩa), H-13 (I5 dùng Thm 9.1 chưa chứng minh ℰ không mutate).
- **Case enumeration thiếu**: Thm 7.3 không liệt kê đủ các `mergePolicy` (lww/CRDT/on-chain-total-order) là semilattice — chỉ chứng minh lww + total-order, KHÔNG chứng minh "CRDT" generic (H-09).

### MECE Axis 2: Attack model

- **Adversary capability**: §8.1 đầy đủ (Dolev-Yao + economic + registry permissionless + host hostile). VERIFIED đủ mạnh.
- **Composition attacks tự xây**: xem **§ "Thử bẻ Thm 7.2"** dưới. Kết quả: KHÔNG bẻ được ở mức ngữ nghĩa-thuần với ℰ như §3.4 định nghĩa, NHƯNG bẻ được nếu `theme_resolve` re-enter parser (H-01) — spec không đóng đường này bằng proof. → Thm 7.2 ĐÚNG CÓ ĐIỀU KIỆN, điều kiện chưa được chứng minh trong spec.
- **Trust assumptions**: OA1–OA4 + AS-LN + AS3 tách bạch tốt. Gaps: OA cho seq_D bền (H-06) chưa tách thành OA riêng.

### MECE Axis 3: Bottleneck & optimality

- **Conservation invariant I1**: `Σcirc+Σtreas+Σlock=36·10⁹` ∀t — proof induction OK, cite Treasury §5 ĐÚNG. Nhưng: chiều collect Treasury F9 đã đổi `≥`→`==` (Treasury CONTRACT §11 F9), Math-Spec §5.2/I1 vẫn ngụ ý `Σout=Σin` chung-chung; không sai nhưng nên đồng bộ ký hiệu (H-11, LOW).
- **NE margin**: §10 KHÔNG có equilibrium proof (đúng lane — định lượng thuộc Treasury/VP). NHƯNG IS2 cite VotingPower D8 `w_2+w_4 ≤ w_1+w_3` — VERIFIED khớp CONTRACT D8. IS3 floor [PARAM] OK.
- **Parameter sensitivity**: N_max/D_max/L_max/T_max đều [PARAM] chờ Gate-A — đúng Hard Rule 3/9 (không bịa). NHƯNG đây CHẶN Gate-out sang Tech (H-12): standard §1 Gate-out yêu cầu "mọi parameter §11 có số cụ thể". Phụ-thuộc-ngoài (Q9 founder), không phải lỗi author.

---

### Thử bẻ Thm 7.2 (No-RCE) — kết quả đối kháng (yêu cầu đặc biệt của brief)

Tôi xây 5 vector tấn công nhằm đạt "tính toán tùy ý / RCE" qua config well-formed:

| # | Vector tấn công | Bẻ được? | Lý do |
|---|---|---|---|
| AT-1 | `theme_resolve(k)` với ρ[k] là chuỗi chứa cú pháp `op(...)` → buộc interpreter parse-lại giá trị token (token-trỏ-token / string-interpolation) | **CÓ ĐIỀU KIỆN** | Spec KHÔNG định nghĩa ngữ nghĩa `theme_resolve`. Lập luận Thm 7.1 (μ giảm trên **AST tĩnh**) KHÔNG bao phủ trường hợp toán tử đọc ρ rồi nội suy chuỗi cần re-parse. Nếu impl cho phép → đường eval ẩn = RCE. **Đây là lỗ PROOF, không chỉ impl** (Manto self-review #1/#2 chạm nhưng đóng khung là "khoảng cách spec↔impl"; thực ra proof 7.1 chưa cover toán tử resolve-động). |
| AT-2 | `lookup_finite(tbl, idx)` với `idx` là biểu thức trỏ ngược vào chính bảng config (self-reference qua index động) tạo vòng | **CÓ ĐIỀU KIỆN** | `lookup_finite` không có ngữ nghĩa. Thm 7.1 chặn cycle bằng "Ref chỉ trỏ ρ", NHƯNG `lookup_finite` là Op nhận index đã-đánh-giá — nếu index có thể trỏ vào cấu trúc config khác (không phải ρ), vòng phục hồi. Spec chưa chứng minh `lookup_finite` total trên mọi index trong [0,L_max] mà không tái nhập. |
| AT-3 | Higher-order injection qua `Ref` trả về tên toán tử (`Op(Ref(k), a⃗)` với ρ[k]="eval") | **KHÔNG** | Thm 7.2(i) đúng: ngữ nghĩa §5.1 chỉ có `⟦Op(f,a⃗)⟧=f(...)` với f xuất hiện **cú pháp**; ρ chỉ chứa value nguyên thủy (§3.4 cấm higher-order). Validate reject f∉ℰ. Đường này ĐÓNG. |
| AT-4 | Template/eval string field lẻn qua JSON (`{"x":"${eval(...)}"}`) | **KHÔNG** | P0 validate: JSON-Schema `additionalProperties:false` + reject pattern eval/script/template (§5.1). TV1 cover. ĐÓNG ở mức spec (đk: impl walk AST đúng — OA, không phải proof gap). |
| AT-5 | `fee_tiered` với tiers length động > T_max hoặc edge chưa-sắp tạo vòng tính | **KHÔNG** | T_max hữu hạn + tiers "đã sắp" + fee_linear total. Bounded. ĐÓNG (đk: T_max [PARAM] hữu hạn). |

**KẾT LUẬN thử bẻ Thm 7.2**: **KHÔNG bẻ được Thm 7.2 như phát biểu CHO TẬP ℰ first-order total ĐÚNG NGHĨA §3.4.** Phần (i) (tập toán tử ⊆ ℰ) và (iii) (billing closed-form) VỮNG. NHƯNG hai toán tử `theme_resolve` và `lookup_finite` **chưa có ngữ nghĩa hình thức** (Manto self-review #2 tự thừa nhận), nên *bản thân giả thiết "mọi f∈ℰ là total first-order không tái nhập" CHƯA được chứng minh cho 2 toán tử này* — Thm 7.2 vì vậy là **chứng minh có điều kiện trên một tiền-đề chưa kiểm**. Một adversary đạt RCE NẾU impl hiện thực `theme_resolve` re-entrant. → Đây là **HIGH H-01**, không CRITICAL (vì với ℰ đúng định nghĩa thì định lý đúng; lỗ ở chỗ 2 toán tử chưa được formal-hoá để *bảo đảm* chúng thuộc lớp đó). Khuyến nghị "audit DSL trước registry permissionless" của Manto **đúng hướng nhưng CHƯA ĐỦ**: cần thêm nghĩa vụ Math (viết ngữ nghĩa đầy đủ 2 toán tử + chứng minh non-re-entrant) TRƯỚC khi audit, vì audit impl không thay được proof tiền-đề.

---

## Ledger entries

| id | severity | axis | round | status | title | description | proposed_fix | loại |
|---|---|---|---|---|---|---|---|---|
| H-01 | **HIGH** | 1 theorem / 2 attack | 1 | open | `theme_resolve`/`lookup_finite` không có ngữ nghĩa → tiền đề Thm 7.1/7.2 chưa kiểm | §3.4 liệt kê 2 toán tử này trong ℰ và khẳng định "total, first-order, non-recursive", nhưng §5.1/§5.2 KHÔNG viết quy tắc ngữ nghĩa cho chúng (chỉ fee_linear/fee_tiered có). Proof Thm 7.1 dựa μ giảm trên **AST tĩnh** — KHÔNG bao phủ toán tử đọc ρ rồi resolve/lookup động. Nếu `theme_resolve` nội suy chuỗi re-parse (AT-1) hoặc `lookup_finite` index trỏ vòng (AT-2) → vô hạn / eval ẩn / RCE. Tử huyệt #1 nằm Ở ĐÂY ở mức proof, không chỉ impl. | (1) Viết ngữ nghĩa đầy đủ `theme_resolve` (token-trỏ-token: chứng minh resolve depth-bounded bởi D_max, KHÔNG re-parse string thành AST) + `lookup_finite` (index ∈ [0,L_max], bảng tĩnh, không self-reference). (2) Thêm bổ đề "ℰ closed under no-re-entry": mọi f∈ℰ không gọi lại ⟦·⟧ trên dữ liệu sinh-động. (3) Mở rộng proof Thm 7.1 cover toán tử resolve. | author |
| H-02 | **HIGH** | 1 theorem | 1 | open | Thm 7.2(ii) nhảy cóc: "non-Turing ⟹ không side-effect ngoài render" | (ii) tuyên bố "không I/O, không nạp code" RÚT TỪ "ℰ là pure total functions (§3.4)". Đây là **giả định, không phải hệ quả**: non-Turing-complete KHÔNG kéo theo no-side-effect (một ngôn ngữ hữu hạn vẫn có thể có toán tử I/O). Tính no-side-effect đến TỪ định nghĩa ℰ là pure, không từ tính non-Turing. Proof trộn 2 tính chất độc lập (termination/expressiveness vs purity) thành một chuỗi suy luận. | Tách (ii) thành 2 mệnh đề: (a) purity = mọi f∈ℰ định nghĩa pure (axiom §3.4, cần liệt kê tường minh "không f nào có hiệu ứng" — hiện chỉ nói chung); (b) non-Turing = không nhúng universal-TM (lập luận expressiveness). Không suy (a) từ (b). | author |
| H-03 | **HIGH** | 1 citation / M6 | 1 | open | Cite sai mục: I3 dẫn "PhoenixKey method.md §6 (replay prevention)" — §6 là Privacy, replay ở §5 | §I3 + §15 ref ghi replay-prevention/sequence-monotonic INHERIT "method.md §6". Đối chiếu nguồn: method.md **§5 Security Considerations** chứa "Replay prevention. Every TAAD state transition increments a monotonic sequence number"; **§6 là Privacy Considerations** (không liên quan replay). Feat-Spec §13 cũng cite nhầm "method.md §6". Cite sai section = lỗi M6 theorem↔source coherence (downstream dev click sai). | Sửa cite I3 + §17 ref + cross-check Feat: replay/sequence-monotonic = **method.md §5** (Security Considerations) + TESTNET-PLAN §A.1 (TAADDatum.sequence + transition Rotate/Finalize). | author |
| H-04 | MEDIUM | 1 theorem / 3 | 1 | open | Recovery state machine cite "(Active/Recovering/Migrated/Revoked, guardian 2/3...)" — `Migrated` không có transition trong nguồn | §13.1 + §11 cite recovery states gồm `Migrated`. Đối chiếu TESTNET §A.1: `TAADStatus = Active\|Recovering\|Migrated\|Revoked` CÓ trong enum, nhưng 4 transition implement chỉ là Rotate/InitRecovery/Cancel/Finalize — KHÔNG có transition nào dẫn tới/ra `Migrated` hay `Revoked`. Math cite enum đúng nhưng ngụ ý state machine hoàn chỉnh; nguồn có gap (states khai báo nhưng chưa có cạnh). Math không re-prove (đúng lane) nhưng nên ghi là INHERIT-with-gap. | Ghi chú §13.1: states `Migrated/Revoked` khai báo ở PhoenixKey nhưng transition chưa đặc tả đầy đủ (TESTNET §A.1 chỉ 4 cạnh) → INHERIT-with-known-gap, báo Long. Không tự định nghĩa. | author (chờ Long) |
| H-05 | MEDIUM | 1 primitive / 3.3 | 1 | open | Cross-primitive: hw-key là ECDSA-P256 nhưng TESTNET TAADDatum.hw_key_pubkey ghi "32-byte Ed25519" | §3.1 + §3.3 dùng Sign_hw=ECDSA P-256 (Secure Enclave) + Sign=Ed25519 (TAAD), cite "PhoenixKey method.md §6". method.md §3 xác nhận hw-key=EcdsaSecp256r1, taad-key=Ed25519 — KHỚP. NHƯNG TESTNET §A.1 `hw_key_pubkey: 32-byte Ed25519 từ Secure Enclave wrap` — mâu thuẫn nguồn (P-256 pubkey ~33/65 byte nén/không nén, không phải 32). Đây là **mâu thuẫn TRONG nguồn PhoenixKey**, Math-Spec cite method.md (đúng phía). Cần báo Long, KHÔNG phải lỗi Math author. | Math-Spec ghi assumption §3.3: "hw-key curve = P-256 per method.md §3; TESTNET TAADDatum field naming có thể lệch (32B) → cần PhoenixKey reconcile". Loại = phụ-thuộc-ngoài (Long). | phụ-thuộc-ngoài |
| H-06 | MEDIUM | 1 theorem | 1 | open | Thm 7.5 effectively-once: op_id=H(DID∥D∥seq_D) duy nhất phụ thuộc seq_D bền — chưa tách OA riêng | Proof Thm 7.5 dựa op_id duy nhất. Manto self-review #4 thừa nhận: reinstall mất seq_D → trùng op_id → dedup sai. Hiện gộp vào OA1 (fsync outbox). seq_D-persistence là điều kiện ĐỘC LẬP với outbox-fsync (có thể fsync outbox nhưng reset seq khi reinstall). Risk: effectively-once vỡ ⟹ INV-1 no-loss vỡ. | Tách OA mới (OA1b): "seq_D strictly-increasing, bền qua reinstall/khôi phục (không reset)". Hoặc đổi op_id sang derivation không phụ thuộc seq mỏng manh (vd content-hash + device-DID-bound nonce bền). | author |
| H-07 | MEDIUM | 1 theorem | 1 | open | Thm 7.3 "conflict{a,b} là phần tử semilattice hội tụ xác định" — chưa chứng minh join của conflict-set đóng | Mệnh đề phụ Thm 7.3 tuyên bố trạng thái `conflict{a,b}` "bản thân là phần tử semilattice (tập các nhánh)". Đúng nếu dùng set-union làm join (powerset lattice). Nhưng spec KHÔNG định nghĩa ⊔ trên conflict-state, cũng không chứng minh nó vẫn inflation + tương thích ⊔ của giá trị thường (mixing scalar register với conflict-set). Đây là claim chưa chứng minh nhúng giữa proof. | Định nghĩa rõ: conflict-state = phần tử của powerset-lattice trên giá trị; join = ∪; chứng minh embedding giữ inflation + idempotent. Hoặc hạ thành "claim, mech pending". | author |
| H-08 | MEDIUM | 1 theorem / 2 attack | 1 | open | Thm 7.4 giả định "mỗi DID có ĐÚNG MỘT shard chính" — đa-tài-phán-per-DID phá well-defined | Manto self-review #5 tự thừa nhận. Thm 7.4 proof dựa "(a) mọi write của DID định tuyến S_{j*}(DID)". Nếu một DID hợp pháp thuộc ≥2 tài phán (người 2 quốc tịch / tổ chức đa vùng) thì S_{j*} không well-defined → tồn tại 2 write-path → split-brain xuyên shard (đạt G2). Đây là hở MÔ HÌNH, không chỉ residual. | Bổ sung giả thiết tường minh: "function S_{j*}: DID→Shard là TOÀN PHẦN và ĐƠN TRỊ". Nếu đa-tài-phán cần hỗ trợ → hoặc (i) chọn shard-chính xác định (primary jurisdiction) + các shard khác read-replica, hoặc (ii) chứng minh merge xuyên-shard cho DID đa-tài-phán vẫn SEC. Đánh dấu Q-open nếu chưa giải. | author |
| H-09 | MEDIUM | 1 theorem | 1 | open | "SEC" ≠ "no-loss có nghĩa" với lww; Thm 7.3 over-claim "KHÔNG mất ghi" | Statement Thm 7.3 kết "KHÔNG mất ghi". Nhưng policy `lww` (register max theo timestamp) **mất ghi của writer thua** — đó là bản chất lww. Manto self-review #3 thừa nhận "lww MẤT GHI". Statement định lý và self-review mâu thuẫn: SEC (hội tụ) đúng, nhưng "không mất ghi" CHỈ đúng cho CRDT inflation-thuần, KHÔNG cho lww. Câu "KHÔNG mất ghi" trong Statement là over-claim (pitfall #8). | Sửa Statement Thm 7.3: tách "SEC (hội tụ xác định)" — đúng mọi policy; khỏi "no-loss" — chỉ đúng cho CRDT join-thuần, lww no-loss ở mức *register* (giá trị cuối) KHÔNG ở mức *mọi ghi*. Liên kết Q-CONF (object nào dùng policy nào). | author |
| H-10 | MEDIUM | 1 citation / Rule 1 | 1 | open | 12 URL [1]–[12] CHƯA verify 200 OK (Hard Rule 1) | §17 + ghi chú tự thừa nhận "[1]–[12] chưa verify trong DRAFT". Hard Rule 1 + URL-INTEGRITY: mọi URL primitive/assumption PHẢI WebFetch 200 OK trước LOCK. Đây là nghĩa vụ format-checker (1a) hơn Hamen, nhưng ghi nhận để Gate-out. Author đã đánh dấu trung thực (không bịa). | format-checker chạy verify-urls.sh trước LOCK; author giữ [NEEDS-URL] nếu fail. Không chặn verdict Hamen (đúng quy trình DRAFT). | author/format-checker |
| H-11 | LOW | 3 conservation | 1 | open | I1 dùng `Σout=Σin` chung; Treasury F9 đã chốt collect-side `==` (không `≥`) | I1 proof + §5.2 cite "Σout=Σin". Treasury CONTRACT §11 F9: "MATH chiều collect đổi `≥`→`==`". Math-Spec không sai (== ⟹ bảo toàn) nhưng nên đồng bộ: nêu rõ collect dùng đẳng thức (an toàn hơn, loại tip làm vỡ sổ). Cosmetic coherence. | §12 I1: ghi collect-invariant = `==` per Treasury F9 (không `≥`), align ký hiệu. | author |
| H-12 | (gate) | 3 param | 1 | gate | N_max/D_max/L_max/T_max [PARAM] chặn Gate-out sang Tech | standard §1 Gate-out: "mọi parameter §11 có số cụ thể". 4 config-bound đều [PARAM] chờ Gate-A/Q9 (đo instance Aladin+TonFarm thật). Phụ-thuộc-ngoài (founder cung cấp instance mẫu). KHÔNG phải lỗi author (Hard Rule 3 — không bịa). Nhưng CHẶN gate-out: Tech KHÔNG nên start EvalConfig validate với bound chưa chốt. | Giữ [PARAM] + cấu trúc/ràng buộc (đã có). Gate-out blocked-by Q9/Gate-A founder. Báo orchestrator: đây là chặn-gate do dependency, không hạ verdict reviewer. | phụ-thuộc-ngoài (founder) |
| H-13 | LOW | 1 theorem | 1 | open | I5 (Data⟂Experience) proof dùng "ℰ không có toán tử mutate store" nhưng chưa liệt kê chứng cứ | I5 proof: "ℰ không có toán tử mutate store". Đúng theo §3.4 (ℰ thuần tính toán) nhưng proof I5 dựa trên cùng tiền-đề purity với H-02 — nếu purity của ℰ chưa được liệt kê tường minh (H-02) thì I5 cũng treo trên đó. Mắt xích phụ thuộc H-02. | Sau khi vá H-02 (liệt kê purity ℰ tường minh), I5 reference axiom đó. | author |

---

## Symbol dictionary (M2) — collision check

| Symbol | Section | Definition | Conflict? |
|---|---|---|---|
| ⊔ | §2 | CRDT merge / join semilattice | OK (nhất quán §5.3/7.3/7.4) |
| 𝒱 | §2 | version vector DID-replica→ℕ | OK |
| S_j | §2/§5.4/§7.4 | shard tài phán j | OK — nhưng §7.4 dùng `S_{j*}(DID)` (shard chính), §2 chỉ khai `S_j`. Thêm `j*` vào §2 (minor) |
| cap_k | §2 | ngưỡng VP thứ k (INHERIT) | OK, khớp VotingPower §1 |
| ρ | §2/§5.1 | read-only env | OK |
| ℰ | §2/§3.4 | tập toán tử đóng | OK — nhưng 2 phần tử chưa có ngữ nghĩa (H-01) |
| μ(t) | §7.1 | size(t) độ đo | OK |
| negl(λ) | §2 | negligible | OK |

Không có symbol collision nghiêm trọng. Minor: `j*` chưa khai §2.

### Numerical re-derivation

| Value | Spec claim | My derivation (đối chiếu nguồn) | Match? |
|---|---|---|---|
| BFT trần per-DID | "không DID > 4.76%" (§9.4) | 1/BFT_FLOOR = 1/21 = 0.047619 = 4.76% | ✅ khớp VotingPower §2.5 |
| BFT quorum | "quyết trọng yếu cần ≥21 DID" | VotingPower §2.5: ≥8 chạm 1/3, ≥14 đạt 2/3, ≥21 đạt 100%. Math-Spec ghi "≥21 DID" cho 100% | ✅ (nhưng Math-Spec gộp gọn — chính xác: 21 = sàn cứng số DID thuận) |
| cap_C4 | 100·10⁶ LAMP | VotingPower §1 + D4: cap 100 triệu | ✅ khớp |
| LAMP supply | 36·10⁹ no-burn | Treasury §5: fixed 36 tỷ, không nhánh burn | ✅ khớp |
| D8 leverage | w_2+w_4 ≤ w_1+w_3 (§10 IS2) | VotingPower D8 | ✅ khớp byte-level |
| recovery params | guardian 2/3 (min2,max5), 50 ADA, 7d/1h | TESTNET §A.1: min_sig=2, max 5 guardians, 50 ADA collateral, 7 ngày mainnet/1h(3600 slot) preprod | ✅ khớp |

**Numerical: KHÔNG drift.** Mọi số INHERIT cite đúng nguồn. Không re-prove sai INHERIT claim.

### Theorem ↔ Protocol coherence (M6)

| Theorem | Claim | Protocol §| Delivered? |
|---|---|---|---|
| 7.1 | termination ≤ size(c) | §5.1 EvalConfig | ⚠️ thiếu ngữ nghĩa theme_resolve/lookup_finite (H-01) |
| 7.2 | no-RCE | §5.1+§5.2+§3.4 | ⚠️ điều kiện trên tiền-đề chưa kiểm (H-01/H-02) |
| 7.3 | CRDT SEC | §5.3 Write | ⚠️ "no-loss" over-claim với lww (H-09) |
| 7.4 | shard SEC | §5.4 | ⚠️ giả định 1-shard-per-DID (H-08) |
| 7.5 | no-loss outbox | §5.3 | ⚠️ seq_D bền chưa tách OA (H-06) |
| 7.6 | hiding | §5.5 | ✅ |
| 7.7 | crypto-shred | §5.5 | ✅ (OA4 đk) |
| 9.1 | cap default-deny | — | ✅ (OA2 đk) |
| 9.2 | aud-binding | — | ✅ (AS3 đk) |
| I1 | conservation | §12 | ✅ (H-11 cosmetic) |

### Citations check (INHERIT internal paths)

| Citation | Đối chiếu | Verified? |
|---|---|---|
| VotingPower geometric + BFT 21 + D4/D8 | CONTRACT.md | ✅ đúng |
| Treasury §5 no-burn 36 tỷ | CONTRACT.md §5 | ✅ đúng |
| PhoenixKey replay/seq "method.md §6" | thực ở method.md **§5**, không §6 | ❌ **H-03** cite sai section |
| recovery state machine TESTNET §A | §A.1 | ✅ (H-04: Migrated/Revoked thiếu transition trong nguồn) |
| RFC/NIST/paper [1]–[12] | external URL | ⏳ chưa WebFetch (H-10, format-checker) |

### Recurrence (axis 1)

Round 1 — chưa có entry tiền nhiệm. Tất cả H-01…H-13 = mới. Lập baseline để re-verify ở Round 2 (anti-pattern AP-1: KHÔNG được để open entry trượt vòng).

---

## Phân loại finding

- **Lỗi author (sửa được trong spec)**: H-01, H-02, H-03, H-06, H-07, H-08, H-09, H-11, H-13 (9 entries).
- **Phụ-thuộc-ngoài**: H-05 (PhoenixKey hw-key naming — Long), H-04 (Migrated/Revoked transition — Long), H-12 (N_max param — founder Q9/Gate-A), H-10 (URL verify — format-checker pipeline).
- **Chờ-founder**: H-12 (Gate-A baseline Q9).

---

## Đánh giá khuyến nghị "audit DSL trước registry permissionless"

Manto khuyến nghị (Thm 7.2 verification status + §15 Math→Exec): external audit DSL Tier-2 TRƯỚC khi bật registry permissionless. **Đánh giá Hamen: ĐÚNG HƯỚNG nhưng CHƯA ĐỦ MẠNH.**

- Audit impl (sandbox/validate AST) bắt được khoảng cách spec↔code — cần thiết.
- NHƯNG H-01 cho thấy lỗ nằm Ở MỨC PROOF (tiền-đề "theme_resolve/lookup_finite total first-order non-re-entrant" chưa được chứng minh), KHÔNG chỉ ở impl. Audit code KHÔNG thay được proof tiền-đề: auditor có thể xác nhận code khớp spec, nhưng nếu *spec* để hở ngữ nghĩa 2 toán tử thì code "đúng spec" vẫn có thể re-entrant.
- **Khuyến nghị bổ sung (Hamen)**: thêm nghĩa vụ Math TRƯỚC audit: (a) viết ngữ nghĩa đầy đủ `theme_resolve`/`lookup_finite` + bổ đề no-re-entry (vá H-01); (b) mechanize Q-MECH-1 (Lean `𝒢_cfg ⊭ universal-TM`) — đây là điều kiện Gate cho L1 critical theorem, không chỉ "planned v0.2". Audit DSL = lớp phòng thủ THỨ HAI sau khi proof đóng, không phải lớp đầu.

---

## Verdict — Round 1

### **NOT_APPROVED**

**Lý do**: 4 HIGH (H-01, H-02, H-03 + H-01 là tử-huyệt-#1-có-lỗ-proof). Theo severity Math-specific (4-output-spec): HIGH = composition gap / theorem-source-coherence gap. **KHÔNG có CRITICAL** (không theorem false ngoài-điều-kiện, không conservation broken, không primitive misused, không citation falsified — cite sai *section* H-03 là lỗi coherence HIGH, không phải falsified). Nhưng:

- Thm 7.2 (tử huyệt #1) là **chứng minh có điều kiện trên tiền-đề chưa kiểm** (H-01) — với L1 + critical theorem, đây là chặn. Standard yêu cầu L1 critical = full proof + mechanize plan; hiện tiền-đề (ngữ nghĩa 2 toán tử) còn hở ⟹ proof CHƯA đóng.
- H-03 cite sai section nguồn INHERIT (M6 coherence) — phải sửa trước gate-out.
- H-02 proof nhảy cóc logic (non-Turing ⟹ no-side-effect).

**Phân biệt với gate**: ngay cả khi vá hết HIGH, spec vẫn KHÔNG gate-out được sang Tech vì H-12 (N_max [PARAM] chờ Gate-A/Q9 founder) — nhưng đó là **chặn-gate do dependency-ngoài**, KHÔNG hạ verdict reviewer thêm. Verdict NOT_APPROVED đến từ HIGH author-sửa-được, không từ founder-question.

**Lộ trình lên CONDITIONALLY_APPROVED (Round 2)**: vá H-01 (ngữ nghĩa 2 toán tử + bổ đề no-re-entry), H-02 (tách purity/non-Turing), H-03 (sửa cite §5). Nếu vá 3 HIGH này → trần verdict = CONDITIONALLY_APPROVED (các MEDIUM còn lại + founder-gate không hạ thêm dưới CONDITIONALLY).

**Lộ trình lên APPROVED**: thêm mechanize Q-MECH-1 (Lean) cho Thm 7.1/7.2 (yêu cầu L1 critical) + vá MEDIUM H-06/H-08/H-09 + đóng founder-gate H-12 (Gate-A có số N_max thật).

---

## Self-review của Hamen (concession discipline)

- **Concede**: Manto self-review TRUNG THỰC và bao phủ phần lớn điểm yếu (đã tự nêu #1 theme_resolve, #3 lww, #4 seq_D, #5 đa-tài-phán). Đây là self-review chất lượng cao — nhiều finding của tôi *xác nhận* self-review của Manto thay vì phát hiện mới. Điều này KHÔNG hạ severity: Manto đóng khung #1/#2 là "khoảng cách spec↔impl / residual"; tôi nâng lên vì đó là **lỗ proof tiền-đề**, không phải residual impl.
- **Concede**: §9.4/§10/§12 INHERIT đúng lane (Hard Rule 4) — KHÔNG re-prove sai upstream. Numerical KHÔNG drift. Đây là điểm mạnh thật của spec.
- **KHÔNG concede**: việc đóng khung Thm 7.2 là "đã chứng minh, rủi ro chỉ ở impl". Với 2 toán tử thiếu ngữ nghĩa, tiền-đề chưa đủ ⟹ định lý chưa đóng ở mức Math, không chỉ impl.

---

## Đánh giá tổng — đủ sạch chưa?

**CHƯA đủ sạch để gate-out sang Tech.** Spec có **xương sống vững** (INHERIT đúng, numerical không drift, attack model đủ, self-review trung thực, conservation chặt) nhưng **tử huyệt #1 (Thm 7.2) còn lỗ proof tiền-đề** (H-01) — đúng chỗ Manto tự nhận rủi ro cao nhất. Cần 1 vòng vá (3 HIGH) để lên CONDITIONALLY_APPROVED; cần mechanize + Gate-A để lên APPROVED. Khoảng cách tới sạch: HẸP (3 HIGH author-sửa-được, không CRITICAL, không cần đập lại kiến trúc).

---

## Round 2 — 2026-06-17

> **Đối tượng**: Platform-Math-Spec.md **v0.2** (Manto vá Round-1). **Vai**: re-verify đóng-thật 3 HIGH (H-01/02/03) + 2 MEDIUM (H-08/09); thử bẻ LẠI Thm 7.2 trên ngữ nghĩa MỚI §3.4.2.
> **Nguồn đối chiếu R2**: §3.4.1 (A-PURE), §3.4.2 (theme_resolve/lookup_finite), §3.4.3 (Bổ đề no-re-entry), Thm 7.1/7.2/7.3/7.4 + method.md §5 (byte-level, dòng 167-174).

### Re-verify 3 HIGH + 2 MEDIUM

| id | R1 sev | R2 trạng thái | Bằng chứng đóng-thật (KHÔNG vá hời hợt) |
|---|---|---|---|
| **H-01** | HIGH | **ĐÓNG (thật)** | §3.4.2 viết ngữ nghĩa ĐẦY ĐỦ: `theme_resolve : Str_wl → D`, `theme_resolve(k) ≜ Θ[chain_θ(k)]` với `Θ` bảng TĨNH trả **literal nguyên thuỷ trong D** (định nghĩa nói rõ "KHÔNG tới chuỗi-cần-parse, KHÔNG tới AST, KHÔNG tới tên toán tử"), `chain_θ` qua DAG `G_θ` acyclic (TV-θ1 topo-sort) depth ≤ D_max → **total, no-re-parse**. `lookup_finite : Tbl × ℤ_sat → D`, bảng tĩnh literal (TV-L1 reject Op/Ref), index `clamp[0,|tbl|−1]` + nhánh `|tbl|=0→default_D` → **total mọi index, no-self-ref**. §3.4.3 **Bổ đề no-re-entry** liệt kê 5 lớp toán tử, mỗi lớp chứng minh KHÔNG gọi `⟦·⟧`/`parse`. Proof Thm 7.1 (đoạn "μ-giảm-trên-AST-tĩnh", dòng 326) + Thm 7.2(i) (dòng 338) nay ĐỨNG TRÊN Bổ đề 3.4.3 — **không còn nhảy cóc**. Tiền-đề "2 toán tử total+first-order+non-re-entrant" từ **giả định ngầm → định lý có proof**. Đây là vá CẤU TRÚC, không cosmetic. |
| **H-02** | HIGH | **ĐÓNG (thật)** | §3.4.1 Axiom **A-PURE** liệt kê TƯỜNG MINH 4 điều cấm (I/O; đọc/ghi store/vault/chain/outbox; trạng thái ẩn; re-enter `⟦·⟧`) + ghi rõ "A-PURE là **định nghĩa của ℰ** (tiền-đề), KHÔNG phải hệ quả Thm 7.1/7.2". Thm 7.2(ii) tách thật thành **(ii-a) no-side-effect ← A-PURE** và **(ii-b) non-Turing ← expressiveness**, có câu chốt "no-side-effect đến TỪ A-PURE, KHÔNG suy từ non-Turing — một ngôn ngữ hữu hạn vẫn có thể có toán tử I/O". Bước nhảy cóc R1 ("non-Turing ⟹ no-side-effect") đã **bị gỡ tận gốc**, không che bằng câu chữ. |
| **H-03** | HIGH | **ĐÓNG (thật)** | Đối chiếu method.md byte-level: **§5 Security Considerations** dòng 170 = "Replay prevention. Every TAAD state transition increments a monotonic sequence number… Transactions with `seq ≤ on-chain seq` are rejected"; **§6 = Privacy Considerations** (dòng 177-182, không liên quan replay). Cite đã sửa NHẤT QUÁN tại 4 chỗ: §3.3 (dòng 93), I3/§12 (dòng 573), §13.1 (dòng 592), §14.3 (dòng 635) — tất cả ghi §5, kèm note "trước đây ghi nhầm §6". KHÔNG sót chỗ cite §6 nào còn lại cho replay. |
| **H-08** | MED | **ĐÓNG (thật)** | Thm 7.4 thêm **H-SHARD tường minh** (dòng 372): `S_{j*}: DID → Shard` TOÀN PHẦN + ĐƠN TRỊ là **điều kiện well-defined**, ghi rõ "nếu đa-trị thì statement KHÔNG áp dụng". Mục "Giới hạn đa-tài-phán-per-DID" (dòng 380) thừa nhận G2 split-brain khi đa-trị + 2 hướng giải (i primary+read-replica / ii multi-primary merge CHƯA chứng minh) → **Q-SHARD open**. Đây là đóng over-claim ĐÚNG CÁCH: thu hẹp scope định lý + đánh dấu phần chưa chứng minh thay vì giả vờ phủ. |
| **H-09** | MED | **ĐÓNG (thật)** | Thm 7.3 Statement TÁCH HAI: **(7.3-SEC)** đúng MỌI policy (lww/CRDT/total-order); **(7.3-NoLoss)** CHỈ CRDT join-thuần, KHÔNG lww — ghi thẳng "lww **mất ghi của writer thua** — đó là bản chất ngữ nghĩa lww". Có câu chống over-claim tường minh (dòng 362): "KHÔNG được phát biểu 'Thm 7.3 ⟹ KHÔNG mất ghi' trần". Proof khớp Statement. Pitfall #8 đã đóng. |

**Kết luận re-verify**: **5/5 đóng THẬT** (không vá hời hợt — mỗi vá là thay đổi cấu trúc proof/định nghĩa, không phải đổi câu chữ). H-13 (đi kèm H-02) cũng đóng: I5 (dòng 583) nay reference A-PURE thay tiền-đề purity ngầm.

### THỬ BẺ LẠI Thm 7.2 — Round 2 (trên ngữ nghĩa MỚI §3.4.2)

Tái tạo AT-1/AT-2 + 4 vector MỚI (resolve lồng, lookup trả Ref gián tiếp, depth-bomb, cross-operator):

| # | Vector (R2) | Bẻ được? | Lý do trên ngữ nghĩa MỚI |
|---|---|---|---|
| AT-1' | `theme_resolve(k)` với `Θ[k]` là chuỗi chứa cú pháp `op(...)` → ép re-parse | **KHÔNG** | §3.4.2: `Θ[·]` trả **literal trơ ∈ D**; ngữ nghĩa "không chứa `parse(·)`/`⟦·⟧`"; chuỗi đối xử opaque. TV6 xác nhận `"+(1,2)"` trả nguyên, không thành 3. Đóng TẠI ĐỊNH NGHĨA. |
| AT-2' | `lookup_finite(tbl, idx)` index trỏ ngược tạo vòng | **KHÔNG** | TV-L1: mọi `tbl[i]` phải Lit (reject Op/Ref) ⟹ ô không phải biểu thức ⟹ không khởi vòng đánh giá. `clamp` total. Đóng TẠI ĐỊNH NGHĨA. |
| AT-6 (mới) | resolve lồng resolve qua Θ — token A→B→C…→A | **KHÔNG** | TV-θ1: `G_θ` phải acyclic (topo-sort validate); `|Str_wl|` hữu hạn ⟹ `chain_θ` kết thúc ≤ D_max bước. Cycle k₁→k₂→k₁ bị reject (TV6). Không lồng ẩn vì `Θ[·]∈D` không trả Str_wl-cần-resolve-tiếp. |
| AT-7 (mới) | `lookup_finite` trả phần tử được tái diễn giải như Ref/khoá gián tiếp | **KHÔNG** | TV-L1 cấm phần tử Ref. Literal "trông giống khoá" (vd `"$x"`) vẫn là chuỗi trơ ∈ D, không tái diễn giải thành Ref (cùng lý lẽ AT-1'). |
| AT-8 (mới) | depth-bomb D_max — nesting resolve+lookup+fee_tiered khuếch đại | **KHÔNG** (DoS-bound, không RCE) | size ≤ N_max, depth ≤ D_max reject validate (§5.1); `chain_θ` ≤ D_max; `fee_tiered` ≤ T_max tier. Tổng gọi `⟦·⟧` = size(c) ≤ N_max (Thm 7.1). Bổ đề 3.4.3 cấm khuếch đại sinh-động. Chặn bởi bound TĨNH, không vô hạn. |
| AT-9 (mới) | cross-operator: `theme_resolve(lookup_finite(tbl, idx_động))` | **KHÔNG** | Composition của 2 toán tử total no-re-entrant; mỗi bước trả D; eager-substitution giữ no-re-entry (Bổ đề 3.4.3 áp từng f). Index động chỉ chọn ô tĩnh, không tạo cạnh ngoài AST. |

**KẾT QUẢ THỬ BẺ LẦN 2: KHÔNG CÒN BẺ ĐƯỢC.** Ở R1, AT-1/AT-2 là "**CÓ ĐIỀU KIỆN**" (lỗ PROOF vì 2 toán tử thiếu ngữ nghĩa). Ở R2, trên ngữ nghĩa §3.4.2 + Bổ đề 3.4.3, **cả 6 vector (2 cũ tái tạo + 4 mới) đều bị chặn TẠI ĐỊNH NGHĨA** — không còn là tiền-đề chưa kiểm. Đường RCE qua config = ∅ ở mức ngữ nghĩa. Rủi ro còn lại CHỈ ở **khoảng cách spec↔impl** (impl phải thực sự materialize Θ literal-trơ + topo-sort G_θ + TV-L1) — đã chuyển đúng thành nghĩa vụ Tech (§15 Math→Tech, dòng 660) + lớp phòng thủ thứ hai (audit DSL). **Đây là chuyển loại đúng: từ lỗ-proof (R1) → khe-impl (R2, OA-class).**

### Finding MỚI (R2)

| id | severity | axis | round | status | title | description | proposed_fix | loại |
|---|---|---|---|---|---|---|---|---|
| H-14 | LOW | 1 theorem | 2 | open | `theme_resolve` đối ĐỘNG ∉ Str_wl: "reject lúc validate" không khả thi tĩnh ⟹ khe total-ness | §3.4.2 (dòng 130) nói "nếu `k ∉ Str_wl` → reject lúc validate (KHÔNG runtime ⊥)". Đúng khi `k` là Lit cú pháp. NHƯNG `theme_resolve` có thể nhận đối là **kết quả Op động** (vd `theme_resolve(lookup_finite(tbl, idx))` — AT-9, hoặc `theme_resolve(concat_n(...))`): giá trị `k` chỉ biết lúc RUNTIME, validate tĩnh KHÔNG kiểm được `k ∈ Str_wl`. Nếu `k` động ∉ Str_wl thì hành vi chưa định: spec hứa "KHÔNG runtime ⊥" nhưng không nói clamp/default. KHÔNG mở RCE (vẫn literal trơ, no re-parse — AT-1' vẫn đóng) nhưng phá tuyên bố total-ness "no runtime ⊥" — cùng TINH THẦN H-01 (toán tử phải total trên MỌI đối hợp-lệ-runtime). | (1) Hoặc ràng buộc validate-time: đối của `theme_resolve` phải là **Lit ∈ Str_wl** (cấm đối động) — đơn giản nhất, đóng kín tĩnh. (2) Hoặc định nghĩa total runtime: `k ∉ Str_wl → default_D` (như nhánh `|tbl|=0` của lookup_finite), bỏ "reject lúc validate" cho nhánh đối-động. Chọn (1) khớp tinh thần "token whitelist tĩnh". | author |
| H-15 | LOW | 1 notation | 2 | open | `D_max` dùng KÉP: depth AST config VÀ độ sâu kế thừa token `chain_θ` | `D_max` (§5.1 dòng 233) = depth AST config; §3.4.2 (dòng 138) tái dùng `D_max` chặn độ sâu `chain_θ` (kế thừa token). Hai loại depth ngữ nghĩa KHÁC nhau (AST nesting ≠ token-inheritance chain) nhưng gộp một ký hiệu. Không sai logic (cùng bị chặn hữu hạn) nhưng có thể gây nhầm khi Tech hardcode (một bound cho hai mục đích → có thể chọn sai). | Tách `D_max^θ` (token-chain depth) khỏi `D_max` (AST depth) HOẶC ghi chú rõ "D_max bao cả token-chain depth" ở §3.4.2 + §11. Cosmetic/notation. | author |

Cả H-14/H-15 đều **LOW, không hạ verdict** (không phá No-RCE, không CRITICAL). H-14 là khe total-ness đáng đóng ở R3/Tech-handoff; H-15 cosmetic.

### Regression — vá có phá định lý/invariant khác không?

- **Thm 7.1**: đoạn "μ-giảm-trên-AST-tĩnh" mới (dòng 326) GIA CỐ chứ không phá — nay đứng trên Bổ đề 3.4.3 thay vì giả định ngầm. ✅ không regression.
- **Thm 7.3/7.4**: tách Statement (H-09) + H-SHARD (H-08) không đụng INV-SEC. Mệnh đề phụ conflict-set (H-07) vẫn để open — KHÔNG bị vá H-08/09 làm xấu đi. ✅
- **I5 (H-13)**: reference A-PURE — vững hơn, không phá I1-I4. ✅
- **A-PURE vs ℰ**: A-PURE (dòng 116) cấm 4 thứ; đối chiếu §3.4 (dòng 110) ℰ "không I/O/code host" — NHẤT QUÁN, A-PURE là bản liệt-kê-chi-tiết của câu §3.4. Không mâu thuẫn. ✅
- **`÷sat` chia 0 → bão hoà** (dòng 110) + `ite` eager (dòng 160): total + no-re-entry giữ — khớp Bổ đề 3.4.3 lớp 1. ✅
- **Numerical/INHERIT**: không đụng — R1 đã VERIFIED không drift, v0.2 không sửa số. ✅

**KHÔNG regression.** Mọi vá là cộng thêm (định nghĩa/bổ đề/giả thiết tường minh), không sửa số/không phá proof cũ.

### Phân loại finding R2

- **Lỗi author còn mở**: H-06 (seq_D OA1b), H-07 (conflict-set embedding), H-11 (I1 `==`), **H-14 (mới — theme_resolve đối động)**, **H-15 (mới — D_max kép)**, H-13 đã đóng. Tất cả MEDIUM/LOW, ngoài 3-HIGH-brief.
- **Phụ-thuộc-ngoài**: H-04 (Migrated/Revoked transition — Long), H-05 (hw-key P-256 vs 32B — Long), H-12 (N_max [PARAM] — founder Gate-A/Q9).
- **Pipeline**: H-10 (URL verify 200 OK — format-checker, TRƯỚC LOCK).

---

## Verdict — Round 2

### **CONDITIONALLY_APPROVED**

**Lý do**: 3/3 HIGH (H-01/02/03) + 2/2 MEDIUM-brief (H-08/09) + H-13 **đóng THẬT** (vá cấu trúc, không cosmetic — re-verify byte-level + thử-bẻ lần 2). **Thử bẻ Thm 7.2 lần 2: KHÔNG còn bẻ được** — 6 vector (AT-1/2 tái tạo + 4 mới) đều chặn tại định nghĩa §3.4.2 + Bổ đề 3.4.3. Tử huyệt #1 (Thm 7.2) từ "proof có-điều-kiện trên tiền-đề chưa kiểm" (R1) → "proof đóng ở mức ngữ nghĩa, rủi ro còn lại = khe-impl OA-class" (R2). KHÔNG CRITICAL phát sinh; 2 finding mới (H-14/15) = LOW, không hạ verdict.

**Vì sao KHÔNG lên APPROVED**: theo lộ trình R1, trần CONDITIONALLY khi (a) 3 HIGH vá xong NHƯNG (b) chưa **mechanize Q-MECH-1 (Lean)** — standard yêu cầu L1 critical theorem (INV-SEC) mechanized để APPROVED; hiện Thm 7.1/7.2 vẫn **Manual** (§16 Q-MECH-1 = Planned). Manual-proof + mech-pending = chấp nhận DRAFT nhưng KHÔNG đạt trần APPROVED cho L1.

### Gate-out sang Tech?

**CHƯA gate-out được — nhưng KHÔNG vì lỗi reviewer/author.** Hai chặn-gate ĐỘC LẬP với verdict:

1. **Founder-gate (H-12)**: `N_max/D_max/L_max/T_max` = [PARAM] chờ **Gate-A/Q9** (đo AST instance Aladin+TonFarm thật). Standard §1 Gate-out: "mọi parameter §11 có số cụ thể". Tech KHÔNG nên start EvalConfig validate với bound chưa chốt. → blocked-by **founder** (cung cấp instance mẫu).
2. **External-dep**: H-04/H-05 (PhoenixKey reconcile Migrated/Revoked transition + hw-key 32B vs P-256) = báo **Long**; AS-LN (LampNet residency CHƯA CÓ) + AS3 (JWKS issuer) = Phase-2 dep. Không chặn INV-SEC nhưng chặn phần INV-3-residency/Thm 9.2 full.

**Pipeline còn lại**: H-10 (format-checker WebFetch [1]–[12] 200 OK TRƯỚC LOCK).

**Tóm tắt gate**: verdict reviewer = CONDITIONALLY_APPROVED (HIGH sạch). Gate-out blocked thuần bởi **founder-gate (H-12) + external-dep (Long/LampNet) + pipeline (URL)** — KHÔNG bởi lỗi-author còn lại. Để APPROVED: mechanize Q-MECH-1 + đóng founder-gate H-12. Đề xuất đóng H-14 (ràng buộc đối `theme_resolve` là Lit∈Str_wl) trong cùng đợt Tech-handoff vì nó là khe total-ness sát ranh INV-SEC.

### Self-review Hamen R2 (concession discipline)

- **Concede**: vá H-01 là vá THẬT, không hời hợt — Manto viết ngữ nghĩa miền/đối/giá trị đầy đủ + bổ đề có proof từng-lớp, không chỉ thêm câu khẳng định. Thử bẻ lần 2 xác nhận đóng. R1 tôi đánh "khoảng cách HẸP" — đúng: 1 vòng đóng được.
- **Concede**: H-02/H-03/H-08/H-09 đóng đúng cách (tách mệnh đề / thu scope + Q-open / sửa cite nhất quán 4 chỗ). Không over-fix, không phá cái khác (regression check sạch).
- **KHÔNG concede (giữ điểm trừ)**: APPROVED đòi mechanize — Manual proof cho L1 critical (INV-SEC) chưa đủ trần cao nhất. H-14 (theme_resolve đối động) là khe total-ness MỚI tôi tìm được ở R2 mà v0.2 chưa kín — chứng tỏ "đóng tại định nghĩa" đúng cho đối TĨNH, còn đối ĐỘNG cần một câu ràng buộc nữa. LOW nhưng nên đóng trước khi Tech code.
- **Anti-AP-1 (không để open trượt vòng)**: H-06/H-07/H-11 từ R1 vẫn open (author để lại, ngoài brief 3-HIGH) — ghi nhận, KHÔNG để trôi: đề xuất gom vào R3 hoặc Tech-handoff.
