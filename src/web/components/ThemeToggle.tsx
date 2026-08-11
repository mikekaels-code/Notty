import styles from "./ThemeToggle.module.scss";
import { SunIcon, MoonIcon } from "./icons";
import { useAppDispatch, useAppSelector } from "../../core/store";
import { toggleTheme } from "../../core/store/themeSlice";

export default function ThemeToggle() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((s) => s.theme.mode);

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => dispatch(toggleTheme())}
      aria-label={mode === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title="Toggle theme"
    >
      {mode === "light" ? <MoonIcon size={15} /> : <SunIcon size={15} />}
    </button>
  );
}
