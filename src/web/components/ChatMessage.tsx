import styles from "./ChatMessage.module.scss";
import type { ChatMessage as ChatMessageType } from "../../core/types";
import { CheckIcon, WarningIcon, SparkleIcon } from "./icons";

export default function ChatMessage({ msg }: { msg: ChatMessageType }) {
  const isUser = msg.role === "user";

  return (
    <div className={`${styles.row} ${isUser ? styles.user : styles.assistant}`}>
      {!isUser && (
        <span className={styles.avatar} aria-hidden>
          <SparkleIcon size={13} />
        </span>
      )}
      <div className={styles.bubbleWrap}>
        {msg.content && <div className={styles.bubble}>{msg.content}</div>}
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
      </div>
    </div>
  );
}
