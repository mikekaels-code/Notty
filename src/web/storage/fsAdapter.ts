import type { Note, NotesStorageAdapter } from "../../core/types";
import { noteFilename, parseNoteFile, serializeNote } from "../../core/utils";

/**
 * File System Access API adapter. Each note is its own Markdown file with a
 * JSON frontmatter block, inside the directory the user picks once.
 *
 * `pickDirectory` is provided by the caller (web shell) and must persist the
 * chosen handle so future sessions don't re-prompt.
 */
export function createFsAdapter(
  pickDirectory: () => Promise<FileSystemDirectoryHandle>,
): NotesStorageAdapter {
  let root: FileSystemDirectoryHandle | null = null;

  async function ensureReady(): Promise<void> {
    if (root) {
      const perm = await root.requestPermission({ mode: "readwrite" });
      if (perm === "granted") return;
      if (perm === "denied") throw new Error("Access to your notes folder was denied.");
      root = await pickDirectory();
      return;
    }
    root = await pickDirectory();
  }

  async function getRoot(): Promise<FileSystemDirectoryHandle> {
    await ensureReady();
    if (!root) throw new Error("No notes folder selected.");
    return root;
  }

  async function readFileText(fileHandle: FileSystemFileHandle): Promise<string> {
    const file = await fileHandle.getFile();
    return file.text();
  }

  async function writeFileText(fileHandle: FileSystemFileHandle, text: string): Promise<void> {
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  return {
    async ensureReady() {
      await ensureReady();
    },

    async list(): Promise<Note[]> {
      const dir = await getRoot();
      const notes: Note[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind !== "file") continue;
        const name = entry.name;
        if (!name.endsWith(".md")) continue;
        const id = name.slice(0, -3);
        try {
          const raw = await readFileText(entry);
          const parsed = parseNoteFile(raw, id);
          notes.push({
            id,
            title: parsed.title,
            content: parsed.content,
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
            pinned: parsed.pinned,
          });
        } catch {
          /* skip unreadable/corrupt file */
        }
      }
      return notes;
    },

    async read(id: string): Promise<Note> {
      const dir = await getRoot();
      const handle = await dir.getFileHandle(`${id}.md`);
      const raw = await readFileText(handle);
      const parsed = parseNoteFile(raw, id);
      return {
        id,
        title: parsed.title,
        content: parsed.content,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        pinned: parsed.pinned,
      };
    },

    async create(note: Note): Promise<void> {
      const dir = await getRoot();
      const handle = await dir.getFileHandle(noteFilename(note), { create: true });
      await writeFileText(handle, serializeNote(note));
    },

    async update(note: Note): Promise<void> {
      const dir = await getRoot();
      const handle = await dir.getFileHandle(noteFilename(note), { create: true });
      await writeFileText(handle, serializeNote(note));
    },

    async remove(id: string): Promise<void> {
      const dir = await getRoot();
      try {
        await dir.removeEntry(`${id}.md`);
      } catch (e) {
        if (e instanceof DOMException && e.name === "NotFoundError") return;
        throw e;
      }
    },
  };
}
