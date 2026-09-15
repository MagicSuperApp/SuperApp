# AI Assistant Overlay — UI Specification

## 1. Tổng quan

Xây dựng một **AI Assistant Overlay** dạng layer phủ lên toàn bộ giao diện app hiện tại.

Overlay **không thay thế giao diện hiện tại**. Các màn hình, navigation, card, button và nội dung của app vẫn được giữ nguyên ở phía dưới. Khi Assistant được kích hoạt, một lớp phủ bán trong suốt xuất hiện phía trên UI hiện tại để tạo cảm giác người dùng đang bước vào "Assistant Mode".

Thiết kế cần mang cảm giác:

* Futuristic nhưng không quá sci-fi.
* Tối giản.
* Premium.
* Trong suốt / glassmorphism.
* Có cảm giác AI đang "sống" và phản hồi theo thời gian thực.
* Không làm mất hoàn toàn context của màn hình phía dưới.
* Màu chủ đạo: **xanh lá / emerald / green neon**.

---

# 2. Layer Architecture

```text
┌─────────────────────────────────┐
│                                 │
│       Existing App UI           │
│                                 │
│  Home / Garden / Animal / ...   │
│                                 │
├─────────────────────────────────┤
│                                 │
│       AI Assistant Overlay      │
│                                 │
│  Transparent dark glass layer   │
│  + Green animated edge waves    │
│  + Agent message stream         │
│  + Voice waveform               │
│  + Microphone button            │
│                                 │
└─────────────────────────────────┘
```

Assistant Overlay phải là **một layer độc lập** nằm trên toàn bộ app.

Không cần thay đổi cấu trúc UI hiện tại.

---

# 3. Background Overlay

Khi Assistant được kích hoạt:

* Giữ nguyên toàn bộ màn hình hiện tại phía dưới.
* Thêm một lớp phủ màu đen/xanh đen bán trong suốt.
* Background phía dưới vẫn có thể nhìn thấy.
* Nội dung phía dưới phải bị **dim + blur nhẹ**, tạo cảm giác đang nằm phía sau một lớp kính.

### Độ trong suốt

Overlay không được quá đục.

Mục tiêu visual:

```text
Existing UI
      ↓
Dark translucent layer
      ↓
Existing UI vẫn nhìn thấy mờ
      ↓
Animated green edge
```

Có thể sử dụng:

```text
background:
rgba(0, 10, 8, 0.55 ~ 0.70)
```

Tùy background bên dưới mà điều chỉnh opacity.

Không dùng màu đen 100%.

Không biến màn hình phía dưới thành một background hoàn toàn đen.

---

# 4. Glass Effect

Overlay cần có cảm giác như một lớp kính tối.

Áp dụng:

* `backdrop blur`
* dark translucent background
* subtle inner glow
* very subtle noise/grain nếu cần
* không sử dụng gradient lớn phủ toàn màn hình.

Mục tiêu:

> Người dùng vẫn nhận ra mình đang ở màn hình nào, nhưng sự chú ý được chuyển hoàn toàn sang Assistant.

---

# 5. Animated Green Edge

Đây là thành phần quan trọng nhất của thiết kế.

Xung quanh **4 cạnh màn hình** xuất hiện các vùng ánh sáng xanh lá.

Không phải một border xanh thông thường.

Không tạo:

```text
████████████████
```

mà phải tạo cảm giác như:

```text
      ~~~~~
   ~~~     ~~~
 ~~           ~~
│               │
│               │
 ~~           ~~
   ~~~     ~~~
      ~~~~~
```

Các vùng ánh sáng phải **gợn sóng / nhấp nhô liên tục**.

---

# 6. Wave Edge Animation

Mỗi cạnh màn hình được chia thành nhiều vùng wave độc lập.

Ví dụ:

```text
TOP
~~~~~~~~~~ ~~~~~~~~~ ~~~~~~~~~

LEFT                         RIGHT
~~~~                        ~~~~
 ~~~~                      ~~~~
  ~~~~                    ~~~~
   ~~~~                  ~~~~

BOTTOM
~~~~~~~~~~ ~~~~~~~~~ ~~~~~~~~~
```

Mỗi vùng có:

* amplitude khác nhau
* phase khác nhau
* tốc độ khác nhau
* độ sáng khác nhau

Không được để toàn bộ border chuyển động cùng một lúc.

Mục tiêu là tạo cảm giác:

> AI đang có một "năng lượng" chạy quanh màn hình.

---

# 7. Canvas Rendering

Toàn bộ hiệu ứng edge wave nên được render bằng **Canvas** thay vì sử dụng nhiều View/Image/Gradient component.

