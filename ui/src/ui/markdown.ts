import DOMPurify from "dompurify";
import { marked } from "marked";
import { truncateText } from "./format.ts";
import { buildAuthHeaders } from "./storage.ts";

const allowedTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "button",
  "code",
  "del",
  "details",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "summary",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
  "img",
];

const allowedAttrs = [
  "class",
  "href",
  "rel",
  "target",
  "title",
  "start",
  "src",
  "alt",
  "data-code",
  "data-download-path",
  "type",
  "aria-label",
];
const sanitizeOptions = {
  ALLOWED_TAGS: allowedTags,
  ALLOWED_ATTR: allowedAttrs,
  ADD_DATA_URI_TAGS: ["img"],
};

let hooksInstalled = false;
let eventDelegateInstalled = false;
const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;
const INLINE_DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
const markdownCache = new Map<string, string>();
const TAIL_LINK_BLUR_CLASS = "chat-link-tail-blur";

function getCachedMarkdown(key: string): string | null {
  const cached = markdownCache.get(key);
  if (cached === undefined) {
    return null;
  }
  markdownCache.delete(key);
  markdownCache.set(key, cached);
  return cached;
}

function setCachedMarkdown(key: string, value: string) {
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) {
    return;
  }
  const oldest = markdownCache.keys().next().value;
  if (oldest) {
    markdownCache.delete(oldest);
  }
}

function installHooks() {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    // 处理下载链接 (render-download-cls 类)
    if (node.classList.contains("render-download-cls")) {
      // 移除 href 防止默认跳转
      node.removeAttribute("href");
      node.setAttribute("role", "button");
      node.style.cursor = "pointer";
      return;
    }

    // Block dangerous URL schemes (javascript:, data:, vbscript:, etc.)
    try {
      const url = new URL(node.href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") {
        node.removeAttribute("href");
        return;
      }
    } catch {
      // Relative URLs are fine; malformed absolute URLs with dangerous schemes
      // will fail to parse and keep their href — but DOMPurify already strips
      // javascript: by default. This is defense-in-depth.
    }

    node.setAttribute("rel", "noreferrer noopener");
    node.setAttribute("target", "_blank");
    if (node.href.toLowerCase().includes("tail")) {
      node.classList.add(TAIL_LINK_BLUR_CLASS);
    }
  });

  // 安装全局事件委托处理器
  if (!eventDelegateInstalled) {
    eventDelegateInstalled = true;
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const downloadLink = target.closest("a.render-download-cls");
      if (downloadLink) {
        e.preventDefault();
        e.stopPropagation();
        const downloadPath = downloadLink.getAttribute("data-download-path");
        if (downloadPath) {
          downloadFileFromHref(downloadPath);
        }
      }
    }, true);
  }
}

/**
 * 从 href 下载文件
 * @param downloadPath - 下载路径，例如 /download/workspace?path=test.txt
 */
async function downloadFileFromHref(downloadPath: string): Promise<void> {
  try {
    // 确保路径是完整的 URL
    const url = downloadPath.startsWith("/") ? `${downloadPath}` : downloadPath;

    // 使用工具函数获取认证头
    const headers = buildAuthHeaders();

    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Authentication required. Please log in and try again.");
      }
      if (response.status === 403) {
        throw new Error("Access denied. Your session may have expired.");
      }
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    // 获取文件名
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = "download";
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i)
        ?? contentDisposition.match(/filename=(\S+)/i);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // 如果没有从 header 获取到文件名，从 URL 提取
    if (filename === "download") {
      const urlParams = new URLSearchParams(new URL(downloadPath, window.location.href).search);
      filename = urlParams.get("path")?.split("/").pop() || "download";
    }

    // 获取文件内容作为 blob
    const blob = await response.blob();

    // 创建下载链接并触发下载
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 清理 blob URL
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (err) {
    console.error("[download] Failed to download file:", err);
    // 如果 fetch 失败，尝试直接打开（处理跨域情况）
    window.open(downloadPath, "_blank");
  }
}

