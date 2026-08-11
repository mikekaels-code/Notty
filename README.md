# SmartNotes

A minimalist, Notion-inspired note-taking app with a built-in AI assistant. SmartNotes is a client-side React application that stores your notes directly on your local file system as plain Markdown files.

## Features

- **Local File System Storage**: Notes are saved directly to a folder on your computer using the File System Access API. Your data stays on your machine.
- **Markdown with Frontmatter**: Notes are standard Markdown files with JSON frontmatter (for metadata like ID, creation date, and pin status).
- **AI Assistant**: Built-in chat powered by DeepSeek. The AI can read, search, create, and update your notes.
- **Offline Capable**: Works entirely locally (except for AI features which require an API key).
- **Fallback Storage**: If your browser doesn't support the File System Access API, it gracefully falls back to browser `localStorage`.
- **Minimalist Design**: Clean UI, dark/light mode, keyboard shortcuts.

## Tech Stack

- React 19 + TypeScript
- Vite 8
- Redux Toolkit
- SCSS Modules
- `wicg-file-system-access` for type definitions

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
4. Open the app and click the Settings icon to configure your DeepSeek API key and choose a folder for your notes.

## Development

- `npm run dev`: Start the dev server
- `npm run build`: Typecheck and build for production
- `npm run lint`: Run oxlint
