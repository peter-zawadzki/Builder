# BUILDER App — Data Structure & Architecture Overview

---

## Storage Architecture

The app is **offline-first** with three storage layers. Supabase is no longer
part of this picture — the backend is a Node/Hono API in front of Postgres
(see `docs/DEPLOYMENT.md`), running on a single EC2 instance in production.

| Layer | Contents |
|---|---|
| **localStorage** | Mountains, Locations, Assets, Trails, Notes, Options, Item Prices — the working cache the UI reads from |
| **IndexedDB** | Photos/videos (asset + location), Trail map annotations, Mountain documents, Offline write queue |
| **Postgres (cloud API)** | Authoritative source, reached via `/api/legacy/*` (see below). Synced on load + writes. Falls back to the local cache when unreachable. |

All writes go **local first → sync queue → cloud**. If offline, mutations sit
in an IndexedDB queue and flush automatically when connectivity returns.

**Auth is Clerk**, not a shared password — see "Passwords" at the bottom.

### The legacy JSONB layer (important, easy to miss)

The database has real normalized tables (`mountains`, `trails`, `locations`,
`projects`, etc. — see `db/README.md`), but the frontend does **not** talk to
them. Every mountain/trail/location/note/contact read or write goes through
`/api/legacy/*`, which stores each record as a JSONB blob in one
`legacy_records` table (migration `0010_legacy_records.sql`). The dedicated
`/api/mountains`, `/api/trails`, `/api/locations` REST routes and their
backing tables exist and are migrated-into, but are effectively dead code —
nothing in the running app calls them. `users` (Clerk-synced) is the one
normalized table that *is* live and authoritative.

This matters whenever a new feature needs a real foreign key into "whichever
mountain/project the user is looking at": Postgres has no way to enforce a
`REFERENCES` constraint against a JSONB blob table, so those columns
(`site_assessments.mountain_id`, `.project_id`) are plain unconstrained
`uuid` columns, not real FKs.

---

## Core Data Models

### Mountain
The top-level entity. Everything else hangs off it.

```
Mountain {
  id, name, address, phone, email, website
  parentOrganization, legalEntity, billingAddress
  adminContact, technicalContact, additionalContacts[]
  ipSubnet, timingSystems[], region
  trailCount, acreage, verticalDrop
  proposalCreated, proposalCreatedAt
  trailMapType, trailMapAnnotations[]
  invoice { invoiceNumber, lineItems[], subtotal, balanceDue }
}
```

### Trail
Ski trails belonging to a mountain. Used to organize Locations.

```
Trail {
  id, mountainId, name, notes, isNastar
  annotations[]   ← drawn on trail map image
}
```

### Location
A physical installation site on a trail (camera pole, equipment box, etc.).
Every item placed via the Site Assessment map tools (see below) is also a
real `Location` — same record, same `LocationDetail` page, same photos/notes
— just tagged with `deviceType` so it carries type-specific fields too.

```
Location {
  id, mountainId, trailId, name
  coordinates { latitude, longitude }
  originalCoordinates { latitude, longitude, recordedAt }
  difficulty          ← 1–5 installation difficulty rating (not shown for
                         Start/Finish or Building devices)
  locationType         ← 'Install Site' | 'Power' | 'Start' | 'Finish'
                         (Start/Finish also set via deviceType='startfinish')
  isLocked             ← prevents accidental map drag once placed
  deviceType?          ← 'camera' | 'server' | 'network' | 'power' |
                         'building' | 'misc' | 'startfinish' — set only for
                         items placed from the Site Assessment/Map View
                         toolbar, not classic locations
  deviceProperties?    ← type-specific fields, see utils/deviceTypes.tsx:
                         camera: { heading, horizontalFov, rangeMeters,
                           networkConnection, powerStatus, powerVoltage, color }
                         network: { items: [{subtype, status}], networkConnection }
                         power: { status, voltage }
                         startfinish: { disciplines: string[] }
  inspections          ← historical per-location checklist (see Inspection,
                         below — creation retired, viewing/PDF export live on)
}
```

Photos/videos live in IndexedDB (`locationMediaDB`) with a cloud fallback
(`cloudLocationSync`), reused identically by the classic "Add Location" flow
and every Site Assessment device panel.

### Asset
Dual-purpose: both **location-installed gear** (legacy) and **admin inventory items** (new system). The `inventoryCategory` field distinguishes them.

