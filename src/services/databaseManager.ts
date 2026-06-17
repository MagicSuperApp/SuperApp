// services/databaseManager.ts

import { database } from '../utils/database';

/**
 * DatabaseManager Service
 * Handles database lifecycle based on user DID (Decentralized Identifier).
 * Each DID has its own isolated database.
 */

class DatabaseManager {
  private currentDid: string | null = null;

  /**
   * Initialize database for a specific DID
   * Should be called after user login (biometric or phone)
   */
  async initializeForUser(did: string): Promise<void> {
    try {
      console.log(`[DatabaseManager] Initializing database for DID: ${did}`);

      if (this.currentDid && this.currentDid !== did) {
        await this.closeDatabase();
      }

      await database.init(did);
      this.currentDid = did;

      console.log(`[DatabaseManager] Successfully initialized for: ${did}`);
    } catch (error) {
      console.error(`[DatabaseManager] Failed to initialize for ${did}:`, error);
      throw error;
    }
  }

  async closeDatabase(): Promise<void> {
    try {
      const did = this.currentDid;
      await database.close();
      this.currentDid = null;
      console.log(`[DatabaseManager] Database closed for DID: ${did}`);
    } catch (error) {
      console.error(`[DatabaseManager] Error closing database:`, error);
    }
  }

  getCurrentDid(): string | null {
    return this.currentDid;
  }

  isReady(): boolean {
    return database.isInitialized() && this.currentDid !== null;
  }

  ensureReady(operationName: string = 'Operation'): void {
    if (!this.isReady()) {
      throw new Error(
        `[DatabaseManager] ${operationName} failed: Database not initialized or no DID context. ` +
        `Current DID: ${this.currentDid}, DB initialized: ${database.isInitialized()}`
      );
    }
  }

  async switchUser(newDid: string): Promise<void> {
    console.log(
      `[DatabaseManager] Switching from ${this.currentDid} to ${newDid}`
    );
    await this.initializeForUser(newDid);
  }
}

export const databaseManager = new DatabaseManager();
