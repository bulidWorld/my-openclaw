import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { isPathInside } from "../infra/path-guards.js";
import { openVerifiedFileSync } from "../infra/safe-open-sync.js";

/**
 * 处理 /download/workspace 请求
 * 下载 agent workspace 中的文件
 *
 * 参数:
 *  - path: 文件相对路径（必需）
 *  - agentId: agent ID（可选，默认使用默认 agent）
 */
export function handleDownloadWorkspaceRequest(req: IncomingMessage, res: ServerResponse): boolean {
  console.log("[download-workspace] handleDownloadWorkspaceRequest called, url:", req.url);
  const url = new URL(req.url ?? "/", "http://localhost");

  // 只匹配 /download/workspace 路径
  if (url.pathname !== "/download/workspace") {
    console.log("[download-workspace] not matching path:", url.pathname);
    return false;
  }

  // 只处理 GET 请求
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET");
    res.end("Method Not Allowed");
    return true;
  }

  // 获取 URL 参数
  const filePath = url.searchParams.get("path");
  const agentId = url.searchParams.get("agentId") ?? undefined;

  // 验证必需参数
  if (!filePath) {
    res.statusCode = 400;
    res.end("Missing 'path' parameter");
    return true;
  }

  // 解码文件路径
  const decodedPath = decodeURIComponent(filePath);

  // 获取 workspace 目录
  let workspaceDir: string;
  try {
    const configSnapshot = loadConfig();
    workspaceDir = resolveAgentWorkspaceDir(configSnapshot, agentId ?? "main");
  } catch {
    res.statusCode = 400;
    res.end("Invalid agentId");
    return true;
  }

  // 构建完整路径
  const candidatePath = path.resolve(workspaceDir, decodedPath);

  // 安全检查：防止路径遍历攻击
  console.log(
    "[download-workspace] checking path safety, workspaceDir:",
    workspaceDir,
    "candidatePath:",
    candidatePath,
  );
  if (!isPathInside(workspaceDir, candidatePath)) {
    console.log("[download-workspace] path traversal detected");
    res.statusCode = 403;
    res.end("Forbidden: path traversal detected");
    return true;
  }

  // 安全打开文件
  const opened = openVerifiedFileSync({
    filePath: candidatePath,
    rejectPathSymlink: true,
    rejectHardlinks: true,
  });

  if (!opened.ok) {
    res.statusCode = 404;
    res.end("File not found or unsafe");
    return true;
  }

  // 读取文件内容
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(opened.fd);
  } catch {
    res.statusCode = 500;
    res.end("Failed to read file");
    return true;
  } finally {
    fs.closeSync(opened.fd);
  }

  // 设置响应头
  const ext = path.extname(decodedPath).toLowerCase();
  const contentType = getContentType(ext);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${crypto.randomUUID()}${ext}"`);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);

  return true;
}

/**
 * 根据文件扩展名返回 Content-Type
 */
function getContentType(ext: string): string {
  const map: Record<string, string> = {
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".ts": "text/typescript; charset=utf-8",
    ".tsx": "text/typescript; charset=utf-8",
    ".jsx": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".yaml": "text/yaml; charset=utf-8",
    ".yml": "text/yaml; charset=utf-8",
    ".log": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".tar": "application/x-tar",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
  };
  return map[ext] || "application/octet-stream";
}
