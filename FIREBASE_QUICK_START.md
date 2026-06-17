# Firebase OTP Authentication - Quick Start

## 5-Minute Setup

### 1. Verify Firebase Configuration (5 min)

Firebase is already configured through `google-services.json` file. No additional setup needed!

**Check if google-services.json exists:**
```bash
ls android/app/google-services.json
```
If the file exists, you're ready to go!

### 2. Install Dependencies

```bash
cd aladin_mobile_fe
npm install
# or
yarn install
```

### 3. Run the App

```bash
# Android
npm run android

# iOS
npm run ios
```

## Testing the Flow

### Test Login/Register

1. **LoginScreen**: Enter phone number (e.g., `0912345678`)
2. Press "Đăng nhập"
3. **OTPScreen**: Enter 6-digit OTP code
4. Done! ✓

### Test with Firebase Console

1. In Firebase Console → Authentication → Phone
2. Add test phone: `+84912345678`
3. Add test OTP: `123456`
4. Use these in the app for testing

## File Structure

```
aladin_mobile_fe/
├── android/app/
│   └── google-services.json          ← Firebase config (already exists!)
├── src/
│   ├── config/
│   │   └── firebase.ts               ← Firebase init (updated)
│   ├── services/
│   │   └── authService.ts            ← Main auth logic
│   ├── screens/
│   │   ├── LoginScreen.tsx           ← Login
│   │   ├── OTPScreen.tsx             ← OTP verification
│   │   └── RegisterScreen.tsx        ← Register
│   └── store/
│       └── userSlice.ts              ← Redux state
├── package.json                      ← Updated with Firebase
├── FIREBASE_SETUP_GUIDE.md           ← Detailed setup guide
└── FIREBASE_INTEGRATION_GUIDE.md     ← Architecture & integration
```

## Key Files to Review

1. **src/config/firebase.ts** - Firebase initialization
2. **src/services/authService.ts** - Authentication logic
3. **src/screens/OTPScreen.tsx** - OTP verification UI
4. **FIREBASE_SETUP_GUIDE.md** - Full setup instructions
5. **FIREBASE_INTEGRATION_GUIDE.md** - Architecture details

## Common Commands

```bash
# Install dependencies
npm install

# Run Android
npm run android

# Run iOS
npm run ios

# Start Metro bundler
npm start

# Run tests
npm test
```

## Troubleshooting

### "OTP not received"
✓ Check internet connection  
✓ Check Firebase Console phone auth is enabled  
✓ Verify google-services.json is valid  

### "Invalid OTP"
✓ Ensure exactly 6 digits  
✓ Check Firebase test phone numbers  

### "Build failed"
✓ Run `npm install` again  
✓ Clear cache: `npm run android --reset-cache`  

## Next Steps

1. ✅ Verify google-services.json exists
2. ✅ Run `npm install`
3. ✅ Test login flow
4. → Read [FIREBASE_SETUP_GUIDE.md](./FIREBASE_SETUP_GUIDE.md)
5. → Read [FIREBASE_INTEGRATION_GUIDE.md](./FIREBASE_INTEGRATION_GUIDE.md)
6. → Deploy to production

## Support

- Check [FIREBASE_SETUP_GUIDE.md](./FIREBASE_SETUP_GUIDE.md) troubleshooting section
- Review Firebase Console logs
- Check [React Native Firebase docs](https://rnfirebase.io/auth/usage)

## Changes Made

✅ Added Firebase packages to package.json  
✅ Updated firebase.ts to use google-services.json  
✅ Updated authService.ts with Firebase implementation  
✅ Updated OTPScreen to use Firebase  
✅ Comprehensive documentation  

Everything is ready to use!
