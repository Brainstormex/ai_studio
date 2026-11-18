import { createRequire } from "node:module";
import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

export type ParsedDocument = {
  sourceType: string;
  text: string;
};

function parseSrt(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s-->\s\d{2}:\d{2}:\d{2}[,.]\d{3}$/.test(trimmed)) {
        return false;
      }
      return true;
    })
    .join("\n");
}

export async function parseUploadedDocument(
  filename: string,
  buffer: Buffer,
  mimeType?: string,
): Promise<ParsedDocument> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".txt") || mimeType === "text/plain") {
    return { sourceType: "txt", text: buffer.toString("utf8") };
  }

  if (lower.endsWith(".srt") || mimeType === "application/x-subrip") {
    return { sourceType: "srt", text: parseSrt(buffer.toString("utf8")) };
  }

  if (
    lower.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { sourceType: "docx", text: result.value };
  }

  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    const result = await pdfParse(buffer);
    return { sourceType: "pdf", text: result.text };
  }

  throw Object.assign(new Error("Unsupported file type. Use TXT, PDF, DOCX, or SRT."), {
    status: 400,
  });
}
