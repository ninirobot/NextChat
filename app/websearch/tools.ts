import { ServiceProvider } from "@/app/constant";
import { useAppConfig } from "@/app/store/config";

import type { ChatMessageTool } from "@/app/store/chat";

import { fetchWeb, searchWeb } from "./client";
import {
  WEB_FETCH_DESCRIPTION,
  WEB_FETCH_LABEL,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_DESCRIPTION,
  WEB_SEARCH_LABEL,
  WEB_SEARCH_TOOL_NAME,
} from "./constants";
import type {
  WebSearchCitedResult,
  WebSearchConfig,
  WebSearchRawResult,
  WebSearchResult,
} from "./types";
import { isWebSearchError } from "./types";
import { citeId, getHostname, newCitePrefix } from "./utils";

/**
 * 工具定义与执行函数。
 *
 * 对外只需要一个入口：[`webSearchTools()`](#webSearchTools)，platform 侧一行调用即可。
 *
 * 注意 wire name 恒为 `web_search` / `web_fetch`（ASCII），界面上的中文名
 * 只是渲染层本地化，绝不能写进工具定义。
 */

const SEARCH_PARAMETERS = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "The complete, self-contained search query. Use the user's language, or translate to the most likely source language when broader coverage is needed.",
    },
  },
  required: ["query"],
} as const;

const FETCH_PARAMETERS = {
  type: "object",
  properties: {
    urls: {
      type: "array",
      items: { type: "string" },
      description:
        "One or more absolute http(s) URLs to read. Prefer URLs returned by web_search.",
    },
  },
  required: ["urls"],
} as const;

/** OpenAI 兼容系列（openai/deepseek/siliconflow/...）与 Anthropic（下方会映射成 input_schema）。 */
function getOpenAITools(): any[] {
  return [
    {
      type: "function",
      function: {
        name: WEB_SEARCH_TOOL_NAME,
        description: WEB_SEARCH_DESCRIPTION,
        parameters: SEARCH_PARAMETERS,
      },
    },
    {
      type: "function",
      function: {
        name: WEB_FETCH_TOOL_NAME,
        description: WEB_FETCH_DESCRIPTION,
        parameters: FETCH_PARAMETERS,
      },
    },
  ];
}

/**
 * 把 OpenAI 形状的 JSON Schema 递归转换成 Gemini 的 Schema（type 大写枚举）。
 *
 * Gemini 要求：`ARRAY` 必须带 `items`，`OBJECT` 必须带 `properties` 且
 * `required` 为可变数组，type 只能是 STRING/NUMBER/INTEGER/BOOLEAN/ARRAY/
 * OBJECT/ENUM 等大写枚举。缺失嵌套字段（如 items）会直接 400。
 */
function toGeminiSchema(schema: any): any {
  if (schema === null || typeof schema !== "object") return schema;

  const type = (schema.type ?? "STRING").toString().toUpperCase();
  const out: Record<string, any> = {};

  if (schema.description !== undefined) out.description = schema.description;
  if (schema.enum !== undefined) out.enum = schema.enum;
  if (schema.format !== undefined) out.format = schema.format;

  switch (type) {
    case "OBJECT": {
      out.type = "OBJECT";
      if (schema.properties) {
        out.properties = Object.fromEntries(
          Object.entries(schema.properties).map(([k, v]) => [
            k,
            toGeminiSchema(v),
          ]),
        );
      }
      if (schema.required) {
        out.required = Array.isArray(schema.required)
          ? [...schema.required]
          : [schema.required];
      }
      break;
    }
    case "ARRAY": {
      out.type = "ARRAY";
      if (schema.items !== undefined) out.items = toGeminiSchema(schema.items);
      break;
    }
    case "STRING":
    case "NUMBER":
    case "INTEGER":
    case "BOOLEAN":
    case "ENUM":
      out.type = type;
      break;
    default:
      out.type = "STRING";
  }

  return out;
}

/** Gemini 的 FunctionDeclaration 数组。 */
function getGeminiTools(): any[] {
  return [
    {
      name: WEB_SEARCH_TOOL_NAME,
      description: WEB_SEARCH_DESCRIPTION,
      parameters: toGeminiSchema(SEARCH_PARAMETERS),
    },
    {
      name: WEB_FETCH_TOOL_NAME,
      description: WEB_FETCH_DESCRIPTION,
      parameters: toGeminiSchema(FETCH_PARAMETERS),
    },
  ];
}

/**
 * 把工具执行结果包成符合 runToolRound 约定的返回值：`{ data, status }`。
 *
 * 成功 → 给每条结果分配 `id`（citeId），JSON 序列化后作为工具结果回灌。
 * 失败 → 同样以 status 200 回灌一段结构化错误信息，让模型自己决定要不要重试
 *       （这是防止工具调用死循环的关键，绝不能抛异常）。
 */
function wrapResult(
  result: WebSearchRawResult,
  prefix: string,
): { data: string; status: number } {
  if (isWebSearchError(result)) {
    return {
      data: JSON.stringify({
        error: result.error,
        retryable: result.retryable,
        terminal: result.terminal ?? false,
        message: result.userMessage ?? result.error,
      }),
      status: 200,
    };
  }

  const cited: WebSearchCitedResult[] = result.map((r, i) => ({
    ...r,
    id: citeId(prefix, i),
  }));

  return { data: JSON.stringify(cited), status: 200 };
}

