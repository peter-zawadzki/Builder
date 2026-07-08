import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import * as photoDB from '../utils/photoDB';
import * as locMediaDB from '../utils/locationMediaDB';
import * as mountainDocsDB from '../utils/mountainDocumentsDB';
import * as imageAnnotationsDB from '../utils/imageAnnotationsDB';
import * as cloudPhotos from '../utils/cloudPhotoSync';
import * as cloudLocSync from '../utils/cloudLocationSync';
import * as cloudAnnotationSync from '../utils/cloudAnnotationSync';
import * as offlineQueue from '../utils/offlineQueue';
import { toast } from 'sonner';

export interface ContactNote {
  id: string;
  text: string;
  author: string;
  timestamp: string;
}

export interface Contact {
  name: string;
  title?: string;
  email: string;
  phone: string;
  phoneType?: 'Office' | 'Cell';
  role?: 'Admin' | 'Technical' | 'Team' | 'Operations';
  teamName?: string;
  notes?: string;
  contactNotes?: ContactNote[];
}

export interface TechAdmin {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface Invoice {
  invoiceNumber: string;
  date: string;
  subtotal: number;
  invoiceNumber1Percent: number; // e.g., 50 for 50%
  balanceDue: number;
  lineItems: {
    description: string;
    unitPrice: number;
    quantity: number;
    total: number;
  }[];
}

export interface Mountain {
  id: string;
  name: string;
  address: string;
  parentOrganization?: string;
  legalEntity?: string;
  billingAddress?: string;
  phone: string;
  email: string;
  website: string;
  notes?: string;
  ipSubnet?: string;
  timingSystems?: string[];
  adminContact: Contact;
  technicalContact: Contact;
  additionalContacts: Contact[];
  technicalAdministrators?: TechAdmin[];
  proposalCreated?: boolean;
  proposalCreatedAt?: string;  // ISO timestamp when proposal was created
  trailMapType?: 'image' | 'pdf';  // set when a trail map is stored in IndexedDB
  trailMapUploadedAt?: string;  // ISO timestamp when trail map was uploaded
  trailMapAnnotations?: Annotation[];  // annotations on the trail map image
  invoice?: Invoice;
  // Mountain stats
  trailCount?: number;
  acreage?: number;
  verticalDrop?: number;
  slackEmail?: string;
  region?: 'Rocky Mountains' | 'Sierra Nevada' | 'Pacific Northwest' | 'Northeast' | 'Mid-Atlantic' | 'Midwest';
  // Portal fields
  mountainLogo?: string;              // base64 — stored in IndexedDB key mountainLogo:{id}
  proposedInstallDates?: string[];    // up to 3 ISO dates, set by mountain rep on portal
  confirmedInstallDate?: string;      // set by YULLR in Builder
  invoicePaid?: boolean;              // toggled by YULLR in Builder
  onsiteContact?: {
    name: string;
    phone: string;
    contactId?: string;               // CRM contact ID if linked
  };
  // CRM fields
  pipelineStage?: PipelineStage;
  isStalled?: boolean;
  stallReason?: StallReason;
  stalledAt?: string;
  nextAction?: string;
  nextActionDate?: string;
  nextActionBy?: string;    // name of the user who set the next action
  nextActionAt?: string;    // when it was set (ISO)
  estimatedDealValue?: number;
  closeProbability?: number;
  corporateGroup?: string;
  organizationId?: string;
}

// ─── Inspection item types (shared between Location inspection + AddInspection) ─

export type SiteInspectionItemType =
  | 'Camera' | 'Battery Box' | 'POE Switch' | 'POE Extender'
  | 'Wireless RX' | 'Wireless TX' | 'Existing 120V' | 'Existing 480V'
  | 'Transformer Required' | 'Existing Data Drop' | 'Existing Fiber Drop'
  | 'Passive POE Adapter' | 'Ethernet Cable 50Ft' | 'Antenna Mount';

export const MULTI_COUNT_ITEMS: SiteInspectionItemType[] = [
  'Camera', 'Passive POE Adapter', 'Ethernet Cable 50Ft', 'Antenna Mount',
];

export interface SiteInspectionItem {
  type: SiteInspectionItemType;
  count: number;
}

// ─── Annotations ──────────────────────────────────────────────────────────────

export type AnnotationType = 'line' | 'area' | 'pin' | 'text';

export interface Annotation {
  id: string;
  type: AnnotationType;
  label?: string;
  notes?: string;
  color: string;
  // For lines: array of points [{x, y}, {x, y}, ...]
  // For areas: array of polygon points [{x, y}, {x, y}, ...] (closed path)
  // For pins: single point {x, y}
  points: Array<{ x: number; y: number }>;
  createdAt: string;
}

// ─── Trail ───────────────────────────────────────────────────────────────────

export interface Trail {
  id: string;
  mountainId: string;
  name: string;
  notes?: string;
  isNastar?: boolean;
  annotations?: Annotation[];
}

// ─── Unified Location (replaces InstallLocation + SiteInspectionLocation) ─────

export interface Location {
  id: string;
  mountainId: string;
  trailId?: string;        // links to a Trail record
  name: string;
  trailName?: string;      // legacy / display label
  notes?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5; // Installation difficulty rating
  locationType?: 'Install Site' | 'Power Location' | 'Start/Finish' | 'Misc.';
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  originalCoordinates?: {
    latitude: number;
    longitude: number;
    recordedAt: string;    // timestamp when original coordinates were captured
  };
  /** One inspection per location — optional, added separately after creation. */
  inspection?: {
    items: SiteInspectionItem[];
    notes?: string;
    createdAt: string;
  };
}

// ─── Asset ───────────────────────────────────────────────────────────────────

export type InventoryCategory = 'Server Hardware' | 'Network Equipment' | 'Cameras' | 'Miscellaneous Items' | 'Office Equipment';
export type InventoryStatus = 'In Stock' | 'Deployed' | 'In a Build' | 'Retired';

export const INVENTORY_SUBCATEGORIES: Record<InventoryCategory, string[]> = {
  'Server Hardware': ['Case', 'Power', 'Motherboard', 'CPU', 'GPU', 'RAM', 'NVME', 'SSD', 'HDD', 'Cooling', 'Other', 'Complete Server'],
  'Network Equipment': ['Switch', 'Router', 'Access Point', 'PoE Injector', 'Media Converter', 'Firewall/Gateway', 'Cabling'],
  'Cameras': ['PTZ Camera', 'Fixed Camera', 'Lens', 'Mount/Housing', 'NVR/Recorder'],
  'Miscellaneous Items': ['Cables', 'Mounts/Brackets', 'Power/Transformers', 'Tools', 'Enclosures', 'Office Supplies', 'Other'],
  'Office Equipment': ['Computer', 'Monitor', 'Printer', 'Phone', 'Tablet', 'UPS/Battery Backup', 'Other'],
};

export const MOUNTAIN_DEPLOYMENTS = [
  'Pats Peak', 'Wachusett', 'Cranmore', 'Waterville', 'Ski Ward',
  'Burke', 'Berkshire East', 'Attitash', 'DEMO', 'Unassigned / Warehouse',
];

export interface DeploymentLogEntry {
  mountainName: string;
  timestamp: string;
}

export interface Asset {
  id: string;
  mountainId?: string;   // mountain-level ownership — set when added to inventory
  locationId?: string;   // optional — unset means "in inventory, not yet installed"
  type: 'Camera' | 'Network Gear' | 'Miscellaneous' | 'Server';
  isDraft?: boolean;
  trail?: string;
  manufacturer?: string;
  customManufacturer?: string;
  model?: string;
  customModel?: string;
  serialNumber?: string;
  ipAddress?: string;
  serialPhoto?: string;
  installPhoto?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  notes?: string;
  networkCategory?: 'Wireless Links' | 'Network Hardware' | 'Miscellaneous';
  processorModel?: string;
  gpuModel?: string;
  ram?: string;
  motherboard?: string;
  osDiskSize?: string;
  captureDiskSize?: string;
  archiveDiskSize?: string;
  formFactor?: 'Tower' | 'Rack Mount';
  internalPhoto?: string;
  externalPhoto?: string;
  miscItems?: MiscItem[];
  miscPhotos?: string[];
  // ── Inventory Management fields ──────────────────────────────────────────
  yullrInventoryNumber?: string;
  dateAddedToInventory?: string;    // ISO date, defaults to creation date
  inventoryCategory?: InventoryCategory;
  inventorySubcategory?: string;
  inventoryStatus?: InventoryStatus;
  cost?: number;
  vendor?: string;
  dateOfPurchase?: string;          // ISO date string
  upc?: string;
  mountainDeployment?: string;      // from MOUNTAIN_DEPLOYMENTS
  deploymentLog?: DeploymentLogEntry[];
  serverId?: string;                // if assigned to a server build
  serverComponentIds?: string[];    // if this IS a server, the component asset IDs
  buildDate?: string;               // for server builds
}

// ─── CRM ─────────────────────────────────────────────────────────────────────

export type ContactType = 'Resort' | 'Partner' | 'Vendor' | 'Investor' | 'Advisor' | 'Coach' | 'Team' | 'General';
export type ContactTag = 'Decision Maker' | 'Technical' | 'Champion' | 'Billing' | 'Legal';
export type OrgType = 'Partner' | 'Vendor' | 'Investor Group' | 'Advisory' | 'Corporate Group';
export type PipelineStage =
  | 'Prospect' | 'Contacted' | 'Demo Scheduled' | 'Positive'
  | 'Verbal Yes' | 'Contract Sent' | 'Signed' | 'Installing' | 'Live' | 'Churned';
export type StallReason = 'No response' | 'Waiting on legal' | 'Budget hold' | 'Timing — offseason' | 'Other';

export interface ContactActivity {
  id: string;
  text: string;
  type: 'note' | 'action';
  completed?: boolean;
  completedAt?: string;
  createdAt: string;
}

export interface CRMContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: ContactType;
  title?: string;
  organizationId?: string;
  tags: ContactTag[];
  isPrimary: boolean;
  mountainId?: string;       // single linked mountain
  notes?: string;
  activities?: ContactActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface CRMOrganization {
  id: string;
  name: string;
  type: OrgType;
  contactIds: string[];
  mountainIds: string[];
  agreementDetails?: string;
  keyDates: { label: string; date: string }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type NoteTopic = 'Demo' | 'Site Visit' | 'Proposal' | 'Install' | 'Training' | 'Updates' | 'Follow-up';

export interface NoteEntry {
  id: string;
  text: string;
  timestamp: string;
}

export interface MountainNote {
  id: string;
  mountainId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  topic?: NoteTopic;
  scheduled?: boolean;
  completed?: boolean;
  installProgress?: number;
  entries?: NoteEntry[];
  // CRM extensions
  followUpDate?: string;
  source?: 'mountain' | 'crm';
  contactId?: string;
  organizationId?: string;
}

export interface MiscItem {
  type: string;
  customName?: string;
  count: number;
}

interface DataContextType {
  mountains: Mountain[];
  locations: Location[];
  assets: Asset[];
  trails: Trail[];
  notes: MountainNote[];
  contacts: CRMContact[];
  organizations: CRMOrganization[];
  options: Record<string, string[]>;
  itemPrices: Record<string, number>;
  addMountain: (mountain: Omit<Mountain, 'id'>) => string;
  updateMountain: (id: string, mountain: Partial<Mountain>) => void;
  deleteMountain: (id: string) => Promise<void>;
  addLocation: (location: Omit<Location, 'id'>) => string;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  deleteLocation: (id: string) => Promise<void>;
  addAsset: (asset: Omit<Asset, 'id'>) => string;
  updateAsset: (id: string, asset: Partial<Asset>) => void;
  deleteAsset: (id: string) => Promise<void>;
  addTrail: (trail: Omit<Trail, 'id'>) => string;
  updateTrail: (id: string, updates: Partial<Trail>) => void;
  deleteTrail: (id: string) => Promise<void>;
  getAssetById: (id: string) => Asset | undefined;
  getLocationsByMountainId: (mountainId: string) => Location[];
  getAssetsByLocationId: (locationId: string) => Asset[];
  getAssetsByMountainId: (mountainId: string) => Asset[];
  getTrailsByMountainId: (mountainId: string) => Trail[];
  getMountainById: (id: string) => Mountain | undefined;
  getLocationById: (id: string) => Location | undefined;
  getMountainTrailNames: (mountainId: string) => string[];
  getOptions: (key: string) => string[];
  addOption: (key: string, value: string) => void;
  deleteOption: (key: string, value: string) => void;
  setItemPrice: (name: string, price: number | null) => void;
  addNote: (mountainId: string, text: string, topic?: NoteTopic, scheduled?: boolean, completed?: boolean, installProgress?: number) => string;
  updateNote: (id: string, updates: Partial<Omit<MountainNote, 'id' | 'mountainId' | 'createdAt'>>) => void;
  deleteNote: (id: string) => void;
  getNotesByMountainId: (mountainId: string) => MountainNote[];
  // CRM
  addContact: (contact: Omit<CRMContact, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateContact: (id: string, updates: Partial<CRMContact>) => void;
  deleteContact: (id: string) => void;
  addOrganization: (org: Omit<CRMOrganization, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateOrganization: (id: string, updates: Partial<CRMOrganization>) => void;
  deleteOrganization: (id: string) => void;
  importContactsFromMountains: () => void;
  logActivity: (mountainId: string, type: string, summary: string) => void;
}

// Persist the context object on globalThis so that Vite's React Fast Refresh
// (HMR) doesn't create a new identity on every hot-reload.
const _CTX_KEY = '__skiInstall_DataContext__';
if (!(globalThis as any)[_CTX_KEY]) {
  (globalThis as any)[_CTX_KEY] = createContext<DataContextType | undefined>(undefined);
}
const DataContext = (globalThis as any)[_CTX_KEY] as ReturnType<typeof createContext<DataContextType | undefined>>;

// Fresh local cache namespace. Renamed from the old 'skiInstall_' prefix so the
// previously-cached Supabase data is never read again — a guaranteed clean slate
// on the local DB.
const STORAGE_KEYS = {
  MOUNTAINS: 'yullrLocal_mountains',
  LOCATIONS: 'yullrLocal_locations',
  ASSETS: 'yullrLocal_assets',
  NOTES: 'yullrLocal_notes',
  TRAILS: 'yullrLocal_trails',
  OPTIONS: 'yullrLocal_options',
  ITEM_PRICES: 'yullrLocal_item_prices',
  PENDING_PHOTOS: 'yullrLocal_pendingPhotoSync',
  CONTACTS: 'yullrLocal_crm_contacts',
  ORGANIZATIONS: 'yullrLocal_crm_organizations',
};

// Remove the old Supabase-era caches entirely (housekeeping). The prefix change
// above is what actually guarantees the fresh start; this just frees the space.
(function clearOldCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('skiInstall_'))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem('yullr_use_local');
  } catch { /* ignore */ }
})();

// ─── Tombstone helpers — track locally-deleted IDs so server data can't resurrect them ──

function getTombstones(type: string): string[] {
  try { return JSON.parse(localStorage.getItem(`yullrLocal_deleted_${type}`) || '[]'); }
  catch { return []; }
}
function addTombstone(type: string, id: string) {
  const current = getTombstones(type);
  if (!current.includes(id)) {
    localStorage.setItem(`yullrLocal_deleted_${type}`, JSON.stringify([...current, id]));
  }
}
function removeTombstone(type: string, id: string) {
  const current = getTombstones(type);
  localStorage.setItem(`yullrLocal_deleted_${type}`, JSON.stringify(current.filter(i => i !== id)));
}

// Fields that live in IndexedDB, never in localStorage or the server payload
const PHOTO_FIELDS = ['serialPhoto', 'installPhoto', 'internalPhoto', 'externalPhoto', 'miscPhotos'] as const;
type PhotoField = typeof PHOTO_FIELDS[number];

function stripPhotos(asset: Partial<Asset>): Partial<Asset> {
  const copy = { ...asset } as any;
  PHOTO_FIELDS.forEach(f => delete copy[f]);
  return copy;
}

function extractPhotoFields(asset: Partial<Asset>): Partial<Record<PhotoField, any>> {
  const photos: Partial<Record<PhotoField, any>> = {};
  PHOTO_FIELDS.forEach(f => {
    const val = (asset as any)[f];
    if (val !== undefined && val !== null && val !== '') photos[f] = val;
  });
  return photos;
}

/**
 * One-time migration: if localStorage assets still contain base64 photo fields
 * (from before IndexedDB was introduced), move them to IndexedDB and strip them.
 */
async function migratePhotosFromLocalStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ASSETS);
    if (!raw) return;
    const assets: Asset[] = JSON.parse(raw);
    let didMigrate = false;
    for (const asset of assets) {
      const photos = extractPhotoFields(asset);
      if (Object.keys(photos).length > 0) {
        await photoDB.savePhotos(asset.id, photos);
        didMigrate = true;
      }
    }
    if (didMigrate) {
      const stripped = assets.map(a => stripPhotos(a));
      localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(stripped));
      console.log('Migrated photos from localStorage → IndexedDB');
    }
  } catch (err) {
    console.error('Photo migration error:', err);
  }
}

