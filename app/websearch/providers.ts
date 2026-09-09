import { z } from "zod";

import {
  DEFAULT_BRAVE_API_HOST,
  DEFAULT_JINA_READER_HOST,
  DEFAULT_JINA_READER_HOST_CN,
  DEFAULT_JINA_SEARCH_HOST,
  DEFAULT_JINA_SEARCH_HOST_CN,
  DEFAULT_SEARCH_PROVIDER,
} from "./constants";
import { webFetch } from "./proxy-fetch";
import type { WebSearchConfig, WebSearchResult } from "./types";
import { isSafePublicUrl, normalizeResults, truncateText } from "./utils";

/**
 * 搜索/抓取供应商（服务端专用，只被 /api/websearch 引用）。
 *
 * - 搜索：Brave Search；未配 `BRAVE_API_KEY` 时退到 Jina `s.jina.ai`。
 * - 抓取：Jina Reader `r.jina.ai`。
 *
 * 凭据一律读服务端环境变量，前端永不携带 Key。
 * 失败一律抛异常，由 route.ts 统一分类成结构化错误。
 */

const BraveResponseSchema = z.object({
  query: z.object({ original: z.string().optional() }).optional(),
  web: z
    .object({
      results: z
        .array(
          z.object({
            title: z.string().optional(),
            url: z.string().optional(),
            description: z.string().optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

function resolveHost(customHost: string | undefined, fallback: string): string {
  const raw = customHost?.trim();
  return (raw && raw.length > 0 ? raw : fallback).replace(/\/+$/, "");
}

/** 非 2xx 时把响应体前 300 字符带进错误信息，便于 route 分类与排查。 */
async function fail(res: Response, prefix: string): Promise<never> {
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  throw new Error(`${prefix}: HTTP ${res.status}${detail ? ` ${detail}` : ""}`);
}

async function braveSearch(
  query: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error(
      "Web search is unavailable: Brave Search API key is not configured.",
    );
  }

  const url = new URL(
    `${resolveHost(process.env.BRAVE_API_HOST, DEFAULT_BRAVE_API_HOST)}/res/v1/web/search`,
  );
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(config.maxResults));
  // 注意：Brave 的 search_lang 只接受特定语言枚举（zh-hans/zh-hant/en/...），
  // 没有 "all"。留空让 Brave 按查询内容自动判定语言，避免 422。

  const res = await webFetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal,
  });
  if (!res.ok) return fail(res, "Brave Search failed");

  const parsed = BraveResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `Brave Search returned an unexpected response shape: ${parsed.error.message}`,
    );
  }

  return normalizeResults(
    (parsed.data.web?.results ?? []).map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      content: item.description ?? "",
    })),
    config.maxResults,
    config.snippetMaxChars,
  );
}

/**
 * Jina 的响应一律按结构化 JSON 解析。
 *
 * 不能退回 text/markdown：搜索接口会把 N 条结果写成一整篇文章，只能拆出
 * 1 条结果，maxResults、引用编号、Sources 全部失效；抓取接口则要靠正则去
 * 猜 `Title:` / `Markdown Content:` 两行，上游一改版就切错位置。
 */
const JinaResultSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
});

const JinaSearchResponseSchema = z.object({
  data: z.array(JinaResultSchema).optional(),
  results: z.array(JinaResultSchema).optional(),
});

const JinaReaderResponseSchema = z.object({
  // 抓取正文可能在 content 也可能在 text（不同版本字段名不同）
  data: z
    .object({
      title: z.string().optional(),
      content: z.string().optional(),
      text: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});

/**
 * Jina 的 host 解析：显式 env > 国内镜像（默认）> 官方域名。
 *
 * 官方域名在国内网络实测连不上，镜像可用，故默认镜像；
 * 海外部署者设 `JINA_OFFICIAL_HOST=1` 可切回官方。
 */
function resolveJinaHost(
  customHost: string | undefined,
  official: string,
  mirror: string,
): string {
  const raw = customHost?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return process.env.JINA_OFFICIAL_HOST === "1" ? official : mirror;
}

function jinaHeaders(
  apiKey: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    Accept: "application/json",
    ...extra,
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function jinaSearch(
  query: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  // s.jina.ai 必须带 Key（匿名请求会被上游拒）。这里早失败给出明确提示，
  // 好过发一个必然失败的请求再让模型去猜为什么没有结果。
  const apiKey = process.env.JINA_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error(
      "Web search is unavailable: Jina Search API key is not configured.",
    );
  }

  const host = resolveJinaHost(
    process.env.JINA_API_HOST,
    DEFAULT_JINA_SEARCH_HOST,
    DEFAULT_JINA_SEARCH_HOST_CN,
  );
  const target = new URL(`${host}/`);
  target.searchParams.set("q", query);

  const res = await webFetch(target.toString(), {
    method: "GET",
    headers: jinaHeaders(apiKey),
    signal,
  });
  if (!res.ok) return fail(res, "Jina Search failed");

  const parsed = JinaSearchResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `Jina Search returned an unexpected response shape: ${parsed.error.message}`,
    );
  }

  const items = parsed.data.data ?? parsed.data.results ?? [];

  return normalizeResults(
    items.map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      content: item.content ?? item.description ?? "",
    })),
    config.maxResults,
    config.snippetMaxChars,
  );
}

async function jinaFetch(
  url: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  // SSRF 防护：只允许公网 http(s) 且不带凭据
  if (!isSafePublicUrl(url)) {
    throw new Error(
      "Web fetch refused the target URL: only public http(s) URLs without credentials are allowed.",
    );
  }

  const host = resolveJinaHost(
    process.env.JINA_API_HOST,
    DEFAULT_JINA_READER_HOST,
    DEFAULT_JINA_READER_HOST_CN,
  );
  const res = await webFetch(`${host}/${encodeURI(url)}`, {
    method: "GET",
    // Reader 匿名可用（20 RPM），配了 Key 是 500 RPM；
    // X-Retain-Images: none 去掉图片噪声，正文更干净
    headers: jinaHeaders(process.env.JINA_API_KEY?.trim() ?? "", {
      "X-Timeout": "20",
      "X-Retain-Images": "none",
    }),
    signal,
  });
  if (!res.ok) return fail(res, "Jina Reader failed");

  const parsed = JinaReaderResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(
      `Jina Reader returned an unexpected response shape: ${parsed.error.message}`,
    );
  }

  // 字段可能在 data 里，也可能平铺在顶层
  const data = parsed.data.data ?? parsed.data;
  const content = (data.content ?? data.text ?? "").trim();
  if (!content) {
    throw new Error(`Jina Reader returned empty content for ${url}`);
  }

  return [
    {
      title: data.title?.trim() || url,
      // Reader 会跟随重定向，回传的才是最终地址
      url: data.url?.trim() || url,
      content: truncateText(content, config.fetchMaxChars),
    },
  ];
}

export function runSearch(
  query: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  // 按用户选择分派，不再「Brave 没配 Key 就静默退 Jina」：
  // Jina 搜索同样需要 Key，那条兜底必然失败，只会让模型收到一条错误提示。
  // 缺 Key 时由各自 provider 抛错，route 会把它归类成 terminal（别再重试）。
  const provider = config.searchProvider ?? DEFAULT_SEARCH_PROVIDER;
  return provider === "jina"
    ? jinaSearch(query, config, signal)
    : braveSearch(query, config, signal);
}

export function runFetch(
  url: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  return jinaFetch(url, config, signal);
}
