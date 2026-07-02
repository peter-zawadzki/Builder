# YULLR CRM — User Stories (v3)
## A CRM Section Inside the Mountain Builder

---

## Architecture Concept

The CRM is a *section within the Builder app*, sitting alongside the existing Mountains list and Admin panel. It has its own navigation area but shares the same data layer (DataContext, localStorage, IndexedDB, Supabase).

### Two-Way Data Flow
```
┌─────────────────────────────────────────────────────┐
│                   BUILDER APP                       │
│                                                     │
│  ┌──────────────┐          ┌──────────────────┐     │
│  │  MOUNTAINS   │◄────────►│      CRM         │     │
│  │              │  shared  │                  │     │
│  │ • Trails     │  data    │ • Contacts       │     │
│  │ • Locations  │  layer   │ • Organizations  │     │
│  │ • Assets     │          │ • Pipeline Board │     │
│  │ • Notes      │          │ • Activity Feed  │     │
│  │ • Proposals  │          │ • Dashboard      │     │
│  │ • Invoices   │          │ • Follow-ups     │     │
│  └──────────────┘          └──────────────────┘     │
│           │                        │                │
│           └───────┬────────────────┘                │
│                   ▼                                 │
│          Shared DataContext                         │
│    localStorage + IndexedDB + Supabase              │
└─────────────────────────────────────────────────────┘
```

**CRM reads FROM Mountains:**
- Auto-populates contacts from existing `adminContact`, `technicalContact`, `additionalContacts[]`
- Pulls in notes/activity history from MountainNote
- Derives pipeline stage from existing mountain data
- Shows install progress, proposal status, invoice status

**CRM writes TO Mountains:**
- Creating/editing a contact in the CRM updates the linked Mountain's contact fields
- Advancing pipeline stage in the CRM updates the Mountain record
- Logging activity in the CRM creates a MountainNote on the linked Mountain
- Setting deal owner / next action in CRM writes to the Mountain model

---

## Updated Route Structure

```
/                                Mountains list (existing)
/admin                           Admin panel (existing)
/mountains/:id                   Mountain detail (existing)
  ... (all existing mountain routes unchanged)

/crm                             CRM landing — Dashboard
/crm/contacts                    Contact directory
/crm/contacts/new                Create contact
/crm/contacts/:id                Contact detail
/crm/organizations               Organization directory
/crm/organizations/new           Create organization
/crm/organizations/:id           Organization detail
/crm/pipeline                    Pipeline board (kanban)
/crm/activity                    Global activity feed
/crm/follow-ups                  Follow-up task list
```

The app's top-level navigation gets a new section:
```
[ Mountains ]  [ CRM ]  [ Admin ]
```

---

## Personas
| Persona | Who | Primary Use |
|---------|-----|-------------|
| **Sales Lead** | Jeremy, RJ | Pipeline management, logging activity, follow-ups |
| **CEO** | Peter | Full visibility, stalled deals, forecasting, investor/advisor relationships |
| **CTO** | Sean | Hardware status, vendor relationships, install readiness |
| **Employee** | Any YULLR staff | Look up contacts, see status, stay informed |

---

## EPIC 1 — CRM Shell & Navigation

- **US-101** · As an *employee*, I want a "CRM" section in the Builder's top-level navigation (alongside Mountains and Admin), so I can access all relationship management in one click.
- **US-102** · As an *employee*, I want the CRM section to have its own sub-navigation: Dashboard, Contacts, Organizations, Pipeline, Activity, Follow-ups.
- **US-103** · As an *employee*, I want the CRM section to use the same design system, auth, and offline-first patterns as the rest of the Builder, so it feels native.
- **US-104** · As an *employee*, I want to click any mountain name within the CRM (pipeline board, contact detail, dashboard) and navigate to the existing Mountain detail page in the Mountains section — and vice versa, click a CRM link from a Mountain detail page to jump to that mountain's CRM view.

