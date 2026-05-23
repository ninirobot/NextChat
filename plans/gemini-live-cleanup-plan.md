# Gemini Live 功能代码清理计划

## 📊 问题统计

| 类别 | 数量 | 严重程度 |
|------|------|----------|
| 废弃组件/文件 | 4个 | 🔴 严重 |
| 调试日志 | 15+处 | 🔴 严重 |
| 重复代码 | 5处 | 🟡 中等 |
| 未使用导入 | 3处 | 🟢 轻微 |
| 类型问题 | 2处 | 🟡 中等 |

---

## 🗑️ Phase 1: 删除废弃组件和文件

### 1.1 删除旧版 Gemini Live 组件
**文件:**
- `app/components/gemini-live.tsx` (431行)
- `app/components/gemini-live.module.scss` (6627字符)

**原因:**
- 已被 `live-chat.tsx` 完全取代
- 功能重复但实现陈旧
- 维护两份代码增加复杂度

**检查清单:**
- [ ] 确认没有页面路由引用 `gemini-live.tsx`
- [ ] 确认 `home.tsx` 或路由配置中已移除该组件
- [ ] 删除文件

### 1.2 删除废弃的 Hook
**文件:**
- `app/hooks/use-webcam.ts` (42行)
- `app/hooks/use-screen-capture.ts` (47行)

**原因:**
- 已被 `useMediaStream.ts` 统一取代
- 功能完全重复

**检查清单:**
- [ ] 全局搜索确认没有文件导入这两个 hook
- [ ] 删除文件

### 1.3 检查 preview-window 组件
**文件:**
- `app/components/preview-window.tsx`
- `app/components/preview-window.module.scss`

**需要确认:**
- 是否被 `live-chat.tsx` 的 `DraggableVideoPreview` 内联组件取代?
- 如果没有被使用，一并删除

---

## 🧹 Phase 2: 清理调试日志

### 2.1 清理 client.ts 中的日志
**文件:** `app/lib/gemini/client.ts`

**需要删除的日志 (第94-151行):**
```typescript
// 删除所有 [LIVE CLIENT] 前缀的 console.log
console.log("[LIVE CLIENT] Message:", ...);
console.log("[LIVE CLIENT] No serverContent");
console.log("[LIVE CLIENT] serverContent:", ...);
console.log("[LIVE CLIENT] modelTurn.parts count:", ...);
console.log("[LIVE CLIENT] Audio part found, size:", ...);
console.log("[LIVE CLIENT] Text part found:", ...);
console.log("[LIVE CLIENT] inputTranscription:", ...);
console.log("[LIVE CLIENT] outputTranscription:", ...);
```

### 2.2 清理 useGeminiLive.ts 中的日志
**文件:** `app/hooks/useGeminiLive.ts`

**需要删除的日志 (第140-143行):**
```typescript
console.log("[LIVE] onAudio:", data.byteLength, "bytes");
console.log("[LIVE] onTranscription:", type, "text:", text?.substring(0, 30)]);
```

### 2.3 保留的错误日志
以下日志建议保留，但改为 console.error/warn:
```typescript
// client.ts 第106行
console.log("[LIVE CLIENT] No serverContent"); 
// 改为: console.warn("[GeminiLive] No serverContent in message");
```

---

## 🔗 Phase 3: 合并重复代码

### 3.1 统一 base64ToArrayBuffer
**当前状态:**
- `lib/gemini/utils.ts` 第57-64行
- `lib/gemini/client.ts` 第154-161行 (重复实现)

**方案:**
1. 删除 `client.ts` 中的私有方法
2. 在 `client.ts` 中导入并使用 `utils.ts` 的版本

```typescript
// client.ts 修改为:
import { base64ToArrayBuffer } from "./utils";
```

### 3.2 检查音频工具函数重复
**文件对比:**
- `lib/gemini/utils.ts` - base64/arrayBuffer 转换
- `lib/audio.ts` - 可能包含相似功能
- `utils/audio.ts` - 可能包含相似功能

**需要分析后决定是否合并**

---

## 📝 Phase 4: 删除未使用的类型和工具函数

### 4.1 删除未使用的 Worklet 代码
**文件:** `app/lib/gemini/utils.ts` 第106-142行

```typescript
// AudioProcessingWorkletCode 完全未被使用，删除
export const AudioProcessingWorkletCode = `...`;
```

**说明:**
- `AudioRecordingWorklet` 在 `audio-recorder.ts` 中内联定义
- `VolMeterWorklet` 在 `audio-recorder.ts` 中使用
- `AudioProcessingWorkletCode` 是死代码

