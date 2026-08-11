import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import styles from "./ChatPanel.module.scss";
import ChatMessage from "./ChatMessage";
import { useAppDispatch, useAppSelector } from "../../core/store";
import { sendMessage, clearChat } from "../../core/store/chatSlice";
import { SparkleIcon, SendIcon, XIcon } from "./icons";

export default function ChatPanel() {
  const dispatch = useAppDispatch();
  const messages = useAppSelector((s) => s.chat.messages);
  const streamingText = useAppSelector((s) => s.chat.streamingText);
  const streaming = useAppSelector((s) => s.chat.streaming);
  const error = useAppSelector((s) => s.chat.error);
  const apiKey = useAppSelector((s) => s.settings.apiKey);

  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  function submit() {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");
    dispatch(sendMessage(text));
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
    <div className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.headerIcon}><SparkleIcon size={15} /></span>
        <h1 className={styles.title}>AI Assistant</h1>
        {messages.length > 0 && (
          <button type="button" className={styles.clearBtn} onClick={() => dispatch(clearChat())} title="Clear chat">
            <XIcon size={14} /> Clear
          </button>
        )}
      </header>

      {!apiKey && (
        <div className={styles.notice}>
          <strong>No API key set.</strong> Open Settings (bottom-left) to enter your DeepSeek API key.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <SparkleIcon size={24} />
            <p>Your AI assistant can read and edit notes directly.</p>
            <p className={styles.hint}>
              Try: "Create a note about my project ideas" or "List my notes."
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}

        {streaming && streamingText && (
          <div className={styles.streaming}>
            <span className={styles.streamingDot} aria-hidden />
            <div className={styles.streamingText}>{streamingText}</div>
          </div>
        )}

        {streaming && !streamingText && (
          <div className={styles.thinking}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything about your notes… (Enter to send)"
          rows={1}
          aria-label="Chat message"
          disabled={streaming}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!draft.trim() || streaming}
          aria-label="Send"
          title="Send (Enter)"
        >
          <SendIcon size={15} />
        </button>
      </form>
    </div>
  );
}
