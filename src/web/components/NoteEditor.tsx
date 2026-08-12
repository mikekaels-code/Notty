import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import styles from "./NoteEditor.module.scss";
import { useAppDispatch, useAppSelector } from "../../core/store";
import { patchNote, persistNote, setActiveFromParent, setActiveId } from "../../core/store/notesSlice";
import { deleteNote } from "../../core/store/notesSlice";
import { formatDate } from "../../core/utils";
import type { Note } from "../../core/types";
import { TrashIcon, BackIcon } from "./icons";

const AUTOSAVE_MS = 900;
const LINK_RE = /\[([^\]]+)\]\(notty:\/\/([^)]+)\)/g;

type SlashSuggestion =
  | { kind: "code" }
  | { kind: "note"; note: Note };

export default function NoteEditor() {
  const dispatch = useAppDispatch();
  const notes = useAppSelector((s) => s.notes.notes);
  const activeId = useAppSelector((s) => s.notes.activeId);
  const savedAt = useAppSelector((s) => s.notes.savedAt);
  const note = notes.find((n) => n.id === activeId) ?? null;

  const [localTitle, setLocalTitle] = useState(note?.title ?? "");
  const [aiUpdated, setAiUpdated] = useState(false);
  const aiOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNoteId = useRef<string | null>(null);
  const lastUpdatedAt = useRef<string | null>(null);

  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashSel, setSlashSel] = useState<{ start: number; end: number } | null>(null);
  const [slashMenuPos, setSlashMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  const editorBodyRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  function closeSlash() {
    setSlashQuery(null);
    setSlashSel(null);
    setSlashMenuPos(null);
    setSlashActive(0);
  }

  function detectSlash(editor: ReturnType<typeof useEditor>) {
    if (!editor) return;
    const sel = editor.state.selection;
    const $pos = editor.state.doc.resolve(sel.from);
    const start = $pos.start($pos.depth);
    const before = $pos.parent.textBetween(0, $pos.parentOffset, "", "");
    const lastSlash = before.lastIndexOf("/");
    if (lastSlash === -1) {
      closeSlash();
      return;
    }
    const query = before.slice(lastSlash + 1);
    const lower = query.toLocaleLowerCase();
    if (query.includes("\n") || !(lower.startsWith("child") || lower.startsWith("code"))) {
      closeSlash();
      return;
    }
    const coords = editor.view.coordsAtPos(sel.from);
    const body = editorBodyRef.current?.getBoundingClientRect();
    if (coords && body) {
      setSlashMenuPos({ top: coords.bottom - body.top + 4, left: Math.max(0, coords.left - body.left) });
    }
    setSlashQuery(query);
    setSlashSel({ start: start + lastSlash, end: sel.from });
    setSlashActive(0);
  }

  const slashSuggestionsRef = useRef<SlashSuggestion[]>([]);
  const slashActiveRef = useRef(0);
  const onSlashSelectRef = useRef<(s: SlashSuggestion) => void>(() => {});
  slashActiveRef.current = slashActive;

  const activeFromParent = useAppSelector((s) => s.notes.activeFromParent);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        linkOnPaste: false,
        protocols: ["notty", "http", "https"],
        HTMLAttributes: { rel: null, target: null },
      }),
      Placeholder.configure({
        placeholder: 'Start writing... Try "/" to link a child note.',
      }),
      Markdown,
    ],
    content: note?.content ?? "",
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: styles.content,
        spellcheck: "true",
        "aria-label": "Note content",
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement;
        const anchor = target.closest('a[href^="notty://"]');
        if (!anchor) return false;
        event.preventDefault();
        const id = anchor.getAttribute("href")?.slice("notty://".length) ?? "";
        if (id) dispatch(setActiveFromParent(id));
        return true;
      },
      handleKeyDown: (_view, e) => {
        if (e.key === "Escape") {
          closeSlash();
          return true;
        }
        const suggestions = slashSuggestionsRef.current;
        if (suggestions.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSlashActive((i) => (i + 1) % suggestions.length);
            return true;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSlashActive((i) => (i - 1 + suggestions.length) % suggestions.length);
            return true;
          }
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            const s = suggestions[slashActiveRef.current];
            if (s) onSlashSelectRef.current(s);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const md = editor.getMarkdown();
      if (!note) return;
      dispatch(patchNote({ id: note.id, patch: { content: md } }));
      scheduleAutosave(note.id);
      detectSlash(editor);
    },
  });

  const scheduleAutosave = useCallback(
    (id: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        dispatch(persistNote(id));
      }, AUTOSAVE_MS);
    },
    [dispatch],
  );

  useEffect(() => {
    if (!editor || !note) return;
    const isNewNote = lastNoteId.current !== note.id;
    if (!isNewNote) return;
    lastNoteId.current = note.id;
    lastUpdatedAt.current = note.updatedAt;
    setLocalTitle(note.title);
    editor.commands.setContent(note.content, { emitUpdate: false, contentType: "markdown" });
    if (!note.title && !note.content) {
      requestAnimationFrame(() => titleInputRef.current?.focus());
    }
  }, [editor, note?.id]);

  useEffect(() => {
    if (!editor || !note) return;
    if (lastUpdatedAt.current === note.updatedAt) return;
    const currentMd = editor.getMarkdown();
    if (currentMd === note.content) {
      lastUpdatedAt.current = note.updatedAt;
      return;
    }
    lastUpdatedAt.current = note.updatedAt;
    editor.commands.setContent(note.content, { emitUpdate: false, contentType: "markdown" });
    setAiUpdated(true);
    if (aiOverlayTimer.current) clearTimeout(aiOverlayTimer.current);
    aiOverlayTimer.current = setTimeout(() => setAiUpdated(false), 2000);
  }, [editor, note?.updatedAt]);

  function onTitleChange(e: ChangeEvent<HTMLInputElement>) {
    if (!note) return;
    const v = e.target.value;
    setLocalTitle(v);
    dispatch(patchNote({ id: note.id, patch: { title: v } }));
    scheduleAutosave(note.id);
  }

  function onSlashSelect(s: SlashSuggestion) {
    if (!editor || !note || !slashSel) return;
    if (s.kind === "code") {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: slashSel.start, to: slashSel.end }, { type: "codeBlock" })
        .run();
      closeSlash();
      return;
    }
    const child = s.note;
    const label = child.title || "Untitled";
    const link = `[${label}](notty://${child.id})`;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: slashSel.start, to: slashSel.end }, link, { contentType: "markdown" })
      .setTextSelection({ from: slashSel.start + 1, to: slashSel.start + 1 + label.length })
      .run();
    if (child.parentId !== note.id) {
      dispatch(patchNote({ id: child.id, patch: { parentId: note.id } }));
      void dispatch(persistNote(child.id));
    }
    closeSlash();
  }

  const children = notes
    .filter((n) => n.parentId === note?.id)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const slashSuggestions: SlashSuggestion[] =
    slashQuery !== null && note
      ? [
          ...(slashQuery.toLocaleLowerCase().startsWith("code")
            ? ([{ kind: "code" as const }] satisfies SlashSuggestion[])
            : []),
          ...notes
            .filter((n) => n.parentId === note.id)
            .filter((n) => n.title.toLowerCase().includes(slashQuery.toLowerCase()))
            .slice(0, 7)
            .map((n): SlashSuggestion => ({ kind: "note", note: n })),
        ]
      : [];

  slashSuggestionsRef.current = slashSuggestions;
  onSlashSelectRef.current = onSlashSelect;

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

  const parentNote = note?.parentId ? notes.find((n) => n.id === note.parentId) : undefined;

  const linkTargets: { title: string; id: string }[] = [];
  for (const m of note.content.matchAll(LINK_RE)) {
    linkTargets.push({ title: m[1], id: m[2] });
  }

  return (
    <div className={`${styles.wrap} ${parentNote && activeFromParent ? styles.withBack : ""}`}>
      {parentNote && activeFromParent && (
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => dispatch(setActiveId(parentNote.id))}
          title={`Back to ${parentNote.title || "Untitled"}`}
          aria-label={`Back to ${parentNote.title || "Untitled"}`}
        >
          <BackIcon size={15} />
        </button>
      )}
      <div className={styles.editor}>
        <header className={styles.header}>
          <input
            ref={titleInputRef}
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
        <div className={styles.editorBody} ref={editorBodyRef}>
        {aiUpdated && (
          <div className={styles.aiOverlay}>Notty AI updated this note</div>
        )}
        <EditorContent editor={editor} className={styles.editorContent} />
        {slashSuggestions.length > 0 && slashMenuPos && (
          <div className={styles.slashMenu} role="menu" style={slashMenuPos}>
            {slashSuggestions.map((s, i) => (
              <button
                type="button"
                key={s.kind === "code" ? "code" : s.note.id}
                className={`${styles.slashItem} ${i === slashActive ? styles.slashActive : ""}`}
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setSlashActive(i)}
                onClick={() => onSlashSelect(s)}
              >
                <span className={styles.slashIcon}>{s.kind === "code" ? "</>" : "#"}</span>
                <span className={styles.slashTitle}>{s.kind === "code" ? "Code block" : s.note.title || "Untitled"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {children.length > 0 && (
        <div className={styles.childrenSection}>
          <div className={styles.childrenLabel}>Children</div>
          <ul className={styles.childrenList}>
            {children.map((c) => (
              <li key={c.id}>
                <button type="button" className={styles.childLink} onClick={() => dispatch(setActiveFromParent(c.id))}>
                  <span className={styles.childBullet}>▸</span>
                  <span className={styles.childTitle}>{c.title || "Untitled"}</span>
                  <span className={styles.childDate}>{formatDate(c.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {linkTargets.length > 0 && (
        <div className={styles.linksSection}>
          <div className={styles.childrenLabel}>Linked notes</div>
          <ul className={styles.linksList}>
            {linkTargets.map((l) => (
              <li key={l.id}>
                <button type="button" className={styles.childLink} onClick={() => dispatch(setActiveFromParent(l.id))}>
                  <span className={styles.childBullet}>#</span>
                  <span className={styles.childTitle}>{l.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </div>
  );
}
