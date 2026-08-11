import type { NotesStorageAdapter } from "./types";

let _adapter: NotesStorageAdapter | null = null;

export function getStorageAdapter(): NotesStorageAdapter {
  if (!_adapter) throw new Error("Storage adapter not injected. Call setStorageAdapter at app boot.");
  return _adapter;
}

export function setStorageAdapter(adapter: NotesStorageAdapter): void {
  _adapter = adapter;
}
