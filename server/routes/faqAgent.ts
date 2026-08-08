import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import type { HonoEnv } from "../auth";
import { pool, query, queryOne } from "../db";
import { matchHelpVisuals, type HelpVisual } from "../data/helpVisuals";
import { ODIN_VIDEO_FLOWS } from "../data/odinVideoFlows";
import { APP_NAVIGATION } from "../data/appNavigation";
import { BUSINESS_DATA_SCHEMA } from "../data/businessDataSchema";
import { upsert, insertActivity } from "./legacy";
import { searchPlaces, getPlaceDetails } from "../utils/googlePlaces";
import { regionFromAddress, REGIONS, type Region } from "../data/regionMapping";
import { TONE_GUIDE } from "../data/brandVoice";
import { searchCode, readFileTool } from "../utils/codeSearch";
import { logInteraction } from "../utils/interactionLog";
import { cachedSystem, cacheableTools } from "../utils/promptCache";
import { embedText, toVectorLiteral } from "../utils/embeddings";

export const faqAgent = new Hono<HonoEnv>();

const MODEL = "claude-sonnet-4-5";
const CACHE_TTL_HOURS = 24;

interface CachedAnswer {
  answer: string;
  confident: boolean;
  needsUserInput: boolean;
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
  videoOffer: { flowKey: string; label: string } | null;
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

const MAX_TOOL_ITERATIONS = 10;

interface FaqRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  status: "active" | "rolling_out" | "archived";
  as_of: string;
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

// Semantic search over notes/replies (server/notes/embedNote.ts keeps this
// index in sync) — lets ODIN answer "what did we discuss about X" questions
// that the curated FAQ set, code, and structured business data can't.
async function searchNotesTool(searchQuery: string): Promise<string> {
  const embedding = await embedText(searchQuery);
  if (!embedding) return "Note search isn't configured (missing VOYAGE_API_KEY).";
  const rows = await query<{ content: string; mountain_id: string | null; distance: number }>(
    `SELECT content, mountain_id, embedding <=> $1::vector AS distance FROM note_embeddings ORDER BY embedding <=> $1::vector LIMIT 8`,
    [toVectorLiteral(embedding)]
  );
  if (rows.length === 0) return "No notes found.";
  return JSON.stringify(rows.map((r) => ({ content: r.content, mountainId: r.mountain_id, relevance: Math.round((1 - r.distance) * 100) / 100 })));
}

async function searchPlacesTool(searchQuery: string): Promise<string> {
  const result = await searchPlaces(searchQuery);
  if ("error" in result) return result.error;
  if (result.length === 0) return `No places found for "${searchQuery}".`;
  return result.map((r) => `${r.placeId} :: ${r.description}`).join("\n");
}

async function getPlaceDetailsTool(placeId: string): Promise<string> {
  const result = await getPlaceDetails(placeId);
  if ("error" in result) return result.error;
  const suggestedRegion = regionFromAddress(result.address);
  return JSON.stringify({ ...result, suggestedRegion });
}

async function createMountainTool(input: {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  region?: string;
  notes?: string;
  trailCount?: number;
  acreage?: number;
  verticalDrop?: number;
  userConfirmed?: boolean;
}): Promise<string> {
  if (!input.userConfirmed) {
    return "Refused: userConfirmed must be true. Only call create_mountain after the user has explicitly confirmed which real place is meant, in a reply to your own confirmation question.";
  }
  if (!input.name?.trim()) return "Refused: name is required.";
  if (input.region && !REGIONS.includes(input.region as Region)) {
    return `Refused: region must be one of ${REGIONS.join(", ")}.`;
  }

  const dup = await queryOne<{ id: string; name: string }>(
    `SELECT id, data->>'name' AS name FROM legacy_records WHERE collection = 'mountains' AND lower(data->>'name') = lower($1)`,
    [input.name.trim()]
  );

  const id = crypto.randomUUID();
  const record = {
    id,
    name: input.name.trim(),
    address: input.address ?? "",
    phone: input.phone ?? "",
    website: input.website ?? "",
    region: input.region ?? undefined,
    notes: input.notes ?? "",
    trailCount: typeof input.trailCount === "number" ? input.trailCount : undefined,
    acreage: typeof input.acreage === "number" ? input.acreage : undefined,
    verticalDrop: typeof input.verticalDrop === "number" ? input.verticalDrop : undefined,
    adminContact: { name: "", email: "", phone: "", notes: "" },
    technicalContact: { name: "", email: "", phone: "", notes: "" },
    additionalContacts: [],
    activities: [],
  };
  await upsert("mountains", id, record);
  await insertActivity({
    mountainId: id,
    type: "mountain_added",
    summary: `Added mountain "${record.name}"`,
    actor: "ODIN",
  });

  return JSON.stringify({
    created: true,
    id,
    duplicateWarning: dup ? `Note: a mountain named "${dup.name}" already existed (id ${dup.id}) — created a new, separate record anyway.` : null,
  });
}

// upsert() replaces the whole JSONB blob, so an update has to read the
// existing record and merge onto it — never write a partial record that
// would silently wipe untouched fields (contacts, activities, etc.).
async function updateMountainTool(input: {
  mountainId: string;
  address?: string;
  phone?: string;
  website?: string;
  region?: string;
  notes?: string;
  trailCount?: number;
  acreage?: number;
  verticalDrop?: number;
  userConfirmed?: boolean;
}): Promise<string> {
  if (!input.userConfirmed) {
    return "Refused: userConfirmed must be true. Only call update_mountain after the user has explicitly given or confirmed the specific new values in this conversation.";
  }
  if (!input.mountainId?.trim()) return "Refused: mountainId is required — look up the record's id with query_database first.";
  if (input.region && !REGIONS.includes(input.region as Region)) {
    return `Refused: region must be one of ${REGIONS.join(", ")}.`;
  }

  const existing = await queryOne<{ data: any }>(
    `SELECT data FROM legacy_records WHERE collection = 'mountains' AND id = $1`,
    [input.mountainId]
  );
  if (!existing) return `Refused: no mountain found with id ${input.mountainId}.`;

  const record = { ...existing.data };
  const changed: string[] = [];
  for (const field of ["address", "phone", "website", "region", "notes"] as const) {
    if (typeof input[field] === "string") {
      record[field] = input[field];
      changed.push(field);
    }
  }
  for (const field of ["trailCount", "acreage", "verticalDrop"] as const) {
    if (typeof input[field] === "number") {
      record[field] = input[field];
      changed.push(field);
    }
  }
  if (changed.length === 0) return "Refused: no fields provided to update.";

  await upsert("mountains", input.mountainId, record);
  await insertActivity({
    mountainId: input.mountainId,
    type: "mountain_updated",
    summary: `Updated ${changed.join(", ")} for "${record.name}"`,
    actor: "ODIN",
  });

  return JSON.stringify({ updated: true, id: input.mountainId, name: record.name, fields: changed });
}

const TOOLS: Anthropic.ToolUnion[] = [
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
    name: "search_notes",
    description:
      "Semantic search over every note and reply across mountains/contacts/teams/organizations/projects/inspections — use this for 'what did we discuss about X' or 'what's the latest on Y' questions that aren't answerable from the FAQ set, code, or query_database. Finds relevant notes even when they don't share exact keywords with the question.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Plain-language description of what to find, e.g. 'camera placement discussion at Attitash'" } },
      required: ["query"],
    },
  },
  {
    name: "search_places",
    description:
      "Search for a real-world place by name (e.g. a ski mountain/resort) via Google Places. Returns candidate places with a placeId — use this when the user asks to add a mountain, to find out which real place(s) match and disambiguate (e.g. 'Wildcat Mountain' exists in more than one state).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Place name to search for, optionally with a location hint" } },
      required: ["query"],
    },
  },
  {
    name: "get_place_details",
    description:
      "Get full details (address, phone, website, coordinates, and a suggested app Region) for one specific place found via search_places. Call this on the placeId the user confirmed before creating a mountain.",
    input_schema: {
      type: "object",
      properties: { placeId: { type: "string", description: "The placeId from a search_places result" } },
      required: ["placeId"],
    },
  },
  {
    name: "create_mountain",
    description:
      "Create a new mountain record. ONLY call this after the user has explicitly confirmed (in their own reply) which specific real-world place is meant — never on the first mention of a mountain name. Fill address/phone/website from get_place_details, not from memory. Fill trailCount/acreage/verticalDrop from web_search results when you found a real, sourced number — leave any of them unset rather than guess if you didn't find a solid source.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        phone: { type: "string" },
        website: { type: "string" },
        region: { type: "string", enum: REGIONS, description: "Use the suggestedRegion from get_place_details unless the user said otherwise" },
        notes: { type: "string" },
        trailCount: { type: "number", description: "Number of trails, only if found via web_search from a real source" },
        acreage: { type: "number", description: "Skiable acreage, only if found via web_search from a real source" },
        verticalDrop: { type: "number", description: "Vertical drop in feet, only if found via web_search from a real source" },
        userConfirmed: { type: "boolean", description: "Must be true — set only after the user explicitly confirmed the specific place in this conversation" },
      },
      required: ["name", "userConfirmed"],
    },
  },
  {
    name: "update_mountain",
    description:
      "Update fields on an EXISTING mountain record (address/phone/website/region/notes/trailCount/acreage/verticalDrop). First look up the mountain's id with query_database (SELECT id, data->>'name' FROM legacy_records WHERE collection = 'mountains' AND ...) to confirm exactly which record you mean, especially if the name could match more than one. Only call this after the user has stated or explicitly confirmed the specific new value(s) in this conversation — never invent or estimate a number yourself; if they didn't give you a value for a field, don't touch that field at all.",
    input_schema: {
      type: "object",
      properties: {
        mountainId: { type: "string", description: "The legacy_records id of the mountain to update, found via query_database" },
        address: { type: "string" },
        phone: { type: "string" },
        website: { type: "string" },
        region: { type: "string", enum: REGIONS },
        notes: { type: "string" },
        trailCount: { type: "number" },
        acreage: { type: "number" },
        verticalDrop: { type: "number" },
        userConfirmed: { type: "boolean", description: "Must be true — set only after the user gave or confirmed these specific values in this conversation" },
      },
      required: ["mountainId", "userConfirmed"],
    },
  },
  { type: "web_search_20250305", name: "web_search" },
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
        needsUserInput: {
          type: "boolean",
          description:
            "True when this 'answer' is actually a question of your own — e.g. confirming which real-world place is meant, or asking which of two readings someone meant — and you're waiting on their reply, not stating a conclusion. False for a normal completed answer OR a genuine refusal. This must never be true at the same time as confident=true.",
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
      required: ["answer", "confident", "needsUserInput", "sources"],
    },
  },
];
// Static across every call — cache breakpoint on the last tool caches the
// whole schema, avoiding a full reprocess of all 9 tool descriptions on
// every question and every iteration of the tool-use loop below.
const CACHED_TOOLS = cacheableTools(TOOLS);

