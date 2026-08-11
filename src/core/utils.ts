import type { Note } from "./types";

export function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

const FRONTMATTER_OPEN = "---";
const FRONTMATTER_CLOSE = "---\n";

export interface ParsedNoteFile {
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
}

const FALLBACK_DATE = "1970-01-01T00:00:00.000Z";

function parseFrontmatter(raw: string): { meta: Partial<Record<string, unknown>>; body: string } {
  if (raw.startsWith(FRONTMATTER_OPEN)) {
    const closeIdx = raw.indexOf(FRONTMATTER_CLOSE, FRONTMATTER_OPEN.length);
    if (closeIdx !== -1) {
      const jsonBlock = raw.slice(FRONTMATTER_OPEN.length, closeIdx).trim();
      const endOfJson = jsonBlock.lastIndexOf("}");
      if (endOfJson !== -1) {
        try {
          const meta = JSON.parse(jsonBlock.slice(0, endOfJson + 1)) as Record<string, unknown>;
          return { meta, body: raw.slice(closeIdx + FRONTMATTER_CLOSE.length) };
        } catch {
          /* malformed frontmatter -> treat whole file as body */
        }
      }
    }
  }
  return { meta: {}, body: raw };
}

/** Serialize a note to a markdown file with a JSON frontmatter block. */
export function serializeNote(note: Note): string {
  const meta = {
    id: note.id,
    title: note.title,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    pinned: note.pinned,
  };
  const body = note.content.startsWith("#") ? note.content : `# ${note.title}\n\n${note.content}`;
  return `${FRONTMATTER_OPEN}\n${JSON.stringify(meta, null, 2)}\n${FRONTMATTER_CLOSE}${body}`;
}

/** Parse a markdown file back into note fields. `fallbackId` is used when frontmatter is missing. */
export function parseNoteFile(raw: string, fallbackId: string): ParsedNoteFile {
  const { meta, body } = parseFrontmatter(raw);
  const title = typeof meta.title === "string" ? meta.title : fallbackId;
  const createdAt = typeof meta.createdAt === "string" ? meta.createdAt : FALLBACK_DATE;
  const updatedAt = typeof meta.updatedAt === "string" ? meta.updatedAt : FALLBACK_DATE;
  const pinned = meta.pinned === true;
  return { title, content: body, createdAt, updatedAt, pinned };
}

/** Fallback title when a note has no explicit title. */
export function deriveTitle(content: string, id: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const firstLine = content.split("\n").find((l) => l.trim());
  if (firstLine) return firstLine.trim().slice(0, 60);
  return `Untitled ${id.slice(0, 8)}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "note";
}

/** Filename for a note on disk. Stable: derived from the id, never from the (mutable) title. */
export function noteFilename(note: Pick<Note, "id" | "title">): string {
  return `${slugify(note.title)}-${note.id.slice(0, 8)}.md`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  const withinWeek = now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000;
  if (withinWeek) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function isDeepSeekError(status: number): boolean {
  return status === 401 || status === 403;
}
