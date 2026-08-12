import { createAsyncThunk, createSlice, type UnknownAction, type PayloadAction } from "@reduxjs/toolkit";
import { streamChat, toDeepseekMessage, isProvider, PROVIDERS, type DeepseekMessage, type AiProvider } from "../ai/deepseek";
import { executeTool } from "../ai/tools";
import { getStorageAdapter } from "../storage";
import { genId, nowIso } from "../utils";
import type { ChatMessage, ChatToolCall, ToolResult } from "../types";
import { markSaved, removeNoteLocal, upsertNoteLocal, setActiveId } from "./notesSlice";
import { addCategory } from "./settingsSlice";
import type { RootState } from "./types";
import { AGENT_SKILLS_TEXT, AGENT_MEMORY_CATEGORY, buildAgentMemoryText, AGENT_STYLE_TEXT } from "../ai/skills";

const SYSTEM_PROMPT =
  "You are the AI assistant inside Notty, a note-taking app. " +
  "You can read, create, update, and delete the user's notes through tools. " +
  "Notes can be nested: a note may have a parent_id (a child note shown indented under its parent) and may belong to a category. " +
  "Your scope of duty — skills you have:\n" +
  AGENT_SKILLS_TEXT +
  "\n\n" +
  "Content style guidelines:\n" +
  AGENT_STYLE_TEXT +
  "\n\n" +
  "Rules:\n" +
  "- Prefer list_notes to get the correct note id before reading/updating/deleting.\n" +
  "- Never guess a note id; if the user's request is ambiguous (e.g. \"which note?\"), ask a clarifying question instead of acting.\n" +
  "- When you need the user to decide among options, ask a question and end your message with a numbered list (\"1. ...\\n2. ...\") — the app turns each item into a clickable button the user presses to answer.\n" +
  "- When asked to edit an existing note, read it first, then update it with the full new content.\n" +
  "- To create or modify a child note, pass parent_id with the exact parent id from list_notes.\n" +
  "- To reorder sibling notes, use reorder_notes with the sibling ids in the new desired order.\n" +
  "- To move a note under another parent or back to root level, use move_notes with parent_id (null to unnest).\n" +
  "- To favorite or unfavorite a note, use toggle_pin.\n" +
  "- To organize notes into categories, use set_category; a new category is created automatically.\n" +
  "- Use search_notes to find notes by keyword before other operations.\n" +

  "- Keep replies concise and warm. Confirm actions briefly, quoting the note title.\n" +
  "- Note content is Markdown. The note title is stored separately — do NOT repeat or prepend the title inside the content (no \"# Title\" heading in the body). Use proper spacing: leave a blank line before headings.\n" +
  "- When the user shares preferences, style choices, or important facts, proactively create or update a note in the \"Agent Memory\" category so you remember it across sessions.\n" +
  "- At the start of each chat, you receive the user's Agent Memory notes — use this context to personalize your responses.\n";

const MAX_TOOL_ROUNDS = 8;

const CHAT_KEY = "notty_chat";

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatState {
  conversations: ChatConversation[];
  archived: ChatConversation[];
  activeChatId: string | null;
  streamingText: string;
  streaming: boolean;
  /** True while the model streams tool calls or executes them (long work, no text). */
  toolWorking: boolean;
  error: string | null;
}

function freshConversation(): ChatConversation {
  return { id: genId(), title: "New chat", messages: [], createdAt: nowIso(), updatedAt: nowIso() };
}

function persistChat(state: Pick<ChatState, "conversations" | "archived" | "activeChatId">): void {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify({ v: 1, conversations: state.conversations, archived: state.archived, activeChatId: state.activeChatId }));
  } catch {
    /* storage unavailable */
  }
}

function loadChat(): Pick<ChatState, "conversations" | "archived" | "activeChatId"> {
  const fresh = freshConversation();
  const fallback = { conversations: [fresh], archived: [], activeChatId: fresh.id };
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const convs = (parsed as { conversations?: unknown })?.conversations;
      const arch = (parsed as { archived?: unknown })?.archived;
      const id = (parsed as { activeChatId?: unknown })?.activeChatId;
      const valid = (list: unknown): ChatConversation[] =>
        Array.isArray(list)
          ? list.filter(
              (c): c is ChatConversation =>
                !!c && typeof c === "object" && typeof (c as ChatConversation).id === "string" && Array.isArray((c as ChatConversation).messages),
            )
          : [];
      const conversations = valid(convs);
      const archived = valid(arch);
      if (conversations.length > 0) {
        const activeChatId = typeof id === "string" && conversations.some((c) => c.id === id) ? id : conversations[0].id;
        return { conversations, archived, activeChatId };
      }
    }
  } catch {
    /* corrupted storage — start fresh */
  }
  return fallback;
}

function activeConversation(state: ChatState): ChatConversation | undefined {
  return state.conversations.find((c) => c.id === state.activeChatId);
}

