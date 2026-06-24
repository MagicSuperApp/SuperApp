// store/phoenixWalletSlice.ts
//
// State + thunk cho luồng KÝ TÁC-VỤ bằng Ví Phượng hoàng (did_payment).
//
// Máy-trạng-thái 1 yêu-cầu ký: idle → building → review → signing → submitted | error.
//   - building : đang gọi backend build-tx (Phase 2 — ném disabled khi cờ tắt).
//   - review   : có TxPreview, ĐANG CHỜ user duyệt displayText (KHÔNG tự ký).
//   - signing  : user đã duyệt → sinh-trắc + submit.
//   - submitted: có txHash.
// Mọi lỗi → error (giữ userMessage thân-thiện, KHÔNG lộ lỗi kỹ-thuật ra UI).

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  buildActionTx,
  signAndSubmit,
  type TxPreview,
  type SignedTxResult,
  type WalletActionIntent,
  PhoenixWalletDisabledError,
  NetworkNotAllowedError,
  KeypairNotEnrolledError,
} from '../services/phoenixWallet';

export type SignPhase =
  | 'idle'
  | 'building'
  | 'review'
  | 'signing'
  | 'submitted'
  | 'error';

interface PhoenixWalletState {
  phase: SignPhase;
  preview: TxPreview | null;
  result: SignedTxResult | null;
  /** Thông-điệp thân-thiện cho UI. null khi không lỗi. */
  errorMessage: string | null;
}

const initialState: PhoenixWalletState = {
  phase: 'idle',
  preview: null,
  result: null,
  errorMessage: null,
};

/** Dịch lỗi kỹ-thuật → câu thân-thiện (theo nguyên-tắc UX của repo). */
const toUserMessage = (err: unknown): string => {
  if (
    err instanceof PhoenixWalletDisabledError ||
    err instanceof NetworkNotAllowedError ||
    err instanceof KeypairNotEnrolledError
  ) {
    return err.message;
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const m = String((err as { message?: unknown }).message ?? '');
    // Người dùng huỷ sinh-trắc → không phải "lỗi" theo nghĩa xấu.
    if (m.includes('E_USER_CANCELED')) return 'Bạn đã huỷ xác thực sinh trắc.';
    if (m.includes('E_BIOMETRIC_LOCKOUT'))
      return 'Sinh trắc tạm khoá — thử lại sau ít phút.';
  }
  return 'Không thể ký giao dịch. Vui lòng thử lại.';
};

/** BƯỚC 1–3: build tx + lấy preview để user duyệt. */
export const buildWalletTx = createAsyncThunk<TxPreview, WalletActionIntent>(
  'phoenixWallet/buildTx',
  async (intent, { rejectWithValue }) => {
    try {
      return await buildActionTx(intent);
    } catch (err) {
      return rejectWithValue(toUserMessage(err)) as never;
    }
  },
);

/** BƯỚC 4–5: ký digest + submit. Chỉ gọi sau khi user duyệt preview. */
export const confirmAndSign = createAsyncThunk<SignedTxResult, TxPreview>(
  'phoenixWallet/confirmAndSign',
  async (preview, { rejectWithValue }) => {
    try {
      return await signAndSubmit(preview);
    } catch (err) {
      return rejectWithValue(toUserMessage(err)) as never;
    }
  },
);

const phoenixWalletSlice = createSlice({
  name: 'phoenixWallet',
  initialState,
  reducers: {
    resetWalletSign: () => initialState,
  },
  extraReducers: builder => {
    builder
      .addCase(buildWalletTx.pending, state => {
        state.phase = 'building';
        state.errorMessage = null;
        state.preview = null;
        state.result = null;
      })
      .addCase(buildWalletTx.fulfilled, (state, action) => {
        state.phase = 'review';
        state.preview = action.payload;
      })
      .addCase(buildWalletTx.rejected, (state, action) => {
        state.phase = 'error';
        state.errorMessage =
          (action.payload as string | undefined) ?? 'Không thể tạo giao dịch.';
      })
      .addCase(confirmAndSign.pending, state => {
        state.phase = 'signing';
        state.errorMessage = null;
      })
      .addCase(confirmAndSign.fulfilled, (state, action) => {
        state.phase = 'submitted';
        state.result = action.payload;
      })
      .addCase(confirmAndSign.rejected, (state, action) => {
        // Lỗi khi ký → quay lại review để user thử lại (preview vẫn còn).
        state.phase = 'review';
        state.errorMessage =
          (action.payload as string | undefined) ?? 'Không thể ký giao dịch.';
      });
  },
});

export const { resetWalletSign } = phoenixWalletSlice.actions;

export const selectSignPhase = (s: {
  phoenixWallet: PhoenixWalletState;
}): SignPhase => s.phoenixWallet.phase;

export const selectTxPreview = (s: {
  phoenixWallet: PhoenixWalletState;
}): TxPreview | null => s.phoenixWallet.preview;

export const selectSignResult = (s: {
  phoenixWallet: PhoenixWalletState;
}): SignedTxResult | null => s.phoenixWallet.result;

export const selectSignError = (s: {
  phoenixWallet: PhoenixWalletState;
}): string | null => s.phoenixWallet.errorMessage;

export default phoenixWalletSlice.reducer;
export type { PhoenixWalletState };

// Cho UI dùng lại kiểu intent mà không phải import từ service trực tiếp.
export type { WalletActionIntent, TxPreview, SignedTxResult } from '../services/phoenixWallet';
