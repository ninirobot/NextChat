import React from "react";
import { ServiceProvider } from "../constant";

import BotIconDefault from "../icons/llm-icons/default.svg";
import BotIconOpenAI from "../icons/llm-icons/openai.svg";
import BotIconGemini from "../icons/llm-icons/gemini.svg";
import BotIconGemma from "../icons/llm-icons/gemma.svg";
import BotIconClaude from "../icons/llm-icons/claude.svg";
import BotIconMeta from "../icons/llm-icons/meta.svg";
import BotIconMistral from "../icons/llm-icons/mistral.svg";
import BotIconDeepseek from "../icons/llm-icons/deepseek.svg";
import BotIconMoonshot from "../icons/llm-icons/moonshot.svg";
import BotIconQwen from "../icons/llm-icons/qwen.svg";
import BotIconWenxin from "../icons/llm-icons/wenxin.svg";
import BotIconGrok from "../icons/llm-icons/grok.svg";
import BotIconHunyuan from "../icons/llm-icons/hunyuan.svg";
import BotIconDoubao from "../icons/llm-icons/doubao.svg";
import BotIconChatglm from "../icons/llm-icons/chatglm.svg";
import BotIconLongcat from "../icons/llm-icons/longcat.svg";

export function getModelIcon(modelName?: string) {
  if (!modelName) return BotIconDefault;

  const name = modelName.toLowerCase();

  // OpenAI models
  if (
    name.startsWith("gpt") ||
    name.startsWith("chatgpt") ||
    name.startsWith("dall-e") ||
    name.startsWith("dalle") ||
    name.startsWith("o1") ||
    name.startsWith("o3")
  ) {
    return BotIconOpenAI;
  } else if (name.startsWith("gemini")) {
    // Google Gemini
    return BotIconGemini;
  } else if (name.startsWith("gemma")) {
    // Google Gemma
    return BotIconGemma;
  } else if (name.startsWith("claude")) {
    // Anthropic Claude
    return BotIconClaude;
  } else if (name.includes("llama")) {
    // Meta Llama
    return BotIconMeta;
  } else if (name.startsWith("mixtral") || name.startsWith("codestral")) {
    // Mistral
    return BotIconMistral;
  } else if (name.includes("deepseek")) {
    // DeepSeek
    return BotIconDeepseek;
  } else if (name.startsWith("moonshot") || name.startsWith("kimi")) {
    // Moonshot AI
    return BotIconMoonshot;
  } else if (name.startsWith("qwen")) {
    // Alibaba Qwen
    return BotIconQwen;
  } else if (name.startsWith("ernie") || name.startsWith("wenxin")) {
    // Baidu Ernie
    return BotIconWenxin;
  } else if (name.startsWith("grok")) {
    // xAI Grok
    return BotIconGrok;
  } else if (name.startsWith("hunyuan")) {
    // Tencent Hunyuan
    return BotIconHunyuan;
  } else if (name.startsWith("doubao") || name.startsWith("ep-")) {
    // ByteDance Doubao
    return BotIconDoubao;
  } else if (
    name.includes("glm") ||
    name.startsWith("cogview-") ||
    name.startsWith("cogvideox-")
  ) {
    // Zhipu AI
    return BotIconChatglm;
  } else if (name.includes("longcat")) {
    // LongCat
    return BotIconLongcat;
  }

  return BotIconDefault;
}

export function ProviderIcon(props: {
  provider?: ServiceProvider;
  model?: string;
  size?: number;
  className?: string;
}) {
  const LlmIcon = getModelIcon(props.model);
  const size = props.size ?? 16;

  return (
    <div
      className={props.className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <LlmIcon width={size} height={size} />
    </div>
  );
}