function errMsg(e: unknown): string {
  if (e instanceof Error && e.name === "ApiError") return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Reconstruct DeepSeek API history, re-inserting tool responses after assistant messages. */
function buildDeepseekHistory(messages: ChatMessage[], system: string): DeepseekMessage[] {
  const out: DeepseekMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      out.push(toDeepseekMessage(m));
      for (const r of m.toolResults ?? []) {
        out.push({ role: "tool", tool_call_id: r.callId, content: r.summary });
      }
    }
  }
  return out;
}

function parseArgs(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

interface RoundCtx {
  apiKey: string;
  model: string;
  provider: AiProvider;
  messages: DeepseekMessage[];
  dispatch: (action: UnknownAction) => void;
}

type ToolExecution = Awaited<ReturnType<typeof executeTool>>;

/** Sync a tool's storage-side changes back into the Redux notes store. */
function syncExecution(dispatch: (action: UnknownAction) => void, execution: ToolExecution): void {
  if (execution.note) {
    const n = execution.note;
    dispatch(upsertNoteLocal(n));
    dispatch(markSaved(n.id));
    dispatch(setActiveId(n.id));
  }
  if (execution.notes?.length) {
    for (const n of execution.notes) {
      dispatch(upsertNoteLocal(n));
      dispatch(markSaved(n.id));
    }
  }
  if (execution.deletedId) dispatch(removeNoteLocal(execution.deletedId));
  if (execution.category) dispatch(addCategory(execution.category));
}

async function runRounds(ctx: RoundCtx): Promise<void> {
  const { apiKey, model, provider, messages, dispatch } = ctx;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await streamChat({
      apiKey,
      model,
      provider,
      messages,
      onDelta: (d) => dispatch(streamAppend(d)),
      onToolCall: () => dispatch(toolWorkingStart()),
    });

    const toolCalls: ChatToolCall[] = result.toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: parseArgs(tc.rawArguments),
    }));
    dispatch(finishAssistant({ content: result.content, toolCalls }));

    if (toolCalls.length === 0) return;

    messages.push(toDeepseekMessage({ role: "assistant", content: result.content, toolCalls }));

    const toolResults: ToolResult[] = [];
    for (const call of toolCalls) {
      let execution: ToolExecution;
      try {
        execution = await executeTool(getStorageAdapter(), call.name, call.arguments);
      } catch (e) {
        execution = failedExecution(e);
      }
      toolResults.push({ callId: call.id, ok: execution.ok, summary: execution.label });
      messages.push({ role: "tool", tool_call_id: call.id, content: execution.summary });
      syncExecution(dispatch, execution);
    }
    dispatch(addToolResults(toolResults));
  }
}

function failedExecution(e: unknown) {
  const msg = `Tool failed: ${errMsg(e)}`;
  return { ok: false, summary: msg, label: msg };
}

export const sendMessage = createAsyncThunk("chat/send", async (text: string, { dispatch, getState }) => {
  const state = getState() as RootState;
  const prov = currentProvider(state);

  if (!(state.settings.apiKeys[prov] ?? "").trim()) {
    dispatch(
      chatError("No API key set. Open settings (top-right) and paste your key to talk to the assistant."),
    );
    return;
  }

  dispatch(addUserMessage(text));
  dispatch(streamingStart());

  const chat = (getState() as RootState).chat;
  const conv = chat.conversations.find((c) => c.id === chat.activeChatId);

  const notes = (getState() as RootState).notes;
  const activeNote = notes.notes.find((n) => n.id === notes.activeId);

  const memoryNotes = notes.notes.filter((n) => n.category === AGENT_MEMORY_CATEGORY);
  const memoryText = buildAgentMemoryText(
    memoryNotes.map((n) => ({ title: n.title, content: n.content })),
  );

  let systemWithContext = memoryText ? SYSTEM_PROMPT + memoryText : SYSTEM_PROMPT;

  if (activeNote) {
    systemWithContext = systemWithContext.replace(
      "\nRules:\n",
      `\nThe user is currently viewing the note titled "${activeNote.title}" (id: ${activeNote.id}). When the user says "this note", "this", "current note", or "it", they mean this specific note — use its id directly.\n\nRules:\n`,
    );
  }

  const messages: DeepseekMessage[] = buildDeepseekHistory(conv?.messages ?? [], systemWithContext);
  if (!conv) messages.push({ role: "user", content: text });

  try {
    await runRounds({
      apiKey: (getState() as RootState).settings.apiKeys[currentProvider(getState() as RootState)].trim(),
      model: currentModel(getState() as RootState),
      provider: currentProvider(getState() as RootState),
      messages,
      dispatch,
    });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      dispatch(chatError(errMsg(e)));
    }
  }

  dispatch(streamingEnd());
});

