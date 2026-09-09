import type { ChatMessage } from "@/app/store/chat";

import type { WebSearchSource } from "./types";

/**
 * 引用管线（渲染侧）。
 *
 * Sources 清单不写回 message.content，而是从 `botMessage.tools`
 * 里存盘的 web_search / web_fetch 结果「幂等派生」。这样消息重载、重试、
 * 版本切换时不会重复叠加 Sources；每次渲染重新派生即可。
 *
 * 流程：
 *  1. 解析 tools 中每条工具结果（JSON 数组，含 id/title/url）→ 来源清单。
 *     按 URL 去重：同一网址常同时出现在 web_search 与 web_fetch 的结果里（id 不同），
 *     必须合并成一条，否则 Sources 会重复、同一个出处却有两个编号。
 *  2. 按引用标记在正文「首次出现」的顺序分配显示编号 1..N
 *  3. 把标记替换成 `[[1]](url)` 形式的链接，编号与下方 Sources 列表严格对应。
 *     标记按「连续串」整体处理：括号内容当作 id 袋子解析（容错模型的近失写法），
 *     同一串内重复编号折叠，避免出现 [1][2][1]
 *  4. 末尾追加纯文本 Sources 清单
 *
 * 性能：本函数在流式输出期间会被每个 token 触发一次，而工具结果可能上万字符，
 * 每次都 JSON.parse 会把主线程钉死、正文表现为「一次性刷出」。故来源解析结果
 * 按 tools 数组做 WeakMap 缓存，只有工具结果真正变化时才重算。
 */

/**
 * 模型写的引用标记，两种都见过：
 *  - `[cite: <id>]`（我们要求的写法，id 形如 `a1b2c3d4-2`），可逗号分隔多条
 *  - `[citation: <n>]`（部分模型不抄 id，直接写结果序号，0 基）
 */
const CITE_PATTERN = /\[(?:cite|citation):\s*([^\]]*)\]/g;

/**
 * 紧邻出现的标记串（`[cite:a][cite:b]`，中间允许空格/制表符）。
 *
 * 整串一起处理才能跨标记分配编号：`[cite:a][cite:b][cite:a]` 必须渲染成
 * `[1][2]` 而不是 `[1][2][1]`。
 *
 * 末尾刻意不吃空白 —— 否则 `[cite:a] 下一段` 里的空格会被替换掉，标点粘连。
 */
const CITE_RUN_PATTERN =
  /(?:\[(?:cite|citation):\s*[^\]]*\])(?:[ \t]*\[(?:cite|citation):\s*[^\]]*\])*/g;

/**
 * 把一个连续串切成单个标记。
 *
 * 单独准备一个正则，是为了不在 `replace(CITE_RUN_PATTERN, ...)` 的回调里
 * 复用 `CITE_PATTERN.matchAll()`：matchAll 会把外层正则的 lastIndex 原样
 * 复制给克隆体，于是从 run 的中间开始匹配、漏掉开头几个标记。
 */
const CITE_MARKER_PATTERN = /\[(?:cite|citation):\s*[^\]]*\]/g;

/** 从单个标记里取出括号内容。刻意不带 g，exec 时才不受 lastIndex 影响。 */
const CITE_SINGLE_PATTERN = /\[(?:cite|citation):\s*([^\]]*)\]/;

interface RawResult {
  id?: string;
  title?: string;
  url?: string;
}

interface SourceIndex {
  signature: string;
  sources: WebSearchSource[];
  /** cite id → sources 下标 */
  idToIndex: Map<string, number>;
}

const EMPTY_INDEX: SourceIndex = {
  signature: "",
  sources: [],
  idToIndex: new Map(),
};

