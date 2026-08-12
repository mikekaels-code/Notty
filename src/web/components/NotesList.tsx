import type { CSSProperties } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./NotesList.module.scss";
import { useAppDispatch, useAppSelector } from "../../core/store";
import { createNote, patchNote, persistNote, setActiveId, deleteNote, reorderNotes } from "../../core/store/notesSlice";
import { addCategory } from "../../core/store/settingsSlice";
import { formatDate } from "../../core/utils";
import type { Note } from "../../core/types";
import { EllipsisIcon, PlusIcon, FolderIcon, GearIcon, XIcon, CaretIcon } from "./icons";
import nottyLogo from "../../assets/notty-logo.png";

interface NotesListProps {
  needsFolderPick: boolean;
  onChooseFolder: () => void;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function NotesList({ needsFolderPick, onChooseFolder, onOpenSettings, collapsed, onToggleCollapse }: NotesListProps) {  const dispatch = useAppDispatch();
  const notes = useAppSelector((s) => s.notes.notes);
  const activeId = useAppSelector((s) => s.notes.activeId);
  const loading = useAppSelector((s) => s.notes.loading);

  function onNewNote() {
    void dispatch(createNote({}));
  }

  function onTogglePin(note: Note) {
    dispatch(patchNote({ id: note.id, patch: { pinned: !note.pinned } }));
    void dispatch(persistNote(note.id));
    setMenuOpenId(null);
  }

  function onDuplicate(note: Note) {
    void dispatch(createNote({ title: note.title ? `Copy of ${note.title}` : "", content: note.content }));
    setMenuOpenId(null);
  }

  function onRename(note: Note) {
    const title = window.prompt("Rename note", note.title);
    if (title === null || title.trim() === note.title) {
      setMenuOpenId(null);
      return;
    }
    dispatch(patchNote({ id: note.id, patch: { title: title.trim() } }));
    void dispatch(persistNote(note.id));
    setMenuOpenId(null);
  }

  async function onCopyLink(note: Note) {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${note.id}`);
    } catch {
      /* clipboard unavailable */
    }
    setMenuOpenId(null);
  }

  function onTrash(note: Note) {
    setMenuOpenId(null);
    setTrashNoteId(note.id);
  }

  function onConfirmTrash() {
    if (!trashNoteId) return;
    void dispatch(deleteNote(trashNoteId));
    setTrashNoteId(null);
  }

  function onAddChild(note: Note) {
    void dispatch(createNote({ parentId: note.id }));
    setMenuOpenId(null);
  }

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [moveNoteId, setMoveNoteId] = useState<string | null>(null);
  const [addCategoryNoteId, setAddCategoryNoteId] = useState<string | null>(null);
  const [trashNoteId, setTrashNoteId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; edge: "before" | "after" | "inside" } | null>(null);
  const expandTimer = useRef<number | null>(null);

  function clearExpandTimer() {
    if (expandTimer.current !== null) {
      clearTimeout(expandTimer.current);
      expandTimer.current = null;
    }
  }

  function toggleCollapse(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? notes.filter(
        (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
      )
    : [];

  useEffect(() => {
    if (!menuOpenId) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenId(null);
    };
    const onClick = () => setMenuOpenId(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [menuOpenId]);

  function onMoveToCategory(note: Note, category: string | null) {
    dispatch(patchNote({ id: note.id, patch: { category: category ?? undefined } }));
    void dispatch(persistNote(note.id));
    setMoveNoteId(null);
    setMenuOpenId(null);
  }

  function onAddCategory(note: Note) {
    setMenuOpenId(null);
    setAddCategoryNoteId(note.id);
  }

  function onConfirmAddCategory(note: Note, name: string) {
    dispatch(addCategory(name));
    onMoveToCategory(note, name);
  }

  const favorites = notes.filter((n) => n.pinned);
  const uncategorized = notes.filter((n) => !n.pinned && !n.category);
  const categories = useAppSelector((s) => s.settings.categories);
  const byCategory = (c: string) => notes.filter((n) => !n.pinned && n.category === c);
  const filledCategories = categories.filter((c) => byCategory(c).length > 0);

  const byParent = (id: string | undefined) =>
    notes
      .filter((n) => n.parentId === id)
      .sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
          b.updatedAt.localeCompare(a.updatedAt)
      );
  const isRoot = (n: Note) => !n.parentId || !notes.some((p) => p.id === n.parentId);
  const rootOf = (list: Note[]) => list.filter(isRoot);

  const matchSet = new Set(searchResults.map((n) => n.id));
  const subtreeHasMatch = (id: string): boolean => {
    if (matchSet.has(id)) return true;
    return byParent(id).some((k) => subtreeHasMatch(k.id));
  };

  /** Depth-first flat order of the whole tree, matching the visible list. */
  const flatIds = (parentId: string | undefined): string[] => {
    const out: string[] = [];
    for (const n of byParent(parentId)) {
      out.push(n.id);
      out.push(...flatIds(n.id));
    }
    return out;
  };

  function isDescendant(parentId: string, childId: string): boolean {
    for (const k of byParent(parentId)) {
      if (k.id === childId) return true;
      if (isDescendant(k.id, childId)) return true;
    }
    return false;
  }

  function onDragStart(note: Note) {
    setDragId(note.id);
  }

  function onDropBeforeAfter(targetId: string, edge: "before" | "after") {
    const dragged = dragId;
    setDragId(null);
    setDragOver(null);
    if (!dragged || dragged === targetId) return;
    const draggedNote = notes.find((n) => n.id === dragged);
    const target = notes.find((n) => n.id === targetId);
    if (!draggedNote || !target) return;
    if (draggedNote.parentId !== target.parentId) {
      dispatch(patchNote({ id: dragged, patch: { parentId: target.parentId } }));
    }
    const flat = flatIds(undefined);
    const from = flat.indexOf(dragged);
    const to = flat.indexOf(targetId);
    if (from === -1 || to === -1) return;
    flat.splice(from, 1);
    const to2 = flat.indexOf(targetId);
    flat.splice(to2 + (edge === "after" ? 1 : 0), 0, dragged);
    void dispatch(reorderNotes(flat));
  }

  function onNestDrop(targetId: string) {
    const dragged = dragId;
    setDragId(null);
    setDragOver(null);
    if (!dragged || dragged === targetId) return;
    if (isDescendant(dragged, targetId)) return;
    const kids = byParent(targetId);
    const maxPos = kids.reduce((m, n) => ((n.position ?? -1) > m ? n.position ?? -1 : m), -1);
    dispatch(patchNote({ id: dragged, patch: { parentId: targetId, position: maxPos + 1 } }));
    void dispatch(persistNote(dragged));
    setExpanded((prev) => new Set(prev).add(targetId));
  }

  function renderTree(note: Note) {
    const kids = byParent(note.id);
    const kidMatch = kids.some((k) => subtreeHasMatch(k.id));
    if (q.length > 0 && !matchSet.has(note.id) && !kidMatch) return null;
    const showKids = q.length > 0 ? kidMatch : expanded.has(note.id);
    return (
      <Fragment key={note.id}>
        {renderItem(note, { hasChildren: kids.length > 0 })}
        {kids.length > 0 && showKids && (
          <ul className={styles.treeChildren}>
            {kids.map(renderTree)}
          </ul>
        )}
      </Fragment>
    );
  }


  function highlight(text: string) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    const end = idx + q.length;
    return (
      <>
        {text.slice(0, idx)}
        <span className={styles.highlight}>{text.slice(idx, end)}</span>
        {text.slice(end)}
      </>
    );
  }

  function renderItem(note: Note, opts?: { hasChildren: boolean }) {
    const edge = dragOver?.id === note.id ? dragOver.edge : null;
    const dropClass = edge === "before" ? styles.dropBefore : edge === "after" ? styles.dropAfter : edge === "inside" ? styles.dropInside : "";
    return (
      <li
        key={note.id}
        className={`${styles.listItem} ${dragId === note.id ? styles.dragging : ""} ${dropClass}`}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", note.id);
          onDragStart(note);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          const r = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientY - r.top) / r.height;
          const edge = rel < 0.25 ? "before" : rel > 0.75 ? "after" : "inside";
          setDragOver({ id: note.id, edge });
          const shouldExpand = edge === "inside" && opts?.hasChildren && dragId !== note.id && !expanded.has(note.id);
          if (!shouldExpand) {
            clearExpandTimer();
          } else if (expandTimer.current === null) {
            expandTimer.current = window.setTimeout(() => {
              expandTimer.current = null;
              setExpanded((prev) => new Set(prev).add(note.id));
            }, 500);
          }
        }}
        onDragLeave={(e) => {
          if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
          clearExpandTimer();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearExpandTimer();
          const edge = dragOver?.id === note.id ? dragOver.edge : "after";
          if (edge === "inside") {
            onNestDrop(note.id);
          } else {
            onDropBeforeAfter(note.id, edge);
          }
        }}
        onDragEnd={(e) => {
          e.stopPropagation();
          clearExpandTimer();
          setDragId(null);
          setDragOver(null);
        }}
      >
        {opts?.hasChildren && (
          <button
            type="button"
            draggable="false"
            className={`${styles.caretBtn} ${expanded.has(note.id) ? "" : styles.caretClosed}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(note.id);
            }}
            title={expanded.has(note.id) ? "Collapse" : "Expand"}
            aria-label={expanded.has(note.id) ? "Collapse children" : "Expand children"}
          >
            <CaretIcon size={10} />
          </button>
        )}
        <button
          type="button"
          draggable
          className={`${styles.item} ${activeId === note.id ? styles.active : ""}`}
          onClick={() => dispatch(setActiveId(note.id))}
        >
          <span className={styles.itemBody}>
            <span className={styles.itemTitle}>{highlight(note.title || "Untitled")}</span>
            <span className={styles.itemDate}>{formatDate(note.updatedAt)}</span>
          </span>
        </button>
        <button
          type="button"
          draggable="false"
          className={styles.moreBtn}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenuAnchor({ x: r.right, y: r.bottom });
            setMenuOpenId(menuOpenId === note.id ? null : note.id);
          }}
          title="More actions"
          aria-label="More actions"
        >
          <EllipsisIcon size={15} />
        </button>
      </li>
    );
  }

  function renderMenu() {
    if (!menuOpenId || !menuAnchor) return null;
    const note = notes.find((n) => n.id === menuOpenId);
    if (!note) return null;
    const isMove = moveNoteId === note.id;
    const menuHeight = isMove ? 320 : 230;
    const style: CSSProperties = {
      position: "fixed",
      right: "auto",
      top: Math.min(menuAnchor.y + 4, Math.max(8, window.innerHeight - menuHeight)),
      left: Math.max(menuAnchor.x - 210, 8),
      zIndex: 800,
    };
    const menu = (
      <div className={styles.menu} role="menu" style={style}>
        {isMove ? (
          <>
            <div className={styles.menuHeader}>
              <span className={styles.menuTitle}>Move to</span>
              <button
                type="button"
                className={styles.menuBack}
                onClick={(e) => {
                  e.stopPropagation();
                  setMoveNoteId(null);
                }}
                aria-label="Back"
              >
                ←
              </button>
            </div>
            <button type="button" className={styles.menuItem} role="menuitem" onClick={() => onMoveToCategory(note, null)}>
              No category
            </button>
            {categories.map((c) => (
              <button
                type="button"
                className={`${styles.menuItem} ${note.category === c ? styles.menuChecked : ""}`}
                role="menuitem"
                key={c}
                onClick={() => onMoveToCategory(note, c)}
              >
                {c}
              </button>
            ))}
            <div className={styles.menuDivider} />
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onAddCategory(note);
              }}
            >
              + Add category
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.menuItem} role="menuitem" onClick={() => onTogglePin(note)}>
              {note.pinned ? "Remove from favorites" : "Add to favorites"}
            </button>
            <button type="button" className={styles.menuItem} role="menuitem" onClick={() => onCopyLink(note)}>
              Copy link
            </button>
            <button type="button" className={styles.menuItem} role="menuitem" onClick={() => onDuplicate(note)}>
              Duplicate
            </button>
            <button type="button" className={styles.menuItem} role="menuitem" onClick={() => onAddChild(note)}>
              Add note
            </button>
            <button type="button" className={styles.menuItem} role="menuitem" onClick={() => onRename(note)}>
              Rename
            </button>
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMoveNoteId(note.id);
              }}
            >
              Move
            </button>
            <div className={styles.menuDivider} />
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuDanger}`}
              role="menuitem"
              onClick={() => onTrash(note)}
            >
              Move to trash
            </button>
          </>
        )}
      </div>
    );
    return createPortal(menu, document.body);
  }

  return (
    <div className={`${styles.panel} ${collapsed ? styles.collapsed : ""}`}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.brand}
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <img src={nottyLogo} alt="" className={styles.brandLogo} />
          <span className={styles.brandName}>Notty</span>
        </button>
        <div className={styles.headerActions}>
          <button type="button" className={styles.newBtn} onClick={onNewNote} title="New note (Ctrl+N)" aria-label="New note">
            <PlusIcon size={13} />
          </button>
        </div>
      </header>

      {!collapsed && (
        <>
      <div className={styles.scrollArea}>
      {loading && <p className={styles.status}>Loading notes…</p>}

      {q.length > 0 ? (
        searchResults.length === 0 ? (
          <div className={styles.empty}>
            <p>No notes match "{searchQuery.trim()}".</p>
          </div>
        ) : (
          <>
            <div className={styles.sectionLabel}>Results</div>
            <ul className={styles.list} aria-label="Search results">
              {rootOf(notes).map(renderTree)}
            </ul>
          </>
        )
      ) : (
        <>
          {favorites.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Favorites</div>
              <ul className={`${styles.list} ${styles.listShrink}`} aria-label="Favorites">
                {favorites.map(renderTree)}
              </ul>
            </>
          )}
          {filledCategories.map((c) => (
            <div key={c}>
              <div className={styles.sectionLabel}>{c}</div>
              <ul className={`${styles.list} ${styles.listShrink}`} aria-label={c}>
                {rootOf(byCategory(c)).map(renderTree)}
              </ul>
            </div>
          ))}
          <div className={styles.sectionLabel}>Notes</div>
          {needsFolderPick ? (
            <div className={styles.centerWrap}>
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
            </div>
          ) : !loading && notes.length === 0 ? (
            <div className={styles.emptyNotes}>
              <p className={styles.emptyText}>No notes yet.</p>
              <button type="button" className={styles.createNoteBtn} onClick={onNewNote}>
                <PlusIcon size={14} />
                Create your first note
              </button>
            </div>
          ) : (
            <ul className={styles.list} aria-label="Notes">
              {rootOf(uncategorized).map(renderTree)}
            </ul>
          )}
        </>
      )}
      </div>

      <div className={styles.searchBar}>
        <input
          className={styles.searchInput}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes…"
        />
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.settingsBtn} onClick={onOpenSettings} title="Settings">
          <GearIcon size={15} />
          <span>Settings</span>
        </button>
      </footer>
        </>
      )}
      {renderMenu()}
      {addCategoryNoteId && (
        <AddCategoryModal
          onClose={() => setAddCategoryNoteId(null)}
          onConfirm={(name) => {
            const note = notes.find((n) => n.id === addCategoryNoteId);
            if (note) onConfirmAddCategory(note, name);
            setAddCategoryNoteId(null);
          }}
        />
      )}
      {trashNoteId && (
        <TrashModal
          title={notes.find((n) => n.id === trashNoteId)?.title || "Untitled"}
          onClose={() => setTrashNoteId(null)}
          onConfirm={onConfirmTrash}
        />
      )}
    </div>
  );
}

function AddCategoryModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    if (!name.trim()) return;
    onConfirm(name.trim());
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-label="New category" onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add category</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </header>
        <input
          ref={inputRef}
          className={styles.categoryInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Category name"
        />
        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancel} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.modalConfirm} onClick={submit} disabled={!name.trim()}>
            Add
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TrashModal({
  title,
  onClose,
  onConfirm,
}: {
  title: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-label="Move to trash" onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Move to trash</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </header>
        <p className={styles.trashBody}>
          Move <strong>{title}</strong> to trash?
        </p>
        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancel} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${styles.modalConfirm} ${styles.trashConfirm}`} onClick={onConfirm}>
            Move to trash
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
