# Firebase Authentication Integration Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    React Native App                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  LoginScreen          OTPScreen         RegisterScreen │
│       │                   │                    │        │
│       └───────────────────┼────────────────────┘        │
│                           │                             │
│                    authService.ts                       │
│    (Firebase Authentication Wrapper)                   │
│                           │                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│          Firebase Authentication (React Native)        │
│     @react-native-firebase/auth                        │
│                           │                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│               Firebase Backend Services               │
│     ┌──────────────────────────────────┐               │
│     │   Phone OTP Verification SMS      │               │
│     │   User Authentication             │               │
│     │   Token Management                │               │
│     └──────────────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### Login Flow

```
User enters phone number
          ↓
  LoginScreen calls:
  authService.login(phone)
          ↓
  authService.sendOTP(phone)
          ↓
  Firebase.signInWithPhoneNumber()
          ↓
  Firebase sends OTP SMS
          ↓
  Return verificationId
          ↓
  Navigate to OTPScreen
          ↓
  User enters 6-digit OTP
          ↓
  OTPScreen calls:
  authService.verifyOTP(otp)
          ↓
  PhoneAuthProvider.credential(verificationId, otp)
          ↓
  Firebase.signInWithCredential()
          ↓
  User authenticated ✓
          ↓
  Dispatch loginUser(user)
          ↓
  Navigate to Main App
```

### Registration Flow

```
User enters phone & name
          ↓
  RegisterScreen calls:
  authService.register(phone, name)
          ↓
  authService.sendOTP(phone)
          ↓
  Firebase.signInWithPhoneNumber()
          ↓
  Firebase sends OTP SMS
          ↓
  Navigate to OTPScreen
          ↓
  User enters 6-digit OTP
          ↓
  authService.verifyOTP(otp)
          ↓
  Firebase creates new user account
          ↓
  User authenticated ✓
          ↓
  Update user profile (name)
  authService.updateProfile({ displayName: name })
          ↓
  Dispatch loginUser(user)
          ↓
  Navigate to Main App
```

## Component Integration

### 1. **LoginScreen** (`src/screens/LoginScreen.tsx`)

**Purpose:** Collect phone number from user

**Key Flow:**
```typescript
// User enters phone
const handleLogin = async () => {
  // Validate phone
  const result = await authService.login(phone);
  // Navigate to OTP: navigation.navigate('OTP', { phone });
}
```

**Dependencies:**
- `authService.login(phone)` - Send OTP

**Navigation to:**
- OTPScreen (on success)

### 2. **OTPScreen** (`src/screens/OTPScreen.tsx`)

**Purpose:** Collect and verify 6-digit OTP

**Key Flow:**
```typescript
// User enters OTP
const handleVerify = async (otpCode) => {
  // Verify OTP with Firebase
  const result = await authService.verifyOTP(otpCode);
  if (result.success && result.user) {
    // Store user in Redux
    await dispatch(loginUser(result.user));
    // Navigate to Main App
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }
}
```

**Features:**
- Auto-extract OTP from SMS (Android)
- 6-digit input with auto-focus
- Resend OTP functionality
- Auto-verify when all digits entered

**Dependencies:**
- `authService.verifyOTP(otp)` - Verify OTP
- `authService.resendOTP()` - Resend OTP
- `loginUser` Redux action

**Navigation to:**
- Main App (on success)
- LoginScreen (on back)

### 3. **RegisterScreen** (`src/screens/RegisterScreen.tsx`)

**Purpose:** Collect phone number and name for registration

**Key Flow:**
```typescript
// User enters phone & name
const handleRegister = async () => {
  const result = await authService.register(phone, name);
  // Navigate to OTP: navigation.navigate('OTP', { phone, name });
}
```

**Dependencies:**
- `authService.register(phone, name)` - Send OTP for registration

**Navigation to:**
- OTPScreen (on success)

## Service Layer

### **authService** (`src/services/authService.ts`)

The main interface between UI and Firebase.

**Public Methods:**

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `sendOTP` | `phone: string` | `AuthResponse` | Send OTP to phone number |
| `verifyOTP` | `otp: string` | `AuthResponse` | Verify OTP and authenticate user |
| `login` | `phone: string` | `AuthResponse` | Send OTP for login |
| `register` | `phone: string, name?: string` | `AuthResponse` | Send OTP for registration |
| `getCurrentUser` | - | `AuthUser \| null` | Get current authenticated user |
| `getCurrentUserToken` | - | `string \| null` | Get user's ID token |
| `logout` | - | `AuthResponse` | Sign out current user |
| `deleteAccount` | - | `AuthResponse` | Delete user account |
| `updateProfile` | `updates: {...}` | `AuthResponse` | Update user profile |
| `resendOTP` | - | `AuthResponse` | Resend OTP for current phone |

**Key Implementation Details:**

1. **Phone Normalization**
   ```typescript
   // Converts any format to +84XXX format
   0912345678 → +84912345678
   84912345678 → +84912345678
   +84912345678 → +84912345678
   ```

2. **Verification ID Management**
   - Stores verification ID returned by Firebase
   - Used for OTP verification
   - Cleared after successful verification

3. **Error Handling**
   - Maps Firebase error codes to user-friendly messages
   - Returns structured `AuthResponse` object
   - All errors include user-friendly messages in Vietnamese

## Redux Integration

### **userSlice** (`src/store/userSlice.ts`)

**State Structure:**
```typescript
interface UserState {
  currentUser: User | null;
  wallet: Wallet | null;
  phoenixKey: PhoenixKey | null;
  isLoading: boolean;
  error: string | null;
}
```

