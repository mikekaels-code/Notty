import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { streamChat, toDeepseekMessage, type DeepseekMessage } from "../ai/deepseek";
import { executeTool } from "../ai/tools";
import { getStorageAdapter } from "../storage";
import { genId, nowIso } from "../utils";
import type { ChatMessage, ChatToolCall, ToolResult } from "../types";
import { markSaved, removeNoteLocal, upsertNoteLocal } from "./notesSlice";
import type { RootState } from "./types";

const SYSTEM_PROMPT =
  "You are the AI assistant inside SmartNotes, a note-taking app. " +
  "You can read, create, update, and delete the user's notes through tools. " +
  "Rules:\n" +
  "- Prefer list_notes to get the correct note id before reading/updating/deleting.\n" +
  "- Never guess a note id; if the user's request is ambiguous (e.g. \"which note?\"), ask a clarifying question instead of acting.\n" +
  "- When asked to edit an existing note, read it first, then update it with the full new content.\n" +
  "- Keep replies concise and warm. Confirm actions briefly, quoting the note title.\n" +
  "- Note content is Markdown.";

const MAX_TOOL_ROUNDS = 8;

export interface ChatState {
  messages: ChatMessage[];
  streamingText: string;
  streaming: boolean;
  error: string | null;
}

const initialState: ChatState = {
  messages: [],
  streamingText: "",
  streaming: false,
  error: null,
};

function errMsg(e: unknown): string {
  if (e instanceof Error && e.name === "ApiError") return e.message;
  return e instanceof Error ? e.message : String(e);
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

export const sendMessage = createAsyncThunk("chat/send", async (text: string, { dispatch, getState }) => {
  const state = getState() as RootState;

  if (!state.settings.apiKey.trim()) {
    dispatch(
      chatError("No DeepSeek API key set. Open settings (top-right) and paste your key to talk to the assistant."),
    );
    return;
  }

  dispatch(addUserMessage(text));
  dispatch(streamingStart());

  const messages: DeepseekMessage[] = buildDeepseekHistory(state.chat.messages, SYSTEM_PROMPT);
  messages.push({ role: "user", content: text });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await streamChat({
        apiKey: state.settings.apiKey.trim(),
        model: state.settings.model,
        messages,
        onDelta: (d) => dispatch(streamAppend(d)),
      });

      const toolCalls: ChatToolCall[] = result.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: parseArgs(tc.rawArguments),
      }));
      dispatch(finishAssistant({ content: result.content, toolCalls }));

      if (toolCalls.length === 0) break;

      messages.push(toDeepseekMessage({ role: "assistant", content: result.content, toolCalls }));

      const toolResults: ToolResult[] = [];
      for (const call of toolCalls) {
        let execution: Awaited<ReturnType<typeof executeTool>>;
        try {
          execution = await executeTool(getStorageAdapter(), call.name, call.arguments);
        } catch (e) {
          execution = {
            ok: false,
            summary: `Tool failed: ${errMsg(e)}`,
            label: `Tool failed: ${errMsg(e)}`,
          };
        }
        toolResults.push({ callId: call.id, ok: execution.ok, summary: execution.label });
        messages.push({ role: "tool", tool_call_id: call.id, content: execution.summary });

        if (execution.note) {
          const n = execution.note;
          dispatch(upsertNoteLocal(n));
          dispatch(markSaved(n.id));
        }
        if (execution.deletedId) dispatch(removeNoteLocal(execution.deletedId));
      }
      dispatch(addToolResults(toolResults));
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      // User stopped generation; no error surfaced.
    } else {
      dispatch(chatError(errMsg(e)));
    }
  }

  dispatch(streamingEnd());
});

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    addUserMessage(state, action: PayloadAction<string>) {
      state.messages.push({ id: genId(), role: "user", content: action.payload, createdAt: nowIso() });
    },
    streamingStart(state) {
      state.streaming = true;
      state.streamingText = "";
    },
    streamAppend(state, action: PayloadAction<string>) {
      state.streamingText += action.payload;
    },
    finishAssistant(state, action: PayloadAction<{ content: string; toolCalls: ChatToolCall[] }>) {
      const { content, toolCalls } = action.payload;
      state.messages.push({ id: genId(), role: "assistant", content, toolCalls, createdAt: nowIso() });
      state.streamingText = "";
    },
    addToolResults(state, action: PayloadAction<ToolResult[]>) {
      const last = state.messages[state.messages.length - 1];
      if (last?.role === "assistant") last.toolResults = action.payload;
    },
    streamingEnd(state) {
      state.streaming = false;
      state.streamingText = "";
    },
    chatError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    clearChat(state) {
      state.messages = [];
      state.error = null;
    },
  },
});

export const {
  addUserMessage,
  streamingStart,
  streamAppend,
  finishAssistant,
  addToolResults,
  streamingEnd,
  chatError,
  clearChat,
} = chatSlice.actions;
export default chatSlice.reducer;
