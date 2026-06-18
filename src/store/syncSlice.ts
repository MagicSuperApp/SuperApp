// store/syncSlice.ts

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { database } from '../utils/database';
import { logout, logoutUser } from './userSlice';

interface SyncItem {
  id: number;
  transactionId: string;
  payload: string;
  mediaPaths: string[];
  status: 'pending' | 'sending' | 'error' | 'success';
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

interface SyncState {
  queue: SyncItem[];
  isLoading: boolean;
  error: string | null;
}

const initialState: SyncState = {
  queue: [],
  isLoading: false,
  error: null,
};

// Async thunks for sync operations
export const loadSyncQueue = createAsyncThunk(
  'sync/loadSyncQueue',
  async () => {
    const queue = await database.getSyncQueue();
    return queue;
  }
);

export const addToSyncQueue = createAsyncThunk(
  'sync/addToSyncQueue',
  async ({ transactionId, payload, mediaPaths }: { transactionId: string; payload: string; mediaPaths: string[] }) => {
    await database.addToSyncQueue(transactionId, payload, mediaPaths);
    return { transactionId, payload, mediaPaths };
  }
);

export const updateSyncStatus = createAsyncThunk(
  'sync/updateSyncStatus',
  async ({ transactionId, status, errorCode }: { transactionId: string; status: string; errorCode?: string }) => {
    await database.updateSyncStatus(transactionId, status, errorCode);
    return { transactionId, status, errorCode };
  }
);

export const removeFromSyncQueue = createAsyncThunk(
  'sync/removeFromSyncQueue',
  async (transactionId: string) => {
    await database.removeFromSyncQueue(transactionId);
    return transactionId;
  }
);

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setSyncQueue: (state, action: PayloadAction<SyncItem[]>) => {
      state.queue = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Đổi user → xoá hàng đợi sync của user cũ (chống đẩy giao dịch A dưới phiên B).
      .addCase(logout, () => initialState)
      .addCase(logoutUser.fulfilled, () => initialState)
      // Load sync queue
      .addCase(loadSyncQueue.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadSyncQueue.fulfilled, (state, action) => {
        state.queue = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loadSyncQueue.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load sync queue';
      })
      // Add to sync queue
      .addCase(addToSyncQueue.fulfilled, (state, action) => {
        // Reload queue after adding
        // Note: In a real app, you might want to add locally first for immediate UI update
      })
      // Update sync status
      .addCase(updateSyncStatus.fulfilled, (state, action) => {
        const item = state.queue.find(q => q.transactionId === action.payload.transactionId);
        if (item) {
          item.status = action.payload.status as any;
          item.errorCode = action.payload.errorCode;
          item.updatedAt = new Date().toISOString();
        }
      })
      // Remove from sync queue
      .addCase(removeFromSyncQueue.fulfilled, (state, action) => {
        state.queue = state.queue.filter(q => q.transactionId !== action.payload);
      });
  },
});

export const { setSyncQueue, setLoading, setError } = syncSlice.actions;
export default syncSlice.reducer;