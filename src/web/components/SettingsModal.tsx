import { useEffect, useRef, useState } from "react";
import styles from "./SettingsModal.module.scss";
import { useAppDispatch, useAppSelector, store } from "../../core/store";
import { setApiKey, setModel, setStorageMode } from "../../core/store/settingsSlice";
import { pickNotesFolder, resetNotesFolder, switchToFallback } from "../storage/storageFactory";
import { FolderIcon, XIcon, WarningIcon } from "./icons";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);
  const [showKey, setShowKey] = useState(false);
  const firstField = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onChooseFolder() {
    try {
      await pickNotesFolder(store);
    } catch {
      /* user cancelled picker */
    }
  }

  async function onResetFolder() {
    if (!confirm("Stop using your notes folder? The next save will ask for a new location.")) return;
    await resetNotesFolder(store);
  }

  async function onSwitchFallback() {
    if (!confirm("Switch to storing notes in this browser only? Files on disk are left untouched.")) return;
    await switchToFallback(store);
  }

  const onFilesystem = () => dispatch(setStorageMode("filesystem"));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
            <XIcon size={15} />
          </button>
        </header>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>AI Assistant</h3>
          <label className={styles.field}>
            <span className={styles.label}>DeepSeek API key</span>
            <div className={styles.keyRow}>
              <input
                ref={firstField}
                type={showKey ? "text" : "password"}
                className={styles.input}
                value={settings.apiKey}
                onChange={(e) => dispatch(setApiKey(e.target.value))}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className={styles.ghostBtn} onClick={() => setShowKey((v) => !v)}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Model</span>
            <input
              type="text"
              className={styles.input}
              value={settings.model}
              onChange={(e) => dispatch(setModel(e.target.value))}
              placeholder="deepseek-chat"
              spellCheck={false}
            />
          </label>
          <p className={styles.note}>
            Your key is stored only in this browser and is sent only to DeepSeek's API.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Notes storage</h3>

          {settings.storageMode === "filesystem" ? (
            <>
              <div className={styles.storageStatus}>
                {settings.folderChosen ? (
                  <span className={styles.ok}>
                    <FolderIcon size={14} /> Notes saved to your chosen folder on disk.
                  </span>
                ) : (
                  <span className={styles.warn}>
                    <WarningIcon size={14} /> No folder chosen yet. Pick one to save notes as Markdown files.
                  </span>
                )}
              </div>
              <div className={styles.btnRow}>
                <button type="button" className={styles.primaryBtn} onClick={onChooseFolder}>
                  <FolderIcon size={14} />
                  Choose folder…
                </button>
                <button type="button" className={styles.ghostBtn} onClick={onSwitchFallback}>
                  Use browser storage instead
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.storageStatus}>
                <span className={styles.warn}>
                  <WarningIcon size={14} /> Notes are stored only in this browser's local storage.
                </span>
              </div>
              <div className={styles.btnRow}>
                <button type="button" className={styles.primaryBtn} onClick={onFilesystem}>
                  <FolderIcon size={14} />
                  Save to filesystem
                </button>
              </div>
            </>
          )}

          {settings.storageMode === "filesystem" && settings.folderChosen && (
            <button type="button" className={styles.dangerBtn} onClick={onResetFolder}>
              Forget folder location
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
