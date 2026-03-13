"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useChatStore, useAppConfig, createMessage } from "../store";
import { Chat } from "./chat";
import { GeminiLiveConfig } from "../lib/gemini/types";
import { isLiveModel } from "../utils/model";
import { useGeminiLive } from "../hooks/useGeminiLive";
import { useMediaStream } from "../hooks/useMediaStream";
import { ServiceProvider } from "../constant";
import { showToast } from "./ui-lib";

// 辅助函数：合并 Uint8Array
function concatenateUint8Arrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

// Icons
const MicIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const MicOffIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const VideoIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const VideoOffIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const ScreenShareIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const ScreenShareOffIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const PlayIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PhoneOffIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);

/**
 * LiveChat - 实时语音聊天包装组件
 *
 * 复用常规聊天的 UI 框架，但：
 * 1. 强制使用 Live 模型
 * 2. 添加语音/摄像头/屏幕共享按钮
 * 3. 支持语音输入和输出
 * 4. 支持文字输入
 */
export function LiveChat() {
  const chatStore = useChatStore();
  const config = useAppConfig();
  const session = chatStore.currentSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 检查当前会话是否已设置为 Live 模式
  const isLiveSession = isLiveModel(session.mask.modelConfig.model);

  // 使用 ref 来跟踪模型是否已经被切换过
  const hasSwitchedToLiveRef = useRef(false);

  // 如果不是 Live 会话，自动切换到 Live 模型（只在首次进入时切换）
  useEffect(() => {
    if (!isLiveSession && !hasSwitchedToLiveRef.current) {
      hasSwitchedToLiveRef.current = true;
      const geminiConfig = config.geminiLiveConfig;
      const liveModel =
        geminiConfig?.model || "gemini-2.5-flash-native-audio-preview-12-2025";

      chatStore.updateTargetSession(session, (s) => {
        s.mask.modelConfig.model = liveModel;
        s.mask.modelConfig.providerName = ServiceProvider.Google;
      });

      showToast(`已切换到 ${liveModel}`);
    }
  }, [isLiveSession, session, chatStore, config]);

  // 使用 Mask 中的 Live 配置
  const liveConfig: GeminiLiveConfig = {
    apiKey: config.geminiLiveConfig?.apiKey || "",
    model: session.mask.modelConfig.model,
    voice:
      session.mask.liveConfig?.voice ||
      config.geminiLiveConfig?.voice ||
      "Kore",
    temperature: session.mask.modelConfig.temperature,
    speed:
      session.mask.liveConfig?.speed ?? config.geminiLiveConfig?.speed ?? 1.0,
    thinkingBudget:
      session.mask.liveConfig?.thinkingBudget ??
      config.geminiLiveConfig?.thinkingBudget ??
      -1,
    includeThoughts:
      session.mask.liveConfig?.includeThoughts ??
      config.geminiLiveConfig?.includeThoughts ??
      true,
  };

  const accumulatedOutputTextRef = useRef("");
  const accumulatedInputTextRef = useRef("");
  const accumulatedOutputAudioRef = useRef<Uint8Array | null>(null);
  const accumulatedInputAudioRef = useRef<Uint8Array | null>(null);

  // AI 回合结束标识
  const isAITurnCompleteRef = useRef(false);

  // AI 回合结束回调
  const handleTurnComplete = useCallback(() => {
    isAITurnCompleteRef.current = true;
  }, []);

  // 状态更新节流 Refs
  const pendingStoreUpdatesRef = useRef<((s: any) => void)[]>([]);
  const storeRafIdRef = useRef<number | null>(null);

  const flushStoreUpdates = useCallback(() => {
    if (pendingStoreUpdatesRef.current.length > 0) {
      chatStore.updateTargetSession(session, (s) => {
        pendingStoreUpdatesRef.current.forEach((updateFn) => updateFn(s));
      });
      pendingStoreUpdatesRef.current = [];
    }
    storeRafIdRef.current = null;
  }, [chatStore, session]);

  const scheduleStoreUpdate = useCallback(
    (updateFn: (s: any) => void) => {
      pendingStoreUpdatesRef.current.push(updateFn);
      if (!storeRafIdRef.current) {
        storeRafIdRef.current = requestAnimationFrame(flushStoreUpdates);
      }
    },
    [flushStoreUpdates],
  );

  // 音频数据处理回调（AI 回复）- 现在接收文本参数
  const handleAudioData = useCallback(
    (data: Uint8Array, duration: number, text: string) => {
      if (!text) return;

      scheduleStoreUpdate((s: any) => {
        // 查找最后一条消息
        const lastMessage = s.messages[s.messages.length - 1];

        // 简化判断：只要最后一条是 AI 消息且上回合未结束，就更新它
        const isUpdatingLastMessage =
          lastMessage &&
          lastMessage.role === "assistant" &&
          !isAITurnCompleteRef.current;

        if (isUpdatingLastMessage) {
          // 累积文本和音频
          accumulatedOutputTextRef.current += text;

          const hasNewAudio = data && data.length > 0;
          if (hasNewAudio) {
            if (accumulatedOutputAudioRef.current) {
              accumulatedOutputAudioRef.current = concatenateUint8Arrays(
                accumulatedOutputAudioRef.current,
                data,
              );
            } else {
              accumulatedOutputAudioRef.current = data;
            }
          }

          // 累积更新现有 AI 消息
          const updatedMessage = {
            ...lastMessage,
            content: accumulatedOutputTextRef.current,
            liveAudio: accumulatedOutputAudioRef.current
              ? {
                  data: accumulatedOutputAudioRef.current,
                  duration: (lastMessage.liveAudio?.duration || 0) + duration,
                  mimeType: "audio/pcm;rate=24000",
                }
              : lastMessage.liveAudio,
          };
          s.messages = [...s.messages.slice(0, -1), updatedMessage];
        } else {
          // 新的 AI 回复开始，先清空累积器，重置标识
          isAITurnCompleteRef.current = false;
          accumulatedOutputTextRef.current = text;
          accumulatedOutputAudioRef.current =
            data && data.length > 0 ? data : null;

          // 创建新 AI 消息
          const newMessage = createMessage({
            role: "assistant",
            content: accumulatedOutputTextRef.current,
            liveAudio: accumulatedOutputAudioRef.current
              ? {
                  data: accumulatedOutputAudioRef.current,
                  duration: duration,
                  mimeType: "audio/pcm;rate=24000",
                }
              : undefined,
          });
          s.messages = [...s.messages, newMessage];
        }
      });
    },
    [scheduleStoreUpdate],
  );

  // 用户音频处理回调
  const handleUserAudioData = useCallback(
    (data: Uint8Array, duration: number, text: string) => {
      if (!text) return;

      scheduleStoreUpdate((s: any) => {
        // 查找最近的用户消息索引
        const lastUserMessageIndex = [...s.messages]
          .reverse()
          .findIndex((m: any) => m.role === "user");

        if (lastUserMessageIndex >= 0) {
          // 找到用户消息，更新它
          const actualIndex = s.messages.length - 1 - lastUserMessageIndex;
          const lastUserMessage = s.messages[actualIndex];

          // 累积文本和音频
          accumulatedInputTextRef.current += text;

          const hasNewAudio = data && data.length > 0;
          if (hasNewAudio) {
            if (accumulatedInputAudioRef.current) {
              accumulatedInputAudioRef.current = concatenateUint8Arrays(
                accumulatedInputAudioRef.current,
                data,
              );
            } else {
              accumulatedInputAudioRef.current = data;
            }
          }

          const updatedMessage = {
            ...lastUserMessage,
            content: accumulatedInputTextRef.current,
            liveAudio: accumulatedInputAudioRef.current
              ? {
                  data: accumulatedInputAudioRef.current,
                  duration:
                    (lastUserMessage.liveAudio?.duration || 0) + duration,
                  mimeType: "audio/pcm;rate=16000",
                }
              : lastUserMessage.liveAudio,
          };

          // 创建新数组触发 React 重新渲染
          s.messages = [
            ...s.messages.slice(0, actualIndex),
            updatedMessage,
            ...s.messages.slice(actualIndex + 1),
          ];
        } else {
          // 新的用户输入开始，先清空累积器
          accumulatedInputTextRef.current = text;
          accumulatedInputAudioRef.current =
            data && data.length > 0 ? data : null;

          // 创建新用户消息
          const newMessage = createMessage({
            role: "user",
            content: accumulatedInputTextRef.current,
            liveAudio: accumulatedInputAudioRef.current
              ? {
                  data: accumulatedInputAudioRef.current,
                  duration: duration,
                  mimeType: "audio/pcm;rate=16000",
                }
              : undefined,
          });
          s.messages = [...s.messages, newMessage];
        }
      });
    },
    [scheduleStoreUpdate],
  );

  // 使用 Gemini Live hook
  const {
    status,
    isConnected,
    isRecording,
    isMuted,
    inputVolume,
    inputTranscription,
    outputTranscription,
    error,
    connect,
    disconnect,
    toggleMute,
    sendVideoFrame,
    sendText,
  } = useGeminiLive(liveConfig, {
    onAudioData: handleAudioData,
    onUserAudioData: handleUserAudioData,
    onTurnComplete: handleTurnComplete,
  });

  // 媒体流
  const webcam = useMediaStream("webcam");
  const screen = useMediaStream("screen");
  const activeStream = webcam.stream || screen.stream;

  // 视频元素同步
  useEffect(() => {
    if (videoRef.current && activeStream) {
      videoRef.current.srcObject = activeStream;
    }
  }, [activeStream]);

  // 5.1 视频帧差异检测：记录上一帧的像素均值，避免发送静止画面
  const lastFrameHashRef = useRef<number>(0);

  /**
   * 计算 Canvas 当前帧的像素均值（轻量指纹）
   * 只采样部分像素（每 4 个采样 1 个）以控制性能开销
   */
  const getFrameHash = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number): number => {
      const data = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      // 每隔 4 个像素采样一次（8 字节步长，RGB 不含 alpha）
      for (let i = 0; i < data.length; i += 32) {
        sum += data[i] + data[i + 1] + data[i + 2];
      }
      return sum;
    },
    [],
  );

  // 视频帧发送
  useEffect(() => {
    if (!isConnected || !activeStream) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) return;

      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 5.1 差异检测：仅当像素均值变化幅度 > 阈值时才发送
      const hash = getFrameHash(ctx, canvas.width, canvas.height);
      const CHANGE_THRESHOLD = canvas.width * canvas.height * 0.5; // 0.5 灰度变化阈值
      if (Math.abs(hash - lastFrameHashRef.current) < CHANGE_THRESHOLD) {
        return; // 画面几乎无变化，跳过
      }
      lastFrameHashRef.current = hash;

      try {
        const base64 = canvas.toDataURL("image/jpeg", 0.8);
        const data = base64.split(",")[1];
        if (data) {
          sendVideoFrame(canvas);
        }
      } catch (err) {
        console.error("Failed to send video frame:", err);
      }
    }, 500);

    return () => {
      clearInterval(interval);
      // 5.2 释放 Canvas 上下文像素缓冲区
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [isConnected, activeStream, sendVideoFrame]);

  // 切换摄像头
  const handleToggleWebcam = useCallback(async () => {
    if (webcam.isStreaming) {
      webcam.stop();
    } else {
      screen.stop();
      await webcam.start();
    }
  }, [webcam, screen]);

  // 切换屏幕分享
  const handleToggleScreen = useCallback(async () => {
    if (screen.isStreaming) {
      screen.stop();
    } else {
      webcam.stop();
      await screen.start();
    }
  }, [screen, webcam]);

  // 连接状态变化时显示提示
  useEffect(() => {
    if (error) {
      showToast(error);
    }
  }, [error]);

  const isConnecting = status === "connecting";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Live 状态栏 - 包含三个功能按钮 */}
      <LiveStatusBar
        isConnected={isConnected}
        isConnecting={isConnecting}
        isRecording={isRecording}
        isMuted={isMuted}
        inputVolume={inputVolume}
        webcamActive={webcam.isStreaming}
        screenActive={screen.isStreaming}
        onConnect={connect}
        onDisconnect={disconnect}
        onToggleMute={toggleMute}
        onToggleWebcam={handleToggleWebcam}
        onToggleScreen={handleToggleScreen}
      />

      {/* 视频预览窗口 */}
      {activeStream && (
        <DraggableVideoPreview
          stream={activeStream}
          videoRef={videoRef}
          onClose={() => {
            webcam.stop();
            screen.stop();
          }}
          type={webcam.isStreaming ? "camera" : "screen"}
        />
      )}

      {/* 隐藏的画布用于视频帧捕获 */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* 复用常规聊天 UI */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <Chat
          isLiveMode={true}
          onSendText={sendText}
          isLiveConnected={isConnected}
        />
      </div>
    </div>
  );
}

