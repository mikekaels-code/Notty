import type { AppStore } from "../../core/store";
import { setStorageMode, setFolderChosen, setNeedsFolderPick } from "../../core/store/settingsSlice";
import { loadNotes, resetNotes } from "../../core/store/notesSlice";
import { setStorageAdapter } from "../../core/storage";
import { getRootDirHandle, setRootDirHandle, clearRootDirHandle } from "./idbHandles";
import { createFsAdapter } from "./fsAdapter";
import { createFallbackAdapter } from "./fallbackAdapter";

export function isFsaSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window && "showSaveFilePicker" in window;
}

function needsPick(store: AppStore): void {
  store.dispatch(setFolderChosen(false));
  store.dispatch(setNeedsFolderPick(true));
}

/** Show the directory picker and persist the handle for future sessions. Throws on cancel. */
export async function pickNotesFolder(store: AppStore): Promise<FileSystemDirectoryHandle> {
  const dir = await window.showDirectoryPicker({ mode: "readwrite" });
  await setRootDirHandle(dir);
  setStorageAdapter(createFsAdapter(() => pickNotesFolder(store), dir));
  store.dispatch(setFolderChosen(true));
  store.dispatch(setNeedsFolderPick(false));
  await store.dispatch(loadNotes());
  return dir;
}

/** Wire up the storage adapter for the boot session. */
export async function initStorage(store: AppStore): Promise<void> {
  if (!isFsaSupported()) {
    store.dispatch(setStorageMode("fallback"));
    setStorageAdapter(createFallbackAdapter());
    await store.dispatch(loadNotes());
    return;
  }

  const mode = store.getState().settings.storageMode;
  if (mode === "fallback") {
    setStorageAdapter(createFallbackAdapter());
    await store.dispatch(loadNotes());
    return;
  }

  const picker = () => pickNotesFolder(store);
  setStorageAdapter(createFsAdapter(picker));

  const handle = await getRootDirHandle();
  if (!handle) {
    needsPick(store);
    return;
  }

  const perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm === "granted") {
    store.dispatch(setFolderChosen(true));
    await store.dispatch(loadNotes());
    return;
  }
  needsPick(store);
}

/** Drop the persisted handle; next save / reload will ask for a folder again. */
export async function resetNotesFolder(store: AppStore): Promise<void> {
  await clearRootDirHandle();
  store.dispatch(resetNotes());
  needsPick(store);
  setStorageAdapter(createFsAdapter(() => pickNotesFolder(store)));
}

/** Switch to browser-localStorage storage and never prompt for the filesystem again. */
export async function switchToFallback(store: AppStore): Promise<void> {
  await clearRootDirHandle();
  store.dispatch(setStorageMode("fallback"));
  setStorageAdapter(createFallbackAdapter());
  await store.dispatch(loadNotes());
}
