"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import styles from "./audio-player.module.scss";

interface AudioPlayerProps {
  audioData?: Uint8Array;
  duration?: number; // 秒
  className?: string;
  onDownload?: () => void; // 下载回调
  onSpeedChange?: (speed: number) => void; // 语速调节回调
  defaultSpeed?: number; // 默认语速
  sampleRate?: number; // 采样率：16000 或 24000
}

// 将 PCM16 数据转换为 WAV Blob URL
function pcm16ToWavBlobUrl(
  pcmData: Uint8Array,
  sampleRate: number = 24000,
): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write PCM data
  const dataView = new Uint8Array(buffer, 44);
  dataView.set(pcmData);

  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// 格式化时间显示 0:00
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  audioData,
  duration = 0,
  className,
  onDownload,
  onSpeedChange,
  defaultSpeed = 1.0,
  sampleRate = 24000,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(defaultSpeed);
  const [showMenu, setShowMenu] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 使用 useMemo 缓存音频 URL，避免无限重新渲染
  const audioUrl = useMemo(() => {
    if (audioData && audioData.length > 0) {
      return pcm16ToWavBlobUrl(audioData, sampleRate);
    }
    return null;
  }, [audioData, sampleRate]);

  // 清理 URL
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 处理语速调节
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    onSpeedChange?.(speed);
    setShowMenu(false);
  };

  // 处理下载
  const handleDownload = () => {
    if (audioUrl) {
      const link = document.createElement("a");
      link.href = audioUrl;
      link.download = `audio-${Date.now()}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    onDownload?.();
    setShowMenu(false);
  };

  // 播放/暂停切换
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }, [isPlaying]);

  // 进度条点击跳转
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || !progressRef.current || !duration) return;

      const rect = progressRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newTime = percentage * duration;

      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration],
  );

  if (!audioData || audioData.length === 0) {
    return null;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`${styles["audio-player"]} ${className || ""}`}>
      <audio
        ref={audioRef}
        src={audioUrl || ""}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />

      {/* 播放/暂停按钮 */}
      <button
        className={styles["play-button"]}
        onClick={togglePlay}
        aria-label={isPlaying ? "暂停" : "播放"}
      >
        {isPlaying ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* 进度条 */}
      <div
        className={styles["progress-container"]}
        ref={progressRef}
        onClick={handleProgressClick}
      >
        <div className={styles["progress-bar"]}>
          <div
            className={styles["progress-fill"]}
            style={{ width: `${progress}%` }}
          />
          <div
            className={styles["progress-handle"]}
            style={{ left: `${progress}%` }}
          />
        </div>
      </div>

      {/* 时间显示 */}
      <div className={styles["time-display"]}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>

      {/* 更多选项按钮 */}
      <div className={styles["menu-container"]} ref={menuRef}>
        <button
          className={styles["more-button"]}
          aria-label="更多选项"
          onClick={() => setShowMenu(!showMenu)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="18" r="2" />
          </svg>
        </button>

        {/* 下拉菜单 */}
        {showMenu && (
          <div className={styles["menu-dropdown"]}>
            <div className={styles["menu-item"]} onClick={handleDownload}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>下载语音</span>
            </div>
            <div className={styles["menu-divider"]} />
            <div className={styles["menu-label"]}>播放语速</div>
            <div className={styles["speed-options"]}>
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                <button
                  key={speed}
                  className={`${styles["speed-btn"]} ${playbackSpeed === speed ? styles["active"] : ""}`}
                  onClick={() => handleSpeedChange(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
