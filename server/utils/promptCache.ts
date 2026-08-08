// Anthropic prompt caching helpers. Every ODIN agent (faqAgent, feedbackAgent,
// bug analysis, dev-brief/mockup/video generation) sends a large, mostly-
// static system prompt and/or tool schema on every call — including
// multiple times per request inside a single tool-use loop. Without a cache
// breakpoint, none of that repeated content is ever cached, which is the
// exact "low prompt cache hit rate" the Anthropic Console flagged for our
// direct API traffic (Claude Code itself already caches automatically).
import type Anthropic from "@anthropic-ai/sdk";

// Wrap a system prompt string as a single cacheable text block. Anthropic
// only caches a block if it's at or above its per-model minimum token
// count (1024 for Sonnet) — everything below that silently isn't cached,
// no error — so this is safe to apply even to prompts near that threshold.
export function cachedSystem(text: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

// Mark the last tool in a static tool array as a cache breakpoint — this
// caches every tool definition up to and including it. Only meaningful for
// tools arrays that don't change between calls (all of ours are module-level
// constants), which is every call site in this codebase.
export function cacheableTools<T>(tools: T[]): T[] {
  if (tools.length === 0) return tools;
  return tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t)) as T[];
}
