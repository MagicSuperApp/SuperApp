# SPEC-TigerAgent-Full — TigerAgent: AI Orchestrator Trung Tâm OriLife

**Phiên bản:** 1.0  
**Ngày:** 2026-06-10  
**Tác giả:** OriLife Core Team  
**Trạng thái:** DRAFT — chờ anh Aladin duyệt kiến trúc trước khi phân task

---

## 1. Mục tiêu và vị trí trong hệ thống

TigerAgent là AI orchestrator trung tâm của OriLife. Nông dân giao tiếp tự nhiên bằng tiếng Việt — TigerAgent phân tích ý định, điều phối các sub-agent chuyên biệt, tổng hợp kết quả, và chủ động cảnh báo mà không cần nông dân hỏi.

**Nguyên tắc thiết kế:**
- Nông dân KHÔNG biết có nhiều agent phía sau — họ chỉ thấy một trợ lý duy nhất.
- TigerAgent che phức tạp kỹ thuật, trả lời bằng câu ngắn, dễ hiểu.
- Không bao giờ trả về điểm số kỹ thuật (score/similarity) ra UI — giấu nội tạng.
- Chạy được trên băng thông kém: ưu tiên trả lời nhanh, defer công việc nặng.

---

## 2. Phase 1 — Đã có: OCR nhãn thuốc → PHI (trạng thái hiện tại)

### 2.1. Những gì đã build

| Thành phần | File | Trạng thái |
|---|---|---|
| HTTP router nhận ảnh/text | `orilife-core/MassTreeIdentify/core/care_router.py` | Hoạt động |
| Logic kho tri thức + PHI | `orilife-core/MassTreeIdentify/core/care.py` | Hoạt động |
| Nạp dữ liệu thú y | `orilife-core/MassTreeIdentify/core/care_vet_loader.py` | Hoạt động |
| Nạp dữ liệu BVTV | `orilife-core/MassTreeIdentify/core/care_bvtv_loader.py` | Hoạt động |
| OCR pluggable (pytesseract) | `care_router.py` → `_ocr_text()` | Pluggable, thiếu lib → bỏ qua êm |
| Fee engine (TypeScript) | `orilife-fee/src/feeEngine.ts` | Build xong, chưa wire vào flow |

**Luồng hiện tại:**
```
Nông dân chụp ảnh bao thuốc
    → POST /api/care/match (ảnh + OCR → tên sản phẩm)
    → Trả: trade_name, active_ingredients, withdrawal_period_days
    → POST /api/care/log (ghi sự kiện + tính PHI deadline)
    → GET /api/care/withdrawal (kiểm tra còn cách ly không)
```

**Care event được lưu trong `CareStore` với các trường:**
- `care_event_id`, `owner`, `target_type` (`tree`/`animal`/`farm`), `target_id`
- `product_id`, `product_snapshot`, `applied_at`, `dose`, `withdrawal_until`
- `label_photo` (ảnh bao bì làm bằng chứng), `recognition_method`

### 2.2. Gap hiện tại (chưa làm)

| Gap | Mô tả | Ưu tiên |
|---|---|---|
| GAP-1 | Chưa gửi push notification khi PHI sắp hết (còn N ngày) | P0 — an toàn thực phẩm |
| GAP-2 | Fee engine chưa được gọi sau mỗi `care/log` event | P1 |
| GAP-3 | Không có giao diện chat — nông dân dùng form cứng | P1 |
| GAP-4 | `attribute_profiler.py` chưa tồn tại (context đề cập nhưng chưa build) | P1 |
| GAP-5 | `/api/care/match` không thử vision LLM khi OCR trả rỗng | P2 |

---

## 3. Phase 2 — Tư vấn nông nghiệp qua chat (xây trong tháng tới)

