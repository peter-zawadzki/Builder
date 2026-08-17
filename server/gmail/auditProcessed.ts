// One-off diagnostic (read-only, no writes): re-fetches each 'processed'
// ledger row's Gmail thread id and groups by (contact, threadId) to find
// which already-written notes are genuine same-thread duplicates from the
// finalizeGroups bug (fixed in processMessage.ts) vs. legitimately separate
// threads that happen to involve the same contact.
import "../env";
import { query } from "../db";
import { getGmailClientForUser } from "./client";

interface Row {
  ledger_id: string;
  message_id_header: string;
  gmail_message_id: string;
  contact_id: string;
  note_id: string;
  claimed_by_email: string;
}

async function main() {
  const rows = await query<Row>(`
    SELECT p.id as ledger_id, p.message_id_header, p.gmail_message_id, p.contact_id, p.note_id, u.email as claimed_by_email
    FROM processed_email_messages p
    JOIN users u ON u.id = p.claimed_by_user_id
    WHERE p.status = 'processed'
    ORDER BY p.contact_id, p.created_at
  `);

  const contactNames = await query<{ id: string; name: string }>(
    `SELECT id, data->>'name' as name FROM legacy_records WHERE collection = 'contacts'`
  );
  const nameById = new Map(contactNames.map((c) => [c.id, c.name]));

  const clientCache = new Map<string, ReturnType<typeof getGmailClientForUser>>();
  function clientFor(email: string) {
    if (!clientCache.has(email)) clientCache.set(email, getGmailClientForUser(email));
    return clientCache.get(email)!;
  }

  const byGroup = new Map<string, { subject: string; note_id: string; ledger_id: string }[]>();
  for (const r of rows) {
    const gmail = clientFor(r.claimed_by_email);
    const msg = await gmail.users.messages.get({ userId: "me", id: r.gmail_message_id, format: "metadata", metadataHeaders: ["Subject"] });
    const threadId = msg.data.threadId ?? r.gmail_message_id;
    const subject = msg.data.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const key = `${r.contact_id}::${threadId}`;
    const arr = byGroup.get(key) ?? [];
    arr.push({ subject, note_id: r.note_id, ledger_id: r.ledger_id });
    byGroup.set(key, arr);
  }

  console.log("\n=== Groups with more than one note (likely thread-split duplicates) ===");
  for (const [key, entries] of byGroup) {
    if (entries.length <= 1) continue;
    const [contactId] = key.split("::");
    console.log(`\nContact: ${nameById.get(contactId) ?? contactId} (${contactId})`);
    for (const e of entries) console.log(`  note_id=${e.note_id} ledger_id=${e.ledger_id} subject="${e.subject}"`);
  }

  console.log("\n=== Groups with exactly one note (fine as-is) ===");
  for (const [key, entries] of byGroup) {
    if (entries.length !== 1) continue;
    const [contactId] = key.split("::");
    console.log(`Contact: ${nameById.get(contactId) ?? contactId} — "${entries[0].subject}"`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
