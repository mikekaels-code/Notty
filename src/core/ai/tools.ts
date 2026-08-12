import type { Note, NotesStorageAdapter } from "../types";
import { genId, nowIso, deriveTitle } from "../utils";

export interface ToolCallArg {
  note_id?: unknown;
  parent_id?: unknown;
  title?: unknown;
  content?: unknown;
  category?: unknown;
  note_ids?: unknown;
  query?: unknown;
}

function optString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v;
  return undefined;
}

/** Returns undefined when unchanged, null when explicitly cleared. */
function optStringOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string" && v.trim()) return v;
  return null;
}

export interface ToolExecution {
  ok: boolean;
  /** Full payload sent back to the model for the next round. */
  summary: string;
  /** Short human-readable confirmation shown in the chat UI. */
  label: string;
  /** Set when the tool created/updated a note so the caller can sync Redux. */
  note?: Note;
  /** Set when the tool updated several notes (e.g. reordering siblings). */
  notes?: Note[];
  /** Set when the tool assigned a category that the caller should register. */
  category?: string;
  deletedId?: string;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`Tool "${name}" is missing required argument.`);
  return v;
}

function stripTitleHeading(content: string, title: string): string {
  const prefix = `# ${title}\n\n`;
  return content.startsWith(prefix) ? content.slice(prefix.length) : content;
}

