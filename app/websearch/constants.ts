import type { WebSearchConfig, WebSearchProviderName } from "./types";

/**
 * 工具的 wire name。
 *
 * 恒为 ASCII，且必须与 `createWebSearchFuncs()` 返回的 key 完全一致 ——
 * function calling 依赖这个名字做分发。界面上的中文名（"网页搜索"）只是
 * 渲染层的本地化，绝不能写进这里。
 */
export const WEB_SEARCH_TOOL_NAME = "web_search";
export const WEB_FETCH_TOOL_NAME = "web_fetch";

/** 工具调用在 UI 上的中文展示名（wire name 是 ASCII，只给模型用）。 */
export const WEB_SEARCH_LABEL = "网页搜索";
export const WEB_FETCH_LABEL = "查看网页";

/** 单条助手消息内允许的最大工具调用轮次，超过后强制模型基于已有信息作答。 */
export const MAX_TOOL_ROUNDS = 5;

/** 工具连续失败（不可用/网络不通）或达到轮次上限后，追加进上下文的强制作答指令。 */
export const TOOL_STOP_MESSAGE =
  "Web search / web fetch is currently unavailable or has repeatedly failed. " +
  "Do NOT call web_search or web_fetch again. " +
  "Answer the user's question directly using your existing knowledge, " +
  "and briefly mention that live web search is unavailable if relevant.";

export const SEARCH_TIMEOUT_MS = 15000;
export const FETCH_TIMEOUT_MS = 30000;

/** Brave 免费档限流为 1 req/s，服务端串行请求之间的最小间隔。 */
export const BRAVE_MIN_REQUEST_INTERVAL_MS = 1100;

export const DEFAULT_BRAVE_API_HOST = "https://api.search.brave.com";
export const DEFAULT_JINA_READER_HOST = "https://r.jina.ai";
export const DEFAULT_JINA_SEARCH_HOST = "https://s.jina.ai";

/**
 * Jina 的国内镜像（与官方接口同构）。
 *
 * 官方域名在部分网络环境下直接连不上（实测 curl 返回 000），镜像返回 200，
 * 所以 providers.ts 默认走镜像；海外部署者设 `JINA_OFFICIAL_HOST=1` 切回官方。
 */
export const DEFAULT_JINA_READER_HOST_CN = "https://r.jinaai.cn";
export const DEFAULT_JINA_SEARCH_HOST_CN = "https://s.jinaai.cn";

/** 默认搜索服务商（抓取恒为 Jina，不在此列）。 */
export const DEFAULT_SEARCH_PROVIDER: WebSearchProviderName = "brave";

/**
 * 引用编号统一用普通数字 `[1]`，与下方 Sources 列表的 `[1]` 严格对应。
 * 之所以不用 HTML `<sup>`：NextChat 的 Markdown 渲染未启用 `rehype-raw`，
 * 原生 HTML 不会被渲染；而为了一个上标去开启 `rehype-raw` 等于让模型输出的
 * 任意 HTML 直通 DOM，风险远大于收益。
 */

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
  enabled: false,
  searchProvider: DEFAULT_SEARCH_PROVIDER,
  maxResults: 5,
  snippetMaxChars: 800,
  fetchMaxChars: 5000,
};

/**
 * 行内引用规则。
 *
 * 必须出现在两个地方：工具 description（模型第一次看到工具时）与工具结果之后
 * （模型准备写答案时）。只写在 description 末尾时，除 Gemini 外的大多数模型会
 * 直接忽略，正文里就没有任何 [cite:id]，最后只剩兜底的 Sources 清单。
 */
export const WEB_SEARCH_CITATION_RULE = `CITING (required): after every factual statement, append an inline citation \`[cite:id]\` using the exact \`id\` field of the result that supports it. Example: "It ships a 300Hz 2.5K panel [cite:a1b2c3d4-2]." Several ids can share one marker: \`[cite:a1b2c3d4-2, a1b2c3d4-5]\`. Never invent an id, and never use a bare number or a raw URL as a citation.`;

/**
 * web_search 的工具描述。
 *
 * 对齐 Cherry Studio `src/main/ai/tools/webLookup.ts` 的 WEB_SEARCH_DESCRIPTION：
 * 明确「什么情况下该搜」「什么情况下别搜」「允许多次调用拓宽覆盖」
 * 「用 [cite:id] 标注来源」四件事，缺任何一条模型的行为都会明显变差。
 *
 * 引用规则放在开头而非结尾：放在末尾时容易被模型整段忽略。
 */
export const WEB_SEARCH_DESCRIPTION = `Search the web for current information, news, and real-time data.

${WEB_SEARCH_CITATION_RULE}

Use this when:
- The user asks about recent events, current prices, or live data
- You need to verify facts you're uncertain about or that may have changed
- The user references something you don't have context on

Don't use for:
- Math, code reasoning, or things you can answer from your training
- Well-known facts unlikely to have changed

You may call this multiple times with different queries to broaden coverage:
- If the topic likely has more authoritative sources in another language
  (English for tech and scientific topics, the local language for regional news),
  repeat the search with the topic translated into the most likely source language.
- If the first results miss an angle, refine with synonyms or sub-aspects.

After this call, prefer reading the sources:
- Results only contain short snippets. Before answering anything that needs details,
  call web_fetch on the 1-3 most relevant result URLs in a single call.
- Only skip web_fetch if the snippets alone already fully answer the question.

Remember: [cite:id] after every factual statement.`;

export const WEB_FETCH_DESCRIPTION = `Fetch the readable content from one or more known web page URLs.
You can pass several URLs at once, so batch the pages you need into a single call.

${WEB_SEARCH_CITATION_RULE}

Use this when:
- You just ran web_search and need the full page text behind the top results (expected default
  whenever the answer needs details, numbers, or quotes)
- You have specific URLs from the user, prior context, or web_search
- Search snippets are not enough and you need the source page text

Don't use this when you only have a topic or question; call web_search first.

Remember: [cite:id] after every factual statement.`;
