/**
 * SQLite-like Queue Management Service
 * Manages offline data sync with priority ordering
 * Real implementation would use: SQLite (React Native), or IndexedDB (Web)
 */

import { QueueItem, SyncQueue } from '../types/verification';
import { SYNC_STATES, QUEUE_CONFIG } from '../constants/verification';
// react-native-quick-sqlite types declared in src/types/env.d.ts (optional native module).
import { open } from 'react-native-quick-sqlite';

const db = open({ name: 'orilife_sync.sqlite' });

// Khởi tạo bảng nếu chưa có (O(1) thay vì O(n) parse JSON)
db.execute(`
  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    type TEXT,
    payload TEXT,
    priority TEXT,
    syncState TEXT,
    retryCount INTEGER,
    lastError TEXT,
    createdAt INTEGER,
    updatedAt INTEGER
  )
`);

class StorageQueueService {
  /**
   * Helper parsing items from SQLite result rows
   */
  private parseRows(rows: any): any[] {
    let rawItems: any[] = [];
    if (rows?._array) {
      rawItems = rows._array;
    } else if (rows?.item) {
      for (let i = 0; i < rows.length; i++) {
        rawItems.push(rows.item(i));
      }
    } else if (Array.isArray(rows)) {
      rawItems = rows;
    }
    return rawItems;
  }

