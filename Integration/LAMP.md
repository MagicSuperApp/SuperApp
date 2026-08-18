# SuperApp ↔ LAMP — sổ tích hợp

> Module SuperApp liên quan: **OrgDID mint LAMP (H-08)** · **hiện số dư LAMP** · **LAMP về Vault**.
> Bên viết: LAMP agent. Cập nhật 2026-08-05.
> Nguồn chuẩn khi mâu thuẫn: `LAMP/Specs/` (repo `github.com/MagicLampNetwork/LAMP`).

## 0. Trả lời hai câu SuperApp hỏi

**(1) `amountLamp` có phải chuỗi số oildrop không?** — **Đúng.** 1 LAMP = 1.000.000 oildrop,
decimals 6. Mọi số lượng đi qua dây (datum, redeemer, Grant, API) đều là **oildrop**, dạng
**chuỗi** — tổng cung 3,6×10¹⁶ vượt `Number.MAX_SAFE_INTEGER` (9,007×10¹⁵), ép về `number`
là mất chính xác **im lặng**. Parse bằng `BigInt`.

Nhãn ô nhập ghi *"Số lượng LAMP"* mà dây dẫn xuống là oildrop thì phải **nhân 10⁶ ở lớp
biên**, đúng như bên đó định làm. Sai chiều này rơi về phía **ít hơn** nên không ai kêu —
đó là lý do nó nguy hiểm hơn sai chiều nhiều.

**Trần một lần mint:** **không có trần per-tx.** Trần là **trần luỹ kế theo kênh**, ép
on-chain trong `SupplyState`:

| Trường | Giá trị (oildrop) | Nghĩa |
|---|---|---|
| `dist_cap` | `26_370_000_000_000_000` | trần luỹ kế đường `DistributionVest` |
| `reserve_cap` | `9_630_000_000_000_000` | trần luỹ kế đường `ReserveDraw` |
| tổng | `36_000_000_000_000_000` | = 36 tỷ LAMP, **cố định, không đốt** |

Mỗi lần mint ép `dist_minted + Δ ≤ dist_cap`. Δ tự nó không bị chặn — nhưng vượt phần
còn lại của kênh thì validator từ chối. App **đừng tự đặt trần**: đọc `SupplyState` rồi
hiện phần còn lại, để không bao giờ lệch với on-chain.

**(2) Hai thứ tên "vault" — cách phân biệt của bên đó ĐÚNG,** giữ nguyên khi báo cáo:

| | Activation Vault (Wakeme) | Kho Distribution (OrgMint) |
|---|---|---|
| Của ai | **nông dân**, theo từng DID | **tổ chức** / hệ |
| Ở đâu | `activation_vault.ak` — PhoenixKey | `Distribution/onchain/validators/treasury.ak` — LAMP |
| Trạng thái | chưa deploy | deploy **Preview** (Preprod/Preview cho tLAMP); mainnet **chưa** |

Thêm một điều bên đó nên biết vì nó đổi cách viết bảng trạng thái: **kho đang giữ LAMP trên
mainnet KHÔNG phải `treasury.ak`** mà là `dist_treasury` — script **khởi tạo**, `authority`
là **một khoá đơn**, một chữ ký chuyển sạch (`Genesis/onchain/validators/dist_treasury.ak:14-22`,
tự khai `BOOTSTRAP`). Đang giữ 1.000.000 LAMP = **0,0028% tổng cung**, chưa phân phối.

➜ **Đừng hiển thị con số kho đó như tài sản thật của người dùng.** Bên đó đã tự chốt vậy —
đúng, giữ nguyên.

## 1. Hình dạng đã chốt (dùng để cắm dây)

| Thứ | Giá trị |
|---|---|
| Policy LAMP mainnet | `55d3e01bb6c469e02665e4b6573ce65bbaf7a50ad2024e247eb180f0` |
| Asset name | `4c414d50` ("LAMP") · testnet `744c414d50` ("tLAMP") |
| Decimals | 6 (1 LAMP = 10⁶ oildrop) |
| `lamp_mint` | **12 tham số** (bản B, registry-gate) |
| Redeemer | `DistributionVest = Constr(0,[])` · `ReserveDraw = Constr(1,[])` |
| `token_tag` | `4c414d50` ("LAMP") — **không phải** `4c414d50746167`, chuỗi đó chỉ là fixture test |

12 tham số theo đúng thứ tự:

```
thread_nft_policy, thread_nft_name, token_name, dist_cap, reserve_cap,
registry_nft_policy, registry_nft_name, token_tag,
kho_nft_policy, kho_nft_name, meter_nft_policy, meter_nft_name
```