export async function executeTool(
  adapter: NotesStorageAdapter,
  name: string,
  args: ToolCallArg,
): Promise<ToolExecution> {
  switch (name) {
    case "list_notes": {
      const notes = await adapter.list();
      const lines = notes.map((n) => {
        const rel = [n.parentId ? `child of ${n.parentId}` : null, n.category ? `category "${n.category}"` : null]
          .filter(Boolean)
          .join(", ");
        return `${n.pinned ? "📌" : ""} [${n.id}] "${n.title}"${rel ? ` (${rel})` : ""} — edited ${n.updatedAt}`;
      });
      return {
        ok: true,
        summary: `Found ${notes.length} note(s).\n${lines.join("\n") || "(no notes yet)"}`,
        label: `Listed ${notes.length} note${notes.length === 1 ? "" : "s"}.`,
      };
    }
    case "read_note": {
      const id = str(args.note_id, name);
      const note = await adapter.read(id);
      return { ok: true, summary: `Title: ${note.title}\n\n${note.content}`, label: `Read "${note.title}".` };
    }
    case "create_note": {
      const title = str(args.title, name);
      const content = stripTitleHeading(str(args.content, name), title);
      const parentId = optString(args.parent_id);
      const category = optString(args.category);
      const note: Note = {
        id: genId(),
        title,
        content,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        pinned: false,
        ...(parentId ? { parentId } : {}),
        ...(category ? { category } : {}),
      };
      await adapter.create(note);
      return { ok: true, summary: `Created "${title}".`, label: `Created "${title}".`, note };
    }
    case "update_note": {
      const id = str(args.note_id, name);
      const existing = await adapter.read(id);
      const title = typeof args.title === "string" && args.title.trim() ? args.title : deriveTitle(str(args.content, name), id);
      const content = stripTitleHeading(str(args.content, name), title);
      const parentId = optStringOrNull(args.parent_id);
      const category = optStringOrNull(args.category);
      const note: Note = {
        ...existing,
        title,
        content,
        updatedAt: nowIso(),
        ...(parentId !== undefined ? { parentId: parentId ?? undefined } : {}),
        ...(category !== undefined ? { category: category ?? undefined } : {}),
      };
      await adapter.update(note);
      return { ok: true, summary: `Updated "${title}".`, label: `Updated "${title}".`, note };
    }
    case "delete_note": {
      const id = str(args.note_id, name);
      const existing = await adapter.read(id);
      const label = existing?.title ? `Deleted "${existing.title}".` : `Deleted note.`;
      await adapter.remove(id);
      return { ok: true, summary: label, label, deletedId: id };
    }
    case "reorder_notes": {
      const ids = Array.isArray(args.note_ids) ? args.note_ids.filter((x): x is string => typeof x === "string") : [];
      if (ids.length < 2) throw new Error(`Tool "${name}" needs a note_ids list of at least two sibling notes.`);
      const all = await adapter.list();
      const byId = new Map(all.map((n) => [n.id, n]));
      const missing = ids.filter((x) => !byId.has(x));
      if (missing.length) throw new Error(`Tool "${name}": unknown note ids ${missing.join(", ")}. List notes first.`);
      const ref = byId.get(ids[0])!;
      const parent = ref.parentId;
      const bad = ids.filter((x) => (byId.get(x)?.parentId ?? undefined) !== (parent ?? undefined));
      if (bad.length)
        throw new Error(`Tool "${name}" only reorders siblings under the same parent; ${bad.join(", ")} has a different parent.`);
      const siblings = all.filter((n) => (n.parentId ?? undefined) === (parent ?? undefined));
      const min = siblings.reduce((m, n) => Math.min(m, n.position ?? 0), 0);
      const ordered = [...ids, ...siblings.map((s) => s.id).filter((x) => !ids.includes(x))];
      const changed: Note[] = [];
      ordered.forEach((noteId, i) => {
        const note = byId.get(noteId)!;
        if (note.position !== min + i) {
          const next = { ...note, position: min + i };
          changed.push(next);
          byId.set(noteId, next);
        }
      });
      for (const note of changed) await adapter.update(note);
      const where = parent ? ` under "${byId.get(parent)?.title ?? parent}"` : " at root level";
      const summary = `Reordered siblings${where}: ${ordered.map((x) => `"${byId.get(x)!.title}"`).join(" → ")}.`;
      return { ok: true, summary, label: `Reordered ${changed.length} sibling note${changed.length === 1 ? "" : "s"}.`, notes: changed };
    }
    case "move_notes": {
      const id = str(args.note_id, name);
      const note = await adapter.read(id);
      const parentId = optStringOrNull(args.parent_id);
      const all = await adapter.list();
      const target = parentId ? all.find((n) => n.id === parentId) : undefined;
      if (parentId && !target) throw new Error(`Tool "${name}": parent note ${parentId} not found. List notes first.`);
      let cursor = target;
      while (cursor) {
        if (cursor.id === id) throw new Error(`Tool "${name}": cannot move a note under itself or one of its own children.`);
        const pid = cursor.parentId;
        cursor = pid ? all.find((n) => n.id === pid) : undefined;
      }
      const updated: Note = {
        ...note,
        updatedAt: nowIso(),
        ...(parentId !== undefined ? { parentId: parentId ?? undefined } : {}),
      };
      await adapter.update(updated);
      const where = parentId ? ` under "${target!.title}"` : " to root level";
      return { ok: true, summary: `Moved "${note.title}"${where}.`, label: `Moved "${note.title}"${where}.`, note: updated };
    }
    case "toggle_pin": {
      const id = str(args.note_id, name);
      const note = await adapter.read(id);
      const updated: Note = { ...note, pinned: !note.pinned, updatedAt: nowIso() };
      await adapter.update(updated);
      return {
        ok: true,
        summary: `${updated.pinned ? "Pinned" : "Unpinned"} "${note.title}".`,
        label: `${updated.pinned ? "Pinned" : "Unpinned"} "${note.title}".`,
        note: updated,
      };
    }
    case "set_category": {
      const id = str(args.note_id, name);
      const note = await adapter.read(id);
      const category = optStringOrNull(args.category);
      const updated: Note = {
        ...note,
        updatedAt: nowIso(),
        ...(category !== undefined ? { category: category ?? undefined } : {}),
      };
      await adapter.update(updated);
      const where = category ?? "none";
      return {
        ok: true,
        summary: `Set "${note.title}" category to ${where}.`,
        label: `Category set to ${where}.`,
        note: updated,
        ...(category ? { category } : {}),
      };
    }
    case "search_notes": {
      const query = str(args.query, name).toLowerCase();
      const matches = (await adapter.list()).filter(
        (n) => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query),
      );
      const lines = matches.map((n) =>
        `[${n.id}] "${n.title}"${n.parentId ? ` (child of ${n.parentId})` : ""} — edited ${n.updatedAt}`,
      );
      return {
        ok: true,
        summary: `Found ${matches.length} note(s) matching "${query}".\n${lines.join("\n") || "(no matches)"}`,
        label: `Searched: ${matches.length} match(es).`,
      };
    }
    default:
      return { ok: false, summary: `Unknown tool: ${name}`, label: `Unknown tool: ${name}` };
  }
}
