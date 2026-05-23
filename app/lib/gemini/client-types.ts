/**
 * Gemini Live Client 扩展类型
 * 对 SDK 已有类型进行类型级扩展，消除 as any
 */

import type { Content, Transcription, GroundingMetadata } from "@google/genai";

/**
 * 扩展的 LiveServerContent 接口
 * SDK 的 LiveServerContent 缺少 turnComplete / inputTranscription /
 * outputTranscription 字段的类型声明，在此补充。
 */
export interface LiveServerContent {
  modelTurn?: Content;
  turnComplete?: boolean;
  interrupted?: boolean;
  generationComplete?: boolean;
  groundingMetadata?: GroundingMetadata;
  inputTranscription?: Transcription;
  outputTranscription?: Transcription;
  waitingForInput?: boolean;
}