### 4.2 简化 EventEmitter
**文件:** `app/lib/gemini/utils.ts` 第6-54行

**当前:** 完整的 EventEmitter 类 (on/off/emit/removeAllListeners)

**实际使用:** AudioRecorder 只使用了 `on` 和 `emit`

**建议:** 如果项目中没有其他 EventEmitter 实现，可以保留但删除未使用的方法:
- `off()` - 未被调用
- `removeAllListeners()` - 未被调用

### 4.3 检查音频数据库功能
**文件:** `app/utils/audio-db.ts`

**问题:**
- 功能复杂但可能未被充分利用
- `migrateMessageAudioToDB` 使用了 `_storedInDB` 字段但类型定义中不存在

**需要确认:**
- [ ] 是否在使用 IndexedDB 存储音频?
- [ ] 如果使用，修复类型定义
- [ ] 如果不使用，考虑删除整个模块

---

## 🔧 Phase 5: 修复类型定义问题

### 5.1 修复 ChatMessage 类型
**文件:** `app/store/chat.ts` 第77-84行

**当前:**
```typescript
liveAudio?: {
  data?: Uint8Array;
  duration?: number;
  mimeType?: string;
  isPlaying?: boolean;
};
```

**问题:**
- `audio-db.ts` 中使用了 `_storedInDB` 标记但没有定义

**修复:**
```typescript
liveAudio?: {
  data?: Uint8Array | null;
  duration?: number;
  mimeType?: string;
  isPlaying?: boolean;
  _storedInDB?: boolean;  // 添加
};
```

### 5.2 优化 MediaStreamState 类型位置
**文件:** `app/lib/gemini/types.ts` 第26-32行

**当前:** 类型定义在 types.ts
**实际:** 只在 `useMediaStream.ts` 中使用

**建议:** 
- 将类型移到 hook 文件中，或使用返回类型推断
- 减少 types.ts 的复杂度

---

## 📦 Phase 6: 优化导入和依赖

### 6.1 清理未使用的导入
**文件:** `app/components/audio-player.tsx` 第3行

```typescript
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
// useCallback 被导入了但没有在组件中使用
```

**修复:**
```typescript
import { useState, useRef, useEffect, useMemo } from "react";
```

### 6.2 检查重复常量定义
**文件:** `app/lib/gemini/types.ts` 第65行

```typescript
export const DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
```

**检查:** 是否在 `constant.ts` 中已定义?
- 如果已定义，删除这里的重复定义
- 如果未定义，考虑移到 constant.ts

---

## ✅ Phase 7: 最终验证和测试

### 7.1 构建测试
```bash
cd NextChat
npm run build
# 确保没有 TypeScript 错误
```

### 7.2 功能测试清单
- [ ] Live 聊天页面正常加载
- [ ] 连接/断开功能正常
- [ ] 麦克风录制和转录正常
- [ ] 摄像头/屏幕分享正常
- [ ] 音频播放功能正常
- [ ] 消息历史正常显示

### 7.3 代码质量检查
- [ ] 运行 ESLint 检查
- [ ] 确认没有 console.log 残留 (除了合理的错误日志)
- [ ] 确认没有未使用的变量/导入

---

## 📈 预期收益

| 指标 | 当前 | 预期 | 改善 |
|------|------|------|------|
| Gemini Live 相关文件数 | ~15个 | ~10个 | -33% |
| 代码行数 | ~3500行 | ~2500行 | -29% |
| 调试日志 | 15+处 | 0-2处 | -90% |
| 重复代码块 | 5处 | 0处 | -100% |

---

## ⚠️ 风险提示

1. **删除前务必备份或确认 Git 状态**
2. **逐个阶段执行，不要一次性删除太多**
3. **每次删除后都进行构建测试**
4. **特别小心 `audio-db.ts`，确认是否在使用后再删除**

---

## 🚀 执行顺序建议

```
Day 1: Phase 2 (清理日志) - 低风险
Day 2: Phase 3 (合并重复代码) - 中风险
Day 3: Phase 4-5 (类型修复) - 中风险  
Day 4: Phase 1 (删除废弃文件) - 高风险但影响明确
Day 5: Phase 6 (优化导入) - 低风险
Day 6: Phase 7 (全面测试)
```

或者按风险分层:
1. **低风险先行:** Phase 2, 6
2. **中风险次之:** Phase 3, 4, 5
3. **高风险最后:** Phase 1 (删除文件)
