// store/index.ts

import { configureStore } from '@reduxjs/toolkit';
import userReducer from './userSlice';
import farmReducer from '../modules/trace/store/farmSlice';
import proofchatReducer from '../modules/proofchat/store/proofchatSlice';
import syncReducer from './syncSlice';
import chatbotReducer from './chatbotSlice';
import treeReIDReducer from './treeReIDSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    farm: farmReducer,
    proofchat: proofchatReducer,
    sync: syncReducer,
    chatbot: chatbotReducer,
    treeReID: treeReIDReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;