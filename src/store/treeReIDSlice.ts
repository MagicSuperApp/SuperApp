/**
 * TreeReID Redux Slice - State management for tree identification
 *
 * Manages:
 * - Capture session state (isCapturing, currentRound, captures)
 * - Identification results (decision, candidates, selectedTree)
 * - Enrolled trees list
 * - Last tree tracking (for neighbor graph)
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  identifyTree,
  enrollTree,
  verifyAddTree,
  getTrees,
  type IdentifyResponse,
  type EnrollResponse,
  type VerifyAddResponse,
  type TreeListResponse,
  type APIError,
} from '../services/treeReIDService';
import { TreeReIDBridge, type CapturedImage } from '../services/treeReIDNativeBridge';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { logout, logoutUser } from './userSlice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeReIDState {
  // Capture session
  isCapturing: boolean;
  sessionId: string | null;
  currentRound: 1 | 2 | null;
  captures: CapturedImage[];
  lastHeading: number | null;
  lastPitch: number | null;

  // Identification
  identificationResult: IdentifyResponse | null;
  selectedTreeId: string | null;
  isIdentifying: boolean;
  identifyError: string | null;

  // Enrollment
  isEnrolling: boolean;
  enrollError: string | null;

  // Enrolled trees
  enrolledTrees: TreeListResponse['trees'];
  isLoadingTrees: boolean;

  // Last tree (for neighbor graph)
  lastIdentifiedTree: { treeId: string; timestamp: number } | null;

  // GPS
  gps: { lat: number; lng: number; accuracy: number } | null;

  // Error
  error: string | null;
}

const initialState: TreeReIDState = {
  isCapturing: false,
  sessionId: null,
  currentRound: null,
  captures: [],
  lastHeading: null,
  lastPitch: null,
  identificationResult: null,
  selectedTreeId: null,
  isIdentifying: false,
  identifyError: null,
  isEnrolling: false,
  enrollError: null,
  enrolledTrees: [],
  isLoadingTrees: false,
  lastIdentifiedTree: null,
  gps: null,
  error: null,
};

// ---------------------------------------------------------------------------
// Config (from env)
// ---------------------------------------------------------------------------

// Base URL DUY NHẤT qua hằng chung — KHÔNG hardcode test/staging (đã chết).
const TREE_REID_BASE_URL = ORILIFE_BASE;

// ---------------------------------------------------------------------------
// Async Thunks
// ---------------------------------------------------------------------------

/**
 * Start a new capture session
 */
export const startCaptureSession = createAsyncThunk(
  'treeReID/startCapture',
  async (options?: Record<string, unknown>) => {
    const result = await TreeReIDBridge.startCaptureSession(options);
    return result;
  }
);

/**
 * Stop capture session and get captured images
 */
export const stopCaptureSession = createAsyncThunk(
  'treeReID/stopCapture',
  async () => {
    const result = await TreeReIDBridge.stopCaptureSession();
    return result;
  }
);

/**
 * Identify tree from captured images
 */
export const submitIdentification = createAsyncThunk(
  'treeReID/identify',
  async (
    params: {
      images: string[];
      lat?: number;
      lon?: number;
      heading?: number;
      pitch?: number;
      lastTree?: string;
    },
    { rejectWithValue }
  ) => {
    const result = await identifyTree(TREE_REID_BASE_URL, params.images, {
      lat: params.lat,
      lon: params.lon,
      heading: params.heading,
      pitch: params.pitch,
    });

    if (!result.ok) {
      return rejectWithValue(result.error?.detail ?? 'Identification failed');
    }

    return result.data!;
  }
);

/**
 * Enroll a new tree
 */
