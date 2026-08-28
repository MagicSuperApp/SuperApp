// store/userSlice.ts

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { User } from '../types';
import { database } from '../utils/database';
import { databaseManager } from '../services/databaseManager';
import { phoenixKeyApi, summarizeWalletAll, type WalletEntry } from '../services/phoenixKey-api';
import { parseDidNetwork } from '../services/phoenixDid';
import { clearWorkSession } from '../modules/work/services/session';
import { clearOrilifeToken } from '../services/orilifeDidAuth';
import { disconnectProofChat } from '../services/proofchatAuthBridge';
import { clearAllDrafts } from '../services/treeDraftStore';
import { setVideoQueueOwner, flushVideoUploadQueue } from '../services/videoUploadQueue';

/**
 * ⚠ ĐƠN VỊ — đọc trước khi hiện bất cứ con số nào ra màn hình.
 *
 * Store này TRỘN hai quy ước, và đó chính là cái bẫy đã làm màn ví hiện LAMP gấp
 * 1.000.000 lần (LAMP agent phát hiện 2026-07-29):
 *   · `adaBalance`  — ĐÃ chia, đơn vị ADA (người đọc được)
 *   · `lampBalance` — CHƯA chia, đơn vị **oildrop** (thô on-chain, 1 LAMP = 10⁶)
 *   · `carpBalance` — CHƯA chia, đơn vị **nanothread** (thô on-chain, 1 CARP = 10⁹)
 *   · `magicBalance`— sổ vault, không đọc từ UTxO; đơn vị chưa chốt (chờ MAGIC agent)
 *
 * Vì vậy MỌI chỗ hiện `lampBalance` PHẢI đi qua `fmtLamp()` (`src/utils/token.ts`).
 * Đừng in thẳng. Việc thống nhất một quy ước cho cả store là dòng riêng trong sổ
 * bàn giao — không làm giữa đợt thực địa vì nó đụng 6 màn.
 */
