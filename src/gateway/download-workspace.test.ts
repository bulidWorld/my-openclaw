import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { clearConfigCache } from "../config/config.js";
import { handleDownloadWorkspaceRequest } from "./download-workspace.js";

describe("handleDownloadWorkspaceRequest", () => {
  let tempDir: string;
  let workspaceDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-download-test-"));
    workspaceDir = path.join(tempDir, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    clearConfigCache();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockRequest(url: string, method = "GET"): IncomingMessage {
    const req = {
      url,
      method,
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
    return req;
  }

  function createMockResponse(): ServerResponse & { statusCode: number; headers: Record<string, string>; body: string | Buffer } {
    const res = {
      statusCode: 200,
      headers: {},
      body: Buffer.alloc(0),
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      end(data?: string | Buffer) {
        if (data) {
          this.body = data;
        }
      },
    } as unknown as ServerResponse & { statusCode: number; headers: Record<string, string>; body: string | Buffer };
    return res;
  }

  it("returns false for non-matching paths", () => {
    const req = createMockRequest("/download/other?path=test.txt");
    const res = createMockResponse();
    expect(handleDownloadWorkspaceRequest(req, res)).toBe(false);
  });

  it("returns 405 for non-GET methods", () => {
    const req = createMockRequest("/download/workspace?path=test.txt", "POST");
    const res = createMockResponse();
    expect(handleDownloadWorkspaceRequest(req, res)).toBe(true);
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when path parameter is missing", () => {
    const req = createMockRequest("/download/workspace");
    const res = createMockResponse();
    expect(handleDownloadWorkspaceRequest(req, res)).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(res.body.toString()).toContain("Missing");
  });

  it("returns 404 when file does not exist", () => {
    // Create a temporary config file
    const configPath = path.join(tempDir, ".openclawrc");
    fs.writeFileSync(configPath, JSON.stringify({ agents: { defaults: { workspace: workspaceDir } } }));
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    const req = createMockRequest("/download/workspace?path=nonexistent.txt");
    const res = createMockResponse();
    expect(handleDownloadWorkspaceRequest(req, res)).toBe(true);
    expect(res.statusCode).toBe(404);

    delete process.env.OPENCLAW_CONFIG_PATH;
  });

  it("returns 403 for path traversal attempts", () => {
    const req = createMockRequest("/download/workspace?path=..%2F..%2Fetc%2Fpasswd");
    const res = createMockResponse();
    expect(handleDownloadWorkspaceRequest(req, res)).toBe(true);
    expect(res.statusCode).toBe(403);
    expect(res.body.toString()).toContain("Forbidden");
  });

  it("downloads a valid file successfully", () => {
    // Create a test file
    const testFile = path.join(workspaceDir, "test.txt");
    const testContent = "Hello, World!";
    fs.writeFileSync(testFile, testContent);

    // Create a temporary config file
    const configPath = path.join(tempDir, ".openclawrc");
    fs.writeFileSync(configPath, JSON.stringify({ agents: { defaults: { workspace: workspaceDir } } }));
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    const req = createMockRequest("/download/workspace?path=test.txt");
    const res = createMockResponse();
    expect(handleDownloadWorkspaceRequest(req, res)).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Disposition"]).toContain("test.txt");
    expect(res.body.toString()).toBe(testContent);

    delete process.env.OPENCLAW_CONFIG_PATH;
  });

  it("handles URL-encoded file paths", () => {
    // Create a test file with spaces
    const testFile = path.join(workspaceDir, "my file.txt");
    const testContent = "Content with spaces";
    fs.writeFileSync(testFile, testContent);

    // Create a temporary config file
    const configPath = path.join(tempDir, ".openclawrc");
    fs.writeFileSync(configPath, JSON.stringify({ agents: { defaults: { workspace: workspaceDir } } }));
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    const req = createMockRequest("/download/workspace?path=my%20file.txt");
    const res = createMockResponse();
    expect(handleDownloadWorkspaceRequest(req, res)).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.body.toString()).toBe(testContent);

    delete process.env.OPENCLAW_CONFIG_PATH;
  });

  it("sets correct content type for different file extensions", () => {
    const testCases = [
      { ext: "test.json", expectedType: "application/json" },
      { ext: "test.md", expectedType: "text/markdown" },
      { ext: "test.png", expectedType: "image/png" },
      { ext: "test.pdf", expectedType: "application/pdf" },
      { ext: "test.unknown", expectedType: "application/octet-stream" },
    ];

    for (const { ext, expectedType } of testCases) {
      const testFile = path.join(workspaceDir, ext);
      fs.writeFileSync(testFile, "content");

      const configPath = path.join(tempDir, ".openclawrc");
      fs.writeFileSync(configPath, JSON.stringify({ agents: { defaults: { workspace: workspaceDir } } }));
      process.env.OPENCLAW_CONFIG_PATH = configPath;

      const req = createMockRequest(`/download/workspace?path=${ext}`);
      const res = createMockResponse();
      handleDownloadWorkspaceRequest(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.headers["Content-Type"]).toContain(expectedType);

      fs.unlinkSync(testFile);
      delete process.env.OPENCLAW_CONFIG_PATH;
    }
  });
});
