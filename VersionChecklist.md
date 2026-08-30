# SuperApp — Version Checklist (đường tới bản Production)

> Mục tiêu: liệt kê MỌI thứ cần đạt để build production, thấy rõ còn gì phải hoàn thành.
> App build từ `MagicSuperApp/SuperApp`. Kho này nay dựng ra **hai** app từ cùng nền mã —
> Aladin (việc làm) và CheckFarm (ngành nông). Xem `instances/README.md` và
> `instances/LUAT-SUPERAPP.md`.
> Cập nhật: 2026-08-30. Đây là tài liệu SỐNG — mỗi PR/quyết định cập nhật vào đây.

**Ký hiệu:** ✅ xong (đã verify) · 🟡 đang làm/một phần · ⬜ chưa làm · ⛔ chặn (chờ blocker) · 🔮 tương lai (chưa cần cho v1) · ⚠ cần xác nhận
**Chủ:** UI = Claude (thiết kế) + Tùng (frontend) · BE-OriLife = Thư/OriLife · PhoenixKey = Long/PhoenixKey · Wakeme = Wakeme agent

---

## 1. Vỏ điều hướng & UX (SG9)
| # | Hạng mục | TT | Chủ | Ghi chú |
|---|---|---|---|---|
| 1.1 | Frame nav song ngữ (EN chuẩn trên · quốc gia dưới) | ✅ | Claude | `navLabels.ts`+`NavItemFrame.tsx`; tsc/jest thật xanh |
| 1.2 | Tab Me/Tôi + avatar (initials; ảnh khi có hồ sơ) | ✅/🟡 | Tùng | avatar initials xong; `avatarUri` chờ ảnh hồ sơ |
| 1.3 | Persona-adaptive tab (neo+slot) — KHUNG | ✅ | Tùng | code+test xong |
| 1.4 | Persona-adaptive — HÀNH VI thật | ⬜ | Tùng | ⚠ hiện NO-OP: `usage` chưa nối nguồn Work → thanh tĩnh; ràng buộc 1-đổi/phiên là seam ngủ |
| 1.5 | Trace = nút quét nhanh (full-bleed, deep-link, back-safe) | ✅ | Tùng | whitelist đã thu về `*Detail`; ⬜ test camera máy thật |
| 1.6 | Cổng thống nhất (tái nút xoè SG4, 2 tầng) | ✅ | Tùng | ⬜ test cử chỉ máy thật |
| 1.7 | SubHome thu gọn (3 tab + ⌄) + `SubHomeFrame` | 🟡 | Tùng | khung xong; ⬜ WIRE vào màn app con (Chat/Farm) |
| 1.8 | Vòng dịch vụ QUAY được (rotary ring) + tầng lồng | ⬜ | Tùng | thiết kế SG9 §5B; dựng khi cổng ổn trên máy |
| 1.9 | Bật `react-native-screens` (enableScreens/freeze) | ⬜ | Tùng | SG9 §7; cần test máy yếu |
| 1.10 | Màu tươi + thích ứng ánh sáng (day/dim/night, bảo vệ mắt) | ⬜ | Tùng | SG9 §8; token luminance chưa có |

## 2. Home & Onboarding
| # | Hạng mục | TT | Chủ | Ghi chú |
|---|---|---|---|---|
| 2.1 | Bỏ số liệu bịa trên Home (workMatches…) | ✅ | Tùng | nối ví/ProofChat số thật |
| 2.2 | **Home tối giản** — gỡ Quick Actions (Tree/Fruit/Animal/Farm) + lưới Dịch vụ dày + carousel | 🟡 | Tùng | ƯU TIÊN #1; **PR kế — KHÔNG hoãn** (cổng xoè đã gánh hành động; chỉ thêm "Quả" vào cổng). Xem SG9 §6 |
| 2.3 | Quick-Access per-service (chuẩn + thích ứng + ghim) | ⬜ | Tùng | nơi TIẾP NHẬN các quick-action dời khỏi Home |
| 2.4 | Onboarding hỏi "nhu cầu" → set persona mặc định | ⬜ | Tùng | SG9 §2.2; hiện thiếu màn Needs |

