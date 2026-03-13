import React, { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import styles from "./audio-bar.module.scss";

interface AudioBarProps {
  audioUrl: string;
  duration?: number;
  onDownload?: () => void;
  onSpeedChange?: (speed: number) => void;
  className?: string;
}

export function AudioBar({
  audioUrl,
  duration = 0,
  onDownload,
  onSpeedChange,
  className,
}: AudioBarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 格式化时间为 0:00/0:10 格式
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 播放/暂停控制
  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener("timeupdate", () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
      });
      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });
      audioRef.current.addEventListener("loadedmetadata", () => {
        if (audioRef.current) {
          // 如果没有提供 duration，从音频文件中获取
          if (duration === 0) {
            duration = audioRef.current.duration;
          }
        }
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((error) => {
        console.error("播放音频失败:", error);
      });
    }
    setIsPlaying(!isPlaying);
  };

  // 进度条变化
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // 语速调节
  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
    if (onSpeedChange) {
      onSpeedChange(newSpeed);
    }
  };

  // 下载音频
  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // 默认下载方法
      const link = document.createElement("a");
      link.href = audioUrl;
      link.download = "audio.mp3";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // 清理音频对象
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={clsx(styles["audio-bar"], className)}>
      {/* 播放按钮 */}
      <button
        className={styles["play-button"]}
        onClick={togglePlay}
        title={isPlaying ? "暂停" : "播放"}
      >
        {isPlaying ? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      {/* 时长显示 */}
      <div className={styles["time-display"]}>
        <span>{formatTime(currentTime)}</span>
        <span className={styles["separator"]}>/</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* 进度条 */}
      <input
        type="range"
        min="0"
        max={duration || 100}
        value={currentTime}
        onChange={handleProgressChange}
        className={styles["progress-bar"]}
      />

      {/* 菜单按钮 */}
      <div className={styles["menu-container"]}>
        <button
          className={styles["menu-button"]}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          title="更多选项"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>

        {/* 菜单内容 */}
        {isMenuOpen && (
          <div className={styles["menu-content"]}>
            {/* 语速调节 */}
            <div className={styles["menu-section"]}>
              <div className={styles["menu-label"]}>语速</div>
              <div className={styles["speed-options"]}>
                {[0.5, 1, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    className={clsx(styles["speed-option"], {
                      [styles["selected"]]: speed === s,
                    })}
                    onClick={() => handleSpeedChange(s)}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* 下载按钮 */}
            <button className={styles["menu-item"]} onClick={handleDownload}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              下载音频
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
