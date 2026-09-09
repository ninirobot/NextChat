import { nanoid } from "nanoid";

import type { WebSearchResult } from "./types";

/** 生成一次工具调用的引用 id 前缀。跨多次调用保持 id 全局唯一。 */
export function newCitePrefix(): string {
  return nanoid(8)
    .replace(/[^a-zA-Z0-9]/g, "0")
    .toLowerCase();
}

/** 拼接单条结果的引用 id，形如 `3f2a1b9c-2`。 */
export function citeId(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

/** 按字符数截断，超出部分用省略号标记，便于模型识别内容被裁剪过。 */
export function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (maxChars <= 0) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}...`;
}

/** 取 URL 的主机名小写形式，解析失败时返回空串。 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** 过滤掉 URL 非法或内容为空的结果，并截断正文。 */
export function normalizeResults(
  results: WebSearchResult[],
  maxResults: number,
  maxChars: number,
): WebSearchResult[] {
  return results
    .filter((item) => item.url?.startsWith("http") && item.content.trim())
    .slice(0, maxResults)
    .map((item) => ({
      title: item.title.trim() || getHostname(item.url),
      url: item.url,
      content: truncateText(item.content, maxChars),
    }));
}

/**
 * SSRF 防护：只允许 http(s)，且禁止回环、私有网段与 link-local。
 * 服务端代理会被外部触达，必须挡住把本机/内网当抓取目标的情况。
 */
export function isSafePublicUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "::1" || host === "[::1]") return false;
  if (host === "0.0.0.0") return false;

  // 禁止在 URL 里携带凭据，避免绕过
  if (url.username || url.password) return false;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return false; // 10.0.0.0/8
    if (a === 127) return false; // 127.0.0.0/8
    if (a === 0) return false; // 0.0.0.0/8
    if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmark
    if (a >= 224) return false; // 组播与保留
  }

  // IPv6 私有段
  if (host.startsWith("fc") || host.startsWith("fd")) return false;
  if (host.startsWith("fe80")) return false;

  return true;
}
