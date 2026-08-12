interface IconProps {
  size?: number;
  className?: string;
}

function icon(name: string, size: number, className?: string) {
  return <i className={`fi fi-bs-${name}${className ? ` ${className}` : ""}`} style={{ fontSize: size }} aria-hidden />;
}

export function SunIcon({ size = 16, className }: IconProps) {
  return icon("sun", size, className);
}

export function MoonIcon({ size = 16, className }: IconProps) {
  return icon("moon", size, className);
}

export function NotesIcon({ size = 16, className }: IconProps) {
  return icon("notes", size, className);
}

export function ChatIcon({ size = 16, className }: IconProps) {
  return icon("comment", size, className);
}

export function PlusIcon({ size = 16, className }: IconProps) {
  return icon("plus", size, className);
}

export function PinIcon({ size = 14, className }: IconProps) {
  return icon("star", size, className);
}

export function TrashIcon({ size = 14, className }: IconProps) {
  return icon("trash", size, className);
}

export function BackIcon({ size = 15, className }: IconProps) {
  return icon("arrow-left", size, className);
}

export function GearIcon({ size = 16, className }: IconProps) {
  return icon("settings", size, className);
}

export function SendIcon({ size = 15, className }: IconProps) {
  return icon("paper-plane", size, className);
}

export function CheckIcon({ size = 14, className }: IconProps) {
  return icon("check", size, className);
}

export function XIcon({ size = 14, className }: IconProps) {
  return icon("cross", size, className);
}

export function WarningIcon({ size = 14, className }: IconProps) {
  return icon("triangle-warning", size, className);
}

export function FolderIcon({ size = 16, className }: IconProps) {
  return icon("folder", size, className);
}

export function SparkleIcon({ size = 16, className }: IconProps) {
  return icon("sparkles", size, className);
}

export function HomeIcon({ size = 16, className }: IconProps) {
  return icon("home", size, className);
}

export function SearchIcon({ size = 16, className }: IconProps) {
  return icon("search", size, className);
}

export function EllipsisIcon({ size = 16, className }: IconProps) {
  return icon("menu-dots", size, className);
}

export function CaretIcon({ size = 10, className }: IconProps) {
  return icon("angle-right", size, className);
}

export function HistoryIcon({ size = 16, className }: IconProps) {
  return icon("time-past", size, className);
}