### 3.1. Kiến trúc kênh đầu vào

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT CHANNELS                           │
│                                                                 │
│  Chat text (tiếng Việt)    Ảnh (multimodal)    Sự kiện tự động  │
│         │                       │                    │          │
│         └───────────────────────┴────────────────────┘          │
│                                 │                               │
│                        TigerAgent Intent Router                 │
│                    (Claude Haiku — fast classify)               │
└─────────────────────────────────────────────────────────────────┘
```

**Intent categories:**
- `ANIMAL_HEALTH` — triệu chứng/bệnh vật nuôi
- `PLANT_HEALTH` — bệnh cây, sâu hại
- `TREATMENT_LOG` — ghi nhận thuốc/vaccine vừa dùng
- `POPULATION_QUERY` — hỏi về đàn/số lượng
- `DRUG_LOOKUP` — tra cứu thuốc, PHI
- `HARVEST_QUERY` — hỏi thời điểm thu hoạch an toàn
- `GENERAL_QUERY` — câu hỏi tổng quát

### 3.2. Use cases đầy đủ

#### UC-1: Vật nuôi có dấu hiệu bệnh

**Input:** "Con bò này trông ốm" + ảnh con bò

**Luồng xử lý:**
```
TigerAgent nhận text + ảnh
    → Intent: ANIMAL_HEALTH
    → Gọi animal_identify(image, species="cattle")
        → Trả: animal_did, confidence_band (cao/trung/thấp — không trả số)
    → Nếu identify thành công: tra lịch sử care_events của animal_did
    → Gọi attribute_profile(image, species="cattle")
        → Trả: posture, body_condition_score_band, coat_condition
    → Gọi CareAgent.vet_advice(species="cattle", symptoms=["lethargy"], profile=...)
        → Trả: possible_conditions[], urgent_flags[], recommended_actions[]
    → TigerAgent tổng hợp: trả lời tự nhiên tiếng Việt
        → Nếu urgent: "Con bò có dấu hiệu [X] — cần gọi thú y ngay."
        → Nếu không urgent: "Có thể do [X/Y/Z]. Hỏi thêm: bò ăn được không?"
    → Ghi session context (Redis) để câu hỏi tiếp theo có ngữ cảnh
```

**Response mẫu:**
> "Con bò này có dáng đứng mệt mỏi, lông xơ xác. Có thể do 3 nguyên nhân: thiếu khoáng, ký sinh trùng nội tạng, hoặc bắt đầu nhiễm trùng. Bò có bỏ ăn không? Có chảy nước mũi không?"

#### UC-2: Ghi nhận điều trị

**Input:** "Tôi vừa cho gà uống Enrofloxacin 10% sáng nay"

**Luồng xử lý:**
```
TigerAgent nhận text
    → Intent: TREATMENT_LOG
    → Trích xuất: drug_name="Enrofloxacin 10%", target_type="animal", species="chicken"
    → Gọi CareAgent.match_product(text="Enrofloxacin 10%", scope="ga")
        → Trả: product candidates (trade_name, withdrawal_period_days, flags)
    → Nếu 1 kết quả rõ: hỏi xác nhận nhanh + target_id
    → Sau xác nhận: gọi POST /api/care/log
        → withdrawal_until được tính tự động
    → Gọi FeeAgent.quote(task="animal.identify") → fee_lamp
    → Trả lời + đặt reminder:
```

**Response mẫu:**
> "Đã ghi: Enrofloxacin 10%, 06:30 hôm nay. PHI gà thịt = 7 ngày — được giết mổ sau 2026-06-17. Sẽ nhắc anh 1 ngày trước. Phí ghi nhận: 0.008 LAMP (~0.0007 USD)."

#### UC-3: Bệnh cây

**Input:** "Cây này bị gì vậy" + ảnh lá vàng, đốm nâu

**Luồng xử lý:**
```
TigerAgent nhận text + ảnh
    → Intent: PLANT_HEALTH
    → Gọi tree_identify(image)
        → Trả: tree_did (nếu đã enroll), species_guess, confidence_band
    → Gọi CareAgent.plant_advice(image, species, symptoms_from_image=[...])
        → Vision LLM phân tích ảnh → possible_diseases[], severity
    → Gọi CareAgent.match_product(symptoms, scope=species)
        → Trả: recommended_products[] với withdrawal_period_days
    → Tổng hợp → trả lời
```

**Response mẫu:**
> "Lá có đốm nâu viền vàng — có thể là bệnh thán thư hoặc đốm lá do nấm Colletotrichum. Thuốc phù hợp: Carbendazim 50WP (phun 2-3 lần cách 7 ngày), hoặc Mancozeb 80WP. Cách ly trước thu hoạch sầu riêng: 14 ngày. Anh có thể chụp thêm ảnh mặt dưới lá không?"

#### UC-4: Truy vấn đàn

**Input:** "Đàn gà của tôi có bao nhiêu con?"

**Luồng xử lý:**
```
TigerAgent nhận text
    → Intent: POPULATION_QUERY
    → Lấy farmer_id từ Redis session
    → Gọi PopulationAgent.count(farm_id, species="chicken")
        → Trả: total_enrolled, last_scan_date, zones_breakdown
    → So sánh với lần đếm trước → phát hiện bất thường nếu có
    → Trả lời
