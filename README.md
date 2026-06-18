# OriLife - Ứng dụng Quản lý Nông nghiệp Sầu Riêng

OriLife là ứng dụng di động React Native dành cho nông dân Việt Nam, giúp định danh và truy xuất nguồn gốc sầu riêng thông qua công nghệ blockchain. Ứng dụng hỗ trợ hoạt động hoàn toàn offline với đồng bộ dữ liệu tự động khi có kết nối mạng.

## 🌟 Tính năng chính

- **📱 Đăng nhập**: Xác thực bằng số điện thoại với tích hợp PhoenixKey
- **🏡 Quản lý trang trại**: Thêm và quản lý các nông trại với định vị GPS
- **🌳 Quản lý cây trồng**: Định danh cây sầu riêng với mã QR và hình ảnh
- **🍈 Quản lý quả**: Theo dõi quá trình phát triển và thu hoạch quả
- **📋 Nhật ký hoạt động**: Ghi nhận tưới nước, bón phân, phun thuốc, thu hoạch
- **💰 Ví điện tử**: Quản lý tiền MAGIC, LAMP, ADA cho giao dịch blockchain
- **🔄 Đồng bộ offline-first**: Hoạt động không cần mạng, tự động đồng bộ khi online
- **⛓️ Blockchain integration**: Tích hợp với LampNet cho truy xuất nguồn gốc

## 🏗️ Kiến trúc và Công nghệ

### Frontend
- **React Native**: Framework di động cross-platform
- **TypeScript**: Type safety và developer experience
- **Redux Toolkit**: State management với async thunks
- **React Navigation**: Navigation và routing

### Database & Storage
- **SQLite**: Cơ sở dữ liệu local với react-native-sqlite-storage
- **AsyncStorage**: Lưu trữ dữ liệu nhỏ và cache
- **File System**: Lưu trữ hình ảnh và video

### Blockchain Integration
- **PhoenixKey SDK**: Quản lý identity và wallet
- **LampNet**: Blockchain network cho nông nghiệp
- **Sync Queue**: Hệ thống queue cho đồng bộ offline

### Libraries chính
- `react-native-sqlite-storage`: SQLite database
- `@react-native-async-storage/async-storage`: Local storage
- `react-native-geolocation-service`: GPS positioning
- `react-native-vector-icons`: Icons
- `react-native-permissions`: Permissions handling

## 🔄 Flow Hoạt động

### 1. Khởi động ứng dụng
```
App Start → Database Init → Sync Service Start → Welcome Screen
```

### 2. Đăng nhập & Xác thực
```
Welcome → Login (Phone) → OTP Verification → PhoenixKey Setup → Dashboard
```

### 3. Quản lý Trang trại
```
Dashboard → Farm List → Add Farm (GPS Recording) → Farm Detail → Tree Management
```

### 4. Quản lý Cây trồng
```
Farm Detail → Add Tree (QR Scan) → Tree Detail → Fruit Management → Activity Logging
```

### 5. Đồng bộ Dữ liệu
```
Local Database ↔ Sync Queue ↔ Blockchain Network (LampNet)
```

### Chi tiết Flow:

#### **Offline-First Operations**
- Tất cả thao tác CRUD được thực hiện trên SQLite local
- Dữ liệu được thêm vào sync queue ngay lập tức
- Sync service chạy background để đồng bộ khi có mạng

#### **Farm Management Flow**
```
1. User tạo farm mới
2. Ghi GPS coordinates dọc ranh giới
3. Lưu farm vào database
4. Thêm vào sync queue cho blockchain
5. Hiển thị farm trong danh sách
```

#### **Tree & Fruit Management Flow**
```
1. Scan QR code hoặc chụp ảnh cây
2. AI xử lý hình ảnh → Tạo tree record
3. Lưu tree vào database + sync queue
4. Theo dõi fruits trên tree
5. Ghi nhận activities (watering, fertilizing, etc.)
```

#### **Activity Logging Flow**
```
1. Chọn loại activity (tưới, bón phân, phun thuốc, thu hoạch)
2. Scan/camera capture evidence
3. Lưu activity vào database
4. Tính toán credits used
5. Thêm vào sync queue
```

#### **Sync Process**
```
Background Service (30s interval):
├── Check network connectivity
├── Get pending items from sync queue
├── Send to blockchain API
├── Update sync status
└── Handle errors & retry logic
```