Canvas cần cho phép:

* custom path
* bezier curve
* glow
* blur
* opacity
* wave distortion
* animation theo frame
* audio reactive animation

Kiến trúc nên có một Canvas layer:

```text
AssistantOverlay
    │
    ├── Dark Glass Background
    │
    ├── Canvas
    │     ├── Top Waves
    │     ├── Bottom Waves
    │     ├── Left Waves
    │     └── Right Waves
    │
    ├── Agent Message Stream
    │
    └── Bottom Controls
```

---

# 8. Audio Reactive Animation

Khi Agent đang nói:

**Các wave xung quanh màn hình phải phản ứng theo âm thanh của Agent.**

Ví dụ:

### Agent im lặng

Wave:

```text
~~~~~~
```

Biên độ nhỏ.

### Agent đang nói bình thường

```text
~~~^^^^~~~~^^^~~~~
```

Wave dao động nhẹ.

### Agent nhấn mạnh / âm lượng lớn

```text
~~^^^^^^^~~~~^^^^^^~~
```

Amplitude tăng.

### Agent kết thúc câu

Amplitude giảm dần.

Animation cần có:

* smoothing
* interpolation
* damping

Không được giật theo từng frame audio.

Có thể lấy:

```text
Audio amplitude
      ↓
Smooth / Normalize
      ↓
Wave amplitude
      ↓
Canvas rendering
```

---

# 9. Agent Message Stream

Assistant **không sử dụng một chat window truyền thống**.

Không tạo:

* full-screen chat
* danh sách message dài
* keyboard mặc định
* nhiều button chức năng.

Chỉ hiển thị **message stream tối giản** ở khu vực trung tâm.

Ví dụ:

```text
          [Agent Avatar]

       "Đang mở vườn 10..."

             ~~~~~~~
```

Hoặc:

```text
       "Em đang xử lý yêu cầu..."

             ~~~~~~~
```

Message xuất hiện dạng floating glass bubble.

---

# 10. Message Design

Agent message:

* dark translucent glass
* border rất mờ
* corner radius lớn
* shadow/glow nhẹ
* text màu trắng hoặc trắng hơi xanh.
* Không dùng card quá lớn.

User message nếu cần hiển thị:

* nhỏ hơn Agent message.
* nằm phía trên hoặc gần Agent message.
* có opacity cao hơn một chút.

Không biến Assistant thành UI chat thông thường.

Nó phải giống **một AI đang hiện diện trên màn hình** hơn là một ứng dụng nhắn tin.

---

# 11. Agent Avatar

Ở trạng thái Assistant active có thể hiển thị một **AI icon/avatar tối giản** phía trên message stream.

Avatar nên:

* hình học đơn giản
* line icon hoặc abstract AI symbol
* màu xanh mint / green
* có glow nhẹ.

Avatar có thể pulse theo trạng thái Agent.

```text
Idle
  ↓
○

Listening
  ↓
◉  pulse

Thinking
  ↓
◉  rotating/subtle pulse

Speaking
  ↓
◉  pulse theo audio
```

---

# 12. Bottom Microphone Button

Ở dưới cùng màn hình đặt một **nút microphone lớn**.

Đây là control chính của Assistant.

Thiết kế:

```text
             ┌─────────┐
             │   🎙    │
             └─────────┘
```

Nhưng không sử dụng button vuông.

Button nên là:

* circular
* glassmorphism
* dark translucent center
* green neon ring
* soft outer glow.

Ví dụ:

```text
          ╭──────────╮
       ╭──│          │──╮
      │   │    MIC   │   │
       ╰──│          │──╯
          ╰──────────╯
```

---

# 13. Microphone States

## Idle

Nút microphone nhỏ glow nhẹ.

```text
     ◉
```

## Listening

Khi người dùng bắt đầu nói:

* microphone ring mở rộng nhẹ.
* green glow tăng.
* edge waves bắt đầu animation mạnh hơn.
* có thể hiển thị waveform quanh microphone.

```text
       ))) 🎙 (((
```

## Processing

Sau khi người dùng ngừng nói:

* microphone giảm animation.
* edge waves chuyển sang trạng thái "thinking".
* Agent message xuất hiện.

## Speaking

Khi Agent trả lời bằng voice:

* microphone trở lại trạng thái idle/listening.
* edge waves phản ứng theo amplitude của Agent voice.
* message stream hiển thị câu Agent đang nói.

---

# 14. Text Input

Assistant trước mắt hỗ trợ:

```text
Voice Input
+
Text Input
```

Không cần hiển thị keyboard/input field mặc định trên overlay.

Có thể có một **small keyboard/text-input icon** nằm cạnh microphone.

