import {
  CACHE_URL_PREFIX,
  UPLOAD_URL,
  REQUEST_TIMEOUT_MS,
} from "@/app/constant";
import { MultimodalContent, RequestMessage } from "@/app/client/api";
import Locale from "@/app/locales";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import { prettyObject } from "./format";
import { fetch as tauriFetch } from "./stream";
import {
  MAX_TOOL_ROUNDS,
  TOOL_STOP_MESSAGE,
  WEB_SEARCH_CITATION_RULE,
} from "../websearch/constants";

export function compressImage(file: Blob, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent: any) => {
      const image = new Image();
      image.onload = () => {
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        let width = image.width;
        let height = image.height;
        let quality = 0.9;
        let dataUrl;

        do {
          canvas.width = width;
          canvas.height = height;
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          ctx?.drawImage(image, 0, 0, width, height);
          dataUrl = canvas.toDataURL("image/jpeg", quality);

          if (dataUrl.length < maxSize) break;

          if (quality > 0.5) {
            // Prioritize quality reduction
            quality -= 0.1;
          } else {
            // Then reduce the size
            width *= 0.9;
            height *= 0.9;
          }
        } while (dataUrl.length > maxSize);

        resolve(dataUrl);
      };
      image.onerror = reject;
      image.src = readerEvent.target.result;
    };
    reader.onerror = reject;

    if (file.type.includes("heic")) {
      try {
        const heic2any = require("heic2any");
        heic2any({ blob: file, toType: "image/jpeg" })
          .then((blob: Blob) => {
            reader.readAsDataURL(blob);
          })
          .catch((e: any) => {
            reject(e);
          });
      } catch (e) {
        reject(e);
      }
    }

    reader.readAsDataURL(file);
  });
}

export async function preProcessImageContentBase(
  content: RequestMessage["content"],
  transformImageUrl: (url: string) => Promise<{ [key: string]: any }>,
  transformVideoUrl?: (url: string) => Promise<{ [key: string]: any }>,
) {
  if (typeof content === "string") {
    return content;
  }
  const result = [];
  for (const part of content) {
    if (part?.type == "image_url" && part?.image_url?.url) {
      try {
        const url = await cacheImageToBase64Image(part?.image_url?.url);
        result.push(await transformImageUrl(url));
      } catch (error) {
        console.error("Error processing image URL:", error);
      }
    } else if (part?.type == "video_url" && part?.video_url?.url) {
      try {
        const url = await cacheImageToBase64Image(part?.video_url?.url);
        result.push(
          transformVideoUrl
            ? await transformVideoUrl(url)
            : { type: "video_url", video_url: { url } },
        );
      } catch (error) {
        console.error("Error processing video URL:", error);
      }
    } else {
      result.push({ ...part });
    }
  }
  return result;
}

export async function preProcessImageContent(
  content: RequestMessage["content"],
) {
  return preProcessImageContentBase(content, async (url) => ({
    type: "image_url",
    image_url: { url },
  })) as Promise<MultimodalContent[] | string>;
}

export async function preProcessImageContentForAlibabaDashScope(
  content: RequestMessage["content"],
) {
  return preProcessImageContentBase(content, async (url) => ({
    image: url,
  }));
}

const imageCaches: Record<string, string> = {};
export function cacheImageToBase64Image(imageUrl: string) {
  if (imageUrl.includes(CACHE_URL_PREFIX)) {
    if (!imageCaches[imageUrl]) {
      const reader = new FileReader();
      return fetch(imageUrl, {
        method: "GET",
        mode: "cors",
        credentials: "include",
      })
        .then((res) => res.blob())
        .then(
          async (blob) =>
            (imageCaches[imageUrl] = await compressImage(blob, 256 * 1024)),
        ); // compressImage
    }
    return Promise.resolve(imageCaches[imageUrl]);
  }
  return Promise.resolve(imageUrl);
}

