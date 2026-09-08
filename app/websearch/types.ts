/**
 * 联网搜索的类型定义。
 *
 * 只有两种运行时形态：成功是「结果数组」，失败是「结构化错误对象」。
 * 工具函数永不抛异常 —— 抛异常会让模型分不清「暂时故障」和「配置错误」，
 * 极易陷入工具调用死循环。
 */

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

/**
 * 工具执行失败的结构化结果。
 *
 * - `terminal: true` —— 配置性问题（缺 API Key、Key 被拒）。重试不可能成功。
 * - `retryable: true` —— 网络超时 / 上游 5xx，允许模型换个查询词再试一次。
 */
export interface WebSearchError {
  error: string;
  retryable: boolean;
  terminal?: boolean;
  /** 回灌给模型的可读提示，缺省时回退用 `error`。 */
  userMessage?: string;
}

export type WebSearchRawResult = WebSearchResult[] | WebSearchError;

export function isWebSearchError(
  result: WebSearchRawResult,
): result is WebSearchError {
  // 成功恒为数组；错误对象是唯一的非数组形态。
  return !Array.isArray(result);
}

/** 带引用 id 的结果条目，直接作为工具的返回值回灌给模型。 */
export interface WebSearchCitedResult extends WebSearchResult {
  id: string;
}

/** 一条引用来源。渲染阶段据此生成上标链接与末尾的 Sources 清单。 */
export interface WebSearchSource {
  id: string;
  title: string;
  url: string;
}

/**
 * 搜索服务商。抓取（fetch）不在此列 —— 它固定走 Jina。
 *
 * 只有两个写死选项：新增服务商需要改 providers.ts 的分派，不提供插件式扩展。
 */
export type WebSearchProviderName = "brave" | "jina";

export interface WebSearchConfig {
  enabled: boolean;
  /**
   * 搜索服务商（抓取恒为 Jina，不在此列）。
   *
   * 可选是为了兼容老用户的持久化数据（IndexedDB 里没有这个字段）。
   * 服务端与前端读取时一律用 `?? DEFAULT_SEARCH_PROVIDER` 兜底。
   */
  searchProvider?: WebSearchProviderName;
  /** 单次 web_search 返回的最大结果条数，1-20 */
  maxResults: number;
  /** 每条搜索结果 content 的最大字符数，防上下文爆炸 */
  snippetMaxChars: number;
  /** web_fetch 返回正文的最大字符数 */
  fetchMaxChars: number;
}
