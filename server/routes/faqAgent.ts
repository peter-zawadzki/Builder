import { Hono } from "hono";
import { readdir, readFile as fsReadFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { HonoEnv } from "../auth";
import { pool, query, queryOne } from "../db";
import { matchHelpVisuals, type HelpVisual } from "../data/helpVisuals";
import { APP_NAVIGATION } from "../data/appNavigation";
import { BUSINESS_DATA_SCHEMA } from "../data/businessDataSchema";

export const faqAgent = new Hono<HonoEnv>();

const MODEL = "claude-sonnet-4-5";
const REPO_ROOT = resolve(process.cwd());
const CACHE_TTL_HOURS = 24;

interface CachedAnswer {
  answer: string;
  confident: boolean;
  sources: { type: string; label: string }[];
  visuals: {
    key: string;
    label: string;
    steps: {
      imageUrl: string;
      caption: string;
      highlights?: { xPct: number; yPct: number; wPct: number; hPct: number; label?: string }[];
    }[];
  }[];
}

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function toVisualPayload(visuals: HelpVisual[]): CachedAnswer["visuals"] {
  return visuals.map((v) => ({
    key: v.key,
    label: v.label,
    steps: v.steps.map((s) => ({ imageUrl: s.imagePath, caption: s.caption, highlights: s.highlights })),
  }));
}

// Code lookups are scoped to user-facing feature code and server routes —
// not the whole repo — per the spec's "start scoped, not whole-repo" guidance,
// to keep tool-call latency/noise down and avoid ever surfacing infra/secrets.
const ALLOWED_ROOTS = ["src/app", "server/routes"];
const SEARCHABLE_EXTENSIONS = new Set([".ts", ".tsx", ".sql", ".md"]);
const MAX_SEARCH_RESULTS = 20;
const MAX_READ_LINES = 250;
const MAX_TOOL_ITERATIONS = 10;

interface FaqRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  status: "active" | "rolling_out" | "archived";
  as_of: string;
}

function resolveWithinRepo(relPath: string): string | null {
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
async function searchCode(rawQuery: string): Promise<string> {
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

const MAX_QUERY_ROWS = 200;
const QUERY_TIMEOUT_MS = 5000;
const BANNED_SQL_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|call|execute|vacuum|reindex|refresh|merge|lock|listen|notify|set\s+role|reset\s+role)\b/i;

// Runs whatever SELECT the model writes, but never trusts it: single
// statement only, and — defense in depth beyond that keyword check — the
// query itself runs inside a READ ONLY transaction, which Postgres refuses
// to let write regardless of what the query says. Rolled back either way
// since nothing here should ever persist.
async function queryDatabase(sql: string): Promise<string> {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(trimmed)) {
    return "Refused: only a single SELECT or WITH...SELECT statement is allowed.";
  }
  if (trimmed.includes(";")) {
    return "Refused: only one statement at a time.";
  }
  if (BANNED_SQL_KEYWORDS.test(trimmed)) {
    return "Refused: query contains a write/DDL keyword, which isn't permitted.";
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
    const result = await client.query(trimmed);
    await client.query("ROLLBACK");
    const rows = result.rows.slice(0, MAX_QUERY_ROWS);
    const truncated = result.rows.length > MAX_QUERY_ROWS;
    return JSON.stringify({ rowCount: result.rows.length, rows, truncated });
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    return `Query error: ${err?.message ?? String(err)}`;
  } finally {
    client.release();
  }
}

async function readFileTool(path: string, startLine?: number, endLine?: number): Promise<string> {
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

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_code",
    description:
      "Search the product source code for a keyword, symbol, route name, or feature name. Returns matching file:line snippets.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Keyword or phrase to search for" } },
      required: ["query"],
    },
  },
  {
    name: "read_file",
    description: "Read a slice of a source file found via search_code, to see full context around a match.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repo-relative path, e.g. src/app/components/ResourceCenter.tsx" },
        start_line: { type: "number" },
        end_line: { type: "number" },
      },
      required: ["path"],
    },
  },
  {
    name: "query_database",
    description:
      "Run a read-only SQL SELECT against the app's Postgres database to answer data/count/analytics questions (e.g. how many mountains have projects, which are pending install, what needs action). See the Business data reference in your instructions for table/field shapes. Only SELECT/WITH is allowed — no writes are possible even if attempted. If unsure of a JSON field name, a quick exploratory query (e.g. jsonb_object_keys on one row) is fine before computing the real answer.",
    input_schema: {
      type: "object",
      properties: { sql: { type: "string", description: "A single read-only SELECT (or WITH...SELECT) statement." } },
      required: ["sql"],
    },
  },
  {
    name: "provide_answer",
    description:
      "Give the final answer to the user. Always call this to finish, even when you don't have a confident answer.",
    input_schema: {
      type: "object",
      properties: {
        answer: { type: "string", description: "The answer, in plain language. If unknown, say so explicitly." },
        confident: {
          type: "boolean",
          description:
            "True only if you gave a real, substantive answer fully supported by the FAQ set or retrieved code. False whenever the answer is a refusal/'I don't have that information' — this flag is what gets a question logged as a gap to fill, so a refusal must never be marked confident.",
        },
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["faq", "code", "data"] },
              label: { type: "string", description: "FAQ category+question, file path/feature area, or a short description of the query run" },
            },
            required: ["type", "label"],
          },
        },
      },
      required: ["answer", "confident", "sources"],
    },
  },
];