## 3. Camera / Vision / Capture (kiến trúc)
| # | Hạng mục | TT | Chủ | Ghi chú |
|---|---|---|---|---|
| 3.1 | Lens 0.5x + flash cho tree re-ID (PR #46) | 🟡 | Thư | code sạch; CI đỏ do **quota artifact org** (không phải lỗi code); ⬜ verify FOV re-ID + test máy |
| 3.2 | Tách **Camera Device Core** (ống kính chung) khỏi namespace app | 🔮 | anh + platform | quyết định hệ sinh thái; iOS `Core/Camera` đã tách sẵn nửa đường |
| 3.3 | OriLife Mobile SDK (client re-ID) tách khỏi SuperApp | 🔮 | Thư/OriLife | để app ngoài (Zalo/VNeID) dùng được qua SDK, không chỉ api |
| 3.4 | Detector-plugin: OriLife(YOLO)/Eye/Knowme cắm chung Camera Core | 🔮 | platform | xem tài liệu ranh giới camera-vision |

## 4. Module (tích hợp UI ↔ dịch vụ)
| # | Module | TT | Chủ | Ghi chú |
|---|---|---|---|---|
| 4.1 | Trace/Farm (định danh nông sản, quản lý vườn) | ✅ | Thư | api.orilife.io; live |
| 4.2 | ProofChat (chat text) | ✅ | — | `api.proofchat.me`; live |
| 4.3 | ProofChat video call | 🔮 | — | CHƯA có (manifest chỉ text); thuộc họ Realtime Media |
| 4.4 | Work (Việc làm) | 🟡 | AladinWork | server-authoritative; ⚠ escrow/dòng tiền module SG5 sau |
| 4.5 | Join (Kết đèn / LampNet) | 🟡 | — | server-authoritative; daemon LampNet |

## 5. Ví & Danh tính (PhoenixKey build — tích hợp vào giao diện)
| # | Hạng mục | TT | Chủ | Ghi chú |
|---|---|---|---|---|
| 5.1 | OrgDID (danh tính tổ chức) | ✅ | PhoenixKey | live |
| 5.2 | Mint LAMP vào kho Distribution (bản B) | ⛔ | PhoenixKey | NO-GO ship, chờ 4 blocker (xem plan mint) |
| 5.3 | Ví Standard (CARP) | 🟡 | PhoenixKey | ⚠ chờ Database#41 |
| 5.4 | Ví trong UI: **Phoenix · Standard** (tab con Send/Receive/Staking/Voting) | ⬜ | PhoenixKey + Tùng | dùng vòng-quay §5B; PhoenixKey đang build |
| 5.5 | Tab **SPO** (cntools: Wallet/Pool/Fund/Voting + …) | ⬜ | PhoenixKey + Tùng | vỏ = vòng-quay §5B.4; nội dung = PhoenixKey |
| 5.6 | Đăng nhập sinh trắc (biometric) | ✅ | — | react-native-biometrics |

## 6. Token & Kinh tế (bề mặt UI)
| # | Hạng mục | TT | Ghi chú |
|---|---|---|---|
| 6.1 | Hiển thị MAGIC · LAMP · CARP (bỏ ADA khỏi bề mặt chính) | ✅ | ADA ở "Tài sản khác" |
| 6.2 | Wakeme (vay LAMP/vault/mở khoá đêm) | ⬜/⚠ | **Wakeme agent** sở hữu — KHÔNG thuộc phạm vi UI này |
| 6.3 | Luồng 1001 LAMP → sinh MAGIC mỗi epoch (Knowme) | ⚠ | cần đối chiếu spec PhoenixKey Knowme |

## 7. Chất lượng / CI / Kiểm thử
| # | Hạng mục | TT | Ghi chú |
|---|---|---|---|
| 7.1 | **CI có cổng `tsc --noEmit` THẬT** | ⬜ | ⚠ QUAN TRỌNG: hiện CI chỉ build APK, KHÔNG chặn lỗi TS. `npx tsc` trong worktree thiếu node_modules → rơi vào package đùa "0 lỗi" GIẢ. Thêm job cài dep + tsc thật |
| 7.2 | CI có cổng `jest` (unit test) | ⬜ | test nav 37/37 xanh nhưng CI chưa chạy |
| 7.3 | Lint/format gate | ⚠ | cần xác nhận |
| 7.4 | Test camera trên máy THẬT (lens/scan/gesture) | ⬜ | 1.5, 1.6, 3.1 đều chờ |
| 7.5 | Test máy yếu (low-end tier, adaptive) | ⬜ | gắn với 1.9 |

## 8. Build & Phát hành
| # | Hạng mục | TT | Ghi chú |
|---|---|---|---|
| 8.1 | Build debug APK (Android) | ✅/⚠ | biên dịch được; ⚠ **quota artifact org hết** → upload fail (billing, không phải code) |
| 8.2 | iOS TestFlight (AladinApp keys/cert) | 🟡 | quy trình có (ASC API keys); cần chạy lại bản mới |
| 8.3 | Ký release Android (keystore) | ⚠ | cần xác nhận cấu hình |
| 8.4 | Instance config đúng cho bản Aladin (module/tab/brand) | ✅ | `instance.config.ts` |
| 8.5 | Gỡ ngrok/dev endpoint khỏi bản production | ⬜ | ⚠ `aladinChat.ts`/`remoteLogger.ts` còn URL ngrok dev |

## 9. Bảo mật & Riêng tư
| # | Hạng mục | TT | Ghi chú |
|---|---|---|---|
| 9.1 | Không hardcode secret/PAT trong repo | ✅ | đã gỡ PAT DucTiger khỏi remote Pinmez; secret ở `/Agents/.env` |
| 9.2 | `.gitignore` chặn `node_modules`/`.env`/`*.key` | ✅ | có |
| 9.3 | Whitelist deep-link (traceScan) hẹp, chống điều hướng bừa | ✅ | thu về `*Detail` |
| 9.4 | Seed/khoá ở Keystore native (không merge, INV-3) | ✅ | theo manifest |

## 10. Quyết định kiến trúc còn mở (anh + chủ platform)
- [ ] Camera Device Core đặt repo nào, ai bảo trì (không thuộc 1 platform)?
- [ ] OriLife Mobile SDK: tách client re-ID ra khỏi SuperApp?
- [ ] Realtime Media Core (ProofChat call, LamLap): build hay dùng nền có sẵn (LiveKit/mediasoup)?
- [ ] VeData vs PhoenixKey: đích dữ liệu Capture (tài sản ↔ người) — chốt ranh giới.

## 11. PR đang mở (theo dõi)

> Đo lại 2026-08-30. Ba PR ghi ở bảng cũ (#44, #45, #46) **đã gộp hết** — bảng đó đứng
> yên trong lúc kho chạy tiếp, nên đọc nó là đọc trạng thái của tháng 7.

| PR | Nội dung | Chờ |
|---|---|---|
| [#219](https://github.com/MagicSuperApp/SuperApp/pull/219) | nhắc lập người khôi phục cho ai đã bật khoá | tạm dừng |
| [#229](https://github.com/MagicSuperApp/SuperApp/pull/229) | mỗi app một khoá ký riêng | chờ đổi tên secret ([#232](https://github.com/MagicSuperApp/SuperApp/issues/232)) |
| [#230](https://github.com/MagicSuperApp/SuperApp/pull/230) | mỗi app tự xưng tên và tự khai pháp nhân | soát |
| [#231](https://github.com/MagicSuperApp/SuperApp/pull/231) | app không khởi Firebase bằng cấu hình của app khác | soát |
| [#239](https://github.com/MagicSuperApp/SuperApp/pull/239) | token phiên ProofChat mang danh người đang dùng máy | soát |

---
### Định nghĩa "sẵn sàng Production v1" (Definition of Done tối thiểu)
1. Home tối giản đạt (2.2) + Quick-Access per-service (2.3).
2. Cổng + tab test xong trên máy thật (7.4), bật `react-native-screens` (1.9).
3. CI có cổng tsc + jest thật (7.1, 7.2).
4. Gỡ hết dev endpoint (8.5).
5. Ví/danh tính lõi (5.3 Standard) + mint (5.2) thông hoặc tách rõ khỏi luồng v1.
6. Ký + phát hành 2 nền (8.2, 8.3).
