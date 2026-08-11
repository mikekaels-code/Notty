export type DeepseekRole = "system" | "user" | "assistant" | "tool";

export interface DeepseekMessage {
  role: DeepseekRole;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ChatParams {
  apiKey: string;
  model: string;
  messages: DeepseekMessage[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onToolCall?: (call: { id: string; name: string; rawArguments: string }) => void;
}

export interface ChatResult {
  content: string;
  toolCalls: Array<{ id: string; name: string; rawArguments: string }>;
}

export interface ApiError extends Error {
  status: number;
}

export function makeApiError(message: string, status: number): ApiError {
  const e = new Error(message) as ApiError;
  e.name = "ApiError";
  e.status = status;
  return e;
}

const ENDPOINT = "https://api.deepseek.com/chat/completions";

/** Single round of streaming chat completion; returns text and any requested tool calls. */
export async function streamChat(params: ChatParams): Promise<ChatResult> {
  const { apiKey, model, messages, signal, onDelta, onToolCall } = params;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        tools: [
          {
            type: "function",
            function: {
              name: "list_notes",
              description:
                "List all notes. Returns id, title, last-edited time, and pinned flag for each note. Use this before reading, updating, or deleting a note so you have the correct id.",
              parameters: { type: "object", properties: {}, required: [] },
            },
          },
          {
            type: "function",
            function: {
              name: "read_note",
              description: "Read the full content of a note by id.",
              parameters: {
                type: "object",
                properties: { note_id: { type: "string", description: "The note's id (get it from list_notes)" } },
                required: ["note_id"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "create_note",
              description: "Create a new note with the given title and markdown content.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string", description: "Markdown body, without a leading title heading" },
                },
                required: ["title", "content"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "update_note",
              description: "Replace the content of an existing note by id. Use only when the user clearly wants THIS note changed.",
              parameters: {
                type: "object",
                properties: {
                  note_id: { type: "string" },
                  content: { type: "string", description: "Full new markdown content, including any title heading" },
                },
                required: ["note_id", "content"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "delete_note",
              description: "Permanently delete a note by id.",
              parameters: {
                type: "object",
                properties: { note_id: { type: "string" } },
                required: ["note_id"],
              },
            },
          },
        ],
      }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw makeApiError("Could not reach the DeepSeek API. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      /* ignore parse failure */
    }
    throw makeApiError(detail || `DeepSeek API error (HTTP ${res.status})`, res.status);
  }

  if (!res.body) throw makeApiError("No response stream from DeepSeek API.", 0);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let content = "";
  const toolCallMap = new Map<number, { id: string; name: string; rawArguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;

      let json: {
        choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }>;
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }

      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        onDelta(delta.content);
      }

      for (const tc of delta.tool_calls ?? []) {
        const entry = toolCallMap.get(tc.index) ?? { id: tc.id ?? "", name: "", rawArguments: "" };
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name = tc.function.name;
        if (tc.function?.arguments) entry.rawArguments += tc.function.arguments;
        toolCallMap.set(tc.index, entry);
        onToolCall?.({ id: entry.id, name: entry.name, rawArguments: entry.rawArguments });
      }
    }
  }

  const toolCalls = [...toolCallMap.values()].filter((tc) => tc.id);

  return { content, toolCalls };
}

export function toDeepseekMessage(msg: {
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, string> }>;
}): DeepseekMessage {
  if (msg.role === "assistant" && msg.toolCalls?.length) {
    return {
      role: "assistant",
      content: msg.content || null,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return { role: msg.role, content: msg.content };
}
