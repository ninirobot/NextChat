"use strict";
import {
  ApiPath,
  NVIDIA_BASE_URL,
  Nvidia,
  getNvidiaModelConfig,
} from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
} from "@/app/store";

import { ChatOptions, getHeaders, LLMApi, LLMModel, LLMUsage } from "../api";
import { getClientConfig } from "@/app/config/client";
import { fetch } from "@/app/utils/stream";
import { preProcessImageContent, streamWithThink } from "@/app/utils/chat";
import { webSearchTools } from "@/app/websearch/tools";
import { getTimeoutMSByModel } from "@/app/utils";
import { RequestPayload } from "./openai";

export class NvidiaApi implements LLMApi {
  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.nvidiaUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      baseUrl = isApp ? NVIDIA_BASE_URL : ApiPath.Nvidia;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Nvidia)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  async extractMessage(res: any) {
    const msg = res.choices?.at(0)?.message;
    if (!msg) return "";
    if (msg.content) return msg.content;
    if (msg.reasoning_content) return msg.reasoning_content;
    return "";
  }

  async speech(options: any): Promise<ArrayBuffer> {
    throw Error("Speech not supported by Nvidia");
  }

  async chat(options: ChatOptions): Promise<void> {
    const messages: RequestPayload["messages"] = [];
    for (const v of options.messages) {
      const content = await preProcessImageContent(v.content);
      messages.push({ role: v.role, content });
    }

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    const enableThinking = options.config.enable_thinking ?? true;

    const requestPayload: any = {
      messages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
    };

    const modelFeatures = getNvidiaModelConfig(modelConfig.model);
    if (modelFeatures.maxTokens) {
      requestPayload.max_tokens =
        modelConfig.max_tokens || modelFeatures.maxTokens;
    }
    if (modelFeatures.temperature != null) {
      requestPayload.temperature = modelFeatures.temperature;
    }

    // Thinking logic driven by the per-model capability table (NVIDIA_MODEL_CONFIG)
    const thinking = modelFeatures.thinking;
    if (thinking) {
      if (thinking.mechanism === "reasoning_effort") {
        requestPayload.reasoning_effort = enableThinking
          ? (modelConfig.reasoning_effort ?? thinking.default)
          : (thinking.disabled ?? thinking.default);
      } else if (thinking.mechanism === "chat_template_kwargs") {
        const effort = enableThinking
          ? (modelConfig.reasoning_effort ?? thinking.default)
          : (thinking.disabled ?? thinking.default);
        requestPayload.chat_template_kwargs = {
          thinking: enableThinking,
          enable_thinking: enableThinking,
          reasoning_effort: effort,
        };
        requestPayload.reasoning_effort = effort;
      } else if (thinking.mechanism === "thinking_mode") {
        requestPayload.chat_template_kwargs = {
          thinking_mode: enableThinking
            ? (modelConfig.thinking_mode ?? thinking.default)
            : "disabled",
        };
      }
    } else if (enableThinking) {
      // Models not listed in the table fall back to the generic Nvidia behavior
      requestPayload.chat_template_kwargs = {
        thinking: true,
        enable_thinking: true,
      };
    }

    console.log("[Request] nvidia payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const chatPath = this.path(Nvidia.ChatPath);

      if (shouldStream) {
        let index = -1;
        const { tools, funcs } = webSearchTools(controller);

        streamWithThink(
          chatPath,
          requestPayload,
          getHeaders(),
          tools as any,
          funcs,
          controller,
          (text: string, runTools: ChatMessageTool[]) => {
            let json;
            try {
              json = JSON.parse(text);
            } catch (e) {
              console.error("[Nvidia] Parse error", text, e);
              return { isThinking: false, content: "" };
            }

            const choices = json.choices as Array<any>;
            if (!choices?.length) return { isThinking: false, content: "" };

            const delta = choices[0]?.delta;
            if (!delta) return { isThinking: false, content: "" };

            const tool_calls = delta.tool_calls;
            if (tool_calls?.length > 0) {
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                index += 1;
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }

            const reasoning =
              delta.reasoning_content ??
              delta.reasoning ??
              delta.thinking ??
              null;
            const content = delta.content ?? null;

            return {
              reasoning: reasoning || undefined,
              content: content || undefined,
            };
          },
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // reset index value
            index = -1;
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
          getTimeoutMSByModel(modelConfig.model),
        );
      } else {
        const chatPayload = {
          method: "POST",
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
          headers: getHeaders(),
        };

        const requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(modelConfig.model),
        );

        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        if (!res.ok) {
          const errorText = await res.text();
          console.error("[Nvidia] HTTP error", res.status, errorText);
          options.onError?.(
            new Error(`NVIDIA API error ${res.status}: ${errorText}`),
          );
          return;
        }

        const resJson = await res.json();
        const message = await this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    return {
      used: 0,
      total: 0,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}
