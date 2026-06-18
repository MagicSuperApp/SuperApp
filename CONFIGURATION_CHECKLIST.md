# Firebase Configuration Checklist

Use this checklist to ensure everything is properly configured before running the app.

---

## ✅ Pre-Setup Requirements

### Firebase Account
- [ ] Have a Google account
- [ ] Access to Firebase Console (console.firebase.google.com)

### Development Environment
- [ ] Node.js >= 22.11.0 installed
- [ ] npm or yarn installed
- [ ] Android Studio (for Android) or Xcode (for iOS)

---

## ✅ Firebase Project Setup

### Create Firebase Project
- [ ] Go to https://console.firebase.google.com/
- [ ] Click "Create a project"
- [ ] Enter project name
- [ ] Complete project setup
- [ ] Wait for project to create

### Enable Phone Authentication
- [ ] In Firebase Console, go to **Authentication**
- [ ] Click **Sign-in method** tab
- [ ] Click **Phone**
- [ ] Toggle "Enable"
- [ ] Save changes

### Get Firebase Credentials
- [ ] Go to **Project Settings** (gear icon)
- [ ] Select your app from the list
- [ ] Copy the following:
  - [ ] API Key (under Config)
  - [ ] Project ID (under General)
  - [ ] Messaging Sender ID (under General)
  - [ ] App ID (under General)

---

## ✅ Local Setup

### Verify Firebase Configuration
- [ ] `google-services.json` exists in `android/app/`
- [ ] File is valid JSON (not corrupted)
- [ ] Contains Firebase project configuration

### Install Dependencies
```bash
npm install
```
- [ ] `npm install` completed successfully
- [ ] No error messages
- [ ] `node_modules` directory created

---

## ✅ Firebase Console - Optional Testing Setup

### Add Test Phone Numbers (Optional)
If you want to test with predefined OTPs:

1. In Firebase Console → Authentication → Phone
2. Scroll to "Phone numbers for testing"
3. Add test phone number:
   - [ ] Phone number: `+84912345678`
   - [ ] OTP code: `123456`
4. Save

---

## ✅ Android Setup (for Android Devices)

### Prerequisites
- [ ] Android Studio installed
- [ ] Android SDK configured
- [ ] Virtual device or physical device ready

### Run on Android
```bash
npm run android
```

- [ ] App installed successfully
- [ ] No build errors
- [ ] App launches

### Test Phone Authentication
1. [ ] LoginScreen appears
2. [ ] Enter phone number: `0912345678`
3. [ ] Click "Đăng nhập"
4. [ ] OTP code sent (check SMS)
5. [ ] Navigate to OTPScreen
6. [ ] Enter 6-digit OTP
7. [ ] Login successful ✓

---

## ✅ iOS Setup (for iOS Devices)

### Prerequisites
- [ ] Xcode installed
- [ ] CocoaPods installed (`sudo gem install cocoapods`)
- [ ] iPhone simulator or physical device

### Install iOS Dependencies
```bash
cd aladin_mobile_fe/ios
pod install
cd ..
```

- [ ] Podfile updated successfully
- [ ] No error messages
- [ ] Pod installation complete

### Run on iOS
```bash
npm run ios
```

- [ ] App installed successfully
- [ ] No build errors
- [ ] App launches

### Test Phone Authentication
1. [ ] LoginScreen appears
2. [ ] Enter phone number: `0912345678`
3. [ ] Click "Đăng nhập"
4. [ ] OTP code sent (check SMS)
5. [ ] Navigate to OTPScreen
6. [ ] Enter 6-digit OTP
7. [ ] Login successful ✓

---

## ✅ Troubleshooting Checklist

### App Won't Start
- [ ] `.env` file exists and has all values
- [ ] `npm install` was run
- [ ] No typos in environment variables
- [ ] Try: `npm run android --reset-cache`

### OTP Not Received
- [ ] Internet connection working
- [ ] Phone number format correct (0912345678)
- [ ] `google-services.json` is valid and contains correct project
- [ ] Phone auth enabled in Firebase Console
- [ ] Try: Resend OTP button

### Invalid OTP Error
- [ ] Entered exactly 6 digits
- [ ] OTP not expired (Firebase: 10 min default)
- [ ] Using correct OTP code from SMS
- [ ] Using Firebase test codes if testing with test phone

### Build Errors
- [ ] `node_modules/` deleted and reinstalled
- [ ] `google-services.json` exists and is valid
- [ ] Node.js version >= 22.11.0
- [ ] Firebase packages installed correctly

### Firebase "Operation not allowed"
- [ ] Phone authentication enabled in Firebase
- [ ] Sign-in method page shows "Phone: on"
- [ ] Correct project selected in Firebase Console

---

## ✅ Security Checklist

- [ ] `google-services.json` NOT committed to git (should be in .gitignore)
- [ ] Firebase credentials kept private
- [ ] No credentials hardcoded in source files
- [ ] Using Firebase security rules (if using database)

---

## ✅ Testing Checklist

### Basic Functionality
- [ ] Login with new phone number works
- [ ] OTP verification works
- [ ] Redirect to main app on success
- [ ] Error messages display properly

### Error Handling
- [ ] Invalid phone number rejected
- [ ] Invalid OTP rejected
- [ ] Network error handled
- [ ] OTP expiration handled

### Features
- [ ] Resend OTP works
- [ ] Auto-focus between OTP digits
- [ ] Back button works
- [ ] Navigation between screens works

### User Data
- [ ] User data stored in Redux
- [ ] User data persists after reload
- [ ] Logout clears user data
- [ ] Can login again after logout

---

## ✅ Documentation Review

Before deploying, review:

- [ ] Read `FIREBASE_QUICK_START.md`
- [ ] Read `FIREBASE_SETUP_GUIDE.md`
- [ ] Read `FIREBASE_INTEGRATION_GUIDE.md`
- [ ] Understand authentication flow
- [ ] Know the error messages

---

## ✅ Ready for Testing

When all items above are checked ✓:

1. Run the app: `npm run android` or `npm run ios`
2. Test login flow
3. Test registration flow
4. Test error cases
5. Monitor Firebase Console for events

---

## ✅ Production Checklist

Before deploying to production:

### Firebase Configuration
- [ ] Production Firebase project created
- [ ] Phone authentication enabled
- [ ] Rate limiting configured
- [ ] Security rules configured
- [ ] Monitoring enabled

### App Configuration
- [ ] Production `.env` configured
- [ ] API endpoints updated
- [ ] Error messages reviewed
- [ ] Logging in production mode
- [ ] Testing completed

### Deployment
- [ ] App signed (Android)
- [ ] Certificates valid (iOS)
- [ ] Version number updated
- [ ] Testing on real devices
- [ ] Firebase Console monitoring set up

### Post-Deployment
- [ ] Monitor authentication metrics
- [ ] Check for error patterns
- [ ] Monitor user feedback
- [ ] Keep Firebase SDK updated
- [ ] Regular security audits

---

## ✅ Support Resources

If you get stuck:

1. Check troubleshooting section above
2. Review the documentation files
3. Check Firebase Console logs
4. Review error messages in-app
5. Check React Native Firebase docs (rnfirebase.io)

---

## 📝 Notes

**Keep track of:**
- [ ] Firebase Project ID: `_____________`
- [ ] Your phone number for testing: `_____________`
- [ ] Any issues encountered: `_____________`

---

**Status:** Ready to configure ✅

Go to [FIREBASE_QUICK_START.md](./FIREBASE_QUICK_START.md) to get started!