// The app runs entirely on the local API, authenticated with the Clerk session
// token. There is no Supabase connection for data — local DB only.
const LOCAL_API_BASE = '/api/legacy';

let localTokenGetter: (() => Promise<string | null>) | null = null;
export function registerLocalTokenGetter(fn: () => Promise<string | null>) {
  localTokenGetter = fn;
}

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localTokenGetter ? await localTokenGetter() : null;
  const response = await fetch(`${LOCAL_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token ?? ''}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      errorMsg = body.error || body.message || errorMsg;
    } catch {
      try {
        const text = await response.text();
        if (text) errorMsg = text.slice(0, 200);
      } catch { /* ignore */ }
    }
    throw new Error(errorMsg);
  }
  return response.json();
}

/**
 * Route a write through the offline queue when offline, or attempt it
 * immediately and queue it as fallback if the network call fails.
 */
async function syncOrQueue(endpoint: string, method: string, body: string | null): Promise<void> {
  if (!navigator.onLine) {
    await offlineQueue.enqueue({ endpoint, method, body });
    return;
  }
  try {
    await apiCall(endpoint, {
      method,
      ...(body !== null ? { body } : {}),
    });
  } catch (err) {
    console.error(`Sync failed for ${method} ${endpoint} — queuing for retry:`, err);
    await offlineQueue.enqueue({ endpoint, method, body }).catch(() => {});
  }
}

// ── Pending photo upload helpers ──────────────────────────────────────────────

function getPendingPhotoIds(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_PHOTOS) || '[]'); }
  catch { return []; }
}
function addPendingPhoto(assetId: string) {
  const ids = getPendingPhotoIds();
  if (!ids.includes(assetId)) {
    localStorage.setItem(STORAGE_KEYS.PENDING_PHOTOS, JSON.stringify([...ids, assetId]));
  }
}
function removePendingPhoto(assetId: string) {
  const ids = getPendingPhotoIds();
  localStorage.setItem(STORAGE_KEYS.PENDING_PHOTOS, JSON.stringify(ids.filter(id => id !== assetId)));
}

// Fire-and-forget activity entry for the Updates feed. The server stamps which
// authenticated user performed the action.
function logActivity(mountainId: string | undefined, type: string, summary: string) {
  if (!mountainId) return;
  apiCall('/activity', { method: 'POST', body: JSON.stringify({ mountainId, type, summary }) }).catch(() => {});
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [mountains, setMountains] = useState<Mountain[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOUNTAINS) || '[]'); }
    catch { return []; }
  });
  const [locations, setLocations] = useState<Location[]>(() => {
    try {
      const locs: Location[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCATIONS) || '[]');
      // One-time migration: auto-link locations whose trailName matches an existing trail name
      const trailsArr: Trail[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRAILS) || '[]');
      return locs.map(loc => {
        if (loc.trailId || !loc.trailName) return loc;
        const match = trailsArr.find(t => t.mountainId === loc.mountainId && t.name === loc.trailName);
        return match ? { ...loc, trailId: match.id } : loc;
      });
    }
    catch { return []; }
  });
  const [assets, setAssets] = useState<Asset[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSETS) || '[]'); }
    catch { return []; }
  });
  const [trails, setTrails] = useState<Trail[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.TRAILS) || '[]'); }
    catch { return []; }
  });
  const [notes, setNotes] = useState<MountainNote[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTES) || '[]'); }
    catch { return []; }
  });
  const [options, setOptions] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.OPTIONS) || '{}'); }
    catch { return {}; }
  });
  const [itemPrices, setItemPrices] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ITEM_PRICES) || '{}'); }
    catch { return {}; }
  });
  const [contacts, setContacts] = useState<CRMContact[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTACTS) || '[]'); }
    catch { return []; }
  });
  const [organizations, setOrganizations] = useState<CRMOrganization[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ORGANIZATIONS) || '[]'); }
    catch { return []; }
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      await migratePhotosFromLocalStorage();

      // Merge IndexedDB photos into cached assets immediately
      try {
        const cachedRaw = localStorage.getItem(STORAGE_KEYS.ASSETS);
        if (cachedRaw) {
          const cachedAssets: Asset[] = JSON.parse(cachedRaw);
          const cachedPhotos = await photoDB.getAllPhotos().catch(() => ({}));
          setAssets(cachedAssets.map(a => ({ ...a, ...(cachedPhotos[a.id] || {}) })));
        }
      } catch { /* ignore */ }

      setIsLoading(true);
      try {
        // Snapshot local state BEFORE fetching so we can merge below.
        let localMountains: Mountain[] = [];
        let localLocations: Location[] = [];
        let localAssets: Asset[] = [];
        let localNotes: MountainNote[] = [];
        let localTrails: Trail[] = [];
        try { localMountains = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOUNTAINS) || '[]'); } catch {}
        try { localLocations = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCATIONS) || '[]'); } catch {}
        try { localAssets = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSETS) || '[]'); } catch {}
        try { localNotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTES) || '[]'); } catch {}
        try { localTrails = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRAILS) || '[]'); } catch {}

        // Fetch local photos first (IndexedDB — no network cost)
        const photoLookup = await photoDB.getAllPhotos().catch(() => ({}));

        const silent = () => null; // swallow per-call errors — one toast below covers it
        let backendUnreachable = false;

        // Batch 1: lightweight/config endpoints — run in parallel
        const [mountainsRes, locationsRes, trailsRes, optionsRes, pricesRes] = await Promise.all([
          apiCall('/mountains').catch(() => { backendUnreachable = true; return silent(); }),
          apiCall('/locations').catch(() => silent()),
          apiCall('/trails').catch(() => silent()),
          apiCall('/options').catch(() => silent()),
          apiCall('/item-prices').catch(() => silent()),
        ]);

        if (backendUnreachable) {
          console.warn('Backend unreachable — running from local cache');
        }

        // Batch 2: large collections
        const [assetsRes, notesRes] = await Promise.all([
          apiCall('/assets').catch(() => silent()),
          apiCall('/notes').catch(() => silent()),
        ]);

        // Merge helper: server is authoritative for items it knows about;
        // local-only items (not yet synced) are appended so they survive a refresh.
        // Also filters out any IDs that are tombstoned (user deleted them locally).
        function mergeById<T extends { id: string }>(server: T[], local: T[], tombstoneType: string): T[] {
          const deleted = new Set(getTombstones(tombstoneType));
          const filtered = server.filter(item => !deleted.has(item.id));
          const serverIds = new Set(filtered.map(item => item.id));
          const localOnly = local.filter(item => !serverIds.has(item.id) && !deleted.has(item.id));
          return [...filtered, ...localOnly];
        }

        if (mountainsRes) setMountains(mergeById(mountainsRes.mountains || [], localMountains, 'mountains'));
        if (locationsRes) setLocations(mergeById(locationsRes.locations || [], localLocations, 'locations'));
        if (trailsRes) setTrails(mergeById(trailsRes.trails || [], localTrails, 'trails'));
        if (assetsRes) {
          const serverAssets: Asset[] = assetsRes.assets || [];
          const merged = mergeById(serverAssets, localAssets, 'assets');
          const withPhotos = merged.map(a => ({ ...a, ...(photoLookup[a.id] || {}) }));
          setAssets(withPhotos);

          // In background: for any asset without local photos, fetch from cloud
          const noLocalPhotos = withPhotos.filter(a => {
            const fields = ['serialPhoto', 'installPhoto', 'internalPhoto', 'externalPhoto', 'miscPhotos'];
            return !fields.some(f => (a as any)[f]);
          });
          if (noLocalPhotos.length > 0) {
            cloudPhotos.fetchBatchPhotoUrls(noLocalPhotos.map(a => a.id))
              .then(urlMap => {
                if (Object.keys(urlMap).length === 0) return;
                setAssets(prev => prev.map(a => {
                  const urls = urlMap[a.id];
                  if (!urls) return a;
                  // Only apply cloud URLs where the asset still has no local photo
                  const patch: Partial<Asset> = {};
                  for (const [field, url] of Object.entries(urls)) {
                    if (!(a as any)[field]) (patch as any)[field] = url;
                  }
                  return Object.keys(patch).length ? { ...a, ...patch } : a;
                }));
                console.log(`Loaded cloud photos for ${Object.keys(urlMap).length} assets`);
              })
              .catch(e => console.error('Cloud photo load error:', e));
          }
        }
        if (notesRes) setNotes(mergeById(notesRes.notes || [], localNotes, 'notes'));
        if (optionsRes?.options) {
          // Merge server options with any locally-added options
          setOptions(prev => {
            const merged: Record<string, string[]> = { ...prev };
            const serverOpts = optionsRes.options as Record<string, string[]>;
            for (const key of Object.keys(serverOpts)) {
              const existing = merged[key] || [];
              const combined = [...new Set([...serverOpts[key], ...existing])].sort();
              merged[key] = combined;
            }
            return merged;
          });
        }
        if (pricesRes?.prices) {
          setItemPrices(prev => ({ ...prev, ...pricesRes.prices }));
        }
        console.log('Data loaded successfully (mountains, locations, trails, assets, notes, options, prices)');
      } catch (error) {
        console.warn('Backend load failed — running from local cache:', (error as Error)?.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // ─── Flush offline queue on mount + whenever connectivity returns ─────────────
  const flushQueue = useCallback(async () => {
    const ops = await offlineQueue.getAll().catch(() => []);
    if (ops.length === 0) return;
    let succeeded = 0;
    for (const op of ops) {
      try {
        await apiCall(op.endpoint, {
          method: op.method,
          ...(op.body !== null ? { body: op.body } : {}),
        });
        await offlineQueue.remove(op.id);
        succeeded++;
      } catch (err) {
        console.error(`Queue flush failed for ${op.method} ${op.endpoint}:`, err);
        break; // Preserve FIFO ordering — stop on first failure
      }
    }
    if (succeeded > 0) {
      console.log(`Flushed ${succeeded} queued operation(s)`);
      window.dispatchEvent(new CustomEvent('queueflushed', { detail: { count: succeeded } }));
      toast.success(`${succeeded} offline change${succeeded !== 1 ? 's' : ''} synced ☁️`, { duration: 3000 });
    }
  }, []);

  // ─── Flush pending photo uploads on reconnect ──────────────────────────────
  const flushPendingPhotos = useCallback(async () => {
    const pending = getPendingPhotoIds();
    if (pending.length === 0) return;
    console.log(`[photoSync] Retrying ${pending.length} pending photo upload(s)…`);
    let syncedCount = 0;
    for (const assetId of pending) {
      try {
        const photos = await photoDB.getPhotos(assetId);
        if (!photos || Object.keys(photos).length === 0) {
          removePendingPhoto(assetId);
          continue;
        }
        const ok = await cloudPhotos.uploadAssetPhotos(assetId, photos);
        if (ok) {
          removePendingPhoto(assetId);
          syncedCount++;
          console.log(`[photoSync] Synced photos for asset ${assetId}`);
        } else {
          console.warn(`[photoSync] Retry failed for asset ${assetId} — will try again later`);
        }
      } catch (err) {
        console.error(`[photoSync] Error retrying asset ${assetId}:`, err);
      }
    }
    if (syncedCount > 0) {
      toast.success(`${syncedCount} photo${syncedCount !== 1 ? 's' : ''} synced to cloud ☁️`, { duration: 3000 });
    }
  }, []);

  // ─── Flush pending location media uploads on reconnect ─────────────────────
  const flushPendingLocationMedia = useCallback(async () => {
    const pending = cloudLocSync.getPendingLocMedia();
    if (pending.length === 0) return;
    console.log(`[locMediaSync] Retrying ${pending.length} pending location media upload(s)…`);
    let syncedCount = 0;
    for (const { locationId, mediaType } of pending) {
      try {
        const media = mediaType === 'loc'
          ? await locMediaDB.getLocationMedia(locationId)
          : await locMediaDB.getInspectionMedia(locationId);
        const hasData = media.photos.some(p => p.startsWith('data:')) ||
                        media.videos.some(v => v.startsWith('data:'));
        if (!hasData) {
          // Nothing local to upload — remove stale entry
          cloudLocSync.removePendingLocMedia(locationId, mediaType);
          continue;
        }
        const ok = await cloudLocSync.uploadLocationMedia(locationId, media, mediaType);
        if (ok) {
          cloudLocSync.removePendingLocMedia(locationId, mediaType);
          syncedCount++;
          console.log(`[locMediaSync] Synced ${mediaType} media for location ${locationId}`);
        } else {
          console.warn(`[locMediaSync] Retry failed for location ${locationId} (${mediaType}) — will try again later`);
        }
      } catch (err) {
        console.error(`[locMediaSync] Error retrying location ${locationId}:`, err);
      }
    }
    if (syncedCount > 0) {
      toast.success(`${syncedCount} location photo${syncedCount !== 1 ? 's' : ''} synced to cloud ☁️`, { duration: 3000 });
    }
  }, []);

  // ─── Flush pending annotation uploads on reconnect ────────────────────────────
  const flushPendingAnnotations = useCallback(async () => {
    const pending = cloudAnnotationSync.getPendingAnnotations();
    if (pending.length === 0) return;
    console.log(`[annotationSync] Retrying ${pending.length} pending annotation upload(s)…`);
    let syncedCount = 0;
    for (const imageId of pending) {
      try {
        const annotations = await imageAnnotationsDB.getAnnotations(imageId);
        if (annotations.length === 0) {
          // No annotations to upload — remove stale entry
          cloudAnnotationSync.removePendingAnnotation(imageId);
          continue;
        }
        const ok = await cloudAnnotationSync.uploadAnnotations(imageId, annotations);
        if (ok) {
          cloudAnnotationSync.removePendingAnnotation(imageId);
          syncedCount++;
          console.log(`[annotationSync] Synced annotations for image ${imageId}`);
        } else {
          console.warn(`[annotationSync] Retry failed for image ${imageId} — will try again later`);
        }
      } catch (err) {
        console.error(`[annotationSync] Error retrying image ${imageId}:`, err);
      }
    }
    if (syncedCount > 0) {
      toast.success(`${syncedCount} annotation${syncedCount !== 1 ? 's' : ''} synced to cloud ☁️`, { duration: 3000 });
    }
  }, []);

  useEffect(() => {
    // Try to flush any ops that were queued during a previous offline session
    if (navigator.onLine) {
      flushQueue();
      flushPendingPhotos();
      flushPendingLocationMedia();
      flushPendingAnnotations();
    }

    const handleOnline = () => {
      flushQueue();
      flushPendingPhotos();
      flushPendingLocationMedia();
      flushPendingAnnotations();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushQueue, flushPendingPhotos, flushPendingLocationMedia, flushPendingAnnotations]);

  useEffect(() => {
    if (!isLoading) {
      try { localStorage.setItem(STORAGE_KEYS.MOUNTAINS, JSON.stringify(mountains)); }
      catch (e) { console.error('Error saving mountains:', e); }
    }
  }, [mountains, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      try { localStorage.setItem(STORAGE_KEYS.LOCATIONS, JSON.stringify(locations)); }
      catch (e) { console.error('Error saving locations:', e); }
    }
  }, [locations, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      try {
        const stripped = assets.map(a => stripPhotos(a));
        localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(stripped));
      } catch (e) { console.error('Error saving assets:', e); }
    }
  }, [assets, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      try { localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes)); }
      catch (e) { console.error('Error saving notes:', e); }
    }
  }, [notes, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      try { localStorage.setItem(STORAGE_KEYS.TRAILS, JSON.stringify(trails)); }
      catch (e) { console.error('Error saving trails:', e); }
    }
  }, [trails, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      try { localStorage.setItem(STORAGE_KEYS.OPTIONS, JSON.stringify(options)); }
      catch (e) { console.error('Error saving options:', e); }
    }
  }, [options, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      try { localStorage.setItem(STORAGE_KEYS.ITEM_PRICES, JSON.stringify(itemPrices)); }
      catch (e) { console.error('Error saving item prices:', e); }
    }
  }, [itemPrices, isLoading]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts)); }
    catch (e) { console.warn('Error saving contacts:', e); }
  }, [contacts]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.ORGANIZATIONS, JSON.stringify(organizations)); }
    catch (e) { console.warn('Error saving organizations:', e); }
  }, [organizations]);

  // ─── Mountains ──────────────────────────────────────────────────────────────

  const addMountain = (mountain: Omit<Mountain, 'id'>) => {
    const id = crypto.randomUUID();
    const newMountain: Mountain = {
      ...mountain,
      id,
      additionalContacts: mountain.additionalContacts || [],
      adminContact: {
        name: mountain.adminContact?.name || '',
        email: mountain.adminContact?.email || '',
        phone: mountain.adminContact?.phone || '',
        notes: mountain.adminContact?.notes || '',
      },
      technicalContact: {
        name: mountain.technicalContact?.name || '',
        email: mountain.technicalContact?.email || '',
        phone: mountain.technicalContact?.phone || '',
        notes: mountain.technicalContact?.notes || '',
      },
    };
    setMountains(prev => [...prev, newMountain]);
    syncOrQueue('/mountains', 'POST', JSON.stringify(newMountain))
      .catch(e => console.error('Mountain sync error:', e));
    logActivity(id, 'mountain_added', `Added mountain "${newMountain.name}"`);
    return id;
  };

  const updateMountain = (id: string, updates: Partial<Mountain>) => {
    setMountains(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    syncOrQueue(`/mountains/${id}`, 'PUT', JSON.stringify(updates))
      .catch(e => console.error('Mountain update sync error:', e));
  };

  const deleteMountain = async (id: string) => {
    const locationIds = locations.filter(l => l.mountainId === id).map(l => l.id);
    // Include both location-assigned assets AND mountain inventory assets
    const assetIds = assets.filter(a =>
      (a.locationId && locationIds.includes(a.locationId)) || a.mountainId === id
    ).map(a => a.id);

    await Promise.all(assetIds.map(aid => photoDB.deletePhotos(aid).catch(() => {})));
    await Promise.all(assetIds.map(aid => cloudPhotos.deleteAssetPhotos(aid).catch(() => {})));
    await Promise.all(locationIds.map(lid => locMediaDB.deleteAllMedia(lid).catch(() => {})));
    await Promise.all(locationIds.map(lid => cloudLocSync.deleteLocationMedia(lid).catch(() => {})));
    await mountainDocsDB.deleteDocuments(id).catch(() => {});

    setNotes(prev => prev.filter(n => n.mountainId !== id));
    setAssets(prev => prev.filter(a => !assetIds.includes(a.id)));
    setLocations(prev => prev.filter(l => l.mountainId !== id));
    setTrails(prev => prev.filter(t => t.mountainId !== id));
    setMountains(prev => prev.filter(m => m.id !== id));

    addTombstone('mountains', id);
    syncOrQueue(`/mountains/${id}/cascade`, 'DELETE', null)
      .catch(e => console.error('Mountain delete sync error:', e));
  };

  // ─── Locations ──────────────────────────────────────────────────────────────

  const addLocation = (location: Omit<Location, 'id'>) => {
    const id = crypto.randomUUID();
    const newLocation = { ...location, id };
    setLocations(prev => [...prev, newLocation]);
    syncOrQueue('/locations', 'POST', JSON.stringify(newLocation))
      .catch(e => console.error('Location sync error:', e));
    logActivity(newLocation.mountainId, 'location_added', `Added location "${newLocation.name}"`);
    return id;
  };

  const updateLocation = (id: string, updates: Partial<Location>) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
    syncOrQueue(`/locations/${id}`, 'PUT', JSON.stringify(updates))
      .catch(e => console.error('Location update sync error:', e));
  };

  const deleteLocation = async (id: string) => {
    const assetIds = assets.filter(a => a.locationId === id).map(a => a.id);
    await Promise.all(assetIds.map(aid => photoDB.deletePhotos(aid).catch(() => {})));
    await Promise.all(assetIds.map(aid => cloudPhotos.deleteAssetPhotos(aid).catch(() => {})));
    await locMediaDB.deleteAllMedia(id).catch(() => {});
    cloudLocSync.deleteLocationMedia(id).catch(() => {});
    setAssets(prev => prev.filter(a => !assetIds.includes(a.id)));
    setLocations(prev => prev.filter(l => l.id !== id));

    addTombstone('locations', id);
    syncOrQueue(`/locations/${id}/cascade`, 'DELETE', null)
      .catch(e => console.error('Location delete sync error:', e));
  };

  // ─── Assets ─────────────────────────────────────────────────────────────────

  const addAsset = (asset: Omit<Asset, 'id'>) => {
    const id = crypto.randomUUID();
    const newAsset = {
      ...asset,
      id,
      inventoryStatus: asset.inventoryStatus || 'In Stock',
      mountainDeployment: asset.mountainDeployment || 'Unassigned / Warehouse',
      dateAddedToInventory: asset.dateAddedToInventory || new Date().toISOString().slice(0, 10),
    };
    setAssets(prev => [...prev, newAsset]);
    const photos = extractPhotoFields(newAsset);
    if (Object.keys(photos).length > 0) {
      // Always save to IndexedDB first — this is the durable local copy
      photoDB.savePhotos(id, photos).catch(e => console.error('Photo save error:', e));
      if (!navigator.onLine) {
        // Offline: mark for upload when connectivity returns
        addPendingPhoto(id);
        toast('📷 Photo saved locally — will sync when back online', { duration: 3000 });
      } else {
        cloudPhotos.uploadAssetPhotos(id, photos)
          .then(ok => {
            if (ok) {
              toast.success('Photos synced to cloud ☁️', { duration: 2500 });
            } else {
              addPendingPhoto(id);
              toast.error('Photo upload failed — will retry when reconnected', { duration: 4000 });
            }
          })
          .catch(e => {
            console.error('Cloud photo upload error:', e);
            addPendingPhoto(id);
          });
      }
    }
    syncOrQueue('/assets', 'POST', JSON.stringify(stripPhotos(newAsset)))
      .catch(e => console.error('Asset sync error:', e));
    logActivity(newAsset.mountainId, 'asset_added', `Added ${newAsset.type} to inventory`);
    return id;
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    const photos = extractPhotoFields(updates);
    if (Object.keys(photos).length > 0) {
      // Always save to IndexedDB first
      photoDB.savePhotos(id, photos).catch(e => console.error('Photo update save error:', e));
      if (!navigator.onLine) {
        addPendingPhoto(id);
        toast('📷 Photo saved locally — will sync when back online', { duration: 3000 });
      } else {
        cloudPhotos.uploadAssetPhotos(id, photos)
          .then(ok => {
            if (ok) {
              toast.success('Photos synced to cloud ☁️', { duration: 2500 });
            } else {
              addPendingPhoto(id);
              toast.error('Photo upload failed — will retry when reconnected', { duration: 4000 });
            }
          })
          .catch(e => {
            console.error('Cloud photo update error:', e);
            addPendingPhoto(id);
          });
      }
    }
    syncOrQueue(`/assets/${id}`, 'PUT', JSON.stringify(stripPhotos(updates)))
      .catch(e => console.error('Asset update sync error:', e));
  };

  const deleteAsset = async (id: string) => {
    await photoDB.deletePhotos(id).catch(() => {});
    cloudPhotos.deleteAssetPhotos(id).catch(() => {});
    removePendingPhoto(id); // clean up any pending sync entry
    setAssets(prev => prev.filter(a => a.id !== id));

    addTombstone('assets', id);
    syncOrQueue(`/assets/${id}`, 'DELETE', null)
      .catch(e => console.error('Asset delete sync error:', e));
  };

  // ─── Trails ─────────────────────────────────────────────────────────────────

  const addTrail = (trail: Omit<Trail, 'id'>) => {
    const id = crypto.randomUUID();
    const newTrail = { ...trail, id };
    setTrails(prev => [...prev, newTrail]);
    syncOrQueue('/trails', 'POST', JSON.stringify(newTrail))
      .catch(e => console.error('Trail sync error:', e));
    logActivity(newTrail.mountainId, 'trail_added', `Added trail "${newTrail.name}"`);
    return id;
  };

  const updateTrail = (id: string, updates: Partial<Trail>) => {
    setTrails(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    syncOrQueue(`/trails/${id}`, 'PUT', JSON.stringify(updates))
      .catch(e => console.error('Trail update sync error:', e));
  };

  const deleteTrail = async (id: string) => {
    // Unlink locations from this trail (don't delete them — they become standalone)
    setLocations(prev => prev.map(l => l.trailId === id ? { ...l, trailId: undefined } : l));
    setTrails(prev => prev.filter(t => t.id !== id));

    addTombstone('trails', id);
    syncOrQueue(`/trails/${id}`, 'DELETE', null)
      .catch(e => console.error('Trail delete sync error:', e));
  };

  // ─── Notes ──────────────────────────────────────────────────────────────────

  const addNote = (mountainId: string, text: string, topic?: NoteTopic, scheduled?: boolean, completed?: boolean, installProgress?: number) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newNote: MountainNote = {
      id,
      mountainId,
      text,
      createdAt: now,
      updatedAt: now,
      ...(topic && { topic, scheduled, completed, installProgress }),
    };
    setNotes(prev => [...prev, newNote]);
    syncOrQueue('/notes', 'POST', JSON.stringify(newNote))
      .catch(e => console.error('Note sync error:', e));
    logActivity(mountainId, 'note_added', 'Added a note');
    return id;
  };

  const updateNote = (id: string, updates: Partial<Omit<MountainNote, 'id' | 'mountainId' | 'createdAt'>>) => {
    const now = new Date().toISOString();
    const note = notes.find(n => n.id === id);
    const wasProposalJustSigned = note?.topic === 'Proposal' && !note.completed && updates.completed === true;

    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates, updatedAt: now } : n));
    syncOrQueue(`/notes/${id}`, 'PUT', JSON.stringify({ ...updates, updatedAt: now }))
      .catch(e => console.error('Note update sync error:', e));

    // Auto-generate invoice when proposal is signed
    if (wasProposalJustSigned && note?.mountainId) {
      setTimeout(() => generateInvoiceFromProposal(note.mountainId!), 500);
    }
  };

  async function generateInvoiceFromProposal(mountainId: string) {
    try {
      // Fetch the proposal data from the server
      const tokenResp = await apiCall(`/proposals/sign-status/${mountainId}`);
      if (!tokenResp.token) return;

      const proposalResp = await apiCall(`/proposals/sign/${tokenResp.token}`);
      if (!proposalResp.proposalSnapshot) return;

      const proposal = proposalResp.proposalSnapshot;

      // Calculate line items from proposal
      const lineItems: { description: string; unitPrice: number; quantity: number; total: number }[] = [];

      // Add trail capture points
      proposal.trails?.forEach((trail: any) => {
        const qty = parseInt(trail.capturePoints) || 0;
        const price = parseFloat(trail.unitPrice?.replace(/[$,]/g, '')) || 1000;
        if (qty > 0) {
          const trailName = trail.name || 'Trail';
          lineItems.push({
            description: `${trailName} Capture Points`,
            unitPrice: price,
            quantity: qty,
            total: price * qty,
          });
        }
      });

      // Add integration fee
      const integrationFee = parseFloat(proposal.integrationFee?.replace(/[$,]/g, '')) || 0;
      if (integrationFee > 0) {
        lineItems.push({
          description: 'Integration Fee',
          unitPrice: integrationFee,
          quantity: 1,
          total: integrationFee,
        });
      }

      // Add install fee
      const installFee = parseFloat(proposal.installFee?.replace(/[$,]/g, '')) || 0;
      if (installFee > 0) {
        lineItems.push({
          description: 'Installation Fee',
          unitPrice: installFee,
          quantity: 1,
          total: installFee,
        });
      }

      // Add misc fee
      const miscFee = parseFloat(proposal.miscFee?.replace(/[$,]/g, '')) || 0;
      if (miscFee > 0) {
        lineItems.push({
          description: 'Miscellaneous Fees',
          unitPrice: miscFee,
          quantity: 1,
          total: miscFee,
        });
      }

      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      const invoiceNumber1Percent = 50; // Default to 50% for Invoice 1
      const balanceDue = subtotal * (invoiceNumber1Percent / 100);

      // Generate invoice number: YYMMDD + mountain initials
      const mountain = getMountainById(mountainId);
      const today = new Date();
      const yy = today.getFullYear().toString().slice(-2);
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const initials = (mountain?.name || 'MTN')
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 3);
      const invoiceNumber = `YL${yy}${mm}${dd}${initials}-A`;

      const invoice: Invoice = {
        invoiceNumber,
        date: today.toISOString().split('T')[0],
        subtotal,
        invoiceNumber1Percent,
        balanceDue,
        lineItems,
      };

      updateMountain(mountainId, { invoice });
      toast.success('Invoice #' + invoiceNumber + ' generated!');
    } catch (err) {
      console.error('Error generating invoice:', err);
      toast.error('Failed to generate invoice');
    }
  }

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    syncOrQueue(`/notes/${id}`, 'DELETE', null)
      .catch(e => console.error('Note delete sync error:', e));
  };

  const getNotesByMountainId = (mountainId: string) =>
    notes.filter(n => n.mountainId === mountainId).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  // ─── Selectors ──────────────────────────────────────────────────────────────

  const getAssetById = (id: string) => assets.find(a => a.id === id);
  const getLocationsByMountainId = (mountainId: string) => locations.filter(l => l.mountainId === mountainId);
  const getAssetsByLocationId = (locationId: string) => assets.filter(a => a.locationId === locationId);
  const getAssetsByMountainId = (mountainId: string) => assets.filter(a => a.mountainId === mountainId);
  const getTrailsByMountainId = (mountainId: string) => trails.filter(t => t.mountainId === mountainId);
  const getMountainById = (id: string) => mountains.find(m => m.id === id);
  const getLocationById = (id: string) => locations.find(l => l.id === id);

  const getMountainTrailNames = (mountainId: string): string[] => {
    const mountainLocations = locations.filter(l => l.mountainId === mountainId);
    const locationIdSet = new Set(mountainLocations.map(l => l.id));
    return [...new Set([
      ...mountainLocations.map(l => l.trailName).filter(Boolean) as string[],
      ...assets.filter(a => locationIdSet.has(a.locationId) && a.trail).map(a => a.trail as string),
    ])].sort();
  };

  const getOptions = (key: string) => options[key] || [];
  const addOption = (key: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setOptions(prev => {
      const existing = prev[key] || [];
      if (existing.includes(trimmed)) return prev;
      const updated = [...existing, trimmed].sort((a, b) => a.localeCompare(b));
      return { ...prev, [key]: updated };
    });
    syncOrQueue('/options', 'POST', JSON.stringify({ key, value: trimmed }))
      .catch(e => console.error('Option sync error:', e));
  };

  const deleteOption = (key: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setOptions(prev => {
      const existing = prev[key] || [];
      if (!existing.includes(trimmed)) return prev;
      const updated = existing.filter(v => v !== trimmed);
      return { ...prev, [key]: updated };
    });
    syncOrQueue('/options', 'DELETE', JSON.stringify({ key, value: trimmed }))
      .catch(e => console.error('Option delete sync error:', e));
  };

  const setItemPrice = (name: string, price: number | null) => {
    setItemPrices(prev => {
      const updated = { ...prev };
      if (price === null) {
        delete updated[name];
      } else {
        updated[name] = price;
      }
      return updated;
    });
    syncOrQueue('/item-prices', 'POST', JSON.stringify({ name, price }))
      .catch(e => console.error('Item price sync error:', e));
  };

  // ─── CRM ────────────────────────────────────────────────────────────────────

  const addContact = (contact: Omit<CRMContact, 'id' | 'createdAt' | 'updatedAt'>): string => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newContact: CRMContact = { ...contact, id, createdAt: now, updatedAt: now };
    setContacts(prev => [...prev, newContact]);
    return id;
  };

  const updateContact = (id: string, updates: Partial<CRMContact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
  };

  const deleteContact = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const addOrganization = (org: Omit<CRMOrganization, 'id' | 'createdAt' | 'updatedAt'>): string => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newOrg: CRMOrganization = { ...org, id, createdAt: now, updatedAt: now };
    setOrganizations(prev => [...prev, newOrg]);
    return id;
  };

  const updateOrganization = (id: string, updates: Partial<CRMOrganization>) => {
    setOrganizations(prev => prev.map(o => o.id === id ? { ...o, ...updates, updatedAt: new Date().toISOString() } : o));
  };

  const deleteOrganization = (id: string) => {
    setOrganizations(prev => prev.filter(o => o.id !== id));
  };

  // Auto-import contacts from all mountains (called on first CRM visit)
  const importContactsFromMountains = () => {
    const existingEmails = new Set(contacts.map(c => c.email.toLowerCase()).filter(Boolean));
    const toAdd: CRMContact[] = [];
    mountains.forEach(m => {
      const candidates = [
        m.adminContact && { ...m.adminContact, type: 'Resort' as const },
        m.technicalContact && { ...m.technicalContact, type: 'Resort' as const },
        ...(m.additionalContacts || []).map(c => ({ ...c, type: 'Resort' as const })),
      ].filter(Boolean) as any[];
      candidates.forEach(c => {
        if (!c.name) return;
        const emailKey = (c.email || '').toLowerCase();
        if (emailKey && existingEmails.has(emailKey)) return;
        if (emailKey) existingEmails.add(emailKey);
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        toAdd.push({
          id, name: c.name, email: c.email || '', phone: c.phone || '',
          type: 'Resort', title: c.title || c.role || '', organizationId: undefined,
          tags: [], isPrimary: false, mountainId: m.id,
          notes: c.notes || '', activities: [], createdAt: now, updatedAt: now,
        });
      });
    });
    if (toAdd.length > 0) setContacts(prev => [...prev, ...toAdd]);
  };

  return (
    <DataContext.Provider
      value={{
        mountains,
        locations,
        assets,
        trails,
        notes,
        contacts,
        organizations,
        options,
        itemPrices,
        addMountain,
        updateMountain,
        deleteMountain,
        addLocation,
        updateLocation,
        deleteLocation,
        addAsset,
        updateAsset,
        deleteAsset,
        addTrail,
        updateTrail,
        deleteTrail,
        getAssetById,
        getLocationsByMountainId,
        getAssetsByLocationId,
        getAssetsByMountainId,
        getTrailsByMountainId,
        getMountainById,
        getLocationById,
        getMountainTrailNames,
        getOptions,
        addOption,
        deleteOption,
        setItemPrice,
        addNote,
        updateNote,
        deleteNote,
        getNotesByMountainId,
        addContact,
        updateContact,
        deleteContact,
        addOrganization,
        updateOrganization,
        deleteOrganization,
        importContactsFromMountains,
        logActivity,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}