---

## EPIC 2 — Contact Directory (`/crm/contacts`)

### 2.1 Contact Entity & Data Flow
- **US-201** · As an *employee*, I want the CRM to auto-import contacts from all existing Mountain records (`adminContact`, `technicalContact`, `additionalContacts[]`) on first load, so I start with a populated directory — not an empty screen.
- **US-202** · As a *sales lead*, I want to create a new contact in the CRM with: name, type (Resort / Partner / Vendor / Investor / Advisor / Coach / General), organization, title, email, phone, tags, and notes.
- **US-203** · As a *sales lead*, I want to link a CRM contact to one or more mountains, and have that contact automatically appear in the Mountain's contact fields.
- **US-204** · As a *sales lead*, I want editing a contact in the CRM to update the linked Mountain record(s), and editing a Mountain's contacts to update the CRM — *two-way sync, single source of truth*.
- **US-205** · As an *employee*, I want a searchable, filterable contact list at `/crm/contacts` with columns: Name, Type, Organization, Mountain(s), Tags, Last Activity.
- **US-206** · As an *employee*, I want a contact detail page showing: contact info, linked mountain(s), linked organization, full activity timeline (pulled from MountainNote + CRM-logged activity), and attached files.

### 2.2 Contact Types & Tags
- **US-207** · As a *sales lead*, I want to filter contacts by type (Resort / Partner / Vendor / Investor / Advisor / Coach / General).
- **US-208** · As a *sales lead*, I want to tag contacts with roles: "Decision Maker," "Technical," "Champion," "Billing," "Legal" — so I know who handles what.
- **US-209** · As a *CEO*, I want to mark one contact per organization/mountain as "Primary," displayed prominently.
- **US-210** · As an *employee*, I want to search contacts by name, organization, email, mountain, or tag — global search across all fields.

### Data Model
```
Contact {
  id, name, email, phone
  type         ← 'Resort' | 'Partner' | 'Vendor' | 'Investor' |
                  'Advisor' | 'Coach' | 'General'
  title        ← role/title at their org
  organization ← text or organizationId
  tags[]       ← 'Decision Maker' | 'Technical' | 'Champion' |
                  'Billing' | 'Legal'
  isPrimary    ← boolean
  mountainIds[] ← linked Mountain IDs
  notes        ← rich text
  createdAt, updatedAt, updatedBy
}
```

### Two-Way Sync Logic
```
On CRM contact create/edit:
  → if contact.mountainIds includes a mountain
  → update that Mountain's adminContact / technicalContact /
    additionalContacts to reflect the change

On Mountain contact field edit:
  → find or create matching Contact record in CRM
  → update Contact fields to match
```

---

## EPIC 3 — Organizations (`/crm/organizations`)

- **US-301** · As a *sales lead*, I want to create organization records for non-mountain entities: partners (NASTAR, Live Timing), vendors (Quintegro, Exore), investor groups, advisory firms — with name, type, contacts, agreement details, key dates, and notes.
- **US-302** · As an *employee*, I want a list view at `/crm/organizations` filterable by type: Partner / Vendor / Investor Group / Advisory / Corporate Group.
- **US-303** · As an *employee*, I want an organization detail page showing: linked contacts, linked mountains (for corporate groups), activity timeline, files, and key dates (renewal, contract end, etc.).
- **US-304** · As a *CEO*, I want to create "Corporate Group" organizations (Boyne, Alterra, POWDR) and link mountains to them, so the CRM can group and filter resorts by corporate parent. This writes a `corporateGroup` tag back to the Mountain record.
- **US-305** · As a *CEO*, I want the corporate group page to show all linked mountains with their pipeline stages, creating a strategic roll-up view (e.g., "Boyne: 3 mountains — 1 Live, 1 Signed, 1 Positive").
- **US-306** · As a *CTO*, I want vendor organization pages to show contract terms, SOW status, deliverables, and linked contacts.
- **US-307** · As a *CEO*, I want investor/advisor org pages to show investment terms (amount, instrument, cap, interest, maturity) and communication history.