```

**Response mẫu:**
> "Đàn gà: 342 con đã đăng ký, lần quét cuối 3 ngày trước. Zone A: 180 con, Zone B: 162 con. Lần cuối đàn giảm 8 con (2026-06-05) — anh đã ghi nhận chưa?"

### 3.3. Tool registry (Phase 2)

Tất cả tools là Python functions được đăng ký vào TigerAgent tool registry. Mỗi tool có schema rõ ràng để LLM gọi đúng tham số.

```python
TIGER_TOOLS = {
    "care_lookup": {
        "description": "Tra cứu thông tin sản phẩm thú y/BVTV và thời gian cách ly",
        "function": care_router.match_product,
        "params": {"species": str, "symptom": Optional[str], "product_text": Optional[str]},
        "returns": "List[ProductCandidate] — không có score",
    },
    "tree_identify": {
        "description": "Định danh cây từ ảnh (DINOv2 4-kênh)",
        "function": server.identify_tree,
        "params": {"image_bytes": bytes, "gps_lat": Optional[float], "gps_lon": Optional[float]},
        "returns": "TreeIDResult: did, species_guess, confidence_band",
    },
    "animal_identify": {
        "description": "Định danh cá thể động vật từ ảnh (BODY/FACE/MARK/BIO)",
        "function": animal_server_ext.identify_animal,
        "params": {"image_bytes": bytes, "species": str},
        "returns": "AnimalIDResult: did, confidence_band (không có điểm số)",
    },
    "attribute_profile": {
        "description": "Trích xuất thuộc tính quan sát được từ ảnh (thể trạng, màu lông, tư thế)",
        "function": attribute_profiler.profile,
        "params": {"image_bytes": bytes, "species": str},
        "returns": "AttributeProfile: posture, body_condition, coat_condition, estimated_age_band",
    },
    "population_count": {
        "description": "Báo cáo số lượng đàn theo farm/zone",
        "function": population_agent.count,
        "params": {"farm_id": str, "zone": Optional[str], "species": Optional[str]},
        "returns": "PopulationReport: total, by_zone, last_scan_date, delta_from_prev",
    },
    "treatment_log": {
        "description": "Ghi nhật ký điều trị và tính deadline cách ly",
        "function": care_router.log_treatment,
        "params": {"entity_id": str, "drug_text": str, "dose": str, "applied_at": str},
        "returns": "TreatmentResult: care_event_id, withdrawal_until, days_remaining",
    },
    "fee_quote": {
        "description": "Tính phí tác vụ bằng LAMP",
        "function": fee_bridge.quote,
        "params": {"task": str, "declared_value_usd": Optional[float]},
        "returns": "FeeQuote: fee_lamp, fee_usd_approx, bucket_breakdown",
    },
}
```

---

## 4. Phase 3 — Giám sát chủ động (proactive monitoring)

### 4.1. Kiến trúc scheduled jobs

Mỗi job chạy như một background task độc lập, không chặn luồng chat. Redis pub/sub dùng để push notification kết quả về mobile.

```
┌────────────────────────────────────────────────────────────────────┐
│                     SCHEDULER (cron daily)                         │
│                                                                     │
│  PHI Reminder  │  Population   │  Disease      │  Harvest          │
│  Job           │  Anomaly Job  │  Pattern Job  │  Window Job       │
│       │        │       │       │       │       │       │           │
│       └────────┴───────┴───────┴───────┘                           │
│                         │                                           │
│              Notification Dispatcher                                │
│           (Redis → FCM/APNS → Mobile app)                          │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2. Job specs

#### JOB-1: PHI Reminder

**Trigger:** Hàng ngày 06:00 (giờ nông dân) theo timezone farm

**Logic:**
```python
def phi_reminder_job(owner: str):
    events = care_store.upcoming_withdrawals(owner, lookahead_days=3)
    for ev in events:
        days_left = (ev.withdrawal_until - today).days
        if days_left in [7, 3, 1, 0]:
            msg = format_phi_reminder(ev, days_left)
            push_notification(owner, msg, urgency="high" if days_left <= 1 else "normal")
```

**Thông báo mẫu:**
- 7 ngày: "Con bò A001 (Enrofloxacin) còn 7 ngày cách ly. Được phép xuất bán sau 17/06."
- 1 ngày: "CẦN CHÚ Ý: Con bò A001 — hết cách ly NGÀY MAI (17/06). Kiểm tra trước khi xuất."
- 0 ngày: "Con bò A001 đã hết thời gian cách ly từ hôm nay. An toàn để giết mổ/xuất bán."

#### JOB-2: Population Anomaly

**Trigger:** Hàng ngày 07:00 sau khi nông dân hoàn thành quét sáng (hoặc 8h nếu không quét)

**Logic:**
```python
def population_anomaly_job(farm_id: str):
    today_count = population_agent.count_today(farm_id)
    yesterday_count = population_agent.count_yesterday(farm_id)
    for zone in today_count.zones:
        delta = today_count[zone] - yesterday_count[zone]
        pct_change = abs(delta) / max(yesterday_count[zone], 1)
        if pct_change > ANOMALY_THRESHOLD:   # mặc định 10%
            severity = "high" if pct_change > 0.20 else "medium"
            push_notification(farm_id.owner,
                f"Zone {zone}: {yesterday_count[zone]} → {today_count[zone]} "
                f"({delta:+d} con) — cần kiểm tra.",
                urgency=severity)
```

