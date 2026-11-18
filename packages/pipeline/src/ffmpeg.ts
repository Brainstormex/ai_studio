import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolveBinary(moduleName: string, envKey: string): string {
  if (process.env[envKey]) return process.env[envKey]!;
  try {
    const resolved = require(moduleName) as string | { path?: string };
    if (typeof resolved === "string") return resolved;
    if (resolved?.path) return resolved.path;
  } catch {
    // fall through
  }
  return moduleName === "ffprobe-static" ? "ffprobe" : "ffmpeg";
}

export function getFfmpegPath(): string {
  return resolveBinary("ffmpeg-static", "FFMPEG_PATH");
}

export function getFfprobePath(): string {
  return resolveBinary("ffprobe-static", "FFPROBE_PATH");
}

export async function runCommand(
  binary: string,
  args: string[],
  options?: { cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options?.cwd,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${path.basename(binary)} failed (${code}): ${stderr.slice(-1200)}`));
    });
  });
}

export async function runFfmpeg(args: string[], options?: { cwd?: string }) {
  return runCommand(getFfmpegPath(), args, options);
}

export async function runFfprobe(args: string[], options?: { cwd?: string }) {
  return runCommand(getFfprobePath(), args, options);
}

export async function isReadableMedia(filePath: string): Promise<boolean> {
  try {
    await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function resolutionSize(resolution: "P720" | "P1080" | "P4K"): {
  width: number;
  height: number;
  label: string;
} {
  if (resolution === "P1080") return { width: 1920, height: 1080, label: "1080p" };
  if (resolution === "P4K") return { width: 3840, height: 2160, label: "4k" };
  return { width: 1280, height: 720, label: "720p" };
}
