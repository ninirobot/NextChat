import {
  collapseRepeatedCites,
  decorateMessageContent,
  extractCiteIds,
  stripCitationMarkers,
} from "../app/websearch/citation";

/**
 * 构造一个最小可用的 ChatMessage（decorateMessageContent 只用到
 * `content` 字符串与 `tools[].content` 这个 JSON 字符串）。
 * 直接用 any 绕开 store 的复杂类型，保持测试轻量。
 */
function makeMessage(content: string, tools: any[]): any {
  return { content, tools } as any;
}

/** 一条工具结果：content 是 [{id,title,url}] 的 JSON 串。 */
function tool(id: string, url: string, title = "Source"): any {
  return {
    id: `tool-${id}`,
    content: JSON.stringify([{ id, title, url }]),
  };
}

describe("extractCiteIds", () => {
  test("extracts a normal cite id", () => {
    expect(extractCiteIds("cite:a1b2c3d4-2")).toEqual(["a1b2c3d4-2"]);
  });

  test("drops the repeated literal 'cite:' prefix some models emit", () => {
    expect(extractCiteIds("cite:cite:a1b2c3d4-2")).toEqual(["a1b2c3d4-2"]);
  });

  test("splits ids joined by the word 'and'", () => {
    expect(extractCiteIds("a1-1 and a1-2")).toEqual(["a1-1", "a1-2"]);
  });

  test("strips surrounding quotes", () => {
    expect(extractCiteIds('"a1-1"')).toEqual(["a1-1"]);
  });

  test("returns empty when the marker holds no word tokens", () => {
    expect(extractCiteIds("...")).toEqual([]);
  });
});

describe("collapseRepeatedCites", () => {
  test("keeps only the first occurrence of each number", () => {
    expect(collapseRepeatedCites([1, 2, 1])).toEqual([1, 2]);
    expect(collapseRepeatedCites([3, 3, 2])).toEqual([3, 2]);
  });
});

describe("stripCitationMarkers", () => {
  test("removes [cite:id] / [citation:n] markers but keeps text", () => {
    expect(
      stripCitationMarkers("hello [cite:a1-2] world [citation:3]"),
    ).toBe("hello  world ");
  });
});

describe("decorateMessageContent", () => {
  test("turns [cite:id] into a numbered link and appends Sources", () => {
    const msg = makeMessage("Panel is 300Hz [cite:a1b2c3d4-2].", [
      tool("a1b2c3d4-2", "https://example.com/x"),
    ]);
    const out = decorateMessageContent(msg);
    expect(out).toContain("[[1]](https://example.com/x)");
    expect(out).toContain("### Sources");
    expect(out).toContain("**[1]** Source https://example.com/x");
  });

  test("resolves [citation:0] as the 0-based first source", () => {
    const msg = makeMessage("See [citation:0].", [
      tool("a1b2c3d4-0", "https://example.com/a"),
    ]);
    const out = decorateMessageContent(msg);
    expect(out).toContain("[[1]](https://example.com/a)");
  });

  test("collapses a repeated run [cite:a][cite:b][cite:a] into [1][2]", () => {
    const msg = makeMessage("[cite:a][cite:b][cite:a]", [
      tool("a", "https://example.com/a"),
      tool("b", "https://example.com/b"),
    ]);
    const out = decorateMessageContent(msg);
    expect(out).toContain(
      "[[1]](https://example.com/a)[[2]](https://example.com/b)",
    );
    // 关键回归点：绝不能渲染成 [1][2][1]
    expect(out).not.toContain(
      "[[1]](https://example.com/a)[[2]](https://example.com/b)[[1]]",
    );
  });

  test("drops unmatched ids instead of rendering broken links", () => {
    const msg = makeMessage("claim [cite:does-not-exist].", [
      tool("a", "https://example.com/a"),
    ]);
    const out = decorateMessageContent(msg);
    // 没有生成任何行内引用链接（无 ]](http... 形态）
    expect(out).not.toContain("]](https://");
    expect(out).not.toContain("[cite:does-not-exist]");
  });

  test("omits the Sources block when includeSources=false (streaming phase)", () => {
    const msg = makeMessage("Panel is 300Hz [cite:a1b2c3d4-2].", [
      tool("a1b2c3d4-2", "https://example.com/x"),
    ]);
    const out = decorateMessageContent(msg, false);
    expect(out).toContain("[[1]](https://example.com/x)");
    expect(out).not.toContain("### Sources");
  });

  test("strips markers when there are no usable sources", () => {
    const msg = makeMessage("no sources here [cite:a1-2].", []);
    const out = decorateMessageContent(msg);
    expect(out).toBe("no sources here .");
    expect(out).not.toContain("[cite:");
  });
});
