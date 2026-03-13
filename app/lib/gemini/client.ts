/**
 * Gemini Live Client
 * 精简的 WebSocket 客户端，使用回调替代 EventEmitter
 * 阶段三优化：连接清理、指数退避重连、ToolCall 预留接口
 */

import {
  GoogleGenAI,
  LiveCallbacks,
  LiveConnectConfig,
  LiveServerMessage,
  Session,
  Transcription,
  Content,
  GroundingMetadata,
} from "@google/genai";
import { base64ToArrayBuffer } from "./utils";

/**
 * 内联扩展的 LiveServerContent 接口
 * SDK web 包未导出 turnComplete / inputTranscription 等字段，在此补充。
 */
interface LiveServerContent {
  modelTurn?: Content;
  turnComplete?: boolean;
  interrupted?: boolean;
  generationComplete?: boolean;
  groundingMetadata?: GroundingMetadata;
  inputTranscription?: Transcription;
  outputTranscription?: Transcription;
  waitingForInput?: boolean;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface GeminiClientCallbacks {
  onAudio?: (data: ArrayBuffer) => void;
  onTranscription?: (text: string, type: "input" | "output") => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onError?: (error: Error) => void;
  onContent?: (content: unknown) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onToolCall?: (toolCall: unknown) => void; // 预留 ToolCall 扩展接口
}

export interface GeminiClientOptions {
  apiKey: string;
  callbacks: GeminiClientCallbacks;
  /** 最大重连次数，默认 3 次；设为 0 则不重连 */
  maxReconnectAttempts?: number;
}

// 重连配置
const RECONNECT_BASE_DELAY_MS = 1000; // 初始等待 1s
const RECONNECT_MAX_DELAY_MS = 30000; // 上限 30s
const RECONNECT_MULTIPLIER = 2; // 每次翻倍

export class GeminiLiveClient {
  private client: GoogleGenAI;
  private session: Session | null = null;
  private status: ConnectionStatus = "disconnected";

  // 重连相关状态
  private reconnectAttempts: number = 0;
  private reconnectTimerId: ReturnType<typeof setTimeout> | null = null;
  private lastConnectArgs: { model: string; config: LiveConnectConfig } | null =
    null;
  private isManualDisconnect: boolean = false;

  constructor(private options: GeminiClientOptions) {
    this.client = new GoogleGenAI({ apiKey: options.apiKey });
  }

  get isConnected(): boolean {
    return this.status === "connected";
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.options.callbacks.onStatusChange?.(status);
  }

  /** 清理现有 Session 而不触发状态回调（用于重连前的静默清理） */
  private cleanupSession(): void {
    try {
      this.session?.close();
    } catch {
      // 忽略关闭时的错误
    }
    this.session = null;
  }

  /** 取消挂起的重连计时器 */
  private cancelReconnect(): void {
    if (this.reconnectTimerId !== null) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
  }

  /** 计算指数退避延迟（含随机 jitter 防止同时重连） */
  private getReconnectDelay(): number {
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS *
        Math.pow(RECONNECT_MULTIPLIER, this.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS,
    );
    // 添加不超过 20% 的随机 jitter
    return delay + Math.random() * delay * 0.2;
  }

  /** 尝试自动重连 */
  private scheduleReconnect(): void {
    const maxAttempts = this.options.maxReconnectAttempts ?? 3;
    if (
      this.isManualDisconnect ||
      this.reconnectAttempts >= maxAttempts ||
      !this.lastConnectArgs
    ) {
      return;
    }

    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;

    console.warn(
      `[GeminiLiveClient] 将在 ${Math.round(delay / 1000)}s 后进行第 ${this.reconnectAttempts}/${maxAttempts} 次重连...`,
    );

    this.reconnectTimerId = setTimeout(async () => {
      this.reconnectTimerId = null;
      if (this.isManualDisconnect || !this.lastConnectArgs) return;

      try {
        await this.connectInternal(
          this.lastConnectArgs.model,
          this.lastConnectArgs.config,
        );
      } catch {
        // connectInternal 内部会处理错误并继续 schedule
      }
    }, delay);
  }

