import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import * as photoDB from '../utils/photoDB';
import * as locMediaDB from '../utils/locationMediaDB';
import * as cloudPhotos from '../utils/cloudPhotoSync';
import * as cloudLocSync from '../utils/cloudLocationSync';
import * as offlineQueue from '../utils/offlineQueue';
import { toast } from 'sonner';

export interface Contact {
  name: string;
  title?: string;
  email: string;
  phone: string;
  phoneType?: 'Office' | 'Cell';
  role?: 'Admin' | 'Technical' | 'Team' | 'Operations';
  teamName?: string;
  notes?: string;
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
  adminContact: Contact;
  technicalContact: Contact;
  additionalContacts: Contact[];
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

// ─── Unified Location (replaces InstallLocation + SiteInspectionLocation) ─────

export interface Location {
  id: string;
  mountainId: string;
  name: string;
  trailName?: string;
  notes?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  /** One inspection per location — optional, added separately after creation. */
  inspection?: {
    items: SiteInspectionItem[];
    notes?: string;
    createdAt: string;
  };
}

// ─── Asset ───────────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  locationId: string;
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
}

export interface MountainNote {
  id: string;
  mountainId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
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
  notes: MountainNote[];
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
  getAssetById: (id: string) => Asset | undefined;
  getLocationsByMountainId: (mountainId: string) => Location[];
  getAssetsByLocationId: (locationId: string) => Asset[];
  getMountainById: (id: string) => Mountain | undefined;
  getLocationById: (id: string) => Location | undefined;
  getMountainTrailNames: (mountainId: string) => string[];
  getOptions: (key: string) => string[];
  addOption: (key: string, value: string) => void;
  deleteOption: (key: string, value: string) => void;
  setItemPrice: (name: string, price: number | null) => void;
  addNote: (mountainId: string, text: string) => string;
  updateNote: (id: string, text: string) => void;
  deleteNote: (id: string) => void;
  getNotesByMountainId: (mountainId: string) => MountainNote[];
}

// Persist the context object on globalThis so that Vite's React Fast Refresh
// (HMR) doesn't create a new identity on every hot-reload.
const _CTX_KEY = '__skiInstall_DataContext__';
if (!(globalThis as any)[_CTX_KEY]) {
  (globalThis as any)[_CTX_KEY] = createContext<DataContextType | undefined>(undefined);
}
const DataContext = (globalThis as any)[_CTX_KEY] as ReturnType<typeof createContext<DataContextType | undefined>>;

const STORAGE_KEYS = {
  MOUNTAINS: 'skiInstall_mountains',
  LOCATIONS: 'skiInstall_locations',
  ASSETS: 'skiInstall_assets',
  NOTES: 'skiInstall_notes',
  OPTIONS: 'skiInstall_options',
  ITEM_PRICES: 'skiInstall_item_prices',
  PENDING_PHOTOS: 'skiInstall_pendingPhotoSync',
};

// ─── Tombstone helpers — track locally-deleted IDs so server data can't resurrect them ──