export const submitEnroll = createAsyncThunk(
  'treeReID/enroll',
  async (
    params: {
      name: string;
      images: string[];
      lat?: number;
      lon?: number;
      heading?: number;
      pitch?: number;
      /** Vườn hiện-hành — gắn cây vào vườn (form farm_id) khi có. */
      farmId?: string;
    },
    { rejectWithValue }
  ) => {
    const result = await enrollTree(TREE_REID_BASE_URL, params.name, params.images, {
      lat: params.lat,
      lon: params.lon,
      heading: params.heading,
      pitch: params.pitch,
    }, params.farmId);

    if (!result.ok) {
      return rejectWithValue(result.error?.detail ?? 'Enrollment failed');
    }

    return result.data!;
  }
);

/**
 * Verify and add additional views to existing tree
 */
export const submitVerifyAdd = createAsyncThunk(
  'treeReID/verifyAdd',
  async (
    params: {
      treeId: string;
      images: string[];
      lat?: number;
      lon?: number;
      heading?: number;
      pitch?: number;
      prevTree?: string;
    },
    { rejectWithValue }
  ) => {
    const result = await verifyAddTree(TREE_REID_BASE_URL, params.treeId, params.images);

    if (!result.ok) {
      return rejectWithValue(result.error?.detail ?? 'Verify failed');
    }

    return result.data!;
  }
);

/**
 * Load enrolled trees list
 */
