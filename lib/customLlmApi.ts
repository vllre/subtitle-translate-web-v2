"use client";

import { RateLimiter } from "@/lib/rateLimiter";

// Create a global rate limiter instance (same cadence as OpenRouter)
const rateLimiter = new RateLimiter(1000, 3, 2);

// localStorage keys
const CONFIG_KEY = "custom_llm_config";
const APIKEY_KEY = "custom_llm_apikey";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomLlmHeader {
  key: string;
  value: string;
}

export interface CustomLlmConfig {
  baseUrl: string;          // e.g. https://my-llm.example.com/v1
  model: string;            // e.g. mistral-7b-instruct
  headers: CustomLlmHeader[]; // optional extra headers
  displayName: string;      // optional label shown in UI
  rawPromptMode: boolean;   // when true, send single string body instead of messages[]
}

const DEFAULT_CONFIG: CustomLlmConfig = {
  baseUrl: "",
  model: "",
  headers: [],
  displayName: "",
  rawPromptMode: false,
};

// ─── In-memory state ──────────────────────────────────────────────────────────

let currentConfig: CustomLlmConfig = { ...DEFAULT_CONFIG };
// API key is kept separately, never mixed into console-loggable config objects
let _apiKey = "";

// ─── Config helpers ───────────────────────────────────────────────────────────

/**
 * Load config (but NOT the api key) from localStorage into memory.
 * Call this once on app mount.
 */
export function loadCustomLlmConfig(): CustomLlmConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
    // Load api key separately
    const savedKey = localStorage.getItem(APIKEY_KEY);
    if (savedKey) {
      _apiKey = savedKey;
    }
  } catch {
    // ignore parse errors
  }
  return { ...currentConfig };
}

/**
 * Get current in-memory config (without the api key).
 */
export function getCustomLlmConfig(): CustomLlmConfig {
  return { ...currentConfig };
}

/**
 * Set config in memory (does not persist — call saveCustomLlmConfig to persist).
 */
export function setCustomLlmConfig(config: CustomLlmConfig): void {
  currentConfig = { ...config };
}

/**
 * Set and persist config to localStorage.
 * The api key is stored under its own key so it can be cleared independently.
 */
export function saveCustomLlmConfig(config: CustomLlmConfig, apiKey: string): void {
  currentConfig = { ...config };
  _apiKey = apiKey;
  if (typeof window !== "undefined") {
    // Never put the api key inside the config blob
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(APIKEY_KEY, apiKey);
  }
}

/**
 * Return the currently stored api key (opaque — do not log).
 */
export function getCustomLlmApiKey(): string {
  if (!_apiKey && typeof window !== "undefined") {
    _apiKey = localStorage.getItem(APIKEY_KEY) ?? "";
  }
  return _apiKey;
}

/**
 * Check whether the config has the minimum required fields to attempt a request.
 */
export function isCustomLlmConfigValid(): boolean {
  const cfg = currentConfig;
  const key = getCustomLlmApiKey();
  if (!cfg.baseUrl || !cfg.model || !key) return false;
  try {
    new URL(cfg.baseUrl);
    return true;
  } catch {
    return false;
  }
}

// ─── Internal request helper ──────────────────────────────────────────────────

/**
 * Build the Authorization + Content-Type headers, merging any user-supplied
 * custom headers. The API key is passed as a parameter and never referenced
 * from outer scope inside a loggable path.
 */
