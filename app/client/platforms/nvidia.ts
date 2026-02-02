"use strict";
import {
    ApiPath,
    NVIDIA_BASE_URL,
    Nvidia,
} from "@/app/constant";
import {
    useAccessStore,
    useAppConfig,
    useChatStore,
    usePluginStore,
    ChatMessageTool,
} from "@/app/store";

import {
    ChatOptions,
    getHeaders,
    LLMApi,
    LLMModel,
    LLMUsage,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import { fetch } from "@/app/utils/stream";
import {
    preProcessImageContent,
    streamWithThink,
} from "@/app/utils/chat";
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
            baseUrl = isApp
                ? NVIDIA_BASE_URL
                : ApiPath.Nvidia;
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
        return res.choices?.at(0)?.message?.content ?? "";
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

        const isKimiK25 = modelConfig.model === "moonshotai/kimi-k2.5";
        const isGPTOSS120B = modelConfig.model === "openai/gpt-oss-120b";
        const enableThinking = options.config.enable_thinking ?? true;

        const requestPayload: any = {
            messages,
            stream: options.config.stream,
            model: modelConfig.model,
            temperature: isKimiK25 ? (enableThinking ? 1.0 : 0.6) : modelConfig.temperature,
            presence_penalty: isKimiK25 ? 0.0 : modelConfig.presence_penalty,
            frequency_penalty: isKimiK25 ? 0.0 : modelConfig.frequency_penalty,
            top_p: isKimiK25 ? 0.95 : modelConfig.top_p,
            max_tokens: isGPTOSS120B ? 131072 : (isKimiK25 ? 32768 : Math.max(modelConfig.max_tokens, 1024)),
        };

        // Add reasoning_effort for gpt-oss models
        if (modelConfig.model.includes("gpt-oss") && modelConfig.reasoning_effort) {
            requestPayload.reasoning_effort = modelConfig.reasoning_effort;
        }

        // Add thinking parameter for Kimi 2.5 models
        if (isKimiK25) {
            requestPayload.thinking = {
                type: enableThinking ? "enabled" : "disabled"
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
                const [tools, funcs] = usePluginStore
                    .getState()
                    .getAsTools(
                        useChatStore.getState().currentSession().mask?.plugin || [],
                    );

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

                        const choices = json.choices as Array<{
                            delta: {
                                content: string;
                                tool_calls: ChatMessageTool[];
                                reasoning_content: string | null;
                            };
                        }>;

                        if (!choices?.length) return { isThinking: false, content: "" };

                        const tool_calls = choices[0]?.delta?.tool_calls;
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

                        const reasoning = choices[0]?.delta?.reasoning_content;
                        const content = choices[0]?.delta?.content;

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
                    60000,
                );

                const res = await fetch(chatPath, chatPayload);
                clearTimeout(requestTimeoutId);

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