/** Derive the active provider id, defaulting to DeepSeek when unset/invalid. */
function currentProvider(state: RootState): AiProvider {
  return isProvider(state.settings.provider) ? state.settings.provider : "deepseek";
}

/** Validate the stored model against the current provider's model list. Falls back to default. */
function currentModel(state: RootState): string {
  const prov = currentProvider(state);
  const model = state.settings.model;
  const cached = state.settings.cachedModels[prov] ?? [];
  const hardcoded = PROVIDERS[prov].models;
  const valid = [...new Set([...cached, ...hardcoded])];
  return valid.includes(model) ? model : PROVIDERS[prov].defaultModel;
}

const initialChat = loadChat();

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    conversations: initialChat.conversations,
    archived: initialChat.archived,
    activeChatId: initialChat.activeChatId,
    streamingText: "",
    streaming: false,
    toolWorking: false,
    error: null,
  } as ChatState,
  reducers: {
    newChat(state) {
      if (state.streaming) return;
      const conv = freshConversation();
      state.conversations.push(conv);
      state.activeChatId = conv.id;
      state.streamingText = "";
      persistChat(state);
    },
    selectChat(state, action: PayloadAction<string>) {
      if (state.streaming) return;
      if (!state.conversations.some((c) => c.id === action.payload)) return;
      state.activeChatId = action.payload;
      state.streamingText = "";
      persistChat(state);
    },
    deleteChat(state, action: PayloadAction<string>) {
      if (state.streaming || state.conversations.length <= 1) return;
      state.conversations = state.conversations.filter((c) => c.id !== action.payload);
      state.archived = state.archived.filter((c) => c.id !== action.payload);
      if (state.activeChatId === action.payload) {
        state.activeChatId = state.conversations[0].id;
        state.streamingText = "";
      }
      persistChat(state);
    },
    closeChat(state, action: PayloadAction<string>) {
      if (state.streaming || state.conversations.length <= 1) return;
      const conv = state.conversations.find((c) => c.id === action.payload);
      if (!conv) return;
      state.conversations = state.conversations.filter((c) => c.id !== action.payload);
      if (!state.archived.some((c) => c.id === conv.id)) state.archived.unshift(conv);
      if (state.activeChatId === action.payload) {
        state.activeChatId = state.conversations[0].id;
        state.streamingText = "";
      }
      persistChat(state);
    },
    reopenChat(state, action: PayloadAction<string>) {
      const conv = state.archived.find((c) => c.id === action.payload);
      if (!conv) return;
      state.archived = state.archived.filter((c) => c.id !== action.payload);
      if (!state.conversations.some((c) => c.id === conv.id)) state.conversations.push(conv);
      state.activeChatId = conv.id;
      persistChat(state);
    },
    addUserMessage(state, action: PayloadAction<string>) {
      const conv = activeConversation(state);
      if (!conv) return;
      conv.messages.push({ id: genId(), role: "user", content: action.payload, createdAt: nowIso() });
      if (conv.title === "New chat") conv.title = action.payload.trim().slice(0, 32) || "New chat";
      conv.updatedAt = nowIso();
      persistChat(state);
    },
    streamingStart(state) {
      state.streaming = true;
      state.streamingText = "";
      state.toolWorking = false;
    },
    streamAppend(state, action: PayloadAction<string>) {
      state.streamingText += action.payload;
      state.toolWorking = false;
    },
    toolWorkingStart(state) {
      state.toolWorking = true;
    },
    finishAssistant(state, action: PayloadAction<{ content: string; toolCalls: ChatToolCall[] }>) {
      const conv = activeConversation(state);
      if (!conv) return;
      const { content, toolCalls } = action.payload;
      conv.messages.push({ id: genId(), role: "assistant", content, toolCalls, createdAt: nowIso() });
      conv.updatedAt = nowIso();
      state.streamingText = "";
      persistChat(state);
    },
    addToolResults(state, action: PayloadAction<ToolResult[]>) {
      const conv = activeConversation(state);
      const last = conv?.messages[conv.messages.length - 1];
      if (last?.role === "assistant") last.toolResults = action.payload;
      state.toolWorking = false;
    },
    streamingEnd(state) {
      state.streaming = false;
      state.streamingText = "";
      state.toolWorking = false;
    },
    chatError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    clearChat(state) {
      const conv = activeConversation(state);
      if (!conv) return;
      conv.messages = [];
      conv.title = "New chat";
      conv.updatedAt = nowIso();
      state.error = null;
      persistChat(state);
    },
  },
});

export const {
  newChat,
  selectChat,
  deleteChat,
  closeChat,
  reopenChat,
  addUserMessage,
  streamingStart,
  streamAppend,
  toolWorkingStart,
  finishAssistant,
  addToolResults,
  streamingEnd,
  chatError,
  clearChat,
} = chatSlice.actions;
export default chatSlice.reducer;
