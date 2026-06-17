// Documentation: SQLite Multi-User Database Architecture
// ========================================================

/**
 * ARCHITECTURE OVERVIEW
 * 
 * The application implements a per-user SQLite database system to ensure data
 * isolation and security in multi-user environments.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. DATABASE NAMING CONVENTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Database files are named: OriLife-<phoneNumber>.db
 * 
 * Example:
 * - User with phone "0901234567" → OriLife-0901234567.db
 * - User with phone "0987654321" → OriLife-0987654321.db
 * 
 * Benefits:
 * - Unique database per phone number
 * - No data mixing between users on same device
 * - Easy to identify which user owns which database
 * - Can easily delete user data by removing their database file
 */

// ─────────────────────────────────────────────────────────────────────────────
// 2. DATA FLOW ARCHITECTURE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LIFECYCLE FLOW:
 * 
 * App Start
 *   ↓
 * Navigation Setup (sync service started)
 *   ↓
 * User opens app → Welcome/Login Screen
 *   ↓
 * User inputs phone number & clicks "Đăng nhập"
 *   ↓
 * LoginScreen.handleLogin() called
 *   ↓
 * dispatch(loginUser(mockUser)) ← Redux Async Thunk
 *   ↓
 * loginUser Thunk:
 *   1. Call databaseManager.initializeForUser(phoneNumber)
 *      ↓
 *      → databaseManager.switchUser() checks for existing DB
 *      → database.init(phoneNumber) creates/opens OriLife-<phone>.db
 *      → createTables() initializes schema (only if new DB)
 *      
 *   2. Load wallet from database
 *      ↓
 *      → database.getWallet(userId) queries wallet table
 *      
 *   3. Load phoenixKey from database
 *      ↓
 *      → database.getPhoenixKey(userId) queries phoenix_key table
 *      
 *   4. Return user + wallet + phoenixKey
 *   ↓
 * Redux store updated with user data
 *   ↓
 * Navigate to Main tabbed interface
 *   ↓
 * All screens can now safely access database for that user
 */

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPONENT INTERACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DATABASE (utils/database.ts)
 * ├─ init(phoneNumber)           : Initialize DB for specific user
 * ├─ getCurrentUserId()           : Get currently active user
 * ├─ isInitialized()             : Check if DB ready
 *└─ Operations with user context : All ops ensure user isolation
 *
 * DATABASEMANAGER (services/databaseManager.ts)
 * ├─ initializeForUser()         : Setup DB for login user
 * ├─ closeDatabase()             : Cleanup on logout
 * ├─ getCurrentUserPhone()        : Get active user phone
 * ├─ isReady()                   : Check if DB ready
 * ├─ ensureReady()               : Validation for operations
 * └─ switchUser()                : Logout old user, login new user
 *
 * REDUX SLICES (store/userSlice.ts, store/farmSlice.ts)
 * ├─ loginUser                   : Thunk that calls databaseManager.initializeForUser()
 * ├─ logoutUser                  : Thunk that calls databaseManager.closeDatabase()
 * ├─ loadFarms/Trees/Fruits      : Thunks with databaseManager.ensureReady() validation
 * └─ saveFarm/Tree/Fruit         : Thunks with databaseManager.ensureReady() validation
 */

// ─────────────────────────────────────────────────────────────────────────────
// 4. ERROR HANDLING & VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MULTI-LAYER VALIDATION:
 * 
 * Layer 1: DatabaseManager.ensureReady(operationName)
 * ├─ Check: database.isInitialized() === true
 * ├─ Check: currentUserPhone !== null
 * └─ Throw: "[DatabaseManager] Operation failed: Database not initialized"
 *
 * Layer 2: Database operation checks
 * ├─ Check: this.db !== null
 * ├─ Include: currentUserId in error message
 * └─ Example: "[Database] DB not initialized for user: 0901234567"
 *
 * Layer 3: User context validation
 * ├─ getFarms(userId) logs warning if userId !== currentUserId
 * └─ Prevents accidental loading of wrong user's data
 *
 * EXAMPLE ERROR FLOW:
 * 
 * Screen tries to load farms WITHOUT logging in:
 *   ↓
 * Redux dispatch(loadFarms(userId))
 *   ↓
 * Thunk calls: databaseManager.ensureReady('loadFarms')
 *   ↓
 * Error: "[DatabaseManager] loadFarms failed: Database not initialized 
 *         or no user context. Current user: null, DB initialized: false"
 *   ↓
 * Thunk rejected, user stays on login screen
 */

