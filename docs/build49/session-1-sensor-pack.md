# Session 1 — SensorPack (iOS native sensors)

**Repo:** orilife-mobile-app worktree `/Users/ductiger/Projects/OriLifeTrace/3dmesh-native-wt-A`
**Branch:** `feature/sensor-pack` base `v2.0-aladin-rebrand` (đã có build 48 v3)
**Budget:** 4 giờ
**Agent tên:** SensorPack
**MUST READ FIRST:** [CONTRACT.md](CONTRACT.md) — đặc biệt § `sensors:{}` schema

## Role

Bạn là SensorPack. Tận dụng cảm biến chưa dùng trên iPhone Pro để collect data RICH cho training AI: magnetometer (compass), barometer (altitude), IMU (accel+gyro continuous), ambient light (qua ARKit), audio environment, device orientation. Append vào manifest.json field mới `sensors:{}`.

## Foundation (đã có, reuse)

- `Capture3DCoordinator.swift` — state machine sẵn, có sessionStartThermal poll
- ARKit ARFrame có `lightEstimate.ambientIntensity` + `ambientColorTemperature`
- ARFrame timestamp monotonic
- LocationHelper đã có (KHÔNG đụng)
- Bundle3DAssembler tự enumerate file mới trong sessionDir

## Deliverables

### File mới `ios/LocalPods/ScannerModule/Core/Capture3D/Sensors/`

1. **`SensorPackCoordinator.swift`** — Orchestrate 5 collectors. Public:
   - `start(sessionDir: URL)` — khởi 5 collectors
   - `stop() -> SensorPackResult` — flush + write CSV/m4a, return JSON summary

2. **`MagnetometerCollector.swift`** — `CMMotionManager.startDeviceMotionUpdates(using: .xMagneticNorthZVertical)`
   - 1Hz sample
   - Output: `magnetic_heading_degrees`, `true_heading_degrees`, `accuracy_degrees`
   - Write `sensors/magnetometer_log.csv` (timestamp, mag_heading, true_heading)
   - Summary: average + final reading

3. **`BarometerCollector.swift`** — `CMAltimeter.startRelativeAltitudeUpdates(to: .main)`
   - Output: `pressure_kpa`, `relative_altitude_m` (so với điểm "zero" lúc start)
   - Summary: max + final altitude (chiều cao quanh cây so với ground)
   - Fallback: nếu `isRelativeAltitudeAvailable == false` → skip gracefully, omit field

4. **`IMUCollector.swift`** — `CMMotionManager.startDeviceMotionUpdates(to: queue)`
   - 60Hz sample
   - Write `sensors/imu_motion.csv` (timestamp, accel_xyz, gyro_xyz)
   - Compute summary post-session:
     - `path_length_m` = integrate accel double + correct gravity (rough estimate)
     - `max_lateral_speed_mps`
     - `rotation_deg` = integrate gyro_y over 30s (quay quanh trục dọc)

5. **`AmbientLightSampler.swift`** — đọc từ `Coordinator.ARFrame.lightEstimate`
   - Sample 5 frames (frame 0, 3, 6, 9, 12) hoặc average
   - Output: `intensity_lux` (ambientIntensity × 1000 / typical scale), `color_temperature_k`, `estimated_from: "arkit_light_estimate"`

6. **`AudioEnvironmentRecorder.swift`** — `AVAudioRecorder`
   - 30s mono 22kHz AAC (~150KB)
   - Write `sensors/audio.m4a` trong sessionDir
   - Permission: cần `NSMicrophoneUsageDescription` — Session A sẽ add
   - Post-session FFT để detect wind hint (low-freq energy >threshold):
     - Output: `duration_s`, `peak_db`, `wind_hint: bool`
   - Best-effort: nếu permission denied → skip + log warning

7. **`DeviceOrientationLogger.swift`** — `UIDevice.current.beginGeneratingDeviceOrientationNotifications()`
   - Snapshot at session start + every 15s + session end
   - Output: array of `{t_ms, orientation: "portrait"|"landscape"|...}`

### Modify `Capture3DCoordinator.swift`

- Add `let sensorPack = SensorPackCoordinator()` property
- `start()`: après poseProvider.start() → `sensorPack.start(sessionDir: dir)`
- `finalizeBundling()`: trước `writeManifest` → `let sensorResult = sensorPack.stop()` → pass vào writeManifest
- `cancel()`: `sensorPack.stop()` discard result (don't write)
- Update `writeManifest()`:
  - New param `sensors: SensorPackResult? = nil`
  - Serialize sensors dict vào manifest dict
  - Schema match CONTRACT § sensors

### Modify `Info.plist`

Add new permission strings:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Aladin ghi âm môi trường xung quanh cây để hệ thống học hỏi thêm về điều kiện chụp.</string>
<key>NSMotionUsageDescription</key>
<string>Aladin dùng cảm biến chuyển động để theo dõi đường đi quanh cây.</string>
```
(NSMotionUsageDescription may already exist — verify, don't duplicate.)

## File KHÔNG được đụng

- `Capture3DVideoRecorder.swift` (Session 2's territory if related to AVCapture, but here SensorPack uses separate AVAudioRecorder)
- `Capture3DMeshExporter.swift`, `Capture3DRaycaster.swift`
- Bất kỳ file `src/` RN
- `LocationHelper.swift` (chỉ reuse)
- `DetectionCoordinator.swift`

## Acceptance criteria

- [ ] `xcodebuild` Debug iphonesimulator → exit 0
- [ ] Capture session trên iPhone Pro 12+ → bundle TAR có:
  - `sensors/magnetometer_log.csv` ≥30 rows
  - `sensors/imu_motion.csv` ≥1800 rows
  - `sensors/audio.m4a` 25-32s playable
- [ ] manifest.json có top-level `sensors:{}` với 6 sub-objects
- [ ] iPhone không LiDAR / không barometer (vd iPad) → graceful skip, fields omitted, không crash
- [ ] Microphone permission denied → skip audio gracefully, log warning, các sensors khác vẫn work
- [ ] PR description JSON example của `sensors:{}` từ real test session

## Constraints

- 60Hz IMU sustained 30s = 1800 samples × ~50 bytes = ~90KB CSV. OK trong budget bundle 50MB.
- Audio 30s mono 22kHz AAC ≈ 150KB. OK.
- KHÔNG dùng 3rd-party sensor library — chỉ Apple CoreMotion + AVFoundation + ARKit.
- Permission denied path phải graceful (audit C4 từ build 47 — error messages friendly).

## Khi xong

`git push origin feature/sensor-pack` → PR target `v2.0-aladin-rebrand` title `feat(sensor-pack): magnetometer + barometer + IMU + audio + ambient light (build 49)`.