```
Asset {
  id
  mountainId         ← links to Mountain (set on inventory items)
  locationId         ← links to Location (set when deployed to a site)

  // Legacy install fields
  type               ← 'Camera' | 'Network Gear' | 'Server' | 'Miscellaneous'
  manufacturer, model, serialNumber, ipAddress
  networkCategory, formFactor, processorModel, gpuModel, ram...

  // Inventory management fields
  yullrInventoryNumber    ← manual entry e.g. YIN-000042
  dateAddedToInventory
  inventoryCategory       ← 'Cameras' | 'Network Equipment' |
                            'Server Hardware' | 'Miscellaneous Items' |
                            'Office Equipment'
  inventorySubcategory    ← category-specific (CPU, GPU, Switch, etc.)
  inventoryStatus         ← auto-set: 'In Stock' | 'Deployed' |
                            'In a Build' | 'Retired'
  vendor, dateOfPurchase, upc, cost
  mountainDeployment      ← mountain name string
  deploymentLog[]         ← audit trail { mountainName, timestamp }

  // Server build fields
  serverComponentIds[]    ← asset IDs of parts inside this server
  serverId                ← which server this part belongs to
  buildDate

  // Photos (stored in IndexedDB, not localStorage)
  serialPhoto, installPhoto, internalPhoto, externalPhoto, miscPhotos[]
}
```

### MountainNote
Timestamped notes with topics and progress tracking.

```
MountainNote {
  id, mountainId
  topic   ← 'Demo' | 'Site Visit' | 'Proposal' | 'Install' |
            'Training' | 'Updates'
  text, entries[]  ← additional timestamped entries
  scheduled, completed
  installProgress  ← 0 / 25 / 50 / 75 / 100
  createdAt, updatedAt
}
```

### Options
Key-value store for all admin-managed dropdowns.

```
options: Record<string, string[]>

Key patterns:
  equipment:items                            ← site inspection checklist items
  equipment:hiddenBuiltIns                   ← hidden built-in inspection items
  misc:installItems                          ← miscellaneous install items (legacy)
  inventory:mfr:{category}                   ← e.g. inventory:mfr:Cameras
  inventory:mdl:{category}:{manufacturer}    ← e.g. inventory:mdl:Cameras:Dahua
```

---

## Site Assessment (mountain-wide map survey)

A Mapbox GL-based virtual site survey tool, separate from the classic
Leaflet/OSM "Add Location" map picker. Lets someone place cameras (with a
live heading/FOV/range coverage cone), network/power/building/misc equipment,
and Start/Finish lines directly on a satellite map of the mountain, live on a
call with a resort rep. Every item placed this way is a real `Location` (see
above) — nothing about photos, notes, or visibility is second-class compared
to a classically-added location.

```
site_assessments              (Postgres, unconstrained mountain_id/project_id
                                — see "legacy JSONB layer" above)
  ├─ site_assessment_participants
  ├─ site_assessment_objects           (Phase 2/3 — not the same as Location;
  │                                     see note below)
  ├─ site_assessment_object_relationships
  ├─ site_assessment_annotations
  └─ site_assessment_measurements
```

> Note: the original schema (`0012_site_assessments.sql`) planned a separate
> `site_assessment_objects` table for placed items. In practice, the shipped
> feature places real `Location` rows instead (tagged with `deviceType`), so
> every device is visible everywhere a Location already is (Trail detail,
> Documents, Map View) without a second object model to keep in sync. The
> `site_assessment_objects` table exists in the schema but isn't the thing
> being read/written by the current UI.

- **Entry points:** `/mountains/:mountainId/site-assessments/:id`
  (`SiteAssessmentWorkspace.tsx`), reached either from the mountain's Site
  Assessments pane or via a Trail's "Add Location" button (which auto-creates
  or prompts you to choose a Site Assessment via `useAddLocationToMap.ts` /
  `ChooseSiteAssessmentModal.tsx`).
- **Shared device UI:** `LocationPropertiesPanel.tsx` — the add/edit panel for
  every device type, used by both `SiteAssessmentWorkspace` (editable, can
  drag/place) and `MountainMapView.tsx` (view-only overview map — no add,
  edit, or drag there; edits happen in a Site Assessment).
- **Viewing a location's full detail** (notes, photos/videos, annotations)
  from either map, or from Trail Detail, opens `LocationDetail.tsx` inside a
  centered modal rather than navigating away from the map.
- **Marker rendering gotcha:** the marker-sync effects in both
  `SiteAssessmentWorkspace.tsx` and `MountainMapView.tsx` depend on the
  mountain's location list — that list **must** be `useMemo`'d off the raw
  `locations` array from `DataContext`, not recomputed with a fresh
  `.filter()` every render. Continuous re-renders (e.g. the tilt/rotate
  slider sync firing on every Mapbox `pitch`/`rotate` event during a drag)
  will otherwise tear down and rebuild every marker on the map mid-gesture.

