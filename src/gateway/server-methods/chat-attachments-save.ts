import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveOpenClawAgentDir } from "../../agents/agent-paths.js";
import type { ChatAttachment } from "../chat-attachments.js";

export type SaveUploadAttachmentOptions = {
  sessionKey?: string;
  workspaceDir?: string;
};

export type SavedAttachment = {
  originalFileName?: string;
  savedPath: string;
  relativePath: string;
  mimeType?: string;
  sizeBytes: number;
};

/**
 * Get the workspace directory for a session.
 */
export function resolveWorkspaceDirForSession(
  sessionKey?: string,
  workspaceDir?: string,
): string | null {
  // Use provided workspace dir or resolve from agent dir
  const resolvedWorkspace = workspaceDir ?? resolveOpenClawAgentDir();
  return resolvedWorkspace;
}

/**
 * Format date as YYYY-MM-DD for folder naming.
 */
export function formatDateForFolder(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Sanitize filename to remove invalid characters.
 */
export function sanitizeFileName(fileName: string): string {
  // Remove or replace invalid filename characters for Linux/Unix
  // Invalid: < > : " / \ | ? * and control characters (charCode < 0x20)
  let result = fileName;
  // Replace control characters (0x00-0x1F)
  result = result.split("").map((c) => (c.charCodeAt(0) < 0x20 ? "_" : c)).join("");
  // Replace other invalid filename characters
  result = result.replace(/[<>:"/\\|?*]/g, "_");
  // Normalize whitespace and underscores
  result = result.replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return result.slice(0, 200); // Limit length
}

/**
 * Generate a unique filename by appending a random string.
 * Format: original_name_RANDOM.ext
 */
export async function generateUniqueFileName(
  dir: string,
  baseName: string,
  extension: string,
): Promise<string> {
  // Always append random string to preserve original filename uniqueness
  const randomStr = randomBytes(4).toString("hex"); // 8 character random string
  return `${baseName}_${randomStr}${extension}`;
}

/**
 * Save uploaded attachments to workspace uploads folder.
 * Files are organized by date: workspace/uploads/YYYY-MM-DD/filename
 */
export async function saveUploadAttachments(
  attachments: ChatAttachment[],
  options: SaveUploadAttachmentOptions = {},
): Promise<SavedAttachment[]> {
  const workspaceDir = resolveWorkspaceDirForSession(options.sessionKey, options.workspaceDir);
  if (!workspaceDir) {
    return [];
  }

  const now = new Date();
  const dateFolder = formatDateForFolder(now);
  const uploadsDir = path.join(workspaceDir, "uploads", dateFolder);

  // Ensure uploads directory exists
  await fs.mkdir(uploadsDir, { recursive: true });

  const savedAttachments: SavedAttachment[] = [];

  for (const [idx, attachment] of attachments.entries()) {
    if (!attachment.content || typeof attachment.content !== "string") {
      continue;
    }

    try {
      // Decode base64 content
      const buffer = Buffer.from(attachment.content, "base64");

      // Get original filename or generate one
      let fileName = attachment.fileName;
      if (!fileName) {
        // Generate filename from MIME type
        const ext = getExtensionFromMimeType(attachment.mimeType);
        fileName = `upload_${Date.now()}_${idx}${ext}`;
      }

      // Sanitize filename
      const sanitizedName = sanitizeFileName(fileName);

      // Split into name and extension
      const lastDotIndex = sanitizedName.lastIndexOf(".");
      const baseName = lastDotIndex > 0 ? sanitizedName.slice(0, lastDotIndex) : sanitizedName;
      const extension =
        lastDotIndex > 0
          ? sanitizedName.slice(lastDotIndex)
          : getExtensionFromMimeType(attachment.mimeType);

      // Generate unique filename
      const uniqueFileName = await generateUniqueFileName(uploadsDir, baseName, extension);
      const filePath = path.join(uploadsDir, uniqueFileName);

      // Write file
      await fs.writeFile(filePath, buffer);

      // Calculate relative path from workspace
      const relativePath = path.join("uploads", dateFolder, uniqueFileName);

      savedAttachments.push({
        originalFileName: attachment.fileName,
        savedPath: filePath,
        relativePath,
        mimeType: attachment.mimeType,
        sizeBytes: buffer.length,
      });
    } catch (error) {
      console.error(
        `[chat-attachments-save] Failed to save attachment: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Continue with other attachments even if one fails
    }
  }

  return savedAttachments;
}

/**
 * Get file extension from MIME type.
 */
function getExtensionFromMimeType(mimeType?: string): string {
  if (!mimeType) {
    return ".bin";
  }

  const mime = mimeType.toLowerCase();

  // Image types
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return ".jpg";
  }
  if (mime === "image/png") {
    return ".png";
  }
  if (mime === "image/gif") {
    return ".gif";
  }
  if (mime === "image/webp") {
    return ".webp";
  }
  if (mime === "image/svg+xml") {
    return ".svg";
  }
  if (mime === "image/bmp") {
    return ".bmp";
  }

  // Word document types
  if (mime === "application/msword") {
    return ".doc";
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return ".docx";
  }
  if (mime === "application/vnd.ms-word") {
    return ".doc";
  }

  // PDF
  if (mime === "application/pdf") {
    return ".pdf";
  }

  // Audio
  if (mime === "audio/mpeg" || mime === "audio/mp3") {
    return ".mp3";
  }
  if (mime === "audio/wav") {
    return ".wav";
  }
  if (mime === "audio/ogg") {
    return ".ogg";
  }
  if (mime === "audio/webm") {
    return ".weba";
  }

  // Video
  if (mime === "video/mp4") {
    return ".mp4";
  }
  if (mime === "video/webm") {
    return ".webm";
  }
  if (mime === "video/quicktime") {
    return ".mov";
  }

  // Text
  if (mime === "text/plain") {
    return ".txt";
  }
  if (mime === "text/markdown") {
    return ".md";
  }
  if (mime === "text/html") {
    return ".html";
  }
  if (mime === "text/csv") {
    return ".csv";
  }

  // Default
  return ".bin";
}
