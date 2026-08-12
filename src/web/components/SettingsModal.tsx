import { useEffect, useRef, useState } from "react";
import styles from "./SettingsModal.module.scss";
import { useAppDispatch, useAppSelector, store } from "../../core/store";
import { setApiKey, setModel, setProvider, setStorageMode, setConnection, refreshModels } from "../../core/store/settingsSlice";
import { PROVIDERS, isProvider, testProviderConnection, type AiProvider } from "../../core/ai/deepseek";
import { pickNotesFolder, resetNotesFolder } from "../storage/storageFactory";
import { FolderIcon, XIcon, CheckIcon } from "./icons";
import ThemeToggle from "./ThemeToggle";

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");
  const firstField = useRef<HTMLInputElement | null>(null);

  const providerId: AiProvider = isProvider(settings.provider) ? settings.provider : "deepseek";
  const prov = PROVIDERS[providerId];
  const apiKey = settings.apiKeys[providerId] ?? "";
  const hasKey = apiKey.trim().length > 0;

  function onProviderChange(p: AiProvider) {
    dispatch(setProvider(p));
    dispatch(setModel(PROVIDERS[p].defaultModel));
    dispatch(refreshModels(p));
  }

  useEffect(() => {
    const validModels = PROVIDERS[providerId].models;
    if (hasKey && !validModels.includes(settings.model)) {
      dispatch(setModel(PROVIDERS[providerId].defaultModel));
    }
  }, [hasKey, settings.model, dispatch, providerId]);

  useEffect(() => {
    if (hasKey) dispatch(refreshModels(providerId));
    // refresh when provider or key presence changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey, providerId]);
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

  useEffect(() => {
    dispatch(setConnection("untested"));
    setTestError("");
  }, [apiKey, providerId, dispatch]);

  async function onTestConnection() {
    if (!apiKey.trim() || testing) return;
    setTesting(true);
    setTestError("");
    try {
      await testProviderConnection(providerId, apiKey.trim());
      dispatch(setConnection("ok"));
    } catch (err) {
      dispatch(setConnection("error"));
      setTestError(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <div className={styles.headerRight}>
            <ThemeToggle />
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
              <XIcon size={15} />
            </button>
          </div>
        </header>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>AI Assistant</h3>
          <label className={styles.field}>
            <span className={styles.label}>Provider</span>
            <select
              className={styles.input}
              value={prov.id}
              onChange={(e) => onProviderChange(e.target.value as AiProvider)}
            >
              {Object.values(PROVIDERS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{prov.keyLabel}</span>
            <div className={styles.keyRow}>
              <input
                ref={firstField}
                type={showKey ? "text" : "password"}
                className={styles.input}
                value={apiKey}
                onChange={(e) => dispatch(setApiKey({ provider: providerId, key: e.target.value }))}
                onBlur={() => { if (apiKey.trim()) dispatch(refreshModels(providerId)); }}
                placeholder={prov.keyPlaceholder}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className={styles.ghostBtn} onClick={() => setShowKey((v) => !v)}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {hasKey && (
            <>
              <div className={styles.testRow}>
                <button
                  type="button"
                  className={styles.testBtn}
                  onClick={onTestConnection}
                  disabled={testing}
                >
                  {testing ? "Testing…" : "Test connection"}
                </button>
                {settings.connection === "ok" && (
                  <span className={styles.testOk}>
                    <CheckIcon size={13} />
                    Connected
                  </span>
                )}
              </div>
              {settings.connection === "error" && <p className={styles.testErr}>{testError}</p>}
            </>
          )}
          {hasKey && <p className={styles.note}>{prov.note}</p>}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Notes storage</h3>

          <div className={styles.storageCards}>
            <div className={styles.storageRow}>
              <button
                type="button"
                className={`${styles.storageCard} ${settings.storageMode === "filesystem" ? styles.storageCardActive : ""}`}
                onClick={() => {
                  dispatch(setStorageMode("filesystem"));
                  if (settings.folderChosen) onResetFolder();
                }}
              >
                <div className={styles.storageCardIcon}>
                  <FolderIcon size={18} />
                </div>
                <div className={styles.storageCardBody}>
                  <span className={styles.storageCardTitle}>Filesystem</span>
                  <span className={styles.storageCardDesc}>
                    {settings.folderChosen
                      ? "Synced to your chosen folder"
                      : "Pick a folder — each note becomes a Markdown file"}
                  </span>
                </div>
                {settings.storageMode === "filesystem" && settings.folderChosen && (
                  <span className={styles.storageBadge}>Active</span>
                )}
              </button>
              {settings.storageMode === "filesystem" && (
                <button type="button" className={styles.storageFolderBtn} onClick={onChooseFolder}>
                  <FolderIcon size={14} />
                  {settings.folderChosen ? "Change" : "Choose"}
                </button>
              )}
            </div>
          </div>

        </section>
      </div>
    </div>
  );
}
