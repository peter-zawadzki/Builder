// Schema reference for the query_database tool (faqAgent.ts). Mountains,
// projects, proposals, contacts, etc. are NOT in the new normalized Postgres
// tables (those are empty) — they still live in `legacy_records`, one JSONB
// blob per record, synced from the client-side DataContext.tsx state. The
// model can't discover this shape from search_code (it's data, not code), so
// it's given here the same way the FAQ set and App Navigation are.
export const BUSINESS_DATA_SCHEMA = `
Most business data lives in a single table: legacy_records(collection text, id text, data jsonb, updated_at timestamptz) — one row per record, one row PER "collection" value acting like a table name. Query it with jsonb operators, e.g.:
  SELECT data->>'name', data->>'mountainId' FROM legacy_records WHERE collection = 'projects'

Collections: mountains, trails, locations, assets, notes, projects, proposals, "customer-agreements", contacts, organizations, teams, site-inspections, activity.

Key field shapes (JSON keys are camelCase, matching the app's TypeScript):
- projects: mountainId, type (Install/Repair/Upgrade/'Initial Onboarding'/'Followup Training'/'Special Event'), isStalled, stallReason, stageStatus — a JSON OBJECT keyed by stage name, e.g. stageStatus->>'Install' is 'not_started'|'blocked'|'in_progress'|'done' (there is no single "status" column — each stage has its own status). Stage sequence for Install/Upgrade projects: Inspection → Proposal → Contract → Install → Commissioning → Completed. A project is "pending install" if stageStatus->>'Contract' = 'done' and stageStatus->>'Install' is not 'done'. A project is fully done if stageStatus->>'Completed' = 'done'.
- proposals / "customer-agreements": mountainId (proposals also have projectId), clientSignature and yullrSignature — each a JSON OBJECT (with signedAt etc.) when signed, or null/absent when not. "Fully signed" = both clientSignature and yullrSignature are present (not a status string): clientSignature IS NOT NULL AND yullrSignature IS NOT NULL. Proposals and customer agreements are two distinct documents — report both counts separately if a question about "signed contracts" doesn't specify which.
- mountains: name, isStalled, stallReason. Also has an "activities" array (see below).
- Open action items ("what needs action") are NOT a separate collection — every mountain/contact/organization/team/project/site-inspection record has its own embedded data->'activities' JSON ARRAY, each element shaped {type: 'note'|'action', completed, assigneeContactId, assigneeName, text, createdAt}. An open action item = an activities[] element with type='action' and completed is not true. Use jsonb_array_elements(data->'activities') to expand it, e.g.:
  SELECT collection, data->>'name' AS entity_name, act->>'text' AS action_text, act->>'assigneeName' AS assignee
  FROM legacy_records, jsonb_array_elements(data->'activities') AS act
  WHERE act->>'type' = 'action' AND (act->>'completed' IS DISTINCT FROM 'true')
- contacts: name, mountainId (nullable), organizationId (nullable).

If a query errors on a field name you guessed, a quick "SELECT jsonb_object_keys(data) FROM legacy_records WHERE collection = 'X' LIMIT 1" reveals the real keys for that collection.
`.trim();
