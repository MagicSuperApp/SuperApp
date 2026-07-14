// utils/database.ts

import SQLite from 'react-native-sqlite-storage';

// Enable promise-based API
SQLite.enablePromise(true);

const DB_VERSION = '1.0';

class Database {
  private db: SQLite.SQLiteDatabase | null = null;
  private currentUserId: string | null = null;

  /**
   * Initialize database for a specific user (keyed by DID)
   * Database name will be: OriLife-<didSlug>.db
   */
  async init(userKey: string): Promise<void> {
    try {
      if (this.db && this.currentUserId !== userKey) {
        await this.close();
      }

      if (this.currentUserId === userKey && this.db) {
        console.log(`[Database] Already initialized for: ${userKey}`);
        return;
      }

      const safeKey = userKey.replace(/[^a-zA-Z0-9_-]/g, '_');
      const dbName = `OriLife-${safeKey}.db`;
      console.log(`[Database] Initializing for: ${userKey} (${dbName})`);

      this.db = await SQLite.openDatabase({
        name: dbName,
        location: 'default',
      });

      this.currentUserId = userKey;

      await this.createTables();
      console.log(`[Database] Initialized successfully for: ${userKey}`);
    } catch (error) {
      console.error(`[Database] Initialization failed for ${userKey}:`, error);
      throw error;
    }
  }

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null && this.currentUserId !== null;
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Sync Queue table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE,
        payload TEXT,
        media_paths TEXT,
        status TEXT DEFAULT 'pending',
        error_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Farms table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS farms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        coordinates TEXT,
        user_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Trees table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS trees (
        id TEXT PRIMARY KEY,
        farm_id TEXT NOT NULL,
        code TEXT UNIQUE,
        latitude REAL,
        longitude REAL,
        species TEXT,
        planted_year INTEGER,
        estimated_fruits INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (farm_id) REFERENCES farms (id) ON DELETE CASCADE
      )
    `);

    // Fruits table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS fruits (
        id TEXT PRIMARY KEY,
        tree_id TEXT NOT NULL,
        code TEXT UNIQUE,
        age INTEGER,
        status TEXT DEFAULT 'growing',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tree_id) REFERENCES trees (id) ON DELETE CASCADE
      )
    `);

    // Activities table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS activities (
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
      )
    `);

    // Wallet table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS wallet (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        magic_balance REAL DEFAULT 0,
        lamp_balance REAL DEFAULT 0,
        ada_balance REAL DEFAULT 0,
        last_synced DATETIME,
        pending_credits REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // PhoenixKey table
    await this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS phoenix_key (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        wallet_address TEXT,
        did TEXT,
        biometric_verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

  }

  // Sync Queue operations
  async addToSyncQueue(transactionId: string, payload: string, mediaPaths: string[]): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'INSERT OR REPLACE INTO sync_queue (transaction_id, payload, media_paths, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      [transactionId, payload, JSON.stringify(mediaPaths), 'pending', new Date().toISOString()]
    );
  }

  async getSyncQueue(): Promise<any[]> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    const [results] = await this.db.executeSql('SELECT * FROM sync_queue ORDER BY created_at ASC');
    const queue = [];
    for (let i = 0; i < results.rows.length; i++) {
      const item = results.rows.item(i);
      item.media_paths = JSON.parse(item.media_paths || '[]');
      queue.push(item);
    }
    return queue;
  }

  async updateSyncStatus(transactionId: string, status: string, errorCode?: string): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'UPDATE sync_queue SET status = ?, error_code = ?, updated_at = ? WHERE transaction_id = ?',
      [status, errorCode || null, new Date().toISOString(), transactionId]
    );
  }

  async removeFromSyncQueue(transactionId: string): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql('DELETE FROM sync_queue WHERE transaction_id = ?', [transactionId]);
  }

  // Farm operations
  async saveFarm(farm: any): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);
    if (!this.currentUserId) throw new Error('[Database] User context lost during saveFarm');

    await this.db.executeSql(
      'INSERT OR REPLACE INTO farms (id, name, coordinates, user_id, updated_at) VALUES (?, ?, ?, ?, ?)',
      [farm.id, farm.name, JSON.stringify(farm.coordinates), farm.userId, new Date().toISOString()]
    );
  }

  async getFarm(farmId: string): Promise<any> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);
    if (!this.currentUserId) throw new Error('[Database] User context lost during getFarm');

    const [results] = await this.db.executeSql('SELECT * FROM farms WHERE id = ?', [farmId]);
    if (results.rows.length === 0) {
      throw new Error(`[Database] Farm not found: ${farmId}`);
    }
    const farm = results.rows.item(0);
    farm.coordinates = JSON.parse(farm.coordinates || '[]');
    return farm;
  }

  async getFarms(userId: string): Promise<any[]> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);
    if (userId !== this.currentUserId) {
      console.warn(`[Database] WARNING: Requesting farms for different user! Requested: ${userId}, Current: ${this.currentUserId}`);
    }

    const [results] = await this.db.executeSql(`
      SELECT
        f.*,
        COUNT(DISTINCT t.id) as treeCount,
        COUNT(fr.id) as fruitCount
      FROM farms f
      LEFT JOIN trees t ON f.id = t.farm_id
      LEFT JOIN fruits fr ON t.id = fr.tree_id
      WHERE f.user_id = ?
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `, [userId]);
    const farms = [];
    for (let i = 0; i < results.rows.length; i++) {
      const farm = results.rows.item(i);
      farm.coordinates = JSON.parse(farm.coordinates || '[]');
      farm.treeCount = farm.treeCount || 0;
      farm.fruitCount = farm.fruitCount || 0;
      farms.push(farm);
    }
    return farms;
  }

  async deleteFarm(farmId: string): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql('DELETE FROM farms WHERE id = ?', [farmId]);
  }

  // Tree operations
  async saveTree(tree: any): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'INSERT OR REPLACE INTO trees (id, farm_id, code, latitude, longitude, species, planted_year, estimated_fruits, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [tree.id, tree.farmId, tree.code, tree.latitude, tree.longitude, tree.species, tree.plantedYear, tree.estimatedFruits || 0, new Date().toISOString()]
    );
  }

  async getTrees(farmId: string): Promise<any[]> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    const [results] = await this.db.executeSql(`
      SELECT t.*, COUNT(f.id) as fruitCount
      FROM trees t
      LEFT JOIN fruits f ON t.id = f.tree_id
      WHERE t.farm_id = ?
      GROUP BY t.id
      ORDER BY t.code
    `, [farmId]);
    const trees = [];
    for (let i = 0; i < results.rows.length; i++) {
      const item = results.rows.item(i);
      trees.push({
        id: item.id,
        farmId: item.farm_id,
        code: item.code,
        latitude: item.latitude,
        longitude: item.longitude,
        species: item.species,
        plantedYear: item.planted_year,
        estimatedFruits: item.estimated_fruits || 0,
        fruitCount: item.fruitCount || 0,
        images: [], // Assuming images are not stored in DB or handle separately
      });
    }
    return trees;
  }

  async deleteTree(treeId: string): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql('DELETE FROM trees WHERE id = ?', [treeId]);
  }

  // Fruit operations
  async saveFruit(fruit: any): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'INSERT OR REPLACE INTO fruits (id, tree_id, code, age, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [fruit.id, fruit.treeId, fruit.code, fruit.age, fruit.status, new Date().toISOString()]
    );
  }

  async getFruits(treeId: string): Promise<any[]> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    const [results] = await this.db.executeSql('SELECT * FROM fruits WHERE tree_id = ? ORDER BY code', [treeId]);
    const fruits = [];
    for (let i = 0; i < results.rows.length; i++) {
      fruits.push(results.rows.item(i));
    }
    return fruits;
  }

  async deleteFruit(fruitId: string): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql('DELETE FROM fruits WHERE id = ?', [fruitId]);
  }

  // Activity operations
  async saveActivity(activity: any): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'INSERT INTO activities (id, type, farm_id, tree_id, fruit_id, materials, thumbnail_path, timestamp, credits_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [activity.id, activity.type, activity.farmId, activity.treeId, activity.fruitId, JSON.stringify(activity.materials), activity.thumbnailPath, activity.timestamp, activity.creditsUsed]
    );
  }

  async saveProductScan(scan: any): Promise<void> {
    // Hỗ trợ Scanner_v2 đang gọi vào; có thể chuyển thành activity hoặc bảng riêng nếu cần.
    // Tạm lưu vào activities để không bị lỗi compile.
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'INSERT OR REPLACE INTO activities (id, type, materials, thumbnail_path, timestamp) VALUES (?, ?, ?, ?, ?)',
      [scan.id, scan.type, JSON.stringify(scan), scan.image_path, scan.timestamp]
    );
  }

  async getActivities(farmId: string, limit: number = 50): Promise<any[]> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    const [results] = await this.db.executeSql('SELECT * FROM activities WHERE farm_id = ? ORDER BY timestamp DESC LIMIT ?', [farmId, limit]);
    const activities = [];
    for (let i = 0; i < results.rows.length; i++) {
      const activity = results.rows.item(i);
      activity.materials = JSON.parse(activity.materials || '[]');
      activities.push(activity);
    }
    return activities;
  }

  // Wallet operations
  async saveWallet(wallet: any): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'INSERT OR REPLACE INTO wallet (id, user_id, magic_balance, lamp_balance, ada_balance, last_synced, pending_credits, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [wallet.id, wallet.userId, wallet.magicBalance, wallet.lampBalance, wallet.adaBalance, wallet.lastSynced, wallet.pendingCredits, new Date().toISOString()]
    );
  }

  async getWallet(userId: string): Promise<any | null> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    const [results] = await this.db.executeSql('SELECT * FROM wallet WHERE user_id = ? LIMIT 1', [userId]);
    if (results.rows.length > 0) {
      return results.rows.item(0);
    }
    return null;
  }

  // PhoenixKey operations
  async savePhoenixKey(phoenixKey: any): Promise<void> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    await this.db.executeSql(
      'INSERT OR REPLACE INTO phoenix_key (id, user_id, wallet_address, did, biometric_verified, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [phoenixKey.id, phoenixKey.userId, phoenixKey.walletAddress, phoenixKey.did, phoenixKey.biometricVerified ? 1 : 0, new Date().toISOString()]
    );
  }

  async getPhoenixKey(userId: string): Promise<any | null> {
    if (!this.db) throw new Error(`[Database] DB not initialized for user: ${this.currentUserId}`);

    const [results] = await this.db.executeSql('SELECT * FROM phoenix_key WHERE user_id = ? LIMIT 1', [userId]);
    if (results.rows.length > 0) {
      const key = results.rows.item(0);
      key.biometricVerified = key.biometric_verified === 1;
      return key;
    }
    return null;
  }

  async close(): Promise<void> {
    if (this.db) {
      const userId = this.currentUserId;
      await this.db.close();
      this.db = null;
      this.currentUserId = null;
      console.log(`[Database] Closed database for user: ${userId}`);
    }
  }
}

// Export singleton instance
export const database = new Database();