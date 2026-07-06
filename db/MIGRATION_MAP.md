# Supabase (old KV) → local normalized schema — field mapping

Source: the Supabase edge function GET endpoints. Volumes at time of writing:
22 mountains, 39 trails, 59 locations, 30 assets, 77 notes, 0 site-inspections,
picklist options, and an item-prices dict.

## mountains → `mountains` (+ `contacts`, `projects`)

Old mountain fields map straight across: `id, name, address, region,
billing_address, phone, email, website, legal_entity, notes, acreage,
vertical_drop, trail_count_stated (←trailCount), ip_subnet (←ipSubnet),
timing_systems (←timingSystems)`. `parentOrganization` is a string; kept as an
`app_options` picklist value and (if set) as the mountain's linked Organization
later — not a mountains column.

Embedded contacts → **`contacts`** rows (mountain_id = mountain):
- `adminContact` → contact + role `Admin` (skip if name is blank)
- `technicalContact` → contact + role `Technical`
- `additionalContacts[]` → one contact each; old `role` (Team/Operations/…)
  mapped to the nearest `contact_role` where possible, else no role tag.
- `technicalAdministrators[]` → contacts + role `Technical`.

Pipeline fields (`pipelineStage, isStalled, stallReason, stalledAt,
nextAction, estimatedDealValue, closeProbability`) → **one `projects` row per
mountain** (kind `Initial Install`). Old `pipelineStage` → new `project_stage`:
Prospect→`Intro / Lead`, Demo→`Demo`, Site Visit→`Site Assessment`,
Proposal→`Proposal`, Agreement→`Proposal`, Install→`Install`, Live→`Training`,
Churned→status `Cancelled`. Null → `Intro / Lead`.

`invoice` (single embedded, mostly null) → `invoices` row on the project when
present. `trailMapType` → a `documents` row (kind `trail_map`) if present.

## trails → `trails`

`id, mountain_id (←mountainId), name`. `notes`/`is_nastar` default when absent.

## locations → `locations` (+ `location_inspections`)

`id, mountain_id, name, notes`, `coordinates.{latitude,longitude}` →
`latitude/longitude`. `trailName` (free text) → resolve to `trail_id` by
matching a trail's name within the same mountain; keep unmatched as NULL trail.
`sync_status` = `Synced`. Embedded `inspection` → one `location_inspections`
row (`items` jsonb, `notes`).

## assets → `assets` (+ `equipment_catalog`)

`id, type, location_id (←locationId), serial_number, ip_address, notes,
is_draft`. `mountain_id` derived via the location. `manufacturer`/`model`
(strings, plus `customManufacturer`/`customModel`) → upsert
`equipment_catalog` (manufacturer, then model under it, category from asset
type) and link `manufacturer_id`/`model_id`. `trail` (free text on asset) is
dropped — trail is derived through the location.

## notes → `notes`

`id, mountain_id, text, created_at, updated_at`. Optional `topic, scheduled,
completed, install_progress, follow_up_date` carried when present.

## options → `app_options` (+ `equipment_catalog`)

Each `key → [values]` becomes `app_options(key, value)` rows. Additionally,
manufacturer/model keys (`camera:manufacturers`, `network:manufacturers`,
`server:manufacturers`, `*:models:*`, `inventory:mfr:*`, `inventory:mdl:*`)
seed `equipment_catalog` so the new asset/inventory UI has a real catalog.

## item-prices → `item_prices`

`{ name: price }` → one row each.

## Not migratable from the server

CRM `contacts` / `organizations` live only in browser localStorage in the old
app — the server has no copy. Only mountain-embedded contacts come across here.
A separate browser export is needed to bring CRM-only records over.