function buildHeaders(
  apiKey: string,
  extraHeaders: CustomLlmHeader[]
): Record<string, string> {
  const cleanKey = apiKey.trim().replace(/^Bearer\s+/i, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cleanKey}`,
  };
  for (const h of extraHeaders) {
    if (h.key.trim()) {
      headers[h.key.trim()] = h.value;
    }
  }
  return headers;
}

/**
 * Build the endpoint URL, normalising the base URL (strip trailing slash,
 * append /chat/completions).
 */
function buildEndpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

// ─── Translation functions ────────────────────────────────────────────────────

export interface CustomLlmTranslationItem {
  text: string;
  error?: string;
}

/**
 * Translate a batch of subtitle texts using the custom LLM endpoint.
 * Return type is identical to translateWithOpenRouterBatch so it can be
 * dropped into the pipeline without any changes to calling code.
 */
export async function translateWithCustomLlmBatch(
  texts: string[],
  targetLanguage: string,
  prompt?: string,
  context?: string
): Promise<CustomLlmTranslationItem[]> {
  const cfg = getCustomLlmConfig();
  const apiKey = getCustomLlmApiKey();

  if (!apiKey) {
    return texts.map(() => ({ text: "", error: "Custom LLM API key not configured" }));
  }
  if (!cfg.baseUrl || !cfg.model) {
    return texts.map(() => ({ text: "", error: "Custom LLM base URL or model not configured" }));
  }

  const batchPrompt = cfg.rawPromptMode
    ? buildRawPrompt(texts, targetLanguage, prompt, context)
    : buildChatPrompt(texts, targetLanguage, prompt, context);

  const endpoint = buildEndpoint(cfg.baseUrl);
  const headers = buildHeaders(apiKey, cfg.headers);

  const body = cfg.rawPromptMode
    ? JSON.stringify({ model: cfg.model, prompt: batchPrompt, max_tokens: 8000, stream: false })
    : JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: batchPrompt }],
        temperature: 0.2,
        max_tokens: 8000,
        stream: false,
      });

  try {
    return await rateLimiter.execute(async () => {
      const response = await fetch("/api/custom-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint,
          headers,
          body,
        }),
      });

      const responseTextRaw = await response.text().catch(() => "");

      if (!response.ok) {
        let rawMsg: string;
        if (responseTextRaw.trimStart().toLowerCase().startsWith("<!doctype") || responseTextRaw.trimStart().startsWith("<html")) {
          rawMsg = `HTTP ${response.status}: The server returned an HTML page — check your API Base URL (add /v1 if needed).`;
        } else {
          try {
            const errData = JSON.parse(responseTextRaw);
            rawMsg = errData?.error?.message || errData?.message || errData?.detail || `HTTP ${response.status} ${response.statusText}`;
          } catch {
            rawMsg = responseTextRaw.slice(0, 300) || `HTTP ${response.status} ${response.statusText}`;
          }
        }
        return texts.map(() => ({ text: "", error: rawMsg }));
      }

      if (responseTextRaw.trimStart().toLowerCase().startsWith("<!doctype") || responseTextRaw.trimStart().startsWith("<html")) {
        return texts.map(() => ({
          text: "",
          error: "Server returned HTML instead of JSON — check your API Base URL (add /v1 if needed).",
        }));
      }

      const responseText = extractResponseContent(responseTextRaw, cfg.rawPromptMode);

      if (!responseText) {
        return texts.map(() => ({
          text: "",
          error: `Empty or unparseable response from Custom LLM: "${responseTextRaw.slice(0, 150)}"`,
        }));
      }

      return parseTranslationResponse(responseText, texts);
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error occurred";
    return texts.map(() => ({ text: "", error: msg }));
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildChatPrompt(
  texts: string[],
  targetLanguage: string,
  prompt?: string,
  context?: string
): string {
  return `You are a professional subtitle translator. Translate the following subtitles to ${targetLanguage}.

${prompt || "Translate the following subtitles maintaining their original meaning, tone, and context. Keep translations concise and suitable for subtitles."}

${context ? `Context from previous translations:\n${context}\n` : ""}
Please translate each subtitle and respond in JSON format:
{"translations": ["translation1", "translation2", "translation3"]}

Subtitles to translate:
${texts.map((text, index) => `${index + 1}. "${text}"`).join("\n")}

Response (JSON only):`;
}

function buildRawPrompt(
  texts: string[],
  targetLanguage: string,
  prompt?: string,
  context?: string
): string {
  return `Translate the following subtitles to ${targetLanguage}.

${prompt || "Maintain original meaning, tone, and context. Keep translations concise."}

${context ? `Context:\n${context}\n` : ""}Subtitles:
${texts.map((text, index) => `${index + 1}. "${text}"`).join("\n")}

Respond ONLY with a JSON object:
{"translations": ["translation1", "translation2"]}`;
}

/**
 * Extract text content from either:
 * 1. OpenAI format: { choices: [{ message: { content } }] } or { choices: [{ text }] }
 * 2. Gemini native format: { candidates: [{ content: { parts: [{ text }] } }] }
 * 3. SSE Stream format: data: {"choices": [{"delta": {"content": "..."}}]}
 */
function extractResponseContent(rawText: string, rawPromptMode: boolean): string | undefined {
  const trimmed = rawText.trim();

  // 1. Check if response is SSE stream (starts with or contains "data: {")
  if (trimmed.startsWith("data:") || trimmed.includes("\ndata:")) {
    let accumulated = "";
    const lines = trimmed.split("\n");
    for (const line of lines) {
      const match = line.trim().match(/^data:\s*(.+)$/);
      if (!match) continue;
      const dataStr = match[1].trim();
      if (dataStr === "[DONE]") continue;
      try {
        const chunk = JSON.parse(dataStr);
        // OpenAI chunk delta
        const deltaContent = chunk?.choices?.[0]?.delta?.content;
        if (deltaContent) accumulated += deltaContent;
        // Text completion chunk
        const textContent = chunk?.choices?.[0]?.text;
        if (textContent) accumulated += textContent;
        // Gemini candidate stream
        const geminiText = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (geminiText) accumulated += geminiText;
      } catch {
        // Skip unparseable chunk lines
      }
    }
    if (accumulated.trim()) {
      return accumulated.trim();
    }
  }

  // 2. Try parsing standard JSON
  try {
    const data = JSON.parse(trimmed);

    // OpenAI Chat
    if (data?.choices?.[0]?.message?.content) {
      return String(data.choices[0].message.content).trim();
    }

    // OpenAI Completion / Raw prompt
    if (data?.choices?.[0]?.text) {
      return String(data.choices[0].text).trim();
    }

    // Gemini Native format: candidates[0].content.parts[0].text
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return String(data.candidates[0].content.parts[0].text).trim();
    }

    // Any generic parts array
    if (Array.isArray(data?.candidates?.[0]?.content?.parts)) {
      const partsText = data.candidates[0].content.parts
        .map((p: any) => p?.text || "")
        .join("");
      if (partsText.trim()) return partsText.trim();
    }
  } catch {
    // If JSON parsing fails, fallback
  }

  return undefined;
}

function parseTranslationResponse(
  responseText: string,
  originalTexts: string[]
): CustomLlmTranslationItem[] {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.translations && Array.isArray(parsed.translations)) {
        return originalTexts.map((_, index) => {
          const translation = parsed.translations[index];
          if (!translation) {
            return { text: "", error: `Missing translation for item ${index + 1}` };
          }
          return { text: String(translation) };
        });
      }
    }
  } catch {
    // fall through to line-based fallback
  }

  // Line-based fallback
  const lines = responseText
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.replace(/^\d+[.)]\s*["']?|["']?\s*$/, "").trim());

  return originalTexts.map((_, index) => ({
    text: lines[index] || `[Error: Failed to parse translation ${index + 1}]`,
  }));
}

// ─── Connection test ──────────────────────────────────────────────────────────

export interface CustomLlmTestResult {
  success: boolean;
  error?: string;
}

/**
 * Send a minimal test request to validate the endpoint, model, and api key.
 * This never logs the api key.
 */
export async function testCustomLlmConnection(): Promise<CustomLlmTestResult> {
  const cfg = getCustomLlmConfig();
  const apiKey = getCustomLlmApiKey();

  if (!apiKey) return { success: false, error: "API key not configured" };
  if (!cfg.baseUrl) return { success: false, error: "API Base URL not configured" };
  if (!cfg.model) return { success: false, error: "Model name not configured" };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(cfg.baseUrl);
  } catch {
    return { success: false, error: "Invalid URL format" };
  }

  const endpoint = buildEndpoint(parsedUrl.toString());
  const headers = buildHeaders(apiKey, cfg.headers);

  const body = cfg.rawPromptMode
    ? JSON.stringify({ model: cfg.model, prompt: "Hi", max_tokens: 50, stream: false })
    : JSON.stringify({
        model: cfg.model,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 50,
        stream: false,
      });

  try {
    const response = await fetch("/api/custom-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        headers,
        body,
      }),
    });

    const rawText = await response.text().catch(() => "");

    if (!response.ok) {
      if (rawText.trimStart().toLowerCase().startsWith("<!doctype") || rawText.trimStart().startsWith("<html")) {
        return { success: false, error: `HTTP ${response.status}: Server returned HTML — check your API Base URL (add /v1 if needed).` };
      }
      try {
        const errData = JSON.parse(rawText);
        return { success: false, error: errData?.error?.message || errData?.message || errData?.detail || `HTTP ${response.status} ${response.statusText}` };
      } catch {
        return { success: false, error: rawText.slice(0, 300) || `HTTP ${response.status} ${response.statusText}` };
      }
    }

    // Verify we can extract content or at least received valid response
    const extracted = extractResponseContent(rawText, cfg.rawPromptMode);
    if (!extracted && !rawText.includes('"stop"')) {
      return {
        success: false,
        error: `Connected, but received unexpected format: ${rawText.slice(0, 150)}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