### Data Model
```
Organization {
  id, name
  type          ← 'Partner' | 'Vendor' | 'Investor Group' |
                   'Advisory' | 'Corporate Group'
  contactIds[]  ← linked Contact IDs
  mountainIds[] ← linked Mountain IDs (for corporate groups)
  agreementDetails ← text
  keyDates[]    ← [{ label, date }]  (renewal, expiry, etc.)
  files[]       ← attachments
  notes         ← rich text
  createdAt, updatedAt, updatedBy
}
```

### Mountain Model Extension
```
Mountain (add) {
  corporateGroup  ← 'Boyne' | 'Alterra' | 'POWDR' | 'Independent' | null
  organizationId  ← links to corporate group Organization
}
```

---

## EPIC 4 — Enhanced Pipeline (`/crm/pipeline`)

*The existing mountain list at `/` stays as-is (activity-recency colors). The CRM gets a dedicated stage-based pipeline view.*

### 4.1 Pipeline Stages
- **US-401** · As a *sales lead*, I want each mountain to have an explicit pipeline stage: *Prospect → Contacted → Demo Scheduled → Positive → Verbal Yes → Contract Sent → Signed → Installing → Live → Churned* — stored on the Mountain record.
- **US-402** · As a *sales lead*, I want a kanban board at `/crm/pipeline` showing mountain cards in stage columns, so I can see the full funnel at a glance.
- **US-403** · As a *sales lead*, I want to drag a mountain card between columns (or update via dropdown on the card) to advance its stage. The change should auto-log a MountainNote with topic "Updates" on that mountain.
- **US-404** · As an *employee*, I want to see the pipeline stage as a color-coded badge on every mountain card — in both the CRM pipeline view *and* the existing Mountains list view at `/`.

### 4.2 Stalled Tracking
- **US-405** · As a *sales lead*, I want to flag a mountain as "Stalled" with a required reason ("No response," "Waiting on legal," "Budget hold," "Timing — offseason," "Other"), so the team knows *why* something isn't moving.
- **US-406** · As a *CEO*, I want stalled mountains to have a visual indicator (icon/badge) on the pipeline board and mountain list, with the stall reason visible on hover or inline.
- **US-407** · As a *CEO*, I want to filter the pipeline board to show *only* stalled mountains, sorted by days stalled.
- **US-408** · As a *sales lead*, I want to un-stall a mountain (clear the flag), which auto-logs a note recording what restarted the conversation.

### 4.3 Deal Ownership & Next Actions
- **US-409** · As a *CEO*, I want to assign a deal owner (YULLR team member) to each mountain. This writes to the Mountain record and is visible in both the CRM pipeline and the Mountains section.
- **US-410** · As a *sales lead*, I want to set a "Next Action" (text) and "Next Action Date" on a mountain, visible on the pipeline card and mountain detail.
- **US-411** · As an *employee*, I want to filter the pipeline by deal owner, so I can see just my book of business.
- **US-412** · As a *CEO*, I want mountains with overdue next actions to be visually flagged (e.g., red date) on the pipeline board.

### 4.4 Deal Financials
- **US-413** · As a *sales lead*, I want to record estimated deal value and close probability on a mountain. This reads from existing invoice data where available and allows manual entry for pipeline deals.
- **US-414** · As a *CEO*, I want to see summed pipeline value and weighted pipeline value (value × probability) at the top of the pipeline board, and broken down by stage.

### Mountain Model Extension
```
Mountain (add) {
  pipelineStage     ← enum (US-401 stages)
  isStalled         ← boolean
  stallReason       ← text
  stalledAt         ← date
  dealOwner         ← employee name
  nextAction        ← text
  nextActionDate    ← date
  estimatedDealValue ← currency
  closeProbability   ← 0–100
}
```

