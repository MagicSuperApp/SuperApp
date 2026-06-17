// modules/trace/store/farmSlice.ts

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Farm, Tree, TreeMetadata, Fruit, Activity } from '../types';
import { database } from '../../../utils/database';
import { databaseManager } from '../../../services/databaseManager';
import aladinAPI from '../../../services/aladin-api';
import { logout, logoutUser } from '../../../store/userSlice';

// AsyncStorage key prefix for tree metadata (build 49 spec § 3).
// Stored separately from SQLite trees table — see Q3 in session-3-tree-metadata.md.
const TREE_METADATA_KEY_PREFIX = '@aladin/tree_metadata/';
export const treeMetadataKey = (treeId: string) => `${TREE_METADATA_KEY_PREFIX}${treeId}`;

interface FarmState {
  farms: Farm[];
  trees: Tree[];
  fruits: Fruit[];
  activities: Activity[];
  isLoading: boolean;
  error: string | null;
}

const initialState: FarmState = {
  farms: [],
  trees: [],
  fruits: [],
  activities: [],
  isLoading: false,
  error: null,
};

// ✅ NEW: Sync farms from backend
export const syncFarmsFromBackend = createAsyncThunk(
  'farm/syncFarmsFromBackend',
  async (userId: string) => {
    try {
      // Fetch from backend
      const backendFarms = await aladinAPI.getFarms({ owner_did: userId });

      // Save to local DB
      for (const farm of backendFarms) {
        await database.saveFarm(farm);
      }

      return backendFarms;
    } catch (error: any) {
      console.error('[farmSlice] syncFarmsFromBackend error:', error.message);
      // Fallback to local DB if backend fails
      return await database.getFarms(userId);
    }
  }
);

export const syncTreesFromBackend = createAsyncThunk(
  'farm/syncTreesFromBackend',
  async (farmId: string) => {
    databaseManager.ensureReady('syncTreesFromBackend');
    try {
      const backendTrees = await aladinAPI.getTrees({ farm_id: farmId });
      for (const tree of backendTrees) {
        await database.saveTree(tree);
      }
      return backendTrees;
    } catch (error: any) {
      console.error('[farmSlice] syncTreesFromBackend error:', error.message);
      return await database.getTrees(farmId);
    }
  }
);

// Async thunks for database operations
export const loadFarms = createAsyncThunk(
  'farm/loadFarms',
  async (userId: string) => {
    databaseManager.ensureReady('loadFarms');
    const farms = await database.getFarms(userId);
    return farms;
  }
);

export const loadFarm = createAsyncThunk(
  'farm/loadFarm',
  async (farmId: string) => {
    databaseManager.ensureReady('loadFarm');
    const farm = await database.getFarm(farmId);
    return farm;
  }
);


export const saveFarm = createAsyncThunk(
  'farm/saveFarm',
  async (farm: Farm) => {
    databaseManager.ensureReady('saveFarm');
    await database.saveFarm(farm);
    return farm;
  }
);

export const loadTrees = createAsyncThunk(
  'farm/loadTrees',
  async (farmId: string) => {
    databaseManager.ensureReady('loadTrees');
    const trees = await database.getTrees(farmId);
    // Hydrate metadata from AsyncStorage (build 49 — separate from SQLite).
    const hydrated = await Promise.all(
      trees.map(async (tree) => {
        try {
          const raw = await AsyncStorage.getItem(treeMetadataKey(tree.id));
          if (!raw) return tree;
          const metadata = JSON.parse(raw) as TreeMetadata;
          return { ...tree, metadata };
        } catch {
          return tree;
        }
      })
    );
    return hydrated;
  }
);

export const saveTreeMetadata = createAsyncThunk(
  'farm/saveTreeMetadata',
  async (input: { treeId: string; metadata: TreeMetadata }) => {
    const { treeId, metadata } = input;
    await AsyncStorage.setItem(treeMetadataKey(treeId), JSON.stringify(metadata));
    return { treeId, metadata };
  }
);

export const saveTree = createAsyncThunk(
  'farm/saveTree',
  async (tree: Tree) => {
    databaseManager.ensureReady('saveTree');
    await database.saveTree(tree);
    return tree;
  }
);

export const loadFruits = createAsyncThunk(
  'farm/loadFruits',
  async (treeId: string) => {
    databaseManager.ensureReady('loadFruits');
    const fruits = await database.getFruits(treeId);
    return fruits;
  }
);