export function toSanitizedMarkdownHtml(markdown: string): string {
  const input = markdown.trim();
  if (!input) {
    return "";
  }
  installHooks();
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    const cached = getCachedMarkdown(input);
    if (cached !== null) {
      return cached;
    }
  }
  const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
    : "";
  if (truncated.text.length > MARKDOWN_PARSE_LIMIT) {
    // Large plain-text replies should stay readable without inheriting the
    // capped code-block chrome, while still preserving whitespace for logs
    // and other structured text that commonly trips the parse guard.
    const html = renderEscapedPlainTextHtml(`${truncated.text}${suffix}`);
    const sanitized = DOMPurify.sanitize(html, sanitizeOptions);
    if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
      setCachedMarkdown(input, sanitized);
    }
    return sanitized;
  }
  let rendered: string;
  try {
    rendered = marked.parse(`${truncated.text}${suffix}`, {
      renderer: htmlEscapeRenderer,
      gfm: true,
      breaks: true,
    }) as string;
  } catch (err) {
    // Fall back to escaped plain text when marked.parse() throws (e.g.
    // infinite recursion on pathological markdown patterns — #36213).
    console.warn("[markdown] marked.parse failed, falling back to plain text:", err);
    const escaped = escapeHtml(`${truncated.text}${suffix}`);
    rendered = `<pre class="code-block">${escaped}</pre>`;
  }
  const sanitized = DOMPurify.sanitize(rendered, sanitizeOptions);
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    setCachedMarkdown(input, sanitized);
  }
  return sanitized;
}

// Prevent raw HTML in chat messages from being rendered as formatted HTML.
// Display it as escaped text so users see the literal markup.
// Security is handled by DOMPurify, but rendering pasted HTML (e.g. error
// pages) as formatted output is confusing UX (#13937).
const htmlEscapeRenderer = new marked.Renderer();

// Allow <a> tags (opening and closing) to pass through unescaped; all other HTML is escaped.
htmlEscapeRenderer.html = ({ text }: { text: string }) => {
  const trimmed = text.trim();
  // Check if it's an <a> opening tag or closing tag
  const isOpeningAnchor = /^<a\s[^>]*>$/i.test(trimmed);
  const isClosingAnchor = /^<\/a>$/i.test(trimmed);
  if (isOpeningAnchor || isClosingAnchor) {
    // 如果是带有 render-download-cls 类的 <a> 标签，提取 href 并添加 data-download-path 属性
    if (isOpeningAnchor && trimmed.includes('class="render-download-cls"')) {
      const hrefMatch = trimmed.match(/href="([^"]*)"/i);
      if (hrefMatch && hrefMatch[1]) {
        // 添加 data-download-path 属性用于下载
        return trimmed.replace('href="', 'data-download-path="').replace('href=', 'data-download-path=');
      }
    }
    return trimmed;
  }
  return escapeHtml(text);
};
htmlEscapeRenderer.image = (token: { href?: string | null; text?: string | null }) => {
  const label = normalizeMarkdownImageLabel(token.text);
  const href = token.href?.trim() ?? "";
  if (!INLINE_DATA_IMAGE_RE.test(href)) {
    return escapeHtml(label);
  }
  return `<img class="markdown-inline-image" src="${escapeHtml(href)}" alt="${escapeHtml(label)}">`;
};

function normalizeMarkdownImageLabel(text?: string | null): string {
  const trimmed = text?.trim();
  return trimmed ? trimmed : "image";
}

htmlEscapeRenderer.code = ({
  text,
  lang,
  escaped,
}: {
  text: string;
  lang?: string;
  escaped?: boolean;
}) => {
  const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  const safeText = escaped ? text : escapeHtml(text);
  const codeBlock = `<pre><code${langClass}>${safeText}</code></pre>`;
  const langLabel = lang ? `<span class="code-block-lang">${escapeHtml(lang)}</span>` : "";
  const attrSafe = text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const copyBtn = `<button type="button" class="code-block-copy" data-code="${attrSafe}" aria-label="Copy code"><span class="code-block-copy__idle">Copy</span><span class="code-block-copy__done">Copied!</span></button>`;
  const header = `<div class="code-block-header">${langLabel}${copyBtn}</div>`;

  const trimmed = text.trim();
  const isJson =
    lang === "json" ||
    (!lang &&
      ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))));

  if (isJson) {
    const lineCount = text.split("\n").length;
    const label = lineCount > 1 ? `JSON &middot; ${lineCount} lines` : "JSON";
    return `<details class="json-collapse"><summary>${label}</summary><div class="code-block-wrapper">${header}${codeBlock}</div></details>`;
  }

  return `<div class="code-block-wrapper">${header}${codeBlock}</div>`;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEscapedPlainTextHtml(value: string): string {
  return `<div class="markdown-plain-text-fallback">${escapeHtml(value.replace(/\r\n?/g, "\n"))}</div>`;
}