async function runFetch(
  urls: unknown,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchRawResult> {
  const list = Array.isArray(urls)
    ? (urls as unknown[])
    : [urls].filter(Boolean);
  const clean = list
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .map((u) => u.trim());

  if (clean.length === 0) {
    return {
      error: "web_fetch requires at least one non-empty URL",
      retryable: false,
      terminal: true,
    };
  }

  const settled = await Promise.allSettled(
    clean.map((url) => fetchWeb(url, config, signal)),
  );

  const combined: WebSearchResult[] = [];
  const errors: string[] = [];

  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      const res = s.value;
      if (isWebSearchError(res)) {
        errors.push(`[${clean[i]}] ${res.userMessage ?? res.error}`);
      } else {
        combined.push(...res);
      }
    } else {
      errors.push(`[${clean[i]}] ${String(s.reason)}`);
    }
  });

  if (combined.length === 0) {
    return {
      error: `web_fetch failed for all URLs: ${errors.join("; ")}`,
      retryable: true,
    };
  }

  // 仍把每条失败的 URL 作为可读错误附在结果里，模型能据此调整
  if (errors.length > 0) {
    combined.push({
      title: "fetch errors",
      url: "",
      content: errors.join("\n"),
    });
  }

  return combined;
}

/**
 * 「搜到即抓取正文」：自动抓前 N 条结果，正文按抓取上限截断。
 *
 * 注意匿名档（无 JINA_API_KEY）r.jina.ai 仅 20 RPM，3 路并发有 429 风险；
 * 已配好 Key 时（s.jina.ai 500 RPM）无此顾虑。
 */
const AUTO_FETCH_TOP = 3;

async function autoFetchTopResults(
  results: WebSearchResult[],
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const targets = results.slice(0, AUTO_FETCH_TOP).filter((r) => r.url);
  if (targets.length === 0) return results;

  // 用抓取上限而不是摘要上限：这里拿到的是整页正文，再按摘要长度（默认 800）
  // 砍一刀等于白抓。fetchWeb 内部已经按 fetchMaxChars 截断过一次，这里取同样的
  // 值只是保险（避免 provider 侧截断失效时正文失控）。
  const cap = config.fetchMaxChars || 5000;
  const settled = await Promise.allSettled(
    targets.map((r) => fetchWeb(r.url, config, signal)),
  );

  settled.forEach((s, i) => {
    if (s.status !== "fulfilled") return;
    const raw = s.value;
    if (isWebSearchError(raw)) return;
    const body = raw[0]?.content.trim();
    if (body) targets[i].content = body.slice(0, cap);
  });

  return results;
}

function createWebSearchFuncs(
  config: WebSearchConfig,
  controller: AbortController,
): Record<string, (args: any) => Promise<{ data: string; status: number }>> {
  const signal = controller.signal;

  return {
    [WEB_SEARCH_TOOL_NAME]: async (args: { query?: string }) => {
      const prefix = newCitePrefix();
      let result = await searchWeb(args?.query ?? "", config, signal);
      // 默认「搜到即抓取正文」，避免模型只 search 不 fetch 导致回答不准
      if (!isWebSearchError(result) && result.length > 0) {
        result = await autoFetchTopResults(result, config, signal);
      }
      return wrapResult(result, prefix);
    },
    [WEB_FETCH_TOOL_NAME]: async (args: { urls?: unknown }) => {
      return wrapResult(
        await runFetch(args?.urls ?? [], config, signal),
        newCitePrefix(),
      );
    },
  };
}

/**
 * 各 platform 的唯一注入入口：读全局开关，未开启时返回空 tools/funcs。
 *
 * @param provider 只有 Google 需要 Gemini 形状的 functionDeclarations；
 *                 Anthropic 用 OpenAI 形状，由 anthropic.ts 自行映射成 input_schema。
 */
export function webSearchTools(
  controller: AbortController,
  provider: ServiceProvider = ServiceProvider.OpenAI,
): { tools: any[]; funcs: Record<string, Function> } {
  const config = useAppConfig.getState().webSearch;
  if (!config?.enabled) return { tools: [], funcs: {} };

  return {
    tools:
      provider === ServiceProvider.Google ? getGeminiTools() : getOpenAITools(),
    funcs: createWebSearchFuncs(config, controller),
  };
}

/**
 * 工具调用在消息里的一行展示：`网页搜索：关键词` / `查看网页：example.com`。
 *
 * 模型侧的 wire name 必须是 ASCII，这里只负责给人看，两者不能混用。
 * 非联网工具（MCP 等）原样返回其名字。
 */
export function describeToolCall(tool: ChatMessageTool): string {
  const name = tool?.function?.name ?? "";

  let args: any = {};
  try {
    args = JSON.parse(tool?.function?.arguments || "{}");
  } catch {
    args = {};
  }

  if (name === WEB_SEARCH_TOOL_NAME) {
    const query = typeof args?.query === "string" ? args.query.trim() : "";
    return query ? `${WEB_SEARCH_LABEL}：${query}` : WEB_SEARCH_LABEL;
  }

  if (name === WEB_FETCH_TOOL_NAME) {
    const raw = Array.isArray(args?.urls) ? args.urls : [args?.urls];
    const hosts = raw
      .filter((u: unknown): u is string => typeof u === "string" && !!u.trim())
      .map((u: string) => getHostname(u) || u.trim());
    if (hosts.length === 0) return WEB_FETCH_LABEL;
    return hosts.length === 1
      ? `${WEB_FETCH_LABEL}：${hosts[0]}`
      : `${WEB_FETCH_LABEL}：${hosts[0]} 等 ${hosts.length} 个页面`;
  }

  return name;
}