**Ngưỡng:** Giảm >10% trong 1 ngày → cảnh báo medium. Giảm >20% → cảnh báo cao.

#### JOB-3: Disease Pattern (Cảnh báo dịch)

**Trigger:** Hàng ngày 12:00 — batch analysis toàn vùng

**Logic:**
```python
def disease_pattern_job():
    # Gom symptoms từ care_events + chat logs trong 72h gần nhất
    recent_symptoms = symptom_aggregator.collect(hours=72)
    clusters = geo_cluster(recent_symptoms, radius_km=5)
    for cluster in clusters:
        if cluster.farm_count >= 3 and cluster.symptom_similarity > 0.7:
            alert = DiseaseAlert(
                center=cluster.centroid,
                radius_km=cluster.radius,
                symptom_pattern=cluster.dominant_symptom,
                farm_count=cluster.farm_count,
                species=cluster.species,
            )
            # Gửi cho TẤT CẢ farm trong bán kính 5km
            for farm in farms_in_radius(alert.center, km=5):
                push_notification(farm.owner, format_disease_alert(alert), urgency="high")
```

**Thông báo mẫu:**
> "CẢNH BÁO: 4 trang trại trong bán kính 5km báo gà có triệu chứng thở khò khè + bỏ ăn trong 3 ngày qua. Có thể là dịch Newcastle hoặc IB. Khuyến nghị: cách ly đàn, liên hệ thú y ngay."

#### JOB-4: Harvest Window

**Trigger:** Hàng ngày 07:00 — kiểm tra cây đến mùa

**Logic:**
```python
def harvest_window_job(farm_id: str):
    trees = tree_store.trees_approaching_harvest(farm_id, lookahead_days=14)
    for tree in trees:
        days_to_harvest = (tree.expected_harvest_date - today).days
        withdrawal_clear = care_store.is_safe(target_type="tree", target_id=tree.did)
        if days_to_harvest in [14, 7, 3] and withdrawal_clear:
            push_notification(farm_id.owner,
                f"Cây {tree.label} ({tree.species}) đến mùa thu hoạch sau {days_to_harvest} ngày. "
                f"Tình trạng cách ly: an toàn.",
                urgency="normal")
        elif days_to_harvest <= 3 and not withdrawal_clear:
            push_notification(farm_id.owner,
                f"CẢNH BÁO: Cây {tree.label} đến mùa thu hoạch sau {days_to_harvest} ngày "
                f"nhưng còn thời gian cách ly. Kiểm tra lịch sử phun thuốc.",
                urgency="high")
```

---

## 5. Phase 4 — Kinh tế + Phần thưởng LAMP

### 5.1. Fee flow

Mỗi ReID event (tree.scan, animal.identify, tree.register, animal.enroll) đều kích hoạt fee flow sau khi hoàn thành:

```
ReID event thành công
    → FeeAgent.quote(task, declared_value_usd)
        → Gọi orilife-fee/src/feeEngine.ts qua Node.js bridge
        → Trả: fee_lamp, fee_oil (bigint), buckets[PROTOCOL, LAMPNET_REWARD, ANCHOR]
    → Ghi pending_fee vào Redis (farmer_id → list[FeeQuote])
    → Trả cho nông dân: "Phí tác vụ này: X LAMP (~Y USD)"
    → Nếu pending_fees đủ ≥10 sự kiện → kích hoạt batch collect
```

**Giải thích phí bằng tiếng Việt (mẫu):**

| Tác vụ | Fee mẫu | Giải thích |
|---|---|---|
| Quét định danh cây | 0.004 LAMP (~0.0003 USD) | Phí nhận diện: lưu trữ LampNet + tính toán |
| Đăng ký con bò | 0.05 LAMP (~0.004 USD) | Phí đăng ký + neo Cardano (batch 24h) |
| Quét định danh bò | 0.008 LAMP (~0.0006 USD) | Phí nhận diện: so khớp gallery |
| Đăng ký cây + neo | 0.05 LAMP (~0.004 USD) | Phí đăng ký + neo ngay lập tức |

**Thông báo phí mẫu:**
> "Nhận diện con bò A001: 0.008 LAMP (~0.0006 USD). Rẻ hơn 62 lần so với đeo thẻ tai RFID truyền thống. Đã ghi vào tài khoản LAMP của anh — thanh toán batch mỗi 10 lượt."

### 5.2. Batch collect

