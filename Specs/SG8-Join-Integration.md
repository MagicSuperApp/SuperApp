# SG8 — Tích hợp Join (LampNet compute-contribution) vào SuperApp

> **Scope level**: L3 Feature Integration Spec (SG8 · F8.4) — chỉ đặc tả TÍCH HỢP app-side.
> **Status**: DRAFT v0.1 — chờ anh Aladin duyệt trước khi LOCK.
> **Inherit upstream (Hard Rule 4 — KHÔNG re-spec nghiệp vụ)**: `LampNetCloud/Specs/_shared/SuperApp-Join-Integration.md` (message team LampNet) + `LampNetCloud/Join`.
> **Tuân**: PLATFORM-MASTER §4/§8 (SG8), INV-1/INV-3/INV-SEC · INTEGRATION-STANDARD §3/§7/§8 · UI-UX-STANDARD §2/§3/§10/§11.

---

## 0. Một câu định nghĩa

Join = feature module (kiểu **Feature**, hiện thành màn/tab trong vỏ) cho phép điện thoại người dùng **tham gia LampNet, góp năng lực compute, được daemon verify (recompute + chữ ký) và tích thưởng**. Nghiệp vụ do LampNet sở hữu; SuperApp chỉ **gọi endpoint + FFI SDK + dựng UI** theo hợp đồng dưới đây.

---

## 1. Ranh giới — ai làm gì (NORMATIVE)

Theo UI-UX-STANDARD §2 (Frontend/UIUX ⟂ Backend) + Master §4 boundary:

| Lớp | Sở hữu | Nội dung |
|---|---|---|
| **Daemon LampNet + SDK Rust** (BE/fabric) | Team LampNet | Nghiệp vụ Join/lease/report/verify/settlement; recompute-verify chống tự khai; tier; reward epoch; `join_and_contribute`. **SuperApp KHÔNG re-implement.** |
| **App-side compute** (native binding/FFI) | SuperApp — **Thư** (mobile) | Gọi FFI/uniffi SDK Rust từ mobile; lưu `seed_hex` trong Keystore/Keychain; vòng đời node; build app. |
| **App-side UI** (Frontend/UIUX) | SuperApp — **Tùng** (frontend) | Màn "Tham gia LampNet" + "Đang đóng góp"; tiêu thụ endpoint REST; design token; 4 trạng thái màn. |

**Ranh giới dữ liệu:** màu/bo-góc/font/spacing = Frontend (UI-UX-STANDARD §3 token). Endpoint/format dữ liệu (snake_case wire) + DID + error code = hợp đồng FE⟂BE (INTEGRATION §3/§7). SuperApp KHÔNG tự định nghĩa nghiệp vụ Join, chỉ *tiêu thụ*.

---

## 2. Luồng + endpoint (bản NÀY — inherit upstream §1)

Giữ nguyên hợp đồng LampNet (verify daemon: join 107 / splash 110 / reward 31 / mobile-sdk 15 / mobile_settle 13):

| Bước | Gọi | Ghi chú tích hợp app |
|---|---|---|
| 0. Bootstrap | `GET /v1/peer_id` | lấy `bootstrap_did` |
| 1. Đăng ký | SDK Rust `join_and_contribute(JoinConfig)` → hoặc `POST /v1/join/v2/request` | trả tier + node key |
| 2. Kích hoạt ví | `POST /v1/wallet/activate` | gắn địa chỉ nhận thưởng |
| 3. Nhận lease | `POST /v1/mobile/lease` | daemon giao workload |
| 4. Tải payload | `POST /v1/mobile/payload/:lease_id` | ký `lease_id` |
| 5. Báo kết quả | `POST /v1/mobile/report` | daemon recompute-verify |
| 6. Quyết toán | `POST /v1/mobile/settlement` (+ `/drain`) | tích thưởng epoch |
| 7. Xem thưởng | `GET /v1/reward/epoch`, `GET /v1/reward/settlement` | |
| Phụ | `GET /v1/node/stats`, `GET /v1/network_info` | trạng thái node |

**Tiêu thụ API theo UI-UX-STANDARD §2.2 + INTEGRATION §7.3:** mọi lỗi phân biệt mạng ⟂ quyền ⟂ server; timeout → error; không nuốt lỗi. Wire format snake_case (INTEGRATION §3) — dùng đúng key BE trả, không tự đổi.

---

## 3. FFI SDK — `JoinConfig` app phải cung cấp (inherit upstream §1)

| Trường | Giá trị | Ràng buộc app-side |
|---|---|---|
| `subject_did` | PersonDID | Bản NÀY chấp `did:cardano:…`; **bản sau ép `did:phoenix`** → xem §6 nợ kỹ thuật. |
| `cardano_address` | `addr_test1…`/`addr1…` | địa chỉ nhận LAMP/MAGIC |
| `bootstrap_did` | từ bước 0 | |
| `seed_hex` | 32-byte khoá thiết bị | **BẮT BUỘC lưu Android Keystore / iOS Keychain**; rỗng → SDK tự sinh OS RNG. |
| `attestation_mode` | `"Hardware"` \| `"Software"` | Hardware = Keystore/Secure Enclave (mặc định điện thoại). |

**Bảo mật seed (NORMATIVE — INV-3):** `seed_hex` là khoá bí mật thiết bị. KHÔNG log, KHÔNG rời máy, KHÔNG ghi vào store/đám mây, KHÔNG lộ ra JS bridge dạng plaintext dài hạn. Sinh/đọc trong native (Android Keystore-backed key / iOS Keychain + Secure Enclave). On-chain chỉ hash/commitment (INV-3) — seed thuần off-device-store, ở lại Secure Element.

