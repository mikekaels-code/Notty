import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ThemeMode } from "../types";

export interface ThemeState {
  mode: ThemeMode;
}

const themeSlice = createSlice({
  name: "theme",
  initialState: { mode: "light" as ThemeMode },
  reducers: {
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
    },
    toggleTheme(state) {
      state.mode = state.mode === "light" ? "dark" : "light";
    },
  },
});

export const { setTheme, toggleTheme } = themeSlice.actions;
export default themeSlice.reducer;