Ví dụ:

```text
     [ Keyboard ]       [ Microphone ]
```

Khi người dùng chọn keyboard:

* chuyển sang text input mode.
* vẫn giữ nguyên Assistant Overlay.
* không cần mở một màn hình chat riêng.

---

# 15. Assistant States

Assistant cần có các trạng thái visual rõ ràng:

```text
IDLE
 │
 ▼
ACTIVATED
 │
 ▼
LISTENING
 │
 ▼
PROCESSING
 │
 ▼
EXECUTING
 │
 ▼
SPEAKING
 │
 ▼
IDLE
```

Mỗi state thay đổi animation nhưng **không thay đổi layout chính**.

---

# 16. Navigation Action

Khi Agent thực hiện một action như:

> "Mở vườn 10"

Overlay vẫn giữ nguyên trong quá trình xử lý.

Ví dụ:

```text
User:
"Mở vườn 10"

        ↓

Agent:
"Em đang mở vườn 10..."

        ↓

Navigation

        ↓

Garden Detail Screen
```

Sau khi navigation hoàn tất:

* Overlay có thể tự động thu nhỏ/tắt.
* Hoặc giữ Assistant active nếu Agent cần tiếp tục tương tác.

---

# 17. Visual Hierarchy

Thứ tự ưu tiên:

```text
1. Agent activity / animation
2. Agent message
3. Microphone
4. Existing app UI
```

Existing UI chỉ đóng vai trò background context.

Không để Assistant overlay che mất hoàn toàn màn hình.

---

# 18. Color System

Màu chủ đạo:

```text
Primary Green:
Emerald / Neon Green

Secondary:
Dark Green
Deep Teal

Background:
Almost Black
Blue-green Black

Text:
White
Soft White
Mint White
```

Green glow cần có cảm giác **ánh sáng phát ra từ edge**, không phải màu nền.

Tránh:

* tím
* xanh dương neon quá mạnh
* đỏ
* rainbow gradient
* gradient nhiều màu.

---

# 19. Animation Philosophy

Animation phải:

* smooth
* organic
* continuous
* responsive
* physics-like.

Không sử dụng animation kiểu:

```text
fade in
fade out
```

đơn thuần cho toàn bộ Assistant.

Edge wave phải luôn có một chuyển động rất nhẹ khi Assistant active.

Khi có voice:

```text
Voice amplitude
      ↓
Wave amplitude
      ↓
Glow intensity
      ↓
Agent presence
```

Tạo cảm giác **AI thực sự đang nói và phản hồi**, thay vì chỉ là một UI animation.

---

# 20. Overall Visual Target

Khi mở Assistant, người dùng nhìn thấy:

```text
┌───────────────────────────────┐
│ ~~~                      ~~~  │
│   ~~                  ~~      │
│                              │
│       [ AI Avatar ]          │
│                              │
│    "Em đang nghe..."         │
│                              │
│        ~~~~~~~~~~~~          │
│       ~~~~~~~~~~~~~~         │
│        ~~~~~~~~~~~~          │
│                              │
│                              │
│                              │
│            ◉                 │
│          MICROPHONE          │
│                              │
│ ~~~                      ~~~  │
└───────────────────────────────┘
```

Phía dưới toàn bộ layer này vẫn nhìn thấy **màn hình app hiện tại nhưng đã bị tối + blur + giảm opacity**.

Cảm giác cuối cùng cần đạt được:

> **Không giống một chatbot được đặt lên app.**

Mà giống:

> **Một AI Assistant layer đang "chiếm quyền tương tác" tạm thời với toàn bộ ứng dụng.**

---

# 21. Important Implementation Constraints

* Không redesign các màn hình hiện tại.
* Overlay phải reusable trên toàn app.
* Không hard-code cho một screen cụ thể.
* Canvas phải là thành phần chính của visual effect.
* Animation phải chạy mượt trên mobile.
* Ưu tiên GPU-friendly rendering.
* Không tạo quá nhiều component animation độc lập.
* Wave phải có thể nhận `audioAmplitude` từ Agent voice pipeline.
* Assistant phải có thể nhận cả `text input` và `voice input`.
* Agent message stream phải nhận dữ liệu realtime.
* Navigation/action execution phải thông qua các API/function hiện có của app.
* Overlay cần có API/state interface rõ ràng để Backend Agent và Mobile UI có thể giao tiếp với nhau.

## Core concept

```text
Existing App
      +
Transparent Dark Glass Overlay
      +
Canvas Reactive Edge Waves
      +
Agent Message Stream
      +
Voice / Text Input
      +
Audio-Reactive Animation
      =
AI Assistant Interface
```
