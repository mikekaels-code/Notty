import styles from "./NotesList.module.scss";
import { useAppDispatch, useAppSelector } from "../../core/store";
import { createNote, patchNote, persistNote, setActiveId } from "../../core/store/notesSlice";
import { formatDate } from "../../core/utils";
import type { Note } from "../../core/types";
import { PlusIcon, PinIcon, FolderIcon } from "./icons";

interface NotesListProps {
  needsFolderPick: boolean;
  onChooseFolder: () => void;
}

function previewOf(note: Note): string {
  const firstLine = note.content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "No additional text";
  return firstLine.replace(/^#{1,6}\s+/, "");
}

export default function NotesList({ needsFolderPick, onChooseFolder }: NotesListProps) {
  const dispatch = useAppDispatch();
  const notes = useAppSelector((s) => s.notes.notes);
  const activeId = useAppSelector((s) => s.notes.activeId);
  const loading = useAppSelector((s) => s.notes.loading);

  function onNewNote() {
    void dispatch(createNote({}));
  }

  function onTogglePin(note: Note) {
    dispatch(patchNote({ id: note.id, patch: { pinned: !note.pinned } }));
    void dispatch(persistNote(note.id));
  }

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h1 className={styles.title}>Notes</h1>
        <button type="button" className={styles.newBtn} onClick={onNewNote} title="New note (Ctrl+N)">
          <PlusIcon size={15} />
          <span>New note</span>
        </button>
      </header>

      {needsFolderPick && (
        <div className={styles.folderBanner}>
          <div className={styles.folderText}>
            <strong>Pick a folder for your notes</strong>
            <span>Notes are saved as individual Markdown files on your device.</span>
          </div>
          <button type="button" className={styles.folderBtn} onClick={onChooseFolder}>
            <FolderIcon size={14} />
            Choose folder
          </button>
        </div>
      )}

      {loading && <p className={styles.status}>Loading notes…</p>}

      {!loading && notes.length === 0 && !needsFolderPick && (
        <div className={styles.empty}>
          <p>No notes yet.</p>
          <button type="button" className={styles.folderBtn} onClick={onNewNote}>
            <PlusIcon size={14} />
            Create your first note
          </button>
        </div>
      )}

      <ul className={styles.list} aria-label="Notes">
        {notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              className={`${styles.item} ${activeId === note.id ? styles.active : ""}`}
              onClick={() => dispatch(setActiveId(note.id))}
            >
              <span className={styles.itemBody}>
                <span className={styles.itemTitle}>{note.title || "Untitled"}</span>
                <span className={styles.itemPreview}>{previewOf(note)}</span>
              </span>
              <span className={styles.itemDate}>{formatDate(note.updatedAt)}</span>
            </button>
            <button
              type="button"
              className={`${styles.pin} ${note.pinned ? styles.pinned : ""}`}
              onClick={() => onTogglePin(note)}
              title={note.pinned ? "Unpin" : "Pin"}
              aria-label={note.pinned ? "Unpin note" : "Pin note"}
            >
              <PinIcon size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