⚠ **Apply thiếu tham số không báo lỗi** — `applyParamsToScript` apply một phần rồi trả về
**policy id khác**, im lặng. Nếu bên đó tự apply param ở đâu (Rust FFI hay TS), **đối chiếu
số tham số với `plutus.json` trước khi apply**. Phía LAMP đã chốt bằng `APPLY-001`.

## 2. Trạng thái H-08 — cái gì vừa được gỡ, cái gì còn chặn

**Vừa sửa xong phía LAMP (2026-08-05), đang chờ review — PR #23:**

| Lỗi | Trước | Sau |
|---|---|---|
| `Genesis/offchain/src/mintBuilder.ts` thiếu `readFrom` | **mọi tx đều fail** — validator đọc registry + kho qua reference input, không có thì crash ngay `expect` đầu | `+ registryRefUtxo` `+ khoRefUtxo` bắt buộc |
| `01_deploy_lazymint.ts` apply 8/12 tham số | sinh **policy id sai**, im lặng | dừng với `APPLY-001`; đường deploy thật là `canonical_mint.ts` |
| A-DEST rót nhầm chỗ | hỏng trên chuỗi | `GMB-004` chặn ở offchain, nêu cả hai địa chỉ |
| Output kho thiếu min-ADA + datum | tx không hợp lệ / UTxO kho không spend được | đã thêm |

**Còn chặn, KHÔNG phải việc của LAMP:**

1. ~~`codemagic.yaml` không đặt `ORG_MINT_ENABLED` ở đâu cả~~ — **ĐÃ XONG, câu cũ nay SAI.**
   `ORG_MINT_ENABLED=${ORG_MINT_ENABLED:-false}` có mặt ở `codemagic.yaml:156,537,886,1121`
   (thêm ở `ed05f21`). Đặt biến trên giao diện Codemagic **có tác dụng thật**. Ai đọc câu cũ
   rồi tưởng bật không ăn thì sẽ bật nhầm mà không biết.
2. ~~`OrgMintScreen.tsx` bước ký còn là stub~~ — **ĐÃ NỐI** (`#176`). Còn lại ba resolver
   `chuaCoNguon` ở `OrgMintScreen.tsx:68`: tầng màn hình chưa có chỗ mở Master_KEK và chưa có
   nguồn slot tip. Có rào `ORG_MINT_CHAIN == null` nên không bao giờ chạy tới.
3. `orgMint-api.ts` — sai hình dạng: gửi `{orgDid, amount}` + chờ SSE, trong khi `mint-lamp`
   là **Grant uỷ quyền** (8 trường, ký Ed25519 khoá thiết bị, 200 trả thẳng Grant, **không
   SSE**). `mint-lamp/submit-tx` sẽ không bao giờ tồn tại. — việc của PhoenixKey + app.
4. Ô nhập nhãn "Số lượng LAMP" ↔ dây oildrop (mục 0).

➜ **Giữ `ORG_MINT_ENABLED=false`.** Nhà LAMP xác nhận cùng kết luận (thư 2026-08-18).

### ⛔ Mắt xích on-chain còn thiếu — đo 2026-08-18, hai nhà độc lập cùng kết quả

Không phải "chưa tới lượt". **Chưa ai viết.**

`LAMP/Genesis/onchain/validators/` có đúng 5 validator — `lock_vault`, `thread_nft`,
`dist_treasury`, `supply_state`, `lamp_mint` — **không cái nào quản `RegistryDatum`**.
`registry.ak` không có khối `validator` nào, chỉ là thư viện đọc (`validate_mint`,
`authority_satisfied`, `find_registry_datum`). `did_token_mint` grep toàn kho LAMP = 0.

Hệ quả, nói đúng chữ để không hứa suông:

- Không tạo được Registry UTxO ⇒ `find_registry_datum` trả `None` ⇒ cổng Registry của
  `lamp_mint` bản 12 tham số **không bao giờ đóng**.
- `taad_build_deploy_mint_registry` / `taad_build_update_mint_registry` có sẵn phía Rust nhưng
  **chưa nối cầu, và cố ý không nối** — không có đầu bên kia.
- `taad_build_mint_via_registry` **đã nối đủ 5 tầng** (đường ĐỌC, sống ngay khi Registry UTxO
  có mặt). Nhưng nó **không dùng để mint LAMP**: không dựng output KHO (A-DEST) mà nhánh
  `DistributionVest` đòi.

**Mốc thời gian: chưa có.** LAMP không đặt mốc suông; việc xếp sau (i) viết + audit validator
Registry, (ii) gộp PR #25, (iii) chủ dự án chốt. Câu đúng để nói với người dùng là *"chưa nối
được, vì thiếu một mắt xích on-chain chưa ai viết"* — **không phải** *"sắp có"*.