export function base64Image2Blob(base64Data: string, contentType: string) {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

export function uploadImage(file: Blob): Promise<string> {
  if (!window._SW_ENABLED) {
    // if serviceWorker register error, using compressImage
    return compressImage(file, 256 * 1024);
  }
  const body = new FormData();
  body.append("file", file);
  return fetch(UPLOAD_URL, {
    method: "post",
    body,
    mode: "cors",
    credentials: "include",
  })
    .then((res) => res.json())
    .then((res) => {
      // console.log("res", res);
      if (res?.code == 0 && res?.data) {
        return res?.data;
      }
      throw Error(`upload Error: ${res?.msg}`);
    });
}

export function removeImage(imageUrl: string) {
  return fetch(imageUrl, {
    method: "DELETE",
    mode: "cors",
    credentials: "include",
  });
}

/**
 * 判断本轮工具结果是否说明「工具不可用，应停止继续调用」。
 *
 * 工具失败会以 `{"error":..., "retryable":..., "terminal":...}` 形态回灌；
 * 只要出现 terminal 失败，或连续两轮都失败（如代理/网络不通），就应停止，
 * 避免模型空转 5 轮后才被迫作答。
 */
function toolRoundNeedsStop(toolCallResult: any[]): boolean {
  let errorCount = 0;
  let terminal = false;

  for (const r of toolCallResult) {
    const raw = typeof r?.content === "string" ? r.content.trim() : "";
    if (!raw || raw[0] !== "{") continue;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object" && obj.error) {
        errorCount += 1;
        if (obj.terminal === true || obj.retryable === false) terminal = true;
      }
    } catch {
      // 非 JSON 的工具结果（普通内容）不算失败
    }
  }

  return terminal || errorCount >= 2;
}

/**
 * 追加「工具不可用，直接作答」提示。
 * 不同厂商消息形态不同：只有 messages 存在且末条 content 是字符串时才插入
 * （anthropic 这类块级 content 不适用），避免破坏请求体。
 */
function appendToolStopInstruction(requestPayload: any) {
  const messages = requestPayload?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return;
  const last = messages[messages.length - 1];
  if (typeof last?.content !== "string") return;

  const hasStop = messages.some(
    (m) =>
      m?.role === "system" &&
      typeof m?.content === "string" &&
      m.content === TOOL_STOP_MESSAGE,
  );
  if (!hasStop) {
    messages.push({ role: "system", content: TOOL_STOP_MESSAGE });
  }
}

/**
 * 动画驱动。
 *
 * 刻意不用 requestAnimationFrame：标签页不可见/窗口最小化时浏览器会暂停 rAF，
 * 而 fetchEventSource 配了 `openWhenHidden: true`，网络数据照常到达 —— 缓冲区
 * 越攒越大，回到前台时一次性倾泻，打字机效果彻底消失。定时器在后台同样会走
 * （可能被节流，但不会停），不会攒出整段缓冲。
 */
function nextFrame(fn: () => void): void {
  setTimeout(fn, 16);
}

/**
 * 在工具结果之后补一条引用提醒，位置正好在「模型准备写答案」之前。
 *
 * 引用规则只写在工具 description 里时，除 Gemini 外的大多数模型会整段忽略，
 * 正文里就没有任何 [cite:id]，最后只剩兜底的 Sources 清单。这里再提醒一次才稳定。
 *
 * 只改**请求体**里的工具结果副本，不动 `botMessage.tools[].content`
 * （渲染侧解析的是后者），所以 JSON 解析与来源提取均不受影响。
 *
 * 实际有四种 payload 形状，且都**不能新增 turn**：
 *  - Gemini `contents`：往本轮 functionResponse 所在的 user turn 追加一个 text part
 *  - OpenAI 系 / 通义千问 `messages`（通义在 `input.messages`）：
 *    追加到最后一条 `role: "tool"` 的字符串 content 末尾
 *  - Anthropic `messages`：工具结果是 `role: "user"` + `[{type:"tool_result"}]` 数组，
 *    往该数组追加一个 `{type:"text"}` 块。刻意不新 push user/system 消息 ——
 *    Anthropic 不接受连续同角色消息，也不接受 messages 里出现 `role: "system"`。
 */