### Data Flow
```
CRM Pipeline board ←→ Mountain record
  • Stage change in CRM → updates Mountain.pipelineStage
  • Stage change also creates MountainNote { topic: 'Updates',
      text: 'Pipeline stage changed: Positive → Verbal Yes' }
  • Mountain detail page shows current stage (read from same field)
  • Existing activity-recency colors at / remain independent
```

---

## EPIC 5 — Activity & Follow-ups

### 5.1 Global Activity Feed (`/crm/activity`)
- **US-501** · As a *CEO*, I want a global activity feed at `/crm/activity` showing the most recent notes, stage changes, stall flags, and follow-ups across *all* mountains and contacts — pulled from MountainNote + CRM activity.
- **US-502** · As an *employee*, I want to filter the global feed by: mountain, contact, organization, note topic, or team member.
- **US-503** · As an *employee*, I want each activity entry to deep-link to the source (mountain detail page, contact page, or pipeline card).

### 5.2 CRM-to-Mountain Note Logging
- **US-504** · As a *sales lead*, I want to log an activity from within the CRM (on a contact page, org page, or pipeline card) and have it automatically create a MountainNote on the linked mountain with the correct topic — so I don't have to navigate to the Mountain section to record interactions.
- **US-505** · As an *employee*, I want all MountainNotes created from the Mountains section to automatically appear in the CRM's activity feed and on linked contact pages — so data flows both ways.

### 5.3 Follow-up System (`/crm/follow-ups`)
- **US-506** · As a *sales lead*, I want to set a follow-up date and owner on any note (MountainNote or CRM activity), so I get reminded to circle back.
- **US-507** · As an *employee*, I want a "My Follow-ups" view at `/crm/follow-ups` showing all my upcoming and overdue follow-ups, sorted by date, with links to the related mountain/contact/org.
- **US-508** · As a *CEO*, I want to toggle "My Follow-ups" to "All Follow-ups" to see the team's entire follow-up queue and spot overdue items.
- **US-509** · As an *employee*, I want overdue follow-ups to be flagged with a count badge on the CRM nav item, so they're impossible to miss.

### 5.4 Notes Enhancement
- **US-510** · As a *sales lead*, I want a new MountainNote topic: "Follow-up" — alongside Demo, Site Visit, Proposal, Install, Training, Updates — for tracking outreach.
- **US-511** · As a *sales lead*, I want to attach files to any CRM activity entry, with files stored in IndexedDB + Supabase following existing photo patterns.

### MountainNote Extension
```
MountainNote (add) {
  followUpDate   ← date (optional)
  followUpOwner  ← employee name
  contactId      ← optional, links to CRM Contact
  organizationId ← optional, links to Organization
  source         ← 'mountain' | 'crm' (where it was created)
}

topic enum add: 'Follow-up'
```

---

## EPIC 6 — CRM Dashboard (`/crm`)

- **US-601** · As a *CEO*, I want `/crm` to land on a dashboard showing:
  - *Pipeline summary* — mountains per stage (horizontal bar or counts)
  - *Stalled deals* — count + list with reasons and days stalled
  - *Overdue follow-ups* — count + list
  - *Recent activity* — last 10 entries across all mountains
  - *Quick stats* — total mountains, live count, pipeline count, total contacts
- **US-602** · As a *CEO*, I want a financial summary card: implementation fees invoiced (pulled from existing Mountain invoice data), estimated pipeline value, and weighted value.
- **US-603** · As a *sales lead*, I want each dashboard card to be clickable — e.g., "Stalled (5)" links to `/crm/pipeline?filter=stalled`, "Overdue Follow-ups (3)" links to `/crm/follow-ups?filter=overdue`.
- **US-604** · As a *CEO*, I want a corporate group breakdown: Boyne (3 mountains — 1 Live, 1 Signed, 1 Positive), Alterra (2 mountains — 2 Contacted), Independent (12 mountains), etc.
- **US-605** · As an *employee*, I want the dashboard data to be computed from the shared DataContext (same data the Mountains section uses), not a separate data source — so it's always in sync and works offline.