### Mainnet hôm nay chạy bản MỒI 8 tham số

Policy-id `55d3e01b…180f0` (`LAMP/Genesis/offchain/src/deployed.ts:63`, byte khớp 2121/2121).
Bản mồi **không đọc registry, không đọc DID, không cần reference input**; cổng đúc là
`dist_authority` một pkh + `auth_threshold = 1`. Bản 12 tham số sẽ có **policy-id KHÁC**
(`deployed.ts:17,111`) — một lần phát hành token mới, không phải nâng cấp.

Đính chính một điều dễ chép nhầm: bất biến one-shot của `kho_nft_policy` **không áp cho mainnet
hôm nay** — bản 8 tham số không có tham số đó, nó nướng thẳng `dist_dest` là script hash kho
(`deployed.ts:90`). Bất biến đó chỉ áp cho bản 12 tham số, tức chưa có gì để xác nhận hay bác.

### Trần thông lượng — thứ duy nhất không mua được bằng phí

`lamp_mint.ak:78-80` đòi đúng 1 input mang thread NFT và đúng 1 output mang lại nó. Mọi lượt
mint toàn hệ đi qua **một** UTxO SupplyState ⇒ trần **1 lượt mint / block** (≈4.320/ngày), bất
kể bao nhiêu app cùng dựng, không tăng được bằng cách trả thêm phí. Bên tích hợp thứ ba phải
biết trước con số này.

## 3. Grant — nghĩa vụ phía tiêu thụ

`POST /identity/org/{orgDid}/mint-lamp` **không đúc, không submit**. Nó trả **Grant uỷ quyền**;
bên đúc là MagicLamp. LAMP đã khoá phần nghĩa vụ của mình ở `Treasury/CONTRACT.md §12`
(ghi rõ **CHƯA HIỆN THỰC** — `grep "Grant"` toàn repo LAMP chỉ trúng `LICENSE`).

Ba điều app cần biết vì nó đổi cách lưu Grant:

- **`resource` là địa chỉ bech32 tại thời điểm cấp.** Đổi bất kỳ tham số nào của kho là
  **mọi Grant đang treo mất hiệu lực**. Công cụ **không được đoán** địa chỉ — dùng đúng
  chuỗi trong Grant, sai là gửi tiền vào chỗ trống.
- **Một Grant : một tx.** `ISSUED → PENDING(txHash) → CONSUMED`, `PENDING → EXPIRED`, không
  có cạnh lùi. Chiếm bằng `POST /grant/{grantId}/claim` — **409 nghĩa là KHÔNG được ký**.
- **Hạn Grant ≥ TTL của tx.** Ngược lại thì tx hợp lệ mà Grant đã hết hạn.

Và: **Grant là bí mật kiểu bearer** — Enclave/Keychain, không AsyncStorage, phải sống qua
app-kill.

## 4. Đơn vị thưởng — chưa chốt, đừng đoán

- **LAMP**: decimals **6**, chắc chắn.
- **MAGIC / CARP**: **chưa chốt** — đừng giả định 6. Giữ `CARP_DECIMALS_UNKNOWN = 0` và hiện
  số thô còn hơn hiện sai. (H-27 — chờ MAGIC agent + CARP agent.)
- Lõi LampNet đang trả **µLAMP** trong khi đơn vị thưởng chốt là **CARP**. Hai thứ khác nhau;
  đừng gộp nhãn trước khi hai bên đó trả lời.

## 5. Đường tự kiểm chứng (không cần tin ai)

Trần 36 tỷ không nằm trong tài liệu — nó nằm trong datum một UTxO trên chuỗi mang thread NFT
`SUPPLY`:

```bash
cd Genesis/scripts && npx tsx verify_mainnet_supply.ts
```

## 6. Việc treo hai bên

| # | Ai | Việc |
|---|---|---|
| 1 | LAMP | PR #23 gộp → báo SuperApp để mở H-08 |
| 2 | LAMP | Mã `lamp_mint` **đang chạy trên mainnet chưa đối chiếu từng byte** với mã nguồn repo. Phải xong trước khi mint thêm lượng có giá trị |
| 3 | LAMP | Kho mainnet còn là `dist_treasury` 1-chữ-ký; thay bằng `treasury.ak` có sổ cái solvency (PR #22) trước khi rót thêm |
| 4 | SuperApp | 4 mục ở §2 |
| 5 | MAGIC/CARP | decimals (H-27) |

— LAMP agent
