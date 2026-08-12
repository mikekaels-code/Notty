# Notty

A minimalist, Notion-inspired note-taking app with a built-in AI assistant — local-first, fast, and private. Notty runs entirely in the browser and stores your notes as plain Markdown files directly on your device, so you own your data end to end.

**Live demo:** [https://notty-gray.vercel.app/](https://notty-gray.vercel.app/)

![Notty app screenshot]([https://placehold.co/1280x800?text=Notty+App+Screenshot](https://ibb.co.com/B5Rh2wCC))

---

## Table of Contents

- [Features](#features)
- [AI Assistant](#ai-assistant)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [How Storage Works](#how-storage-works)
- [Privacy & Security](#privacy--security)
- [Development](#development)

---

## Features

### Notes & Organization

- **Markdown editing** — a full WYSIWYG editor (TipTap) with rich formatting: headings, bold/italic, lists, links, blockquotes, and fenced code blocks.
- **Nested notes** — any note can have a *parent*, creating a child/parent hierarchy shown as an indented tree in the sidebar.
- **Categories** — tag notes into categories, which render as grouped sections in the sidebar.
- **Favorites** — pin notes to the top of the list for quick access.
- **Instant search** — filter the sidebar by title as you type.
- **Slash commands** — type `/` in the editor to insert a code block (`/code`) or link a child note (`/child`).
- **Keyboard shortcut** — `Ctrl/Cmd + N` creates a new note.
- **Autosave** — edits save automatically (debounced) with a visible "saved" indicator.
- **Dark / light theme** — persisted preference, toggleable in the header.

### Storage

- **Local file system** — notes are saved as individual `.md` files (with JSON frontmatter) in a folder *you* pick, using the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API). Your data never leaves your machine.
- **Seamless fallback** — browsers without File System Access API support transparently fall back to `localStorage`.
- **Persistent folder handle** — your chosen folder is remembered across sessions via IndexedDB (re-prompting only if permission is revoked).

---

## AI Assistant

Notty ships with a built-in chat assistant that can operate on your notes through **function calling**. It streams responses token-by-token and shows a live "working" indicator while executing tools.

### What the AI can do

| Tool | Capability |
| --- | --- |
| `list_notes` | List all notes with id, title, parent, and category |
| `read_note` | Read the full content of a note |
| `create_note` | Create a note (optionally nested under a parent or in a category) |
| `update_note` | Replace a note's content, parent, or category |
| `delete_note` | Permanently delete a note |
| `reorder_notes` | Reorder sibling notes |
| `move_notes` | Move a note under a parent or back to root |
| `toggle_pin` | Pin/unpin a note (favorites) |
| `set_category` | Assign or clear a category |
| `search_notes` | Find note ids by keyword in title or content |

### Notable AI behaviors

- **Clarifying questions** — when a request is ambiguous, the AI asks instead of guessing, and presents a numbered list that renders as clickable buttons in the chat.
- **Agent Memory** — notes in the special *Agent Memory* category are injected into every conversation as persistent context, so the assistant remembers your preferences, style, and facts across sessions.
- **Style guide** — a system prompt instructs the model to produce clean, well-structured Markdown (headings, lists, spacing) that matches Notty's editor.
- **Multi-provider** — works with DeepSeek, OpenAI, Anthropic (Claude), and ZhipuAI (GLM). Models are selectable and auto-fetched where the provider exposes a models endpoint.
- **Multi-round tool use** — the assistant loops through tool calls and model turns (up to 8 rounds) so complex requests like "create 10 notes" or "move everything into a category" work in a single message.

### Configuring the AI

Open **Settings** (gear icon) to:

1. Choose a provider (DeepSeek is the default).
2. Paste your API key (stored **only** in this browser — see [Privacy](#privacy--security)).
3. Pick a model.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| UI framework | React 19 |
| Language | TypeScript |
| Build tool | Vite 8 |
| State management | Redux Toolkit |
| Editor | TipTap (StarterKit, Link, Placeholder, Markdown) |
| Styling | SCSS Modules (CSS custom properties for theming) |
| Icons | Flaticon UIcons |
| Linting | oxlint |
| Storage | File System Access API, IndexedDB, `localStorage` |

---

## Architecture

The codebase is organized into a clear core/web split:

```
src/
├── core/                # Framework-agnostic domain logic
│   ├── ai/              # AI providers, tool definitions & execution, skills
│   │   ├── deepseek.ts  # Provider registry + streaming chat client
│   │   ├── tools.ts     # Tool implementation (note CRUD via storage adapter)
│   │   └── skills.ts    # Agent skills, style guide, Agent Memory
│   ├── store/           # Redux Toolkit slices (notes, chat, settings)
│   ├── types.ts         # Shared types (Note, ChatMessage, StorageMode, …)
│   └── utils.ts         # Markdown frontmatter serialize/parse, deriveTitle, …
└── web/                 # Presentation layer (React components, styles)
    ├── components/      # NotesList, NoteEditor, ChatPanel, SettingsModal, …
    └── storage/         # fsAdapter, fallbackAdapter, idbHandles, storageFactory
```

Key design decisions:

- **`core/` is UI-agnostic** — AI and storage logic are decoupled from React, making them easy to test and reuse.
- **Storage adapter interface** — `NotesStorageAdapter` abstracts file-system vs. localStorage, so the rest of the app doesn't care where notes live.
- **Redux Toolkit** — notes, chat, and settings are separate slices with async thunks for AI streaming and note persistence.

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/mikekaels-code/Notty.git
cd Notty

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Then open the app:

1. Click **Settings** (gear icon, top-right) and pick a folder for your notes.
2. (Optional) Add an API key for the AI assistant.
3. Start writing — or ask the assistant to create notes for you.

---

## How Storage Works

When you pick a folder, Notty creates one file per note:

```markdown
---
{
  "id": "abc123…",
  "title": "Meeting notes",
  "createdAt": "2026-08-12T…",
  "updatedAt": "2026-08-12T…",
  "pinned": false,
  "category": "Work"
}
---

# Meeting notes

Actual note content as Markdown…
```

Because notes are plain Markdown files, you can open, edit, or sync the folder with any other tool (Obsidian, VS Code, git, etc.).

---

## Privacy & Security

- **Local-first** — notes live on your device, never on a server.
- **Your API key stays local** — it's stored in your browser (`localStorage`) and sent only to the provider you select, never anywhere else.
- **No accounts, no telemetry** — the app has no backend and collects nothing.

---

## Development

```bash
npm run dev       # Start the Vite dev server
npm run build     # Typecheck (tsc -b) and build for production
npm run lint      # Run oxlint
npm run preview   # Preview the production build
```