**Key Actions:**
- `loginUser(userData)` - Initialize user on successful login
- `logoutUser()` - Clear user data on logout
- `loadWallet(userId)` - Load wallet data
- `saveWallet(wallet)` - Save wallet data

**Usage in Auth Flow:**
```typescript
// After Firebase verification succeeds
const result = await authService.verifyOTP(otp);
if (result.success && result.user) {
  // Store authenticated user in Redux
  await dispatch(loginUser(result.user));
}
```

## Configuration

### **firebase.ts** (`src/config/firebase.ts`)

- Initializes Firebase SDK
- Manages Firebase auth instance
- Provides error code mappings
- Exports utility functions

**Key Exports:**
- `initializeFirebase()` - Initialize Firebase
- `getFirebaseAuth()` - Get auth instance
- `getCurrentUser()` - Get current Firebase user
- `getCurrentUserToken()` - Get ID token
- `signOutUser()` - Sign out
- `getFirebaseErrorMessage()` - Map error codes to messages

## Database Manager Integration

### **databaseManager** (`src/services/databaseManager.ts`)

Called during login to initialize SQLite database per user:

```typescript
// In loginUser Redux action
await databaseManager.initializeForUser(userData.phone);
```

This ensures each user has isolated database storage.

## Error Handling

### Error Response Format

All service methods return:
```typescript
interface AuthResponse {
  success: boolean;
  message: string;      // User-friendly message (Vietnamese)
  user?: AuthUser;      // On successful authentication
  verificationId?: string; // For OTP verification
}
```

### Error Flow

```
Firebase Error
    ↓
Firebase Error Code (e.g., "auth/invalid-verification-code")
    ↓
getFirebaseErrorMessage() Maps to Vietnamese
    ↓
AuthResponse with message
    ↓
UI displays Alert with user-friendly message
```

## Security Considerations

1. **Verification ID Stored in Memory**
   - Cleared after successful verification
   - Not persisted to disk
   - Volatile (lost on app restart)

2. **Token Management**
   - Firebase automatically refreshes tokens
   - Tokens stored in Firebase session
   - Cleared on sign out

3. **Phone Number Validation**
   - Validated on frontend
   - Should also validate on backend
   - Firebase validates during verification

4. **OTP Expiration**
   - Firebase default: 10 minutes
   - Configured in Firebase Console
   - Automatic session expiration

## Testing

### Manual Testing Checklist

```
[ ] Login Flow
    [ ] Enter valid phone number
    [ ] Verify OTP received
    [ ] Enter OTP code
    [ ] Navigate to Main App
    
[ ] Registration Flow
    [ ] Enter phone and name
    [ ] Verify OTP received
    [ ] Enter OTP code
    [ ] User created in Firebase
    
[ ] Error Handling
    [ ] Invalid phone format → Error message
    [ ] Invalid OTP → Error message
    [ ] Network error → Error message
    [ ] Timeout → Error message
    
[ ] Resend OTP
    [ ] Click resend button
    [ ] Wait for timer countdown
    [ ] New OTP received
    
[ ] Logout
    [ ] User logged out
    [ ] Navigated to Login screen
    [ ] Firebase session cleared
```

### Firebase Console Testing

1. Enable test phone numbers in Firebase Console
2. Use test OTP codes provided by Firebase
3. Monitor authentication logs in real-time

## Performance Optimization

1. **Lazy Loading**
   - Firebase SDK loaded only when needed
   - Auth state listening optional

2. **Token Caching**
   - Firebase automatically caches valid tokens
   - Reduces API calls

3. **Error Recovery**
   - Users can resend OTP
   - Automatic session management
   - No manual token refresh needed

## Production Deployment Checklist

- [ ] Firebase project created and configured
- [ ] Phone authentication enabled in Firebase
- [ ] Environment variables set (.env file)
- [ ] Firebase dependencies installed
- [ ] All screens tested
- [ ] Error messages reviewed
- [ ] Security rules configured
- [ ] Rate limiting enabled
- [ ] Monitoring set up in Firebase Console
- [ ] Phone number format validated
- [ ] OTP expiration tested
- [ ] Network error handling tested
- [ ] Logout functionality tested
- [ ] Redux integration verified
- [ ] Database initialization tested

## Monitoring & Debugging

### Firebase Console Analytics

1. Go to Authentication dashboard
2. Monitor:
   - New user sign-ups
   - Failed authentication attempts
   - Geographic distribution
   - Device information

### Debugging Tips

```typescript
// Enable detailed logging
console.log('[Firebase] Event')  // Used throughout code

// Check current user
const user = await authService.getCurrentUser();
console.log('Current user:', user);

// Check Firebase session
import auth from '@react-native-firebase/auth';
console.log('Firebase user:', auth().currentUser);
```

## Troubleshooting Guide

See [FIREBASE_SETUP_GUIDE.md](./FIREBASE_SETUP_GUIDE.md) for detailed troubleshooting.

## API Reference

For complete API documentation, see:
- [React Native Firebase Auth](https://rnfirebase.io/auth/usage)
- [Firebase Phone Authentication](https://firebase.google.com/docs/auth/web/phone-auth)

## Next Steps

1. Create `.env` file with Firebase credentials
2. Run `npm install` to install Firebase packages
3. Test login flow on Android/iOS
4. Configure Firebase Security Rules
5. Set up monitoring in Firebase Console
6. Deploy to production when ready
