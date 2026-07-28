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
  // If the base URL already ends with /chat/completions, use it as-is
  if (baseUrl.endsWith("/chat/completions")) return baseUrl;
  // If it ends with /v1 or /v1beta or similar, append /chat/completions
  return `${baseUrl}/chat/completions`;
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

const TIMEOUT_MS = 45_000;
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
  jsonMode: boolean
): Promise<AIResponse> {
  const { apiKey, baseUrl, model } = getAIConfig();

  if (!apiKey) {
    return { content: "", error: "AI_API_KEY not configured. Set AI_API_KEY, AI_BASE_URL, and AI_MODEL environment variables.", partial: true };
  }
  if (!baseUrl) {
    return { content: "", error: "AI_BASE_URL not configured. Set the base URL for your AI provider (e.g. https://api.deepseek.com/v1).", partial: true };
  }

  const url = getCompletionsUrl(baseUrl);

  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: withSystemPrompt(systemPrompt, languageInstruction(language), [
            { role: "user", content: prompt },
          ]),
          temperature: jsonMode ? 0.1 : 0.3,
          max_tokens: 4096,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      }),
      TIMEOUT_MS
    );

    if (res.ok) {
      return { content: extractChatContent(await res.json()) };
    }

    const err = await res.text();
    const finalErr = `AI API error: ${res.status} ${err}`;
    logger.error({ model, status: res.status, err }, "AI provider call failed");
    return { content: "", error: finalErr, partial: true };
  } catch (e: unknown) {
    const msg = errorMessage(e);
    logger.error({ model, msg }, "AI provider call threw exception");
    return { content: "", error: `AI call failed: ${msg}`, partial: true };
  }
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
      TIMEOUT_MS
    );
    if (!res.ok || !res.body) {
      yield `Error: AI service returned ${res.status}`;
      return;
    }
    yield* parseSSETokens(res.body);
  } catch (e: unknown) {
    yield `Error: ${errorMessage(e)}`;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function callAI(
  stage: PipelineStage,
  prompt: string,
  systemPrompt: string,
  options?: { language?: string; jsonMode?: boolean }
): Promise<AIResponse> {
  const language = options?.language ?? "English";
  const jsonMode = options?.jsonMode ?? false;

  return callProvider(prompt, systemPrompt, language, jsonMode);
}