  /** 内部连接实现（供 connect 和重连复用） */
  private async connectInternal(
    model: string,
    config: LiveConnectConfig,
  ): Promise<void> {
    this.setStatus("connecting");

    try {
      const callbacks: LiveCallbacks = {
        onopen: () => {
          this.reconnectAttempts = 0; // 连接成功后重置重连计数
          this.setStatus("connected");
        },
        onclose: () => {
          this.setStatus("disconnected");
          // 仅在非主动断开时尝试重连
          this.scheduleReconnect();
        },
        onerror: (e) => {
          this.options.callbacks.onError?.(new Error(e.message));
        },
        onmessage: (msg) => this.handleMessage(msg),
      };

      // 3.1 连接前先清理旧 Session，防止 WebSocket 实例叠加
      this.cleanupSession();
      this.session = await this.client.live.connect({
        model,
        config,
        callbacks,
      });
    } catch (error) {
      this.setStatus("error");
      this.options.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
      this.scheduleReconnect();
      throw error;
    }
  }

  async connect(model: string, config: LiveConnectConfig): Promise<void> {
    if (this.status === "connecting" || this.status === "connected") {
      return;
    }

    // 重置状态
    this.isManualDisconnect = false;
    this.reconnectAttempts = 0;
    this.cancelReconnect();
    this.lastConnectArgs = { model, config };

    await this.connectInternal(model, config);
  }

  disconnect(): void {
    // 标记为主动断开，阻止自动重连
    this.isManualDisconnect = true;
    this.cancelReconnect();
    this.cleanupSession();
    this.lastConnectArgs = null;
    this.reconnectAttempts = 0;
    this.setStatus("disconnected");
  }

  sendRealtimeInput(chunks: Array<{ mimeType: string; data: string }>): void {
    for (const chunk of chunks) {
      this.session?.sendRealtimeInput({ media: chunk });
    }
  }

  sendText(text: string, turnComplete = true): void {
    this.session?.sendClientContent({
      turns: [{ text }],
      turnComplete,
    });
  }

  sendAudioStreamEnd(): void {
    this.session?.sendRealtimeInput({});
  }

  private handleMessage(message: LiveServerMessage): void {
    const { serverContent, setupComplete, toolCall, toolCallCancellation } =
      message;

    // Handle setup complete
    if (setupComplete) return;

    // 3.3 ToolCall 预留接口 - 不再直接丢弃，转发给上层处理
    if (toolCall) {
      this.options.callbacks.onToolCall?.(toolCall);
      return;
    }
    if (toolCallCancellation) return;

    // Handle server content
    if (!serverContent) {
      return;
    }

    const {
      modelTurn,
      inputTranscription,
      outputTranscription,
      interrupted,
      turnComplete,
    } = serverContent as LiveServerContent;

    // Handle interruption - 通知回调停止音频播放
    if (interrupted) {
      this.options.callbacks.onInterrupted?.();
      return;
    }

    // Handle turn complete
    if (turnComplete) {
      this.options.callbacks.onTurnComplete?.();
    }

    // Handle audio and text content
    if (modelTurn?.parts) {
      for (const part of modelTurn.parts) {
        // Audio data
        if (
          part.inlineData?.mimeType?.startsWith("audio/pcm") &&
          part.inlineData.data
        ) {
          const data = base64ToArrayBuffer(part.inlineData.data);
          this.options.callbacks.onAudio?.(data);
        }
        // Text content - 也触发转录回调以便创建消息
        if (part.text) {
          this.options.callbacks.onContent?.({ text: part.text });
          this.options.callbacks.onTranscription?.(part.text, "output");
        }
      }
    }

    // Handle transcriptions
    // inputTranscription 和 outputTranscription 是对象 {text: "..."}
    if (inputTranscription) {
      const tx = inputTranscription as Transcription;
      const text = tx.text || "";
      if (text) this.options.callbacks.onTranscription?.(text, "input");
    }

    if (outputTranscription) {
      const tx = outputTranscription as Transcription;
      const text = tx.text || "";
      if (text) this.options.callbacks.onTranscription?.(text, "output");
    }
  }
}