function appendCitationRule(requestPayload: any): void {
  const rule = WEB_SEARCH_CITATION_RULE;
  if (!rule) return;

  // Gemini
  if (Array.isArray(requestPayload?.contents)) {
    for (let i = requestPayload.contents.length - 1; i >= 0; i -= 1) {
      const turn = requestPayload.contents[i];
      if (turn?.role !== "user" || !Array.isArray(turn.parts)) continue;
      if (turn.parts.some((p: any) => p?.text === rule)) return; // 幂等
      turn.parts.push({ text: rule });
      return;
    }
    return;
  }

  // OpenAI 系在 messages，通义千问在 input.messages
  const messages: any[] | undefined = Array.isArray(requestPayload?.messages)
    ? requestPayload.messages
    : requestPayload?.input?.messages;
  if (!Array.isArray(messages)) return;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];

    // OpenAI 系 / 通义千问
    if (message?.role === "tool" && typeof message.content === "string") {
      if (message.content.includes(rule)) return; // 幂等
      message.content = `${message.content}\n\n${rule}`;
      return;
    }

    // Anthropic：只在确属工具结果的那条 user 消息上追加，避免污染普通用户消息
    if (message?.role === "user" && Array.isArray(message.content)) {
      const isToolResult = message.content.some(
        (block: any) => block?.type === "tool_result",
      );
      if (!isToolResult) continue;
      const already = message.content.some(
        (block: any) => block?.type === "text" && block?.text === rule,
      );
      if (already) return; // 幂等
      message.content.push({ type: "text", text: rule });
      return;
    }
  }
}

/**
 * 一轮流式结束后：执行模型收集的 tool_calls → 经 onBeforeTool/onAfterTool 落盘
 * → 把结果作为 tool message 追加回请求体 → 由 onDone 重新发起流式请求。
 *
 * `stream()` 与 `streamWithThink()` 共用，避免两份实现漂移。
 * 返回 true 表示已进入工具轮，调用方应直接 return。
 */
function runToolRound(params: {
  runTools: any[];
  requestPayload: any;
  tools: any[];
  funcs: Record<string, Function>;
  options: any;
  processToolMessage: (
    requestPayload: any,
    toolCallMessage: any,
    toolCallResult: any[],
  ) => void;
  /** 本次是第几轮工具调用（从 1 开始）。 */
  round: number;
  onDone: () => void;
}): boolean {
  const {
    runTools,
    requestPayload,
    tools,
    funcs,
    options,
    processToolMessage,
    onDone,
  } = params;

  if (!runTools.length) return false;

  // 收尾：清空工具并追加「直接作答」指令，让模型基于已有信息作答
  const stopTools = () => {
    tools.length = 0;
    runTools.length = 0;
    appendToolStopInstruction(requestPayload);
  };

  // 轮次上限保护
  if (params.round > MAX_TOOL_ROUNDS) {
    stopTools();
    setTimeout(onDone, 60);
    return true;
  }

  const toolCallMessage = {
    role: "assistant",
    tool_calls: [...runTools],
  };

  runTools.splice(0, runTools.length); // empty runTools

  Promise.all(
    toolCallMessage.tool_calls.map((tool) => {
      options?.onBeforeTool?.(tool);

      return Promise.resolve(
        // @ts-ignore
        funcs[tool.function.name](
          // @ts-ignore
          tool?.function?.arguments
            ? JSON.parse(tool?.function?.arguments)
            : {},
        ),
      )
        .then((res: any) => {
          let content = res?.data || res?.statusText;
          // hotfix #5614
          content =
            typeof content === "string" ? content : JSON.stringify(content);
          if (res?.status && res.status >= 300) {
            return Promise.reject(content);
          }
          return content;
        })
        .then((content) => {
          options?.onAfterTool?.({
            ...tool,
            content,
            isError: false,
          });
          return content;
        })
        .catch((e) => {
          options?.onAfterTool?.({
            ...tool,
            isError: true,
            errorMsg: e.toString(),
          });
          return e.toString();
        })
        .then((content) => ({
          name: tool.function.name,
          role: "tool",
          content,
          tool_call_id: tool.id,
        }));
    }),
  ).then((toolCallResult) => {
    processToolMessage(requestPayload, toolCallMessage, toolCallResult);
    // 模型写答案前再提醒一次引用格式；多数模型（除 Gemini 外）否则不产出 [cite:id]
    appendCitationRule(requestPayload);
    // 工具连续失败 → 下一轮不再带工具，并追加“直接作答”指令
    if (toolRoundNeedsStop(toolCallResult)) stopTools();
    setTimeout(onDone, 60);
  });

  return true;
}

