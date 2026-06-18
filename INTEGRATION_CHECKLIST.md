# OriLife Verification Flow - Integration Checklist

> Quick reference for integrating OriLife Verification screens into your navigation stack

---

## ✅ Pre-Integration Setup

### 1. Dependencies Check
Ensure these are installed in `package.json`:
```json
{
  "dependencies": {
    "react-native": "0.84.1",
    "react-native-paper": "^5.15.0",
    "react-native-vector-icons": "^10.3.0",
    "@react-navigation/native": "^7.1.33",
    "@react-navigation/stack": "^7.8.5",
    "@react-native-async-storage/async-storage": "^1.13.0"
  }
}
```

If missing, run:
```bash
npm install @react-native-async-storage/async-storage
# or
yarn add @react-native-async-storage/async-storage
```

---

## 📝 Step 1: Create Navigation Stack

Create file: `src/navigation/VerificationNavigator.tsx`

```typescript
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import SmartCaptureScreen from '../screens/SmartCaptureScreen';
import VerificationScreen from '../screens/VerificationScreen';

const Stack = createNativeStackNavigator();

export type VerificationStackParamList = {
  Dashboard: undefined;
  SmartCapture: {
    treeId: string;
    farmId: string;
    location: { lat: number; lng: number; accuracy: number };
  };
  Verification: {
    imageUri: string;
    treeId: string;
    farmId: string;
    location: { lat: number; lng: number; accuracy: number };
    imageQuality: { laplacianVariance: number };
  };
};

export const VerificationNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: 'transparent' },
      }}
      initialRouteName="Dashboard"
    >
      <Stack.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          animationEnabled: false,
        }}
      />
      
      <Stack.Screen 
        name="SmartCapture" 
        component={SmartCaptureScreen}
        options={{
          animationEnabled: false,
          cardOverlayEnabled: false,
        }}
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

## 📝 Step 2: Integrate into Main Navigation

Update your main navigation file (e.g., `src/navigation/RootNavigator.tsx`):

```typescript
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ActivationScreen from '../screens/ActivationScreen';

// ✅ Import VerificationNavigator
import { VerificationNavigator } from './VerificationNavigator';

const Stack = createNativeStackNavigator();

