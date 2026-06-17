# Firebase Authentication Implementation Guide

## Overview

This project now uses **Firebase Authentication** with **Phone OTP** verification for user identification. The authentication is performed entirely on the frontend using the Firebase SDK.

## Setup Instructions

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a new project"
3. Enter your project name (e.g., "Aladin Mobile")
4. Complete the setup

### 2. Enable Phone Authentication

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click on **Phone** and enable it
3. Configure the phone numbers for testing (optional):
   - Add test phone numbers and verify OTP codes for testing

### 3. Get Firebase Configuration

1. In Firebase Console, go to **Project Settings**
2. Under "General" tab, find your apps
3. Click on your app or create a new Android/iOS app
4. Copy the configuration values:
   - API Key
   - Project ID
   - Messaging Sender ID
   - App ID
   - Auth Domain (optional)

### 4. Configure Environment Variables

1. Create a `.env` file in the `aladin_mobile_fe` directory
2. Copy from `.env.template`
3. Fill in your Firebase credentials:

```env
FIREBASE_API_KEY=AIzaSyD...
FIREBASE_PROJECT_ID=aladin-mobile-abc123
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:android:abc123def456
```

### 5. Install Dependencies

```bash
cd aladin_mobile_fe
npm install
# or
yarn install
```

### 6. Android Setup

For Android, no additional configuration is needed. Firebase automatically handles phone authentication.

**For Firebase Console testing (optional):**
1. Go to Firebase Console → Authentication → Phone
2. Enable phone number sign-in
3. Add test phone numbers:
   - Phone: +84912345678
   - Verification Code: 123456

### 7. iOS Setup

For iOS, add the following to your `Podfile`:

```ruby
pod 'Firebase/Auth'
```

Then run:
```bash
cd ios
pod install
cd ..
```

## Features

### Phone Number Validation
- Supports Vietnamese phone numbers
- Formats: `0912345678`, `84912345678`, `+84912345678`
- Automatically normalizes to international format (+84)

### OTP Verification
- 6-digit OTP code
- Sent via SMS by Firebase
- Auto-fill support (extracts OTP from SMS on Android)
- Resend functionality with rate limiting

### User Management
- Automatic user creation on first login
- Secure token management
- User profile updates
- Account deletion support

## Usage

### 1. Send OTP (Login/Register Screen)

```typescript
import { authService } from '../services/authService';

const result = await authService.sendOTP('0912345678');
if (result.success) {
  // Navigate to OTP verification screen
  navigation.navigate('OTP', { phone: '0912345678' });
} else {
  // Show error message
  Alert.alert('Error', result.message);
}
```

### 2. Verify OTP (OTP Screen)

```typescript
const result = await authService.verifyOTP('123456');
if (result.success && result.user) {
  // User logged in successfully
  // result.user contains: id, uid, phone, name, email, etc.
  await dispatch(loginUser(result.user));
  // Navigate to main screen
}
```

### 3. Get Current User

```typescript
const user = await authService.getCurrentUser();
if (user) {
  console.log('User phone:', user.phone);
  console.log('User ID:', user.uid);
}
```

### 4. Get User Token

```typescript
const token = await authService.getCurrentUserToken();
// Use token for API requests
```

### 5. Logout

```typescript
const result = await authService.logout();
if (result.success) {
  // Navigate to login screen
}
```

## File Structure

```
src/
├── config/
│   └── firebase.ts           # Firebase configuration and initialization
├── services/
│   └── authService.ts        # Authentication service with Firebase
├── screens/
│   ├── LoginScreen.tsx      # Phone login screen
│   ├── OTPScreen.tsx        # OTP verification screen
│   └── RegisterScreen.tsx   # User registration screen
├── store/
│   └── userSlice.ts         # Redux user state management
└── types/
    └── index.ts             # TypeScript types
```

## Error Handling

The service provides user-friendly error messages:

| Firebase Error Code | Message |
|---|---|
| `auth/invalid-phone-number` | Số điện thoại không hợp lệ |
| `auth/invalid-verification-code` | Mã OTP không đúng |
| `auth/code-expired` | Mã OTP đã hết hạn |
| `auth/quota-exceeded` | Đã vượt quá giới hạn gửi mã OTP |
| `auth/too-many-requests` | Quá nhiều lần thử. Vui lòng thử lại sau. |
| `auth/network-request-failed` | Lỗi kết nối mạng |

## Security Best Practices

1. **Never expose API keys** in public repositories
2. **Use environment variables** for all sensitive configuration
3. **Enable Firebase Security Rules** for your database
4. **Set up rate limiting** to prevent abuse
5. **Monitor authentication logs** in Firebase Console
6. **Use HTTPS** for all API communications
7. **Validate phone numbers** on the backend as well

## Testing

### Test with Firebase Console

1. Go to Firebase Console → Authentication → Phone
2. Add test phone numbers
3. Use test OTP codes with those phone numbers

### Test without Internet

SMS Retriever requires internet. For offline testing:
1. Manually enter OTP codes
2. The screen supports manual entry

### Example Test Cases

```typescript
// Valid phone numbers
const validPhones = [
  '0912345678',
  '84912345678',
  '+84912345678'
];

// Valid OTP (Firebase will generate these)
const validOTP = '123456';
```

## Troubleshooting

### "OTP not received"
- Check internet connection
- Verify phone number format
- Check Firebase Console quota limits
- Check SMS spam folder

### "Invalid verification code"
- Ensure OTP is exactly 6 digits
- Check if OTP has expired (default: 10 minutes)
- Resend OTP if needed

### "Operation not allowed"
- Phone authentication may not be enabled in Firebase Console
- Go to Authentication → Sign-in method → Phone
- Enable phone authentication

### "Network request failed"
- Check internet connection
- Verify Firebase credentials in .env
- Check firewall/proxy settings

## Production Deployment

Before deploying to production:

1. **Update Firebase Rules** in Firebase Console
2. **Enable reCAPTCHA** for phone authentication (optional)
3. **Set rate limiting** to prevent abuse
4. **Monitor usage** in Firebase Console
5. **Test thoroughly** on both Android and iOS
6. **Keep Firebase SDK updated** periodically

## References

- [Firebase Phone Authentication](https://firebase.google.com/docs/auth/web/phone-auth)
- [React Native Firebase](https://rnfirebase.io/)
- [Firebase Security Rules](https://firebase.google.com/docs/database/security)

## Support

For issues or questions:
1. Check Firebase Console for error logs
2. Review this guide
3. Check React Native Firebase documentation
4. Contact support team
