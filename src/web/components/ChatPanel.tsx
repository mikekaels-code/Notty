import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { createSelector } from "@reduxjs/toolkit";
import styles from "./ChatPanel.module.scss";
import ChatMessage from "./ChatMessage";
import { useAppDispatch, useAppSelector } from "../../core/store";
import type { RootState } from "../../core/store";
import { sendMessage, newChat, selectChat, closeChat, reopenChat, deleteChat } from "../../core/store/chatSlice";
import { setProvider, setModel } from "../../core/store/settingsSlice";
import { PROVIDERS } from "../../core/ai/deepseek";
import { SparkleIcon, SendIcon, PlusIcon, XIcon, HistoryIcon, SearchIcon, FolderIcon } from "./icons";

const MIN_WIDTH = 280;
const MAX_WIDTH = 640;

const selectKeyedProviders = createSelector(
  [(state: RootState) => state.settings.apiKeys],
  (apiKeys) => Object.values(PROVIDERS).filter((p) => (apiKeys[p.id] ?? "").trim().length > 0),
);

const SUGGESTIONS = [
  { label: "Create a note", prompt: "Create a note about ", icon: PlusIcon },
  { label: "List my notes", prompt: "List my notes", icon: FolderIcon },
  { label: "Search notes", prompt: "Find notes about ", icon: SearchIcon },
];

