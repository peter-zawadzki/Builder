// Config that identifies WHICH FILES matter for an auto-generated video
// flow — never authors step content. The manifest itself (the ordered list
// of clicks/fills Playwright replays) is 100% LLM-inferred from these files
// at generation time (see server/odin/video/manifestGenerator.ts); this map
// is the one small hand-maintained piece, same footprint as helpVisuals.ts
// naming which screenshot belongs to which flow.
import { ensureSharedFixtures, clearFixtureProposal, FIXTURE_PROJECT_NAME } from "../odin/video/fixtures";
import { query } from "../db";
export interface OdinVideoFlow {
  label: string;
  // A plain string for standalone flows (e.g. /mountains/new). A resolver
  // function for flows nested under an existing record (inventory, projects,
  // proposals, trail assessments, notes) — it ensures the shared persistent
  // fixture chain exists (server/odin/video/fixtures.ts) and returns the
  // real URL built from those IDs. Resolved once per generation and the
  // concrete URL is baked into the cached manifest — safe since the shared
  // fixture's IDs never change once created.
  entryUrl: string | (() => Promise<string>);
  sourceFiles: string[];
  // The "Add a Mountain" flow necessarily submits the real Create Mountain
  // form when recorded — this seeds it with a real, defunct ski area's data
  // (Mount Tom Ski Area, Holyoke MA, closed 1998) instead of an invented
  // fixture name, and the created record is deleted after each dry
  // run/real run (see pipeline.ts) rather than kept, since regenerating
  // this flow submits the form again every time.
  fixtureData?: Record<string, string>;
  // Steers manifest generation toward the happy path when there's no
  // existing helpVisuals.ts caption to lean on, or when the form has
  // conditional/dynamic fields an LLM reading the source cold wouldn't know
  // to simplify (e.g. AddAsset.tsx's category-dependent field sets).
  hint?: string;
  // Called after every dry run AND real run (pipeline.ts) — removes
  // whatever the flow just created so regenerating never accumulates
  // fixture debris. Not every flow persists via legacy_records (site
  // assessments use dedicated Postgres tables), so this is a callback
  // rather than a generic collection/name match.
  cleanup?: () => Promise<void>;
}

