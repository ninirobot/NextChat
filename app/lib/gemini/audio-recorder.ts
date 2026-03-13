/**
 * Audio Recorder
 * 录制麦克风音频并转换为 PCM 16kHz
 */

import {
  EventEmitter,
  createAudioContext,
  createWorkletFromSrc,
  arrayBufferToBase64,
} from "./utils";

// Audio Recording Worklet 代码
const AudioRecordingWorklet = `
class AudioRecordingWorklet extends AudioWorkletProcessor {
  buffer = new Int16Array(2048);
  bufferWriteIndex = 0;

  process(inputs, outputs, parameters) {
    if (inputs[0].length) {
      const channel0 = inputs[0][0];
      this.processChunk(channel0);
    }
    return true;
  }

  sendAndClearBuffer() {
    this.port.postMessage({
      event: "chunk",
      data: { int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer },
    });
    this.bufferWriteIndex = 0;
  }

  processChunk(float32Array) {
    for (let i = 0; i < float32Array.length; i++) {
      const int16Value = float32Array[i] * 32768;
      this.buffer[this.bufferWriteIndex++] = Math.max(-32768, Math.min(32767, int16Value));
      if (this.bufferWriteIndex >= this.buffer.length) {
        this.sendAndClearBuffer();
      }
    }
    if (this.bufferWriteIndex >= this.buffer.length) {
      this.sendAndClearBuffer();
    }
  }
}

registerProcessor("audio-recorder-worklet", AudioRecordingWorklet);
`;

// Volume Meter Worklet
const VolMeterWorklet = `
class VolMeterWorklet extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    if (inputs[0].length) {
      const input = inputs[0][0];
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += Math.abs(input[i]);
      }
      const volume = sum / input.length;
      this.port.postMessage({ volume });
    }
    return true;
  }
}

registerProcessor("vu-meter", VolMeterWorklet);
`;

export interface AudioRecorderEvents {
  data: (base64: string) => void;
  volume: (volume: number) => void;
  error: (error: Error) => void;
}

export class AudioRecorder extends EventEmitter<AudioRecorderEvents> {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  // 4.3 记录 Blob URL 以便 stop 时释放
  private workletBlobUrls: string[] = [];

  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000) {
    super();
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Could not request user media");
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        this.audioContext = await createAudioContext({
          sampleRate: this.sampleRate,
        });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = "audio-recorder-worklet";
        const src = createWorkletFromSrc(workletName, AudioRecordingWorklet);
        this.workletBlobUrls.push(src); // 4.3 记录 URL 以便释放

        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName,
        );

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          const arrayBuffer = ev.data.data?.int16arrayBuffer;

          if (arrayBuffer) {
            const base64 = arrayBufferToBase64(arrayBuffer);
            this.emit("data", base64);
          }
        };
        this.source.connect(this.recordingWorklet);

        // Volume meter worklet
        const vuWorkletName = "vu-meter";
        const vuSrc = createWorkletFromSrc(vuWorkletName, VolMeterWorklet);
        this.workletBlobUrls.push(vuSrc); // 4.3 记录 URL 以便释放
        await this.audioContext.audioWorklet.addModule(vuSrc);
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit("volume", ev.data.volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
        resolve();
      } catch (error) {
        reject(error);
      }
      this.starting = null;
    });

    return this.starting;
  }

  stop() {
    const handleStop = () => {
      // 断开节点
      this.source?.disconnect();
      this.recordingWorklet?.disconnect();
      this.vuWorklet?.disconnect();

      // 停止所有音轨
      this.stream?.getTracks().forEach((track) => track.stop());

      // 4.3 关闭 AudioContext，释放系统音频资源
      this.audioContext?.close().catch(() => {
        /* 忽略已关闭时的错误 */
      });

      // 4.3 释放 Worklet Blob URL，归还浏览器内存
      this.workletBlobUrls.forEach((url) => URL.revokeObjectURL(url));
      this.workletBlobUrls = [];

      this.stream = undefined;
      this.audioContext = undefined;
      this.source = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this.recording = false;
    };

    if (this.starting) {
      this.starting.then(handleStop);
      return;
    }

    handleStop();
  }

  isRecording(): boolean {
    return this.recording;
  }
}
