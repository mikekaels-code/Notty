import { useEffect, useState } from "react";
import styles from "./App.module.scss";
import Sidebar from "./Sidebar";
import ThemeToggle from "./ThemeToggle";
import NotesList from "./NotesList";
import NoteEditor from "./NoteEditor";
import ChatPanel from "./ChatPanel";
import SettingsModal from "./SettingsModal";
import { useAppDispatch, useAppSelector, store } from "../../core/store";
import { createNote, setError } from "../../core/store/notesSlice";
import { chatError } from "../../core/store/chatSlice";
import { pickNotesFolder } from "../storage/storageFactory";
import type { View } from "../../core/types";
import { WarningIcon, XIcon } from "./icons";

export default function App() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.mode);
  const notesError = useAppSelector((s) => s.notes.error);
  const chatErrorMsg = useAppSelector((s) => s.chat.error);
  const needsFolderPick = useAppSelector((s) => s.settings.needsFolderPick);
  const storageMode = useAppSelector((s) => s.settings.storageMode);

  const [view, setView] = useState<View>("notes");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        dispatch(createNote({}));
      } else if (mod && e.key === "1") {
        e.preventDefault();
        setView("notes");
      } else if (mod && e.key === "2") {
        e.preventDefault();
        setView("chat");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, settingsOpen]);

  async function onChooseFolder() {
    try {
      await pickNotesFolder(store);
    } catch {
      dispatch(setError("Folder selection cancelled. You can pick one anytime in Settings."));
    }
  }

  const toastMessage = notesError ?? chatErrorMsg;

  return (
    <div className={styles.app}>
      <Sidebar view={view} onViewChange={setView} onOpenSettings={() => setSettingsOpen(true)} />

      <main className={styles.main}>
        {view === "notes" ? (
          <div className={styles.notesView}>
            <NotesList
              needsFolderPick={needsFolderPick && storageMode === "filesystem"}
              onChooseFolder={onChooseFolder}
            />
            <NoteEditor />
          </div>
        ) : (
          <ChatPanel />
        )}
      </main>

      <ThemeToggle />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {toastMessage && (
        <div className={styles.toast} role="alert">
          <WarningIcon size={15} />
          <span>{toastMessage}</span>
          <button
            type="button"
            className={styles.toastDismiss}
            aria-label="Dismiss"
            onClick={() => (notesError ? dispatch(setError(null)) : dispatch(chatError(null)))}
          >
            <XIcon size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