function relTime(ts: string | number): string {
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  const diff = Date.now() - time;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function ChatPanel({
  width,
  onWidthChange,
  onClose,
  onOpenSettings,
}: {
  width: number;
  onWidthChange: (w: number) => void;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const dispatch = useAppDispatch();
  const conversations = useAppSelector((s) => s.chat.conversations);
  const archived = useAppSelector((s) => s.chat.archived);
  const activeChatId = useAppSelector((s) => s.chat.activeChatId);
  const active = conversations.find((c) => c.id === activeChatId);
  const messages = active?.messages ?? [];
  const streamingText = useAppSelector((s) => s.chat.streamingText);
  const streaming = useAppSelector((s) => s.chat.streaming);
  const toolWorking = useAppSelector((s) => s.chat.toolWorking);
  const error = useAppSelector((s) => s.chat.error);
  const apiKey = useAppSelector((s) => s.settings.apiKeys[s.settings.provider] ?? "");
  const model = useAppSelector((s) => s.settings.model);
  const connection = useAppSelector((s) => s.settings.connection);
  const connectionFailed = connection === "error";

  const keyedProviders = useAppSelector(selectKeyedProviders);
  const cachedModels = useAppSelector((s) => s.settings.cachedModels);
  const modelOptions = keyedProviders.flatMap((p) => {
    const cached = cachedModels[p.id] ?? [];
    const hardcoded = p.models;
    return [...new Set([...cached, ...hardcoded])].map((m) => ({ provider: p.id, model: m }));
  });

  const [draft, setDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dragging = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 71)}px`;
    ta.style.overflowY = ta.scrollHeight > 71 ? "auto" : "hidden";
  }, [draft]);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      onWidthChange(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - ev.clientX)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function submit(text?: string) {
    const t = (text ?? draft).trim();
    if (!t || streaming) return;
    setDraft("");
    dispatch(sendMessage(t));
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <div className={styles.panel} style={{ width }}>
      <div className={styles.resizeHandle} onPointerDown={startResize} role="separator" aria-label="Resize AI panel" />

      <header className={styles.header}>
        <span className={styles.headerMark}>
          <SparkleIcon size={13} />
        </span>
        <span className={styles.title}>Assistant</span>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={`${styles.iconBtn} ${showHistory ? styles.iconBtnActive : ""}`}
            onClick={() => setShowHistory((v) => !v)}
            title="Session history"
            aria-label="Session history"
          >
            <HistoryIcon size={15} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => dispatch(newChat())}
            title="New chat"
            aria-label="New chat"
          >
            <PlusIcon size={15} />
          </button>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Close assistant"
            aria-label="Close assistant"
          >
            <XIcon size={15} />
          </button>
        </div>
      </header>

      {conversations.length > 1 && (
        <div className={styles.tabs}>
          {conversations.map((c) => (
            <span
              key={c.id}
              className={`${styles.tab} ${c.id === activeChatId ? styles.tabActive : ""}`}
              onClick={() => dispatch(selectChat(c.id))}
              title={c.title}
            >
              <span className={styles.tabLabel}>{c.title || "New"}</span>
              <button
                type="button"
                className={styles.tabClose}
                aria-label={`Close ${c.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(closeChat(c.id));
                }}
              >
                <XIcon size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {connection !== "ok" && (
        <div className={styles.notice}>
          <span>
            {!apiKey
              ? "No API key set."
              : connection === "error"
              ? "Connection failed. Check your API key."
              : "API key not verified yet."}
          </span>
          <button type="button" className={styles.noticeBtn} onClick={onOpenSettings}>
            {!apiKey ? "Open Settings to add one" : "Open Settings"}
          </button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {showHistory ? (
        <div className={styles.history}>
          <h4 className={styles.historyTitle}>Recent</h4>
          {conversations.length === 0 && (
            <p className={styles.historyEmpty}>No sessions yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`${styles.historyItem} ${c.id === activeChatId ? styles.historyActive : ""}`}
              onClick={() => {
                dispatch(selectChat(c.id));
                setShowHistory(false);
              }}
            >
              <span className={styles.historyItemTitle}>{c.title || "New chat"}</span>
              <span className={styles.historyMeta}>{relTime(c.createdAt)}</span>
              <button
                type="button"
                className={styles.historyDel}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(deleteChat(c.id));
                }}
                aria-label={`Delete ${c.title}`}
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}

          {archived.length > 0 && <h4 className={styles.historyTitle}>Closed</h4>}
          {archived.map((c) => (
            <div
              key={c.id}
              className={styles.historyItem}
              onClick={() => {
                dispatch(reopenChat(c.id));
                setShowHistory(false);
              }}
            >
              <span className={styles.historyItemTitle}>{c.title || "New chat"}</span>
              <span className={styles.historyMeta}>{relTime(c.createdAt)}</span>
              <button
                type="button"
                className={styles.historyDel}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(deleteChat(c.id));
                }}
                aria-label={`Delete ${c.title}`}
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.messages}>
          {messages.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon} aria-hidden>
                <SparkleIcon size={22} />
              </div>
              <p className={styles.emptyHeading}>Ask anything about your notes</p>
              <p className={styles.emptySub}>
                I can create, read, edit, search, and organize.
              </p>
              <div className={styles.chips}>
                {SUGGESTIONS.filter((s) => !hiddenSuggestions.has(s.label)).map((s) => (
                  <div
                    key={s.label}
                    role="button"
                    tabIndex={streaming || !apiKey || connectionFailed ? -1 : 0}
                    className={`${styles.chip} ${streaming || !apiKey || connectionFailed ? styles.chipDisabled : ""}`}
                    onClick={() => {
                      if (streaming || !apiKey || connectionFailed) return;
                      submit(s.prompt);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (streaming || !apiKey || connectionFailed) return;
                        submit(s.prompt);
                      }
                    }}
                  >
                    <span className={styles.chipIcon} aria-hidden="true">
                      <s.icon size={14} />
                    </span>
                    <span className={styles.chipLabel}>{s.label}</span>
                    <button
                      type="button"
                      className={styles.chipClose}
                      onClick={(e) => {
                        e.stopPropagation();
                        setHiddenSuggestions((prev) => new Set([...prev, s.label]));
                      }}
                      aria-label={`Dismiss "${s.label}" suggestion`}
                    >
                      <XIcon size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage key={msg.id} msg={msg} isLast={i === messages.length - 1} />
          ))}

          {streaming && streamingText && (
            <div className={styles.streamingText}>{streamingText}</div>
          )}

          {streaming && (toolWorking || !streamingText) && (
            <div className={styles.thinking}>
              <span className={styles.thinkingLabel}>{toolWorking ? "Working on your notes" : "Thinking"}</span>
              <span className={styles.thinkingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </span>
            </div>
          )}

          <div ref={endRef} />
        </div>
      )}

      <form className={styles.form} onSubmit={onSubmit}>
        {keyedProviders.length > 0 && (
          <select
            className={styles.modelSelect}
            value={modelOptions.some((o) => o.model === model) ? model : ""}
            onChange={(e) => {
              const opt = modelOptions.find((o) => o.model === e.target.value);
              if (!opt) return;
              dispatch(setProvider(opt.provider));
              dispatch(setModel(opt.model));
            }}
            aria-label="AI model"
            disabled={streaming || connectionFailed}
          >
            {!modelOptions.some((o) => o.model === model) && <option value="" disabled>Model</option>}
            {keyedProviders.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <div className={styles.inputRow}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything…"
            rows={1}
            aria-label="Chat message"
            disabled={streaming || connectionFailed}
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!draft.trim() || streaming || connectionFailed}
            aria-label="Send"
            title="Send (Enter)"
          >
            <SendIcon size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}
