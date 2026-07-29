// Pipeline Router — provider-agnostic AI call layer
// Uses any OpenAI-compatible chat completions API.
// Configure via environment variables:
//   AI_API_KEY   — API key for the provider
//   AI_BASE_URL  — Base URL (e.g. https://api.deepseek.com/v1, https://api.openai.com/v1)
//   AI_MODEL     — Model identifier (e.g. deepseek-v4-flash, gpt-4o, gemini-3.6-flash)

import { logger } from "./lib/logger.js";
import { errorMessage } from "./lib/errors.js";

function getEnvSecure(key: string): string | undefined {
  const val = process.env[key];
  if (!val) return undefined;
  return val.trim().replace(/[\u200B-\u200D\uFEFF\u2028\u2029]/g, "").replace(/^["']|["']$/g, "");
}

// ── Configuration from environment ──────────────────────────────────────────

function getAIConfig() {
  const apiKey = getEnvSecure("AI_API_KEY");
  const baseUrl = (getEnvSecure("AI_BASE_URL") ?? "").replace(/\/+$/, "");
  const model = getEnvSecure("AI_MODEL") ?? "gpt-4o";

  return { apiKey, baseUrl, model };
}

function getCompletionsUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "");
  // Strip existing /chat/completions suffix to prevent double path duplication
  url = url.replace(/\/chat\/completions\/?$/i, "");

  if (url.includes("generativelanguage.googleapis.com") && !url.includes("/openai")) {
    url = `${url}/openai`;
  }
  return `${url}/chat/completions`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "ocr_cleanup"
  | "entity_extract"
  | "prescription_parse"
  | "lab_structure"
  | "intake_generate"
  | "correlate"
  | "diagnose"
  | "confidence_score"
  | "report_generate"
  | "chat_reason";

interface AIResponse {
  content: string;
  error?: string;
  timedOut?: boolean;
  partial?: boolean;
}

type ChatMessage = { role: string; content: string };

const TIMEOUT_MS = 25_000;
const STREAM_READ_IDLE_MS = 30_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AI call timed out")), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

/** Language directive appended to the system prompt. */
function languageInstruction(language: string, variant: "full" | "short" = "full"): string {
  if (language === "English") return "";
  return variant === "short"
    ? `\n\nRespond in ${language}.`
    : `\n\nRespond in ${language}. The user's input may also be in ${language}.`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };
}

/** Prepend the (language-augmented) system prompt to the message list. */
function withSystemPrompt(systemPrompt: string, langInstruction: string, rest: ChatMessage[]): ChatMessage[] {
  return [{ role: "system", content: systemPrompt + langInstruction }, ...rest];
}

/** Pull the assistant text out of an OpenAI-style chat response. */
function extractChatContent(data: unknown): string {
  const d = data as { choices?: Array<{ message?: { content?: string } }>; content?: string };
  return d.choices?.[0]?.message?.content ?? (d.content as string) ?? "";
}

/** Parse a Server-Sent-Events completion stream into content tokens. */
async function* parseSSETokens(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await withTimeout(reader.read(), STREAM_READ_IDLE_MS);
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta: { content?: string } }> };
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch { /* skip */ }
      }
    }
  }
}

// ── Core AI call (non-streaming) ────────────────────────────────────────────

