import type { ReactNode } from "react";

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\((?:notty:\/\/[^)]+|https?:\/\/[^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const [full, code, bold, italic, link] = m;
    if (code) {
      nodes.push(
        <code key={`${keyBase}-${i++}`} className="md-code">
          {full.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      nodes.push(
        <strong key={`${keyBase}-${i++}`}>{full.slice(2, -2)}</strong>,
      );
    } else if (italic) {
      nodes.push(<em key={`${keyBase}-${i++}`}>{full.slice(1, -1)}</em>);
    } else if (link) {
      const sep = full.indexOf("](");
      const label = full.slice(1, sep);
      const href = full.slice(sep + 2, -1);
      if (href.startsWith("notty://")) {
        nodes.push(
          <span key={`${keyBase}-${i++}`} className="md-note">
            {label}
          </span>,
        );
      } else {
        nodes.push(
          <a key={`${keyBase}-${i++}`} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>,
        );
      }
    }
    last = m.index + full.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderBlock(block: string, keyBase: string, listType?: "ul" | "ol"): ReactNode {
  const key = `${keyBase}-${block}`;
  const trimmed = block.trim();
  if (trimmed.startsWith("### ")) {
    return <h3 key={key}>{renderInline(trimmed.slice(4), key)}</h3>;
  }
  if (trimmed.startsWith("## ")) {
    return <h2 key={key}>{renderInline(trimmed.slice(3), key)}</h2>;
  }
  if (trimmed.startsWith("# ")) {
    return <h1 key={key}>{renderInline(trimmed.slice(2), key)}</h1>;
  }
  const lines = trimmed.split("\n");
  if (listType === "ul") {
    return (
      <ul key={key}>
        {lines.map((ln, i) => (
          <li key={i}>
            {renderInline(ln.replace(/^[-*]\s+/, ""), `${key}-${i}`)}
          </li>
        ))}
      </ul>
    );
  }
  if (listType === "ol") {
    return (
      <ol key={key}>
        {lines.map((ln, i) => (
          <li key={i}>
            {renderInline(ln.replace(/^\d+\.\s+/, ""), `${key}-${i}`)}
          </li>
        ))}
      </ol>
    );
  }
  return <p key={key}>{renderInline(trimmed, key)}</p>;
}

export default function Markdown({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  const nodes: ReactNode[] = [];
  let blockIndex = 0;
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    if (part.startsWith("```")) {
      const code = part.slice(3, -3).replace(/^[a-z]*\n/i, "");
      nodes.push(
        <pre key={`pre-${p}`} className="md-pre">
          <code>{code}</code>
        </pre>,
      );
      continue;
    }
    const blocks = part.split(/\n\n+/).filter((b) => b.trim().length > 0);
    for (const block of blocks) {
      const trimmed = block.trim();
      if (/^[-*]\s+/m.test(trimmed)) {
        nodes.push(renderBlock(trimmed, `b-${blockIndex++}`, "ul"));
      } else if (/^\d+\.\s+/m.test(trimmed)) {
        nodes.push(renderBlock(trimmed, `b-${blockIndex++}`, "ol"));
      } else {
        nodes.push(renderBlock(trimmed, `b-${blockIndex++}`));
      }
    }
  }
  return <>{nodes}</>;
}
