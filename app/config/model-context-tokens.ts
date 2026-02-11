export interface ModelContextConfig {
  contextTokens: number;
  description?: string;
}

export const MODEL_CONTEXT_TOKENS: Record<string, ModelContextConfig> = {
  // DeepSeek
  "deepseek/deepseek-r1-0528:free": { contextTokens: 163840 },
  "deepseek-ai/deepseek-v3.2": { contextTokens: 163840 },

  // Moonshot
  "moonshotai/kimi-k2.5": { contextTokens: 262144 },

  // LongCat
  "LongCat-Flash-Chat": { contextTokens: 262144 },
  "LongCat-Flash-Thinking": { contextTokens: 262144 },
  "LongCat-Flash-Thinking-2601": { contextTokens: 262144 },
  "LongCat-Flash-Lite": { contextTokens: 327680 },

  // GPT OSS
  "gpt-oss-120b": { contextTokens: 131072 },
};

export function getModelContextTokens(
  modelName: string,
): ModelContextConfig | null {
  // 1. 优先从 LocalStorage 获取自定义配置
  // Return custom config from local storage if exists
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const customKey = `model_context_tokens_${modelName}`;
    const customConfig = localStorage.getItem(customKey);
    if (customConfig) {
      try {
        const parsed = JSON.parse(customConfig);
        if (typeof parsed === "number") {
          return { contextTokens: parsed };
        } else if (parsed && typeof parsed.contextTokens === "number") {
          return parsed;
        }
      } catch (e) {
        console.warn(
          `Failed to parse custom context tokens for ${modelName}:`,
          e,
        );
      }
    }
  }

  // 2. 精确匹配
  // Exact match
  if (MODEL_CONTEXT_TOKENS[modelName]) {
    return MODEL_CONTEXT_TOKENS[modelName];
  }

  const lowerName = modelName.toLowerCase();

  // Gemini 3 Series
  if (lowerName.includes("gemini-3")) {
    return { contextTokens: 1048576 };
  }

  // 4. Claude 系列匹配 (4.5+ / 5+)
  // Matches "claude-sonnet-4.5", "claude-4.5", "claude-5", etc.
  if (lowerName.includes("claude")) {
    // 检查版本号是否 >= 4
    // Check for version number >= 4 in the name
    const versionMatch = lowerName.match(/(?:-|\b)(\d+(?:\.\d+)?)(?:-|$)/);
    if (versionMatch) {
      const version = parseFloat(versionMatch[1]);
      if (version >= 4) {
        return { contextTokens: 1048576 };
      }
    }
    // Specific check for "4-5" pattern in user's example "claude-sonnet-4-5-thinking"
    if (lowerName.includes("-4-5-") || lowerName.includes("-4.5-")) {
      return { contextTokens: 1048576 };
    }
  }

  // LongCat variants
  if (lowerName.toLowerCase().startsWith("longcat")) {
    return { contextTokens: 262144 };
  }

  // Moonshot Kimi variants
  if (lowerName.includes("kimi-k2.5")) {
    return { contextTokens: 262144 };
  }

  // DeepSeek R1 0528 Free variant
  if (lowerName.includes("deepseek-r1")) {
    return { contextTokens: 163840 };
  }

  // GPT OSS
  if (lowerName.includes("gpt-oss")) {
    return { contextTokens: 131072 };
  }

  return null;
}

export function saveCustomContextTokens(
  modelName: string,
  contextTokens: number,
): void {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const customKey = `model_context_tokens_${modelName}`;
    const config: ModelContextConfig = { contextTokens };
    localStorage.setItem(customKey, JSON.stringify(config));
  }
}

export function removeCustomContextTokens(modelName: string): void {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const customKey = `model_context_tokens_${modelName}`;
    localStorage.removeItem(customKey);
  }
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return tokens.toString();
}

export function getModelCompressThreshold(modelName: string): number {
  const DEFAULT_THRESHOLD = 128000;

  const contextConfig = getModelContextTokens(modelName);
  if (!contextConfig?.contextTokens) {
    return DEFAULT_THRESHOLD;
  }

  return contextConfig.contextTokens;
}
