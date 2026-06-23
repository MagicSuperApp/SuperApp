// store/userSlice.ts

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../types';
import { database } from '../utils/database';
import { databaseManager } from '../services/databaseManager';
import { phoenixKeyApi } from '../services/phoenixKey-api';
import { parseDidNetwork } from '../services/phoenixDid';

interface Wallet {
  id: string;
  userId: string;
  magicBalance: number;
  lampBalance: number;
  adaBalance: number;
  lastSynced: string;
  pendingCredits: number;
  // Ví THẬT từ chuỗi (PhoenixKey backend) — chỉ có khi refreshWallet() chạy xong.
  address?: string | null;
  magicAccrued?: number;
  magicRatePerSlot?: string;
  fromChain?: boolean;
}

interface PhoenixKey {
  id: string;
  userId: string;
  walletAddress: string;
  did: string;
  biometricVerified: boolean;
}

interface UserState {
  currentUser: User | null;
  wallet: Wallet | null;
  phoenixKey: PhoenixKey | null;
  // Mạng Cardano THẬT theo danh tính (resolveNetwork). null = chưa rõ → UI dùng nhãn env.
  network: string | null;
  // Khoá ĐIỀU-KHIỂN DID (controller pkh) = địa-chỉ-2, khoá QUẢN-TRỊ danh-tính, KHÔNG giữ tài sản
  // (khác ví-seed giữ tiền ở `wallet.address`). null = chưa lấy được (refreshControllerPkh).
  controllerPkh: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: UserState = {
  currentUser: null,
  wallet: null,
  phoenixKey: null,
  network: null,
  controllerPkh: null,
  isLoading: false,
  error: null,
};

// Async thunks for database operations

/**
 * Initialize database and load user data on login
 */
export const loginUser = createAsyncThunk(
  'user/loginUser',
  async (userData: User) => {
    try {
      const didKey = userData.did || userData.id;
      console.log(`[Redux] Logging in user with DID: ${didKey}`);

      await databaseManager.initializeForUser(didKey);

      const wallet = await database.getWallet(userData.id);
      const phoenixKey = await database.getPhoenixKey(userData.id);

      return {
        user: userData,
        wallet,
        phoenixKey,
      };
    } catch (error) {
      console.error('[Redux] Login failed:', error);
      throw error;
    }
  }
);

/**
 * Logout user and close database
 */
export const logoutUser = createAsyncThunk(
  'user/logoutUser',
  async () => {
    try {
      console.log('[Redux] Logging out user');
      await databaseManager.closeDatabase();
    } catch (error) {
      console.error('[Redux] Logout error:', error);
    }
  }
);

export const loadWallet = createAsyncThunk(
  'user/loadWallet',
  async (userId: string) => {
    databaseManager.ensureReady('loadWallet');
    const wallet = await database.getWallet(userId);
    return wallet;
  }
);

export const saveWallet = createAsyncThunk(
  'user/saveWallet',
  async (wallet: Wallet) => {
    databaseManager.ensureReady('saveWallet');
    await database.saveWallet(wallet);
    return wallet;
  }
);

/**
 * Lấy SỐ DƯ VÍ THẬT từ PhoenixKey backend (on-chain) theo DID.
 * Nguồn thật thay cho số bịa. Lỗi backend → throw, UI giữ "—" (không bịa).
 */
export const refreshWallet = createAsyncThunk(
  'user/refreshWallet',
  async (did: string) => {
    const balance = await phoenixKeyApi.wallet.getBalance(did);
    const wallet: Wallet = {
      id: did,
      userId: did,
      magicBalance: balance.balanceMagic,
      lampBalance: balance.balanceLamp,
      adaBalance: balance.balanceLovelace / 1_000_000,
      address: balance.address,
      magicAccrued: balance.magicAccrued,
      magicRatePerSlot: balance.magicRatePerSlot,
      pendingCredits: 0,
      lastSynced: new Date().toISOString(),
      fromChain: true,
    };
    return wallet;
  }
);

/**
 * Resolve mạng Cardano THEO DANH TÍNH THẬT (anh Aladin yêu cầu).
 * 1. did:cardano:<net>:... → lấy thẳng từ chuỗi DID.
 * 2. did:phoenix:... → hỏi backend /identity/{did}/document, đọc field network.
 * 3. Lỗi/offline → null (UI dùng nhãn mặc định từ env). KHÔNG đoán mainnet.
 *
 * Backend (PhoenixKey-PoC) ghi field tên `network`, giá trị BARE "preprod"/"mainnet"/
 * "preview" (trong block _phoenixkey). Một số biến thể W3C dùng "cardano:preprod" →
 * cắt tiền tố cardano:. Chỉ chấp nhận 1 trong 3 mạng đã biết (chặn khớp nhầm key 'network').
 */
const KNOWN_NETS = new Set(['mainnet', 'preprod', 'preview']);
const findCardanoNetwork = (obj: unknown): string | null => {
  if (!obj || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if ((k === 'network' || k === 'cardanoNetwork') && typeof v === 'string') {
      const net = v.replace(/^cardano:/, '');
      if (KNOWN_NETS.has(net)) return net;
    }
    if (v && typeof v === 'object') {
      const found = findCardanoNetwork(v);
      if (found) return found;
    }
  }
  return null;
};

export const resolveNetwork = createAsyncThunk(
  'user/resolveNetwork',
  async (did: string) => {
    const fromDid = parseDidNetwork(did);
    if (fromDid) return fromDid;
    try {
      const doc = await phoenixKeyApi.identity.getDocument(did);
      return findCardanoNetwork(doc);
    } catch {
      return null;
    }
  }
);

/**
 * Lấy KHOÁ ĐIỀU-KHIỂN DID (controller pkh) = ĐỊA-CHỈ-2: khoá QUẢN-TRỊ danh tính,
 * KHÔNG giữ tài sản (khác ví-seed giữ tiền ở refreshWallet). Nguồn: /identity/{did}/status.
 * Lỗi/offline → null (UI giữ "—", KHÔNG bịa) — cùng nguyên tắc refreshWallet/resolveNetwork.
 */
export const refreshControllerPkh = createAsyncThunk(
  'user/refreshControllerPkh',
  async (did: string) => {
    try {
      const status = await phoenixKeyApi.identity.getStatus(did);
      return status.currentControllerPkh ?? null;
    } catch {
      return null;
    }
  }
);

export const loadPhoenixKey = createAsyncThunk(
  'user/loadPhoenixKey',
  async (userId: string) => {
    databaseManager.ensureReady('loadPhoenixKey');
    const phoenixKey = await database.getPhoenixKey(userId);
    return phoenixKey;
  }
);

export const savePhoenixKey = createAsyncThunk(
  'user/savePhoenixKey',
  async (phoenixKey: PhoenixKey) => {
    databaseManager.ensureReady('savePhoenixKey');
    await database.savePhoenixKey(phoenixKey);
    return phoenixKey;
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.currentUser = action.payload;
      state.error = null;
    },
    logout: (state) => {
      state.currentUser = null;
      state.wallet = null;
      state.phoenixKey = null;
      state.network = null;
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    updateCredits: (state, action: PayloadAction<{ magic: number; lamp: number; ada: number }>) => {
      if (state.currentUser) {
        state.currentUser.magicCredits += action.payload.magic;
        state.currentUser.lampTokens += action.payload.lamp;
        state.currentUser.adaTokens += action.payload.ada;
      }
      if (state.wallet) {
        state.wallet.magicBalance += action.payload.magic;
        state.wallet.lampBalance += action.payload.lamp;
        state.wallet.adaBalance += action.payload.ada;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Login user - initialize database
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.currentUser = action.payload.user;
        state.wallet = action.payload.wallet;
        state.phoenixKey = action.payload.phoenixKey;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Login failed';
      })
      // Logout user - close database
      .addCase(logoutUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.currentUser = null;
        state.wallet = null;
        state.phoenixKey = null;
        state.network = null;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(logoutUser.rejected, (state) => {
        state.isLoading = false;
      })
      // Load wallet
      .addCase(loadWallet.fulfilled, (state, action) => {
        state.wallet = action.payload;
      })
      // Save wallet
      .addCase(saveWallet.fulfilled, (state, action) => {
        state.wallet = action.payload;
      })
      // Load phoenix key
      .addCase(loadPhoenixKey.fulfilled, (state, action) => {
        state.phoenixKey = action.payload;
      })
      // Save phoenix key
      .addCase(savePhoenixKey.fulfilled, (state, action) => {
        state.phoenixKey = action.payload;
      })
      // Ví thật từ chuỗi — chỉ set khi lấy được, lỗi thì giữ nguyên (không bịa)
      .addCase(refreshWallet.fulfilled, (state, action) => {
        state.wallet = action.payload;
      })
      // Mạng theo danh tính thật — chỉ set khi resolve được, null thì giữ nguyên
      .addCase(resolveNetwork.fulfilled, (state, action) => {
        if (action.payload) state.network = action.payload;
      })
      // Khoá điều-khiển DID (địa-chỉ-2) — chỉ set khi lấy được, null thì giữ nguyên
      .addCase(refreshControllerPkh.fulfilled, (state, action) => {
        if (action.payload) state.controllerPkh = action.payload;
      });
  },
});

export const { setUser, setLoading, setError, updateCredits, logout } = userSlice.actions;

/**
 * Ví ĐÁNG TIN để hiển thị số dư: chỉ trả về wallet khi số đến TỪ CHAIN
 * (refreshWallet). Wallet nạp từ DB cục bộ lúc login (không fromChain) → null,
 * để mọi màn hiển thị "—" thay vì số cũ. Dùng CHUNG cho mọi màn có số dư, tránh
 * mỗi nơi một kiểu gây mâu thuẫn (Account "—" mà Dashboard lại ra số).
 */
export const selectChainWallet = (state: { user: UserState }): Wallet | null =>
  state.user.wallet?.fromChain ? state.user.wallet : null;

export default userSlice.reducer;