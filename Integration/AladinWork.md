# AladinWork — SuperApp Integration

> Chuẩn: `SuperApp/Integration-Standard.md`. Snapshot: **2026-08-03** (thay bản 07-11 đã lệch).
> Nguồn chân lý đầy đủ: `AladinWork/Core → AladinWork-Integration.md` (gốc repo, nhánh
> `feat/taskers-directory`, chờ duyệt đẩy). File này chỉ giữ phần SuperApp cần để nối.
> Module SuperApp: **Việc-làm** (jobs/offerings/taskers/contracts/pledge/match).

## Điểm vào
- `WORK_API_URL=https://api.aladin.work/api/v1` — ngữ cảnh `/api/v1` nằm TRONG base.
- Thăm dò sống PHẢI là `{base}/health`. `api.aladin.work/health` (thiếu `/api/v1`) trả 404.
- **Đo 2026-08-03 (SuperApp tự curl): `api.aladin.work/api/v1/health` → 502.** Máy chủ gốc
  không phản hồi. AladinWork agent đo cùng ngày ra **530** (Cloudflare 1033) — khác mã, cùng
  một việc: đường tới máy gốc đứt. Việc vận hành, không phải lỗi mã.
- Chạy cục bộ trong lúc chờ: repo `AladinWork/Core`, `docker compose up -d` theo `DEPLOY.md`,
  rồi `WORK_API_URL=http://localhost:7040/api/v1`. Toàn bộ luồng dưới đây chạy thật, không cần khoá.

## Đăng nhập — PhoenixKey ký, AladinWork cấp phiên (không có khoá tĩnh)
1. `POST /auth/challenge {did}` → `{challenge, domain, expiresAt, messageTemplate}`
2. Ký P-256 trên `sha256("<challenge>:<domain>:<timestamp>")`, chữ ký DER hex, lệch cho phép ±60s.
3. `POST /auth/verify {did, challenge, signature, timestamp}` → `{session}` →
   `Authorization: Bearer <session>` (12 giờ).
- `401 UNAUTH` = chữ ký/phiên sai → mời đăng nhập lại.
- `503 PHOENIXKEY_UNAVAILABLE` = **dịch vụ danh tính chết** → báo gián đoạn, ĐỪNG bắt đăng nhập lại.
- DID lạ đăng nhập hợp lệ lần đầu → tự tạo hồ sơ rỗng. Không có đường tạo tài khoản bỏ qua PhoenixKey.

