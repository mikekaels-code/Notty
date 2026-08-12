import styles from "./ChatMessage.module.scss";
import { useAppDispatch } from "../../core/store";
import { sendMessage } from "../../core/store/chatSlice";
import type { ChatMessage as ChatMessageType } from "../../core/types";
import { CheckIcon, WarningIcon, SparkleIcon } from "./icons";
import Markdown from "./Markdown";

/** Collects a trailing numbered list ("1. x\n2. y") from assistant markdown. */
function extractOptions(content: string): string[] | null {
  const lines = content.trimEnd().split("\n");
  const items: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^\s*\d+[.)]\s+(.+)$/);
    if (!m) break;
    items.unshift(m[1].trim());
  }
  return items.length >= 2 ? items : null;
}

export default function ChatMessage({ msg, isLast }: { msg: ChatMessageType; isLast?: boolean }) {
  const dispatch = useAppDispatch();
  const isUser = msg.role === "user";
  const options = isLast && !isUser ? extractOptions(msg.content ?? "") : null;

  return (
    <div className={`${styles.row} ${isUser ? styles.user : styles.assistant}`}>
      {!isUser && (
        <span className={styles.avatar} aria-hidden>
          <SparkleIcon size={13} />
        </span>
      )}
      <div className={styles.bubbleWrap}>
        {msg.content && (
          <div className={styles.bubble}>
            {isUser ? msg.content : <Markdown text={msg.content} />}
          </div>
        )}
        {msg.toolResults && msg.toolResults.length > 0 && (
          <ul className={styles.tools}>
            {msg.toolResults.map((r) => (
              <li key={r.callId} className={r.ok ? styles.toolOk : styles.toolErr}>
                {r.ok ? <CheckIcon size={12} /> : <WarningIcon size={12} />}
                <span>{r.summary}</span>
              </li>
            ))}
          </ul>
        )}
        {options && (
          <div className={styles.choices}>
            {options.map((opt, i) => (
              <button
                key={i}
                type="button"
                className={styles.choiceBtn}
                onClick={() => dispatch(sendMessage(opt))}
              >
                {i + 1}. {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
