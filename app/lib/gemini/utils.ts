/**
 * 工具函数
 */

// EventEmitter 类
export class EventEmitter<Events extends Record<string, any>> {
  private listeners: { [key: string]: Array<(...args: any[]) => void> } = {};

  on<K extends keyof Events>(event: K, listener: Events[K]): this {
    const eventName = String(event);
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(listener as (...args: any[]) => void);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): this {
    const eventName = String(event);
    const listeners = this.listeners[eventName];
    if (listeners) {
      const index = listeners.indexOf(listener as (...args: any[]) => void);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  emit<K extends keyof Events>(
    event: K,
    ...args: Parameters<Events[K]>
  ): boolean {
    const eventName = String(event);
    const listeners = this.listeners[eventName];
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (e) {
          console.error(e);
        }
      });
      return true;
    }
    return false;
  }

  removeAllListeners(event?: keyof Events): this {
    if (event) {
      delete this.listeners[String(event)];
    } else {
      this.listeners = {};
    }
    return this;
  }
}

// Base64 转换为 ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// ArrayBuffer 转换为 Base64
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 创建 AudioContext（处理浏览器自动播放策略）
export async function createAudioContext(
  options?: AudioContextOptions,
): Promise<AudioContext> {
  const didInteract = new Promise<void>((resolve) => {
    const handler = () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      resolve();
    };
    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
  });

  try {
    const audio = new Audio();
    audio.src =
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    await audio.play();
    return new AudioContext(options);
  } catch {
    await didInteract;
    return new AudioContext(options);
  }
}

// 创建 Worklet Blob URL
export function createWorkletFromSrc(
  workletName: string,
  workletSrc: string,
): string {
  const script = new Blob([workletSrc], { type: "application/javascript" });
  return URL.createObjectURL(script);
}

// Volume Meter Worklet 代码
export const VolMeterWorkletCode = `
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

registerProcessor("gemini-vol-meter", VolMeterWorklet);
`;
