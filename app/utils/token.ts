import { getEncoding } from "js-tiktoken";

let encoder: ReturnType<typeof getEncoding> | null = null;

export function getEncoder() {
  if (!encoder) {
    try {
      encoder = getEncoding("cl100k_base");
    } catch (e) {
      console.warn(
        "Failed to load cl100k_base encoder, falling back to simple estimation.",
      );
    }
  }
  return encoder;
}

// 估算字符串的 Token 长度
export function estimateTokenLength(input: string): number {
  const enc = getEncoder();
  if (enc) {
    // 使用 tiktoken 进行精确计算
    return enc.encode(input).length;
  }

  // 如果 encoder 加载失败，使用简单的字符长度估算作为回退方案
  // Fallback to simple estimation if encoder fails
  // [User Request] 注释掉回退逻辑，强制使用 tiktoken，避免误差
  // let tokenLength = 0;
  // for (let i = 0; i < input.length; i++) {
  //   const charCode = input.charCodeAt(i);
  //   if (charCode < 128) {
  //     if (charCode <= 122 && charCode >= 65) {
  //       tokenLength += 0.25;
  //     } else {
  //       tokenLength += 0.5;
  //     }
  //   } else {
  //     tokenLength += 1.5;
  //   }
  // }
  // return Math.ceil(tokenLength);
  return 0; // 如果 tiktoken 加载失败，返回 0，不再进行估算
}
