import { type Context, complete } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import { extractWordContent, type WordExtractedContent } from "../../media/word-extract.js";
import { loadWebMediaRaw } from "../../media/web-media.js";
import { resolveUserPath } from "../../utils.js";
import {
  applyImageModelConfigDefaults,
  buildTextToolResult,
  resolveMediaToolLocalRoots,
  resolveModelFromRegistry,
  resolveModelRuntimeApiKey,
  resolvePromptAndModelOverride,
} from "./media-tool-shared.js";
import {
  coerceImageModelConfig,
  type ImageModelConfig,
  resolveProviderVisionModelFromConfig,
} from "./image-tool.helpers.js";
import {
  createSandboxBridgeReadFile,
  discoverAuthStorage,
  discoverModels,
  ensureOpenClawModelsJson,
  resolveSandboxedBridgeMediaPath,
  runWithImageModelFallback,
  type AnyAgentTool,
  type SandboxedBridgeMediaPathConfig,
  type SandboxFsBridge,
  type ToolFsPolicy,
} from "./tool-runtime.helpers.js";
import { hasAuthForProvider, resolveDefaultModelRef } from "./model-config.helpers.js";

const DEFAULT_PROMPT = "Analyze this Word document.";
const DEFAULT_MAX_DOCS = 10;
const DEFAULT_MAX_BYTES_MB = 10;

// ---------------------------------------------------------------------------
// Model resolution (mirrors image/pdf tool pattern)
// ---------------------------------------------------------------------------

/**
 * Resolve the effective Word document model config.
 * Falls back to the image model config, then to provider-specific defaults.
 */
