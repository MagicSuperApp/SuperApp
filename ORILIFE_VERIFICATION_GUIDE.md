# OriLife Verification Flow - Implementation Guide
## MVP v1.3 - Engineering-Ready

---

## 📋 Overview

This implementation provides a complete **Truy xuất (Verification)** flow for the OriLife app, allowing users to:
1. **Verify/Register Fruits** via camera with smart capture
2. **Track Sync Status** with offline-first queue management
3. **View Results** with match/no-match verification

All the code follows these principles:
- ✅ **Black-box Integration**: Dev only interacts with PhoenixKey SDK & API via public methods
- ✅ **Behavioral Guardrails**: Real-time feedback guides users to capture correctly
- ✅ **Offline-First**: Data persists locally before syncing to blockchain
- ✅ **Mock Data**: All APIs and SDKs are mocked for development

---

## 📁 File Structure

```
src/
├── types/
│   └── verification.ts           # Core type definitions (40+ types)
├── constants/
│   └── verification.ts           # Feature flags, configs, error mappings
├── sdk/
│   └── phoenixKey.ts             # PhoenixKey SDK mock (black-box)
├── services/
│   ├── verification-api.ts       # API client mock
│   └── storageQueue.ts           # SQLite-like queue management
├── utils/
│   ├── crypto.ts                 # Signature & encoding utilities
│   ├── imageQuality.ts           # Blur detection, stabilty check, etc.
│   └── errorHandler.ts           # Error mapping to user messages
└── screens/
    ├── SmartCaptureScreen.tsx    # Camera with AR overlay
    ├── VerificationScreen.tsx    # Match/No-match results
    └── DashboardScreen.tsx       # Sync queue + item list
```

---

## 🎬 User Flow

### 1️⃣ SmartCaptureScreen (Camera)
**Purpose**: Collect 5 high-quality images of a fruit/tree

**Key Features**:
- 🎥 Real-time YOLO detection with bounding box
- ⚡ Blur detection (Laplacian variance check)
- 📱 Device stability monitoring (Accelerometer)
- 🔄 Progress ring (shows 5/N images captured)
- ⏱️ Manual override after 30s timeout
- 🎨 AR overlay with feedback (sharpness, stability, detection)

**Flow**:
```
1. User opens SmartCaptureScreen with treeId
2. App streams camera frames ~2x/sec
3. For each frame:
   - YOLO detects fruit (confidence > 0.85)
   - Check: Laplacian variance > 100 (sharp)
   - Check: Device stable < 0.8 m/s²
   - If all pass → Auto-capture image
4. Once 5 images → Show complete dialog
5. Navigate to VerificationScreen
```

**Code Entry**:
```typescript
import SmartCaptureScreen from './screens/SmartCaptureScreen';

// Usage in navigation
<Stack.Screen 
  name="SmartCapture" 
  component={SmartCaptureScreen}
  initialParams={{
    treeId: 'tree_001',
    farmId: 'farm_001',
    location: { lat: 10.77, lng: 106.69, accuracy: 5.2 }
  }}
/>
```

---

### 2️⃣ VerificationScreen (Results)
**Purpose**: Show match/no-match result with confidence score

**Key Features**:
- 🎯 MATCH (green) or NO_MATCH (red) badge
- 📊 Confidence score (0-100%)
- ✅ Suggested actions (View log, Register new, Care guide)
- 🔐 Verification badge (verified by PhoenixKey)
- 🔄 Retry logic with error messages

**Flow**:
```
1. VerificationScreen receives captured images
2. Signs metadata with PhoenixKey.signData()
3. Calls verificationAPI.verifyCapture()
4. Displays result:
   - MATCH: Show tree/fruit details, action buttons
   - NO_MATCH: Show registration prompt
5. Queue result for sync
```

**Code Entry**:
```typescript
import VerificationScreen from './screens/VerificationScreen';

// Auto-called from SmartCaptureScreen with params
navigation.navigate('Verification', {
  imageUri: '/path/to/image.jpg',
  treeId: 'tree_001',
  farmId: 'farm_001',
  location: { lat: 10.77, lng: 106.69, accuracy: 5.2 },
  imageQuality: { laplacianVariance: 150 }
});
```

---

### 3️⃣ DashboardScreen (Management)
**Purpose**: View sync queue status, manage pending items, quick actions

**Key Features**:
- 💰 Wallet balance (MAGIC, LAMP, ADA credits)
- 🔄 Sync status (Pending, Syncing, Verified, Error)
- ⚠️ Kill switch alert (>100 items pending)
- 📋 Filterable list (All, Unidentified, Verified, Error)
- ⚡ Quick actions (Verify, Add tree, Sync, Settings)

