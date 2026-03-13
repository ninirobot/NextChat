/**
 * useGeminiLive Hook
 * 管理 Gemini Live 连接和音频流
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveConnectConfig } from "@google/genai";
import { GeminiLiveClient, ConnectionStatus } from "../lib/gemini/client";
import { AudioRecorder } from "../lib/gemini/audio-recorder";
import { AudioStreamer } from "../lib/gemini/audio-streamer";
import { createAudioContext } from "../lib/gemini/utils";
import {
  GeminiLiveConfig,
  UseGeminiLiveReturn,
  UseGeminiLiveOptions,
  DEFAULT_MODEL,
  Modality,
  ThinkingConfig,
} from "../lib/gemini/types";

// 音频数据收集器（支持不同采样率）
class AudioDataCollector {
  private chunks: Uint8Array[] = [];
  private duration: number = 0;

  constructor(private defaultSampleRate: number = 24000) {}

  addChunk(data: Uint8Array, sampleRate?: number) {
    const rate = sampleRate || this.defaultSampleRate;
    this.chunks.push(new Uint8Array(data));
    // 计算时长：PCM16 = 2 bytes per sample
    const samples = data.length / 2;
    this.duration += samples / rate;
  }

  getData(): Uint8Array {
    const totalLength = this.chunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0,
    );
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  getDuration(): number {
    return Math.round(this.duration * 10) / 10; // 保留1位小数
  }

  clear() {
    this.chunks = [];
    this.duration = 0;
  }
}

export function useGeminiLive(
  config: GeminiLiveConfig,
  options?: UseGeminiLiveOptions,
): UseGeminiLiveReturn {
  const [state, setState] = useState({
    status: "disconnected" as ConnectionStatus,
    isRecording: false,
    isMuted: false,
    inputVolume: 0,
    inputTranscription: "",
    outputTranscription: "",
    error: null as string | null,
  });

  const clientRef = useRef<GeminiLiveClient | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioCollectorRef = useRef<AudioDataCollector | null>(null);
  const userAudioCollectorRef = useRef<AudioDataCollector | null>(null);

  // 状态更新节流 Refs
  const pendingTranscriptionsRef = useRef({ input: "", output: "" });
  const rafIdRef = useRef<number | null>(null);

  // 使用 ref 存储回调，避免在 connect 闭包中使用过期回调
  const callbacksRef = useRef(options);
  // 每次 options 变化时同步更新 ref（不触发重渲染）
  useEffect(() => {
    callbacksRef.current = options;
  });

  const isConnected = state.status === "connected";

  // Initialize audio context for playback (24kHz)
  const getAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = await createAudioContext({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  }, []);

  const connect = useCallback(async () => {
    if (!config.apiKey) {
      setState((prev) => ({ ...prev, error: "请输入 API Key" }));
      return;
    }

    setState((prev) => ({ ...prev, status: "connecting", error: null }));

    try {
      // Create audio context for playback
      const audioCtx = await getAudioContext();
      streamerRef.current = new AudioStreamer(audioCtx);

      // 初始化音频收集器
      audioCollectorRef.current = new AudioDataCollector(24000);
      userAudioCollectorRef.current = new AudioDataCollector(16000);

      // Create client with all callbacks
      const client = new GeminiLiveClient({
        apiKey: config.apiKey,
        callbacks: {
          onAudio: (data) => {
            // Play received audio
            streamerRef.current?.addPCM16(new Uint8Array(data));
            // Collect audio data for saving
            audioCollectorRef.current?.addChunk(new Uint8Array(data));
          },
          onTranscription: (text, type) => {
            const key =
              type === "input" ? "inputTranscription" : "outputTranscription";
            const prevText = pendingTranscriptionsRef.current[type];
            const isNewContent = text && text !== prevText && text.length > 0;

            // 更新挂起的转录文本
            if (isNewContent) {
              pendingTranscriptionsRef.current[type] = text;
            }

            // 总是触发业务回调（由调用方决定是否渲染）
            if (isNewContent) {
              if (type === "input" && options?.onUserAudioData) {
                // 用户转录：只要有音频数据就保存，不再限制条件
                const userAudioData = userAudioCollectorRef.current?.getData();
                const userDuration =
                  userAudioCollectorRef.current?.getDuration() || 0;

                if (userAudioData && userAudioData.length > 0) {
                  options.onUserAudioData(userAudioData, userDuration, text);
                  userAudioCollectorRef.current?.clear();
                } else {
                  options.onUserAudioData(new Uint8Array(), 0, text);
                }
              }

              if (type === "output" && options?.onAudioData) {
                // AI 转录：获取增量音频并清空收集器，对外始终推送 chunk
                const audioData = audioCollectorRef.current?.getData();
                const duration = audioCollectorRef.current?.getDuration() || 0;

                options.onAudioData(
                  audioData && audioData.length > 0
                    ? audioData
                    : new Uint8Array(),
                  duration,
                  text,
                );

                audioCollectorRef.current?.clear();
              }
            }

            // RAF 节流组件内部 setState 渲染
            if (!rafIdRef.current && isNewContent) {
              rafIdRef.current = requestAnimationFrame(() => {
                setState((prev) => ({
                  ...prev,
                  inputTranscription: pendingTranscriptionsRef.current.input,
                  outputTranscription: pendingTranscriptionsRef.current.output,
                }));
                rafIdRef.current = null;
              });
            }
          },
          onTurnComplete: () => {
            options?.onTurnComplete?.();
          },
          onStatusChange: (status) => {
            setState((prev) => ({ ...prev, status }));
          },
          onError: (error) => {
            setState((prev) => ({
              ...prev,
              error: error.message,
              status: "error",
            }));
          },
          onInterrupted: () => {
            // Stop audio playback when interrupted
            streamerRef.current?.stop();
            // 重置音频收集器
            audioCollectorRef.current?.clear();
          },
        },
      });

      const liveConfig: LiveConnectConfig = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: config.voice },
          },
        },
        temperature: config.temperature,
        outputAudioTranscription: {}, // 启用AI语音转文字
        inputAudioTranscription: {}, // 启用用户语音转文字
      };

      // Add thinking configuration if enabled
      if (
        config.includeThoughts &&
        config.thinkingBudget !== undefined &&
        config.thinkingBudget !== -1
      ) {
        (
          liveConfig as LiveConnectConfig & { thinkingConfig: ThinkingConfig }
        ).thinkingConfig = {
          includeThoughts: true,
          thinkingBudget: config.thinkingBudget,
        };
      }

      await client.connect(config.model || DEFAULT_MODEL, liveConfig);
      clientRef.current = client;

      // Start recording after successful connection
      recorderRef.current = new AudioRecorder(16000);
      recorderRef.current.on("data", (base64) => {
        if (!state.isMuted && clientRef.current?.isConnected) {
          clientRef.current.sendRealtimeInput([
            { mimeType: "audio/pcm;rate=16000", data: base64 },
          ]);

          // 收集用户音频数据（转换为 Uint8Array）
          try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            userAudioCollectorRef.current?.addChunk(bytes, 16000);
          } catch (e) {
            console.error("Failed to collect user audio:", e);
          }
        }
      });
      recorderRef.current.on("volume", (volume) => {
        setState((prev) => ({ ...prev, inputVolume: volume }));
      });

      await recorderRef.current.start();
      setState((prev) => ({ ...prev, isRecording: true }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "连接失败",
      }));
    }
  }, [config, getAudioContext, state.isMuted]);

  const disconnect = useCallback(() => {
    // 断开客户端连接
    clientRef.current?.disconnect();
    clientRef.current = null;

    // 停止麦克风录音（阶段四 AudioRecorder.stop() 已关闭 AudioContext 并释放 Blob URL）
    recorderRef.current?.stop();
    recorderRef.current = null;

    // 停止播放
    streamerRef.current?.stop();
    streamerRef.current = null;

    // 8.2 清空收集器中积压的 chunks（释放 ArrayBuffer / Uint8Array 内存）
    audioCollectorRef.current?.clear();
    audioCollectorRef.current = null;
    userAudioCollectorRef.current?.clear();
    userAudioCollectorRef.current = null;

    // 取消挂起的动画帧
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // 重置挂起转录
    pendingTranscriptionsRef.current = { input: "", output: "" };

    setState((prev) => ({
      ...prev,
      status: "disconnected",
      isRecording: false,
      isMuted: false,
      inputTranscription: "",
      outputTranscription: "",
      error: null,
    }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => {
      const isMuted = !prev.isMuted;
      if (isMuted) {
        recorderRef.current?.stop();
      } else {
        recorderRef.current?.start().catch(console.error);
      }
      return { ...prev, isMuted, isRecording: !isMuted };
    });
  }, []);

  const sendVideoFrame = useCallback((canvas: HTMLCanvasElement) => {
    if (!clientRef.current?.isConnected) return;

    try {
      const base64 = canvas.toDataURL("image/jpeg", 0.8);
      const data = base64.split(",")[1];
      if (data) {
        clientRef.current.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
    } catch (error) {
      console.error("Failed to send video frame:", error);
    }
  }, []);

  const sendText = useCallback(
    (text: string) => {
      if (isConnected) {
        clientRef.current?.sendText(text, true);
      }
    },
    [isConnected],
  );

  // 8.1 组件卸载时彻底清理：断连、关闭 AudioContext、释放所有 ref
  useEffect(() => {
    return () => {
      disconnect();

      // 8.1 关闭播放用 AudioContext（录音 AudioContext 已由 AudioRecorder.stop() 处理）
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          /* 忽略已关闭时的错误 */
        });
        audioContextRef.current = null;
      }
    };
  }, [disconnect]);

  return {
    ...state,
    isConnected,
    connect,
    disconnect,
    toggleMute,
    sendVideoFrame,
    sendText,
  };
}
