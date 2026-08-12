export interface AgentSkill {
  name: string;
  examples: string[];
  description: string;
}

export const AGENT_MEMORY_CATEGORY = "Agent Memory";

export function buildAgentMemoryText(notes: Array<{ title: string; content: string }>): string {
  if (!notes.length) return "";
  const lines = notes.map((n) => `### ${n.title}\n${n.content}`);
  return (
    "\n\n--- Agent Memory (notes about the user's preferences, context, and style) ---\n" +
    lines.join("\n\n")
  );
}

export const AGENT_STYLE_RULES = [
  "Use headings (# ## ###) for structure — always leave a blank line before and after each heading.",
  "Use bullet lists (- or *) for items, numbered lists (1.) for steps. Leave a blank line before lists.",
  "Use **bold** for emphasis, `code` for code, > for blockquotes.",
  "Keep paragraphs short (2-4 sentences). Leave a blank line between paragraphs.",
  "Use --- to create horizontal breaks between sections.",
  "Use ```language fences for code blocks with a language tag.",
  "Do NOT put a # Title heading at the start of content — the title is stored separately.",
  "End content clean — no trailing whitespace or unnecessary blank lines at the very end.",
];

export const AGENT_STYLE_TEXT = "Style guide for note content:\n" + AGENT_STYLE_RULES.map((r) => `- ${r}`).join("\n");

export const AGENT_SKILLS: AgentSkill[] = [
  {
    name: "List notes",
    examples: ["List my notes", "Show all notes"],
    description: "Return all notes with id, title, parent and category.",
  },
  {
    name: "Read a note",
    examples: ["Read <title>", "Open my note about X"],
    description: "Load full content of a single note by id.",
  },
  {
    name: "Create a note",
    examples: ["Create a note about X", "Make a new note titled Y"],
    description: "Create a note; may set parent_id to nest it or category.",
  },
  {
    name: "Update a note",
    examples: ["Update <title> to …", "Rewrite my note about X"],
    description: "Replace content of an existing note; read it first.",
  },
  {
    name: "Delete a note",
    examples: ["Delete <title>", "Remove note X"],
    description: "Permanently delete a note by id.",
  },
  {
    name: "Nest & move notes",
    examples: ["Put note X under note Y", "Move X into Y", "Move X back to root"],
    description: "Re-parent a note under another, back to root, or reorder siblings.",
  },
  {
    name: "Search notes",
    examples: ["Find notes about hiking", "Search for budget"],
    description: "Find note ids by keyword in title or content.",
  },
  {
    name: "Favorites",
    examples: ["Pin note X", "Unfavorite Y"],
    description: "Toggle the pinned (favorite) flag so it sits at the top.",
  },
  {
    name: "Categories",
    examples: ["Categorize X as Work", "Remove category from Y"],
    description: "Assign or clear a note's category; new categories auto-create.",
  },
  {
    name: "Agent Memory",
    examples: ["Remember that I prefer short notes", "Save my writing style as a memory"],
    description: `Create or update notes in the "${AGENT_MEMORY_CATEGORY}" category. These are injected into every chat as persistent context so you remember the user's preferences, writing style, and important facts across sessions.`,
  },
];

export const AGENT_SKILLS_TEXT = AGENT_SKILLS.map(
  (s) => `- ${s.name}: ${s.description} Example prompts: ${s.examples.join(", ")}.`,
).join("\n");
