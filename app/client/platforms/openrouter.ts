"use client";
import {
    ApiPath,
    OPENROUTER_BASE_URL,
    OpenRouter,
    ServiceProvider,
} from "@/app/constant";
import {
    useAccessStore,
    useAppConfig,
    useChatStore,
    ChatMessageTool,
    usePluginStore,
} from "@/app/store";
import { streamWithThink, preProcessImageContent } from "@/app/utils/chat";
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

export class OpenRouterApi implements LLMApi {
    path(path: string): string {
        const accessStore = useAccessStore.getState();

        let baseUrl = "";

        if (accessStore.useCustomConfig) {
            baseUrl = accessStore.openRouterUrl;
        }

        if (baseUrl.length === 0) {
            const isApp = !!getClientConfig()?.isApp;
            const apiPath = ApiPath.OpenRouter;
            baseUrl = isApp ? OPENROUTER_BASE_URL : apiPath;
        }

        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.slice(0, baseUrl.length - 1);
        }
        if (
            !baseUrl.startsWith("http") &&
            !baseUrl.startsWith(ApiPath.OpenRouter)
        ) {
            baseUrl = "https://" + baseUrl;
        }

        console.log("[Proxy Endpoint] ", baseUrl, path);

        return [baseUrl, path].join("/");
    }

    async extractMessage(res: any) {
        const reasoning = res.choices?.at(0)?.message?.reasoning;
        const content = res.choices?.at(0)?.message?.content ?? "";

        // Handle image generation response
        const images = res.choices?.at(0)?.message?.images;
        if (images && Array.isArray(images) && images.length > 0) {
            const imageMarkdown = images.map((img: any) => `![image](${img.image_url.url})`).join("\n");
            return [content, imageMarkdown].filter(Boolean).join("\n\n");
        }

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
            const content = await preProcessImageContent(v.content);
            messages.push({ role: v.role, content });
        }

        const modelConfig = {
            ...useAppConfig.getState().modelConfig,
            ...useChatStore.getState().currentSession().mask.modelConfig,
            ...{
                model: options.config.model,
                providerName: options.config.providerName,
            },
        };

        const requestPayload: any = {
            messages,
            stream: options.config.stream,
            model: modelConfig.model,
            temperature: modelConfig.temperature,
            presence_penalty: modelConfig.presence_penalty,
            frequency_penalty: modelConfig.frequency_penalty,
            top_p: modelConfig.top_p,
        };

        // If model name suggests image generation, or if user explicitly wants it
        // Some OpenRouter models require 'modalities' for image generation
        if (modelConfig.model.includes("flux") || modelConfig.model.includes("image")) {
            requestPayload.modalities = ["image", "text"];
            if (modelConfig.aspect_ratio) {
                requestPayload.image_config = {
                    aspect_ratio: modelConfig.aspect_ratio,
                };
            }
        }

        console.log("[Request] openrouter payload: ", requestPayload);

        const shouldStream = !!options.config.stream;
        const controller = new AbortController();
        options.onController?.(controller);

        try {
            const chatPath = this.path(OpenRouter.ChatPath);
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
                        const choices = json.choices as Array<{
                            delta: {
                                content: string | null;
                                tool_calls: ChatMessageTool[];
                                reasoning_content: string | null;
                                reasoning: string | null;
                                images?: Array<{ image_url: { url: string } }>;
                            };
                        }>;

                        if (!choices?.length) return { isThinking: false, content: "" };

                        const tool_calls = choices[0]?.delta?.tool_calls;
                        if (tool_calls?.length > 0) {
                            const index = tool_calls[0]?.index;
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

                        const reasoning =
                            choices[0]?.delta?.reasoning_content ??
                            choices[0]?.delta?.reasoning;
                        let content = choices[0]?.delta?.content || "";

                        // Handle streaming images
                        const images = choices[0]?.delta?.images;
                        if (images && Array.isArray(images) && images.length > 0) {
                            const imageMarkdown = images.map((img: any) => `![image](${img.image_url.url})`).join("\n");
                            content += (content ? "\n\n" : "") + imageMarkdown;
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
        };
    }

    async models(): Promise<LLMModel[]> {
        return [];
    }
}