async function callProvider(
  prompt: string,
  systemPrompt: string,
  language: string,
  jsonMode: boolean,
  overrideModel?: string,
  overrideApiKey?: string,
  overrideBaseUrl?: string
): Promise<AIResponse> {
  const { apiKey: defaultApiKey, baseUrl: defaultBaseUrl, model: defaultConfiguredModel } = getAIConfig();
  const apiKey = overrideApiKey || defaultApiKey;
  const baseUrl = (overrideBaseUrl || defaultBaseUrl || "").replace(/\/+$/, "");
  const configuredModel = overrideModel || defaultConfiguredModel;

  if (!apiKey) {
    return { content: "", error: "AI_API_KEY not configured. Set AI_API_KEY, AI_BASE_URL, and AI_MODEL environment variables.", partial: true };
  }
  if (!baseUrl) {
    return { content: "", error: "AI_BASE_URL not configured. Set the base URL for your AI provider.", partial: true };
  }

  const url = getCompletionsUrl(baseUrl);
  
  // Build a list of models to try
  const modelsToTry = [configuredModel];
  
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    for (const m of ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }
  } else if (baseUrl.includes("open.bigmodel.cn")) {
    for (const m of ["glm-4-flash", "glm-4-air", "glm-4"]) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }
  } else if (baseUrl.includes("nvidia.com")) {
    for (const m of ["meta/llama-3.3-70b-instruct", "meta/llama3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct"]) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }
  } else if (baseUrl.includes("groq.com")) {
    for (const m of ["llama-3.3-70b-versatile", "llama-3.1-70b-versatile", "mixtral-8x7b-32768", "llama3-70b-8192"]) {
      if (!modelsToTry.includes(m)) modelsToTry.push(m);
    }
  }

  let lastError = "";

  for (const currentModel of modelsToTry) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }

      try {
        const res = await withTimeout(
          fetch(url, {
            method: "POST",
            headers: authHeaders(apiKey),
            body: JSON.stringify({
              model: currentModel,
              messages: withSystemPrompt(systemPrompt, languageInstruction(language), [
                { role: "user", content: prompt },
              ]),
              temperature: jsonMode ? 0.1 : 0.3,
              max_tokens: 4096,
            }),
          }),
          TIMEOUT_MS
        );

        if (res.ok) {
          return { content: extractChatContent(await res.json()) };
        }

        const err = await res.text();
        lastError = `AI API error: ${res.status} ${err}`;
        logger.warn({ model: currentModel, status: res.status, attempt, err }, "AI provider call failed");

        // If 503 (High Demand) or 429 (Rate Limit) or 5xx, try next attempt or switch to fallback model
        if (res.status === 503 || res.status === 429 || res.status >= 500) {
          continue;
        }

        return { content: "", error: lastError, partial: true };
      } catch (e: unknown) {
        const msg = errorMessage(e);
        lastError = `AI call failed: ${msg}`;
        logger.warn({ model: currentModel, msg, attempt }, "AI provider call threw exception");
      }
    }
  }

  return { content: "", error: lastError, partial: true };
}

// ── Streaming AI call ───────────────────────────────────────────────────────

export async function* streamAI(
  messages: ChatMessage[],
  systemPrompt: string,
  language = "English"
): AsyncGenerator<string> {
  const { apiKey, baseUrl, model } = getAIConfig();

  if (!apiKey || !baseUrl) {
    yield "Error: AI provider not configured. The server administrator needs to set AI_API_KEY, AI_BASE_URL, and AI_MODEL environment variables.";
    return;
  }

  const url = getCompletionsUrl(baseUrl);

  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: withSystemPrompt(systemPrompt, languageInstruction(language, "short"), messages),
          stream: true,
          temperature: 0.3,
          max_tokens: 2048,
        }),
      }),
      15_000
    );

    if (res.ok && res.body) {
      yield* parseSSETokens(res.body);
      return;
    }
  } catch {
    /* Fallback to non-streaming call below */
  }

  // Non-streaming fallback if SSE fails or times out
  const lastUserMsg = messages[messages.length - 1]?.content ?? "";
  const result = await callProvider(lastUserMsg, systemPrompt, language, false);
  if (result.content) {
    yield result.content;
  } else {
    yield `Error: ${result.error || "AI call timed out"}`;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getAIConfigForStage(stage: PipelineStage) {
  let prefix = "";
  if (stage === "entity_extract" || stage === "prescription_parse" || stage === "lab_structure" || stage === "ocr_cleanup") {
    prefix = "EXTRACTION_";
  } else if (stage === "correlate" || stage === "diagnose" || stage === "report_generate" || stage === "confidence_score") {
    prefix = "REASONING_";
  } else if (stage === "chat_reason") {
    prefix = "CHAT_";
  }

  const apiKey = getEnvSecure(`${prefix}AI_API_KEY`) || getEnvSecure("AI_API_KEY");
  const baseUrl = (getEnvSecure(`${prefix}AI_BASE_URL`) || getEnvSecure("AI_BASE_URL") || "").replace(/\/+$/, "");
  const model = getEnvSecure(`${prefix}AI_MODEL`) || getEnvSecure("AI_MODEL") || "gpt-4o";

  return { apiKey, baseUrl, model };
}

export async function callAI(
  stage: PipelineStage,
  prompt: string,
  systemPrompt: string,
  options?: { language?: string; jsonMode?: boolean }
): Promise<AIResponse> {
  const language = options?.language ?? "English";
  const jsonMode = options?.jsonMode ?? false;

  const { apiKey, baseUrl, model } = getAIConfigForStage(stage);

  return callProvider(prompt, systemPrompt, language, jsonMode, model, apiKey, baseUrl);
}
