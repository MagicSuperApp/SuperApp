// modules/trace/store/farmSlice.ts

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Farm, Tree, TreeMetadata, Fruit, Activity } from '../types';
import { database } from '../../../utils/database';
import { databaseManager } from '../../../services/databaseManager';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import { listFarms } from '../../../services/farmService';
import { getTrees, mapTreeInfoToUI } from '../../../services/treeReIDService';
import { ensureOrilifeToken } from '../../../services/orilifeDidAuth';
import {
  saveTreeProfile,
  buildTreeProfileBody,
  type VoiceMemoVerdict,
} from '../../../services/treeProfileService';
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

// Đồng bộ vườn TỪ BACKEND field-reid (nguồn sự-thật DUY-NHẤT, INV-1).
// Trước đây gọi aladinAPI (backend Lợi deprecated) → farm_id lệch với nơi enroll
// ghi cây (field-reid) = gốc B2. Nay listFarms field-reid (owner lấy từ auth) →
// SQLite chỉ là CACHE offline-first, không phải nguồn id.
export const syncFarmsFromBackend = createAsyncThunk(
  'farm/syncFarmsFromBackend',
  async (userId: string) => {
    try {
      databaseManager.ensureReady('syncFarmsFromBackend');
      // BUG-FIX: ký token DID TRƯỚC khi đọc. Trước đây token chỉ được ký khi user vào
      // TreeIdentity/FarmDetail → mở app xong vào tab Vườn lần đầu là 401 → danh sách
      // vườn rỗng oan. ensureOrilifeToken tự DID-login nếu chưa có token.
      await ensureOrilifeToken(ORILIFE_BASE);
      let res = await listFarms(ORILIFE_BASE);
      // Token hết hạn (401) → ký lại 1 lần rồi thử lại, khớp cách FarmDetailScreen xử.
      if (!res.ok && res.error?.type === 'auth_error') {
        await ensureOrilifeToken(ORILIFE_BASE, { force: true });
        res = await listFarms(ORILIFE_BASE);
      }
      if (res.ok && res.farms) {
        // owner LẤY TỪ AUTH → gán userId hiện-hành để loadFarms(userId) khớp cache.
        const farms = res.farms.map((f) => ({ ...f, userId }));
        for (const farm of farms) {
          await database.saveFarm(farm);
        }
        return farms;
      }
    } catch (error: any) {
      console.error('[farmSlice] syncFarmsFromBackend error:', error?.message);
    }
    // Backend lỗi/offline → dùng cache SQLite (offline-first; KHÔNG mất dữ liệu, INV-1).
    try {
      return await database.getFarms(userId);
    } catch {
      return [];
    }
  }
);