function systemPrompt(faqs: FaqRow[]): string {
  const faqBlock = faqs
    .map(
      (f) =>
        `- [${f.category}]${f.status === "rolling_out" ? " (status: rolling out, not fully live yet)" : ""} Q: ${f.question}\n  A: ${f.answer}`
    )
    .join("\n");
  return `You are the support assistant embedded in the Yullr Resource Center's FAQ tab. You answer four kinds of questions: (1) curated company FAQs about the Yullr product, pricing, and install process, (2) "where do I find X" navigational questions about this Builder app, answerable from the App Navigation reference below, (3) "how does X work" questions about this app's own features, answerable by reading its source code with the search_code/read_file tools, and (4) data/analytics questions about the app's actual business data (mountain/project/proposal counts, what needs action, etc.), answerable with the query_database tool.

For navigational questions ("where are the logos", "where do I find X", "how do I get to Y") — check App Navigation FIRST. It's authoritative and always current; don't grep the codebase to guess where something lives in the UI when this already tells you. Whenever App Navigation gives a route for what's being asked about — including a "?tab=" deep link — that route IS the direct link; give it confidently as a markdown link, e.g. [Brand Assets](/resources?tab=logos). Don't hedge or say you're unsure of "the exact URL" when App Navigation already states it. Only say you don't have a link when App Navigation genuinely has nothing for that item (e.g. a specific mountain/project/proposal record — those aren't in App Navigation since it only covers static app sections, not database records).

For data/count/analytics questions ("how many mountains have X", "what needs action", "which are pending Y") — use query_database against the real data. It's read-only (writes are blocked at the database level regardless of what you write), so query freely and run more than one query if you need to check a field name first. Answer with real numbers from the query results, never estimate or guess a count.

Ground every answer ONLY in the FAQ list, the App Navigation reference, code/files you actually retrieved, or query_database results. Never answer from general outside knowledge about skiing, video platforms, or software in general. If a question is genuinely ambiguous between two very different meanings (e.g. "find logos" could mean the brand's own logo files, or uploading a logo to a specific mountain; "signed contracts" could mean signed proposals or signed customer agreements, which are different documents), briefly answer the more likely reading AND explicitly ask which one they meant, rather than silently picking one — or, when it's cheap to just compute both (as with signed proposals vs. agreements), report both clearly labeled instead of asking. If neither source covers the question at all, say "I don't have that information" plainly — do not guess or infer.

FAQ entries marked "rolling out" describe something not fully live yet — reflect that hedge in your answer instead of stating it as settled fact.

Earlier turns of this conversation may be included below. Treat later questions as follow-ups when they read like one (e.g. "what about...", "and for a smaller team?", pronouns referring to something already discussed) — resolve them against that prior context instead of treating each question in isolation.

Format the answer field as clean, minimal markdown so it renders well in a chat bubble: short paragraphs, numbered steps for anything sequential, bullet lists for options, "**bold**" only for the handful of words that most need emphasis (not whole sentences), no headers, no nested lists.

Always finish by calling provide_answer with:
- confident=true only when the FAQ set, App Navigation, retrieved code, or query_database results fully support the answer. If your answer is a refusal or "I don't have that information," confident MUST be false — that's how these gaps get tracked for follow-up.
- sources citing the FAQ category+question you used, the App Navigation section, the file path(s) you read, and/or a short description of the query you ran (type "data").

App Navigation reference:
${APP_NAVIGATION}

Business data reference:
${BUSINESS_DATA_SCHEMA}

Curated FAQ set:
${faqBlock || "(none loaded)"}`;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export async function runAgent(question: string, history: HistoryTurn[] = []): Promise<{
  answer: string;
  confident: boolean;
  sources: { type: string; label: string }[];
  usedCode: boolean;
  usedData: boolean;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { answer: "The FAQ assistant isn't configured yet (missing ANTHROPIC_API_KEY).", confident: false, sources: [], usedCode: false, usedData: false };
  }
  const client = new Anthropic({ apiKey });
  const faqs = await query<FaqRow>(
    `SELECT id, category, question, answer, status, as_of FROM faq_entries WHERE is_active = true ORDER BY category, question`
  );

  // Prior turns are plain text only (the model's final answers, not the raw
  // tool-call trace) — keeps follow-up context cheap; if a follow-up needs
  // the same code again, the model just searches again.
  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.text }) as Anthropic.MessageParam),
    { role: "user", content: question },
  ];
  let usedCode = false;
  let usedData = false;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt(faqs),
      tools: TOOLS,
      messages,
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const finalCall = toolUses.find((t) => t.name === "provide_answer");
    if (finalCall) {
      const input = finalCall.input as { answer: string; confident: boolean; sources?: { type: string; label: string }[] };
      return { answer: input.answer, confident: !!input.confident, sources: input.sources ?? [], usedCode, usedData };
    }

    if (toolUses.length === 0) {
      // Model returned plain text without calling provide_answer — treat as
      // the answer but not confident, since it skipped the citation contract.
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
      return { answer: text || "I don't have that information.", confident: false, sources: [], usedCode, usedData };
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      usedCode = usedCode || call.name === "search_code" || call.name === "read_file";
      usedData = usedData || call.name === "query_database";
      let result = "";
      if (call.name === "search_code") {
        result = await searchCode((call.input as { query: string }).query);
      } else if (call.name === "read_file") {
        const input = call.input as { path: string; start_line?: number; end_line?: number };
        result = await readFileTool(input.path, input.start_line, input.end_line);
      } else if (call.name === "query_database") {
        result = await queryDatabase((call.input as { sql: string }).sql);
      } else {
        result = `Unknown tool: ${call.name}`;
      }
      if (process.env.FAQ_AGENT_DEBUG) {
        console.log(`[DEBUG] ${call.name}(${JSON.stringify(call.input)}) ->\n${result.slice(0, 500)}\n---`);
      }
      toolResults.push({ type: "tool_result", tool_use_id: call.id, content: result });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Hit the iteration cap mid-investigation. Whatever code/FAQ context was
  // already gathered is still in `messages` — throwing it away for a canned
  // refusal wastes real research the model already did. Force one last call,
  // tools removed and provide_answer required, so it synthesizes from
  // whatever it found instead of being asked to look further.
  messages.push({
    role: "user",
    content: "You're out of tool calls. Answer now using only what you've already found above — call provide_answer.",
  });
  const finalResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt(faqs),
    tools: [TOOLS.find((t) => t.name === "provide_answer")!],
    tool_choice: { type: "tool", name: "provide_answer" },
    messages,
  });
  const finalCall = finalResponse.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (finalCall) {
    const input = finalCall.input as { answer: string; confident: boolean; sources?: { type: string; label: string }[] };
    return { answer: input.answer, confident: !!input.confident, sources: input.sources ?? [], usedCode, usedData };
  }
  return { answer: "I don't have that information.", confident: false, sources: [], usedCode, usedData };
}

