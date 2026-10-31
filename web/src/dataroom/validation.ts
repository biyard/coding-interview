// Mirrors the server rules in api/src/dataroom/mod.rs so most mistakes are caught before upload.
export const MAX_TITLE_CHARS = 200;
export const MAX_CONTENT_BYTES = 200 * 1024;
const MAX_REQUEST_BYTES = 256 * 1024;

/** Same set as Rust's `char::is_control` (Unicode category Cc). */
function hasControlCharacter(value: string) {
  return [...value].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f);
  });
}

export type TitleProblem = "titleRequired" | "titleTooLong" | "titleInvalid";
export type FileProblem =
  "fileType" | "fileNameInvalid" | "fileTooLarge" | "fileEncoding" | "fileEmpty" | "fileReadError";

export interface TextFile {
  name: string;
  content: string;
  bytes: number;
}

const encoder = new TextEncoder();

export function titleProblem(title: string): TitleProblem | null {
  const value = title.trim();
  if (!value) return "titleRequired";
  if ([...value].length > MAX_TITLE_CHARS) return "titleTooLong";
  if (hasControlCharacter(value)) return "titleInvalid";
  return null;
}

export function fileStem(name: string) {
  return name.replace(/\.(txt|md)$/i, "");
}

export async function readTextFile(file: File): Promise<TextFile | { problem: FileProblem }> {
  if (!/^.+\.(txt|md)$/i.test(file.name)) return { problem: "fileType" };
  if (/[/\\]/.test(file.name) || hasControlCharacter(file.name))
    return { problem: "fileNameInvalid" };
  // A UTF-8 byte order mark (3 bytes) is stripped while decoding, so allow it on top of the limit.
  if (file.size > MAX_CONTENT_BYTES + 3) return { problem: "fileTooLarge" };
  let content: string;
  try {
    // `fatal` makes invalid UTF-8 an error instead of silently inserting U+FFFD.
    content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch (error) {
    return { problem: error instanceof TypeError ? "fileEncoding" : "fileReadError" };
  }
  const bytes = encoder.encode(content).length;
  if (bytes > MAX_CONTENT_BYTES) return { problem: "fileTooLarge" };
  if (!content.trim()) return { problem: "fileEmpty" };
  if (content.includes("\u0000")) return { problem: "fileEncoding" };
  return { name: file.name, content, bytes };
}

/** JSON escaping can grow a file (e.g. every newline becomes `\n`), so check the real request size. */
export function exceedsRequestLimit(body: unknown) {
  return encoder.encode(JSON.stringify(body)).length > MAX_REQUEST_BYTES;
}