/** 去掉末尾斜杠，让 `http://a.com/x` 与 `http://a.com/x/` 视为同一来源。 */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function collectSources(message: ChatMessage): {
  sources: WebSearchSource[];
  idToIndex: Map<string, number>;
} {
  const sources: WebSearchSource[] = [];
  const idToIndex = new Map<string, number>();
  const urlToIndex = new Map<string, number>();

  for (const tool of message.tools ?? []) {
    if (!tool?.content) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(tool.content);
    } catch {
      // 非 JSON（例如出错时回灌的结构化错误文本）直接跳过
      continue;
    }

    for (const item of (Array.isArray(parsed) ? parsed : []) as RawResult[]) {
      if (!item?.id || !item?.url) continue;

      const id = item.id.toString().trim();
      const url = item.url.toString().trim();
      const urlKey = normalizeUrl(url);

      const known = urlToIndex.get(urlKey);
      if (known !== undefined) {
        idToIndex.set(id, known);
        continue;
      }

      urlToIndex.set(urlKey, sources.length);
      idToIndex.set(id, sources.length);
      sources.push({
        id,
        title: (item.title ?? url).toString().trim(),
        url,
      });
    }
  }

  return { sources, idToIndex };
}

/**
 * 只取「工具 id + 结果长度」做指纹：既能感知 onAfterTool 把结果写回来，
 * 又不必解析内容本身。
 */
function signatureOf(tools: NonNullable<ChatMessage["tools"]>): string {
  return tools
    .map((t) => `${t?.id ?? ""}:${t?.content?.length ?? 0}`)
    .join("|");
}

const sourceCache = new WeakMap<object, SourceIndex>();

function getSourceIndex(message: ChatMessage): SourceIndex {
  const tools = message.tools;
  if (!tools?.length) return EMPTY_INDEX;

  const signature = signatureOf(tools);
  const cached = sourceCache.get(tools);
  if (cached && cached.signature === signature) return cached;

  const entry: SourceIndex = { signature, ...collectSources(message) };
  sourceCache.set(tools, entry);
  return entry;
}

/**
 * `[[1]](url)` —— 链接文本靠「平衡方括号」得到 `[1]`。
 *
 * 不能用转义写法 `[\[1\]]`：`markdown.tsx` 的 `escapeBrackets()` 会把 `\[x\]`
 * 改写成 LaTeX `$$x$$`（该项目用 `\[...\]` 表示行间公式），编号随后被
 * RehypeKatex 渲染成公式、链接被块级元素撑断，正文里就彻底看不到引用标记了。
 * CommonMark 允许链接文本内含平衡的中括号，所以 `[[1]]` 既安全又无需反斜杠。
 */
function citeLink(n: number, url: string): string {
  return "[[" + n + "]](" + url + ")";
}

/**
 * 括号里的噪声词：形状（`[\w-]+`）与 id 相同，但显然不是 id 的 token。
 *
 * 模块级常量：`decorateMessageContent` 在流式期间每个 token 都会走一遍这里，
 * 每次新建 Set 是白给的开销。
 */
const CITE_STOP_WORDS = new Set(["cite", "citation", "and", "or"]);

/**
 * 从标记的括号内容里捞出所有 id 形状的 token。
 *
 * 模型会写出各种近失写法：`[cite:cite:a1b2-1]`（重复 cite:）、`[cite:"a1b2-1"]`
 * （带引号）、`[cite:a1b2-1 and a1b2-2]`（用 and 连接）、`[cite: a , b ]`（乱加空格）。
 * 与其把每种拼写都写进正则，不如把括号里当成「一袋 id」：用 `/[\w-]+/g` 捞出所有
 * id 形状的 token，丢掉 `cite` / `citation` 字面量与 `and` / `or` 这类连接词。
 *
 * 返回值仍然只是「候选」—— 判断「这是不是真 id」的权威是 `resolve()`（它握着
 * 真实来源表），这里只做形状提取。所以在 STOP 里列举连接词适可而止：
 * `&` / `以及` / `see also` 之类永远列不完，漏网的废话交给 resolve 丢弃即可，
 * 不会造成错误引用。
 */
export function extractCiteIds(raw: string): string[] {
  const tokens = raw.match(/[\w-]+/g);
  if (!tokens) return [];
  return tokens.filter((token) => !CITE_STOP_WORDS.has(token));
}

/**
 * 连续标记串内去重：同一编号只保留第一次出现。
 *
 * 作用在**编号**而不是渲染后的链接字符串上 —— 链接里含 URL（可能带括号，
 * 例如维基百科 `.../X_(Y)`），在链接文本上做正则很容易被 URL 截断。
 */