/**
 * 不产出思考内容的模型（xai / anthropic / glm / moonshot）的流式入口。
 *
 * 以前这里与 `streamWithThink()` 是两份几乎相同的 ~180 行实现（animate + finish
 * + chatApi + fetchEventSource），任何改动都极易只落一边。现在只做一次 parseSSE
 * 形状适配后转发；这些模型的 chunk 里没有 reasoning / `<think>`，统一实现里
 * 对应的分支自然不会命中，行为与旧实现一致。
 */
export function stream(
  chatPath: string,
  requestPayload: any,
  headers: any,
  tools: any[],
  funcs: Record<string, Function>,
  controller: AbortController,
  parseSSE: (text: string, runTools: any[]) => string | undefined,
  processToolMessage: (
    requestPayload: any,
    toolCallMessage: any,
    toolCallResult: any[],
  ) => void,
  options: any,
  timeoutMS?: number,
) {
  return streamWithThink(
    chatPath,
    requestPayload,
    headers,
    tools,
    funcs,
    controller,
    // 调用方的 parseSSE 直接返回正文字符串，这里包成统一形状
    (text, runTools) => {
      const content = parseSSE(text, runTools);
      return content ? { content } : undefined;
    },
    processToolMessage,
    options,
    timeoutMS,
  );
}

/**
 * 解析 OpenAI 兼容接口（带 thinking / reasoning）的 SSE delta。
 * 被 deepseek、rednote 等推理模型 provider 共用，避免每个 provider 重复粘贴一份。
 */
export function parseOpenAIThinkSSE(
  text: string,
  runTools: any[],
): {
  isThinking?: boolean;
  content?: string;
  reasoning?: string;
} {
  const json = JSON.parse(text);
  if (json.error) {
    return {
      isThinking: false,
      content: `\n\n> [!ERROR]\n> ${json.error.message || json.error.code || "Unknown Error"}`,
    };
  }
  const choices = json.choices as Array<{
    delta: {
      content: string | null;
      tool_calls: any[];
      reasoning_content: string | null;
      reasoning: string | null;
    };
  }>;
  const toolCalls = choices[0]?.delta?.tool_calls;
  if (toolCalls?.length > 0) {
    const index = toolCalls[0]?.index;
    const id = toolCalls[0]?.id;
    const args = toolCalls[0]?.function?.arguments;
    if (id) {
      runTools.push({
        id,
        type: toolCalls[0]?.type,
        function: {
          name: toolCalls[0]?.function?.name as string,
          arguments: args,
        },
      });
    } else {
      runTools[index]["function"]["arguments"] += args;
    }
  }
  const reasoning =
    choices[0]?.delta?.reasoning_content ?? choices[0]?.delta?.reasoning;
  const content = choices[0]?.delta?.content;

  return {
    reasoning: reasoning || undefined,
    content: content || undefined,
  };
}

/**
 * 多轮工具调用时，将工具调用消息与执行结果追加进请求体。
 */
export function appendToolMessages(
  requestPayload: { messages?: any[] },
  toolCallMessage: any,
  toolCallResult: any[],
) {
  requestPayload?.messages?.splice(
    requestPayload?.messages?.length,
    0,
    toolCallMessage,
    ...toolCallResult,
  );
}