```
BatchCollectJob (trigger: pending_fees >= 10 OR pending_fees.oldest > 24h):
    fees = redis.get_pending_fees(farmer_id)
    total_oil = sum(f.fee_oil for f in fees)
    collect_items = group_by_bucket(fees)
    tx = fee_bridge.build_collect_tx(collect_items)
    # Gửi tx lên Cardano qua anchor worker (KHÔNG ký tại đây)
    anchor_worker.submit(tx)
    redis.clear_pending_fees(farmer_id)
```

**Bất biến on-chain:** `Σ bucket.oil == total_fee_oil` (đảm bảo bởi `feeEngine.ts` — xem `C-COL-4`).

### 5.3. LAMP reward cho nông dân đóng góp dữ liệu chất lượng

Nông dân kiếm LAMP khi đóng góp dữ liệu có giá trị vào KB chung:

| Hành động | Reward | Điều kiện |
|---|---|---|
| Enroll cây/vật nuôi mới (ảnh chất lượng tốt) | +0.01 LAMP | ≥3 ảnh đa góc, GPS chính xác |
| Xác nhận triệu chứng bệnh (có ảnh + kết quả điều trị) | +0.005 LAMP | Có care_event đi kèm |
| Báo cáo dịch bệnh sớm (được xác minh) | +0.02 LAMP | Cluster job xác nhận |
| Dữ liệu field test chất lượng cao | +0.05 LAMP | Audit đội kỹ thuật duyệt |

**Thông báo reward mẫu:**
> "Cảm ơn anh đã đăng ký 5 cây sầu riêng mới hôm nay. Phần thưởng đóng góp: +0.05 LAMP. Tổng LAMP hiện có: 2.34 LAMP."

---

## 6. Kiến trúc kỹ thuật TigerAgent

### 6.1. Internals

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TigerAgent Core                             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Intent Router (Claude Haiku — latency < 200ms)              │   │
│  │  Input: text + optional image                                 │   │
│  │  Output: intent_type, extracted_entities, model_tier         │   │
│  └─────────────────────────┬────────────────────────────────────┘   │
│                             │                                        │
│  ┌─────────────────────────▼────────────────────────────────────┐   │
│  │  Orchestration Layer (Claude Sonnet — khi cần reasoning)      │   │
│  │  - Tool selection + sequencing                                │   │
│  │  - Multi-turn context management                              │   │
│  │  - Response synthesis (tiếng Việt thân thiện)                 │   │
│  └─────────────────────────┬────────────────────────────────────┘   │
│                             │                                        │
│  ┌──────────────────────────┴──────────────────────────────────┐    │
│  │              Tool Executor                                    │    │
│  │  Parallel tool calls khi tools độc lập nhau                  │    │
│  │  Timeout per tool: 10s (Haiku) / 30s (Sonnet)                │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌───────────────────┐   ┌───────────────────┐                      │
│  │  Session Store    │   │  Notification      │                      │
│  │  (Redis per       │   │  Queue (Redis      │                      │
│  │  farmer)          │   │  pub/sub → FCM)    │                      │
│  └───────────────────┘   └───────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2. Model selection policy

| Tình huống | Model | Lý do |
|---|---|---|
| Phân loại intent đơn giản | Claude Haiku | Latency < 200ms, tiết kiệm |
| Trả lời câu hỏi từ KB có sẵn | Claude Haiku | Đủ chất lượng, nhanh |
| Phân tích ảnh + multimodal | Claude Sonnet | Cần vision capability |
| Tư vấn phức tạp (nhiều triệu chứng, cross-reference) | Claude Sonnet | Cần reasoning depth |
| Tổng hợp báo cáo dịch bệnh | Claude Sonnet | Cần accuracy cao |
| Scheduled jobs (không real-time) | Claude Haiku | Batch, không cần nhanh |

**Quy tắc model tier:**
```python
def select_model(intent: str, has_image: bool, complexity: str) -> str:
    if has_image:
        return MODEL_SONNET   # vision luôn cần Sonnet
    if complexity == "high":
        return MODEL_SONNET
    if intent in ("GENERAL_QUERY", "DRUG_LOOKUP", "POPULATION_QUERY"):
        return MODEL_HAIKU
    return MODEL_HAIKU  # default fast path
```

### 6.3. Redis session state schema

```python
SESSION_KEY = "tiger:session:{farmer_id}"

# TTL: 30 phút không hoạt động → expire
SESSION_SCHEMA = {
    "farmer_id": str,
    "current_topic": str,          # "animal_health", "plant_care", etc.
    "active_entity": {             # entity đang nói đến
        "type": str,               # "animal" | "tree" | "farm"
        "did": str,
        "species": str,
        "label": str,
    },
    "conversation_history": [      # 10 turn gần nhất (tiết kiệm context)
        {"role": str, "content": str, "timestamp": str}
    ],
    "pending_confirmations": [],   # action chờ user xác nhận (treatment log, etc.)
    "pending_fees": [],            # fee quotes chưa batch
    "language": "vi",              # hiện tại chỉ tiếng Việt
}
```