// ─────────────────────────────────────────────────────────────────────────────
// 5. LOGIN/LOGOUT FLOW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LOGIN FLOW:
 * 
 * 1. User enters phone "0901234567"
 * 2. Click "Đăng nhập"
 * 3. dispatch(loginUser(mockUser)) where mockUser.phone = "0901234567"
 * 4. loginUser thunk runs:
 *    a. databaseManager.initializeForUser("0901234567")
 *       - Check if already same user?
 *       - If different user: await database.close() (cleanup old DB)
 *       - database.init("0901234567") 
 *         → SQLite opens/creates: OriLife-0901234567.db
 *         → createTables() runs (safe, uses CREATE TABLE IF NOT EXISTS)
 *       - databaseManager.currentUserPhone = "0901234567"
 *    
 *    b. Load wallet: database.getWallet(userId)
 *    c. Load phoenixKey: database.getPhoenixKey(userId)
 *    d. Return { user, wallet, phoenixKey }
 * 
 * 5. Redux state updated
 * 6. Navigation.navigate('Main')
 * 7. User is fully logged in, database ready for all operations
 *
 * LOGOUT FLOW:
 * 
 * 1. User clicks "Logout"
 * 2. dispatch(logoutUser())
 * 3. logoutUser thunk runs:
 *    a. databaseManager.closeDatabase()
 *       - Save current user for logging: "0901234567"
 *       - database.close() → SQLite closes connection
 *       - databaseManager.currentUserPhone = null
 *       - Log: "[DatabaseManager] Database closed for user: 0901234567"
 * 
 * 4. Redux state cleared:
 *    - currentUser = null
 *    - wallet = null
 *    - phoenixKey = null
 * 
 * 5. Navigation to Login screen
 * 
 * MULTI-USER SCENARIO:
 * 
 * Sequence: User A → User B → User A
 * 
 * User A logs in:
 *   → OriLife-0901111111.db created and opened
 *   → databaseManager.currentUserPhone = "0901111111"
 *   → Performs operations (farms, trees, etc.)
 * 
 * User A logs out, User B logs in:
 *   → databaseManager.initializeForUser("0902222222")
 *   → Detects: currentUserPhone "0901111111" !== "0902222222"
 *   → Calls database.close() on User A's DB
 *   → Opens OriLife-0902222222.db for User B
 *   → User B's data loaded from their DB
 * 
 * User B logs out, User A logs in again:
 *   → databaseManager.initializeForUser("0901111111")
 *   → Closes User B's DB
 *   → Opens OriLife-0901111111.db (same file as before!)
 *   → User A sees their previous data (farms, trees, etc.)
 *   → All user A's data is preserved across sessions
 */

// ─────────────────────────────────────────────────────────────────────────────
// 6. OPERATION SECURITY & ISOLATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OPERATION EXAMPLE: Save Farm for User A
 * 
 * Screen: FarmDetailScreen (User A logged in)
 * User creates new farm and clicks "Save"
 * 
 * Flow:
 * 1. dispatch(saveFarm(farmData))
 *    └─ Redux thunk receives: { id, name, coordinates, userId: "user_0901111111" }
 * 
 * 2. saveFarm thunk executes:
 *    a. databaseManager.ensureReady('saveFarm')
 *       └─ Validates: 
 *          - database.db !== null (OriLife-0901111111.db is open)
 *          - databaseManager.currentUserPhone === "0901111111"
 *          - If validation fails → throw error, operation cancelled
 * 
 *    b. database.saveFarm(farmData)
 *       └─ Executes: INSERT OR REPLACE INTO farms 
 *          WHERE user_id = farmData.userId = "user_0901111111"
 *          INTO: OriLife-0901111111.db (correct DB for this user)
 * 
 * 3. Redux state updated with new farm
 * 
 * SECURITY GUARANTEE:
 * ✓ farmData physically stored in User A's DB only
 * ✓ User B (different phone) has separate DB, cannot access
 * ✓ Even if User B tries to pass User A's userId:
 *   └─ saveFarm(farmDataWithUserAId) 
 *      While logged in as User B
 *      → ensureReady checks currentUserPhone === User B's phone
 *      → Database is User B's DB
 *      → Data goes to User B's DB regardless of userId in data
 *      → Data is isolated, secure
 */

// ─────────────────────────────────────────────────────────────────────────────
// 7. DATABASE FILE LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ANDROID:
 * /data/data/com.orilife/databases/
 * ├─ OriLife-0901111111.db
 * ├─ OriLife-0902222222.db
 * └─ OriLife-0903333333.db
 * 
 * iOS:
 * /var/mobile/Containers/Data/Application/<APP-ID>/Documents/
 * ├─ OriLife-0901111111.db
 * ├─ OriLife-0902222222.db
 * └─ OriLife-0903333333.db
 */

// ─────────────────────────────────────────────────────────────────────────────
// 8. DATA RECOVERY & DEBUGGING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DEBUG: Check current database status
 * 
 * In Redux middleware or after user login:
 * 
 * console.log('Current user phone:', databaseManager.getCurrentUserPhone());
 * console.log('Database ready:', databaseManager.isReady());
 * console.log('Database user ID:', database.getCurrentUserId());
 * 
 * DEBUG: Verify data isolation
 * 
 * User A logs in:
 * → Load farms → Shows only User A's farms ✓
 * 
 * User B logs in:
 * → Load farms → Shows only User B's farms ✓
 * 
 * User A logs in again:
 * → Load farms → Shows User A's farms again (data preserved) ✓
 * 
 * DATA RECOVERY:
 * 
 * If User A accidentally deletes data:
 * ✓ Sync queue stores pending transactions
 * ✓ When backend is ready, can restore from blockchain
 * 
 * If User A's DB file corrupted:
 * → Delete OriLife-0901111111.db
 * → User logs in again
 * → Fresh DB created, user can re-enter data or restore from backup
 */

export default {};
