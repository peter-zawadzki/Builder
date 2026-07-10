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
  trailMapUrl?: string;            // external link to the trail map
  trailMapUploadedAt?: string;  // ISO timestamp when trail map was uploaded
  trailMapAnnotations?: Annotation[];  // annotations on the trail map image
  invoice?: Invoice;
  // Mountain stats
  trailCount?: number;
  acreage?: number;
  verticalDrop?: number;
  slackEmail?: string;
  region?: 'Rocky Mountains' | 'Sierra Nevada' | 'Pacific Northwest' | 'Northeast' | 'Mid-Atlantic' | 'Midwest' | 'Europe' | 'Canada';
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
  pipelineStage?: MountainPipelineStage;
  activities?: ContactActivity[]; // action items (Next Actions) shown in the Status window
  isStalled?: boolean;
  stallReason?: StallReason;
  stalledAt?: string;
  nextAction?: string;
  nextActionDate?: string;
  nextActionBy?: string;    // name of the user who set the next action
  nextActionAt?: string;    // when it was set (ISO)
  nextActionType?: 'Email' | 'Call' | 'Visit' | 'Task';
  nextActionAssigneeId?: string;   // YULLR contact the action is assigned to
  nextActionAssignee?: string;     // assignee display name
  estimatedDealValue?: number;
  closeProbability?: number;
  corporateGroup?: string;
  organizationId?: string;
  affiliateContactIds?: string[];  // YULLR people who sell/represent this mountain
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

export interface Inspection {
  id: string;
  items: SiteInspectionItem[];
  notes?: string;
  createdAt: string;
  projectId?: string;              // the project this inspection is for
  difficulty?: 1 | 2 | 3 | 4 | 5;  // install difficulty (per inspection, not the location)
  activities?: ContactActivity[];  // notes / action items captured during this visit
}

export interface Location {
  id: string;
  mountainId: string;
  trailId?: string;        // links to a Trail record
  name: string;
  trailName?: string;      // legacy / display label
  notes?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5; // legacy — difficulty now lives on the inspection
  locationType?: 'Install Site' | 'Power' | 'Start' | 'Finish';
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  originalCoordinates?: {
    latitude: number;
    longitude: number;
    recordedAt: string;    // timestamp when original coordinates were captured
  };
  /** Full inspection history; multiple inspections per location. */
  inspections?: Inspection[];
  /** Mirror of the most-recent inspection — kept for existing read sites. */
  inspection?: Inspection;
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
  by?: string;                              // who checked it out/in
  action?: 'Checked out' | 'Checked in';
}

