type TTSPlayer = {
  init: () => void;
  play: (
    audioBuffer: ArrayBuffer,
    onended: () => void | null,
    playbackRate?: number,
  ) => Promise<void>;
  stop: () => void;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
};

export function createTTSPlayer(): TTSPlayer {
  let audioContext: AudioContext | null = null;
  let audioBufferSourceNode: AudioBufferSourceNode | null = null;
  let playbackRate: number = 1.0;

  const init = () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.suspend();
  };

  const play = async (
    audioBuffer: ArrayBuffer,
    onended: () => void | null,
    rate: number = 1.0,
  ) => {
    if (audioBufferSourceNode) {
      audioBufferSourceNode.stop();
      audioBufferSourceNode.disconnect();
    }

    playbackRate = Math.max(0.1, Math.min(5.0, rate)); // 限制语速范围

    const buffer = await audioContext!.decodeAudioData(audioBuffer);
    audioBufferSourceNode = audioContext!.createBufferSource();
    audioBufferSourceNode.buffer = buffer;
    audioBufferSourceNode.connect(audioContext!.destination);
    audioBufferSourceNode.playbackRate.value = playbackRate; // 应用语速
    audioContext!.resume().then(() => {
      audioBufferSourceNode!.start();
    });
    audioBufferSourceNode.onended = onended;
  };

  const stop = () => {
    if (audioBufferSourceNode) {
      audioBufferSourceNode.stop();
      audioBufferSourceNode.disconnect();
      audioBufferSourceNode = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
  };

  const setPlaybackRate = (rate: number) => {
    playbackRate = Math.max(0.1, Math.min(5.0, rate));
    if (audioBufferSourceNode) {
      audioBufferSourceNode.playbackRate.value = playbackRate;
    }
  };

  const getPlaybackRate = () => {
    return playbackRate;
  };

  return { init, play, stop, setPlaybackRate, getPlaybackRate };
}
