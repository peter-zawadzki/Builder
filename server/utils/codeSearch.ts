// Shared code-reading tools for Anthropic tool-use loops — extracted from
// server/routes/faqAgent.ts so the new feedback bug-analysis loop
// (server/feedback/analysis.ts) reuses the exact same search/read
// implementation instead of a second copy.
import { readdir, readFile as fsReadFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(process.cwd());

// Code lookups are scoped to user-facing feature code and server routes —
// not the whole repo — per the original FAQ-agent spec's "start scoped, not
// whole-repo" guidance, to keep tool-call latency/noise down and avoid ever
// surfacing infra/secrets.
export const ALLOWED_ROOTS = ["src/app", "server/routes"];
const SEARCHABLE_EXTENSIONS = new Set([".ts", ".tsx", ".sql", ".md"]);
const MAX_SEARCH_RESULTS = 20;
const MAX_READ_LINES = 250;

export function resolveWithinRepo(relPath: string): string | null {
  const abs = resolve(REPO_ROOT, relPath);
  const rel = relative(REPO_ROOT, abs);
  if (rel.startsWith("..") || rel === "") return null;
  if (!ALLOWED_ROOTS.some((root) => rel === root || rel.startsWith(root + "/"))) return null;
  return abs;
}

async function walkFiles(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, out);
    } else if (SEARCHABLE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      out.push(full);
    }
  }
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "did", "how", "what", "when", "where",
  "why", "on", "in", "of", "for", "to", "and", "or", "it", "this", "that", "mean", "means",
]);

// Natural-language questions rarely appear as literal substrings in source
// code ("what do the icons mean" never occurs verbatim), so a plain substring
// search mostly returns zero hits and burns tool-call turns. Instead: split
// the query into tokens, match lines containing ANY token, and rank lines by
// how many distinct tokens they hit — the same token-OR-then-rank approach
// the FAQ tab's own search uses (ResourceCenter.tsx), just applied to code.
export async function searchCode(rawQuery: string): Promise<string> {
  const tokens = rawQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  if (tokens.length === 0) return "Empty or too-generic query — use specific terms (component name, feature word).";

  const files: string[] = [];
  for (const root of ALLOWED_ROOTS) {
    await walkFiles(join(REPO_ROOT, root), files);
  }
  const scored: { line: string; score: number }[] = [];
  for (const file of files) {
    const content = await fsReadFile(file, "utf8").catch(() => null);
    if (!content) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const score = tokens.reduce((acc, t) => acc + (lower.includes(t) ? 1 : 0), 0);
      if (score > 0) {
        scored.push({ line: `${relative(REPO_ROOT, file)}:${i + 1}: ${lines[i].trim().slice(0, 200)}`, score });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, MAX_SEARCH_RESULTS).map((s) => s.line);
  return top.length
    ? top.join("\n")
    : `No matches for any of [${tokens.join(", ")}] under ${ALLOWED_ROOTS.join(", ")}. Try different or more specific terms.`;
}

export async function readFileTool(path: string, startLine?: number, endLine?: number): Promise<string> {
  const abs = resolveWithinRepo(path);
  if (!abs) return `Refused: "${path}" is outside the readable code areas (${ALLOWED_ROOTS.join(", ")}).`;
  const info = await stat(abs).catch(() => null);
  if (!info || !info.isFile()) return `Not found: ${path}`;
  const content = await fsReadFile(abs, "utf8").catch(() => null);
  if (content === null) return `Could not read: ${path}`;
  const lines = content.split("\n");
  const start = Math.max(1, startLine ?? 1);
  const end = Math.min(lines.length, endLine ?? start + MAX_READ_LINES - 1, start + MAX_READ_LINES - 1);
  const slice = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`);
  return slice.join("\n") || "(empty range)";
}
