// "No movement in 5+ business days" checks for the daily digest. Builder has
// no reliable per-stage-change timestamp on projects today — `updatedAt`
// bumps on ANY field edit (renaming, touching an unrelated note, etc.), not
// specifically on status/stage changes — so this is a best-effort signal,
// not a precise one. Projects already flagged `isStalled` by a human are
// always included regardless of date, since that's a more reliable signal
// than anything computed here.
export interface StaleCheckProject {
  isStalled?: boolean;
  updatedAt: string;
  ownerContactId?: string;
}

export interface StaleCheckProposal {
  clientSignature?: { signedAt?: string } | null;
  yullrSignature?: { signedAt?: string } | null;
  sentAt?: string;
  createdAt: string;
  createdByEmail?: string;
}

const STALE_BUSINESS_DAYS = 5;

// Counts weekdays strictly between `from` and `now` (Sat/Sun don't count) —
// a rough but adequate business-day count for a "hasn't moved in N working
// days" threshold; doesn't account for holidays.
export function businessDaysSince(from: string | Date, now: Date = new Date()): number {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

export function isProjectStale(project: StaleCheckProject, now: Date = new Date()): boolean {
  if (project.isStalled) return true;
  return businessDaysSince(project.updatedAt, now) >= STALE_BUSINESS_DAYS;
}

export function isProposalStale(proposal: StaleCheckProposal, now: Date = new Date()): boolean {
  const signed = !!proposal.clientSignature?.signedAt && !!proposal.yullrSignature?.signedAt;
  if (signed) return false;
  const reference = proposal.sentAt || proposal.createdAt;
  return businessDaysSince(reference, now) >= STALE_BUSINESS_DAYS;
}