---

## 4. UI (bản NÀY — inherit upstream §2)

Mọi màn tuân UI-UX-STANDARD §3 (chỉ tiêu thụ token, zero hardcode màu) + §10/INTEGRATION §7.3 (đủ 4 trạng thái loading/empty/offline/error) + §11 (brand-strip về app chủ, kênh 1+2).

1. **Màn "Tham gia LampNet"** — nút Join; chọn mức đóng góp (giới hạn CPU/RAM/băng thông app cho phép); hiện tier sau đăng ký. (Bản sau: thêm ước tài nguyên + W điện/ngày — §6.)
2. **Màn "Đang đóng góp"** — trạng thái node (online, việc đang chạy), số việc đã verify, thưởng tích luỹ (đọc `/v1/node/stats` + `/v1/reward/epoch`).
3. **Bảo mật hiển thị** — DID + địa chỉ ví; seed KHÔNG hiện; nút rút (bản sau).
4. **Minh bạch** — "máy bạn đang chạy việc gì" (loại workload) + đã verify.

**Trạng thái đặc thù Join** (bổ sung §7.3):
- *Offline*: node mất mạng → hiện rõ "tạm dừng đóng góp", không mất tiến độ; nối lại tự đăng ký lease tiếp.
- *Error mạng ⟂ quyền*: 4xx quyền/tier ≠ 5xx daemon ≠ mất mạng — thông điệp khác nhau, có retry.

---

## 5. Phạm vi bản NÀY — làm được NGAY (upstream §5)

Vòng compute-contribution end-to-end trên dev daemon: Join → lease → report → verify → tích thưởng (µLAMP in-memory). **Test thực địa được ngay** trên điện thoại. **Chưa** ra MAGIC thật (chờ settlement tx) và **chưa** góp lưu trữ/seed-phân-tán/media.

---

## 6. Nợ kỹ thuật + nâng cấp BẢN SAU (upstream §3/§4 — LampNet làm trước, SuperApp cập nhật sau)

| Hạng mục | Trạng thái LampNet | SuperApp làm sau | Ràng buộc thiết kế NGAY |
|---|---|---|---|
| **did:cardano → did:phoenix** | LampNet đang đưa lên | Thay luồng DID demo bằng PhoenixKey | **Cô lập DID sau 1 adapter** (INV-2 data⟂experience): UI/logic KHÔNG đọc trực tiếp `did:cardano`; đổi issuer bản sau không đụng UI. Nay dùng did:cardano CHỈ trong lớp binding. |
| **Ước tài nguyên + điện** (`ContributionPlan`/`estimate_contribution`) | PR mobile-sdk đang lên | Màn trước-Join hiện CPU/RAM/băng thông + W điện/ngày | Chừa chỗ UI trên màn "Tham gia". |
| **MAGIC THẬT vào ví** (submit tx Cardano) | đang thiết kế (nay dry-run) | Màn ví: số dư MAGIC thật + lịch sử rút | Nay hiển thị µLAMP in-memory, ghi rõ "thử nghiệm". |
| **App-loop nền** (FGS Android / BGTask iOS) | chưa có | Chạy đóng góp khi màn tắt | Kiến trúc node tách khỏi màn để gắn FGS sau. |
| **Góp LƯU TRỮ** (StorageReplica + PoR) | chưa xây (P1) | Màn "góp dung lượng ổ" | — |
| **JSON response chuẩn `/v1/mobile/*`** | LampNet đang thêm | Cập nhật parser khi chuẩn xong | Parser khoan cứng hoá field lạ; log field chưa biết. |

---

## 7. Cross-spec contracts (§13 pointer)

- **Danh tính** → PhoenixKey (inherit, không redefine) — INTEGRATION §3.1. Bản sau ép did:phoenix.
- **Ví/token** → SG5 Wallet (LAMP/MAGIC dùng chung); Join chỉ cung cấp `cardano_address` nhận thưởng, KHÔNG tự cầm/chia tiền.
- **Data residency** → LampNet fabric thực thi (Master §3bis + Non-goal); SuperApp chỉ tiêu thụ.
- **Design system** → UI-UX-STANDARD (token dùng chung mọi platform).

---

## 8. Checklist READY (subset INTEGRATION §8 — Join-relevant; evidence output thật)

- [ ] Zero hardcode màu; chỉ tiêu thụ design token (lint CI xanh).
- [ ] Brand-strip về app chủ (kênh 1+2).
- [ ] `seed_hex` chỉ trong Keystore/Keychain; không log, không rời máy (INV-3).
- [ ] Đủ 4 trạng thái loading/empty/offline/error mọi màn Join.
- [ ] Route/navSlot đăng ký theo navigation grammar (INTEGRATION §7.1), nav config-driven.
- [ ] Lỗi phân biệt mạng ⟂ quyền ⟂ server; có retry.
- [ ] DID cô lập sau adapter (đổi did:cardano→did:phoenix không đụng UI).
- [ ] **Verify (CLAUDE.md)**: `curl` từng endpoint mobile với payload thật trên dev daemon; RN `analyze + test` CI xanh; chạy end-to-end Join→verify→thưởng có evidence output.

---

## 9. Change Log
- v0.1 (2026-07-01): Khởi tạo spec tích hợp Join app-side từ message LampNet `SuperApp-Join-Integration.md`. Khoá ranh giới FE⟂BE, hợp đồng endpoint + FFI JoinConfig, bảo mật seed (INV-3), UI + 4 trạng thái, nợ kỹ thuật did:cardano→did:phoenix (cô lập adapter, INV-2). Chờ anh duyệt.
