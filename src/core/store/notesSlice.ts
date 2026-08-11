import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { getStorageAdapter } from "../storage";
import { genId, nowIso } from "../utils";
import type { Note } from "../types";

export interface NotesState {
  notes: Note[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  savedAt: string | null;
}

const initialState: NotesState = {
  notes: [],
  activeId: null,
  loading: false,
  error: null,
  savedAt: null,
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Load all notes from storage. Assumes storage adapter is already ready. */
export const loadNotes = createAsyncThunk("notes/load", async (_: void, { rejectWithValue }) => {
  try {
    const notes = await getStorageAdapter().list();
    return notes;
  } catch (e) {
    return rejectWithValue(errMsg(e));
  }
});

/** Create + persist a new note. ensureReady may prompt for a folder on first save. */
export const createNote = createAsyncThunk("notes/create", async (draft: { title?: string; content?: string }, { rejectWithValue }) => {
  try {
    const adapter = getStorageAdapter();
    await adapter.ensureReady();
    const note: Note = {
      id: genId(),
      title: draft.title ?? "",
      content: draft.content ?? "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      pinned: false,
    };
    await adapter.create(note);
    return note;
  } catch (e) {
    return rejectWithValue(errMsg(e));
  }
});

/** Persist a note's current state (called after optimistic local patch + debounce). */
export const persistNote = createAsyncThunk("notes/persist", async (id: string, { getState, rejectWithValue }) => {
  const note = (getState() as { notes: NotesState }).notes.notes.find((n) => n.id === id);
  if (!note) return undefined;
  try {
    await getStorageAdapter().update(note);
    return id;
  } catch (e) {
    return rejectWithValue(errMsg(e));
  }
});

/** Persist removal after optimistic local delete. */
export const deleteNote = createAsyncThunk("notes/delete", async (id: string, { rejectWithValue }) => {
  try {
    await getStorageAdapter().remove(id);
    return id;
  } catch (e) {
    return rejectWithValue(errMsg(e));
  }
});

const notesSlice = createSlice({
  name: "notes",
  initialState,
  reducers: {
    setActiveId(state, action: PayloadAction<string | null>) {
      state.activeId = action.payload;
    },
    /** Optimistic local mutation; marks the note dirty (savedAt cleared). */
    patchNote(state, action: PayloadAction<{ id: string; patch: Partial<Pick<Note, "title" | "content" | "pinned">> }>) {
      const note = state.notes.find((n) => n.id === action.payload.id);
      if (!note) return;
      Object.assign(note, action.payload.patch, { updatedAt: nowIso() });
      state.savedAt = null;
    },
    markSaved(state, action: PayloadAction<string>) {
      const note = state.notes.find((n) => n.id === action.payload);
      if (note) state.savedAt = nowIso();
    },
    upsertNoteLocal(state, action: PayloadAction<Note>) {
      const idx = state.notes.findIndex((n) => n.id === action.payload.id);
      if (idx === -1) {
        state.notes.unshift(action.payload);
      } else {
        state.notes[idx] = action.payload;
      }
      state.notes = sortNotes(state.notes);
    },
    removeNoteLocal(state, action: PayloadAction<string>) {
      state.notes = state.notes.filter((n) => n.id !== action.payload);
      if (state.activeId === action.payload) state.activeId = state.notes[0]?.id ?? null;
    },
    resetNotes(state) {
      state.notes = [];
      state.activeId = null;
      state.savedAt = null;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadNotes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadNotes.fulfilled, (state, action) => {
        state.loading = false;
        state.notes = sortNotes(action.payload);
        if (!state.activeId || !state.notes.some((n) => n.id === state.activeId)) {
          state.activeId = state.notes[0]?.id ?? null;
        }
      })
      .addCase(loadNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload ?? action.error.message ?? "Failed to load notes");
      })
      .addCase(createNote.fulfilled, (state, action) => {
        state.notes.unshift(action.payload);
        state.activeId = action.payload.id;
        state.savedAt = nowIso();
        state.error = null;
      })
      .addCase(createNote.rejected, (state, action) => {
        state.error = String(action.payload ?? "Could not create note");
      })
      .addCase(persistNote.fulfilled, (state, action) => {
        if (action.payload) {
          state.savedAt = nowIso();
          state.notes = sortNotes(state.notes);
        }
      })
      .addCase(persistNote.rejected, (state, action) => {
        state.error = String(action.payload ?? "Could not save note");
      })
      .addCase(deleteNote.fulfilled, (state, action) => {
        state.notes = state.notes.filter((n) => n.id !== action.payload);
        if (state.activeId === action.payload) state.activeId = state.notes[0]?.id ?? null;
      })
      .addCase(deleteNote.rejected, (state, action) => {
        state.error = String(action.payload ?? "Could not delete note");
      });
  },
});

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export const { setActiveId, patchNote, markSaved, upsertNoteLocal, removeNoteLocal, resetNotes, setError } =
  notesSlice.actions;
export default notesSlice.reducer;
