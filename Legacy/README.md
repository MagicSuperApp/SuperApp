# Legacy — thứ đã bị thay, giữ để đối chiếu

> **Quy tắc chủ dự án:** *luôn đọc đúng MỘT nguồn tài liệu. Chỗ nào có hơn một nguồn thì đối chiếu
> xem cái nào đúng chuẩn, rồi cất cái kia vào đây.*
>
> **Không có gì trong thư mục này được dùng để build hoặc để tra cứu.** Giữ lại vì hai lý do:
> (a) truy được vì sao đã đổi, (b) ai đã trót viết mã theo bản cũ thì đối chiếu được chỗ lệch.
> Mọi tệp ở đây vào bằng `git mv` nên `git log --follow` vẫn ra lịch sử đầy đủ.
>
> Cất vào 2026-08-10. Nguồn chuẩn hiện hành: `Integration-Standard.md §10.1` + INDEX `§11`.

---

## 1. `Integration-ProofChat-snapshot-2026-07-11.md`

**Trước ở:** `Integration/ProofChat.md`

**Vì sao bị thay:** đây là bản chụp của contract ProofChat **v2026-07-04**. Chính ProofChat đã phát
hành bản **2026-08-08** thay nó, và mở đầu bản mới bằng một mục liệt kê **bốn chỗ bản cũ dạy SAI**
— tức bản chụp này không chỉ cũ, nó dạy sai:

| # | Bản cũ dạy | Sự thật |
|---|---|---|
| 1 | `participantIds` nhận `did:phoenix:...` | nhận **`User.id` (uuid)**. Truyền DID vào thì hội thoại tạo xong nhưng **rỗng người, không báo lỗi** |
| 2 | `POST /conversations` không cần `id` | `id` **bắt buộc**, thiếu ⇒ **400** |
| 3 | `encryptedContent` là đối tượng `{opkId,type,body}` | ở cửa REST là **chuỗi**, gửi đối tượng ⇒ **400** |
| 4 | JWKS PhoenixKey ở `/.well-known/jwks.json` | đường đó **404**; đường đúng có tiền tố `/api/v1` |

**Nguồn chuẩn nay ở:** `ProofChat/INTEGRATION.md` (v2026-08-08). Đọc mục ⚠️ ở **đầu** tài liệu trước
mọi thứ khác. Thư bàn giao đi qua kênh thư nội bộ giữa các đội, không nằm trong kho.

---

## 2. `Integration-OriLife-snapshot-2026-07-11.md`

**Trước ở:** `Integration/OriLife.md`

**Vì sao bị thay:** hai lý do cộng lại.

1. **Chính OriLife đã cất bản này rồi.** Tệp gốc của họ nằm ở `OriLifeTrace/Legacy/SuperApp-Integration.md`
   — cùng ngày chụp, gần như cùng nội dung. Bản còn sót lại trong SuperApp là bản sao lẻ của một tài
   liệu mà chủ của nó đã cho nghỉ.
2. **Bản trong SuperApp còn THIẾU so với bản OriLife cất đi**: mất hẳn mục *"Ràng-buộc tích-hợp ĐÚNG
   (INV-1 — bài học B2/bark 07-11)"* gồm 6 điểm (không cho client tự sinh id · một backend nguồn-sự-thật ·
   render `owner_review` đúng · server-first · giao-thức chụp vỏ · media có nhãn `part`). Đây đúng là
   phần đắt nhất, đúc ra từ bug thật.

**Nguồn chuẩn nay ở:** `OriLifeTrace/OriLife-Integration.md` (v0.2.2 · 2026-08-06), ở root repo OriLife.

---

## 3. `MobileCore-v0.2-2026-07-16/`

**Trước ở:** `MobileCore/` (gốc repo)

**Vì sao bị thay:** cây vendored, chụp đúng ngày SuperApp bàn giao MobileCore đi (2026-07-16) và đứng
yên từ đó. Repo chủ đã đi tiếp:

| | Cây trong SuperApp (cất đi) | Repo chủ `MobileCore/` |
|---|---|---|
| Version | v0.2 — 2026-07-16 | **v0.3 — 2026-07-28** |
| Test L0 | 261 | **458** (+ 5 test hợp-đồng L1) |
| Cây thư mục | `l0/ml/…` | đã đổi tên `Kernel/ml/…` |

Nó cũng **chưa từng được dùng**: `grep` toàn repo ra **0 lệnh import** từ `src/` — chỉ 2 dòng chú
thích nhắc tên. Chính `tsconfig.json` cũng đã tự khai điều đó và loại cây này khỏi `tsc`.

**Nguồn chuẩn nay ở:** repo `MobileCore` (`@magiclamp/mobile-core`) — có CI riêng.
Ranh giới: SuperApp **không còn phụ trách MobileCore** từ 2026-07-16, nay chỉ tiêu thụ API platform.

---

## Không nằm ở đây — hai thứ cố ý để nguyên

### `_team-messages/` (25 tệp) — kênh thư cũ, KHÔNG cất được bằng `git mv`

Đúng là kênh thư đã ngừng: tệp mới nhất **2026-07-07**, còn kênh thay nó chạy từ 2026-07-14 tới
nay và nằm ngoài kho. Nhưng **không cất vào đây được**, vì:

- `_team-messages/` bị `.gitignore:5` chặn ⇒ **git chưa từng theo dõi nó**. Không có lịch sử để giữ,
  và `git mv` không chạy trên tệp untracked.
- Nó chỉ tồn tại trong thư mục làm việc chính, không có trong cây được kiểm ra.
- Đưa 25 lá thư nội bộ vào git là một quyết định khác hẳn việc dọn tài liệu — **chủ dự án quyết**,
  agent không tự làm.

**Đã làm thay:** sửa các chỗ TRÍCH vào kênh cũ trong tài liệu được git theo dõi, đánh dấu rõ đây là
kênh đã ngừng và nằm ngoài repo (`Specs/Platform-Feat-Spec.md` ×4, `.env.example`). Còn
`Specs/_reviews/Platform-Feat-Spec.review-ledger.md:118` **để nguyên** — đó là biên bản một lượt rà
soát đã xảy ra, sửa vào biên bản là sửa lịch sử.

### `Integration/PhoenixKey.md` — trùng lặp thật, nhưng chưa cất

Canonical là `PhoenixKeyDID/PhoenixKey-SDK/INTEGRATION.md` (anh chốt 2026-07-21) và nó phủ đủ mọi thứ
bản trong repo này có, kể cả hợp đồng Grant `mint-lamp`. Đã biết **một chỗ lệch nguy hiểm**: canonical
nói `grantee_did` để trống khiến Grant thành **bearer** nên phải LUÔN đặt, bản trong repo ghi "tuỳ chọn".

Chưa cất vì tệp còn lẫn phần trạng thái riêng của SuperApp (Readiness, việc app phải sửa) chưa gỡ ra
chỗ khác — gỡ là việc chỉnh sửa nội dung, không phải việc dọn. **Đã đánh dấu đỏ ở đầu tệp + ở §11**
rằng nó không phải nguồn chuẩn. Chờ chủ dự án chốt.

`Integration/AladinWork.md` và `Integration/LampNet.md` giữ nguyên vì hai team đó **chưa publish** file
ở repo mình — cất đi là mất nguồn duy nhất.