function getTombstones(type: string): string[] {
  try { return JSON.parse(localStorage.getItem(`skiInstall_deleted_${type}`) || '[]'); }
  catch { return []; }
}
function addTombstone(type: string, id: string) {
  const current = getTombstones(type);
  if (!current.includes(id)) {
    localStorage.setItem(`skiInstall_deleted_${type}`, JSON.stringify([...current, id]));
  }
}
function removeTombstone(type: string, id: string) {
  const current = getTombstones(type);
  localStorage.setItem(`skiInstall_deleted_${type}`, JSON.stringify(current.filter(i => i !== id)));
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

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-a0d4ba78`;

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
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

export function DataProvider({ children }: { children: ReactNode }) {
  const [mountains, setMountains] = useState<Mountain[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.MOUNTAINS) || '[]'); }
    catch { return []; }
  });
  const [locations, setLocations] = useState<Location[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCATIONS) || '[]'); }
    catch { return []; }
  });
  const [assets, setAssets] = useState<Asset[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSETS) || '[]'); }
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
        console.log('Loading data from backend...');

        // Snapshot local state BEFORE fetching so we can merge below.
        // This preserves items that were added locally but not yet synced to server.
        let localMountains: Mountain[] = [];
        let localLocations: Location[] = [];
        let localAssets: Asset[] = [];
        let localNotes: MountainNote[] = [];
        try { localMountains = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOUNTAINS) || '[]'); } catch {}
        try { localLocations = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCATIONS) || '[]'); } catch {}
        try { localAssets = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSETS) || '[]'); } catch {}
        try { localNotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTES) || '[]'); } catch {}

        // Fetch local photos first (IndexedDB — no network cost)
        const photoLookup = await photoDB.getAllPhotos().catch(e => { console.error('Error loading photos from IndexedDB:', e); return {}; });

        // Batch 1: lightweight/config endpoints — run in parallel
        const [mountainsRes, locationsRes, optionsRes, pricesRes] = await Promise.all([
          apiCall('/mountains').catch(e => { console.error('Error loading mountains:', e); return null; }),
          apiCall('/locations').catch(e => { console.error('Error loading locations:', e); return null; }),
          apiCall('/options').catch(e => { console.error('Error loading options:', e); return null; }),
          apiCall('/item-prices').catch(e => { console.error('Error loading item prices:', e); return null; }),
        ]);

        // Batch 2: large collections — load after batch 1 to avoid resource exhaustion
        const [assetsRes, notesRes] = await Promise.all([
          apiCall('/assets').catch(e => { console.error('Error loading assets:', e); return null; }),
          apiCall('/notes').catch(e => { console.error('Error loading notes:', e); return null; }),
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
        console.log('Data loaded successfully');
      } catch (error) {
        console.error('Backend load failed, local cache already displayed:', error);
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

  useEffect(() => {
    // Try to flush any ops that were queued during a previous offline session
    if (navigator.onLine) {
      flushQueue();
      flushPendingPhotos();
      flushPendingLocationMedia();
    }

    const handleOnline = () => {
      flushQueue();
      flushPendingPhotos();
      flushPendingLocationMedia();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushQueue, flushPendingPhotos, flushPendingLocationMedia]);

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
    return id;
  };

  const updateMountain = (id: string, updates: Partial<Mountain>) => {
    setMountains(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    syncOrQueue(`/mountains/${id}`, 'PUT', JSON.stringify(updates))
      .catch(e => console.error('Mountain update sync error:', e));
  };

  const deleteMountain = async (id: string) => {
    const locationIds = locations.filter(l => l.mountainId === id).map(l => l.id);
    const assetIds = assets.filter(a => locationIds.includes(a.locationId)).map(a => a.id);

    await Promise.all(assetIds.map(aid => photoDB.deletePhotos(aid).catch(() => {})));
    await Promise.all(assetIds.map(aid => cloudPhotos.deleteAssetPhotos(aid).catch(() => {})));
    await Promise.all(locationIds.map(lid => locMediaDB.deleteAllMedia(lid).catch(() => {})));
    await Promise.all(locationIds.map(lid => cloudLocSync.deleteLocationMedia(lid).catch(() => {})));

    setNotes(prev => prev.filter(n => n.mountainId !== id));
    setAssets(prev => prev.filter(a => !assetIds.includes(a.id)));
    setLocations(prev => prev.filter(l => l.id !== id));
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
    const newAsset = { ...asset, id };
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

  // ─── Notes ──────────────────────────────────────────────────────────────────

  const addNote = (mountainId: string, text: string) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newNote: MountainNote = { id, mountainId, text, createdAt: now, updatedAt: now };
    setNotes(prev => [...prev, newNote]);
    syncOrQueue('/notes', 'POST', JSON.stringify(newNote))
      .catch(e => console.error('Note sync error:', e));
    return id;
  };

  const updateNote = (id: string, text: string) => {
    const now = new Date().toISOString();
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text, updatedAt: now } : n));
    syncOrQueue(`/notes/${id}`, 'PUT', JSON.stringify({ text, updatedAt: now }))
      .catch(e => console.error('Note update sync error:', e));
  };

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

  return (
    <DataContext.Provider
      value={{
        mountains,
        locations,
        assets,
        notes,
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
        getAssetById,
        getLocationsByMountainId,
        getAssetsByLocationId,
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