**Flow**:
```
1. Load sync queue and wallet status
2. Display 4 stats: Pending, Syncing, Verified, Error
3. Check if pending > 100 → Show kill switch alert
4. List trees/fruits with status badges
5. Auto-sync if online
6. Manual sync button available
```

**Code Entry**:
```typescript
import DashboardScreen from './screens/DashboardScreen';

// In navigation
<Stack.Screen 
  name="Dashboard" 
  component={DashboardScreen}
/>
```

---

## 🔑 SDK & API Usage

### PhoenixKey SDK (Black-Box)

**What Dev Can Call**:
```typescript
import phoenixKeySDK, { usePhoenixKey } from './sdk/phoenixKey';

// 1. Check if user is activated
const isActivated = await phoenixKeySDK.isActivated();
// Returns: true (show Dashboard) | false (show Activation banner)

// 2. Get wallet status
const wallet = await phoenixKeySDK.getWalletStatus();
// Returns: { isActivated, magicCredits, lampTokens, adaBalance, address, lastUpdated }

// 3. Sign data for blockchain
const signedData = await phoenixKeySDK.signData({
  timestamp: Date.now(),
  data: { treeId, farmId, location },
  nonce: generateNonce()
});
// Returns: { payload, signature, publicKey }

// 4. Request activation
const result = await phoenixKeySDK.requestActivation();
// Returns: { success, message }
```

**What Dev CANNOT Access**:
- ❌ Private key
- ❌ Cryptographic algorithms (Ed25519, etc.)
- ❌ TPM/Strongbox internals
- ❌ Credential reset details

---

### Verification API (Mock)

**Endpoints Available**:
```typescript
import verificationAPI from './services/verification-api';

// 1. Verify single image
const result = await verificationAPI.verifyCapture(dto);
// Returns: VerificationResult { status, confidence, metadata, suggestions }

// 2. Get fruit details
const fruit = await verificationAPI.getFruit(fruitId);

// 3. Get tree details
const tree = await verificationAPI.getTree(treeId);

// 4. Get sync queue
const queue = await verificationAPI.getSyncQueue(userAddress);

// 5. Batch sync
const syncResult = await verificationAPI.syncBatch(dto);
// Returns: { success: number, failed: number }
```

**Mocked Behavior**:
- Verification takes 1.5s (simulating AI processing)
- Random confidence 0.6-1.0
- Match if confidence > 0.75
- All network delays simulated

---

## 📦 Storage & Queue Management

### Offline-First Architecture

```typescript
import storageQueueService from './services/storageQueue';

// 1. Add to queue (auto-prioritized)
const item = await storageQueueService.enqueueItem(
  'metadata', // or 'image'
  { fruitId, treeId, data },
  { priority: 'high' } // metadata=high, images=normal
);

// 2. Get next batch to sync
const batch = await storageQueueService.getNextBatch(10);
// Returns: Items sorted by priority + creation time

// 3. Mark items as syncing
await storageQueueService.markSyncing(['item_1', 'item_2']);

// 4. Mark items as verified
await storageQueueService.markVerified(['item_1', 'item_2']);

// 5. Handle error with retry
await storageQueueService.markError(['item_1'], 'Network timeout');

// 6. Get queue stats
const stats = await storageQueueService.getQueueStats();
// Returns: { totalItems, pending, syncing, verified, error }
```

**Queue States**:
- `pending` → Waiting to sync
- `syncing` → Currently uploading
- `verified` → Successfully synced
- `error` → Failed (max retries exceeded)

---

## 🛠️ Utilities

### Image Quality Check
```typescript
import {
  calculateLaplacianVariance,
  isImageSharp,
  getCaptureReadiness,
  validateGPSAccuracy
} from './utils/imageQuality';

// Check if image is sharp
const variance = calculateLaplacianVariance(imageUri);
const isSharp = isImageSharp(variance); // variance > 100?

// Check full readiness
const readiness = getCaptureReadiness(variance, sensorData, frameData);
// Returns: { isReady, sharpness, stability, detection, feedback }

// Check GPS accuracy
const gpsCheck = validateGPSAccuracy(accuracy);
// Shows warning if accuracy > 15m
```

### Error Handling
```typescript
import {
  createCaptureError,
  parseSDKError,
  getSuggestionForError,
  getRetryStrategy
} from './utils/errorHandler';

// Create error with context
const error = createCaptureError(ERROR_CODES.BLUR_DETECTED, 'blur');

// Parse SDK error to user message
const userError = parseSDKError(sdkErrorObject);

// Get suggested action for error
const suggestion = getSuggestionForError(error);
// Returns: { title, action, actionLabel, details }

// Get retry policy
const retry = getRetryStrategy(retryCount, error);
// Returns: { shouldRetry, delayMs, maxAttempts }
```

