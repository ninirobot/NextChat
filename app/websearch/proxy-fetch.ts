import nodeFetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getServerSideConfig } from "@/app/config/server";

/**
 * 出站代理统一入口（服务端 /api/websearch 使用，nodejs runtime）。
 *
 * 机制与 ninirobot/NextChat commit b36ffca2 的 `/api/web-search` 一致：
 * 用 `node-fetch` + `HttpsProxyAgent(config.proxyUrl)` 走代理请求上游；
 * 没配代理则用全局 fetch 直连（Vercel 上无代理，行为不变）。
 *
 * 代理地址来源（按优先级）：
 *   1. 服务端配置 `PROXY_URL`（NextChat 自带的服务器代理变量，同 commit 用法）
 *   2. `HTTPS_PROXY / HTTP_PROXY / ALL_PROXY`（含小写，常规约定）
 * 不会进客户端 bundle。
 */

let resolvedProxy:
  | {
      url: string;
      source: string;
      agent: InstanceType<typeof HttpsProxyAgent>;
    }
  | null
  | undefined;

function resolveProxy(): {
  url: string;
  source: string;
  agent: InstanceType<typeof HttpsProxyAgent>;
} | null {
  if (resolvedProxy !== undefined) return resolvedProxy;

  let url = "";
  let source = "";

  const cfg = getServerSideConfig();
  if (cfg?.proxyUrl?.trim()) {
    url = cfg.proxyUrl.trim();
    source = "PROXY_URL";
  } else {
    const candidates: Array<[string, string | undefined]> = [
      ["HTTPS_PROXY", process.env.HTTPS_PROXY],
      ["https_proxy", process.env.https_proxy],
      ["HTTP_PROXY", process.env.HTTP_PROXY],
      ["http_proxy", process.env.http_proxy],
      ["ALL_PROXY", process.env.ALL_PROXY],
      ["all_proxy", process.env.all_proxy],
    ];
    const hit = candidates.find(([, v]) => v && v.trim().length > 0);
    if (hit) {
      url = (hit[1] as string).trim();
      source = hit[0];
    }
  }

  if (!url) {
    resolvedProxy = null;
    return null;
  }

  const normalized = /^https?:\/\//i.test(url) ? url : `http://${url}`;
  try {
    const parsed = new URL(normalized);
    const agent = new HttpsProxyAgent(parsed.toString());
    // 只打 host/来源，绝不打印凭据
    console.info(
      `[WebSearch] using proxy ${parsed.host} (env ${source})${parsed.username ? " (auth)" : ""}`,
    );
    resolvedProxy = { url: parsed.toString(), source, agent };
    return resolvedProxy;
  } catch (e) {
    console.warn(`[WebSearch] invalid proxy from ${source}, ignored:`, e);
    resolvedProxy = null;
    return null;
  }
}

/** Provider 出站请求统一入口。 */
export async function webFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const proxy = resolveProxy();
  if (!proxy) {
    return globalThis.fetch(input as RequestInfo, init);
  }

  // 与 commit 相同的走法：node-fetch + HttpsProxyAgent
  return nodeFetch(input as unknown as Parameters<typeof nodeFetch>[0], {
    ...(init as Record<string, unknown>),
    agent: proxy.agent,
  }) as unknown as Promise<Response>;
}