---

## EPIC 7 — Search, Filtering & Data Management

### 7.1 Global Search
- **US-701** · As an *employee*, I want a search bar in the CRM nav that searches across mountains, contacts, organizations, and notes — returning grouped results with deep links.

### 7.2 Advanced Filters
- **US-702** · As a *sales lead*, I want to filter the pipeline board by: stage, corporate group, deal owner, region/state, stalled status, or next action date.
- **US-703** · As a *sales lead*, I want to filter the contact list by: type, tags, linked mountain, organization, or last activity date.
- **US-704** · As a *CEO*, I want to save filter presets (e.g., "My Stalled Deals," "Boyne Resorts," "Needs Follow-up This Week") for quick access.

### 7.3 Import / Export
- **US-705** · As a *CEO*, I want to bulk-import contacts from CSV into the CRM, with the import wizard mapping columns to Contact fields and optionally linking to existing mountains by name.
- **US-706** · As a *sales lead*, I want to export any filtered CRM view (contacts, pipeline, organizations) to CSV, reusing existing `exportUtils.ts` patterns.

### 7.4 Data Sync
- **US-707** · As a *CTO*, I want Contact and Organization data to follow the same offline-first sync pattern (localStorage → IndexedDB write queue → Supabase) as existing Mountain data, managed through the shared DataContext.

---

## Implementation Priority

### Phase 1 — MVP: Pipeline + Contacts
*Goal: Give the team immediate visibility into deal status and a single contact directory.*

| # | Stories | What It Does |
|---|---------|--------------|
| 1 | US-101–104 | CRM shell, navigation, cross-linking to Mountains |
| 2 | US-401–404 | Pipeline stages on Mountain model + kanban board |
| 3 | US-405–408 | Stalled deal tracking with reasons |
| 4 | US-409–412 | Deal ownership + next actions |
| 5 | US-201–206 | Contact directory with auto-import from existing mountains |
| 6 | US-601, 603, 605 | Basic dashboard (pipeline summary, stalled count, quick stats) |

### Phase 2 — Depth: Organizations + Activity
| # | Stories | What It Does |
|---|---------|--------------|
| 1 | US-301–305 | Organizations + corporate group linking |
| 2 | US-501–505 | Global activity feed + CRM↔Mountain note sync |
| 3 | US-506–509 | Follow-up reminders + "My Follow-ups" view |
| 4 | US-413–414 | Deal financials + weighted pipeline |
| 5 | US-602, 604 | Financial dashboard card + corporate group breakdown |
| 6 | US-701–703 | Global search + advanced filters |

### Phase 3 — Polish: Full CRM
| # | Stories | What It Does |
|---|---------|--------------|
| 1 | US-306–307 | Vendor/partner/investor detail profiles |
| 2 | US-207–210 | Contact tags, primary flags, search |
| 3 | US-510–511 | Enhanced notes (follow-up topic, attachments) |
| 4 | US-704 | Saved filter presets |
| 5 | US-705–707 | CSV import/export, offline sync for new models |

---

## Summary of Mountain Model Changes

All CRM features write back to the Mountain model via DataContext, keeping it the single source of truth for resort data.

```
Mountain (new fields) {
  // Pipeline (Epic 4)
  pipelineStage      ← enum
  isStalled          ← boolean
  stallReason        ← text
  stalledAt          ← date
  dealOwner          ← string
  nextAction         ← text
  nextActionDate     ← date
  estimatedDealValue ← currency
  closeProbability   ← number (0–100)

  // Organization linking (Epic 3)
  corporateGroup     ← enum
  organizationId     ← links to Organization record
}
```

New entities (Contact, Organization) are added to DataContext alongside Mountain, following the same CRUD + sync patterns.
