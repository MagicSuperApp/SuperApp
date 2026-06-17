# Video Tutorial Spec — Aladin OriLife cho Nông Dân

> **Owner:** Tùng (Motion + UI)
> **Voice:** Gemini 3.1 TTS (consistent, professional, miễn phí)
> **Reviewer:** Lành (PM OriLife) + Lợi (cross-check content)
> **Defer:** Tùng làm dần khi rảnh (KHÔNG block build 51/52)
> **Tool stack:** Công cụ thiết kế chuyên dụng (Figma + After Effects / Rive / Lottie / Synthesia)

## Audience

Nông dân sầu riêng Đắk Lắk:
- Tuổi 35-60, đa số U50
- Tiếng Việt giọng miền Trung/Nam
- Không quen công nghệ
- Mắt có thể yếu — cần text lớn, contrast cao
- Xem video trên điện thoại Android/iPhone (đa số 5.5-6.5 inch)

## 3 Video cần làm (priority order)

### 1. "Chụp ảnh 3D cây sầu riêng" — 60-90 giây

**Mục tiêu:** Nông dân biết cách đi vòng quanh cây + giữ máy đúng để app dựng mesh 3D.

**Kịch bản:**

| Cảnh | Thời lượng | Nội dung |
|---|---|---|
| Mở đầu | 5s | Logo Aladin + "Cách chụp ảnh cây sầu riêng" + nhạc nền nhẹ |
| Cảnh 1: Vào màn hình | 8s | Demo tap nút "Chụp 3D" từ chi tiết cây + voiceover "Mở app, vào cây, bấm 'Chụp 3D'" |
| Cảnh 2: Đứng đúng | 12s | Hình minh họa farmer đứng cách cây 1.5-2m, máy hướng vào thân cây + voiceover "Đứng cách cây 1 cánh tay, hướng máy vào thân" |
| Cảnh 3: Đi vòng | 20s | Animation top-down: farmer đi 1 vòng tròn quanh cây + 8 mũi tên hướng. Voiceover "Đi 1 vòng quanh cây, vừa đi vừa giữ máy. Đi chậm, đừng vội." |
| Cảnh 4: Tiến trình | 10s | UI screen 24-slot ✅/❌ + voiceover "Màn hình hiển thị các góc đã chụp. Tích xanh là đủ, dấu X là cần chụp thêm." |
| Cảnh 5: Hoàn thành | 8s | Tap "Hoàn thành" + spinner upload + voiceover "Bấm Hoàn thành. Đợi 1-2 phút app sẽ dựng mô hình cây của bạn." |
| Kết thúc | 7s | "Mọi cây bạn chụp đều góp phần xây vườn của bạn trên Aladin" + logo |

**Visual style:** 
- Flat 2D illustration (KHÔNG photoreal — quá tốn effort)
- Màu sắc Aladin brand: xanh lá đậm + accent vàng/nâu sầu riêng
- Text overlay tiếng Việt 24-36pt, bold
- Nông dân character đội nón lá, áo bà ba (recognizable Vietnamese rural)

### 2. "Vẽ ranh giới vườn" — 45-60 giây

**Mục tiêu:** Nông dân biết cách đi 1 vòng quanh ruộng để app tự ghi waypoint GPS.

**Kịch bản tương tự** với:
- Đi đúng đường biên ruộng (không cắt qua)
- Tránh ngày trời u ám, tán cây dày che GPS
- Đứng chỗ thoáng đợi GPS ổn
- Đi tốc độ tự nhiên, không cần nhanh
- Min 4 điểm, recommended 8-12 điểm cho polygon đẹp

### 3. "Thêm quả + Đánh dấu thu hoạch" — 30-45 giây

**Mục tiêu:** Phân biệt rõ "Thêm quả" (chụp 1 quả) vs "Chụp 3D cây" (15 ảnh quanh cây).

**Kịch bản:** demo flow add fruit + change status sang "Gần thu hoạch" / "Đã thu hoạch".

## Production Pipeline

### Step 1: Storyboard (Tùng, 1-2h/video)
- Vẽ scene-by-scene rough trên Figma
- Review với Lành + tester nông dân Giang/Cường để xác nhận flow đúng

### Step 2: Asset creation (Tùng, 4-6h/video)
- Vector illustrations (farmer, cây sầu riêng, máy ảnh, GPS pin)
- Re-usable component library: app screens mockup, hand pointers, UI elements
- Lưu tại `assets/tutorial/` trong repo orilife-mobile-app

### Step 3: Animation (Tùng, 4-8h/video)
- **Recommend:** Rive (free, exportable to RN runtime + web)
- Alternative: After Effects → Lottie JSON
- Alternative: Synthesia AI avatar (nhanh hơn nhưng cứng)

### Step 4: Voiceover via Gemini 3.1 TTS (Tùng, 30 phút)
- Script Vietnamese chuẩn (không dialect specific)
- Voice: Gemini 3.1 Vietnamese female (warm, friendly, clear)
- Output: 44.1 kHz MP3 stereo
- Re-generate easy khi update script (vs human VO require re-record)

### Step 5: Edit + render (Tùng, 2-3h/video)
- DaVinci Resolve (free) hoặc CapCut Pro
- Export 1080p H.264 MP4, target ≤ 10MB/video (cellular friendly)
- Subtitles tiếng Việt burned-in (cho nông dân tắt loa)

### Step 6: Embed in app (Lợi backend + Tùng frontend, 2h)
- Host trên Tiger server `/static/tutorial/` hoặc Cloudflare R2 CDN
- App fetch URL via config endpoint
- Cache local sau lần đầu xem (tiết kiệm data)

## Acceptance Criteria

- [ ] 3 video shipped trước launch Build 53 (production)
- [ ] Mỗi video ≤ 90 giây
- [ ] Subtitle tiếng Việt full
- [ ] Tested với 2+ nông dân Giang/Cường + 1 ngoài team → hiểu được flow không cần đọc text
- [ ] App size không tăng (video qua CDN, không bundle)
- [ ] Multi-language scaffolding sẵn cho Khmer/Lao/Thai future (subtitle SRT files)

## Update Workflow

Khi UI thay đổi (vd Capture3D redesign Build 52 → 24-slot mới):
- Tùng update screen recording trong asset library
- Re-render affected videos (1-2h/video do template reuse)
- Voice script regenerate qua Gemini 3.1 nếu wording thay đổi

## Notes

- **KHÔNG dùng human VO** — Gemini 3.1 đủ tốt, nhất quán, free, dễ update
- **KHÔNG quay real footage Giang/Cường** — privacy + chất lượng không kiểm soát + khó re-shoot khi UI thay đổi
- **KHÔNG cần animation siêu phức tạp** — flat illustration đủ, nông dân U50 không expect Pixar quality
- **TỐI ƯU cho cellular data outdoor Đắk Lắk** — 4G yếu, video phải nhẹ
