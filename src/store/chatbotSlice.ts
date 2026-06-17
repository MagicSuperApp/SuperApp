// store/chatbotSlice.ts
//
// Trạng thái cho bong bóng trợ lý nổi: bật/tắt + vị trí kéo thả (lưu giữa các phiên).

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chatbot_settings_v1';

export interface ChatbotPosition {
  x: number;
  y: number;
}

interface ChatbotState {
  enabled: boolean;
  position: ChatbotPosition | null;
  hydrated: boolean;
}

const initialState: ChatbotState = {
  enabled: true,
  position: null,
  hydrated: false,
};

const persist = (state: ChatbotState) => {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ enabled: state.enabled, position: state.position }),
  ).catch(() => {});
};

export const hydrateChatbot = createAsyncThunk('chatbot/hydrate', async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<ChatbotState>) : null;
  } catch {
    return null;
  }
});

const slice = createSlice({
  name: 'chatbot',
  initialState,
  reducers: {
    setChatbotEnabled(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
      persist(state);
    },
    setChatbotPosition(state, action: PayloadAction<ChatbotPosition>) {
      state.position = action.payload;
      persist(state);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(hydrateChatbot.fulfilled, (state, action) => {
      if (action.payload) {
        if (typeof action.payload.enabled === 'boolean') {
          state.enabled = action.payload.enabled;
        }
        if (action.payload.position) {
          state.position = action.payload.position;
        }
      }
      state.hydrated = true;
    });
  },
});

export const { setChatbotEnabled, setChatbotPosition } = slice.actions;
export default slice.reducer;
