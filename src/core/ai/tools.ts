import type { Note, NotesStorageAdapter } from "../types";
import { genId, nowIso, deriveTitle } from "../utils";

export interface ToolCallArg {
  note_id?: unknown;
  title?: unknown;
  content?: unknown;
}

export interface ToolExecution {
  ok: boolean;
  /** Full payload sent back to the model for the next round. */
  summary: string;
  /** Short human-readable confirmation shown in the chat UI. */
  label: string;
  /** Set when the tool created/updated a note so the caller can sync Redux. */
  note?: Note;
  deletedId?: string;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Tool "${name}" is missing required argument.`);
  return v;
}

export async function executeTool(
  adapter: NotesStorageAdapter,
  name: string,
  args: ToolCallArg,
): Promise<ToolExecution> {
  switch (name) {
    case "list_notes": {
      const notes = await adapter.list();
      const lines = notes.map((n) => `${n.pinned ? "📌" : ""} [${n.id}] "${n.title}" — edited ${n.updatedAt}`);
      return {
        ok: true,
        summary: `Found ${notes.length} note(s).\n${lines.join("\n") || "(no notes yet)"}`,
        label: `Listed ${notes.length} note${notes.length === 1 ? "" : "s"}.`,
      };
    }
    case "read_note": {
      const id = str(args.note_id, name);
      const note = await adapter.read(id);
      return { ok: true, summary: `# ${note.title}\n${note.content}`, label: `Read "${note.title}".` };
    }
    case "create_note": {
      const title = str(args.title, name);
      const content = str(args.content, name);
      const note: Note = {
        id: genId(),
        title,
        content,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        pinned: false,
      };
      await adapter.create(note);
      return { ok: true, summary: `Created "${title}".`, label: `Created "${title}".`, note };
    }
    case "update_note": {
      const id = str(args.note_id, name);
      const content = str(args.content, name);
      const existing = await adapter.read(id);
      const title = typeof args.title === "string" && args.title.trim() ? args.title : deriveTitle(content, id);
      const note: Note = { ...existing, title, content, updatedAt: nowIso() };
      await adapter.update(note);
      return { ok: true, summary: `Updated "${title}".`, label: `Updated "${title}".`, note };
    }
    case "delete_note": {
      const id = str(args.note_id, name);
      await adapter.remove(id);
      return { ok: true, summary: `Deleted note ${id}.`, label: `Deleted note ${id}.`, deletedId: id };
    }
    default:
      return { ok: false, summary: `Unknown tool: ${name}`, label: `Unknown tool: ${name}` };
  }
}