export const RootNavigator = () => {
  const isLoggedIn = useSelector((state: any) => state.user.isLoggedIn);
  const isActivated = useSelector((state: any) => state.user.isActivated);

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={!isLoggedIn ? 'Login' : 'Verification'}
      >
        {!isLoggedIn ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : !isActivated ? (
          <Stack.Screen name="Activation" component={ActivationScreen} />
        ) : (
          // ✅ Add Verification Navigator here
          <Stack.Screen 
            name="Verification" 
            component={VerificationNavigator}
            options={{ animationEnabled: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
```

---

## 📝 Step 3: Update App.tsx

Ensure your `App.tsx` uses the RootNavigator:

```typescript
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';
import Toast from 'react-native-toast-message';
import { RootNavigator } from './navigation/RootNavigator';
import store from './store';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <RootNavigator />
        <Toast />
      </Provider>
    </GestureHandlerRootView>
  );
}
```

---

## 🧪 Step 4: Test the Integration

### Test 1: Navigate to Dashboard
```typescript
// In any component
import { useNavigation } from '@react-navigation/native';

const navigation = useNavigation();

// Go to dashboard
navigation.navigate('Verification', { 
  screen: 'Dashboard' 
});
```

### Test 2: Test Smart Capture
```typescript
// From Dashboard (click "Truy xuất" button)
const handleVerify = () => {
  navigation.navigate('SmartCapture', {
    treeId: 'tree_001',
    farmId: 'farm_001',
    location: {
      lat: 10.773636,
      lng: 106.696297,
      accuracy: 5.2,
    },
  });
};
```

### Test 3: Verify Flow
Smart Capture → Verification (automatic after 5 images)

---

## 🔌 Step 5: Connect Redux Store (Optional)

If you want to sync verification state with Redux:

Create file: `src/store/verificationSlice.ts`

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { VerificationResult } from '../types/verification';

interface VerificationState {
  lastResult: VerificationResult | null;
  capturedImagesCount: number;
  queueStats: {
    pending: number;
    syncing: number;
    verified: number;
    error: number;
  };
}

const initialState: VerificationState = {
  lastResult: null,
  capturedImagesCount: 0,
  queueStats: {
    pending: 0,
    syncing: 0,
    verified: 0,
    error: 0,
  },
};

const verificationSlice = createSlice({
  name: 'verification',
  initialState,
  reducers: {
    setLastResult: (state, action: PayloadAction<VerificationResult>) => {
      state.lastResult = action.payload;
    },
    setCapturedImagesCount: (state, action: PayloadAction<number>) => {
      state.capturedImagesCount = action.payload;
    },
    setQueueStats: (state, action) => {
      state.queueStats = action.payload;
    },
  },
});

export const { setLastResult, setCapturedImagesCount, setQueueStats } = 
  verificationSlice.actions;
export default verificationSlice.reducer;
```

Update `src/store/index.ts`:
```typescript
import verificationReducer from './verificationSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    farm: farmReducer,
    verification: verificationReducer, // ✅ Add this
  },
});
```

---

## 🔐 Step 6: Permissions Check

Add these to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

Add to `ios/OriLife/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to identify fruits and trees</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>We need your location to tag geographic data</string>
```

---

## 📱 Step 7: Test on Device/Emulator

```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

### Quick Test Checklist:
- [ ] Dashboard loads without errors
- [ ] Click "Truy xuất" → SmartCapture opens
- [ ] SmartCapture shows progress ring
- [ ] After 5 images → Verification screen
- [ ] Verification shows MATCH/NO_MATCH result
- [ ] Sync queue updates in Dashboard
- [ ] Offline mode works (setOnlineStatus(false))

---

## 🐛 Troubleshooting

### Issue: "Cannot find module './screens/VerificationScreen'"
**Solution**: Ensure all screen files exist:
- ✅ `src/screens/VerificationScreen.tsx`
- ✅ `src/screens/SmartCaptureScreen.tsx`
- ✅ `src/screens/DashboardScreen.tsx`

### Issue: "COLORS is not defined"
**Solution**: Import COLORS in screens:
```typescript
import { COLORS } from '../constants';
```

### Issue: "AsyncStorage is not defined"
**Solution**: Install package:
```bash
npm install @react-native-async-storage/async-storage
```

### Issue: Native modules not linked
**Solution**: Run pod install (iOS):
```bash
cd ios && pod install && cd ..
```

---

## 📊 Features Summary

| Feature | Status | File |
|---------|--------|------|
| Camera capture | ✅ Mocked | SmartCaptureScreen.tsx |
| YOLO detection | ✅ Mocked | imageQuality.ts |
| Blur detection | ✅ Mocked | imageQuality.ts |
| Device stability | ✅ Mocked | imageQuality.ts |
| Verification API | ✅ Mocked | verification-api.ts |
| PhoenixKey SDK | ✅ Mocked | phoenixKey.ts |
| Queue management | ✅ Real (AsyncStorage) | storageQueue.ts |
| Error handling | ✅ Complete | errorHandler.ts |
| Navigation | ✅ Ready | VerificationNavigator.tsx |
| Offline mode | ✅ Supported | All services |
| Real camera | ❌ Future | Install react-native-vision-camera |
| Real blockchain | ❌ Future | Replace mock SDK |

---

## 🚀 Production Checklist

Before deploying to production:

- [ ] Replace mock API with real backend
- [ ] Replace PhoenixKey mock with real SDK
- [ ] Implement real camera (react-native-vision-camera)
- [ ] Test on real devices (Android + iOS)
- [ ] Enable code obfuscation/minification
- [ ] Set FEATURES.ENABLE_DEBUG_OVERLAY = false
- [ ] Add analytics/error reporting (Sentry)
- [ ] Implement real AsyncStorage persistence
- [ ] Test offline mode thoroughly
- [ ] Add proper error logging
- [ ] Optimize bundle size
- [ ] Test with slow networks (3G, etc.)

---

## 📞 Support Resources

- **Types Reference**: [src/types/verification.ts](./src/types/verification.ts)
- **API Mock Details**: [src/services/verification-api.ts](./src/services/verification-api.ts)
- **Full Guide**: [ORILIFE_VERIFICATION_GUIDE.md](./ORILIFE_VERIFICATION_GUIDE.md)
- **Constants**: [src/constants/verification.ts](./src/constants/verification.ts)

---

**Status**: ✅ Ready to integrate  
**Last Updated**: March 18, 2026
