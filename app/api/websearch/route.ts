import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ModelProvider } from "@/app/constant";
import {
  BRAVE_MIN_REQUEST_INTERVAL_MS,
  DEFAULT_SEARCH_PROVIDER,
  DEFAULT_WEB_SEARCH_CONFIG,
  FETCH_TIMEOUT_MS,
  SEARCH_TIMEOUT_MS,
} from "@/app/websearch/constants";
import { runFetch, runSearch } from "@/app/websearch/providers";
import type { WebSearchConfig, WebSearchError } from "@/app/websearch/types";
import { isSafePublicUrl } from "@/app/websearch/utils";

import { auth } from "../auth";

const RequestSchema = z.object({
  capability: z.enum(["searchKeywords", "fetchUrls"]),
  input: z.string().trim().min(1).max(2000),
  config: z
    .object({
      // 前端只下发枚举，Key 永远留在服务端
      searchProvider: z.enum(["brave", "jina"]).optional(),
      maxResults: z.number().int().min(1).max(20).optional(),
      snippetMaxChars: z.number().int().min(100).max(8000).optional(),
      fetchMaxChars: z.number().int().min(500).max(200000).optional(),
    })
    .optional(),
});

/**
 * Brave 免费档限流为 1 req/s。
 * 用一个模块级串行队列把所有 Brave 请求排队，并保证相邻请求的最小间隔。
 */
let braveQueue: Promise<unknown> = Promise.resolve();
let lastBraveRequestAt = 0;

function enqueueBrave<T>(task: () => Promise<T>): Promise<T> {
  const run = braveQueue.then(async () => {
    const waitMs =
      BRAVE_MIN_REQUEST_INTERVAL_MS - (Date.now() - lastBraveRequestAt);
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastBraveRequestAt = Date.now();
    return task();
  });

  // 队列本身不能被单个请求的失败打断
  braveQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`web lookup timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 把任意异常分类成结构化错误，让模型能判断「还能不能重试」。
 *
 * 这是防止工具调用死循环的关键：配置性错误（缺 Key、Key 无效、Host 非法）
 * 必须标记为 terminal，否则模型会一直重试同一个必然失败的动作。
 */
function classifyError(error: unknown): WebSearchError {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/HTTP (\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;

  const fail = (
    userMessage: string,
    retryable: boolean,
    terminal = !retryable,
  ): WebSearchError => ({ error: message, retryable, terminal, userMessage });

  if (/api key is not configured/i.test(message)) {
    return fail(
      "Web search is unavailable because no API key is configured. Ask the user to add one in Settings → Web Search.",
      false,
    );
  }

  if (status === 401 || status === 403) {
    return fail(
      "Web search is unavailable because the configured API key was rejected. Ask the user to fix it in Settings → Web Search; do not retry — it cannot succeed until then.",
      false,
    );
  }

  if (status === 429) {
    return fail(
      "Web search is rate limited. Wait, or retry once with a different query.",
      true,
      false,
    );
  }

  if (status !== undefined && status >= 400 && status < 500) {
    return fail(
      "Web search was rejected by the provider. Report the failure to the user; do not retry the same query.",
      false,
    );
  }

  if (/timed out|network|fetch failed|ENOTFOUND|ECONNRESET/i.test(message)) {
    return fail(
      "Web lookup failed due to a network or timeout problem. You may retry once with a different query.",
      true,
      false,
    );
  }

  return fail(
    "Web lookup failed. You may retry once with a different query.",
    true,
    false,
  );
}

async function handle(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  // 与其它 /api/* 路由保持一致：受访问码保护
  const authResult = auth(req, ModelProvider.GPT);
  if (authResult.error) {
    return NextResponse.json(authResult, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body", retryable: false, terminal: true },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `invalid request: ${parsed.error.message}`,
        retryable: false,
        terminal: true,
      },
      { status: 400 },
    );
  }

  const { capability, input } = parsed.data;
  const config: WebSearchConfig = {
    ...DEFAULT_WEB_SEARCH_CONFIG,
    ...parsed.data.config,
  };

  // SSRF 防护：抓取目标必须是公网 http(s) 且不带凭据
  if (capability === "fetchUrls" && !isSafePublicUrl(input)) {
    return NextResponse.json(
      {
        error: "refused to fetch a non-public URL",
        retryable: false,
        terminal: true,
      },
      { status: 400 },
    );
  }

  const search = capability === "searchKeywords";
  // 只有 Brave 需要串行限流队列（免费档 1 req/s）。Jina 走直连，
  // 缺 Key 的情况由 provider 自己抛错，这里不再替它改道。
  const useBrave =
    search &&
    (config.searchProvider ?? DEFAULT_SEARCH_PROVIDER) === "brave" &&
    !!process.env.BRAVE_API_KEY?.trim();

  try {
    // 凭据一律来自服务端环境变量（用户已在 .env.local 配好），刻意不读请求体
    const execute = () =>
      withTimeout(
        search ? runSearch(input, config) : runFetch(input, config),
        search ? SEARCH_TIMEOUT_MS : FETCH_TIMEOUT_MS,
      );

    const results = useBrave ? await enqueueBrave(execute) : await execute();
    return NextResponse.json({ results });
  } catch (error) {
    const classified = classifyError(error);
    // 只记录错误原因，绝不打印 Key 或完整响应体
    console.error("[WebSearch] lookup failed", {
      capability,
      message: classified.error,
    });

    return NextResponse.json(classified, { status: 502 });
  }
}

export const POST = handle;

// nodejs runtime：出站请求需要读取 HTTP(S)_PROXY 走代理（edge runtime 不支持）。
// Vercel 默认即 nodejs runtime，无代理环境变量时自动直连，不受影响。
export const runtime = "nodejs";
