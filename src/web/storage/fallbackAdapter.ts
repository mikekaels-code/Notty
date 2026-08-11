import type { Note, NotesStorageAdapter } from "../../core/types";

const KEY = "smartnotes_fallback_notes";

function readAll(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

function writeAll(notes: Note[]): void {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

export function createFallbackAdapter(): NotesStorageAdapter {
  return {
    async ensureReady() {
      /* localStorage is always ready */
    },

    async list() {
      return readAll();
    },

    async read(id) {
      const notes = readAll();
      const note = notes.find((n) => n.id === id);
      if (!note) throw new Error(`Note "${id}" not found.`);
      return note;
    },

    async create(note) {
      const notes = readAll();
      notes.push(note);
      writeAll(notes);
    },

    async update(note) {
      const notes = readAll();
      const idx = notes.findIndex((n) => n.id === note.id);
      if (idx === -1) throw new Error(`Note "${note.id}" not found.`);
      notes[idx] = note;
      writeAll(notes);
    },

    async remove(id) {
      writeAll(readAll().filter((n) => n.id !== id));
    },
  };
}
