import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import styles from "./NoteEditor.module.scss";
import { useAppDispatch, useAppSelector } from "../../core/store";
import { patchNote, persistNote } from "../../core/store/notesSlice";
import { deleteNote } from "../../core/store/notesSlice";
import { formatDate } from "../../core/utils";
import { TrashIcon } from "./icons";

const AUTOSAVE_MS = 900;

export default function NoteEditor() {
  const dispatch = useAppDispatch();
  const notes = useAppSelector((s) => s.notes.notes);
  const activeId = useAppSelector((s) => s.notes.activeId);
  const savedAt = useAppSelector((s) => s.notes.savedAt);
  const note = notes.find((n) => n.id === activeId) ?? null;

  const [localContent, setLocalContent] = useState(note?.content ?? "");
  const [localTitle, setLocalTitle] = useState(note?.title ?? "");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (note) {
      setLocalTitle(note.title);
      setLocalContent(note.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  const scheduleAutosave = useCallback(
    (id: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        dispatch(persistNote(id));
      }, AUTOSAVE_MS);
    },
    [dispatch],
  );

  function onTitleChange(e: ChangeEvent<HTMLInputElement>) {
    if (!note) return;
    const v = e.target.value;
    setLocalTitle(v);
    dispatch(patchNote({ id: note.id, patch: { title: v } }));
    scheduleAutosave(note.id);
  }

  function onContentChange(e: ChangeEvent<HTMLTextAreaElement>) {
    if (!note) return;
    const v = e.target.value;
    setLocalContent(v);
    dispatch(patchNote({ id: note.id, patch: { content: v } }));
    scheduleAutosave(note.id);
  }

  function onDelete() {
    if (!note || !confirm(`Delete "${note.title || "Untitled"}"?`)) return;
    dispatch(deleteNote(note.id));
  }

  if (!note) {
    return (
      <div className={styles.empty}>
        <p>Select a note or create a new one.</p>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <header className={styles.header}>
        <input
          type="text"
          className={styles.titleInput}
          value={localTitle}
          onChange={onTitleChange}
          placeholder="Untitled"
          aria-label="Note title"
        />
        <div className={styles.meta}>
          {savedAt && <span className={styles.saved}>Saved</span>}
          <time>{formatDate(note.updatedAt)}</time>
          <button type="button" className={styles.deleteBtn} onClick={onDelete} title="Delete note">
            <TrashIcon size={15} />
          </button>
        </div>
      </header>
      <textarea
        className={styles.content}
        value={localContent}
        onChange={onContentChange}
        placeholder="Start writing... Markdown supported."
        aria-label="Note content"
        spellCheck
      />
    </div>
  );
}
