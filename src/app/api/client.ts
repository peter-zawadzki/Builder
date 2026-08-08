import { useAuth } from "@clerk/clerk-react";
import { useMemo } from "react";

// Authenticated client for the local API. Attaches the Clerk session token as a
// Bearer header; requests go to /api (proxied to the Hono server in dev, same
// origin in prod). This is the data layer the new-model screens run on.

export interface MountainSummary {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  project_stage: string | null;
  is_stalled: boolean | null;
  trail_count: number;
  location_count: number;
  asset_count: number;
  note_count: number;
}

export interface Mountain {
  id: string;
  name: string;
  address: string | null;
  region: string | null;
  legal_entity: string | null;
  billing_address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  acreage: number | null;
  vertical_drop: number | null;
  trail_count_stated: number | null;
  ip_subnet: string | null;
  timing_systems: string[] | null;
  status: string;
  notes: string | null;
}

export interface MountainInput {
  name: string;
  address?: string | null;
  region?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  legal_entity?: string | null;
  billing_address?: string | null;
  notes?: string | null;
  status?: string;
}

export interface Trail {
  id: string;
  mountain_id: string;
  name: string;
  notes: string | null;
  is_nastar: boolean;
  location_count?: number;
}

export interface Location {
  id: string;
  mountain_id: string;
  trail_id: string | null;
  trail_name?: string | null;
  name: string;
  difficulty: number | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  asset_count?: number;
  inspection_count?: number;
}

export interface Inspection {
  id: string;
  location_id: string;
  items: any[];
  notes: string | null;
  created_at: string;
}

