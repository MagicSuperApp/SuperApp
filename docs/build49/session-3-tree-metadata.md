# Session 3 — TreeMetadata (farmer input + voice memo)

**Repo:** orilife-mobile-app worktree `/Users/ductiger/Projects/OriLifeTrace/3dmesh-view-wt-C`
**Branch:** `feature/tree-metadata` base `v2.0-aladin-rebrand`
**Budget:** 4 giờ
**Agent tên:** TreeMetadata
**MUST READ FIRST:** [CONTRACT.md](CONTRACT.md) — đặc biệt § `tree_metadata:{}` schema

## Role

Bạn là TreeMetadata. Build RN UI để farmer input biological data về cây 1 lần (species, variety, age, health, last harvest) + free text notes + voice memo. Persist data với Tree object (Redux/AsyncStorage), include vào bundle khi capture.

KHÔNG đụng native ARKit code, KHÔNG đụng backend, KHÔNG đụng capture flow.

## Foundation (reuse)

- `src/modules/trace/screens/TreeDetailScreen.tsx` đã có 3-tab structure (Tổng quan / Hình cây / Lịch sử) — bạn thêm tab 4 "Thông tin"
- `src/modules/trace/types/index.ts` Tree interface — extend optional fields
- `src/modules/trace/store/farmSlice.ts` Redux — extend reducer
- React Native built-in `Picker` hoặc custom Modal dropdown — KHÔNG cài thư viện mới
- `expo-av` hoặc native `AVAudioRecorder` — VERIFY cài chưa, nếu chưa → use NativeModule wrapper qua bridge (giống MesVid pattern)

## Deliverables

### 1. NEW `src/modules/trace/screens/TreeMetadataTab.tsx`

Tab content cho TreeDetailScreen, render khi `activeTab === 'metadata'`:

```tsx
<ScrollView>
  <Section title="Thông tin cây">
    <Dropdown
      label="Loài / Giống"
      value={form.variety}
      options={DURIAN_VARIETIES}  // Ri6, Monthong, Musang King, Khác
      onChange={v => setForm({...form, variety: v})}
    />
    <NumberInput label="Tuổi cây (năm)" value={form.age_years} max={100} />
    <Dropdown
      label="Tình trạng"
      options={['Khoẻ', 'Đang ra hoa', 'Có bệnh', 'Khô', 'Chết']}
      value={form.health_status}
    />
    <DateInput label="Lần thu hoạch gần nhất" value={form.last_harvest_date} />
  </Section>
  
  <Section title="Ghi chú">
    <TextArea
      placeholder="Vd: Cây ven bờ ao, lá xanh tốt, sai quả"
      value={form.notes}
      maxLength={500}
    />
    <VoiceMemoButton
      onRecorded={(uri, durationS) => setForm({...form, voice_memo: { uri, durationS }})}
      maxSeconds={30}
    />
  </Section>
  
  <Button title="Lưu thông tin" onPress={handleSave} loading={saving} />
</ScrollView>
```

### 2. MODIFY `TreeDetailScreen.tsx`

Add 4th tab "Thông tin":
- `TabKey = 'overview' | 'mesh' | 'history' | 'metadata'`
- Tab bar render thêm chip "Thông tin" (icon `clipboard-text-outline`)
- `RouteParams.initialTab` accept thêm `'metadata'`

### 3. NEW `src/modules/trace/components/VoiceMemoButton.tsx`

Reusable record button:
- Tap once → bắt đầu ghi âm (RN bridge to native `AVAudioRecorder`)
- Tap lại → dừng, gọi `onRecorded(fileURI, durationS)`
- Visual: red dot pulse while recording + waveform animation
- Max 30s auto-stop
- Permission check: nếu denied → Alert "Cần quyền microphone..." link Settings

### 4. NEW Native bridge `ios/LocalPods/ScannerModule/UI/VoiceMemoModule.swift` + `.m`

(Nếu `expo-av` không có hoặc không muốn dùng) — wrap `AVAudioRecorder`:
- Method `startRecording(fileName: String) -> Promise<URL>`
- Method `stopRecording() -> Promise<{ uri: String, duration: Double }>`
- Permission handling

Reuse pattern từ `Capture3DBridgeModule.swift` (RCTEventEmitter NOT needed — chỉ promises).

### 5. EXTEND `src/modules/trace/types/index.ts`

```ts
export interface Tree {
  id: string;
  code: string;
  // ... existing ...
  metadata?: {
    variety?: string;           // 'Ri6' | 'Monthong' | 'Musang King' | 'Khác'
    species?: string;           // default 'Durio zibethinus'
    age_years?: number;
    health_status?: 'healthy' | 'flowering' | 'diseased' | 'drying' | 'dead';
    last_harvest_date?: string; // ISO date
    notes?: string;
    voice_memo_uri?: string;    // file:// local path
    voice_memo_duration_s?: number;
    last_updated_at?: string;   // ISO
  };
}
```

### 6. MODIFY `src/modules/trace/store/farmSlice.ts`

Add reducer `updateTreeMetadata(state, action: PayloadAction<{treeId: string, metadata: Tree['metadata']}>)`.

### 7. MODIFY `src/modules/capture3d/screens/Capture3DSessionScreen.tsx`

Trước khi start session, pull `tree.metadata` từ Redux + voice memo file path → pass qua bridge `Capture3DBridge.startSession({ treeId, farmId, treeMetadata, voiceMemoUri })`.

Native side (NOT touched by Session 3) chỉ truyền tiếp; backend Session 4 sẽ consume từ manifest.

### 8. MODIFY `Capture3DBridge.ts` TS interface

```ts
interface StartSessionParams {
  treeId: string;
  farmId: string;
  treeMetadata?: { /* match Tree.metadata */ };
  voiceMemoUri?: string;  // file://
}
```

NHƯNG NATIVE wiring sẽ defer cho Session 1 hoặc Session A merge phase (vì Native là Session 1's territory). Session 3 chỉ extend TS contract + UI input.

## File KHÔNG được đụng

- `Capture3DCoordinator.swift` (Session 1+2)
- `Capture3DRaycaster.swift`, `MeshExporter.swift`, `Sensors/*`, `Metrics/*`
- `FarmDetailScreen.tsx` (Session 5's territory cho TesterTools)
- `AccountScreen.tsx`

## Acceptance criteria

- [ ] `npx tsc --noEmit` → 0 new errors
- [ ] `xcodebuild` Debug pass (nếu add native VoiceMemoModule)
- [ ] Tap cây → TreeDetail có 4 tab, "Thông tin" tab hiện form
- [ ] Form save → Redux update + AsyncStorage persist
- [ ] Voice memo: tap record → cho phép mic → tap stop → preview play button
- [ ] Permission denied → friendly alert Vietnamese link Settings
- [ ] PR description: screenshot 4-tab + form filled

## Constraints

- KHÔNG cài 3rd-party form library (Formik/RHF) — dùng useState manual
- KHÔNG cài datepicker mới — dùng RN built-in DateTimePickerAndroid hoặc Platform-specific component (nếu repo đã có DatePicker reuse, else custom Modal)
- Voice memo max 30s, file size <500KB AAC mono 22kHz
- Validation: variety required, age_years 0-100, notes max 500 chars

## Khi xong

`git push origin feature/tree-metadata` → PR target `v2.0-aladin-rebrand` title `feat(tree-metadata): farmer biological input form + voice memo (build 49)`.