## 🚀 Cài đặt và Chạy

### Yêu cầu hệ thống
- Node.js >= 16
- npm hoặc yarn
- React Native CLI
- Android Studio (cho Android)
- Xcode (cho iOS)

### Cài đặt dependencies

```bash
# Clone repository
git clone <repository-url>
cd aladin_mobile_fe

# Install dependencies
npm install

# iOS only: Install CocoaPods
cd ios && bundle exec pod install && cd ..
```

### Chạy ứng dụng

```bash
# Start Metro bundler
npm start

# Android
npm run android

# iOS
npm run ios
```

### Build production

```bash
# Android APK
cd android && ./gradlew assembleRelease

# iOS (trên macOS)
cd ios && xcodebuild -workspace Aladin.xcworkspace -scheme Aladin -configuration Release
```

## 📁 Cấu trúc dự án

```
src/
├── components/          # Reusable UI components
├── constants/           # App constants và config
├── navigation/          # Navigation setup
├── screens/            # Screen components
│   ├── LoginScreen.tsx
│   ├── FarmListScreen.tsx
│   ├── FarmDetailScreen.tsx
│   ├── TreeDetailScreen.tsx
│   └── ActivityScreen.tsx
├── services/           # External services
│   ├── syncService.ts
│   └── api.ts
├── store/              # Redux store
│   ├── farmSlice.ts
│   ├── userSlice.ts
│   └── syncSlice.ts
├── types/              # TypeScript type definitions
├── utils/              # Utilities
│   └── database.ts     # SQLite database manager
└── sdk/                # Third-party SDKs
```

## 🗄️ Database Schema

### Sync Queue Table
```sql
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE,
  payload TEXT,
  media_paths TEXT,
  status TEXT DEFAULT 'pending',
  error_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Farms Table
```sql
CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  coordinates TEXT,
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Trees Table
```sql
CREATE TABLE trees (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL,
  code TEXT UNIQUE,
  latitude REAL,
  longitude REAL,
  species TEXT,
  planted_year INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farm_id) REFERENCES farms (id) ON DELETE CASCADE
);
```

### Fruits Table
```sql
CREATE TABLE fruits (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL,
  code TEXT UNIQUE,
  age INTEGER,
  status TEXT DEFAULT 'growing',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tree_id) REFERENCES trees (id) ON DELETE CASCADE
);
```

### Activities Table
```sql
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  farm_id TEXT NOT NULL,
  tree_id TEXT,
  fruit_id TEXT,
  materials TEXT,
  thumbnail_path TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  credits_used INTEGER DEFAULT 0,
  FOREIGN KEY (farm_id) REFERENCES farms (id) ON DELETE CASCADE,
  FOREIGN KEY (tree_id) REFERENCES trees (id) ON DELETE CASCADE,
  FOREIGN KEY (fruit_id) REFERENCES fruits (id) ON DELETE CASCADE
);
```

### Wallet Table
```sql
CREATE TABLE wallet (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  magic_balance REAL DEFAULT 0,
  lamp_balance REAL DEFAULT 0,
  ada_balance REAL DEFAULT 0,
  last_synced DATETIME,
  pending_credits REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### PhoenixKey Table
```sql
CREATE TABLE phoenix_key (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  wallet_address TEXT,
  did TEXT,
  biometric_verified INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 API Endpoints

### Authentication
- `POST /auth/login` - Đăng nhập bằng phone
- `POST /auth/verify-otp` - Xác thực OTP
- `POST /auth/phoenix-key` - Setup PhoenixKey

### Farm Management
- `GET /farms` - Lấy danh sách farms
- `POST /farms` - Tạo farm mới
- `GET /farms/:id/trees` - Lấy trees của farm

### Tree Management
- `POST /trees` - Tạo tree mới
- `GET /trees/:id/fruits` - Lấy fruits của tree

### Sync
- `POST /sync/batch` - Đồng bộ dữ liệu lên blockchain
- `GET /sync/status` - Kiểm tra trạng thái sync

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Tạo Pull Request

### Coding Standards
- Sử dụng TypeScript cho type safety
- Follow React Native best practices
- Viết tests cho components và utilities
- Update documentation khi thay đổi API

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

- Email: support@orilife.vn
- Website: https://orilife.vn
- Documentation: https://docs.orilife.vn

---

**OriLife** - Nông nghiệp 4.0 với Blockchain & AI 🤖🌱⛓️