---

## ⚙️ Configuration

### Constants & Feature Flags
```typescript
import {
  CAPTURE_CONFIG,
  QUEUE_CONFIG,
  ERROR_CODES,
  ERROR_MESSAGES,
  SYNC_STATES,
  FEATURES
} from './constants/verification';

// Camera thresholds
CAPTURE_CONFIG.TARGET_IMAGES; // 5
CAPTURE_CONFIG.YOLO_CONFIDENCE_THRESHOLD; // 0.85
CAPTURE_CONFIG.BLUR_DETECTION_THRESHOLD; // 100
CAPTURE_CONFIG.MANUAL_OVERRIDE_TIMEOUT; // 30s

// Queue thresholds
QUEUE_CONFIG.KILL_SWITCH_THRESHOLD; // 100 items
QUEUE_CONFIG.MAX_RETRY_ATTEMPTS; // 3
QUEUE_CONFIG.BATCH_SIZE; // 10 items

// Feature flags
FEATURES.ENABLE_OFFLINE_MODE; // true
FEATURES.ENABLE_MOCK_VERIFICATION; // true
FEATURES.ENABLE_QUALITY_THRESHOLD; // true
```

---

## 🔀 Navigation Integration

**Example Navigation Stack**:
```typescript
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from './screens/DashboardScreen';
import SmartCaptureScreen from './screens/SmartCaptureScreen';
import VerificationScreen from './screens/VerificationScreen';

const Stack = createNativeStackNavigator();

export const VerificationNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
      <Stack.Screen 
        name="SmartCapture" 
        component={SmartCaptureScreen}
        options={{ animationEnabled: false }}
      />
      <Stack.Screen 
        name="Verification" 
        component={VerificationScreen}
      />
    </Stack.Navigator>
  );
};
```

---

## 🧪 Testing & Development

### Mock Data
All API responses are mocked with realistic data:

```typescript
// Mock verification result
{
  status: 'MATCH',
  confidence: 0.92,
  matchedFruitId: 'fruit_001',
  metadata: {
    detectedAt: Date.now(),
    modelVersion: 'sam3-v2.1.0'
  },
  suggestions: [
    { action: 'view_log', label: 'Xem nhật ký' },
    { action: 'care_guide', label: 'Hướng dẫn chăm sóc' }
  ]
}
```

### Enable Debug Mode
```typescript
// In constants/verification.ts
FEATURES.ENABLE_DEBUG_OVERLAY = true; // Shows AI detection info
```

### Test Offline Mode
```typescript
import verificationAPI from './services/verification-api';

verificationAPI.setOnlineStatus(false); // Trigger offline errors
verificationAPI.setOnlineStatus(true);  // Back online
```

---

## 🚀 Next Steps

1. **Wire Navigation**: Add screens to your main navigation stack
2. **Connect Backend**: Replace mock API with real endpoints
3. **Real Camera**: Integrate `react-native-vision-camera`
4. **Redux Integration**: If needed for global state
5. **Biometric Auth**: PhoenixKey credential verification
6. **Real Blockchain**: Deploy to Cardano testnet

---

## 📚 Key Files Reference

| File | Purpose | Key Export |
|------|---------|-----------|
| `types/verification.ts` | Type definitions | `VerificationResult`, `CaptureImage`, `QueueItem` |
| `constants/verification.ts` | Config + error mapping | `CAPTURE_CONFIG`, `ERROR_MESSAGES` |
| `sdk/phoenixKey.ts` | PhoenixKey wrapper | `usePhoenixKey()` |
| `services/verification-api.ts` | API client | `useVerificationAPI()` |
| `services/storageQueue.ts` | Queue management | `useStorageQueue()` |
| `utils/imageQuality.ts` | Image validation | `getCaptureReadiness()` |
| `utils/errorHandler.ts` | Error mapping | `getSuggestionForError()` |
| `VerificationScreen.tsx` | Results display | Match/No-match UI |
| `SmartCaptureScreen.tsx` | Camera interface | AR overlay + capture |
| `DashboardScreen.tsx` | Queue management | Sync status + item list |

---

## 📞 Support

For issues or questions:
1. Check `ERROR_MESSAGES` for user-facing messages
2. Enable debug overlay: `FEATURES.ENABLE_DEBUG_OVERLAY`
3. Review mock data in `verification-api.ts`
4. Check queue status: `storageQueueService.getQueueStats()`

---

**Version**: MVP 1.3  
**Status**: Engineering-Ready (Frozen)  
**Last Updated**: March 18, 2026