export interface Asset {
  id: string;
  mountainId?: string;   // mountain-level ownership — set when added to inventory
  locationId?: string;   // optional — unset means "in inventory, not yet installed"
  projectId?: string;    // the project this item is deployed to
  assetClass?: 'Asset' | 'Expense';  // tracked asset vs. expensed consumable (default Asset)
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

export type ContactType = 'Staff' | 'Partner' | 'Vendor' | 'Investor' | 'Advisor' | 'Coach' | 'Team' | 'Ambassador' | 'General';
export type ContactTag = 'Decision Maker' | 'Technical' | 'Champion' | 'Billing' | 'Legal';
export type OrgType = 'Mountain Group' | 'Partner' | 'Vendor' | 'Investor Group' | 'Advisory' | 'Corporate Group';
export type PipelineStage =
  | 'Prospect' | 'Contacted' | 'Demo Scheduled' | 'Positive'
  | 'Verbal Yes' | 'Contract Sent' | 'Signed' | 'Installing' | 'Live' | 'Churned';
export type StallReason = 'No response' | 'Waiting on legal' | 'Budget hold' | 'Timing — offseason' | 'Other';

// Mountain-level relationship stage — distinct from Project.stage (the
// per-install sales pipeline), tracked in the mountain detail Status window.
export type MountainPipelineStage =
  | 'Prospect' | 'Demo Scheduled' | 'Demo Completed' | 'Verbal Yes'
  | 'Signed Agreement' | 'Onboarding' | 'Active' | 'Declined' | 'Dead';
export const MOUNTAIN_PIPELINE_STAGES: MountainPipelineStage[] = [
  'Prospect', 'Demo Scheduled', 'Demo Completed', 'Verbal Yes',
  'Signed Agreement', 'Onboarding', 'Active', 'Declined', 'Dead',
];

// ─── Projects (the unit of work on a mountain OR a team) ─────────────────────
// Install / Repair / Upgrade live on mountains; Initial Onboarding / Followup
// Training / Special Event live on teams (Special Event is also available on
// mountains). Every type moves through its own fixed stage sequence.
export type ProjectType = 'Install' | 'Repair' | 'Upgrade' | 'Initial Onboarding' | 'Followup Training' | 'Special Event';

export type ProjectStage =
  | 'Site Inspection' | 'Proposal Sent' | 'Proposal Signed' | 'Install Scheduled' | 'Install In-Progress' | 'Commissioning'
  | 'Prospect' | 'Kickoff Scheduled' | 'Training Scheduled' | 'Training In-Progress'
  | 'Training Requested'
  | 'Event Requested' | 'Event Scheduled' | 'Event In-Progress'
  | 'Completed';

const INSTALL_LIKE_STAGES: ProjectStage[] = ['Site Inspection', 'Proposal Sent', 'Proposal Signed', 'Install Scheduled', 'Install In-Progress', 'Commissioning', 'Completed'];

export const PROJECT_STAGES_BY_TYPE: Record<ProjectType, ProjectStage[]> = {
  Install: INSTALL_LIKE_STAGES,
  Repair: INSTALL_LIKE_STAGES,
  Upgrade: INSTALL_LIKE_STAGES,
  'Initial Onboarding': ['Prospect', 'Kickoff Scheduled', 'Training Scheduled', 'Training In-Progress', 'Completed'],
  'Followup Training': ['Training Requested', 'Training Scheduled', 'Training In-Progress', 'Completed'],
  'Special Event': ['Event Requested', 'Proposal Sent', 'Proposal Signed', 'Event Scheduled', 'Event In-Progress', 'Completed'],
};

// The progress bar reflects the furthest-along checked status, not a single
// linear "current stage" — earlier statuses can be skipped without blocking it.
export function furthestCompletedStageIndex(project: { type: ProjectType; completedStages?: ProjectStage[] }): number {
  const stages = PROJECT_STAGES_BY_TYPE[project.type];
  return (project.completedStages || []).reduce((max, s) => Math.max(max, stages.indexOf(s)), -1);
}

export function isProjectCompleted(project: { type: ProjectType; completedStages?: ProjectStage[] }): boolean {
  return (project.completedStages || []).includes('Completed');
}

export interface Project {
  id: string;
  mountainId?: string;           // set for mountain-owned projects (Install/Repair/Upgrade/Special Event)
  teamId?: string;                // set for team-owned projects (Onboarding/Training/Special Event)
  name: string;
  notes?: string;               // free-text project notes
  type: ProjectType;
  // Each stage in PROJECT_STAGES_BY_TYPE[type] is independently checkable —
  // a status can be skipped without blocking later ones from being marked.
  completedStages?: ProjectStage[];
  ownerContactId?: string;      // the owning YULLR contact (employee)
  ownerName?: string;           // display name of the current owner
  ownerUserId?: string;         // legacy: Clerk user id, if owner was a login
  isStalled?: boolean;
  stallReason?: StallReason;
  stallNote?: string;           // required when stallReason === 'Other'
  reconcileConfirmed?: boolean; // install-vs-inspection reconciliation acknowledged
  archived?: boolean;
  activities?: ContactActivity[]; // notes / action items, same shape as contacts
  createdBy?: string;           // name of the user who created the project
  createdAt: string;
  updatedAt: string;
}

// A proposal — one per project. Content (trails/fees/terms) lives in `form`.
export interface Proposal {
  id: string;
  mountainId: string;
  projectId?: string;
  title?: string;
  proposalCreated?: boolean;    // finalized / sent for signature
  proposalCreatedAt?: string;
  form?: any;                   // the editable ProposalForm content
  invoice?: Invoice;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactActivity {
  id: string;
  text: string;
  type: 'note' | 'action';
  completed?: boolean;
  completedAt?: string;
  createdAt: string;
  assigneeContactId?: string;  // YULLR-org contact this note/action is assigned to
  assigneeName?: string;
  authorContactId?: string;    // CRM contact id of whoever created it — who's allowed to mark it complete
  authorName?: string;
}

// Only the person who created an item, or the person it's assigned to, may
// mark it complete. Tasks can only be assigned to a YULLR person, not a team.
export function canCompleteActivity(activity: ContactActivity, me: CRMContact | undefined): boolean {
  if (!me) return false;
  if (activity.authorContactId === me.id) return true;
  if (activity.assigneeContactId === me.id) return true;
  return false;
}

export interface CRMContact {
  id: string;
  name: string;              // full name, derived from firstName + lastName
  firstName?: string;
  lastName?: string;
  email: string;             // primary email
  emails?: string[];         // additional emails
  phone: string;             // primary phone (mirrors phones[0] for display)
  phones?: { number: string; label: 'Mobile' | 'Work' | 'Home' }[];
  mobilePhone?: string;      // legacy
  workPhone?: string;        // legacy
  type: ContactType;
  title?: string;
  organizationId?: string;
  tags: ContactTag[];
  isPrimary: boolean;
  mountainId?: string;       // single linked mountain
  teamId?: string;           // single linked team
  affiliation?: 'Employee' | 'Ambassador';  // for YULLR-org people: their role in Builder
  archived?: boolean;        // archived contacts drop out of default lists/search
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
  archived?: boolean;
  notes?: string;
  activities?: ContactActivity[];
  logo?: string;   // base64 data URL
  createdAt: string;
  updatedAt: string;
}

// A Team — a distinct CRM entity from Organizations. Behaves the same
// (contacts, notes/action items, archive/delete) but tracks its own projects
// (Initial Onboarding / Followup Training / Special Event) instead of mountains.
export interface CRMTeam {
  id: string;
  name: string;
  mountainIds: string[];   // mountains this team is associated with
  website?: string;
  address?: string;
  phone?: string;
  email?: string;
  archived?: boolean;
  notes?: string;
  activities?: ContactActivity[];
  logo?: string;           // base64 data URL
  createdBy?: string;      // name of the user who created the team
  createdAt: string;
  updatedAt: string;
}

// People in the YULLR organization — the pool notes/action items can be
// assigned to, across contacts, organizations, mountains, and projects.
export function getYullrMembers(contacts: CRMContact[], organizations: CRMOrganization[]): CRMContact[] {
  const yullrOrg = organizations.find(o => o.name.trim().toLowerCase() === 'yullr');
  if (!yullrOrg) return [];
  return contacts.filter(c => c.organizationId === yullrOrg.id).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Mountain activity rollup ─────────────────────────────────────────────────
// A mountain's Status (Next Actions) and Notes panes show every note/action
// item relevant to it — not just ones created directly on the mountain, but
// anything created on a contact/team/project/inspection tied to it, plus
// anything assigned to a person or team associated with it (an affiliate, or
// a team linked via mountainIds) no matter where that item actually lives.

export type ActivityOrigin = 'general' | 'person' | 'team' | 'project' | 'inspection';

export interface MountainActivityEntry extends ContactActivity {
  origin: ActivityOrigin;
  originLabel?: string;   // name of the contact/team/project/location this came from
  originId?: string;
}

// Projects created under a Team also show up on every Mountain that Team is
// linked to (via CRMTeam.mountainIds), alongside the mountain's own directly-
// owned projects — a team project isn't reassigned to the mountain, it's
// just visible there too (same "lives at its source, rolls up for
// visibility" pattern as note/action items).
export function getMountainProjects(mountainId: string, data: { projects: Project[]; teams: CRMTeam[] }): Project[] {
  const linkedTeamIds = new Set(data.teams.filter(t => t.mountainIds.includes(mountainId)).map(t => t.id));
  return data.projects.filter(p => p.mountainId === mountainId || (!!p.teamId && linkedTeamIds.has(p.teamId)));
}

export function getMountainRollupActivities(
  mountainId: string,
  data: { mountains: Mountain[]; contacts: CRMContact[]; teams: CRMTeam[]; projects: Project[]; locations: Location[] },
): MountainActivityEntry[] {
  const { mountains, contacts, teams, projects, locations } = data;
  const mountain = mountains.find(m => m.id === mountainId);
  if (!mountain) return [];

  const affiliateIds = new Set(mountain.affiliateContactIds || []);
  const linkedTeamIds = new Set(teams.filter(t => t.mountainIds.includes(mountainId)).map(t => t.id));

  // An item lives elsewhere but is relevant here because its assignee (a
  // person — tasks can only be assigned to people, not teams) is tied to
  // this mountain.
  const assignedHere = (a: ContactActivity) =>
    !!a.assigneeContactId && affiliateIds.has(a.assigneeContactId);

  const out: MountainActivityEntry[] = [];

  (mountain.activities || []).forEach(a => out.push({ ...a, origin: 'general' }));

  contacts.forEach(c => {
    (c.activities || []).forEach(a => {
      if (c.mountainId === mountainId || assignedHere(a)) {
        out.push({ ...a, origin: 'person', originLabel: c.name, originId: c.id });
      }
    });
  });

  teams.forEach(t => {
    (t.activities || []).forEach(a => {
      if (linkedTeamIds.has(t.id) || assignedHere(a)) {
        out.push({ ...a, origin: 'team', originLabel: t.name, originId: t.id });
      }
    });
  });

  projects.filter(p => p.mountainId === mountainId).forEach(p => {
    (p.activities || []).forEach(a => out.push({ ...a, origin: 'project', originLabel: p.name, originId: p.id }));
  });

  locations.filter(l => l.mountainId === mountainId).forEach(loc => {
    (loc.inspections || []).forEach(insp => {
      (insp.activities || []).forEach(a => out.push({ ...a, origin: 'inspection', originLabel: loc.name, originId: insp.id }));
    });
  });

  const seen = new Set<string>();
  return out
    .filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  assigneeContactId?: string;  // YULLR-org contact this note/action is assigned to
  assigneeName?: string;
  authorName?: string;         // who created the note
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
  teams: CRMTeam[];
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
  projects: Project[];
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  transferProjectOwner: (id: string, ownerContactId: string, ownerName: string) => void;
  deleteProject: (id: string) => Promise<void>;
  getProjectsByMountainId: (mountainId: string) => Project[];
  getProjectsByTeamId: (teamId: string) => Project[];
  getProjectById: (id: string) => Project | undefined;
  proposals: Proposal[];
  addProposal: (proposal: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateProposal: (id: string, updates: Partial<Proposal>) => void;
  deleteProposal: (id: string) => Promise<void>;
  getProposalsByMountainId: (mountainId: string) => Proposal[];
  getProposalById: (id: string) => Proposal | undefined;
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
  addNote: (mountainId: string, text: string, topic?: NoteTopic, scheduled?: boolean, completed?: boolean, installProgress?: number, authorName?: string) => string;
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
  addTeam: (team: Omit<CRMTeam, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateTeam: (id: string, updates: Partial<CRMTeam>) => void;
  deleteTeam: (id: string) => void;
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
  PROJECTS: 'yullrLocal_projects',
  PROPOSALS: 'yullrLocal_proposals',
  OPTIONS: 'yullrLocal_options',
  ITEM_PRICES: 'yullrLocal_item_prices',
  PENDING_PHOTOS: 'yullrLocal_pendingPhotoSync',
  CONTACTS: 'yullrLocal_crm_contacts',
  ORGANIZATIONS: 'yullrLocal_crm_organizations',
  TEAMS: 'yullrLocal_crm_teams',
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
    // Tag with the HTTP status so callers (e.g. the offline queue) can tell a
    // permanent application error (4xx — retrying won't help) apart from a
    // transient network/server failure that's worth retrying.
    const error = new Error(errorMsg) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Route a write through the offline queue when offline, or attempt it
 * immediately and queue it as fallback if the network call fails.
 */
async function syncOrQueue(endpoint: string, method: string, body: string | null): Promise<void> {
  if (!navigator.onLine) {
    await offlineQueue.enqueue({ endpoint, method, body }).catch(err => {
      console.error(`Failed to queue offline write for ${method} ${endpoint} — change will not sync:`, err);
      toast.error('Could not save this change for syncing — please retry once back online', { duration: 5000 });
    });
    return;
  }
  try {
    await apiCall(endpoint, {
      method,
      ...(body !== null ? { body } : {}),
    });
  } catch (err) {
    console.error(`Sync failed for ${method} ${endpoint} — queuing for retry:`, err);
    await offlineQueue.enqueue({ endpoint, method, body }).catch(err2 => {
      console.error(`Failed to queue retry for ${method} ${endpoint}:`, err2);
      toast.error('Could not save this change for syncing — please retry once back online', { duration: 5000 });
    });
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
  const [projects, setProjects] = useState<Project[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS) || '[]'); }
    catch { return []; }
  });
  const [proposals, setProposals] = useState<Proposal[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROPOSALS) || '[]'); }
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
  const [teams, setTeams] = useState<CRMTeam[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.TEAMS) || '[]'); }
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
        let localProjects: Project[] = [];
        let localProposals: Proposal[] = [];
        let localContacts: CRMContact[] = [];
        let localOrganizations: CRMOrganization[] = [];
        let localTeams: CRMTeam[] = [];
        try { localMountains = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOUNTAINS) || '[]'); } catch {}
        try { localLocations = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCATIONS) || '[]'); } catch {}
        try { localAssets = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSETS) || '[]'); } catch {}
        try { localNotes = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTES) || '[]'); } catch {}
        try { localTrails = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRAILS) || '[]'); } catch {}
        try { localProjects = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROJECTS) || '[]'); } catch {}
        try { localProposals = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROPOSALS) || '[]'); } catch {}
        try { localContacts = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTACTS) || '[]'); } catch {}
        try { localOrganizations = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORGANIZATIONS) || '[]'); } catch {}
        try { localTeams = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEAMS) || '[]'); } catch {}

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
        const [assetsRes, notesRes, projectsRes, proposalsRes, contactsRes, organizationsRes, teamsRes] = await Promise.all([
          apiCall('/assets').catch(() => silent()),
          apiCall('/notes').catch(() => silent()),
          apiCall('/projects').catch(() => silent()),
          apiCall('/proposals').catch(() => silent()),
          apiCall('/contacts').catch(() => silent()),
          apiCall('/organizations').catch(() => silent()),
          apiCall('/teams').catch(() => silent()),
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
        if (projectsRes) setProjects(mergeById(projectsRes.projects || [], localProjects, 'projects'));
        if (proposalsRes) setProposals(mergeById(proposalsRes.proposals || [], localProposals, 'proposals'));
        if (contactsRes) setContacts(mergeById(contactsRes.contacts || [], localContacts, 'contacts'));
        if (organizationsRes) setOrganizations(mergeById(organizationsRes.organizations || [], localOrganizations, 'organizations'));
        if (teamsRes) setTeams(mergeById(teamsRes.teams || [], localTeams, 'teams'));
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
        console.log('Data loaded successfully (mountains, locations, trails, assets, notes, projects, proposals, contacts, organizations, teams, options, prices)');
      } catch (error) {
        console.warn('Backend load failed — running from local cache:', (error as Error)?.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // ─── Flush offline queue on mount + whenever connectivity returns ─────────────
  // A queued op that fails with a permanent (4xx) error, or one that's been
  // retried past the cap, is dropped instead of blocking every op queued after
  // it — otherwise one permanently-broken write would silently freeze all
  // future syncs (including new trail/location/inspection writes) forever.
  const MAX_QUEUE_RETRIES = 10;
  const flushQueue = useCallback(async () => {
    const ops = await offlineQueue.getAll().catch(() => []);
    if (ops.length === 0) return;
    let succeeded = 0;
    let deadLettered = 0;
    for (const op of ops) {
      try {
        await apiCall(op.endpoint, {
          method: op.method,
          ...(op.body !== null ? { body: op.body } : {}),
        });
        await offlineQueue.remove(op.id);
        succeeded++;
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        const isPermanent = typeof status === 'number' && status >= 400 && status < 500;
        const retries = await offlineQueue.bumpRetry(op.id).catch(() => 0);
        if (isPermanent || retries >= MAX_QUEUE_RETRIES) {
          console.error(`Dropping permanently-failed queued op ${op.method} ${op.endpoint} after ${retries} attempt(s):`, err);
          await offlineQueue.remove(op.id).catch(() => {});
          deadLettered++;
          continue; // don't let this one block ops queued after it
        }
        console.error(`Queue flush failed for ${op.method} ${op.endpoint} (attempt ${retries}) — will retry:`, err);
        break; // transient/network failure — preserve FIFO, retry later
      }
    }
    if (succeeded > 0) {
      console.log(`Flushed ${succeeded} queued operation(s)`);
      window.dispatchEvent(new CustomEvent('queueflushed', { detail: { count: succeeded } }));
      toast.success(`${succeeded} offline change${succeeded !== 1 ? 's' : ''} synced ☁️`, { duration: 3000 });
    }
    if (deadLettered > 0) {
      toast.error(`${deadLettered} offline change${deadLettered !== 1 ? 's' : ''} couldn't be synced and ${deadLettered !== 1 ? 'were' : 'was'} dropped`, { duration: 6000 });
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
      try { localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects)); }
      catch (e) { console.error('Error saving projects:', e); }
    }
  }, [projects, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      try { localStorage.setItem(STORAGE_KEYS.PROPOSALS, JSON.stringify(proposals)); }
      catch (e) { console.error('Error saving proposals:', e); }
    }
  }, [proposals, isLoading]);

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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams)); }
    catch (e) { console.warn('Error saving teams:', e); }
  }, [teams]);

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

  // ─── Projects ─────────────────────────────────────────────────────────────
  // The unit of work on a mountain. Install/Repair/Upgrade; see Project type.

  const addProject = (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newProject: Project = { ...project, id, createdAt: now, updatedAt: now };
    setProjects(prev => [...prev, newProject]);
    syncOrQueue('/projects', 'POST', JSON.stringify(newProject))
      .catch(e => console.error('Project sync error:', e));
    logActivity(newProject.mountainId, 'project_created', `Created ${newProject.type} project "${newProject.name}"`);
    return id;
  };

  const updateProject = (id: string, updates: Partial<Project>) => {
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    syncOrQueue(`/projects/${id}`, 'PUT', JSON.stringify(patch))
      .catch(e => console.error('Project update sync error:', e));
  };

  // Assign / transfer sole ownership to a YULLR contact; logged with old → new.
  const transferProjectOwner = (id: string, ownerContactId: string, ownerName: string) => {
    const project = projects.find(p => p.id === id);
    updateProject(id, { ownerContactId, ownerName });
    if (project) {
      logActivity(project.mountainId, 'owner_transferred', `Project "${project.name}" owner: ${project.ownerName || '—'} → ${ownerName}`);
    }
  };

  const deleteProject = async (id: string) => {
    const project = projects.find(p => p.id === id);
    // Unlink anything pointed at this project (don't delete it).
    setNotes(prev => prev.map(n => (n as any).projectId === id ? { ...n, projectId: undefined } : n));
    setAssets(prev => prev.map(a => (a as any).projectId === id ? { ...a, projectId: undefined } : a));
    setProjects(prev => prev.filter(p => p.id !== id));
    addTombstone('projects', id);
    if (project) logActivity(project.mountainId, 'project_deleted', `Deleted project "${project.name}"`);
    syncOrQueue(`/projects/${id}`, 'DELETE', null)
      .catch(e => console.error('Project delete sync error:', e));
  };

  const getProjectsByMountainId = (mountainId: string) => projects.filter(p => p.mountainId === mountainId);
  const getProjectsByTeamId = (teamId: string) => projects.filter(p => p.teamId === teamId);
  const getProjectById = (id: string) => projects.find(p => p.id === id);

  // ─── Proposals ──────────────────────────────────────────────────────────────
  // One per project. Content lives in the record's `form`.

  const addProposal = (proposal: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt'>) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newProposal: Proposal = { ...proposal, id, createdAt: now, updatedAt: now };
    setProposals(prev => [...prev, newProposal]);
    syncOrQueue('/proposals', 'POST', JSON.stringify(newProposal))
      .catch(e => console.error('Proposal sync error:', e));
    return id;
  };

  const updateProposal = (id: string, updates: Partial<Proposal>) => {
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    setProposals(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    syncOrQueue(`/proposals/${id}`, 'PUT', JSON.stringify(patch))
      .catch(e => console.error('Proposal update sync error:', e));
  };

  const deleteProposal = async (id: string) => {
    setProposals(prev => prev.filter(p => p.id !== id));
    addTombstone('proposals', id);
    syncOrQueue(`/proposals/${id}`, 'DELETE', null)
      .catch(e => console.error('Proposal delete sync error:', e));
  };

  const getProposalsByMountainId = (mountainId: string) => proposals.filter(p => p.mountainId === mountainId);
  const getProposalById = (id: string) => proposals.find(p => p.id === id);

  // ─── Notes ──────────────────────────────────────────────────────────────────

  const addNote = (mountainId: string, text: string, topic?: NoteTopic, scheduled?: boolean, completed?: boolean, installProgress?: number, authorName?: string) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newNote: MountainNote = {
      id,
      mountainId,
      text,
      createdAt: now,
      updatedAt: now,
      ...(authorName && { authorName }),
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
    syncOrQueue('/contacts', 'POST', JSON.stringify(newContact))
      .catch(e => console.error('Contact sync error:', e));
    return id;
  };

  const updateContact = (id: string, updates: Partial<CRMContact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
    syncOrQueue(`/contacts/${id}`, 'PUT', JSON.stringify(updates))
      .catch(e => console.error('Contact update sync error:', e));
  };

  const deleteContact = (id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    addTombstone('contacts', id);
    syncOrQueue(`/contacts/${id}`, 'DELETE', null)
      .catch(e => console.error('Contact delete sync error:', e));
  };

  const addOrganization = (org: Omit<CRMOrganization, 'id' | 'createdAt' | 'updatedAt'>): string => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newOrg: CRMOrganization = { ...org, id, createdAt: now, updatedAt: now };
    setOrganizations(prev => [...prev, newOrg]);
    syncOrQueue('/organizations', 'POST', JSON.stringify(newOrg))
      .catch(e => console.error('Organization sync error:', e));
    return id;
  };

  const updateOrganization = (id: string, updates: Partial<CRMOrganization>) => {
    setOrganizations(prev => prev.map(o => o.id === id ? { ...o, ...updates, updatedAt: new Date().toISOString() } : o));
    syncOrQueue(`/organizations/${id}`, 'PUT', JSON.stringify(updates))
      .catch(e => console.error('Organization update sync error:', e));
  };

  const deleteOrganization = (id: string) => {
    setOrganizations(prev => prev.filter(o => o.id !== id));
    addTombstone('organizations', id);
    syncOrQueue(`/organizations/${id}`, 'DELETE', null)
      .catch(e => console.error('Organization delete sync error:', e));
  };

  const addTeam = (team: Omit<CRMTeam, 'id' | 'createdAt' | 'updatedAt'>): string => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newTeam: CRMTeam = { ...team, id, createdAt: now, updatedAt: now };
    setTeams(prev => [...prev, newTeam]);
    syncOrQueue('/teams', 'POST', JSON.stringify(newTeam))
      .catch(e => console.error('Team sync error:', e));
    (newTeam.mountainIds || []).forEach(mid =>
      logActivity(mid, 'team_added', `Team "${newTeam.name}" added${newTeam.createdBy ? ` by ${newTeam.createdBy}` : ''}`)
    );
    return id;
  };

  const updateTeam = (id: string, updates: Partial<CRMTeam>) => {
    setTeams(prev => prev.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t));
    syncOrQueue(`/teams/${id}`, 'PUT', JSON.stringify(updates))
      .catch(e => console.error('Team update sync error:', e));
  };

  const deleteTeam = (id: string) => {
    setTeams(prev => prev.filter(t => t.id !== id));
    setProjects(prev => prev.filter(p => p.teamId !== id));
    addTombstone('teams', id);
    syncOrQueue(`/teams/${id}`, 'DELETE', null)
      .catch(e => console.error('Team delete sync error:', e));
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
        teams,
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
        projects,
        addProject,
        updateProject,
        transferProjectOwner,
        deleteProject,
        getProjectsByMountainId,
        getProjectsByTeamId,
        getProjectById,
        proposals,
        addProposal,
        updateProposal,
        deleteProposal,
        getProposalsByMountainId,
        getProposalById,
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
        addTeam,
        updateTeam,
        deleteTeam,
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