interface Wallet {
  id: string;
  userId: string;
  /** Sổ vault MAGIC — đơn vị chưa chốt. */
  magicBalance: number;
  /** **oildrop** (thô). Hiện ra màn hình PHẢI qua `fmtLamp()`. */
  lampBalance: number;
  // CARP — token hệ sinh thái thứ 3. Backend PhoenixKey CHƯA trả số dư → optional, hiện '—'
  // tới khi có API thật (xem message hỏi Phoenix Agent). Thứ tự chuẩn: MAGIC · LAMP · CARP.
  /** Thô, đơn vị nanothread. Hiện PHẢI qua `fmtCarp()` — in thẳng là sai 10⁹ lần. */
  carpBalance?: number;
  /** ĐÃ chia — đơn vị ADA. */
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
  // CẢ HAI ví từ /wallet/{did}/all: `phoenix` (hệ-thống giữ, backend derive theo DID) và
  // `standard` (CIP-1852, user tự giữ khoá từ Master_KEK). Rỗng = chưa refresh / chưa có ví.
  // `wallet` ở trên chỉ là bản RÚT-GỌN 1-ví (tổng quan) — dùng `wallets` khi cần tách bạch.
  wallets: WalletEntry[];
  phoenixKey: PhoenixKey | null;
  // Mạng Cardano THẬT theo danh tính (resolveNetwork). null = chưa rõ → UI dùng nhãn env.
  network: string | null;
  // "Chưa rõ" có HAI nghĩa rất khác nhau, và trước đây UI chỉ có một chữ cho cả hai:
  //   · đang gọi thật    → `networkResolving = true`  → "Đang kiểm tra…" là thật
  //   · gọi xong, hỏng   → `networkUnknown = true`    → phải mời người dùng thử lại
  // Gộp hai ca vào một chữ "Đang xác định" là app hứa đang làm việc trong khi không
  // có lượt gọi nào đang chạy — người dùng ngồi chờ một thứ không bao giờ tới.
  networkResolving: boolean;
  networkUnknown: boolean;
  // Tương tự cho ví: lấy hỏng thì phải nói, đừng để màn hình trống nhìn như "chưa có ví".
  walletFailed: boolean;
  // Khoá ĐIỀU-KHIỂN DID (controller pkh) = địa-chỉ-2, khoá QUẢN-TRỊ danh-tính, KHÔNG giữ tài sản
  // (khác ví-seed giữ tiền ở `wallet.address`). null = chưa lấy được (refreshControllerPkh).
  controllerPkh: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: UserState = {
  currentUser: null,
  wallet: null,
  wallets: [],
  phoenixKey: null,
  network: null,
  networkResolving: false,
  networkUnknown: false,
  walletFailed: false,
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

      // Hàng đợi video nằm dưới MỘT khoá toàn cục và sống qua đăng xuất. Gắn chủ
      // cho phiên này để flush chỉ đụng clip của người đang đăng nhập — clip của
      // người trước nằm yên chờ chính họ đăng nhập lại, không bị gửi hộ.
      setVideoQueueOwner(didKey);
      // App KHÔNG auto-login (navigation/index.tsx:1663 luôn vào Login), nên flush lúc
      // App mount chạy khi chưa có chủ và bỏ qua clip có chủ. Đây là nhịp đầu tiên
      // biết chủ là ai → đẩy luôn clip còn kẹt của chính người vừa đăng nhập.
      void flushVideoUploadQueue().catch(() => {});

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
    // Xoá phiên XUYÊN MODULE trước khi đóng DB — nếu không, token Work (sống ~12h) +
    // kết nối ProofChat sống sót qua đăng xuất → rò dữ liệu user A→B trên máy dùng chung.
    // Best-effort: lỗi 1 nhánh KHÔNG được chặn đăng xuất (vẫn phải đóng DB per-user).
    try {
      await clearWorkSession();
    } catch (error) {
      console.warn('[Redux] Logout: clearWorkSession lỗi (bỏ qua):', error);
    }
    try {
      await disconnectProofChat();
    } catch (error) {
      console.warn('[Redux] Logout: disconnectProofChat lỗi (bỏ qua):', error);
    }
    try {
      // ⛔ Đường RÒ LỚN NHẤT, và là đường duy nhất trong khối này bị bỏ sót tới
      // 2026-08-28: `auth_token` OriLife sống qua đăng xuất. 17 chỗ trong app đọc
      // thẳng khoá đó — vườn, cây, con, chăm sóc, dòng thời gian, truy xuất, video,
      // trôi mẫu, ảnh. Người sau đăng nhập trên cùng máy thì mọi lời gọi đó vẫn đi
      // ra MANG DANH người trước, im lặng, cho tới khi token hết hạn.
      // `clearOrilifeToken` xoá cả owner-ref, dấu chủ token, và đệm đầu đề ảnh.
      await clearOrilifeToken();
    } catch (error) {
      console.warn('[Redux] Logout: clearOrilifeToken lỗi (bỏ qua):', error);
    }
    try {
      // Nháp chụp cây / video quả là dữ liệu PHIÊN. Tablet field dùng CHUNG → xoá sạch
      // khi đăng xuất để nháp (ảnh+GPS+tên) user A KHÔNG lọt vào form user B. Namespace
      // theo owner đã chặn đường app-kill; đây là lớp chắc chắn cho đường đăng xuất.
      await clearAllDrafts();
    } catch (error) {
      console.warn('[Redux] Logout: clearAllDrafts lỗi (bỏ qua):', error);
    }
    // Bỏ chủ hàng đợi video: từ giờ tới lần đăng nhập kế, flush KHÔNG được đụng
    // clip có chủ. Cố ý KHÔNG xoá hàng đợi — clip quay ngoài đồng chưa gửi được là
    // dữ liệu thật của người trước, xoá đi là mất trắng công một buổi.
    setVideoQueueOwner(null);
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
    // Endpoint GỘP /wallet/{did}/all (API.md §7). `/balance` cũ deprecated: ép MAGIC=0
    // và thiếu địa-chỉ → chính là lý do màn Tài-khoản không hiện ví. Đọc địa-chỉ + số dư
    // từ ví CÓ THẬT: ưu tiên Standard (CIP-1852, user tự kiểm-soát), fallback Phoenix custody.
    const all = await phoenixKeyApi.wallet.getAll(did);
    const s = summarizeWalletAll(all);
    const wallet: Wallet = {
      id: did,
      userId: did,
      magicBalance: s.magicAvailable,
      lampBalance: s.lamp,
      carpBalance: s.carp,
      adaBalance: s.lovelace / 1_000_000,
      address: s.address,
      magicAccrued: s.magicAccrued,
      pendingCredits: 0,
      lastSynced: new Date().toISOString(),
      fromChain: true,
    };
    // GIỮ NGUYÊN cả mảng ví (phoenix + standard) để UI hiện TÁCH BẠCH 2 ví — `wallet`
    // ở trên chỉ là bản rút-gọn 1-ví cho các màn cũ (tổng quan / SDK).
    return { wallet, wallets: all.wallets };
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
      state.wallets = [];
      state.phoenixKey = null;
      state.network = null;
      state.controllerPkh = null;   // audit #3: tránh rò khoá quản-trị sang tài-khoản kế
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
        state.controllerPkh = null;   // audit #3: xoá khoá quản-trị user cũ tới khi refreshControllerPkh(user mới) chạy
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
        state.controllerPkh = null;   // audit #3: tránh rò khoá quản-trị sang tài-khoản kế
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
        state.wallet = action.payload.wallet;
        state.wallets = action.payload.wallets;
        state.walletFailed = false;
      })
      .addCase(refreshWallet.rejected, (state) => {
        state.walletFailed = true;
      })
      // Mạng theo danh tính thật — chỉ set khi resolve được, null thì giữ nguyên.
      // `resolveNetwork` tự nuốt lỗi và trả `null`, nên nhánh HỎNG đi qua `fulfilled`
      // chứ không qua `rejected` — phải xét payload, không xét loại action.
      .addCase(resolveNetwork.pending, (state) => {
        state.networkResolving = true;
      })
      .addCase(resolveNetwork.fulfilled, (state, action) => {
        state.networkResolving = false;
        if (action.payload) {
          state.network = action.payload;
          state.networkUnknown = false;
        } else {
          state.networkUnknown = true;
        }
      })
      .addCase(resolveNetwork.rejected, (state) => {
        state.networkResolving = false;
        state.networkUnknown = true;
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

/**
 * CẢ HAI ví (phoenix custody + standard CIP-1852) từ /wallet/{did}/all — để UI hiện
 * TÁCH BẠCH. Rỗng = chưa refresh hoặc DID chưa có ví nào trên backend.
 */
export const selectChainWallets = (state: { user: UserState }): WalletEntry[] =>
  state.user.wallets;

export default userSlice.reducer;