export const ODIN_VIDEO_FLOWS: Record<string, OdinVideoFlow> = {
  "add-mountain": {
    label: "Add a Mountain",
    entryUrl: "/mountains/new",
    sourceFiles: ["src/app/components/CreateMountain.tsx", "src/app/components/AddressAutocomplete.tsx"],
    fixtureData: {
      name: "Mount Tom Ski Area",
      address: "US Route 5, Smith's Ferry, Holyoke, MA",
      website: "https://mttom.com",
      trailCount: "15",
      verticalDrop: "680",
    },
    cleanup: async () => {
      await query(`DELETE FROM legacy_records WHERE collection='mountains' AND data->>'name' = $1`, ["Mount Tom Ski Area"]);
    },
  },
  "add-contact": {
    label: "Add a Contact",
    entryUrl: "/crm",
    sourceFiles: ["src/app/components/crm/CRM.tsx", "src/app/components/AddressAutocomplete.tsx"],
    hint: "This file contains multiple forms (contacts, organizations, teams). Demonstrate ONLY the contact form (ContactForm) — the one with First Name/Last Name/Email fields. Fill required fields only (First Name, Last Name, Email); skip optional fields like Slack ID, LinkedIn, extra emails, org/team association.",
    fixtureData: { firstName: "Jordan", lastName: "Rivers", email: "jordan.rivers@example.com" },
    cleanup: async () => {
      await query(`DELETE FROM legacy_records WHERE collection='contacts' AND data->>'email' = $1`, ["jordan.rivers@example.com"]);
    },
  },
  "add-organization": {
    label: "Add an Organization",
    entryUrl: "/crm",
    sourceFiles: ["src/app/components/crm/CRM.tsx", "src/app/components/AddressAutocomplete.tsx"],
    hint: "This file contains multiple forms (contacts, organizations, teams). Demonstrate ONLY the organization form (OrgForm). Fill the name and website; skip other optional fields.",
    fixtureData: { name: "Summit Resort Partners", website: "https://summitresortpartners.example.com" },
    cleanup: async () => {
      await query(`DELETE FROM legacy_records WHERE collection='organizations' AND data->>'name' = $1`, ["Summit Resort Partners"]);
    },
  },
  "add-team": {
    label: "Add a Team",
    entryUrl: "/crm",
    sourceFiles: ["src/app/components/crm/CRM.tsx", "src/app/components/AddressAutocomplete.tsx"],
    hint: "This file contains multiple forms (contacts, organizations, teams). Demonstrate ONLY the team form (TeamForm). Fill the name; skip optional fields like website, email, and numeric fields (leave at their 0 default).",
    fixtureData: { name: "Northeast Ops Team" },
    cleanup: async () => {
      await query(`DELETE FROM legacy_records WHERE collection='teams' AND data->>'name' = $1`, ["Northeast Ops Team"]);
    },
  },
  "add-inventory": {
    label: "Add Inventory",
    entryUrl: async () => {
      const { mountainId } = await ensureSharedFixtures();
      return `/mountains/${mountainId}/inventory/new`;
    },
    sourceFiles: ["src/app/components/AddAsset.tsx"],
    hint: "This form's fields change based on the selected Category dropdown. Pick the 'Camera' category specifically (its field set is the simplest) rather than Server or other categories with many required spec fields. Skip photo-capture buttons and Notes — not required.",
    fixtureData: { serialNumber: "CAM-DEMO-001" },
    cleanup: async () => {
      await query(`DELETE FROM legacy_records WHERE collection='assets' AND data->>'serialNumber' = $1`, ["CAM-DEMO-001"]);
    },
  },
  "create-project": {
    label: "Create a Project",
    entryUrl: async () => {
      const { mountainId } = await ensureSharedFixtures();
      return `/mountains/${mountainId}`;
    },
    sourceFiles: ["src/app/components/projects/ProjectsPane.tsx"],
    hint: "This pane is embedded on a mountain's detail page. Find its own 'New' button to open the project form (ProjectForm) — don't assume a separate route. Fill the Name field and pick a Type; skip Notes.",
    fixtureData: { name: "Video Install — Base Lodge" },
    cleanup: async () => {
      await query(`DELETE FROM legacy_records WHERE collection='projects' AND data->>'name' = $1`, ["Video Install — Base Lodge"]);
    },
  },
  "create-proposal": {
    label: "Create a Proposal",
    entryUrl: async () => {
      const { mountainId } = await ensureSharedFixtures();
      return `/mountains/${mountainId}`;
    },
    sourceFiles: ["src/app/components/projects/ProposalsPane.tsx", "src/app/components/ProposalBuilder.tsx"],
    hint: `ProposalsPane is embedded on a mountain's detail page — find its 'New' button (headingText 'Proposals'), which opens a modal listing projects without a proposal yet. There's always exactly one available project, named exactly "${FIXTURE_PROJECT_NAME}" — click it using by='role' with role='button' (not by='text', since the same name also appears in the page behind this modal). That navigates into ProposalBuilder.tsx for the actual proposal content — this form has several numeric fields that share the exact same generic placeholder text (e.g. multiple fields placeholder="1"), which cannot be reliably distinguished by placeholder alone. To avoid that, demonstrate ONLY the Legal Entity Name field (labelSibling) and then Save — skip every trail-line-item/pricing/terms/numeric field entirely, even though they're part of the happy path in a real proposal; this is a deliberate scope reduction for safe automation, not a mistake. The Save button appears twice on the page (a sticky action bar plus one in the form body) — both do the same thing, so use locator.first=true for that click.`,
    cleanup: clearFixtureProposal,
  },
  "trail-assessment": {
    label: "Do a Trail Assessment",
    entryUrl: async () => {
      const { mountainId, trailId } = await ensureSharedFixtures();
      return `/mountains/${mountainId}/trails/${trailId}`;
    },
    sourceFiles: ["src/app/components/TrailDetail.tsx", "src/app/components/SiteAssessmentWorkspace.tsx"],
    hint: "TrailDetail.tsx has an 'Add Assessment' button (shown when the trail has no assessment yet) that navigates into SiteAssessmentWorkspace.tsx — a map/canvas toolbar, not a traditional form. Its buttons are identified by title attribute (by='title'), not label/placeholder. Demonstrate: click Add Assessment, then click just 2-3 toolbar tools (e.g. 'Select', 'Add Camera') to show the workspace — this tool doesn't need to place real items on the map, just show what the toolbar offers.",
    cleanup: async () => {
      const { mountainId } = await ensureSharedFixtures();
      await query(`DELETE FROM site_assessments WHERE mountain_id = $1`, [mountainId]);
    },
  },
};