export function collapseRepeatedCites(nums: number[]): number[] {
  const out: number[] = [];
  for (const n of nums) {
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * 剥掉全部引用标记。
 *
 * 用于不需要编号的场景（推理链、纯文本复制）。编号是正文的顺序，推理区
 * 若也解析一遍，要么从 1 重新开始，要么与正文冲突，两种情况都是错的。
 */
export function stripCitationMarkers(content: string): string {
  return content.replace(CITE_PATTERN, "");
}

/**
 * 幂等派生最终 Markdown。
 *
 * @param includeSources 是否追加末尾 Sources 块（流式输出中传 false，避免
 *                        Sources 随每个 token 闪烁；结束时传 true）。
 */
export function decorateMessageContent(
  message: ChatMessage,
  includeSources = true,
): string {
  // 多模态消息 content 可能是数组；正文引用只在纯文本上做
  const content = typeof message.content === "string" ? message.content : "";
  if (!content) return content;

  const { sources, idToIndex } = getSourceIndex(message);
  // 没有可用来源（未联网、工具结果尚未回来或无法解析）时，必须把模型可能留下的
  // [cite:xxx] / [citation:n] 标记清掉。否则切换版本或重试后会看到一串纯文本
  // 标记（历史上表现为「已联网回答切回去只剩 [citation:1]」）。
  // 注意只处理渲染用的字符串，不改 message.content，工具结果随后到达仍可正常成链。
  if (sources.length === 0) return stripCitationMarkers(content);

  /** 已被正文引用到的来源下标，顺序即显示编号顺序 */
  const cited: number[] = [];

  const numberFor = (sourceIndex: number): number => {
    let n = cited.indexOf(sourceIndex);
    if (n < 0) {
      cited.push(sourceIndex);
      n = cited.length - 1;
    }
    return n + 1;
  };

  /** 先按 id 精确匹配；纯数字则当作 0 基结果序号（[citation:0]）兜底。 */
  const resolve = (token: string): number | undefined => {
    const key = token.trim();
    if (!key) return undefined;

    const byId = idToIndex.get(key);
    if (byId !== undefined) return byId;

    if (/^\d+$/.test(key)) {
      const n = Number(key);
      if (n >= 0 && n < sources.length) return n;
    }
    return undefined;
  };

  // 按「连续标记串」而不是单个标记替换：整串共享一套编号，
  // 才能把 [cite:a][cite:b][cite:a] 折叠成 [1][2] 而不是 [1][2][1]。
  const decorated = content.replace(CITE_RUN_PATTERN, (run: string) => {
    const nums: number[] = [];
    for (const marker of run.match(CITE_MARKER_PATTERN) ?? []) {
      const raw = CITE_SINGLE_PATTERN.exec(marker)?.[1] ?? "";
      for (const token of extractCiteIds(raw)) {
        const sourceIndex = resolve(token);
        if (sourceIndex === undefined) continue; // 对不上的标记直接丢弃
        nums.push(numberFor(sourceIndex));
      }
    }

    const unique = collapseRepeatedCites(nums);
    if (unique.length === 0) return "";
    return unique.map((n) => citeLink(n, sources[cited[n - 1]].url)).join("");
  });

  if (!includeSources) return decorated;

  // 模型没写引用标记时，也要把所有验证过的来源列出来，保证可追溯
  const listed = cited.length > 0 ? cited : sources.map((_, i) => i);
  if (listed.length === 0) return decorated;

  // Sources 清单：`### Sources` 加粗放大标题 + 纯文本行 `[1] 标题 https://url`
  // （裸 URL 由 remark-gfm 自动成链），无卡片无边框，与正文同一阅读流。
  const sourcesBlock = listed
    .map((sourceIndex, i) => {
      const s = sources[sourceIndex];
      return `**[${i + 1}]** ${s.title} ${s.url}`;
    })
    .join("\n");

  return `${decorated}\n\n### Sources\n\n${sourcesBlock}`;
}