  async enqueueItem(
    type: 'metadata' | 'image',
    payload: any,
    options?: { priority?: 'high' | 'normal' | 'low' }
  ): Promise<QueueItem> {
    const priority = options?.priority || (type === 'metadata' ? 'high' : 'normal');

    const item: QueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      payload,
      priority,
      syncState: SYNC_STATES.PENDING,
      retryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    db.execute(
      `INSERT INTO sync_queue (id, type, payload, priority, syncState, retryCount, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.type, JSON.stringify(item.payload), item.priority, item.syncState, item.retryCount, item.createdAt, item.updatedAt]
    );

    return item;
  }

  async getQueue(): Promise<SyncQueue> {
    try {
      // Limit 50 to avoid any OOM issues on UI when previewing queue
      // Order by metadata first, then image, and by oldest entry first
      const { rows } = db.execute(`SELECT * FROM sync_queue
        ORDER BY
          CASE priority
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END,
          createdAt ASC
        LIMIT 50`
      );
      const rawItems = this.parseRows(rows);
      
      const items: QueueItem[] = rawItems.map(row => ({
        ...row,
        payload: row.payload ? JSON.parse(row.payload) : null
      }));

      const { rows: pendingRows } = db.execute('SELECT COUNT(*) as cnt FROM sync_queue WHERE syncState = ?', [SYNC_STATES.PENDING]);
      const { rows: syncingRows } = db.execute('SELECT COUNT(*) as cnt FROM sync_queue WHERE syncState = ?', [SYNC_STATES.SYNCING]);

      const totalPending = this.parseRows(pendingRows)[0]?.cnt || 0;
      const totalSyncing = this.parseRows(syncingRows)[0]?.cnt || 0;

      return {
        items,
        totalPending,
        totalSyncing,
        isOnline: true,
      };
    } catch (error) {
      console.error('[StorageQueue] Get error:', error);
      return { items: [], totalPending: 0, totalSyncing: 0, isOnline: true };
    }
  }

  async getNextBatch(limit: number = QUEUE_CONFIG.BATCH_SIZE): Promise<QueueItem[]> {
    // Độ phức tạp O(1) do SQL xử lý thẳng ở Native Layer, không ảnh hưởng JS Thread
    const { rows } = db.execute(`
      SELECT * FROM sync_queue 
      WHERE syncState = ? 
      ORDER BY 
        CASE priority 
          WHEN 'high' THEN 1 
          WHEN 'normal' THEN 2 
          WHEN 'low' THEN 3 
          ELSE 4 
        END, 
        createdAt ASC 
      LIMIT ?
    `, [SYNC_STATES.PENDING, limit]);

    return this.parseRows(rows).map(row => ({
      ...row,
      payload: row.payload ? JSON.parse(row.payload) : null
    }));
  }

  async markSyncing(itemIds: string[]): Promise<void> {
    if (!itemIds.length) return;
    const placeholders = itemIds.map(() => '?').join(',');
    db.execute(
      `UPDATE sync_queue SET syncState = ?, updatedAt = ? WHERE id IN (${placeholders})`,
      [SYNC_STATES.SYNCING, Date.now(), ...itemIds]
    );
  }

  async markVerified(itemIds: string[]): Promise<void> {
    if (!itemIds.length) return;
    const placeholders = itemIds.map(() => '?').join(',');
    db.execute(
      `UPDATE sync_queue SET syncState = ?, updatedAt = ? WHERE id IN (${placeholders})`,
      [SYNC_STATES.VERIFIED, Date.now(), ...itemIds]
    );
  }

  async markError(itemIds: string[], error: string): Promise<void> {
    if (!itemIds.length) return;
    const placeholders = itemIds.map(() => '?').join(',');
    db.execute(
      `UPDATE sync_queue 
       SET retryCount = retryCount + 1, lastError = ?, 
           syncState = CASE WHEN retryCount + 1 >= ? THEN ? ELSE ? END, 
           updatedAt = ? 
       WHERE id IN (${placeholders})`,
      [error, QUEUE_CONFIG.MAX_RETRY_ATTEMPTS, SYNC_STATES.ERROR, SYNC_STATES.PENDING, Date.now(), ...itemIds]
    );
  }

  async retryFailedItems(): Promise<void> {
    db.execute(
      `UPDATE sync_queue SET syncState = ?, retryCount = 0, updatedAt = ? WHERE syncState = ?`,
      [SYNC_STATES.PENDING, Date.now(), SYNC_STATES.ERROR]
    );
  }

  async removeItems(itemIds: string[]): Promise<void> {
    if (!itemIds.length) return;
    const placeholders = itemIds.map(() => '?').join(',');
    db.execute(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, itemIds);
  }

  async clearQueue(): Promise<void> {
    db.execute(`DELETE FROM sync_queue`);
  }

  async getQueueStats(): Promise<{
    totalItems: number;
    pending: number;
    syncing: number;
    verified: number;
    error: number;
  }> {
    const { rows } = db.execute(`
      SELECT syncState, COUNT(*) as cnt 
      FROM sync_queue 
      GROUP BY syncState
    `);

    let totalItems = 0;
    let pending = 0;
    let syncing = 0;
    let verified = 0;
    let error = 0;

    const rawStats = this.parseRows(rows);
    for (const row of rawStats) {
      const count = row.cnt;
      totalItems += count;
      if (row.syncState === SYNC_STATES.PENDING) pending = count;
      if (row.syncState === SYNC_STATES.SYNCING) syncing = count;
      if (row.syncState === SYNC_STATES.VERIFIED) verified = count;
      if (row.syncState === SYNC_STATES.ERROR) error = count;
    }

    return { totalItems, pending, syncing, verified, error };
  }
}

// ===== Singleton Instance =====
const storageQueueService = new StorageQueueService();

export default storageQueueService;

// ===== React Hook =====
export const useStorageQueue = () => {
  return {
    enqueueItem: storageQueueService.enqueueItem.bind(storageQueueService),
    getQueue: storageQueueService.getQueue.bind(storageQueueService),
    getNextBatch: storageQueueService.getNextBatch.bind(storageQueueService),
    markSyncing: storageQueueService.markSyncing.bind(storageQueueService),
    markVerified: storageQueueService.markVerified.bind(storageQueueService),
    markError: storageQueueService.markError.bind(storageQueueService),
    retryFailedItems: storageQueueService.retryFailedItems.bind(storageQueueService),
    removeItems: storageQueueService.removeItems.bind(storageQueueService),
    clearQueue: storageQueueService.clearQueue.bind(storageQueueService),
    getQueueStats: storageQueueService.getQueueStats.bind(storageQueueService),
  };
};