// Prior turns are supplied by the client (it already holds the visible
// transcript) rather than kept server-side — stateless per request, survives
// server restarts, and needs no session-eviction logic.
const MAX_HISTORY_TURNS = 10;

faqAgent.post("/ask", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h?.text === "string")
        .slice(-MAX_HISTORY_TURNS)
    : [];
  if (!question) return c.json({ error: "question is required" }, 400);

  // A follow-up's meaning depends on the hidden prior context, so its answer
  // isn't safe to cache/reuse for someone else asking the same bare text —
  // only cache context-free, first-turn questions.
  const isFollowUp = history.length > 0;
  const questionNorm = normalizeQuestion(question);
  const cached = isFollowUp
    ? null
    : await queryOne<{ answer: CachedAnswer }>(
        `SELECT answer FROM faq_answer_cache WHERE question_norm = $1 AND created_at > now() - interval '${CACHE_TTL_HOURS} hours'`,
        [questionNorm]
      );
  if (cached) return c.json(cached.answer);

  const user = c.get("user");
  const result = await runAgent(question, history);
  const visuals = toVisualPayload(matchHelpVisuals(question, result.answer));
  const payload: CachedAnswer = { answer: result.answer, confident: result.confident, sources: result.sources, visuals };
  const pathTried = ["faq", result.usedCode && "code", result.usedData && "data"].filter(Boolean).join("+");

  if (!result.confident) {
    await pool.query(
      `INSERT INTO faq_unanswered_log (question, path_tried, user_id, session_id) VALUES ($1, $2, $3, $4)`,
      [question, pathTried, user?.id ?? null, sessionId]
    );
  } else if (!isFollowUp && !result.usedData) {
    await pool.query(
      `INSERT INTO faq_answer_cache (question_norm, answer) VALUES ($1, $2)
       ON CONFLICT (question_norm) DO UPDATE SET answer = EXCLUDED.answer, created_at = now()`,
      [questionNorm, JSON.stringify(payload)]
    );
  }

  return c.json(payload);
});

faqAgent.post("/feedback", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { question, answer, rating, sources, sessionId } = body;
  if (!question || !answer || (rating !== "up" && rating !== "down")) {
    return c.json({ error: "question, answer, and rating ('up'|'down') are required" }, 400);
  }
  const user = c.get("user");
  await pool.query(
    `INSERT INTO faq_feedback (question, answer, rating, sources, user_id, session_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [question, answer, rating, JSON.stringify(sources ?? []), user?.id ?? null, sessionId ?? null]
  );
  return c.json({ ok: true });
});