export function useApi() {
  const { getToken } = useAuth();

  return useMemo(() => {
    async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
      const token = await getToken();
      const res = await fetch(`/api${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
          ...(options.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return res.json();
    }

    return {
      me: () => request<{ user: AppMeUser }>("/me"),
      updateDigestPreference: (enabled: boolean) =>
        request<{ ok: true; enabled: boolean }>("/me/digest-preference", { method: "PATCH", body: JSON.stringify({ enabled }) }),
      listMountains: () => request<{ mountains: MountainSummary[] }>("/mountains"),
      getMountain: (id: string) =>
        request<{ mountain: Mountain; project: any }>(`/mountains/${id}`),
      createMountain: (data: MountainInput) =>
        request<{ mountain: Mountain }>("/mountains", { method: "POST", body: JSON.stringify(data) }),
      updateMountain: (id: string, data: Partial<MountainInput>) =>
        request<{ mountain: Mountain }>(`/mountains/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      deleteMountain: (id: string) =>
        request<{ ok: true }>(`/mountains/${id}`, { method: "DELETE" }),

      // Trails
      listTrails: (mountainId: string) =>
        request<{ trails: Trail[] }>(`/trails?mountainId=${mountainId}`),
      getTrail: (id: string) => request<{ trail: Trail; locations: Location[] }>(`/trails/${id}`),
      createTrail: (data: { mountain_id: string; name: string; notes?: string; is_nastar?: boolean }) =>
        request<{ trail: Trail }>("/trails", { method: "POST", body: JSON.stringify(data) }),
      updateTrail: (id: string, data: Partial<Trail>) =>
        request<{ trail: Trail }>(`/trails/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      deleteTrail: (id: string) => request<{ ok: true }>(`/trails/${id}`, { method: "DELETE" }),

      // Locations
      listLocations: (params: { mountainId?: string; trailId?: string }) => {
        const qs = params.trailId ? `trailId=${params.trailId}` : `mountainId=${params.mountainId}`;
        return request<{ locations: Location[] }>(`/locations?${qs}`);
      },
      getLocation: (id: string) =>
        request<{ location: Location; inspections: Inspection[] }>(`/locations/${id}`),
      createLocation: (data: Partial<Location> & { mountain_id: string; name: string }) =>
        request<{ location: Location }>("/locations", { method: "POST", body: JSON.stringify(data) }),
      updateLocation: (id: string, data: Partial<Location>) =>
        request<{ location: Location }>(`/locations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      deleteLocation: (id: string) => request<{ ok: true }>(`/locations/${id}`, { method: "DELETE" }),
      addInspection: (locationId: string, data: { items: any[]; notes?: string }) =>
        request<{ inspection: Inspection }>(`/locations/${locationId}/inspections`, {
          method: "POST",
          body: JSON.stringify(data),
        }),

      // FAQ assistant
      askFaq: (question: string, sessionId: string, history: FaqHistoryTurn[] = []) =>
        request<FaqAskResult>("/faq-agent/ask", { method: "POST", body: JSON.stringify({ question, sessionId, history }) }),
      listOdinVideos: () => request<{ videos: OdinVideoListItem[] }>("/odin-video"),
      requestOdinVideo: (flowKey: string, detailLevel: number) =>
        request<{ id: string; status: string }>("/odin-video/request", { method: "POST", body: JSON.stringify({ flowKey, detailLevel }) }),
      getOdinVideo: (id: string) => request<OdinVideoResult>(`/odin-video/${id}`),
      listOdinNotifications: () => request<{ notifications: OdinNotification[] }>("/odin-video/notifications"),
      markOdinNotificationRead: (id: string) => request<{ ok: true }>(`/odin-video/notifications/${id}/read`, { method: "POST" }),

      // FEEDBACK section
      feedbackTurn: (question: string, history: FaqHistoryTurn[]) =>
        request<IntakeTurnResult>("/feedback-agent/turn", { method: "POST", body: JSON.stringify({ question, history }) }),
      finalizeFeedback: (collectedSummary: CollectedSummary, history: FaqHistoryTurn[], force?: boolean) =>
        request<FinalizeResult>("/feedback/finalize", { method: "POST", body: JSON.stringify({ collectedSummary, history, force }) }),
      getFeedbackSubmission: (id: string) => request<FeedbackSubmission>(`/feedback/${id}`),
      approveBug: (id: string) => request<{ ok: true }>(`/feedback/${id}/approve-bug`, { method: "POST" }),
      requestBugChanges: (id: string, feedbackText: string) =>
        request<{ ok: true; analysis: string }>(`/feedback/${id}/request-bug-changes`, { method: "POST", body: JSON.stringify({ feedback: feedbackText }) }),
      reviseMockup: (id: string, feedbackText: string) =>
        request<{ mockupHtml: string; revisionCount: number; capped: boolean }>(`/feedback/${id}/revise-mockup`, { method: "POST", body: JSON.stringify({ feedback: feedbackText }) }),
      approveMockup: (id: string) => request<{ ok: true }>(`/feedback/${id}/approve-mockup`, { method: "POST" }),
      listFeedbackSubmissions: () => request<{ submissions: FeedbackSubmissionSummary[] }>("/feedback"),
      completeFeedback: (id: string) => request<{ ok: true }>(`/feedback/${id}/complete`, { method: "POST" }),
      listFeedbackNotifications: () => request<{ notifications: FeedbackNotification[] }>("/feedback/notifications"),
      markFeedbackNotificationRead: (id: string) => request<{ ok: true }>(`/feedback/notifications/${id}/read`, { method: "POST" }),
      sendFaqFeedback: (data: {
        question: string;
        answer: string;
        rating: "up" | "down";
        sources: FaqSource[];
        sessionId: string;
      }) => request<{ ok: true }>("/faq-agent/feedback", { method: "POST", body: JSON.stringify(data) }),

      // Knowledge base (admin) — logged interactions turned into curated FAQ entries
      listFaqEntries: () => request<{ entries: FaqEntry[] }>("/knowledge-base/entries"),
      listKnowledgeGaps: () => request<{ gaps: KnowledgeGap[] }>("/knowledge-base/gaps"),
      dismissKnowledgeGap: (ids: number[]) =>
        request<{ ok: true }>("/knowledge-base/gaps/dismiss", { method: "POST", body: JSON.stringify({ ids }) }),
      listKnowledgeCandidates: () => request<{ candidates: KnowledgeCandidate[] }>("/knowledge-base/candidates"),
      promoteToFaq: (data: { question: string; category: string; answer: string; gapIds?: number[] }) =>
        request<{ ok: true; id: string }>("/knowledge-base/promote", { method: "POST", body: JSON.stringify(data) }),
      getKnowledgeBaseStats: () => request<KnowledgeBaseStats>("/knowledge-base/stats"),

      // Notes — replies, notifications, semantic search, and keeping the RAG in sync
      embedNote: (data: NoteRef & { content: string; mountainId?: string }) =>
        request<{ ok: true }>("/notes/embed", { method: "POST", body: JSON.stringify(data) }),
      listNoteReplies: (ref: NoteRef) =>
        request<{ replies: NoteReply[] }>(`/notes/replies?noteSource=${ref.noteSource}&noteId=${ref.noteId}`),
      postNoteReply: (data: NoteRef & { text: string }) =>
        request<{ id: string; createdAt: string }>("/notes/replies", { method: "POST", body: JSON.stringify(data) }),
      listNoteNotifications: () => request<{ notifications: NoteNotification[] }>("/notes/notifications"),
      markNoteNotificationRead: (id: string) => request<{ ok: true }>(`/notes/notifications/${id}/read`, { method: "POST" }),
      searchNotes: (q: string, mountainId?: string) =>
        request<{ results: NoteSearchResult[] }>(`/notes/search?q=${encodeURIComponent(q)}${mountainId ? `&mountainId=${mountainId}` : ""}`),
    };
  }, [getToken]);
}

export interface AppMeUser {
  id: string;
  email: string | null;
  name: string | null;
  role: "user" | "admin" | "super_admin";
  isSuperAdmin: boolean;
  dailyDigestEnabled: boolean;
}

// Notes
export interface NoteRef {
  noteSource: "mountain_note" | "activity";
  noteId: string;
  originCollection?: string;
  originId?: string;
}

export interface NoteReply {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface NoteNotification {
  id: string;
  noteSource: string;
  noteId: string;
  text: string;
  createdAt: string;
  originCollection: string | null;
  originId: string | null;
  mountainId: string | null;
}

export interface NoteSearchResult {
  noteSource: string;
  noteId: string;
  originCollection: string | null;
  originId: string | null;
  mountainId: string | null;
  content: string;
  score: number;
}

export interface FaqSource {
  type: "faq" | "code";
  label: string;
}

export interface FaqHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface FaqVisualHighlight {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  label?: string;
}

export interface FaqVisualStep {
  imageUrl: string;
  caption: string;
  highlights?: FaqVisualHighlight[];
}

export interface FaqVisual {
  key: string;
  label: string;
  steps: FaqVisualStep[];
}

export interface FaqAskResult {
  answer: string;
  confident: boolean;
  needsUserInput: boolean;
  sources: FaqSource[];
  visuals: FaqVisual[];
  videoOffer: { flowKey: string; label: string } | null;
}

export interface OdinVideoResult {
  id: string;
  flowKey: string;
  detailLevel: number;
  status: "generating" | "ready" | "failed";
  videoUrl: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface OdinNotification {
  id: string;
  kind: "video_ready" | "video_failed";
  videoId: string;
  text: string;
  createdAt: string;
}

export interface OdinVideoListItem {
  id: string;
  flowKey: string;
  label: string;
  detailLevel: number;
  durationMs: number | null;
  createdAt: string;
}

// Knowledge base (admin)
export interface FaqEntry {
  id: string;
  category: string;
  question: string;
  answer: string;
  status: string;
}

export interface KnowledgeGap {
  ids: number[];
  question: string;
  count: number;
  pathTried: string;
  latestAt: string;
  askers: { name: string | null; email: string | null }[];
}

export interface KnowledgeCandidate {
  id: number;
  question: string;
  answer: string;
  sources: FaqSource[] | null;
  createdAt: string;
  askedBy: string | null;
}

export interface KnowledgeBaseStats {
  totalInteractions: number;
  confidentRatePct: number;
  feedback: Record<string, number>;
  recentGaps: { question: string; created_at: string }[];
}

// FEEDBACK section
export type FeedbackType = "bug" | "feature" | "general";
export type FeedbackPlatform = "Builder" | "YULLR.com" | "Portal";

export interface CollectedSummary {
  type: FeedbackType;
  platform: FeedbackPlatform;
  summary: string;
  fields: Record<string, string>;
}

export interface IntakeTurnResult {
  message: string;
  stage: "choose_type" | "choose_platform" | "gathering_details" | "ready_to_finalize";
  quickReplies?: string[];
  readyToFinalize: boolean;
  collectedSummary?: CollectedSummary;
}

export interface FinalizeResult {
  id?: string;
  status?: "in_review" | "submitted";
  mockupHtml?: string;
  duplicateWarning?: { id: string; summary: string; createdAt: string };
}

export interface FeedbackSubmission {
  id: string;
  type: FeedbackType;
  platform: FeedbackPlatform;
  status: "in_review" | "approved" | "submitted" | "resolved";
  submitterName: string | null;
  submitterEmail: string | null;
  summary: string;
  details: Record<string, string>;
  bugAnalysis: string | null;
  affectedFiles: { path: string; sha256: string }[] | null;
  staleness: { path: string; stale: boolean }[];
  bugRevisionCount: number;
  mockupHtml: string | null;
  mockupRevisionCount: number;
  devBrief: string | null;
  approvedAt: string | null;
  emailedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface FeedbackSubmissionSummary {
  id: string;
  type: FeedbackType;
  platform: FeedbackPlatform;
  status: "in_review" | "approved" | "submitted" | "resolved";
  summary: string;
  submitterName: string | null;
  submitterEmail: string | null;
  createdAt: string;
  completedAt: string | null;
  hasFix: boolean;
  hasBrief: boolean;
  hasMockup: boolean;
}

export interface FeedbackNotification {
  id: string;
  kind: "review_requested" | "revised";
  submissionId: string;
  text: string;
  createdAt: string;
}