### 6.4. Multimodal pipeline

```
Nông dân gửi ảnh
    → Pre-processing: resize max 1024px, giữ EXIF GPS nếu có
    → Parallel dispatch:
        ├── Vision LLM (Sonnet): phân tích triệu chứng tổng quát
        ├── ReID pipeline: tree_identify hoặc animal_identify (nếu biết loài)
        └── EXIF extractor: lấy GPS, timestamp
    → Merge results → TigerAgent synthesis
    → Trả lời có ngữ cảnh
```

**Constraint:** Ảnh KHÔNG được lưu trữ trên server TigerAgent sau khi xử lý. Chỉ ReID pipeline lưu embedding (đã là nguyên tắc hiện tại của animal_server_ext).

---

## 7. Điều phối các sub-agent

### 7.1. Sơ đồ tổng thể

```
                         ┌─────────────────┐
                         │   TigerAgent    │
                         │  (Orchestrator) │
                         └────────┬────────┘
              ┌──────────┬────────┴───────┬──────────┬──────────┐
              │          │                │          │          │
     ┌────────▼──┐  ┌────▼────┐  ┌───────▼──┐ ┌────▼───┐ ┌────▼────┐
     │ ReIDAgent │  │CareAgent│  │Population│ │CertAgent│ │FeeAgent │
     │           │  │         │  │Agent     │ │         │ │         │
     │ tree_id   │  │vet_adv  │  │count()   │ │did_issue│ │quote()  │
     │ animal_id │  │phi_calc │  │anomaly() │ │anchor() │ │batch()  │
     │ attr_prof │  │match_   │  │geo_heat  │ │verify() │ │reward() │
     │           │  │product  │  │map()     │ │         │ │         │
     └───────────┘  └─────────┘  └──────────┘ └─────────┘ └─────────┘
           │              │             │            │           │
     ┌─────▼──────────────▼─────────────▼────────────▼───────────▼────┐
     │               Shared Services Layer                              │
     │  Redis (session)  │  CareStore  │  AnimalStore  │  TreeStore    │
     └──────────────────────────────────────────────────────────────────┘
```

### 7.2. Giao thức giữa TigerAgent và sub-agents

**Giao tiếp đồng bộ (trong process, Python function call):**

```python
# TigerAgent gọi sub-agent trực tiếp qua function registry
result = await tool_executor.call(
    tool_name="animal_identify",
    params={"image_bytes": img, "species": "cattle"},
    timeout=10.0,
    fallback={"confidence_band": "low", "did": None},
)
```

**Giao tiếp bất đồng bộ (scheduled jobs, Redis queue):**

```python
# TigerAgent enqueue job
redis.rpush("tiger:job:phi_check", json.dumps({
    "job_type": "phi_reminder",
    "farmer_id": farmer_id,
    "scheduled_at": "2026-06-11T06:00:00+07:00",
}))

# Worker dequeue và xử lý
while True:
    job = redis.blpop("tiger:job:phi_check", timeout=30)
    await phi_reminder_job(job["farmer_id"])
```

### 7.3. Sub-agent specs

#### ReIDAgent

**Trách nhiệm:** Định danh cây và vật nuôi từ ảnh.

**Hiện tại dùng:**
- Tree: `server.py` DINOv2 4-kênh embedding + neighbor_graph
- Animal: `animal_server_ext.py` + `animal_reid.py` (BODY/FACE/MARK/BIO)

**Interface:**
```python
class ReIDAgent:
    def tree_identify(image_bytes: bytes, gps: Optional[GPS]) -> TreeIDResult
    def animal_identify(image_bytes: bytes, species: str) -> AnimalIDResult
    def attribute_profile(image_bytes: bytes, species: str) -> AttributeProfile
```

**Constraint:** KHÔNG trả similarity score ra ngoài. Chỉ trả `confidence_band` ∈ {`"cao"`, `"trung_binh"`, `"thap"`} và `did` (nếu match).

#### CareAgent

**Trách nhiệm:** Tư vấn thú y, tra cứu thuốc, tính PHI.

**Hiện tại dùng:** `care.py` (CareStore) + `care_router.py` + KB trong `care_kb/`

**KB hiện tại:**
- `vet_products.json`: sản phẩm thú y (gà/lợn/dê) từ Thông tư 18/2024
- `bvtv_products.json` (suy luận từ loader): thuốc BVTV từ Thông tư 75/2025
- Scope hỗ trợ: `sau_rieng`, `ca_phe`, `ga`, `lon`, `de`, `bo`, `ca`, `tom`

