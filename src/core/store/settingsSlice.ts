import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { StorageMode } from "../types";
import { fetchProviderModels, isProvider } from "../ai/deepseek";

export interface SettingsState {
  apiKeys: Record<string, string>;
  provider: string;
  storageMode: StorageMode;
  folderChosen: boolean;
  needsFolderPick: boolean;
  model: string;
  categories: string[];
  cachedModels: Record<string, string[]>;
}

const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_MODEL = "deepseek-chat";

function initialState(): SettingsState {
  return {
    apiKeys: {},
    provider: DEFAULT_PROVIDER,
    storageMode: "filesystem",
    folderChosen: false,
    needsFolderPick: false,
    model: DEFAULT_MODEL,
    categories: [],
    cachedModels: {},
  };
}

/** Fetch available models from the provider's API. Falls back to hardcoded list. */
export const refreshModels = createAsyncThunk("settings/refreshModels", async (provider: string) => {
  const prov = provider as Parameters<typeof isProvider>[0];
  if (!isProvider(prov)) return { provider, models: null as string[] | null };
  const key = localStorage.getItem("notty_settings");
  if (!key) return { provider, models: null as string[] | null };
  try {
    const parsed = JSON.parse(key);
    const apiKey = parsed.apiKeys?.[provider] ?? "";
    if (!apiKey) return { provider, models: null as string[] | null };
    const models = await fetchProviderModels(prov, apiKey);
    return { provider, models };
  } catch {
    return { provider, models: null as string[] | null };
  }
});

const settingsSlice = createSlice({
  name: "settings",
  initialState: initialState(),
  reducers: {
    setApiKey(state, action: PayloadAction<{ provider: string; key: string }>) {
      const { provider, key } = action.payload;
      if (key.trim()) state.apiKeys[provider] = key;
      else delete state.apiKeys[provider];
    },
    setProvider(state, action: PayloadAction<string>) {
      state.provider = action.payload;
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
    /** Add a category if it doesn't already exist. */
    addCategory(state, action: PayloadAction<string>) {
      const name = action.payload.trim();
      if (name && !state.categories.includes(name)) state.categories.push(name);
    },
    /** Rehydrate from localStorage on boot. */
    loadSettings(state, action: PayloadAction<Partial<SettingsState>>) {
      Object.assign(state, action.payload);
    },
    setCachedModels(state, action: PayloadAction<{ provider: string; models: string[] }>) {
      state.cachedModels[action.payload.provider] = action.payload.models;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(refreshModels.fulfilled, (state, action) => {
      if (action.payload.models) {
        state.cachedModels[action.payload.provider] = action.payload.models;
      }
    });
  },
});

export const { setApiKey, setProvider, setStorageMode, setFolderChosen, setNeedsFolderPick, setModel, addCategory, loadSettings, setCachedModels } =
  settingsSlice.actions;
export default settingsSlice.reducer;
