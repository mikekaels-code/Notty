import { useEffect, useState, type ReactNode } from "react";
import styles from "./OnboardingModal.module.scss";
import { NotesIcon, SparkleIcon, FolderIcon, CheckIcon, CaretIcon } from "./icons";
import nottyLogo from "../../assets/notty-logo.png";

interface Slide {
  icon: ReactNode;
  title: string;
  body: string;
  points: string[];
}

const SLIDES: Slide[] = [
  {
    icon: <NotesIcon size={26} />,
    title: "Welcome to Notty",
    body: "Your notes, living on your own device as plain Markdown files.",
    points: [
      "Write in a clean, distraction-free editor",
      "Notes save as .md files in a folder you choose",
      "Private by default — no accounts, no cloud",
    ],
  },
  {
    icon: <SparkleIcon size={26} />,
    title: "Meet your AI assistant",
    body: "Ask Notty to read, write, and organize your notes — right from the chat.",
    points: [
      "Create, update, or search notes with plain language",
      "Get answers grounded in your own notes",
      "It remembers your preferences via Agent Memory",
    ],
  },
  {
    icon: <FolderIcon size={26} />,
    title: "Organize your way",
    body: "Structure your notes into a hierarchy that works for you.",
    points: [
      "Nest notes under parents for a clean tree",
      "Group notes into categories",
      "Pin favorites to the top and search instantly",
    ],
  },
];

export default function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const next = () => (last ? onClose() : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const slide = SLIDES[index];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Welcome to Notty">
      <div className={styles.card}>
        <button type="button" className={styles.skip} onClick={onClose}>
          Skip
        </button>

        <div className={styles.brand}>
          <img src={nottyLogo} alt="" className={styles.logo} />
          <span className={styles.brandName}>Notty</span>
        </div>

        <div key={index} className={styles.body}>
          <div className={styles.iconWrap}>{slide.icon}</div>
          <h2 className={styles.title}>{slide.title}</h2>
          <p className={styles.text}>{slide.body}</p>
          <ul className={styles.points}>
            {slide.points.map((p) => (
              <li key={p}>
                <span className={styles.check}>
                  <CheckIcon size={11} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <div className={styles.dots}>
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.dot}${i === index ? ` ${styles.dotActive}` : ""}`}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
          <div className={styles.actions}>
            {index > 0 && (
              <button type="button" className={styles.back} onClick={prev}>
                Back
              </button>
            )}
            <button type="button" className={styles.next} onClick={next}>
              {last ? "Get started" : "Next"}
              <CaretIcon size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
