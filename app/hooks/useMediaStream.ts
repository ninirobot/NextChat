/**
 * Media Stream Hook
 * 合并 useWebcam 和 useScreenCapture，消除重复代码
 */

import { useState, useEffect, useCallback } from "react";
import { StreamType, MediaStreamState } from "../lib/gemini/types";

export function useMediaStream(type: StreamType): MediaStreamState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Handle stream ended event
  useEffect(() => {
    if (!stream) return;

    const handleStreamEnded = () => {
      setIsStreaming(false);
      setStream(null);
    };

    const tracks = stream.getTracks();
    tracks.forEach((track) =>
      track.addEventListener("ended", handleStreamEnded),
    );

    return () => {
      tracks.forEach((track) =>
        track.removeEventListener("ended", handleStreamEnded),
      );
    };
  }, [stream]);

  const start = useCallback(async (): Promise<MediaStream> => {
    try {
      let mediaStream: MediaStream;

      if (type === "webcam") {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });
      } else {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor" },
          audio: false,
        });

        // Handle browser stop sharing button
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            setIsStreaming(false);
            setStream(null);
          };
        }
      }

      setStream(mediaStream);
      setIsStreaming(true);
      return mediaStream;
    } catch (error) {
      console.error(`Failed to start ${type}:`, error);
      throw error;
    }
  }, [type]);

  const stop = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsStreaming(false);
    }
  }, [stream]);

  return { type, stream, isStreaming, start, stop };
}
