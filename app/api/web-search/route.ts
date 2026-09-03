import { getServerSideConfig } from "@/app/config/server";
import { ACCESS_CODE_PREFIX } from "@/app/constant";
import {
  normalizeBraveResults,
  type BraveSearchResponse,
} from "@/app/web-search/brave";
import type { WebSearchResponse } from "@/app/web-search/types";
import md5 from "spark-md5";
import { NextRequest, NextResponse } from "next/server";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";

const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_QUERY_LENGTH = 400;
const MAX_RESULTS = 8;
const SEARCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

function isAuthorized(req: NextRequest) {
  const config = getServerSideConfig();
  if (!config.needCode) return true;

  const token = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token.startsWith(ACCESS_CODE_PREFIX)) return false;

  const accessCode = token.slice(ACCESS_CODE_PREFIX.length);
  return config.codes.has(md5.hash(accessCode).trim());
}

function getProxyAgent() {
  const config = getServerSideConfig();
  if (config.proxyUrl && config.proxyUrl.length > 0) {
    console.log("[Web Search] Using proxy:", config.proxyUrl);
    return new HttpsProxyAgent(config.proxyUrl);
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getServerSideConfig();
  if (!config.braveApiKey) {
    return NextResponse.json(
      { error: "Web search is not configured" },
      { status: 503 },
    );
  }

  let query = "";
  try {
    const body = (await req.json()) as { query?: unknown };
    query = typeof body.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json(
      { error: "Invalid search request" },
      { status: 400 },
    );
  }

  if (!query) {
    return NextResponse.json(
      { error: "Search query is required" },
      { status: 400 },
    );
  }
  query = query.slice(0, MAX_QUERY_LENGTH);

  const url = new URL(BRAVE_WEB_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(MAX_RESULTS));

  const proxyAgent = getProxyAgent();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": config.braveApiKey,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {
      const fetchOptions: any = {
        method: "GET",
        headers,
        cache: "no-store",
        signal: controller.signal,
      };

      if (proxyAgent) {
        fetchOptions.agent = proxyAgent;
      }

      const response = await fetch(url.toString(), fetchOptions);

      if (!response.ok) {
        const status = response.status;
        console.error(
          `[Web Search] Brave request failed (attempt ${attempt}/${MAX_RETRIES + 1})`,
          status,
        );

        if (status === 429 && attempt <= MAX_RETRIES) {
          clearTimeout(timeout);
          await sleep(Math.min(2000 * attempt, 5000));
          continue;
        }

        clearTimeout(timeout);
        return NextResponse.json(
          { error: "Web search is temporarily unavailable" },
          { status: status === 429 ? 429 : 502 },
        );
      }

      const data = (await response.json()) as BraveSearchResponse;
      const payload: WebSearchResponse = {
        query,
        sources: normalizeBraveResults(data),
      };

      clearTimeout(timeout);
      return NextResponse.json(payload, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[Web Search] Brave request error (attempt ${attempt}/${MAX_RETRIES + 1})`,
        timedOut ? "timeout" : error,
      );
      clearTimeout(timeout);

      if (attempt <= MAX_RETRIES) {
        await sleep(Math.min(1000 * attempt, 3000));
        continue;
      }
    }
  }

  const timedOut = lastError && lastError.name === "AbortError";
  return NextResponse.json(
    {
      error: timedOut
        ? "Web search timed out. Please try again."
        : "Web search failed. Please try again later.",
    },
    { status: 502 },
  );
}

export const runtime = "nodejs";
