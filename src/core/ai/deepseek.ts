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

export type AiProvider = "deepseek" | "openai" | "anthropic" | "glm";

export interface ProviderInfo {
  id: AiProvider;
  name: string;
  endpoint: string;
  defaultModel: string;
  models: string[];
  modelsEndpoint?: string;
  keyLabel: string;
  keyPlaceholder: string;
  note: string;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-v4-flash", "deepseek-v4-pro", "deepseek-reasoner"],
    keyLabel: "DeepSeek API key",
    keyPlaceholder: "sk-…",
    note: "Your key is stored only in this browser and is sent only to DeepSeek's API.",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    modelsEndpoint: "https://api.openai.com/v1/models",
    keyLabel: "OpenAI API key",
    keyPlaceholder: "sk-…",
    note: "Your key is stored only in this browser and is sent only to OpenAI's API.",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    endpoint: "https://api.anthropic.com/v1/chat/completions",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219", "claude-3-5-haiku-20241022"],
    keyLabel: "Anthropic API key",
    keyPlaceholder: "sk-ant-…",
    note: "Your key is stored only in this browser and is sent only to Anthropic's API.",
  },
  glm: {
    id: "glm",
    name: "ZhipuAI (GLM)",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-plus", "glm-4-air", "glm-4-long", "glm-4"],
    modelsEndpoint: "https://open.bigmodel.cn/api/paas/v4/models",
    keyLabel: "ZhipuAI API key",
    keyPlaceholder: "…",
    note: "Your key is stored only in this browser and is sent only to ZhipuAI's API.",
  },
};

export function isProvider(v: unknown): v is AiProvider {
  return v === "deepseek" || v === "openai" || v === "anthropic" || v === "glm";
}

export interface ChatParams {
  apiKey: string;
  model: string;
  provider?: AiProvider;
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

/** Fetch available model IDs from a provider's models endpoint. Returns null if unsupported. */
export async function fetchProviderModels(provider: AiProvider, apiKey: string): Promise<string[] | null> {
  const prov = PROVIDERS[provider];
  if (!prov.modelsEndpoint) return null;
  const res = await fetch(prov.modelsEndpoint, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const items: Array<{ id: string }> = json.data ?? json.models ?? json ?? [];
  return items.map((m) => m.id).filter((id) => typeof id === "string");
}

/** Verify an API key works by sending a minimal (1-token) completion. Throws ApiError on failure. */
export async function testProviderConnection(provider: AiProvider, apiKey: string): Promise<void> {
  const prov = PROVIDERS[provider];
  const res = await fetch(prov.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: prov.defaultModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw makeApiError(`Request failed (${res.status}): ${text.slice(0, 200) || res.statusText}`, res.status);
  }
}

/** Single round of streaming chat completion; returns text and any requested tool calls. */
export async function streamChat(params: ChatParams): Promise<ChatResult> {
  const { apiKey, model, provider = "deepseek", messages, signal, onDelta, onToolCall } = params;
  const prov = PROVIDERS[provider];

  let res: Response;
  try {
    res = await fetch(prov.endpoint, {
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
              description: "Create a new note with the given title and markdown content. Optionally nest it as a child note under a parent, or put it in a category.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  content: { type: "string", description: "Markdown body, without a leading title heading" },
                  parent_id: { type: "string", description: "Optional: id of the parent note to make this note a child of" },
                  category: { type: "string", description: "Optional: category name to put the note in" },
                },
                required: ["title", "content"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "update_note",
              description: "Replace the content of an existing note by id. Use only when the user clearly wants THIS note changed. Can also change the note's parent (parent_id) or category.",
              parameters: {
                type: "object",
                properties: {
                  note_id: { type: "string" },
                  content: { type: "string", description: "Full new markdown content, including any title heading" },
                  parent_id: { type: "string", description: "Optional: id of the parent note to nest this note under (or empty string to remove from parent)" },
                  category: { type: "string", description: "Optional: category name (or empty string to remove)" },
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
          {
            type: "function",
            function: {
              name: "reorder_notes",
              description: "Reorder sibling notes (notes sharing the same parent) into a new order. Pass note_ids in the desired new order, top to bottom. Use list_notes first to get the correct ids.",
              parameters: {
                type: "object",
                properties: {
                  note_ids: { type: "array", items: { type: "string" }, description: "The sibling note ids in their new desired order" },
                },
                required: ["note_ids"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "move_notes",
              description: "Move a note to become a child of another note (pass parent_id), or back to root level (pass parent_id: null).",
              parameters: {
                type: "object",
                properties: {
                  note_id: { type: "string" },
                  parent_id: { type: ["string", "null"], description: "The new parent note id, or null to unnest to root level" },
                },
                required: ["note_id", "parent_id"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "toggle_pin",
              description: "Toggle the favorite (pinned) status of a note. Pinned notes appear at the top of the list.",
              parameters: {
                type: "object",
                properties: { note_id: { type: "string" } },
                required: ["note_id"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "set_category",
              description: "Assign a note to a category (or pass null to remove its category). The category is created automatically if new.",
              parameters: {
                type: "object",
                properties: {
                  note_id: { type: "string" },
                  category: { type: ["string", "null"], description: "The category name, or null to clear" },
                },
                required: ["note_id", "category"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "search_notes",
              description: "Search all notes by keyword, matching title or content. Returns matching note ids to use with other tools.",
              parameters: {
                type: "object",
                properties: { query: { type: "string", description: "The search keyword" } },
                required: ["query"],
              },
            },
          },
        ],
      }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw makeApiError(`Could not reach the ${prov.name} API. Check your connection and try again.`, 0);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      /* ignore parse failure */
    }
    throw makeApiError(detail || `${prov.name} API error (HTTP ${res.status})`, res.status);
  }

  if (!res.body) throw makeApiError(`No response stream from the ${prov.name} API.`, 0);

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
