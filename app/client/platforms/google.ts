import { ApiPath, Google, ServiceProvider } from "@/app/constant";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  SpeechOptions,
} from "../api";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
} from "@/app/store";
import { streamWithThink } from "@/app/utils/chat";
import { getClientConfig } from "@/app/config/client";
import { GEMINI_BASE_URL } from "@/app/constant";
import { nanoid } from "nanoid";

import {
  getMessageTextContent,
  getMessageImages,
  isVisionModel,
  getTimeoutMSByModel,
} from "@/app/utils";
import { preProcessImageContent } from "@/app/utils/chat";
import { webSearchTools } from "@/app/websearch/tools";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

export class GeminiProApi implements LLMApi {
  path(path: string, shouldStream = false): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";
    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.googleUrl;
    }

    const isApp = !!getClientConfig()?.isApp;
    if (baseUrl.length === 0) {
      baseUrl = isApp ? GEMINI_BASE_URL : ApiPath.Google;
    }
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Google)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    let chatPath = [baseUrl, path].join("/");
    if (shouldStream) {
      chatPath += chatPath.includes("?") ? "&alt=sse" : "?alt=sse";
    }

    return chatPath;
  }
  extractMessage(res: any) {
    console.log("[Response] gemini-pro response: ", res);

    const getTextFromParts = (parts: any[]) => {
      if (!Array.isArray(parts)) return "";

      return parts
        .filter((part) => !part?.thought)
        .map((part) => part?.text || "")
        .filter((text) => text.trim() !== "")
        .join("\n\n");
    };

    let content = "";
    if (Array.isArray(res)) {
      res.map((item) => {
        content += getTextFromParts(item?.candidates?.at(0)?.content?.parts);
      });
    }

    return (
      getTextFromParts(res?.candidates?.at(0)?.content?.parts) ||
      content ||
      res?.error?.message ||
      ""
    );
  }
  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions): Promise<void> {
    const apiClient = this;

    // try get base64image from local cache image_url
    const _messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContent(v.content);
      _messages.push({ role: v.role, content });
    }
    const messages = _messages.map((v) => {
      let parts: any[] = [{ text: getMessageTextContent(v) }];
      if (isVisionModel(options.config.model)) {
        const images = getMessageImages(v);
        if (images.length > 0) {
          parts = parts.concat(
            images.map((image) => {
              const imageType = image.split(";")[0].split(":")[1];
              const imageData = image.split(",")[1];
              return {
                inline_data: {
                  mime_type: imageType,
                  data: imageData,
                },
              };
            }),
          );
        }
      }
      return {
        role: v.role.replace("assistant", "model").replace("system", "user"),
        parts: parts,
      };
    });

    // google requires that role in neighboring messages must not be the same
    for (let i = 0; i < messages.length - 1; ) {
      // Check if current and next item both have the role "model"
      if (messages[i].role === messages[i + 1].role) {
        // Concatenate the 'parts' of the current and next item
        messages[i].parts = messages[i].parts.concat(messages[i + 1].parts);
        // Remove the next item
        messages.splice(i + 1, 1);
      } else {
        // Move to the next item
        i++;
      }
    }

    const accessStore = useAccessStore.getState();

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
      // 允许单次请求覆盖思考参数（追问等旁路调用需固定为 minimal）
      ...(options.config.include_thoughts !== undefined
        ? { include_thoughts: options.config.include_thoughts }
        : {}),
      ...(options.config.thinking_level !== undefined
        ? { thinking_level: options.config.thinking_level }
        : {}),
    };
    const isFlashModel = modelConfig.model.includes("flash");
    const isProModel = modelConfig.model.includes("pro");

    // 1. Feature Detection
    const modelName = modelConfig.model.toLowerCase();
    const isGen3 =
      modelName.includes("gemini-3") || modelName.includes("gemini_3");
    const isGemma4 = modelName.includes("gemma-4");
    const isThinkingVersion =
      modelName.includes("thinking") || modelName.includes("2.5");

    // 2. Build Thinking Config (Structured and mutually exclusive)
    let thinkingConfig: any = undefined;
    if (modelConfig.include_thoughts) {
      thinkingConfig = { includeThoughts: true };

      if (isGen3 || isGemma4) {
        // Gemini 3 series / Gemma 4: Uses thinkingLevel
        thinkingConfig.thinkingLevel = modelConfig.thinking_level;
      } else if (isThinkingVersion) {
        // Gemini 2.x Thinking or 2.5: Uses thinkingBudget
        const budget = modelConfig.gemini_thinking_budget;
        if (budget && budget !== -1) {
          thinkingConfig.thinkingBudget = isFlashModel
            ? Math.min(budget, 24576)
            : Math.max(128, Math.min(budget, 32768));
        }
      }
    }

    const requestPayload = {
      contents: messages,
      generationConfig: {
        temperature: modelConfig.temperature,
        topP: modelConfig.top_p,
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    };

    let shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);
    try {
      // https://github.com/google-gemini/cookbook/blob/main/quickstarts/rest/Streaming_REST.ipynb
      const chatPath = this.path(
        Google.ChatPath(modelConfig.model),
        shouldStream,
      );

      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(false, ServiceProvider.Google),
      };

      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream) {
        const { tools, funcs } = webSearchTools(
          controller,
          ServiceProvider.Google,
        );
        // Gemini 会把 thought signature 放在 functionCall part 或紧随其后的
        // 独立空 part 里（流式），需要在同一轮里跨 chunk 缓存，供回写历史用。
        let pendingGoogleThoughtSignature:
          | { key: "thoughtSignature" | "thought_signature"; value: string }
          | undefined;
        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(false, ServiceProvider.Google),
          // @ts-ignore
          tools.length > 0 ? [{ functionDeclarations: tools }] : [],
          funcs,
          controller,
          (text: string, runTools: ChatMessageTool[]) => {
            const chunkJson = JSON.parse(text);

            // Gemini 的报错常以 200 + 流内 JSON 错误对象的形式返回（典型：
            // functionCall 缺 thought_signature 导致 400）。不处理的话解析不到
            // parts，整轮静默无输出，界面就表现为「一直加载、也不报错」。
            if (chunkJson?.error) {
              return {
                reasoning: undefined,
                content: `\n\n> [!ERROR]\n> ${chunkJson.error.message || chunkJson.error.status || "Unknown Error"}`,
              };
            }

            const parts = chunkJson?.candidates?.at(0)?.content?.parts || [];
            let reasoning = "";
            let content = "";

            for (const part of parts) {
              // Gemini 3：thought_signature 可能同 functionCall 一起返回，
              // 也可能在随后的独立空 part（仅 thoughtSignature）里返回。
              const hasCamel =
                typeof part?.thoughtSignature === "string" &&
                part.thoughtSignature.length > 0;
              const hasSnake =
                typeof part?.thought_signature === "string" &&
                part.thought_signature.length > 0;
              const sigKey: "thoughtSignature" | "thought_signature" | null =
                hasCamel
                  ? "thoughtSignature"
                  : hasSnake
                    ? "thought_signature"
                    : null;

              if (part?.functionCall) {
                const { name, args } = part.functionCall;
                runTools.push({
                  id: nanoid(),
                  type: "function",
                  function: {
                    name,
                    arguments: JSON.stringify(args),
                  },
                  // @ts-ignore 由 processToolMessage 原样回传
                  thought_signature: sigKey
                    ? part[sigKey]
                    : pendingGoogleThoughtSignature?.value,
                });
                pendingGoogleThoughtSignature = undefined;
              } else if (sigKey && !part?.text) {
                const sigValue = part[sigKey] as string;
                pendingGoogleThoughtSignature = {
                  key: sigKey,
                  value: sigValue,
                };
                // 流式场景常见顺序：先到 functionCall part，随后才补 thoughtSignature。
                // 把迟到的签名补挂到最近一个还没签名、且本次已收到的工具调用上。
                for (let i = runTools.length - 1; i >= 0; i -= 1) {
                  const t = runTools[i] as any;
                  if (t?.type === "function" && !t.thought_signature) {
                    t.thought_signature = sigValue;
                    pendingGoogleThoughtSignature = undefined;
                    break;
                  }
                }
              }

              if (part?.thought) {
                reasoning += part.text ?? "";
              } else if (part?.text) {
                content += part.text;
              }
            }
            return {
              reasoning: reasoning || undefined,
              content: content || undefined,
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // 注意：模型名只存在于 chatPath 里，requestPayload 没有 model 字段，
            // 必须用外层从 modelConfig 算好的 isGen3，否则这里永远是 false，
            // Gemini 3 会因缺少 thought_signature 直接 400。
            // @ts-ignore
            requestPayload?.contents?.splice(
              // @ts-ignore
              requestPayload?.contents?.length,
              0,
              {
                role: "model",
                parts: toolCallMessage.tool_calls.map(
                  (tool: ChatMessageTool) => ({
                    functionCall: {
                      name: tool?.function?.name,
                      args: JSON.parse(tool?.function?.arguments as string),
                    },
                    // Gemini 3 强制要求回传 functionCall 的 thought_signature
                    // （原样回传；key 固定用 snake_case，见 Google thought-signatures 文档）。
                    // 若本轮确未捕获到签名，用官方 dummy 值跳过校验，避免 400。
                    ...(tool?.thought_signature
                      ? { thought_signature: tool.thought_signature }
                      : isGen3
                        ? {
                            thought_signature:
                              "skip_thought_signature_validator",
                          }
                        : {}),
                  }),
                ),
              },
              // Gemini 不支持 "function" 角色：工具结果必须放在单个
              // "user" 角色 turn 内，用 functionResponse parts 承载。
              {
                role: "user",
                parts: toolCallResult.map((result) => ({
                  functionResponse: {
                    name: result.name,
                    response: {
                      name: result.name,
                      content: result.content,
                    },
                  },
                })),
              },
            );
          },
          options,
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);
        const resJson = await res.json();
        if (resJson?.promptFeedback?.blockReason) {
          // being blocked
          options.onError?.(
            new Error(
              "Message is being blocked for reason: " +
                resJson.promptFeedback.blockReason,
            ),
          );
        }
        const message = apiClient.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  usage(): Promise<LLMUsage> {
    throw new Error("Method not implemented.");
  }
  async models(): Promise<LLMModel[]> {
    return [];
  }
}