### Inspection (legacy, creation retired)

The original per-Location equipment checklist (camera/POE/wireless/power
counts, 1–5 difficulty, notes). **Creating new Inspections is retired** —
superseded by Site Assessment devices — but historical Inspection data,
`ProposalBuilder` integration, and PDF export are all untouched and still
work for existing records.

---

## Inventory System

The admin inventory is a separate management layer built on top of the existing Asset model.

### Add Item Flow

```
Step 1 → Pick category:
           Cameras | Server Hardware | Network Equipment |
           Miscellaneous Items | Office Equipment

Step 2 → Fill category-specific form
```

### Category Forms

| Category | Fields |
|---|---|
| **Cameras** | YULLR Inv. # · Date Added · Manufacturer* · Model* · Serial (scan) · UPC (scan) · Vendor · Date of Purchase · Cost · Mountain · Notes |
| **Server Hardware (parts)** | YULLR Inv. # · Date Added · Subcategory* · Manufacturer* · Model* · Serial (scan) · UPC (scan) · Vendor · Date of Purchase · Cost · Mountain · Notes |
| **Build Server** | YULLR Inv. # · Date Added · Component slots · Mountain — cost auto-rolls up from parts |
| **Network Equipment** | YULLR Inv. # · Date Added · Subcategory · Manufacturer · Model · Serial (scan) · UPC (scan) · Vendor · Date of Purchase · Cost · Mountain · Location · Notes |
| **Miscellaneous Items** | Same as Network Equipment |
| **Office Equipment** | Same as Network Equipment |

*\* Uses persistent dropdown with Add New. Model options are filtered by the selected manufacturer.*

### Server Build Cascade

Assigning a server to a mountain automatically sets `mountainDeployment` and `mountainId` on all its component parts. Components are marked **In a Build** and hidden from other server slot dropdowns until released.

### Server Component Slots

Case · Power · Motherboard · CPU · GPU · RAM · NVME · SSD · HDD · Cooling · Other

### Manufacturer / Model Dropdown Logic

Manufacturer and Model dropdowns are scoped **per category**. Camera manufacturers never appear in Network Equipment dropdowns, and vice versa.

```
Key pattern:
  Manufacturer list  →  inventory:mfr:{category}
  Model list         →  inventory:mdl:{category}:{manufacturer}

Example:
  inventory:mfr:Cameras              → ['Dahua', 'Hikvision', 'Axis']
  inventory:mdl:Cameras:Dahua        → ['SD49425XB', 'IPC-HDW2831T']
  inventory:mfr:Network Equipment    → ['Ubiquiti', 'Cisco', 'TP-Link']
  inventory:mdl:Network Equipment:Ubiquiti → ['USW-24-POE', 'UAP-AC-Pro']
```

Selecting a manufacturer in the form automatically filters the model dropdown to only show models previously entered for that manufacturer in that category.

---

## Subcategories Reference

| Category | Subcategories |
|---|---|
| Server Hardware | Case · Power · Motherboard · CPU · GPU · RAM · NVME · SSD · HDD · Cooling · Other · *(Complete Server — Build Server only)* |
| Network Equipment | Switch · Router · Access Point · PoE Injector · Media Converter · Firewall/Gateway · Cabling |
| Cameras | PTZ Camera · Fixed Camera · Lens · Mount/Housing · NVR/Recorder |
| Miscellaneous Items | Cables · Mounts/Brackets · Power/Transformers · Tools · Enclosures · Office Supplies · Other |
| Office Equipment | Computer · Monitor · Printer · Phone · Tablet · UPS/Battery Backup · Other |

---

## Notes & Proposals Flow

```
Note created manually
  → topic = 'Demo' | 'Site Visit' | 'Proposal' | 'Install' | 'Training' | 'Updates'
  → installProgress = 0 / 25 / 50 / 75 / 100

Proposal Builder
  → creates Note with topic = 'Proposal'
  → generates signed proposal PDF via SignaturePad
  → on signing → auto-creates Invoice
  → sends Postmark email to support@yullr.com + CC recipients

Customer Agreement
  → separate public signing page
  → on signing → Postmark notification
```

---

## Sales Pipeline (Mountain List View)

Mountains are color-coded by days since last activity:

| Color | Days Since Last Activity |
|---|---|
| 🟢 Green | 1–10 days |
| 🟡 Yellow | 11–22 days |
| 🔴 Red | 22+ days |

---

## Route Structure

Source of truth: `src/app/routes.tsx`. Auth is Clerk, not a password gate —
`/sign-in`, `/sign-up` are public; everything under `RootLayout` requires a
signed-in user (role-gating for admin-only pages happens inside the page, via
the `user_role` column, not via routing).

