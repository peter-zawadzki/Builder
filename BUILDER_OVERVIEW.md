# BUILDER App — Data Structure & Architecture Overview

---

## Storage Architecture

The app is **offline-first** with three storage layers:

| Layer | Contents |
|---|---|
| **localStorage** | Mountains, Locations, Assets, Trails, Notes, Options, Item Prices |
| **IndexedDB** | Photos (asset + location), Trail map annotations, Mountain documents, Offline write queue |
| **Supabase (cloud)** | Authoritative source. Synced on load + writes. Falls back to local cache when unreachable. |

All writes go **local first → sync queue → cloud**. If offline, mutations sit in an IndexedDB queue and flush automatically when connectivity returns.

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

```
Location {
  id, mountainId, trailId, name
  coordinates { latitude, longitude }
  difficulty  ← 1–5 installation difficulty rating
  inspection { items[], notes, createdAt }
}
```

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

```
/                               Mountains list (pipeline view)
/admin                          Admin panel  (password: Attitash)
  Inventory tab                 Full inventory management
  Inspection Items tab          Site inspection checklist editor

/mountains/new                  Create mountain
/mountains/:id                  Mountain detail
/mountains/:id/edit             Edit mountain
/mountains/:id/proposal         Proposal builder
/mountains/:id/agreement        Customer agreement
/mountains/:id/invoice          Invoice viewer
/mountains/:id/trails/new       Create trail
/mountains/:id/locations/new    Create location (map picker)
/mountains/:id/locations/:lid   Location detail (media, inspection)

/sign/:token                    Public proposal signing page
/agreement-sign/:token          Public agreement signing page
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/app/context/DataContext.tsx` | All state, CRUD methods, sync logic, type definitions |
| `src/app/components/AdminCatalog.tsx` | Admin panel shell + password gate |
| `src/app/components/InventoryTab.tsx` | Full inventory UI — list, add/edit modal, barcode scanner, server builder |
| `src/app/components/MountainDetail.tsx` | Mountain homepage with inline inventory detail modal |
| `src/app/components/MountainNotes.tsx` | Notes with topic tagging and progress tracking |
| `src/app/components/LocationDetail.tsx` | Location detail — media gallery, image annotation, inspection |
| `src/app/components/AddAsset.tsx` | Legacy location-level asset creation form |
| `src/app/utils/offlineQueue.ts` | IndexedDB write queue for offline mutations |
| `src/app/utils/photoDB.ts` | IndexedDB photo storage for assets |
| `src/app/utils/locationMediaDB.ts` | IndexedDB photo/video storage for locations |
| `src/app/utils/exportUtils.ts` | PDF and CSV report generation |
| `src/app/utils/cloudPhotoSync.ts` | Upload/fetch asset photos to Supabase Storage |

---

## Passwords

| Access Level | Password |
|---|---|
| Builder App | `BUILDER_PASSWORD` environment secret |
| Admin Panel | `Attitash` |