**Interface:**
```python
class CareAgent:
    def match_product(text: str, scope: Optional[str]) -> List[ProductCandidate]
    def vet_advice(species: str, symptoms: List[str]) -> VetAdvice
    def plant_advice(image: bytes, species: str) -> PlantAdvice
    def withdrawal_status(target_type: str, target_id: str, owner: str) -> WithdrawalStatus
    def log_treatment(owner: str, target_type: str, target_id: str,
                      product_id: str, dose: str, applied_at: str) -> CareEvent
```

#### PopulationAgent

**Trách nhiệm:** Đếm, theo dõi đàn, phát hiện bất thường.

**Chưa build.** Cần xây trong Phase 2.

**Interface:**
```python
class PopulationAgent:
    def count(farm_id: str, zone: Optional[str], species: Optional[str]) -> PopulationReport
    def anomaly_check(farm_id: str, lookback_days: int) -> List[AnomalyEvent]
    def geo_heatmap(region_id: str, species: str) -> HeatmapData
```

**Data source:** AnimalStore (enrolled animals per farm) + quét event logs + manual reports từ chat.

#### CertAgent

**Trách nhiệm:** Quản lý DID, neo on-chain Cardano.

**Hiện tại dùng:** `did_adapter.py`, `anchor.py`, `anchor_worker.py`, `anchor_net.py`

**Interface:**
```python
class CertAgent:
    def issue_did(entity_type: str, owner_did: str, metadata: dict) -> str
    def anchor(did: str, tier: AnchorTier) -> AnchorResult
    def verify_did(did: str) -> VerifyResult
    def get_cert_chain(did: str) -> List[AnchorRecord]
```

#### FeeAgent

**Trách nhiệm:** Tính phí, quản lý batch collect, phân phối reward.

**Hiện tại dùng:** `orilife-fee/src/feeEngine.ts` (TypeScript) — gọi qua Node.js bridge từ Python.

**Interface:**
```python
class FeeAgent:
    def quote(task: str, declared_value_usd: Optional[float]) -> FeeQuote
    def add_pending(farmer_id: str, quote: FeeQuote) -> None
    def should_batch(farmer_id: str) -> bool  # True nếu ≥10 pending hoặc oldest >24h
    def build_collect_tx(farmer_id: str) -> CollectTx
    def calc_reward(action_type: str, quality_score: float) -> Optional[RewardQuote]
    def format_fee_vi(quote: FeeQuote) -> str  # "0.008 LAMP (~0.0006 USD)"
```

---

## 8. API endpoints TigerAgent (Phase 2)

### POST /api/tiger/chat

Input:
```json
{
    "message": "Con bò này trông ốm",
    "images": ["<base64>"],
    "farmer_id": "did:phoenix:farmer:...",
    "session_id": "optional — tạo mới nếu không có"
}
```

Output:
```json
{
    "ok": true,
    "session_id": "tiger:sess:abc123",
    "reply": "Con bò có dáng đứng mệt mỏi...",
    "actions_taken": ["animal_identified", "care_history_checked"],
    "follow_up_questions": ["Bò có bỏ ăn không?"],
    "pending_confirmation": null
}
```

### POST /api/tiger/confirm

Xác nhận action đang pending (vd: xác nhận ghi treatment log):

```json
{
    "session_id": "tiger:sess:abc123",
    "confirm": true,
    "correction": null
}
```

### GET /api/tiger/feed

Lấy notifications chủ động (PHI reminder, cảnh báo dịch, harvest window):

```json
{
    "ok": true,
    "notifications": [
        {
            "id": "notif:phi:bov001:20260617",
            "type": "phi_reminder",
            "urgency": "high",
            "message": "Con bò A001 hết cách ly NGÀY MAI...",
            "created_at": "2026-06-10T06:00:00Z"
        }
    ]
}
```

---

## 9. Yêu cầu hạ tầng

| Thành phần | Yêu cầu tối thiểu | Ghi chú |
|---|---|---|
| Redis | 6.x, single node đủ cho dev | Production: Redis Cluster hoặc Valkey |
| Claude API key | Truy cập Haiku + Sonnet | Cần caching để giảm chi phí |
| Python | 3.11+ | Đã dùng trong field-reid |
| Node.js | 18+ | Chạy fee engine TypeScript |
| FCM/APNS | Firebase project OriLife | Push notification |
| GPU (optional) | CUDA 11+ cho DINOv2 | CPU chạy được nhưng chậm hơn 10× |

