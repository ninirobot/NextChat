import { ChatMessage } from "../store";

const DB_NAME = "NextChatLiveAudioDB";
const DB_VERSION = 1;
const STORE_NAME = "audioData";

// 6.1 LRU 空间限制：超过此字节数时淘汰最旧记录
const MAX_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB

interface AudioRecord {
  messageId: string;
  sessionId: string;
  data: Uint8Array;
  duration: number;
  mimeType: string;
  timestamp: number;
  byteSize: number; // 6.1 新增：记录每条音频的字节数，便于空间计算
}

let db: IDBDatabase | null = null;

/**
 * 初始化 IndexedDB
 */
export async function initAudioDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "messageId",
        });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

/**
 * 保存音频数据到 IndexedDB
 * 写入成功后触发 LRU 空间淘汰检查
 */
export async function saveAudioToDB(
  messageId: string,
  sessionId: string,
  audioData: Uint8Array,
  duration: number,
  mimeType: string,
): Promise<void> {
  const database = await initAudioDB();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const record: AudioRecord = {
      messageId,
      sessionId,
      data: audioData,
      duration,
      mimeType,
      timestamp: Date.now(),
      byteSize: audioData.byteLength, // 6.1 记录字节大小
    };

    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 6.1 写入后异步执行 LRU 淘汰，不阻塞调用方
  evictByLRU(database).catch((e) =>
    console.warn("[AudioDB] LRU eviction error:", e),
  );
}

/**
 * 6.1 LRU 空间淘汰
 * 遍历所有记录，累计字节总量；若超过 MAX_STORAGE_BYTES，
 * 按 timestamp 从旧到新删除，直到总量回落到限制以内。
 */
async function evictByLRU(database: IDBDatabase): Promise<void> {
  // 先用 navigator.storage.estimate() 做快速前置检查（6.2）
  if ("storage" in navigator && "estimate" in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage ?? 0;
    const quota = estimate.quota ?? Infinity;
    // 若已用量低于配额 50%，跳过精细扫描，省 IO
    if (used < quota * 0.5) return;
  }

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    // 按时间从旧到新扫描
    const request = index.openCursor(null, "next");

    let totalBytes = 0;
    const toDelete: string[] = [];
    const allRecords: Array<{ messageId: string; byteSize: number }> = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const rec = cursor.value as AudioRecord;
        totalBytes += rec.byteSize ?? rec.data?.byteLength ?? 0;
        allRecords.push({
          messageId: rec.messageId,
          byteSize: rec.byteSize ?? 0,
        });
        cursor.continue();
      } else {
        // 扫描完毕：从最旧的记录开始标记删除，直到 totalBytes <= 限制
        if (totalBytes > MAX_STORAGE_BYTES) {
          let excess = totalBytes - MAX_STORAGE_BYTES;
          for (const rec of allRecords) {
            if (excess <= 0) break;
            toDelete.push(rec.messageId);
            excess -= rec.byteSize;
          }
        }

        if (toDelete.length > 0) {
          const deleteTransaction = database.transaction(
            [STORE_NAME],
            "readwrite",
          );
          const deleteStore = deleteTransaction.objectStore(STORE_NAME);
          let pending = toDelete.length;

          toDelete.forEach((id) => {
            const req = deleteStore.delete(id);
            req.onsuccess = () => {
              pending--;
              if (pending === 0) {
                console.log(
                  `[AudioDB] LRU 淘汰了 ${toDelete.length} 条旧记录，释放约 ${Math.round((totalBytes - MAX_STORAGE_BYTES) / 1024 / 1024)} MB`,
                );
                resolve();
              }
            };
            req.onerror = () => reject(req.error);
          });
        } else {
          resolve();
        }
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 6.2 查询 IndexedDB 存储使用情况
 * 返回 { used, quota, percent } 单位均为 bytes
 */
export async function getAudioStorageEstimate(): Promise<{
  used: number;
  quota: number;
  percentUsed: number;
}> {
  if (!("storage" in navigator && "estimate" in navigator.storage)) {
    return { used: 0, quota: 0, percentUsed: 0 };
  }
  const estimate = await navigator.storage.estimate();
  const used = estimate.usage ?? 0;
  const quota = estimate.quota ?? 1;
  return {
    used,
    quota,
    percentUsed: Math.round((used / quota) * 100),
  };
}

/**
 * 从 IndexedDB 加载音频数据
 */
export async function loadAudioFromDB(
  messageId: string,
): Promise<AudioRecord | null> {
  const database = await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(messageId);

    request.onsuccess = () => resolve((request.result as AudioRecord) || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 从 IndexedDB 删除音频数据
 */
export async function deleteAudioFromDB(messageId: string): Promise<void> {
  const database = await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(messageId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除整个会话的音频数据
 */
export async function deleteSessionAudioFromDB(
  sessionId: string,
): Promise<void> {
  const database = await initAudioDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("sessionId");
    const request = index.openCursor(IDBKeyRange.only(sessionId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 清理旧的音频数据（保留最近 N 天，默认 7 天）
 */
export async function cleanupOldAudioData(
  daysToKeep: number = 7,
): Promise<void> {
  const database = await initAudioDB();
  const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const request = index.openCursor(IDBKeyRange.upperBound(cutoffTime));

    let deletedCount = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        console.log(`[AudioDB] 清理了 ${deletedCount} 条过期音频记录`);
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 将消息中的音频数据保存到 IndexedDB，并返回引用
 */
export async function migrateMessageAudioToDB(
  message: ChatMessage,
  sessionId: string,
): Promise<ChatMessage> {
  if (!message.liveAudio?.data || message.liveAudio.data.length === 0) {
    return message;
  }

  try {
    await saveAudioToDB(
      message.id,
      sessionId,
      message.liveAudio.data,
      message.liveAudio.duration || 0,
      message.liveAudio.mimeType || "audio/mpeg",
    );

    // 返回消息副本，但音频数据设为 null（数据已在 IndexedDB）
    return {
      ...message,
      liveAudio: {
        ...message.liveAudio,
        data: null as any, // 数据已迁移到 IndexedDB
        _storedInDB: true, // 标记数据在 IndexedDB 中
      },
    };
  } catch (error) {
    console.error("[AudioDB] Failed to migrate audio:", error);
    return message;
  }
}

/**
 * 从 IndexedDB 加载消息的音频数据
 */
export async function loadMessageAudioFromDB(
  message: ChatMessage,
): Promise<ChatMessage> {
  if (!message.liveAudio?._storedInDB || message.liveAudio?.data) {
    return message;
  }

  try {
    const record = await loadAudioFromDB(message.id);
    if (record) {
      return {
        ...message,
        liveAudio: {
          ...message.liveAudio,
          data: record.data,
          _storedInDB: true,
        },
      };
    }
  } catch (error) {
    console.error("[AudioDB] Failed to load audio:", error);
  }

  return message;
}

// 定期清理旧数据（每天运行一次）
setInterval(
  () => {
    cleanupOldAudioData().catch(console.error);
  },
  24 * 60 * 60 * 1000,
);
