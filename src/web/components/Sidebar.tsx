import styles from "./Sidebar.module.scss";
import { NotesIcon, ChatIcon, GearIcon } from "./icons";
import type { View } from "../../core/types";

interface SidebarProps {
  view: View;
  onViewChange: (v: View) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({ view, onViewChange, onOpenSettings }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.logo}>S</span>
        <span className={styles.brandName}>SmartNotes</span>
      </div>

      <nav className={styles.nav}>
        <button
          type="button"
          className={`${styles.navItem} ${view === "notes" ? styles.active : ""}`}
          onClick={() => onViewChange("notes")}
          aria-label="Notes list"
          title="Notes (Ctrl+1)"
        >
          <NotesIcon />
          <span>Notes</span>
        </button>
        <button
          type="button"
          className={`${styles.navItem} ${view === "chat" ? styles.active : ""}`}
          onClick={() => onViewChange("chat")}
          aria-label="AI chat"
          title="AI Chat (Ctrl+2)"
        >
          <ChatIcon />
          <span>AI Chat</span>
        </button>
      </nav>

      <button
        type="button"
        className={styles.settings}
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
      >
        <GearIcon size={15} />
        <span>Settings</span>
      </button>
    </aside>
  );
}
