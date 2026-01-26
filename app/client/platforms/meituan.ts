"use client";
import { ApiPath, MEITUAN_BASE_URL, Meituan, ServiceProvider } from "@/app/constant";
import {
    useAccessStore,
    useAppConfig,
    useChatStore,
    ChatMessageTool,
    usePluginStore,
} from "@/app/store";
import { streamWithThink } from "@/app/utils/chat";
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

export class MeituanApi implements LLMApi {
    private disableListModels = true;

    path(path: string): string {
        const accessStore = useAccessStore.getState();

        let baseUrl = "";

        if (accessStore.useCustomConfig) {
            baseUrl = accessStore.meituanUrl;
        }

        if (baseUrl.length === 0) {
            const isApp = !!getClientConfig()?.isApp;
            const apiPath = ApiPath.Meituan;
            baseUrl = isApp ? MEITUAN_BASE_URL : apiPath;
        }

        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, baseUrl.length - 1);
        }
        if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Meituan)) {
            baseUrl = "https://" + baseUrl;
        }

        console.log("[Proxy Endpoint] ", baseUrl, path);

        return [baseUrl, path].join("/");
    }

    extractMessage(res: any) {
        const reasoning = res.choices?.at(0)?.message?.reasoning_content;
        const content = res.choices?.at(0)?.message?.content ?? "";
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

        const modelConfig = {
            ...useAppConfig.getState().modelConfig,
            ...useChatStore.getState().currentSession().mask.modelConfig,
            ...{
                model: options.config.model,
                providerName: options.config.providerName,
            },
        };

        const isThinkingModel = modelConfig.model.toLowerCase().includes("thinking");

        const requestPayload: any = {
            messages,
            stream: options.config.stream,
            model: modelConfig.model,
            temperature: modelConfig.temperature,
            presence_penalty: modelConfig.presence_penalty,
            frequency_penalty: modelConfig.frequency_penalty,
            top_p: modelConfig.top_p,
        };

        if (isThinkingModel) {
            requestPayload.enable_thinking = true;
            requestPayload.thinking_budget = options.config.thinking_budget || 1024;
        }

        const modelName = modelConfig.model.toLowerCase();
        const maxLimit = modelName.includes("2601") || !modelName.includes("flash") ? 262144 : 131072;

        if (options.config.max_tokens) {
            requestPayload.max_tokens = Math.min(options.config.max_tokens, maxLimit);
        }

        // Adjust for reasoning overhead if necessary, but keep within limits
        if (isThinkingModel && requestPayload.max_tokens <= requestPayload.thinking_budget) {
            requestPayload.max_tokens = Math.min(requestPayload.thinking_budget + 2048, maxLimit);
        }

        console.log("[Request] longcat payload: ", requestPayload);

        const shouldStream = !!options.config.stream;
        const controller = new AbortController();
        options.onController?.(controller);

        try {
            const chatPath = this.path(Meituan.ChatPath);
            const chatPayload = {
                method: "POST",
                body: JSON.stringify(requestPayload),
                signal: controller.signal,
                headers: getHeaders(),
            };

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
                    tools as any,
                    funcs,
                    controller,
                    // parseSSE
                    (text: string, runTools: ChatMessageTool[]) => {
                        const json = JSON.parse(text);
                        if (json.error) {
                            return {
                                isThinking: false,
                                content: `\n\n> [!ERROR]\n> ${json.error.message || json.error.code || "Unknown Error"}`,
                            };
                        }
                        const choices = (json.choices || []) as Array<{
                            delta: {
                                content: string | null;
                                tool_calls: ChatMessageTool[];
                                reasoning_content: string | null;
                            };
                        }>;
                        const tool_calls = choices[0]?.delta?.tool_calls;
                        if (tool_calls?.length > 0) {
                            const index = tool_calls[0]?.index as number;
                            const id = tool_calls[0]?.id;
                            const args = tool_calls[0]?.function?.arguments;
                            if (id) {
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

                        let reasoning = "";
                        let content = "";

                        for (const choice of choices) {
                            if (choice.delta?.reasoning_content) {
                                reasoning += choice.delta.reasoning_content;
                            }
                            if (choice.delta?.content) {
                                content += choice.delta.content;
                            }
                        }

                        return {
                            reasoning: reasoning || undefined,
                            content: content || undefined,
                        };
                    },
                    // processToolMessage
                    (
                        requestPayload: RequestPayload,
                        toolCallMessage: any,
                        toolCallResult: any[],
                    ) => {
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
