import type { ChatState } from "./chatSlice";
import type { NotesState } from "./notesSlice";
import type { SettingsState } from "./settingsSlice";
import type { ThemeState } from "./themeSlice";

/** Root state shape, kept in its own file so slices and the store avoid import cycles. */
export interface RootState {
  chat: ChatState;
  notes: NotesState;
  settings: SettingsState;
  theme: ThemeState;
}
