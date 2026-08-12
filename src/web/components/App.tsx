import { useEffect, useState } from "react";
import styles from "./App.module.scss";
import NotesList from "./NotesList";
import NoteEditor from "./NoteEditor";
import ChatPanel from "./ChatPanel";
import SettingsModal from "./SettingsModal";
import OnboardingModal from "./OnboardingModal";
import { useAppDispatch, useAppSelector, store } from "../../core/store";
import { createNote, setError } from "../../core/store/notesSlice";
import { chatError } from "../../core/store/chatSlice";
import { pickNotesFolder } from "../storage/storageFactory";
import { WarningIcon, XIcon, SparkleIcon, CaretIcon } from "./icons";

export default function App() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.theme.mode);
  const notesError = useAppSelector((s) => s.notes.error);
  const chatErrorMsg = useAppSelector((s) => s.chat.error);
  const needsFolderPick = useAppSelector((s) => s.settings.needsFolderPick);
  const storageMode = useAppSelector((s) => s.settings.storageMode);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => localStorage.getItem("notty_onboarded") !== "1");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("notty_sidebar_collapsed") === "1");
  const [chatOpen, setChatOpen] = useState(() => localStorage.getItem("notty_chat_open") !== "0");
  const [chatMounted, setChatMounted] = useState(() => localStorage.getItem("notty_chat_open") !== "0");
  const [chatClosing, setChatClosing] = useState(false);
  const [chatOpening, setChatOpening] = useState(false);
  const [chatWidth, setChatWidth] = useState(() => {
    const w = Number(localStorage.getItem("notty_chat_width"));
    return w >= 280 && w <= 640 ? w : 340;
  });

  useEffect(() => {
    localStorage.setItem("notty_chat_open", chatOpen ? "1" : "0");
  }, [chatOpen]);

  useEffect(() => {
    localStorage.setItem("notty_chat_width", String(chatWidth));
  }, [chatWidth]);

  useEffect(() => {
    localStorage.setItem("notty_sidebar_collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  function openChat() {
    setChatOpen(true);
    setChatMounted(true);
    setChatClosing(false);
    setChatOpening(true);
    setTimeout(() => setChatOpening(false), 320);
  }

  function closeChat() {
    if (!chatOpen || chatClosing) return;
    setChatClosing(true);
    setTimeout(() => {
      setChatOpen(false);
      setChatMounted(false);
      setChatClosing(false);
    }, 320);
  }

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
      <main className={styles.main}>
        <div className={`${styles.notesView} ${sidebarCollapsed ? styles.notesViewCollapsed : ""}`}>
          <NotesList
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            needsFolderPick={needsFolderPick && storageMode === "filesystem"}
            onChooseFolder={onChooseFolder}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <NoteEditor />
        </div>
        {chatMounted ? (
          <div className={`${styles.chatWrap}${chatClosing ? ` ${styles.chatWrapClosing}` : ""}`}>
            <ChatPanel width={chatWidth} onWidthChange={setChatWidth} />
          </div>
        ) : null}
        <button
          type="button"
          className={`${styles.chatTray}${chatOpen || chatOpening ? ` ${styles.trayActive}` : ""}${chatClosing ? ` ${styles.trayClosing}` : ""}`}
          style={{
            "--tray-offset": chatOpen && !chatClosing ? "0px" : `${chatWidth - 40}px`,
            "--tray-anchor": `${chatWidth}px`,
          } as React.CSSProperties}
          onClick={chatOpen ? closeChat : openChat}
          title={chatOpen ? "Close AI Assistant" : "Open AI Assistant"}
          aria-label="Toggle AI panel"
          aria-expanded={chatOpen}
        >
          {chatOpen ? <CaretIcon size={14} /> : <><SparkleIcon size={14} /> AI</>}
        </button>
      </main>

      {onboardingOpen && (
        <OnboardingModal
          onClose={() => {
            localStorage.setItem("notty_onboarded", "1");
            setOnboardingOpen(false);
            setSettingsOpen(true);
          }}
          onSkip={() => {
            localStorage.setItem("notty_onboarded", "1");
            setOnboardingOpen(false);
          }}
        />
      )}

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
