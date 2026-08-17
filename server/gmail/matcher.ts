// CRM-contact and primary-employee resolution — the core business rule of
// the sync: a message is in scope iff at least one of From/To/Cc (never Bcc)
// matches a legacy contact's email exactly. That single rule is what makes
// pure internal (employee<->employee) and pure external (employee<->
// stranger) mail fall out of scope on its own, with no separate "is this
// internal" check needed.
import type { ParsedHeaders } from "./messageParser";
import type { LegacyContact } from "./legacyCrm";

export interface ContactMatch {
  contact: LegacyContact;
  matchedIn: "from" | "to" | "cc";
}

// Only the FIRST CRM-contact match counts, so a message touching several CRM
// contacts still produces exactly one note. From is checked first (an
// inbound email from a CRM contact obviously attaches to that contact),
// then `To` in header order, then `Cc`.
export function findContactMatch(headers: ParsedHeaders, contactsByEmail: Map<string, LegacyContact>): ContactMatch | null {
  const fromMatch = contactsByEmail.get(headers.from);
  if (fromMatch) return { contact: fromMatch, matchedIn: "from" };
  for (const addr of headers.to) {
    const match = contactsByEmail.get(addr);
    if (match) return { contact: match, matchedIn: "to" };
  }
  for (const addr of headers.cc) {
    const match = contactsByEmail.get(addr);
    if (match) return { contact: match, matchedIn: "cc" };
  }
  return null;
}

export interface PrimaryEmployee {
  email: string;
}

// Sender if an employee sent it; otherwise the first employee address found
// in To (else Cc), in header order.
export function findPrimaryEmployee(headers: ParsedHeaders, employeeEmails: Set<string>): PrimaryEmployee | null {
  if (employeeEmails.has(headers.from)) return { email: headers.from };
  for (const addr of headers.to) {
    if (employeeEmails.has(addr)) return { email: addr };
  }
  for (const addr of headers.cc) {
    if (employeeEmails.has(addr)) return { email: addr };
  }
  return null;
}
