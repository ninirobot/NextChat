import { ApiPath, Google } from "@/app/constant";
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
  usePluginStore,
  ChatMessageTool,
} from "@/app/store";
import { stream, streamWithThink } from "@/app/utils/chat";
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
      content || //getTextFromParts(res?.at(0)?.candidates?.at(0)?.content?.parts) ||
      res?.error?.message ||
      ""
    );
  }
  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions): Promise<void> {
    const apiClient = this;
    let multimodal = false;

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
          multimodal = true;
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
    for (let i = 0; i < messages.length - 1;) {
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
    // if (visionModel && messages.length > 1) {
    //   options.onError?.(new Error("Multiturn chat is not enabled for models/gemini-pro-vision"));
    // }

    const accessStore = useAccessStore.getState();

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };
    const requestPayload = {
      contents: messages,
      generationConfig: {
        // stopSequences: [
        //   "Title"
        // ],
        temperature: modelConfig.temperature,
        maxOutputTokens: modelConfig.max_tokens,
        topP: modelConfig.top_p,
        // Thinking Configuration for Gemini 2.5 and 3
        ...(((modelConfig.model.includes("gemini-2.5") ||
          modelConfig.model.includes("gemini-3")) &&
          // Only add thinkingConfig if at least one thinking feature is enabled:
          // - include_thoughts is true
          // - thinking_budget is set (for 2.5)
          // - thinking_level is set (for 3)
          // budget > 0 means specific.
          // budget = 0 means disabled (for 2.5 Flash).
          // We should always send it if the feature is relevant to the model.
          (modelConfig.include_thoughts ||
            modelConfig.gemini_thinking_budget !== undefined ||
            modelConfig.thinking_level !== undefined))
          ? {
            thinkingConfig: {
              includeThoughts: modelConfig.include_thoughts,
              // Thinking Level for Gemini 3
              ...(modelConfig.model.includes("gemini-3") &&
                modelConfig.thinking_level
                ? {
                  thinkingLevel: modelConfig.thinking_level,
                }
                : {}),
              // Thinking Budget for Gemini 2.5
              ...(modelConfig.model.includes("gemini-2.5") &&
                modelConfig.gemini_thinking_budget !== -1
                ? {
                  thinkingBudget: (() => {
                    const isFlashModel =
                      modelConfig.model.includes("gemini") &&
                      modelConfig.model.includes("flash");
                    const isProModel =
                      modelConfig.model.includes("gemini") &&
                      modelConfig.model.includes("pro");
                    let budget = modelConfig.gemini_thinking_budget;

                    // Flash models: max 24576
                    if (isFlashModel) {
                      budget = Math.min(budget, 24576);
                    }
                    // Pro models: min 128, max 32768
                    else if (isProModel) {
                      budget = Math.max(128, Math.min(budget, 32768));
                    }

                    return budget;
                  })(),
                }
                : {}),
            },
          }
          : {}),
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: accessStore.googleSafetySettings,
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: accessStore.googleSafetySettings,
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
        headers: getHeaders(),
      };

      const isThinking =
        modelConfig.model.includes("gemini-2.5") ||
        modelConfig.model.includes("gemini-3") ||
        options.config.model.includes("-thinking");

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream) {
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        return streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          // @ts-ignore
          tools.length > 0
            ? // @ts-ignore
            [{ functionDeclarations: tools.map((tool) => tool.function) }]
            : [],
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const chunkJson = JSON.parse(text);

            const functionCall = chunkJson?.candidates
              ?.at(0)
              ?.content.parts.at(0)?.functionCall;
            if (functionCall) {
              const { name, args } = functionCall;
              runTools.push({
                id: nanoid(),
                type: "function",
                function: {
                  name,
                  arguments: JSON.stringify(args), // utils.chat call function, using JSON.parse
                },
              });
            }
            const parts = chunkJson?.candidates?.at(0)?.content.parts || [];
            let reasoning = "";
            let content = "";
            for (const part of parts) {
              // DEBUG: Log the part to see if thought property exists
              console.log("[Google] Part:", JSON.stringify(part));
              if (part.thought) {
                reasoning += part.text;
              } else {
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
                  }),
                ),
              },
              // @ts-ignore
              ...toolCallResult.map((result) => ({
                role: "function",
                parts: [
                  {
                    functionResponse: {
                      name: result.name,
                      response: {
                        name: result.name,
                        content: result.content, // TODO just text content...
                      },
                    },
                  },
                ],
              })),
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