export const loadEnrolledTrees = createAsyncThunk(
  'treeReID/loadTrees',
  async (_, { rejectWithValue }) => {
    const result = await getTrees(TREE_REID_BASE_URL);

    if (!result.ok) {
      return rejectWithValue(result.error?.detail ?? 'Failed to load trees');
    }

    return result.trees!;
  }
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const treeReIDSlice = createSlice({
  name: 'treeReID',
  initialState,
  reducers: {
    // Capture state updates
    setCapturing(state, action: PayloadAction<boolean>) {
      state.isCapturing = action.payload;
      if (!action.payload) {
        state.sessionId = null;
        state.currentRound = null;
        state.captures = [];
      }
    },

    setSessionId(state, action: PayloadAction<string | null>) {
      state.sessionId = action.payload;
    },

    setCurrentRound(state, action: PayloadAction<1 | 2 | null>) {
      state.currentRound = action.payload;
    },

    addCapture(state, action: PayloadAction<CapturedImage>) {
      state.captures.push(action.payload);
    },

    updateSensorData(state, action: PayloadAction<{ heading: number | null; pitch: number | null }>) {
      state.lastHeading = action.payload.heading;
      state.lastPitch = action.payload.pitch;
    },

    setGPS(state, action: PayloadAction<{ lat: number; lng: number; accuracy: number } | null>) {
      state.gps = action.payload;
    },

    // Identification state
    setIdentificationResult(state, action: PayloadAction<IdentifyResponse | null>) {
      state.identificationResult = action.payload;
      if (action.payload?.tree_id) {
        state.lastIdentifiedTree = {
          treeId: action.payload.tree_id,
          timestamp: Date.now(),
        };
      }
    },

    selectTree(state, action: PayloadAction<string | null>) {
      state.selectedTreeId = action.payload;
    },

    clearIdentification(state) {
      state.identificationResult = null;
      state.selectedTreeId = null;
      state.identifyError = null;
    },

    // Enrollment state
    setEnrollError(state, action: PayloadAction<string | null>) {
      state.enrollError = action.payload;
    },

    // Clear all state
    clearAll(state) {
      Object.assign(state, initialState);
    },

    clearError(state) {
      state.error = null;
      state.identifyError = null;
      state.enrollError = null;
    },
  },

  extraReducers: builder => {
    // Đổi user → xoá kết quả ReID cây/quả của user cũ (chống user B thấy dữ liệu user A).
    builder.addCase(logout, () => initialState);
    builder.addCase(logoutUser.fulfilled, () => initialState);
    // startCaptureSession
    builder.addCase(startCaptureSession.pending, state => {
      state.isCapturing = true;
      state.error = null;
    });
    builder.addCase(startCaptureSession.fulfilled, (state, action) => {
      state.isCapturing = true;
      state.sessionId = action.payload.sessionId;
      state.currentRound = action.payload.round as 1 | 2;
    });
    builder.addCase(startCaptureSession.rejected, (state, action) => {
      state.isCapturing = false;
      state.error = action.error.message ?? 'Failed to start capture';
    });

    // stopCaptureSession
    builder.addCase(stopCaptureSession.fulfilled, (state, action) => {
      state.isCapturing = false;
      if (action.payload) {
        state.captures = action.payload.captures;
      }
    });

    // submitIdentification
    builder.addCase(submitIdentification.pending, state => {
      state.isIdentifying = true;
      state.identifyError = null;
    });
    builder.addCase(submitIdentification.fulfilled, (state, action) => {
      state.isIdentifying = false;
      state.identificationResult = action.payload;
      if (action.payload.tree_id) {
        state.selectedTreeId = action.payload.tree_id;
        state.lastIdentifiedTree = {
          treeId: action.payload.tree_id,
          timestamp: Date.now(),
        };
      }
    });
    builder.addCase(submitIdentification.rejected, (state, action) => {
      state.isIdentifying = false;
      state.identifyError = action.payload as string;
    });

    // submitEnroll
    builder.addCase(submitEnroll.pending, state => {
      state.isEnrolling = true;
      state.enrollError = null;
    });
    builder.addCase(submitEnroll.fulfilled, (state, action) => {
      state.isEnrolling = false;
      // Add new tree to enrolled trees list
      const newTree: import('../services/treeReIDService').TreeInfo = {
        tree_id: action.payload.tree_id,
        name: '',
        n_views: action.payload.n_views_added ?? 0,
        has3d: action.payload.provenance?.has3d ?? false,
        anchor: action.payload.provenance?.anchor ?? null,
      };
      state.enrolledTrees.unshift(newTree);
      state.lastIdentifiedTree = {
        treeId: action.payload.tree_id,
        timestamp: Date.now(),
      };
    });
    builder.addCase(submitEnroll.rejected, (state, action) => {
      state.isEnrolling = false;
      state.enrollError = action.payload as string;
    });

    // submitVerifyAdd
    builder.addCase(submitVerifyAdd.fulfilled, (_state, _action) => {
      // verify_add confirmed, UI layer handles lastIdentifiedTree update
    });

    // loadEnrolledTrees
    builder.addCase(loadEnrolledTrees.pending, state => {
      state.isLoadingTrees = true;
    });
    builder.addCase(loadEnrolledTrees.fulfilled, (state, action) => {
      state.isLoadingTrees = false;
      state.enrolledTrees = action.payload;
    });
    builder.addCase(loadEnrolledTrees.rejected, (state, action) => {
      state.isLoadingTrees = false;
      state.error = action.payload as string;
    });
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const {
  setCapturing,
  setSessionId,
  setCurrentRound,
  addCapture,
  updateSensorData,
  setGPS,
  setIdentificationResult,
  selectTree,
  clearIdentification,
  setEnrollError,
  clearAll,
  clearError,
} = treeReIDSlice.actions;

export default treeReIDSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectIsCapturing = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.isCapturing;

export const selectCurrentRound = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.currentRound;

export const selectCaptures = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.captures;

export const selectCapturesCount = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.captures.length;

export const selectRound1Captures = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.captures.filter(c => c.round === 1).length;

export const selectRound2Captures = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.captures.filter(c => c.round === 2).length;

export const selectIdentificationResult = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.identificationResult;

export const selectCandidates = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.identificationResult?.candidates ?? [];

export const selectLastIdentifiedTree = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.lastIdentifiedTree;

export const selectEnrolledTrees = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.enrolledTrees;

export const selectGPS = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.gps;

export const selectIsIdentifying = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.isIdentifying;

export const selectIsEnrolling = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.isEnrolling;

export const selectError = (state: { treeReID: TreeReIDState }) =>
  state.treeReID.error;