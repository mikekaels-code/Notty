import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import notesReducer from "./notesSlice";
import chatReducer from "./chatSlice";
import themeReducer, { setTheme } from "./themeSlice";
import settingsReducer, { loadSettings } from "./settingsSlice";
import type { RootState } from "./types";

const PERSIST_KEYS: Record<string, string> = {
  settings: "smartnotes_settings",
  theme: "smartnotes_theme",
};

const persistMiddleware = createListenerMiddleware();

persistMiddleware.startListening({
  predicate: (_action, currentState, previousState) => {
    return (currentState as RootState).settings !== (previousState as RootState).settings;
  },
  effect: (_action, listenerApi) => {
    const { settings } = listenerApi.getState() as RootState;
    localStorage.setItem(PERSIST_KEYS.settings, JSON.stringify({ apiKey: settings.apiKey, storageMode: settings.storageMode }));
  },
});

persistMiddleware.startListening({
  predicate: (_action, currentState, previousState) => {
    return (currentState as RootState).theme !== (previousState as RootState).theme;
  },
  effect: (_action, listenerApi) => {
    const { mode } = (listenerApi.getState() as RootState).theme;
    localStorage.setItem(PERSIST_KEYS.theme, JSON.stringify({ mode }));
  },
});

/** Rehydrate persisted slices on boot (call before render). */
export function rehydrateStore(store: ReturnType<typeof makeStore>): void {
  try {
    const rawSettings = localStorage.getItem(PERSIST_KEYS.settings);
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings) as { apiKey?: string; storageMode?: "filesystem" | "fallback" };
      store.dispatch(loadSettings({ apiKey: parsed.apiKey ?? "", storageMode: parsed.storageMode ?? "filesystem" }));
    }
    const rawTheme = localStorage.getItem(PERSIST_KEYS.theme);
    if (rawTheme) {
      const parsed = JSON.parse(rawTheme) as { mode?: string };
      if (parsed.mode === "light" || parsed.mode === "dark") store.dispatch(setTheme(parsed.mode));
    }
  } catch {
    /* corrupted storage -> start fresh */
  }
}

export function makeStore() {
  return configureStore({
    reducer: {
      notes: notesReducer,
      chat: chatReducer,
      theme: themeReducer,
      settings: settingsReducer,
    },
    middleware: (gdm) => gdm().prepend(persistMiddleware.middleware),
  });
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type { RootState };

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
