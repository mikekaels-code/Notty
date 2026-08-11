import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { StorageMode } from "../types";

export interface SettingsState {
  apiKey: string;
  storageMode: StorageMode;
  folderChosen: boolean;
  needsFolderPick: boolean;
  model: string;
}

const DEFAULT_MODEL = "deepseek-chat";

function initialState(): SettingsState {
  return {
    apiKey: "",
    storageMode: "filesystem",
    folderChosen: false,
    needsFolderPick: false,
    model: DEFAULT_MODEL,
  };
}

const settingsSlice = createSlice({
  name: "settings",
  initialState: initialState(),
  reducers: {
    setApiKey(state, action: PayloadAction<string>) {
      state.apiKey = action.payload;
    },
    setStorageMode(state, action: PayloadAction<StorageMode>) {
      state.storageMode = action.payload;
    },
    setFolderChosen(state, action: PayloadAction<boolean>) {
      state.folderChosen = action.payload;
      state.needsFolderPick = !action.payload;
    },
    setNeedsFolderPick(state, action: PayloadAction<boolean>) {
      state.needsFolderPick = action.payload;
    },
    setModel(state, action: PayloadAction<string>) {
      state.model = action.payload;
    },
    /** Rehydrate from localStorage on boot. */
    loadSettings(state, action: PayloadAction<Partial<SettingsState>>) {
      Object.assign(state, action.payload);
    },
  },
});

export const { setApiKey, setStorageMode, setFolderChosen, setNeedsFolderPick, setModel, loadSettings } =
  settingsSlice.actions;
export default settingsSlice.reducer;
