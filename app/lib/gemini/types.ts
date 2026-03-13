/**
 * Gemini Live - Core Types
 * 精简后的类型定义，仅保留必要类型
 */

import { GeminiLiveClient, ConnectionStatus } from "./client";

// Re-export for convenience
export type { GeminiLiveClient, ConnectionStatus };

// Configuration types aligned with store/config.ts
export interface GeminiLiveConfig {
  apiKey: string;
  model: string;
  voice: string;
  temperature: number;
  speed: number;
  // Thinking configuration
  thinkingBudget?: number; // -1 = disabled, 0+ = budget in tokens
  includeThoughts?: boolean;
}

// Media stream types
export type StreamType = "webcam" | "screen";

export interface MediaStreamState {
  type: StreamType;
  stream: MediaStream | null;
  isStreaming: boolean;
  start: () => Promise<MediaStream>;
  stop: () => void;
}

// Hook return type
export interface UseGeminiLiveReturn {
  // Connection state
  status: ConnectionStatus;
  isConnected: boolean;
  error: string | null;

  // Audio state
  isRecording: boolean;
  isMuted: boolean;
  inputVolume: number;

  // Transcriptions
  inputTranscription: string;
  outputTranscription: string;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  sendVideoFrame: (canvas: HTMLCanvasElement) => void;
  sendText: (text: string) => void;
}

// Hook 配置选项
export interface UseGeminiLiveOptions {
  onAudioData?: (data: Uint8Array, duration: number, text: string) => void; // AI 回复音频（带文本）
  onUserAudioData?: (data: Uint8Array, duration: number, text: string) => void; // 用户语音
  onTurnComplete?: () => void; // AI 回合结束
}

// Constants
export const DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export const VOICES = [
  { id: "Zephyr", desc: "Bright" },
  { id: "Puck", desc: "Upbeat" },
  { id: "Charon", desc: "Informative" },
  { id: "Kore", desc: "Firm" },
  { id: "Fenrir", desc: "Excitable" },
  { id: "Leda", desc: "Youthful" },
  { id: "Orus", desc: "Corporate" },
  { id: "Aoede", desc: "Breezy" },
  { id: "Callirrhoe", desc: "Casual" },
  { id: "Autonoe", desc: "Bright" },
  { id: "Enceladus", desc: "Breathy" },
  { id: "Iapetus", desc: "Clear" },
  { id: "Umbriel", desc: "Easy-going" },
  { id: "Algieba", desc: "Smooth" },
  { id: "Despina", desc: "Smooth" },
  { id: "Erinome", desc: "Clear" },
  { id: "Algenib", desc: "Gravelly" },
  { id: "Rasalgethi", desc: "Informative" },
  { id: "Laomedeia", desc: "Upbeat" },
  { id: "Achernar", desc: "Soft" },
  { id: "Alnilam", desc: "Firm" },
  { id: "Schedar", desc: "Even" },
  { id: "Gacrux", desc: "Mature" },
  { id: "Pulcherrima", desc: "Forward" },
  { id: "Achird", desc: "Friendly" },
  { id: "Zubenelgenubi", desc: "Casual" },
  { id: "Vindemiatrix", desc: "Gentle" },
  { id: "Sadachbia", desc: "Lively" },
  { id: "Sadaltager", desc: "Knowledgeable" },
  { id: "Sulafat", desc: "High-pitched" },
] as const;

export type VoiceName = (typeof VOICES)[number]["id"];

// Default config aligned with store/config.ts
export const DEFAULT_GEMINI_LIVE_CONFIG: GeminiLiveConfig = {
  apiKey: "",
  model: DEFAULT_MODEL,
  voice: "Kore",
  temperature: 0.9,
  speed: 1.0,
};

// -------------------------------------------------------
// 7.2 补充 SDK 尚未导出的类型，消除各文件中的 as any
// -------------------------------------------------------

/** Modality 枚举（SDK web 包未导出，在此补充） */
export enum Modality {
  MODALITY_UNSPECIFIED = "MODALITY_UNSPECIFIED",
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
}

/** ThinkingConfig 接口（SDK web 包未导出，在此补充） */
export interface ThinkingConfig {
  includeThoughts?: boolean;
  thinkingBudget?: number;
}