export function streamWithThink(
  chatPath: string,
  requestPayload: any,
  headers: any,
  tools: any[],
  funcs: Record<string, Function>,
  controller: AbortController,
  parseSSE: (
    text: string,
    runTools: any[],
  ) =>
    | {
        isThinking?: boolean;
        content?: string;
        reasoning?: string;
      }
    | undefined,
  processToolMessage: (
    requestPayload: any,
    toolCallMessage: any,
    toolCallResult: any[],
  ) => void,
  options: any,
  timeoutMS?: number,
) {
  let responseText = "";
  let remainText = "";
  let finished = false;
  let running = false;
  let runTools: any[] = [];
  let responseRes: Response;
  let toolRound = 0;
  let lastIsThinkingTagged = false; //between <think> and </think> tags
  let thinkingStartTime = 0;
  let clockPaused = false; // 最终正文开始输出 → 冻结读秒
  let pauseAt = 0; // 冻结瞬间的时间戳
  let thinkingInterval: ReturnType<typeof setInterval> | null = null;
  let lastSentDuration = -1;
  let reasoningText = "";
  let remainReasoning = ""; // buffer for reasoning text

  /**
   * 思考计时器：一条独立的时间线，与正文排水动画彻底解耦。
   *
   * 排水循环只负责打字机效果；读秒由这里驱动，因此工具执行、等待下一轮
   * 等“排水条件不成立”的时段也不会静止，而是持续 1.1 → 1.2 → 1.3 走字。
   */
  function clockNow(): number {
    return clockPaused ? pauseAt : Date.now();
  }

  function elapsedSec(): number {
    return thinkingStartTime > 0
      ? parseFloat(((clockNow() - thinkingStartTime) / 1000).toFixed(1))
      : 0;
  }

  function notifyClock(force = false) {
    if (thinkingStartTime <= 0) return;
    // 工具轮执行期间必定走字：有些模型是「先发工具调用、再补一段前言正文」，
    // 正文会先触发冻结，若不解冻，整个搜索阶段计时又会静止
    if (running && clockPaused) {
      clockPaused = false;
    }
    // 推理文本正在流式输出时按帧由排水循环通知，这里跳过以免重复高频 setState
    if (!force && remainReasoning.length > 0) return;
    const duration = elapsedSec();
    if (!force && duration === lastSentDuration) return;
    lastSentDuration = duration;
    options.onUpdateThinking?.(reasoningText, duration);
  }

  function stopClock() {
    if (thinkingInterval) {
      clearInterval(thinkingInterval);
      thinkingInterval = null;
    }
  }

  /** 首个思考 token 到达时启动读秒；同轮内又解析到工具调用时用它解除冻结。 */
  function startClock() {
    if (!thinkingStartTime) thinkingStartTime = Date.now();
    clockPaused = false;
    if (!thinkingInterval) {
      thinkingInterval = setInterval(() => {
        if (finished || controller.signal.aborted) {
          stopClock();
          return;
        }
        notifyClock();
      }, 100);
    }
  }

  /** 最终正文开始输出：冻结读秒并立刻补发一次，让 store 落盘最终值。 */
  function pauseClock() {
    if (thinkingStartTime <= 0 || clockPaused) return;
    clockPaused = true;
    pauseAt = Date.now();
    notifyClock(true);
  }

  // animate response to make it looks smooth
  function animateResponseText() {
    if (controller.signal.aborted) {
      stopClock();
      if (remainText.length > 0) {
        responseText += remainText;
        remainText = "";
        options.onUpdate?.(responseText, "");
      }
      if (remainReasoning.length > 0) {
        reasoningText += remainReasoning;
        remainReasoning = "";
        options.onUpdateThinking?.(reasoningText, elapsedSec());
      }
      return;
    }

    if (remainText.length > 0 || remainReasoning.length > 0) {
      if (remainText.length > 0) {
        const fetchCount = Math.max(1, Math.round(remainText.length / 60));
        const fetchText = remainText.slice(0, fetchCount);
        responseText += fetchText;
        remainText = remainText.slice(fetchCount);
        options.onUpdate?.(responseText, fetchText);
      }

      if (remainReasoning.length > 0) {
        const fetchCount = Math.max(1, Math.round(remainReasoning.length / 60));
        const fetchText = remainReasoning.slice(0, fetchCount);
        reasoningText += fetchText;
        remainReasoning = remainReasoning.slice(fetchCount);
        options.onUpdateThinking?.(reasoningText, elapsedSec());
      }
      nextFrame(animateResponseText);
    } else if (finished) {
      stopClock();
      options.onFinish(responseText, responseRes);
    } else {
      nextFrame(animateResponseText);
    }
  }

  // start animaion
  animateResponseText();

  const finish = () => {
    if (!finished) {
      if (!running && runTools.length > 0) {
        toolRound += 1;
        running = true;
        if (
          runToolRound({
            runTools,
            requestPayload,
            tools,
            funcs,
            options,
            processToolMessage,
            round: toolRound,
            onDone: () => {
              running = false;
              chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
            },
          })
        ) {
          return;
        }
        running = false;
      }
      if (running) {
        return;
      }
      console.debug("[ChatAPI] end");
      finished = true;
    }
  };

  controller.signal.onabort = finish;

  function chatApi(
    chatPath: string,
    headers: any,
    requestPayload: any,
    tools: any,
  ) {
    const chatPayload = {
      method: "POST",
      body: JSON.stringify({
        ...requestPayload,
        tools: tools && tools.length ? tools : undefined,
      }),
      signal: controller.signal,
      headers,
    };
    const requestTimeoutId = setTimeout(
      () => controller.abort(),
      timeoutMS ?? REQUEST_TIMEOUT_MS,
    );
    fetchEventSource(chatPath, {
      fetch: tauriFetch as any,
      ...chatPayload,
      async onopen(res) {
        clearTimeout(requestTimeoutId);
        const contentType = res.headers.get("content-type");
        console.log("[Request] response content type: ", contentType);
        responseRes = res;

        if (contentType?.startsWith("text/plain")) {
          responseText = await res.clone().text();
          return finish();
        }

        if (
          !res.ok ||
          !res.headers
            .get("content-type")
            ?.startsWith(EventStreamContentType) ||
          res.status !== 200
        ) {
          const responseTexts = [responseText];
          let extraInfo = await res.clone().text();
          try {
            const resJson = await res.clone().json();
            extraInfo = prettyObject(resJson);
          } catch {}

          if (res.status === 401) {
            responseTexts.push(Locale.Error.Unauthorized);
          }

          if (extraInfo) {
            responseTexts.push(extraInfo);
          }

          responseText = responseTexts.join("\n\n");

          return finish();
        }
      },
      onmessage(msg) {
        if (msg.data === "[DONE]" || finished) {
          return finish();
        }
        const text = msg.data;
        if (!text || text.trim().length === 0) return;

        const toolsBefore = runTools.length;
        try {
          const chunk = parseSSE(text, runTools);
          // 同一轮内又解析到工具调用 → 之前那点可见正文只是“我去搜一下”式前言，
          // 必须解除冻结，否则整个搜索阶段计时又会静止
          if (runTools.length > toolsBefore) startClock();
          if (!chunk) return;

          let blockContent = chunk.content || "";
          let blockReasoning = chunk.reasoning || "";

          // 1. Handle native reasoning (if provider supports it)
          if (blockReasoning) {
            // 整个助手回合共用一条时间线：首个思考 token 时启动读秒，
            // 工具/搜索耗时计入，后续轮次不再清零，避免每轮思考跳变
            startClock();
            remainReasoning += blockReasoning;
          }

          // 2. Handle legacy <think> tags in content field
          // Only process if native reasoning is not already present in the chunk
          if (!chunk.reasoning && !chunk.isThinking && blockContent) {
            // Check for START tag
            if (!lastIsThinkingTagged && blockContent.includes("<think>")) {
              const startIdx = blockContent.indexOf("<think>");
              const before = blockContent.slice(0, startIdx);
              const after = blockContent.slice(startIdx + 7);

              if (before) remainText += before;
              lastIsThinkingTagged = true;
              blockContent = after;
              startClock(); // 只记第一次开始，见 native reasoning 注释
            }

            // Check for END tag if we are currently inside one
            if (lastIsThinkingTagged) {
              if (blockContent.includes("</think>")) {
                const endIdx = blockContent.indexOf("</think>");
                const inside = blockContent.slice(0, endIdx);
                const after = blockContent.slice(endIdx + 8);

                remainReasoning += inside;
                lastIsThinkingTagged = false;
                blockContent = after; // Continue processing what's left
              } else {
                remainReasoning += blockContent;
                blockContent = ""; // All consumed as reasoning
              }
            }
          }

          // 3. Handle remaining content (or native field transition)
          if (blockContent) {
            // 注意：很多模型在发工具调用前会先吐一段纯空白（如 "\n\n\n"）。
            // 这类空白不算进入正文，否则会被误判成“开始作答”而提前冻结计时。
            if (blockContent.trim().length > 0) {
              // 可见正文 = 思考结束、进入作答，计时到此冻结
              pauseClock();
            }
            remainText += blockContent;
          }
        } catch (e) {
          console.error("[Request] parse error", text, msg, e);
        }
      },
      onclose() {
        finish();
      },
      onerror(e) {
        // 出错也要停表，否则 interval 会一直空转
        stopClock();
        options?.onError?.(e);
        throw e;
      },
      openWhenHidden: true,
    });
  }
  console.debug("[ChatAPI] start");
  chatApi(chatPath, headers, requestPayload, tools); // call fetchEventSource
}