## Khuôn phản hồi
Thành công trả thẳng dữ liệu (không bọc). Lỗi: `{ "error": "<câu tiếng Việt hiện được>", "code": "<MÃ>" }`.
Mã hay gặp: `BAD_INPUT` 400 · `UNAUTH` 401 · **`NO_FUNDS` 402 (thiếu CARP)** · `FORBIDDEN`/`NOT_QUALIFIED` 403 ·
`NO_JOB`/`NO_OFFER`/`NO_TEMPLATE`/`NO_CONTRACT`/`NO_ACC` 404 · `JOB_CLOSED`/`ALREADY`/`ESCROW_RULE`/**`CONFLICT`** 409 ·
`NO_EVIDENCE`/`EVIDENCE_SHORT` 400 · `CARDANO_OFF` 503.

## Hai bất biến ứng dụng phải tôn trọng
- **`Idempotency-Key`** trên mọi lời gọi ghi: gửi lại cùng key → trả lại kết quả cũ, KHÔNG chạy lần
  hai (không trừ CARP hai lần, không tạo hai dịch vụ). Mạng di động chập chờn thì luôn gửi.
- **`If-Version: <version đang cầm>`** khi chạy hành động hợp đồng; lệch → `409 CONFLICT`, hành động
  không chạy.

## Endpoint
| Nhóm | Đường |
|---|---|
| Mẫu việc | `GET /templates` · `GET /templates/:key` (công khai; `fields[]` đủ để dựng biểu mẫu động) |
| **Danh bạ thợ** | **`GET /taskers ?templateKey= &availableOnly=1 &limit= &now=`** (công khai) |
| Dịch vụ (cung) | `GET /offerings ?ownerDid= ?activeOnly=1` · **`POST /offerings`** · **`PATCH/DELETE /offerings/:id`** |
| Tin việc (cầu) | `GET /jobs ?openOnly=1` · `GET /jobs/:id` · `POST /jobs` · `GET /jobs/:id/match` |
| Hồ sơ | `GET /me` · `GET /accounts` · `POST /capabilities` · `POST /capabilities/:id/verify` |
| Lịch rảnh | `GET/POST/DELETE /availability` · `GET /availability/:did` (epoch **ms**) |
| Hợp đồng | `POST /contracts` · `GET /contracts` · `GET /contracts/:id` · `POST /contracts/:id/:action` |
| Trò chuyện | `POST/GET /contracts/:id/conversation` (ProofChat) |
| Bằng chứng | `POST /contracts/:id/evidence/register` (chỉ bên làm) · `GET /contracts/:id/evidence` |
| Khác | `GET /health` · `GET /treasury` · `GET /team/members` |

`action` ∈ `lockPledge · activate · deliver · confirmPayment · mutualRelease · forfeit · dispute`.
Trạng thái: `INIT → PENDING → ACTIVE → DELIVERED → RELEASED` (+ `FORFEITED` / `DISPUTED`).
`lockPledge {side:"aladin"|"genie", amount}`.

## `GET /taskers` — danh bạ thợ (đóng H-02)
```jsonc
{ "total": 2,
  "taskers": [{
    "did": "did:phoenix:…", "name": "Minh", "avatar": "🎬", "title": "…", "kind": "person",
    "reputation": 78,                  // HIỆU DỤNG, thang 0..100 — KHÔNG phải bộ đếm cũ
    "reputationRaw": 112,              // bộ đếm cũ, ĐỪNG hiển thị
    "reputationBasis": { "settledRecords": 6, "independentPartners": 3,
                         "antiGamingDiscount": 0.7 },
    "fromPriceVND": 90000,             // giá SÀN các dịch vụ đang mở; chưa có dịch vụ ⇒ null
    "distanceKm": 3.4,                 // cần gọi kèm ?lat=&lon=; thợ chưa khai toạ độ ⇒ null
    "lastActiveAt": 1785700000000,     // chưa có dấu vết ⇒ null
    "avatarUrl": null,
    "skills": ["video","motion-graphics"],
    "verifiedCredentials": 1,
    "credentials": [{ "taskType": "gt:video:short_form", "archetype": "A19",
                      "metric": { "videos": 80, "views": 25000 }, "quality_tier": "B" }],
    "offerings":   [{ "id": "DV-001", "templateKey": "video_short",
                      "name": "Sản xuất video ngắn", "minPriceVND": 90000 }],
    "available": false, "availableFrom": null, "availableUntil": null,
    "completedJobs": 0
  }]
}
```
- **Chỉ người đã chào năng lực mới lọt danh bạ** (có chứng chỉ đã duyệt gắn đúng một JobType, hoặc
  dịch vụ đang mở, hoặc đã khai lịch rảnh) ⇒ màn không đầy thẻ trắng của hồ sơ vừa đăng nhập.
- **Thứ tự tất định**: uy tín → việc đã tất toán → số chứng chỉ → did. Kéo làm mới không nhảy.
- `?availableOnly=1` lọc cứng theo cửa sổ thời gian; `?now=<epoch ms>` để dựng lại đúng một cảnh.
- Công khai — không kèm ví/khoá phiên/đối tác hợp đồng, an toàn hiện trước khi đăng nhập.
- `GET /accounts` KHÔNG thay được: nó trả cả bên đi thuê lẫn hồ sơ rỗng, thiếu uy tín/chứng chỉ/giá.

### ⚠ `reputation` ĐỔI NGHĨA (AladinWork Core PR #12, chờ merge)
Trước là bộ đếm cộng dồn. Lỗ: `mutualRelease` cộng **+5 cho CẢ HAI bên** mỗi lần tất toán, mà
khớp việc đọc thẳng con số đó ⇒ hai tài khoản bắt tay tất toán qua lại là một **máy in thứ hạng**,
không cần khách thật, không cần tiền thật.

| Trường | Dùng thế nào |
|---|---|
| `reputation` | **uy tín hiệu dụng, thang 0..100** = r̂ (co rút Bayesian trên sổ hợp đồng) × D (chiết khấu chống gaming). **Đây là số app hiển thị.** |
| `reputationRaw` | bộ đếm cũ, giữ cho bên đang dùng — **ĐỪNG hiển thị** |
| `reputationBasis` | `{settledRecords, independentPartners, antiGamingDiscount}` — để thẻ nói "dựa trên 6 việc với 3 khách" thay vì một con số trần trụi |

**`reputation` KHÔNG phải hàm của `completedJobs`.** Một tài khoản có thể `completedJobs = 20` mà
`reputation = 0` — đúng ca kẻ farm: 20 hợp đồng nhưng chỉ với MỘT đối tác, luân phiên vai. Hai số
đo hai thứ khác nhau (số việc vs số việc ấy đáng tin tới đâu). Hiện cả hai thì đặt cạnh nhau có
nhãn rõ, đừng để người dùng tự suy ra quan hệ.

**Toạ độ thợ KHÔNG bao giờ ra ngoài** — nằm ở `offering.geo`, `GET /offerings` bóc bỏ trước khi
trả; máy chủ chỉ trả `distanceKm`. Khoảng cách không dựng ngược thành toạ độ được.

**Ba trạng thái lịch rảnh:** `available:false` + `availableFrom:null` = **chưa khai lịch** ·
`false` + có mốc = đã khai nhưng ngoài cửa sổ · `true` + có mốc = rảnh tại thời điểm hỏi.
`?now=<ms>` để app và máy chủ không đọc hai đồng hồ khác nhau.

> **ĐỪNG dựng màn H-02 theo bản chụp này.** Đợi Core PR #12 merge rồi lấy shape từ
> `AladinWork/Core → AladinWork-Integration.md` (gốc repo) — nguồn chân lý của họ.

## `POST /offerings` — nửa CUNG của chợ (mở H-28)
Trước đây `offerings` chỉ sinh từ dữ liệu seed demo; bỏ seed ở môi trường thật ⇒ danh sách dịch vụ
**vĩnh viễn rỗng** và `POST /contracts {offeringId}` không bao giờ dùng được. Nay có đường ghi:

| Đường | Ghi chú |
|---|---|
| `POST /offerings` (Bearer, nhận `Idempotency-Key`) | `{templateKey, name?, minPriceVND?, mode?, radiusKm?, schedule?, desc?, fields?}` → 201 |
| `PATCH /offerings/:id` | chỉ chủ; `templateKey` **không đổi được** |
| `DELETE /offerings/:id` | **đóng mềm** → `{id, status:"closed"}` |

- Chủ gắn theo DID của phiên — `ownerDid` gửi trong thân yêu cầu bị bỏ qua.
- `mode` ∈ `online | offline | ca-hai`; `online` ép `radiusKm = 0`.
- `fields` chỉ nhận key đã khai trong mẫu (`GET /templates` → `fields[]`); sai enum/sai số →
  `400 BAD_INPUT`. Dựng biểu mẫu động từ `template.fields[]` là đủ, không mã hoá cứng.
- Trường giá trong `fields` tự theo `minPriceVND` — màn không hiện hai giá cho cùng một dịch vụ.

## Ba ví
`walletMAGIC` kế toán/định giá (không chuyển nhượng) · **`walletCARP` thanh toán — `402 NO_FUNDS`
là thiếu cái này** · `walletLAMP` bảo chứng. AladinWork **không** nạp/đúc/giữ hộ CARP (không có
`POST /wallet/deposit`). **Đơn vị hiển thị MAGIC/CARP chưa chốt** — in số thô còn hơn in sai (H-27).

## ⏳ ĐỔI ĐƠN VỊ TIỀN — đã bàn giao, CHƯA phát hành. Đừng nối theo phần này vội.
Nguồn: thư AladinWork 06/08 + `AladinWork/Core → AladinWork-Integration.md §7`. Mã của họ nằm ở
nhánh `feat/don-vi-thread-va-consume-magic-2026-08-06` (`731cd98`), **chưa đẩy**.

**Đo lại 06/08 (SuperApp tự curl) — máy thật vẫn chạy bản CŨ:**
```
GET api.aladin.work/api/v1/health → 200 · version 0.2.0
  money.vndPerMAGIC: 10000       ← trường CŨ, còn nguyên
  money.smallestMoveVND: 10000   ← chưa phải 0,00001
  (chưa có money.unit, chưa có money.consumption)
```

Mô hình mới: **MAGIC = đơn vị đo quyền tiêu thụ; CARP = token thật chi trả cho quyền đó.** Đơn vị
nhỏ nhất của CARP là `thread`, **1 CARP = 10⁹ thread**. `vndPerMAGIC` bị bỏ (nó biến MAGIC thành
đồng tiền thứ hai). Hạt lượng tử xuống 0,00001đ ⟹ cọc 57.500đ đúng bằng 57.500đ, không làm tròn
lên 60.000đ như hiện nay.

Sáu chỗ phải sửa trong `src/modules/work/` (đã đối chiếu, đúng vị trí), **cộng một chỗ họ sót:**
`data/workMockApi.ts:29 platformFeeMagic: 60` — dữ liệu giả đang vẽ ra một khoản phí không có thật.

⚠ **Chỗ nguy hiểm KHÔNG nằm ở trường đổi tên.** `walletCARP → walletThread` và
`platformFeeMagic → platformFeeNanogic` hỏng **ồn ào**: app đọc tên cũ ⟹ `undefined ?? 0` ⟹ hiện 0.
Nguy hiểm nằm ở `floor` · `pledgeLocked` · `pledgeAsk` — **giữ nguyên tên, giữ nguyên kiểu `number`,
chỉ đổi đơn vị**. Không tsc, không test, không lint nào bắt được. Mà đó lại đúng chỗ hiện ra ở
`screens/ContractDetailScreen.tsx:61` — hộp thoại xác nhận **khoá cọc**, tức khoảnh khắc người dùng
cam kết tiền: *"Khoá 57500000000 MAGIC làm cọc?"*.

⟹ Đã xin AladinWork đổi tên luôn ba trường đó (`pledgeAskThread`…) và thêm `pledgeLockedVND` /
`pledgeAskVND`. Nếu họ đổi tên thì thứ tự phát hành không còn quan trọng; nếu không, app **bắt buộc**
phải ra trước máy chủ — điều bên mình không hứa được, vì app đi qua cửa hàng và người dùng cập nhật
lúc nào là quyền của họ.

**Không gõ tay `/1e9`** — đọc `money.unit.threadPerCARP` từ `/health`.
**Đọc `platformFee.status`, đừng đọc con số 0** — phí đang 0 vì chưa chốt biểu phí, không phải vì
miễn phí. Hiện "Chưa áp dụng phí nền tảng", không hiện "Phí: 0đ".

`feeQuote` (mỗi dòng `{opType, label, count, unitNanogic, nanogic}` + `demandQ`, `surchargeIndex`)
đủ để dựng bảng phí giải thích được, không cần route mới.

## Còn nợ
- ~~🔴 máy chủ 502/530~~ — **đã sống. Đo 06/08: `api.aladin.work/api/v1/health` → 200.**
- 🔴 chứng chỉ dùng archetype **A19** bị validator VeData từ chối ⇒ `POST /capabilities/:id/verify`
  gãy với video ngắn / motion / ba mẫu nội trợ. Cách chữa đã chốt: A19 → A12, chờ VeData khoá phân
  loại phụ `competency_credential`. Đăng việc / khớp thợ / hợp đồng / danh bạ **không** dính.
- 🟠 `walletAddress` còn lọt trong `candidates` của `/jobs/:id/match` — **đừng hiển thị**, sẽ gỡ.
- Cọc và phí đang là kế toán ngoài chuỗi. **Đừng hứa với người dùng là tiền đang giữ trên chuỗi.**

## Changelog
- 2026-08-06: thêm mục đổi đơn vị tiền (thread) — **bàn giao, chưa phát hành**. Máy thật đo lại
  200 (hết 502) nhưng vẫn trả trường cũ. Đính chính chỗ hỏng âm thầm nằm ở `pledgeAsk`/`floor`
  chứ không ở trường đổi tên.
- 2026-08-03: thay toàn bộ theo bàn giao AladinWork agent — thêm `/taskers`, `POST /offerings`,
  availability/evidence/conversation, khuôn lỗi, hai bất biến ghi. Số đo host là số SuperApp tự curl.
- 2026-07-11: tạo file (5-agent cross-ref).