**Prompt caching:** Tất cả system prompts của TigerAgent (KB thú y + BVTV, tool descriptions, rules) phải được cache bằng Anthropic prompt caching. KB ~4000 tokens — tiết kiệm ~90% chi phí inference.

---

## 10. Bảo mật

| Nguy cơ | Giảm thiểu |
|---|---|
| Prompt injection qua chat | Sanitize user input trước khi đưa vào system prompt. Tool calls phải validate params riêng. |
| IDOR qua farmer_id | farmer_id LẤY DỪ JWT auth, KHÔNG nhận từ request body. |
| Tool abuse (gọi treatment_log sai owner) | Mọi tool write phải verify owner = jwt.owner. |
| Rate limit chat | 30 requests/phút/farmer (Redis sliding window). |
| Data leakage giữa farmers | Session Redis key include farmer_id — không thể cross-access. |
| PHI reminder sai ngày | applied_at validate ISO 8601 nghiêm (xem care_router.py pattern). |

---

## 11. Implementation priority + sprint estimate

### Backlog theo thứ tự ưu tiên

| # | Hạng mục | Sprint | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | **GAP-1: PHI push notification** — wire `care/log` → FCM khi withdrawal deadline < 7 ngày | Sprint 1 | 3 ngày | FCM config |
| 2 | **GAP-2: Fee wire** — sau mỗi ReID event gọi FeeAgent.quote() + trả thông báo LAMP | Sprint 1 | 2 ngày | fee engine đã build |
| 3 | **attribute_profiler.py** — build module trích xuất thể trạng từ ảnh (body_condition, posture) | Sprint 1 | 4 ngày | DINOv2 + vision LLM |
| 4 | **TigerAgent v0 — Intent Router** — Claude Haiku classify intent từ text | Sprint 2 | 3 ngày | Claude API |
| 5 | **TigerAgent v0 — Tool Executor** — gọi care_lookup + treatment_log từ chat | Sprint 2 | 4 ngày | Intent Router |
| 6 | **Redis session state** — multi-turn context per farmer | Sprint 2 | 2 ngày | Redis |
| 7 | **Multimodal input** — nhận ảnh trong chat → forward ReID + vision analysis | Sprint 3 | 3 ngày | Sonnet vision |
| 8 | **PopulationAgent v1** — count() từ enrolled animals, anomaly detection đơn giản | Sprint 3 | 4 ngày | AnimalStore |
| 9 | **Scheduled job: PHI Reminder** — cron daily 06:00 scan + push | Sprint 3 | 2 ngày | Redis queue + FCM |
| 10 | **Scheduled job: Population Anomaly** — daily delta check | Sprint 4 | 2 ngày | PopulationAgent |
| 11 | **Batch collect tx** — tự động khi ≥10 pending fees | Sprint 4 | 3 ngày | anchor_worker |
| 12 | **LAMP reward engine** — tính + ghi reward khi enroll chất lượng tốt | Sprint 4 | 3 ngày | FeeAgent |
| 13 | **Disease Pattern job** — geo cluster + alert | Sprint 5 | 5 ngày | geo library |
| 14 | **Harvest Window job** — cây đến mùa + kiểm tra PHI | Sprint 5 | 2 ngày | TreeStore |
| 15 | **Prompt caching** — cache KB system prompt, đo cache hit rate | Sprint 5 | 1 ngày | Claude API caching |

### Tổng estimate

| Sprint | Nội dung chính | Thời gian |
|---|---|---|
| Sprint 1 | PHI notification + fee wire + attribute_profiler | 1.5 tuần |
| Sprint 2 | TigerAgent core (intent + tools + session) | 2 tuần |
| Sprint 3 | Multimodal + PopulationAgent + PHI scheduled job | 2 tuần |
| Sprint 4 | Batch collect + LAMP reward + Population anomaly | 1.5 tuần |
| Sprint 5 | Disease pattern + Harvest window + Prompt caching | 1.5 tuần |
| **Tổng** | | **~8.5 tuần (2 tháng)** |

### Điểm quyết định cần anh chốt trước Sprint 2

1. **Model tier policy** — Haiku mặc định hay Sonnet mặc định cho chat? (ảnh hưởng chi phí vận hành ~10×)
2. **Anonymize symptoms cho Disease Pattern job** — nông dân có biết tên farm khác không? (privacy policy)
3. **Fee confirmation flow** — hiển thị fee trước khi log treatment (thêm 1 bước xác nhận) hay tự động charge?
4. **Population Agent data source** — chỉ từ enrolled animals (accurate nhưng phụ thuộc enrollment rate) hay cho phép manual count nhập tay?

---

*File này là spec kỹ thuật sống — cập nhật khi implementation diverge. Không cần PR để sửa spec, nhưng phải note lý do thay đổi.*
