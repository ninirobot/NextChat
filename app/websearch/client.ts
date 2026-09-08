import { ACCESS_CODE_PREFIX, ApiPath } from "@/app/constant";
import { useAccessStore } from "@/app/store/access";

import { FETCH_TIMEOUT_MS, SEARCH_TIMEOUT_MS } from "./constants";
import type {
  WebSearchConfig,
  WebSearchError,
  WebSearchRawResult,
} from "./types";

/**
 * 浏览器侧调用封装。
 *
 * 所有搜索/抓取请求都经过 Next.js 服务端路由 `/api/websearch` 转发，
 * 这样既能规避浏览器的 CORS 限制，也能避免在前端暴露供应商 API Key。
 *
 * 这里只负责：带鉴权头发请求 → 超时控制 → 把后端响应归一化为
 * `WebSearchRawResult`（成功数组 / 失败结构化对象）。不抛异常。
 */

/**
 * 鉴权头单独构造，绝不复用 getHeaders()：
 * getHeaders() 会按当前 provider 返回 google/rednote 等专用鉴权头，
 * 导致 /api/websearch 收不到 Bearer access code，出现 empty access code。
 */
function webSearchHeaders(): Record<string, string> {
  const accessStore = useAccessStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessStore.enabledAccessControl() && accessStore.accessCode) {
    headers["Authorization"] =
      `Bearer ${ACCESS_CODE_PREFIX}${accessStore.accessCode}`;
  }
  return headers;
}

function toError(data: Partial<WebSearchError>): WebSearchError {
  return {
    error: data.error ?? "web lookup failed",
    retryable: data.retryable ?? true,
    terminal: data.terminal,
    userMessage: data.userMessage,
  };
}

async function post(
  capability: "searchKeywords" | "fetchUrls",
  input: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchRawResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    capability === "searchKeywords" ? SEARCH_TIMEOUT_MS : FETCH_TIMEOUT_MS,
  );

  // 把用户的中断信号也接到本地 controller 上（停止生成时联动）
  if (signal) {
    if (signal.aborted) controller.abort();
    else
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
  }

  try {
    const res = await fetch(ApiPath.WebSearch, {
      method: "POST",
      headers: webSearchHeaders(),
      body: JSON.stringify({ capability, input, config }),
      signal: controller.signal,
    });

    const data = (await res
      .json()
      .catch(() => ({}))) as Partial<WebSearchError> & {
      results?: WebSearchRawResult;
    };

    if (!res.ok) {
      return toError(
        data.error
          ? data
          : {
              error: `web lookup failed with HTTP ${res.status}`,
              retryable: res.status >= 500,
              terminal: res.status < 500 && res.status !== 429,
              userMessage:
                "Web lookup failed. Do not retry identical requests.",
            },
      );
    }

    // 后端恒返回二选一：成功 { results } 或失败 { error }
    return data.results ?? toError(data);
  } catch (e) {
    const aborted = controller.signal.aborted;
    return {
      error: aborted ? "web lookup aborted" : String(e),
      retryable: !aborted,
      terminal: false,
      userMessage: aborted
        ? "Web lookup was cancelled."
        : "Web lookup failed. You may retry once with a different query.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function searchWeb(
  query: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchRawResult> {
  return post("searchKeywords", query, config, signal);
}

export function fetchWeb(
  url: string,
  config: WebSearchConfig,
  signal?: AbortSignal,
): Promise<WebSearchRawResult> {
  return post("fetchUrls", url, config, signal);
}