/**
 * Live 状态栏组件 - 包含连接状态、音量指示器和三个功能按钮
 */
function LiveStatusBar({
  isConnected,
  isConnecting,
  isRecording,
  isMuted,
  inputVolume,
  webcamActive,
  screenActive,
  onConnect,
  onDisconnect,
  onToggleMute,
  onToggleWebcam,
  onToggleScreen,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isRecording: boolean;
  isMuted: boolean;
  inputVolume: number;
  webcamActive: boolean;
  screenActive: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleMute: () => void;
  onToggleWebcam: () => void;
  onToggleScreen: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        background: "var(--second)",
        borderBottom: "1px solid var(--border-in-light)",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      {/* 左侧：连接状态和音量 */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* 连接状态 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "4px",
            background: isConnected
              ? "#10b981"
              : isConnecting
                ? "#f59e0b"
                : "#6b7280",
            color: "white",
            fontSize: "12px",
            fontWeight: 500,
          }}
        >
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "white",
              animation: isConnecting ? "pulse 1s infinite" : "none",
            }}
          />
          {isConnecting ? "连接中..." : isConnected ? "已连接" : "未连接"}
        </div>

        {/* 音量指示器 */}
        {isConnected && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--text)" }}>
              输入音量:
            </span>
            <div
              style={{
                width: "60px",
                height: "4px",
                background: "var(--border-in-light)",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, inputVolume * 500)}%`,
                  height: "100%",
                  background: "var(--primary)",
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 中间：三个 Live 功能按钮 */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* 麦克风按钮 */}
        <button
          onClick={onToggleMute}
          disabled={!isConnected}
          title={!isConnected ? "未连接" : isMuted ? "取消静音" : "静音"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "6px 12px",
            borderRadius: "6px",
            border: "none",
            background: !isConnected
              ? "#9ca3af" // 未连接：灰色
              : isMuted
                ? "#ef4444" // 已连接 + 静音：红色
                : "#10b981", // 已连接 + 录音中：绿色（同摄像头/屏幕 active）
            color: "white",
            cursor: isConnected ? "pointer" : "not-allowed",
            fontSize: "12px",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
        >
          {/* 未连接或静音都显示带斜线的图标，录音中显示正常麦克风 */}
          {!isConnected || isMuted ? <MicOffIcon /> : <MicIcon />}
          <span>{!isConnected ? "静音" : isMuted ? "静音" : "录音中"}</span>
        </button>

        {/* 摄像头按钮 */}
        <button
          onClick={onToggleWebcam}
          disabled={!isConnected}
          title={webcamActive ? "关闭摄像头" : "开启摄像头"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "6px 12px",
            borderRadius: "6px",
            border: "none",
            background: webcamActive
              ? "#10b981"
              : isConnected
                ? "var(--primary)"
                : "#9ca3af",
            color: "white",
            cursor: isConnected ? "pointer" : "not-allowed",
            fontSize: "12px",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
        >
          {webcamActive ? <VideoIcon /> : <VideoOffIcon />}
          <span>摄像头</span>
        </button>

        {/* 屏幕分享按钮 */}
        <button
          onClick={onToggleScreen}
          disabled={!isConnected}
          title={screenActive ? "停止分享" : "屏幕分享"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "6px 12px",
            borderRadius: "6px",
            border: "none",
            background: screenActive
              ? "#10b981"
              : isConnected
                ? "var(--primary)"
                : "#9ca3af",
            color: "white",
            cursor: isConnected ? "pointer" : "not-allowed",
            fontSize: "12px",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
        >
          {screenActive ? <ScreenShareIcon /> : <ScreenShareOffIcon />}
          <span>屏幕分享</span>
        </button>
      </div>

      {/* 右侧：连接/断开按钮 */}
      <button
        onClick={isConnected ? onDisconnect : onConnect}
        disabled={isConnecting}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 14px",
          borderRadius: "6px",
          border: "none",
          background: isConnected ? "#ef4444" : "#10b981",
          color: "white",
          cursor: isConnecting ? "not-allowed" : "pointer",
          fontSize: "12px",
          fontWeight: 500,
          opacity: isConnecting ? 0.7 : 1,
          transition: "all 0.2s",
        }}
      >
        {isConnected ? (
          <>
            <PhoneOffIcon />
            <span>断开连接</span>
          </>
        ) : isConnecting ? (
          <>
            <div
              style={{
                width: 16,
                height: 16,
                border: "2px solid white",
                borderTop: "2px solid transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <span>连接中...</span>
          </>
        ) : (
          <>
            <PlayIcon />
            <span>开始对话</span>
          </>
        )}
      </button>
    </div>
  );
}

/**
 * 可拖动视频预览组件
 */
function DraggableVideoPreview({
  stream,
  videoRef,
  onClose,
  type,
}: {
  stream: MediaStream;
  videoRef: React.RefObject<HTMLVideoElement>;
  onClose: () => void;
  type: "camera" | "screen";
}) {
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [size, setSize] = useState({ width: 320, height: 240 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, width: 320, height: 240 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 同步视频流
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, videoRef]);

  // 边界限制函数
  const clampPosition = (
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const padding = 10;
    const maxX = window.innerWidth - width - padding;
    const maxY = window.innerHeight - height - padding;
    return {
      x: Math.max(padding, Math.min(x, maxX)),
      y: Math.max(padding, Math.min(y, maxY)),
    };
  };

  // 拖动处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isResizing) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
      width: size.width,
      height: size.height,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStart.current.x;
        const newY = e.clientY - dragStart.current.y;
        const clamped = clampPosition(newX, newY, size.width, size.height);
        setPosition(clamped);
      } else if (isResizing) {
        const deltaX = e.clientX - dragStart.current.x;
        const deltaY = e.clientY - dragStart.current.y;

        // 计算新尺寸，保持宽高比
        const aspectRatio = dragStart.current.width / dragStart.current.height;
        let newWidth = dragStart.current.width + deltaX;
        let newHeight = newWidth / aspectRatio;

        // 限制最小和最大尺寸
        const minSize = 160;
        const maxSize = Math.min(
          window.innerWidth * 0.8,
          window.innerHeight * 0.8,
        );

        if (newWidth < minSize) {
          newWidth = minSize;
          newHeight = newWidth / aspectRatio;
        } else if (newWidth > maxSize) {
          newWidth = maxSize;
          newHeight = newWidth / aspectRatio;
        }

        setSize({ width: newWidth, height: newHeight });

        // 调整大小时也要检查边界
        const clamped = clampPosition(
          position.x,
          position.y,
          newWidth,
          newHeight,
        );
        if (clamped.x !== position.x || clamped.y !== position.y) {
          setPosition(clamped);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, position.x, position.y, size.width, size.height]);

  // 窗口大小改变时重新检查边界
  useEffect(() => {
    const handleResize = () => {
      const clamped = clampPosition(
        position.x,
        position.y,
        size.width,
        size.height,
      );
      setPosition(clamped);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position.x, position.y, size.width, size.height]);

  // 调整大小处理
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        background: "#000",
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        zIndex: 1000,
        cursor: isDragging ? "grabbing" : "grab",
        border: "2px solid var(--primary)",
      }}
    >
      {/* 标题栏 - 可拖动 */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "28px",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          zIndex: 10,
        }}
      >
        <span style={{ color: "white", fontSize: "12px", fontWeight: 500 }}>
          {type === "camera" ? "📹 摄像头" : "🖥️ 屏幕分享"}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "white",
            cursor: "pointer",
            fontSize: "16px",
            lineHeight: 1,
            padding: "2px 6px",
            borderRadius: "4px",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          ×
        </button>
      </div>

      {/* 视频元素 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* 调整大小手柄 */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: "20px",
          height: "20px",
          cursor: "se-resize",
          background:
            "linear-gradient(135deg, transparent 50%, var(--primary) 50%)",
          borderBottomRightRadius: "6px",
        }}
      />
    </div>
  );
}

/**
 * Live 转录显示组件
 */
function LiveTranscription({
  inputText,
  outputText,
}: {
  inputText: string;
  outputText: string;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--second)",
        borderTop: "1px solid var(--border-in-light)",
        maxHeight: "120px",
        overflowY: "auto",
      }}
    >
      {inputText && (
        <div style={{ marginBottom: "8px", display: "flex", gap: "8px" }}>
          <span
            style={{ fontWeight: 600, color: "var(--primary)", flexShrink: 0 }}
          >
            你:
          </span>
          <span style={{ color: "var(--text)" }}>{inputText}</span>
        </div>
      )}
      {outputText && (
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ fontWeight: 600, color: "#10b981", flexShrink: 0 }}>
            AI:
          </span>
          <span style={{ color: "var(--text)" }}>{outputText}</span>
        </div>
      )}
    </div>
  );
}
