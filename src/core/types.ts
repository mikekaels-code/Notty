export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
}

export type StorageMode = "filesystem" | "fallback";

export class StoragePermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoragePermissionError";
  }
}

/**
 * Platform-agnostic note storage contract. /web implements it on top of the
 * File System Access API + IndexedDB; a future /native layer implements it on
 * the filesystem / sqlite and plugs in the same way.
 */
export interface NotesStorageAdapter {
  /** Ensure storage is ready (may prompt the user). Throws StoragePermissionError on denial. */
  ensureReady(): Promise<void>;
  list(): Promise<Note[]>;
  read(id: string): Promise<Note>;
  create(note: Note): Promise<void>;
  update(note: Note): Promise<void>;
  remove(id: string): Promise<void>;
}

export type ThemeMode = "light" | "dark";
export type View = "notes" | "chat";

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

export interface ToolResult {
  callId: string;
  ok: boolean;
  summary: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Assistant messages may carry tool calls they requested. */
  toolCalls?: ChatToolCall[];
  /** Human-readable confirmations of executed tools, shown under the bubble. */
  toolResults?: ToolResult[];
  createdAt: string;
  error?: string;
}