export const saveFruit = createAsyncThunk(
  'farm/saveFruit',
  async (fruit: Fruit) => {
    databaseManager.ensureReady('saveFruit');
    await database.saveFruit(fruit);
    return fruit;
  }
);

export const loadActivities = createAsyncThunk(
  'farm/loadActivities',
  async (farmId: string) => {
    databaseManager.ensureReady('loadActivities');
    const activities = await database.getActivities(farmId);
    return activities;
  }
);

export const saveActivity = createAsyncThunk(
  'farm/saveActivity',
  async (activity: Activity) => {
    databaseManager.ensureReady('saveActivity');
    await database.saveActivity(activity);
    return activity;
  }
);

const farmSlice = createSlice({
  name: 'farm',
  initialState,
  reducers: {
    setFarms: (state, action: PayloadAction<Farm[]>) => {
      state.farms = action.payload;
    },
    addFarm: (state, action: PayloadAction<Farm>) => {
      state.farms.push(action.payload);
    },
    setTrees: (state, action: PayloadAction<Tree[]>) => {
      state.trees = action.payload;
    },
    addTree: (state, action: PayloadAction<Tree>) => {
      state.trees.push(action.payload);
    },
    setFruits: (state, action: PayloadAction<Fruit[]>) => {
      state.fruits = action.payload;
    },
    addFruit: (state, action: PayloadAction<Fruit>) => {
      state.fruits.push(action.payload);
    },
    setActivities: (state, action: PayloadAction<Activity[]>) => {
      state.activities = action.payload;
    },
    addActivity: (state, action: PayloadAction<Activity>) => {
      state.activities.push(action.payload);
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
      // Đổi user → xoá sạch cây/vườn của user cũ (chống rò dữ liệu A→B).
      .addCase(logout, () => initialState)
      .addCase(logoutUser.fulfilled, () => initialState)
      // Load farms
      .addCase(loadFarms.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadFarms.fulfilled, (state, action) => {
        state.farms = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loadFarms.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to load farms';
      })
      // Save farm
      .addCase(saveFarm.fulfilled, (state, action) => {
        const existingIndex = state.farms.findIndex(f => f.id === action.payload.id);
        if (existingIndex >= 0) {
          state.farms[existingIndex] = action.payload;
        } else {
          state.farms.unshift(action.payload); // new farms appear on top
        }
      })
      // Sync trees from backend
      .addCase(syncTreesFromBackend.fulfilled, (state, action) => {
        state.trees = action.payload;
      })
      // Load trees
      .addCase(loadTrees.fulfilled, (state, action) => {
        state.trees = action.payload;
      })
      // Save tree
      .addCase(saveTree.fulfilled, (state, action) => {
        const existingIndex = state.trees.findIndex(t => t.id === action.payload.id);
        if (existingIndex >= 0) {
          state.trees[existingIndex] = action.payload;
        } else {
          state.trees.unshift(action.payload); // newest trees appear first
        }
      })
      // Save tree metadata (build 49 § 3 — AsyncStorage-backed)
      .addCase(saveTreeMetadata.fulfilled, (state, action) => {
        const { treeId, metadata } = action.payload;
        const existing = state.trees.find(t => t.id === treeId);
        if (existing) existing.metadata = metadata;
      })
      // Load fruits
      .addCase(loadFruits.fulfilled, (state, action) => {
        state.fruits = action.payload;
      })
      // Save fruit
      .addCase(saveFruit.fulfilled, (state, action) => {
        const existingIndex = state.fruits.findIndex(f => f.id === action.payload.id);
        if (existingIndex >= 0) {
          state.fruits[existingIndex] = action.payload;
        } else {
          state.fruits.unshift(action.payload); // newest fruits appear first
        }
      })
      // Load activities
      .addCase(loadActivities.fulfilled, (state, action) => {
        state.activities = action.payload;
      })
      // Save activity
      .addCase(saveActivity.fulfilled, (state, action) => {
        state.activities.unshift(action.payload); // Add to beginning for chronological order
      });
  },
});

export const { setFarms, addFarm, setTrees, addTree, setFruits, addFruit, setActivities, addActivity, setLoading, setError } = farmSlice.actions;
export default farmSlice.reducer;
