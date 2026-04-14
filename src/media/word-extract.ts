import mammoth from "mammoth";

export type WordExtractedContent = {
  text: string;
  html?: string;
  warnings?: string[];
};

export type WordExtractOptions = {
  buffer: Buffer;
  /** Convert HTML output to markdown-style plain text. Default: true */
  convertToText?: boolean;
  /** Include raw HTML in result. Default: false */
  includeHtml?: boolean;
  /** Custom style map for mammoth conversion */
  styleMap?: string[];
};

/**
 * Extract text content from a Word document (.docx) buffer.
 * Uses mammoth library to convert DOCX to HTML/text.
 *
 * @param params - Extraction parameters
 * @returns Extracted text content with optional HTML
 */
export async function extractWordContent(
  params: WordExtractOptions,
): Promise<WordExtractedContent> {
  const { buffer, convertToText = true, includeHtml = false, styleMap } = params;

  // Default style map for cleaner text extraction
  const defaultStyleMap = [
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='Heading 4'] => h4:fresh",
    "p[style-name='Heading 5'] => h5:fresh",
    "p[style-name='Heading 6'] => h6:fresh",
    "p[style-name='paragraph'] => p:fresh",
    "r[style-name='Strong'] => strong:fresh",
    "r[style-name='Emphasis'] => em:fresh",
    "r[style-name='Hyperlink'] => a:fresh",
  ];

  const effectiveStyleMap = styleMap ?? defaultStyleMap;

  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(buffer) },
    {
      styleMap: effectiveStyleMap,
      includeEmbeddedStyleMap: false,
      ignoreEmptyParagraphs: true,
    },
  );

  const html = result.value ?? "";
  const warnings = result.messages?.map((m) => m.message) ?? [];

  let text = html;
  if (convertToText) {
    text = htmlToText(html);
  }

  return {
    text,
    html: includeHtml ? html : undefined,
    warnings,
  };
}

/**
 * Convert simple HTML to plain text.
 * Handles common HTML tags from mammoth output.
 */
function htmlToText(html: string): string {
  if (!html.trim()) {
    return "";
  }

  let text = html;

  // Replace block elements with newlines
  text = text.replace(/<h1[^>]*>/gi, "\n# ");
  text = text.replace(/<h2[^>]*>/gi, "\n## ");
  text = text.replace(/<h3[^>]*>/gi, "\n### ");
  text = text.replace(/<h4[^>]*>/gi, "\n#### ");
  text = text.replace(/<h5[^>]*>/gi, "\n##### ");
  text = text.replace(/<h6[^>]*>/gi, "\n###### ");
  text = text.replace(/<p[^>]*>/gi, "\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "\n• ");
  text = text.replace(/<tr[^>]*>/gi, "\n");
  text = text.replace(/<div[^>]*>/gi, "\n");

  // Handle inline formatting
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  text = text.replace(/<u[^>]*>(.*?)<\/u>/gi, "$1");
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)");
  text = text.replace(/<a[^>]*>(.*?)<\/a>/gi, "$1");
  text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  text = text.replace(/<pre[^>]*>(.*?)<\/pre>/gis, "\n```\n$1\n```\n");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, "\n\n"); // Collapse multiple newlines
  text = text.trim();

  return text;
}

/**
 * Check if a MIME type indicates a Word document.
 */
export function isWordDocumentMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) {
    return false;
  }
  const mime = mimeType.toLowerCase();
  return (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-word" ||
    mime.includes("wordprocessingml") ||
    mime.includes("msword")
  );
}

/**
 * Check if a file extension indicates a Word document.
 */
export function isWordDocumentExtension(fileName: string): boolean {
  if (!fileName) {
    return false;
  }
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "docx" || ext === "doc";
}