```
/sign-in/*                                   Clerk sign-in
/sign-up/*                                   Clerk sign-up (invite ticket)
/portal/:mountainId                          Public mountain portal
/sign/:token                                 Public proposal signing page
/agreement-sign/:token                       Public agreement signing page

/                                             Home dashboard
/mountains                                   Mountains list (pipeline view)
/inventory                                   Inventory management
/inspection-items                            Inspection checklist item editor
/proposal-terms · /proposal-template         Proposal boilerplate editors
/agreement-template · /contact-tags          Agreement/contact-tag editors
/resources                                   Resource Center
/crm                                         CRM (contacts/organizations)
/team/*                                      Team management
/system-check                                Health/diagnostics page

/mountains/new                               Create mountain
/mountains/:mountainId                       Mountain detail
/mountains/:mountainId/edit                  Edit mountain
/mountains/:mountainId/proposal/:proposalId  Proposal builder
/mountains/:mountainId/agreement             Customer agreement
/mountains/:mountainId/invoice               Invoice viewer
/mountains/:mountainId/site-assessments/:id  Site Assessment map workspace
/mountains/:mountainId/trails/new            Create trail
/mountains/:mountainId/trails/:trailId       Trail detail
/mountains/:mountainId/trails/:trailId/locations/new   Add location to a trail
/mountains/:mountainId/inventory/new         Add asset (mountain-level)
/mountains/:mountainId/locations/new         Create location (map picker)
/mountains/:mountainId/locations/:locationId          Location detail
/mountains/:mountainId/locations/:locationId/edit     Edit location
/mountains/:mountainId/locations/:locationId/inspection        Add inspection (legacy — see below)
/mountains/:mountainId/locations/:locationId/assets/new        Add asset to location
/mountains/:mountainId/locations/:locationId/assets/:assetId   Asset detail
/mountains/:mountainId/locations/:locationId/assets/:assetId/edit  Edit asset
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/app/routes.tsx` | Route table — source of truth for what's reachable |
| `src/app/context/DataContext.tsx` | All state, CRUD methods, sync logic, type definitions, `/api/legacy` calls |
| `src/app/components/AdminCatalog.tsx` | Admin sub-pages (Inventory, Inspection Items, templates, contact tags) |
| `src/app/components/InventoryTab.tsx` | Full inventory UI — list, add/edit modal, barcode scanner, server builder |
| `src/app/components/MountainDetail.tsx` | Mountain homepage with inline inventory detail modal |
| `src/app/components/MountainNotes.tsx` | Notes with topic tagging and progress tracking |
| `src/app/components/LocationDetail.tsx` | Location detail modal — media gallery, image annotation, inspections (view-only) |
| `src/app/components/SiteAssessmentWorkspace.tsx` | Mapbox map workspace for placing/editing devices on a Site Assessment |
| `src/app/components/MountainMapView.tsx` | View-only mountain-wide Mapbox overview map |
| `src/app/components/LocationPropertiesPanel.tsx` | Shared add/edit panel for every device type, used by both maps above |
| `src/app/utils/deviceTypes.tsx` | Device type config, marker icons/colors, per-type properties shapes |
| `src/app/hooks/useAddLocationToMap.ts` | Trail "Add Location" → Site Assessment handoff (auto-create/choose) |
| `src/app/components/AddAsset.tsx` | Legacy location-level asset creation form |
| `src/app/utils/offlineQueue.ts` | IndexedDB write queue for offline mutations |
| `src/app/utils/photoDB.ts` | IndexedDB photo storage for assets |
| `src/app/utils/locationMediaDB.ts` | IndexedDB photo/video storage for locations |
| `src/app/utils/exportUtils.ts` | PDF and CSV report generation |
| `src/app/utils/cloudPhotoSync.ts` / `cloudLocationSync.ts` | Upload/fetch asset/location photos to/from the server |
| `server/routes/siteAssessments.ts` | Site Assessment CRUD API |
| `server/routes/legacy.ts` | The `/api/legacy/*` JSONB-blob API the frontend actually uses |

---

## Auth & Access

No shared passwords — sign-in is Clerk (`/sign-in`, `/sign-up`), reusing the
**development** Clerk instance in production too (see `docs/DEPLOYMENT.md`,
"Known gaps"). Every request through the API is authenticated via
`requireAuth`, which finds-or-creates a row in Postgres `users` from the
Clerk session. Per-user access level is the `user_role` enum on that table
(`user` / `admin` / `super_admin`, migration `0011_user_roles.sql`) — checked
in-page (e.g. the Inspection-item catalog is super-admin-only), not via route
guards.