export function resolveWordModelConfigForTool(params: {
  cfg?: OpenClawConfig;
  agentDir: string;
}): ImageModelConfig | null {
  // Check for explicit Word model config first (if user defines one)
  // For now, fall back to image model config
  const explicitImage = coerceImageModelConfig(params.cfg);
  if (explicitImage.primary?.trim() || (explicitImage.fallbacks?.length ?? 0) > 0) {
    return explicitImage;
  }

  // Auto-detect from available providers
  const primary = resolveDefaultModelRef(params.cfg);
  const anthropicOk = hasAuthForProvider({ provider: "anthropic", agentDir: params.agentDir });
  const googleOk = hasAuthForProvider({ provider: "google", agentDir: params.agentDir });
  const openaiOk = hasAuthForProvider({ provider: "openai", agentDir: params.agentDir });

  const fallbacks: string[] = [];
  const addFallback = (ref: string) => {
    const trimmed = ref.trim();
    if (trimmed && !fallbacks.includes(trimmed)) {
      fallbacks.push(trimmed);
    }
  };

  const providerOk = hasAuthForProvider({ provider: primary.provider, agentDir: params.agentDir });
  const providerVision = resolveProviderVisionModelFromConfig({
    cfg: params.cfg,
    provider: primary.provider,
  });

  let preferred: string | null = null;

  if (primary.provider === "anthropic" && anthropicOk) {
    preferred = "anthropic/claude-opus-4-6";
  } else if (primary.provider === "google" && googleOk && providerVision) {
    preferred = providerVision;
  } else if (providerOk && providerVision) {
    preferred = providerVision;
  } else if (anthropicOk) {
    preferred = "anthropic/claude-opus-4-6";
  } else if (googleOk) {
    preferred = "google/gemini-2.5-pro";
  } else if (openaiOk) {
    preferred = "openai/gpt-5-mini";
  }

  if (preferred?.trim()) {
    if (anthropicOk && preferred !== "anthropic/claude-opus-4-6") {
      addFallback("anthropic/claude-opus-4-6");
    }
    if (anthropicOk) {
      addFallback("anthropic/claude-opus-4-5");
    }
    if (openaiOk) {
      addFallback("openai/gpt-5-mini");
    }
    const pruned = fallbacks.filter((ref) => ref !== preferred);
    return { primary: preferred, ...(pruned.length > 0 ? { fallbacks: pruned } : {}) };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Build context for text extraction fallback path
// ---------------------------------------------------------------------------

function buildWordExtractionContext(
  prompt: string,
  extractions: WordExtractedContent[],
): Context {
  const content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  > = [];

  // Add extracted text
  for (let i = 0; i < extractions.length; i++) {
    const extraction = extractions[i];
    if (extraction.text.trim()) {
      const label = extractions.length > 1 ? `[Word Doc ${i + 1} text]\n` : "[Word Doc text]\n";
      content.push({ type: "text", text: label + extraction.text });
    }
  }

  // Add the user prompt
  content.push({ type: "text", text: prompt });

  return {
    messages: [{ role: "user", content, timestamp: Date.now() }],
  };
}

// ---------------------------------------------------------------------------
// Run Word document prompt with model fallback
// ---------------------------------------------------------------------------

type WordSandboxConfig = {
  root: string;
  bridge: SandboxFsBridge;
};

async function runWordPrompt(params: {
  cfg?: OpenClawConfig;
  agentDir: string;
  wordModelConfig: ImageModelConfig;
  modelOverride?: string;
  prompt: string;
  wordBuffers: Array<{ base64: string; filename: string }>;
  getExtractions: () => Promise<WordExtractedContent[]>;
}): Promise<{
  text: string;
  provider: string;
  model: string;
  attempts: Array<{ provider: string; model: string; error: string }>;
}> {
  const effectiveCfg = applyImageModelConfigDefaults(params.cfg, params.wordModelConfig);

  await ensureOpenClawModelsJson(effectiveCfg, params.agentDir);
  const authStorage = discoverAuthStorage(params.agentDir);
  const modelRegistry = discoverModels(authStorage, params.agentDir);

  let extractionCache: WordExtractedContent[] | null = null;
  const getExtractions = async (): Promise<WordExtractedContent[]> => {
    if (!extractionCache) {
      extractionCache = await params.getExtractions();
    }
    return extractionCache;
  };

  const result = await runWithImageModelFallback({
    cfg: effectiveCfg,
    modelOverride: params.modelOverride,
    run: async (provider, modelId) => {
      const model = resolveModelFromRegistry({ modelRegistry, provider, modelId });
      const apiKey = await resolveModelRuntimeApiKey({
        model,
        cfg: effectiveCfg,
        agentDir: params.agentDir,
        authStorage,
      });

      // Word documents are converted to text, so any text-capable model works
      const extractions = await getExtractions();
      const context = buildWordExtractionContext(params.prompt, extractions);
      const message = await complete(model, context, {
        apiKey,
        maxTokens: resolveWordToolMaxTokens(model.maxTokens),
      });
      const text = coerceWordAssistantText({ message, provider, model: modelId });
      return { text, provider, model: modelId };
    },
  });

  return {
    text: result.result.text,
    provider: result.result.provider,
    model: result.result.model,
    attempts: result.attempts.map((a) => ({
      provider: a.provider,
      model: a.model,
      error: a.error,
    })),
  };
}

function resolveWordToolMaxTokens(maxTokens: number | undefined): number {
  if (!maxTokens) {
    return 8192;
  }
  return Math.min(maxTokens, 32768);
}

function coerceWordAssistantText(params: {
  message: { content?: unknown };
  provider: string;
  model: string;
}): string {
  const content = params.message.content;
  if (Array.isArray(content)) {
    return content
      .filter((c): c is { type: "text"; text: string } =>
        Boolean(c && typeof c === "object" && "type" in c && "text" in c),
      )
      .map((c) => c.text)
      .join("");
  }
  if (typeof content === "string") {
    return content;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Word document tool factory
// ---------------------------------------------------------------------------

export function createWordTool(options?: {
  config?: OpenClawConfig;
  agentDir?: string;
  workspaceDir?: string;
  sandbox?: WordSandboxConfig;
  fsPolicy?: ToolFsPolicy;
}): AnyAgentTool | null {
  const agentDir = options?.agentDir?.trim();
  if (!agentDir) {
    return null;
  }

  const wordModelConfig = resolveWordModelConfigForTool({ cfg: options?.config, agentDir });
  if (!wordModelConfig) {
    return null;
  }

  const maxBytesMbDefault = (
    options?.config?.agents?.defaults as Record<string, unknown> | undefined
  )?.wordMaxBytesMb;
  const configuredMaxBytesMb =
    typeof maxBytesMbDefault === "number" && Number.isFinite(maxBytesMbDefault)
      ? maxBytesMbDefault
      : DEFAULT_MAX_BYTES_MB;

  const description =
    "Analyze one or more Word documents (.docx). Extracts text content and sends to LLM for analysis. Use word for a single path/URL, or words for multiple (up to 10). Provide a prompt describing what to analyze.";

  return {
    label: "Word",
    name: "word",
    description,
    parameters: Type.Object({
      prompt: Type.Optional(Type.String()),
      word: Type.Optional(Type.String({ description: "Single Word document path or URL." })),
      words: Type.Optional(
        Type.Array(Type.String(), {
          description: "Multiple Word document paths or URLs (up to 10).",
        }),
      ),
      model: Type.Optional(Type.String()),
      maxBytesMb: Type.Optional(Type.Number()),
    }),
    execute: async (_toolCallId, args) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};

      // MARK: - Normalize word + words input
      const wordCandidates: string[] = [];
      if (typeof record.word === "string") {
        wordCandidates.push(record.word);
      }
      if (Array.isArray(record.words)) {
        wordCandidates.push(...record.words.filter((v): v is string => typeof v === "string"));
      }

      const seenWords = new Set<string>();
      const wordInputs: string[] = [];
      for (const candidate of wordCandidates) {
        const trimmed = candidate.trim();
        if (!trimmed || seenWords.has(trimmed)) {
          continue;
        }
        seenWords.add(trimmed);
        wordInputs.push(trimmed);
      }
      if (wordInputs.length === 0) {
        throw new Error("word required: provide a path or URL to a Word document");
      }

      // Enforce max docs cap
      if (wordInputs.length > DEFAULT_MAX_DOCS) {
        return {
          content: [
            {
              type: "text",
              text: `Too many Word documents: ${wordInputs.length} provided, maximum is ${DEFAULT_MAX_DOCS}. Please reduce the number.`,
            },
          ],
          details: { error: "too_many_word_docs", count: wordInputs.length, max: DEFAULT_MAX_DOCS },
        };
      }

      const { prompt: promptRaw, modelOverride } = resolvePromptAndModelOverride(
        record,
        DEFAULT_PROMPT,
      );
      const maxBytesMbRaw = typeof record.maxBytesMb === "number" ? record.maxBytesMb : undefined;
      const maxBytesMb =
        typeof maxBytesMbRaw === "number" && Number.isFinite(maxBytesMbRaw) && maxBytesMbRaw > 0
          ? maxBytesMbRaw
          : configuredMaxBytesMb;
      const maxBytes = Math.floor(maxBytesMb * 1024 * 1024);

      const sandboxConfig: SandboxedBridgeMediaPathConfig | null =
        options?.sandbox && options.sandbox.root.trim()
          ? {
              root: options.sandbox.root.trim(),
              bridge: options.sandbox.bridge,
              workspaceOnly: options.fsPolicy?.workspaceOnly === true,
            }
          : null;

      // MARK: - Load each Word document
      const loadedWords: Array<{
        base64: string;
        buffer: Buffer;
        filename: string;
        resolvedPath: string;
        rewrittenFrom?: string;
      }> = [];

      for (const wordRaw of wordInputs) {
        const trimmed = wordRaw.trim();
        const isHttpUrl = /^https?:\/\//i.test(trimmed);
        const isFileUrl = /^file:/i.test(trimmed);
        const isDataUrl = /^data:/i.test(trimmed);
        const looksLikeWindowsDrive = /^[a-zA-Z]:[\\/]/.test(trimmed);
        const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);

        if (hasScheme && !looksLikeWindowsDrive && !isFileUrl && !isHttpUrl && !isDataUrl) {
          return {
            content: [
              {
                type: "text",
                text: `Unsupported Word document reference: ${wordRaw}. Use a file path, file:// URL, or http(s) URL.`,
              },
            ],
            details: { error: "unsupported_word_reference", word: wordRaw },
          };
        }

        if (sandboxConfig && isHttpUrl) {
          throw new Error("Sandboxed Word tool does not allow remote URLs.");
        }

        const resolvedWord = (() => {
          if (sandboxConfig) {
            return trimmed;
          }
          if (trimmed.startsWith("~")) {
            return resolveUserPath(trimmed);
          }
          return trimmed;
        })();

        const resolvedPathInfo: { resolved: string; rewrittenFrom?: string } = sandboxConfig
          ? await resolveSandboxedBridgeMediaPath({
              sandbox: sandboxConfig,
              mediaPath: resolvedWord,
              inboundFallbackDir: "media/inbound",
            })
          : {
              resolved: resolvedWord.startsWith("file://")
                ? resolvedWord.slice("file://".length)
                : resolvedWord,
            };
        const localRoots = resolveMediaToolLocalRoots(
          options?.workspaceDir,
          {
            workspaceOnly: options?.fsPolicy?.workspaceOnly === true,
          },
          [resolvedPathInfo.resolved],
        );

        const media = sandboxConfig
          ? await loadWebMediaRaw(resolvedPathInfo.resolved, {
              maxBytes,
              sandboxValidated: true,
              readFile: createSandboxBridgeReadFile({ sandbox: sandboxConfig }),
            })
          : await loadWebMediaRaw(resolvedPathInfo.resolved, {
              maxBytes,
              localRoots,
            });

        if (media.kind !== "document") {
          // Check MIME type more specifically
          const ct = (media.contentType ?? "").toLowerCase();
          if (
            !ct.includes("vnd.openxmlformats-officedocument.wordprocessingml") &&
            !ct.includes("msword")
          ) {
            throw new Error(
              `Expected Word document but got ${media.contentType ?? media.kind}: ${wordRaw}`,
            );
          }
        }

        const base64 = media.buffer.toString("base64");
        const filename =
          media.fileName ??
          (isHttpUrl
            ? (new URL(trimmed).pathname.split("/").pop() ?? "document.docx")
            : "document.docx");

        loadedWords.push({
          base64,
          buffer: media.buffer,
          filename,
          resolvedPath: resolvedPathInfo.resolved,
          ...(resolvedPathInfo.rewrittenFrom
            ? { rewrittenFrom: resolvedPathInfo.rewrittenFrom }
            : {}),
        });
      }

      const getExtractions = async (): Promise<WordExtractedContent[]> => {
        const extractedAll: WordExtractedContent[] = [];
        for (const word of loadedWords) {
          const extracted = await extractWordContent({
            buffer: word.buffer,
            convertToText: true,
          });
          extractedAll.push(extracted);
        }
        return extractedAll;
      };

      const result = await runWordPrompt({
        cfg: options?.config,
        agentDir,
        wordModelConfig,
        modelOverride,
        prompt: promptRaw,
        wordBuffers: loadedWords.map((p) => ({ base64: p.base64, filename: p.filename })),
        getExtractions,
      });

      const wordDetails =
        loadedWords.length === 1
          ? {
              word: loadedWords[0].resolvedPath,
              ...(loadedWords[0].rewrittenFrom
                ? { rewrittenFrom: loadedWords[0].rewrittenFrom }
                : {}),
            }
          : {
              words: loadedWords.map((p) => ({
                word: p.resolvedPath,
                ...(p.rewrittenFrom ? { rewrittenFrom: p.rewrittenFrom } : {}),
              })),
            };

      return buildTextToolResult(result, wordDetails);
    },
  };
}
