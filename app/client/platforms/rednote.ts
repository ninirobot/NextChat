"use client";
// Rednote (小红书) is OpenAI-compatible, using the same models logic as deepseek.
import { ApiPath, REDNOTE_BASE_URL, Rednote } from "@/app/constant";
import { useAccessStore, useAppConfig, useChatStore } from "@/app/store";
import {
  appendToolMessages,
  parseOpenAIThinkSSE,
  streamWithThink,
} from "@/app/utils/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  SpeechOptions,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  getTimeoutMSByModel,
} from "@/app/utils";
import { RequestPayload } from "./openai";
import { fetch } from "@/app/utils/stream";

export class RednoteApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.rednoteUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = ApiPath.Rednote;
      baseUrl = isApp ? REDNOTE_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Rednote)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    const reasoning = res.choices?.[0]?.message?.reasoning_content;
    const content = res.choices?.[0]?.message?.content ?? "";
    if (reasoning) {
      return `<think>\n${reasoning}\n</think>\n${content}`;
    }
    return content;
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions) {
    const messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      if (v.role === "assistant") {
        const content = getMessageTextContentWithoutThinking(v);
        messages.push({ role: v.role, content });
      } else {
        const content = getMessageTextContent(v);
        messages.push({ role: v.role, content });
      }
    }

    // 检测并修复消息顺序，确保除system外的第一个消息是user
    const filteredMessages: ChatOptions["messages"] = [];
    let hasFoundFirstUser = false;

    for (const msg of messages) {
      if (msg.role === "system") {
        filteredMessages.push(msg);
      } else if (msg.role === "user") {
        filteredMessages.push(msg);
        hasFoundFirstUser = true;
      } else if (hasFoundFirstUser) {
        filteredMessages.push(msg);
      }
    }

    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
        providerName: options.config.providerName,
      },
    };

    const requestPayload: RequestPayload = {
      messages: filteredMessages,
      stream: options.config.stream,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      presence_penalty: modelConfig.presence_penalty,
      frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p,
      // 深度思考默认开启，可通过开关关闭
      chat_template_kwargs: {
        enable_thinking: modelConfig.enable_thinking ?? true,
      },
    };

    console.log("[Request] rednote payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    const headers = getHeaders();

    try {
      const chatPath = this.path(Rednote.ChatPath);
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers,
      };

      if (shouldStream) {
        const tools: any[] = [];
        return streamWithThink(
          chatPath,
          requestPayload,
          headers,
          tools,
          {},
          controller,
          parseOpenAIThinkSSE,
          appendToolMessages,
          options,
        );
      } else {
        const requestTimeoutId = setTimeout(
          () => controller.abort(),
          getTimeoutMSByModel(options.config.model),
        );
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
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
    };
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}
