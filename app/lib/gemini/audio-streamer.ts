/**
 * Audio Streamer
 * 播放 Gemini 返回的 PCM 24kHz 音频流
 * 阶段四优化：Int16Array 替代 DataView 解码、背压队列限制
 */

// 背压限制：超过此缓冲时长（秒）时丢弃最旧帧，防止 OOM
const MAX_BUFFER_SECONDS = 5;

export class AudioStreamer {
  private sampleRate: number = 24000;
  private bufferSize: number = 7680;
  private audioQueue: Float32Array[] = [];
  private isPlaying: boolean = false;
  private scheduledTime: number = 0;
  private isStreamComplete: boolean = false;
  private nextBufferTimeoutId: number | null = null;
  private gainNode: GainNode;
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null;
  private initialBufferTime: number = 0.1; // 100ms 初始缓冲
  private playbackRate: number = 1.0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  public onComplete = () => {};

  constructor(private context: AudioContext) {
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  /**
   * 4.1 PCM16 → Float32 解码优化
   * 使用 Int16Array 直接进行类型化数组视图映射，
   * 避免逐字节 DataView.getInt16()，提升处理速度 10~100 倍。
   *
   * 注意：Gemini 返回数据已是小端序，Int16Array 默认也是小端序，可以直接映射。
   * 若 chunk 的 byteOffset 不为 0（例如是 slice 出来的子视图），需先拷贝。
   */
  private processPCM16Chunk(chunk: Uint8Array): Float32Array {
    // 防御性处理：Int16Array 要求 byteLength 必须是 2 的倍数
    const validByteLength = Math.floor(chunk.byteLength / 2) * 2;
    if (validByteLength === 0) return new Float32Array(0);

    // 确保底层 ArrayBuffer 对齐（byteOffset 可能不为 0）
    const alignedBuffer =
      chunk.byteOffset === 0 && validByteLength === chunk.buffer.byteLength
        ? chunk.buffer
        : chunk.buffer.slice(
            chunk.byteOffset,
            chunk.byteOffset + validByteLength,
          );

    const int16 = new Int16Array(alignedBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    return float32;
  }

  /**
   * 4.2 计算当前队列缓冲时长（秒）
   */
  private getQueuedDurationSeconds(): number {
    const totalSamples = this.audioQueue.reduce(
      (sum, buf) => sum + buf.length,
      0,
    );
    return totalSamples / this.sampleRate;
  }

  addPCM16(chunk: Uint8Array): void {
    // 重置流完成标志
    this.isStreamComplete = false;

    // 4.2 背压保护：若缓冲超限，丢弃最旧帧，避免 OOM
    const maxSamples = MAX_BUFFER_SECONDS * this.sampleRate;
    while (
      this.audioQueue.length > 0 &&
      this.getQueuedDurationSeconds() > MAX_BUFFER_SECONDS
    ) {
      this.audioQueue.shift();
      console.warn("[AudioStreamer] 背压保护：丢弃最旧音频帧，当前队列过长");
    }

    // 处理 PCM16 数据（优化后的解码）
    let processingBuffer = this.processPCM16Chunk(chunk);

    // 按 bufferSize 分割数据
    while (processingBuffer.length >= this.bufferSize) {
      this.audioQueue.push(processingBuffer.slice(0, this.bufferSize));
      processingBuffer = processingBuffer.slice(this.bufferSize);
    }

    // 添加剩余数据
    if (processingBuffer.length > 0) {
      this.audioQueue.push(processingBuffer);
    }

    // 开始播放
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.scheduledTime = this.context.currentTime + this.initialBufferTime;
    }

    // 每次流入新数据，主动调度下一批流数据进轨道
    this.scheduleNextBuffer();
  }

  private createAudioBuffer(audioData: Float32Array): AudioBuffer {
    const audioBuffer = this.context.createBuffer(
      1,
      audioData.length,
      this.sampleRate,
    );
    audioBuffer.getChannelData(0).set(audioData);
    return audioBuffer;
  }

  private scheduleNextBuffer(): void {
    const SCHEDULE_AHEAD_TIME = 0.2; // 200ms 预调度（官方参数）

    if (this.nextBufferTimeoutId !== null) {
      window.clearTimeout(this.nextBufferTimeoutId);
      this.nextBufferTimeoutId = null;
    }

    // 填补缝隙：如果之前的 scheduledTime 已经落后于当前时间太多（也就是缓冲饥饿了），
    // 强制将其同步到当前时间，避免过去的堆积以及瞬间播放导致堆栈重叠
    if (this.scheduledTime < this.context.currentTime) {
      this.scheduledTime = this.context.currentTime + 0.05; // 添加少量额外缓冲
    }

    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioData = this.audioQueue.shift()!;
      const audioBuffer = this.createAudioBuffer(audioData);
      const source = this.context.createBufferSource();

      if (this.audioQueue.length === 0) {
        if (this.endOfQueueAudioSource) {
          this.endOfQueueAudioSource.onended = null;
        }
        this.endOfQueueAudioSource = source;
      }

      source.buffer = audioBuffer;
      source.playbackRate.value = this.playbackRate;
      source.connect(this.gainNode);

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
        if (!this.audioQueue.length && this.endOfQueueAudioSource === source) {
          this.endOfQueueAudioSource = null;
          this.onComplete();
        }
      };

      source.start(this.scheduledTime);
      this.scheduledTime =
        this.scheduledTime + audioBuffer.duration / this.playbackRate;
    }

    // 调度下一次检查
    if (this.audioQueue.length > 0) {
      const nextCheckTime =
        (this.scheduledTime - this.context.currentTime) * 1000;
      this.nextBufferTimeoutId = window.setTimeout(
        () => this.scheduleNextBuffer(),
        Math.max(0, nextCheckTime - 50),
      );
    } else {
      if (this.isStreamComplete) {
        this.isPlaying = false;
      }
    }
  }

  stop(): void {
    this.isPlaying = false;
    this.isStreamComplete = true;
    this.audioQueue = [];
    this.scheduledTime = this.context.currentTime;
    this.endOfQueueAudioSource = null;

    this.activeSources.forEach((s: AudioBufferSourceNode) => {
      try {
        s.stop();
      } catch (e) {}
    });
    this.activeSources.clear();

    if (this.nextBufferTimeoutId !== null) {
      window.clearTimeout(this.nextBufferTimeoutId);
      this.nextBufferTimeoutId = null;
    }

    // 平滑淡出（官方做法）
    this.gainNode.gain.linearRampToValueAtTime(
      0,
      this.context.currentTime + 0.1,
    );

    // 200ms 后重置 gainNode
    setTimeout(() => {
      this.gainNode.disconnect();
      this.gainNode = this.context.createGain();
      this.gainNode.connect(this.context.destination);
    }, 200);
  }

  resume(): void {
    if (this.context.state === "suspended") {
      this.context.resume();
    }
    this.isStreamComplete = false;
    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
  }

  complete(): void {
    this.isStreamComplete = true;
    this.onComplete();
  }

  setSpeed(speed: number): void {
    this.playbackRate = speed;
    this.activeSources.forEach((source) => {
      source.playbackRate.value = speed;
    });
  }
}
