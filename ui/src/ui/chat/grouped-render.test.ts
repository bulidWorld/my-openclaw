import { describe, it, expect } from "vitest";
import { toSanitizedMarkdownHtml } from "../markdown.ts";
import { detectTextDirection } from "../text-direction.ts";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

/**
 * 检测文本是否为 JSON 并返回解析结果
 * 复制自 grouped-render.ts 用于测试
 */
function detectJson(text: string): { parsed: unknown; pretty: string } | null {
  const MAX_JSON_AUTOPARSE_CHARS = 20_000;
  const t = text.trim();

  if (t.length > MAX_JSON_AUTOPARSE_CHARS) {
    return null;
  }

  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      const parsed = JSON.parse(t);
      return { parsed, pretty: JSON.stringify(parsed, null, 2) };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 为折叠的 JSON 构建简短的摘要标签
 * 复制自 grouped-render.ts 用于测试
 */
function jsonSummaryLabel(parsed: unknown): string {
  if (Array.isArray(parsed)) {
    return `Array (${parsed.length} item${parsed.length === 1 ? "" : "s"})`;
  }
  if (parsed && typeof parsed === "object") {
    const keys = Object.keys(parsed as Record<string, unknown>);
    if (keys.length <= 4) {
      return `{ ${keys.join(", ")} }`;
    }
    return `Object (${keys.length} keys)`;
  }
  return "JSON";
}

describe("jsonSummaryLabel", () => {
  it("returns array label with item count for arrays", () => {
    expect(jsonSummaryLabel([1, 2, 3])).toBe("Array (3 items)");
    expect(jsonSummaryLabel([1])).toBe("Array (1 item)");
    expect(jsonSummaryLabel([])).toBe("Array (0 items)");
  });

  it("returns keys inline for objects with 4 or fewer keys", () => {
    expect(jsonSummaryLabel({ a: 1 })).toBe("{ a }");
    expect(jsonSummaryLabel({ a: 1, b: 2 })).toBe("{ a, b }");
    expect(jsonSummaryLabel({ a: 1, b: 2, c: 3, d: 4 })).toBe("{ a, b, c, d }");
  });

  it("returns key count for objects with more than 4 keys", () => {
    expect(jsonSummaryLabel({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toBe("Object (5 keys)");
    expect(jsonSummaryLabel({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 })).toBe("Object (6 keys)");
  });

  it("returns 'JSON' for primitives", () => {
    expect(jsonSummaryLabel("string")).toBe("JSON");
    expect(jsonSummaryLabel(123)).toBe("JSON");
    expect(jsonSummaryLabel(true)).toBe("JSON");
    expect(jsonSummaryLabel(null)).toBe("JSON");
  });

  it("handles empty object", () => {
    expect(jsonSummaryLabel({})).toBe("{  }");
  });
});

describe("detectJson", () => {
  it("detects JSON object", () => {
    const result = detectJson('{"name": "test", "value": 123}');
    expect(result).not.toBeNull();
    expect(result?.parsed).toEqual({ name: "test", value: 123 });
    expect(result?.pretty).toContain('"name": "test"');
  });

  it("detects JSON array", () => {
    const result = detectJson('[1, 2, 3, "test"]');
    expect(result).not.toBeNull();
    expect(result?.parsed).toEqual([1, 2, 3, "test"]);
    expect(result?.pretty).toContain('"test"');
  });

  it("returns null for non-JSON strings", () => {
    expect(detectJson("hello world")).toBeNull();
    expect(detectJson("not a json")).toBeNull();
  });

  it("returns null for incomplete JSON", () => {
    expect(detectJson('{"name": "test"')).toBeNull();
    expect(detectJson('[1, 2, 3')).toBeNull();
  });

  it("returns null for invalid JSON syntax", () => {
    expect(detectJson('{"name": }')).toBeNull();
    expect(detectJson('[1, 2, ]')).toBeNull();
  });

  it("returns null for JSON exceeding size limit", () => {
    const largeJson = JSON.stringify({ data: "x".repeat(25_000) });
    expect(detectJson(largeJson)).toBeNull();
  });

  it("accepts JSON within size limit", () => {
    const validJson = JSON.stringify({ data: "x".repeat(10_000) });
    const result = detectJson(validJson);
    expect(result).not.toBeNull();
    expect(result?.parsed).toEqual({ data: "x".repeat(10_000) });
  });

  it("handles whitespace around JSON", () => {
    const result = detectJson('  {"name": "test"}  ');
    expect(result).not.toBeNull();
    expect(result?.parsed).toEqual({ name: "test" });
  });

  it("handles nested JSON structures", () => {
    const nested = {
      user: {
        name: "John",
        address: {
          city: "NYC",
          zip: "10001",
        },
      },
      tags: ["admin", "user"],
    };
    const result = detectJson(JSON.stringify(nested));
    expect(result).not.toBeNull();
    expect(result?.parsed).toEqual(nested);
  });
});

describe("toSanitizedMarkdownHtml with detectTextDirection", () => {
  it("renders basic markdown to HTML", () => {
    const markdown = "Hello **world**";
    const html = toSanitizedMarkdownHtml(markdown);
    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("Hello");
  });

  it("renders markdown with headings", () => {
    const markdown = "# Heading 1\n## Heading 2";
    const html = toSanitizedMarkdownHtml(markdown);
    expect(html).toContain("<h1>");
    expect(html).toContain("<h2>");
  });

  it("renders markdown with links", () => {
    const markdown = "[link](https://example.com)";
    const html = toSanitizedMarkdownHtml(markdown);
    expect(html).toContain("<a");
    expect(html).toContain("https://example.com");
  });

  it("renders HTML <a> tag with render-download-cls for download", () => {
    const markdown = '<a class="render-download-cls" href="/down/workspace?path=test.txt">test.txt</a>';
    const html = toSanitizedMarkdownHtml(markdown);

    // Should preserve the <a> tag with render-download-cls
    expect(html).toContain('class="render-download-cls"');
    expect(html).toContain("test.txt");
    // href should be converted to data-download-path
    expect(html).toContain('data-download-path="/down/workspace?path=test.txt"');
  });

  it("renders markdown with inline <a> tag and render-download-cls", () => {
    const markdown = "Download: <a class=\"render-download-cls\" href=\"/down/workspace?path=文档.docx\">文档.docx</a>";
    const html = toSanitizedMarkdownHtml(markdown);

    expect(html).toContain('class="render-download-cls"');
    expect(html).toContain("文档.docx");
    expect(html).toContain('data-download-path=');
  });

  it("renders with detectTextDirection for LTR text containing download link", () => {
    const markdown = '**Hello** <a class="render-download-cls" href="/down/file.txt">file.txt</a>';
    const dir = detectTextDirection(markdown);
    expect(dir).toBe("ltr");

    const html = toSanitizedMarkdownHtml(markdown);
    console.log(unsafeHTML(html))

  });
});