// Đồng bộ cây của MỘT vườn TỪ field-reid (GET /api/trees?farm_id=X) — cùng backend
// nơi enroll ghi cây, nên cây vừa tạo hiện đúng vườn (sửa "cây không vào vườn").
export const syncTreesFromBackend = createAsyncThunk(
  'farm/syncTreesFromBackend',
  async (farmId: string) => {
    try {
      databaseManager.ensureReady('syncTreesFromBackend');
      // Cùng lỗi token như syncFarmsFromBackend: ký trước + retry-force khi 401.
      await ensureOrilifeToken(ORILIFE_BASE);
      let res = await getTrees(ORILIFE_BASE, farmId);
      if (!res.ok && res.error?.type === 'auth_error') {
        await ensureOrilifeToken(ORILIFE_BASE, { force: true });
        res = await getTrees(ORILIFE_BASE, farmId);
      }
      if (res.ok && res.trees) {
        const trees = res.trees.map((t) => mapTreeInfoToUI(t, farmId));
        for (const tree of trees) {
          await database.saveTree(tree);
        }
        return trees;
      }
    } catch (error: any) {
      console.error('[farmSlice] syncTreesFromBackend error:', error?.message);
    }
    try {
      return await database.getTrees(farmId);
    } catch {
      return [];
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

/**
 * Ghi hồ sơ sinh trưởng của cây — thử máy chủ, nhưng KHÔNG bao giờ đánh rơi chữ
 * người dùng vừa gõ.
 *
 * Hàm này đã đi qua hai lần sai ngược chiều nhau, nên chép lại cả hai:
 *
 * Sai thứ nhất — chỉ ghi `AsyncStorage` rồi báo "Đã lưu". Thao tác đúng là xong,
 * nhưng dữ liệu chỉ nằm trên một cái máy; gỡ ứng dụng là mất, mà người dùng không
 * có cách nào biết. Đó là một cái vỏ im lặng.
 *
 * Sai thứ hai — vá bằng cách bắt máy chủ trả 200 mới ghi cục bộ. Nó gỡ được cái vỏ
 * im lặng và dựng lên một cái tệ hơn cho đúng người dùng của app này: nông dân đứng
 * dưới gốc cây, 3G rớt, gõ giống + tuổi + ghi chú, bấm Lưu, và chữ vừa gõ không nằm
 * ở đâu cả. `Specs/PRINCIPLE-independent-feature.md:156` xếp đúng hình dạng đó vào
 * bảng CẤM TUYỆT ĐỐI ("Server-required validation ⟹ mất mạng = mất app"), và
 * `Platform-Feat-Spec.md:224` để F3.3 offline-first ở mức **Must**.
 *
 * Nay: **ghi cục bộ gần như luôn luôn, và nói thật cái gì đã lên máy chủ.** Chỉ MỘT
 * lý do từ chối — `validation_error`, tức máy chủ nói chính dữ liệu này sai. Ghi
 * cục bộ một giá trị máy chủ đã bác chỉ để lát nữa hai bên chọi nhau. Mọi lý do
 * khác (mất sóng, quá hạn chờ, máy chủ bận, máy chủ hỏng, phiên hết hạn) đều KHÔNG
 * phải lỗi của chữ vừa gõ, nên chữ đó được giữ và `pending` mang lý do ra màn.
 *
 * `pending` KHÔNG phải một hàng đợi đồng bộ — chưa có cái đó. Nó là một dữ kiện:
 * "trên máy có, trên máy chủ chưa". Màn phải nói đúng ngần ấy, đừng hứa app sẽ tự
 * gửi lại — không mã nào làm việc đó.
 *
 * Cửa `POST /api/tree/{tree_id}/profile` đã sống trên máy sản xuất — đo 2026-09-08
 * bằng hai cực: đường thật trả 401 (có cửa, đòi đăng nhập), đường bịa trả 404.
 *
 * Ba trạng thái "vắng / null / giá trị" của từng trường do `buildTreeProfileBody`
 * dựng — xem `services/treeProfileService.ts`. Ở đây chỉ cần biết một điều: thân
 * gửi lên KHÁC đối tượng lưu trên máy, và nó phải khác.
 *
 * Ghi âm KHÔNG lên máy chủ (chưa có đường nhận tệp). Máy chủ tự nói ra điều đó
 * trong `voice_memo.reason` — câu tiếng Việt dành cho người dùng — và hàm này
 * chuyển nguyên văn ra cho màn, không diễn giải lại.
 */
export const saveTreeMetadata = createAsyncThunk(
  'farm/saveTreeMetadata',
  async (
    input: { treeId: string; metadata: TreeMetadata },
    { getState, rejectWithValue },
  ) => {
    const { treeId, metadata } = input;

    const previous = (getState() as { farm: FarmState }).farm.trees.find(
      (t) => t.id === treeId,
    )?.metadata;
    const body = buildTreeProfileBody(previous, metadata);

    let voiceMemo: VoiceMemoVerdict | undefined;
    /** Đã ghi trên máy, CHƯA lên được máy chủ — kèm lý do của chính máy chủ. */
    let pending: { detail: string } | undefined;
    // Thân rỗng = không có gì để máy chủ ghi (chỉ đổi thứ máy chủ không giữ).
    // Vẫn ghi cục bộ, nhưng KHÔNG bịa ra một lượt gọi mạng để trông cho bận rộn.
    if (Object.keys(body).length > 0) {
      await ensureOrilifeToken(ORILIFE_BASE);
      let res = await saveTreeProfile(ORILIFE_BASE, treeId, body);
      if (!res.ok && res.error?.type === 'auth_error') {
        await ensureOrilifeToken(ORILIFE_BASE, { force: true });
        res = await saveTreeProfile(ORILIFE_BASE, treeId, body);
      }
      if (!res.ok) {
        // Ca DUY NHẤT từ chối: máy chủ nói chính dữ liệu này sai. Giữ nguyên câu
        // của máy chủ — nó nói được người dùng phải sửa gì, câu của app thì không.
        if (res.error?.type === 'validation_error') {
          return rejectWithValue(
            res.error.detail ?? 'Máy chủ không nhận được hồ sơ cây',
          );
        }
        pending = {
          detail: res.error?.detail ?? 'Chưa gửi được lên máy chủ',
        };
      } else {
        voiceMemo = res.voiceMemo;
      }
    }

    await AsyncStorage.setItem(treeMetadataKey(treeId), JSON.stringify(metadata));
    return { treeId, metadata, voiceMemo, pending };
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
      // Đồng bộ vườn từ máy chủ → ĐỔ THẲNG VÀO STORE.
      //
      // Nhánh này từng KHÔNG tồn tại, trong khi `syncTreesFromBackend` ngay dưới
      // thì có. Hai thunk sinh đôi, một cái nối dây, một cái không — và chỗ hụt
      // không kêu lên: thunk vẫn `fulfilled`, vẫn trả đúng mảng vườn, chỉ là mảng
      // đó rơi xuống đất. Hai màn gọi nó đã phải tự bù bằng tay theo hai cách khác
      // nhau (`FarmListScreen` gọi thêm `loadFarms` trong `.finally`;
      // `DashboardScreen` đọc thẳng giá trị qua `.unwrap()`), tức mỗi nơi gọi lại
      // phải tự nhớ một mẹo riêng — và màn thứ ba nào chỉ dispatch rồi đọc
      // `state.farm.farms` sẽ thấy danh sách CŨ mà không có gì báo.
      .addCase(syncFarmsFromBackend.fulfilled, (state, action) => {
        state.farms = action.payload;
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