function systemPrompt(faqs: FaqRow[]): string {
  const faqBlock = faqs
    .map(
      (f) =>
        `- [${f.category}]${f.status === "rolling_out" ? " (status: rolling out, not fully live yet)" : ""} Q: ${f.question}\n  A: ${f.answer}`
    )
    .join("\n");
  const videoFlowLabels = Object.values(ODIN_VIDEO_FLOWS).map((f) => f.label);
  return `You are ODIN, the support assistant embedded in the Yullr Resource Center's FAQ tab.

You genuinely CAN generate a short narrated video tutorial, fully automatically, for these specific flows: ${videoFlowLabels.join(", ")}. This happens separately from your text answer — a "want a video?" offer button appears automatically underneath any answer that matches one of these flows, you don't need to (and can't) trigger it yourself as a tool call. If asked directly "can you make a video for this" (or similar) about one of these flows, say yes, briefly explain a video option will appear below, and answer the question as normal — never say you can't generate a video for something on this list, since that's simply false and contradicts the offer button that will appear right below your own answer. For any flow NOT on this list, you genuinely cannot yet — say so plainly rather than guessing or promising one.

Brand voice — write every answer in this tone: ${TONE_GUIDE}

You answer seven kinds of requests: (1) curated company FAQs about the Yullr product, pricing, and install process, (2) "where do I find X" navigational questions about this Builder app, answerable from the App Navigation reference below, (3) "how does X work" / "how do I do X" questions about this app's own features and workflows, answerable by reading its source code with the search_code/read_file tools, (4) data/analytics questions about the app's actual business data (mountain/project/proposal counts, what needs action, etc.), answerable with the query_database tool, (5) "add a mountain" requests, using search_places/get_place_details/create_mountain, (6) "update mountain X with these stats/details" requests for a mountain that already exists, using query_database to find its id and update_mountain to write the change, and (7) "what did we discuss/decide about X" questions answerable from real notes/replies left by the team, using the search_notes tool.

Many questions are (3) even when phrased like "how do I..." or "where do I go to create X" — anything asking about the STEPS or PROCESS for doing something in the app (creating, editing, assigning, submitting, signing, etc.) is a (3), not a (2). App Navigation only tells you which section/tab a feature lives in, not the click-by-click flow inside it. Never conclude "I don't have that information" for a how-do-I-do-X question just because App Navigation and the FAQ list didn't cover it in full — call search_code (try the feature name and the specific action, e.g. "proposal create", "new proposal", "assessment submit") and read_file on promising matches before giving up. Only fall back to "I don't have that information" if search_code also turns up nothing relevant after a real attempt.

For navigational questions ("where are the logos", "where do I find X", "how do I get to Y") — check App Navigation FIRST. It's authoritative and always current; don't grep the codebase to guess where something lives in the UI when this already tells you. Whenever App Navigation gives a route for what's being asked about — including a "?tab=" deep link — that route IS the direct link; give it confidently as a markdown link, e.g. [Brand Assets](/resources?tab=logos). Don't hedge or say you're unsure of "the exact URL" when App Navigation already states it. Only say you don't have a link when App Navigation genuinely has nothing for that item (e.g. a specific mountain/project/proposal record — those aren't in App Navigation since it only covers static app sections, not database records).

For data/count/analytics questions ("how many mountains have X", "what needs action", "which are pending Y") — use query_database against the real data. It's read-only (writes are blocked at the database level regardless of what you write), so query freely and run more than one query if you need to check a field name first. Answer with real numbers from the query results, never estimate or guess a count.

For "what did we discuss/decide/say about X" questions — use search_notes. It's a semantic search, so plain-language descriptions work even without exact keyword overlap. Ground your answer only in what the returned notes actually say — never fill in plausible-sounding details search_notes didn't return. If it returns nothing relevant, say so plainly rather than guessing.

For "add [mountain name]" requests: this is the one flow that writes real data, so never call create_mountain on the first mention of a name. First call search_places — if it returns more than one plausible candidate (a name like "Wildcat Mountain" often does), list them and ask which one is meant (set needsUserInput=true, confident=false on that turn — this is a pending question, not a failure); if there's one obvious match, still confirm it in plain language ("Wildcat Mountain in Pinkham Notch, NH — that the one?") before creating anything. Only call create_mountain in a LATER turn, after the user's reply confirms which specific place — that's what userConfirmed=true means, and it must never be set otherwise. Once confirmed, call get_place_details on the chosen placeId and pass its address/phone/website/suggestedRegion straight through to create_mountain — don't retype them from memory. If suggestedRegion comes back null, ask which region to use rather than guessing (again needsUserInput=true). Before calling create_mountain, use web_search to try to find real, publicly reported trailCount/acreage/verticalDrop numbers for this specific resort (search something like "[mountain name] trail count acreage vertical drop"), and pass along whatever you find real sources for; cite the source in your final answer. Only pass a number you actually found in search results — never estimate or fill these from your own general knowledge of the resort, since a plausible-sounding wrong number is worse than a blank field; if search doesn't turn up a reliable number for a field, leave it unset and say plainly it wasn't found. If create_mountain returns a duplicateWarning, mention it, but the record is already created either way.

For "update mountain X" requests (correcting or filling in address/phone/website/region/notes/trailCount/acreage/verticalDrop for a mountain that already exists) — this is a real write, same seriousness as create_mountain, but there's no identity-search step since the mountain already exists: query_database for its id (SELECT id, data->>'name' FROM legacy_records WHERE collection = 'mountains' AND data->>'name' ILIKE '%...%'), and if more than one record matches, list them and ask which one (needsUserInput=true) before doing anything else. Only call update_mountain with userConfirmed=true when the user has themselves stated or explicitly confirmed the specific new value(s) — if they just say "update it with the right stats" without giving numbers, that's not enough; ask for the actual values or use web_search to find real sourced ones and show them to the user before writing, same as create_mountain. Never say something can't be done and hand the user manual instructions when update_mountain can do it directly — you DO have the ability to update existing mountain records, this is not a create-only assistant.

Ground every answer ONLY in the FAQ list, the App Navigation reference, code/files you actually retrieved, or query_database results. Never answer from general outside knowledge about skiing, video platforms, or software in general. If a question is genuinely ambiguous between two very different meanings (e.g. "find logos" could mean the brand's own logo files, or uploading a logo to a specific mountain; "signed contracts" could mean signed proposals or signed customer agreements, which are different documents), briefly answer the more likely reading AND explicitly ask which one they meant, rather than silently picking one (set needsUserInput=true when you do this) — or, when it's cheap to just compute both (as with signed proposals vs. agreements), report both clearly labeled instead of asking. If neither source covers the question at all, say "I don't have that information" plainly — do not guess or infer.

needsUserInput vs confident — these describe two different situations and must never both be true at once. The test is mechanical, not example-based: does the LAST sentence of your answer field end in a question mark asking the user to decide, confirm, or pick something before you'd act or finish? If yes, needsUserInput MUST be true, no matter what kind of question it is — confirming which real-world place they mean, which of two ambiguous readings they intended, which region to file something under, whether to proceed with a list of items you just surfaced ("should I go ahead and add all five?"), or anything else you're waiting on a reply to. This is a pending reply, not a content gap, so confident should be false alongside it. Set confident=false with needsUserInput=false ONLY for a genuine "I don't have that information" refusal, where nothing in the FAQ/navigation/code/data covers the question and your answer is NOT itself ending in a question — this is the only case that gets logged as a real gap to fix. Set confident=true (needsUserInput=false) when the FAQ set, App Navigation, retrieved code, or query_database results fully answer the question with nothing left pending. Before calling provide_answer, reread your own answer text and check: does it end by asking the user something? That single check determines needsUserInput.

FAQ entries marked "rolling out" describe something not fully live yet — reflect that hedge in your answer instead of stating it as settled fact.

Earlier turns of this conversation may be included below. Treat later questions as follow-ups when they read like one (e.g. "what about...", "and for a smaller team?", pronouns referring to something already discussed) — resolve them against that prior context instead of treating each question in isolation.

Format the answer field as clean, minimal markdown so it renders well in a chat bubble: short paragraphs, numbered steps for anything sequential, bullet lists for options, "**bold**" only for the handful of words that most need emphasis (not whole sentences), no headers, no nested lists.

Always finish by calling provide_answer with:
- confident=true only when the FAQ set, App Navigation, retrieved code, or query_database results fully support the answer. If your answer is a refusal or "I don't have that information," confident MUST be false — that's how these gaps get tracked for follow-up.
- needsUserInput=true whenever the answer is actually a question waiting on the user's reply (see above) — not a refusal.
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
  needsUserInput: boolean;
  sources: { type: string; label: string }[];
  usedCode: boolean;
  usedData: boolean;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { answer: "The FAQ assistant isn't configured yet (missing ANTHROPIC_API_KEY).", confident: false, needsUserInput: false, sources: [], usedCode: false, usedData: false };
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
      system: cachedSystem(systemPrompt(faqs)),
      tools: CACHED_TOOLS,
      messages,
    });

    // web_search is server-executed — Anthropic runs it and returns
    // web_search_tool_result blocks in this same response, so it never shows
    // up in `toolUses` below (that's client-dispatched tool_use only). Detect
    // it separately so a search still marks the answer as data-derived
    // (never cached, since results can go stale).
    usedData = usedData || response.content.some((b) => b.type === "server_tool_use");

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const finalCall = toolUses.find((t) => t.name === "provide_answer");
    if (finalCall) {
      const input = finalCall.input as {
        answer: string;
        confident: boolean;
        needsUserInput?: boolean;
        sources?: { type: string; label: string }[];
      };
      return {
        answer: input.answer,
        confident: !!input.confident,
        needsUserInput: !!input.needsUserInput,
        sources: input.sources ?? [],
        usedCode,
        usedData,
      };
    }

    if (toolUses.length === 0) {
      // Model returned plain text without calling provide_answer — treat as
      // the answer but not confident, since it skipped the citation contract.
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
      return { answer: text || "I don't have that information.", confident: false, needsUserInput: false, sources: [], usedCode, usedData };
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      usedCode = usedCode || call.name === "search_code" || call.name === "read_file";
      usedData = usedData || ["query_database", "search_notes", "search_places", "get_place_details", "create_mountain", "update_mountain"].includes(call.name);
      let result = "";
      if (call.name === "search_code") {
        result = await searchCode((call.input as { query: string }).query);
      } else if (call.name === "read_file") {
        const input = call.input as { path: string; start_line?: number; end_line?: number };
        result = await readFileTool(input.path, input.start_line, input.end_line);
      } else if (call.name === "query_database") {
        result = await queryDatabase((call.input as { sql: string }).sql);
      } else if (call.name === "search_notes") {
        result = await searchNotesTool((call.input as { query: string }).query);
      } else if (call.name === "search_places") {
        result = await searchPlacesTool((call.input as { query: string }).query);
      } else if (call.name === "get_place_details") {
        result = await getPlaceDetailsTool((call.input as { placeId: string }).placeId);
      } else if (call.name === "create_mountain") {
        result = await createMountainTool(call.input as any);
      } else if (call.name === "update_mountain") {
        result = await updateMountainTool(call.input as any);
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
    system: cachedSystem(systemPrompt(faqs)),
    tools: [TOOLS.find((t) => t.name === "provide_answer")!],
    tool_choice: { type: "tool", name: "provide_answer" },
    messages,
  });
  const finalCall = finalResponse.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (finalCall) {
    const input = finalCall.input as {
      answer: string;
      confident: boolean;
      needsUserInput?: boolean;
      sources?: { type: string; label: string }[];
    };
    return {
      answer: input.answer,
      confident: !!input.confident,
      needsUserInput: !!input.needsUserInput,
      sources: input.sources ?? [],
      usedCode,
      usedData,
    };
  }
  return { answer: "I don't have that information.", confident: false, needsUserInput: false, sources: [], usedCode, usedData };
}

// Prior turns are supplied by the client (it already holds the visible
// transcript) rather than kept server-side — stateless per request, survives
// server restarts, and needs no session-eviction logic.
const MAX_HISTORY_TURNS = 10;

faqAgent.post("/ask", async (c) => {
  const startTime = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history
        .filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h?.text === "string")
        .slice(-MAX_HISTORY_TURNS)
    : [];
  if (!question) return c.json({ error: "question is required" }, 400);

  const user = c.get("user");

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
  if (cached) {
    await logInteraction({
      agent: "faq",
      sessionId,
      userId: user?.id ?? null,
      question,
      answer: cached.answer.answer,
      confident: cached.answer.confident,
      needsUserInput: cached.answer.needsUserInput,
      sources: cached.answer.sources,
      isFollowUp,
      cacheHit: true,
      latencyMs: Date.now() - startTime,
    });
    return c.json(cached.answer);
  }

  const result = await runAgent(question, history);
  const matchedVisuals = matchHelpVisuals(question, result.answer);
  const visuals = toVisualPayload(matchedVisuals);
  // Video generation is only offered for flows with a real, generated
  // manifest available (currently just "add-mountain") — never for every
  // matched visual, so unsupported flows never dangle a broken offer.
  const videoFlow = matchedVisuals.find((v) => ODIN_VIDEO_FLOWS[v.key]);
  const videoOffer = videoFlow ? { flowKey: videoFlow.key, label: ODIN_VIDEO_FLOWS[videoFlow.key].label } : null;
  const payload: CachedAnswer = {
    answer: result.answer,
    confident: result.confident,
    needsUserInput: result.needsUserInput,
    sources: result.sources,
    visuals,
    videoOffer,
  };
  const pathTried = ["faq", result.usedCode && "code", result.usedData && "data"].filter(Boolean).join("+");

  // A clarifying/confirmation question isn't a gap to log — it's mid-flow,
  // waiting on the user's next reply — nor is it safe to cache (its "answer"
  // is context-dependent on whatever they say back).
  if (!result.confident && !result.needsUserInput) {
    await pool.query(
      `INSERT INTO faq_unanswered_log (question, path_tried, user_id, session_id) VALUES ($1, $2, $3, $4)`,
      [question, pathTried, user?.id ?? null, sessionId]
    );
  } else if (result.confident && !isFollowUp && !result.usedData) {
    await pool.query(
      `INSERT INTO faq_answer_cache (question_norm, answer) VALUES ($1, $2)
       ON CONFLICT (question_norm) DO UPDATE SET answer = EXCLUDED.answer, created_at = now()`,
      [questionNorm, JSON.stringify(payload)]
    );
  }

  await logInteraction({
    agent: "faq",
    sessionId,
    userId: user?.id ?? null,
    question,
    answer: result.answer,
    confident: result.confident,
    needsUserInput: result.needsUserInput,
    usedCode: result.usedCode,
    usedData: result.usedData,
    sources: result.sources,
    isFollowUp,
    cacheHit: false,
    latencyMs: Date.now() - startTime,
  });

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
