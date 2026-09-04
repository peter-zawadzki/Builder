import type { CapTableHolder, ConvertibleNoteTerm } from '../engine/types';

// Extracted from dilution/YULLR_Cap_Table.xlsx (the authoritative current cap table —
// the workbook's own computed conversion cells are stale/zero because iterative
// circular-reference calc was off when last saved, so only the raw inputs below are
// trusted: founder/option shares, and each note's principal/date/rate/cap/discount).

export const FOUNDING_HOLDERS: CapTableHolder[] = [
  { id: 'doucette', name: 'Sean Doucette', category: 'founder', shares: 5_400_000 },
  { id: 'zawadzki', name: 'Peter Zawadzki', category: 'founder', shares: 3_600_000 },
  { id: 'stonier', name: 'Jeremy Stonier', category: 'founder', shares: 1_227_300 },
  { id: 'unallocated-pool', name: 'Option Pool', category: 'option-pool', shares: 500_000 },
];

const NOTE_RATE_PCT = 6;
const NOTE_CAP = 16_000_000;
const NOTE_DISCOUNT_PCT = 20;

// { holder, principal, issueDate } tuples, in issue-date order.
const NOTE_INPUTS: [string, number, string][] = [
  ['Weaver', 200_000, '2026-03-01'],
  ['Kearns', 200_000, '2026-03-03'],
  ['Stephenson', 100_000, '2026-03-10'],
  ['Benshoff', 200_000, '2026-03-20'],
  ['Cook', 50_000, '2026-03-25'],
  ['Kearns', 50_000, '2026-03-30'],
  ['Beacon', 50_000, '2026-04-02'],
  ['Caruso', 65_000, '2026-04-02'],
  ['Coffman', 35_000, '2026-04-03'],
  ['Charrier', 100_000, '2026-04-03'],
  ['Benson', 20_000, '2026-04-03'],
  ['Cassidy', 20_000, '2026-04-04'],
  ['Quintegro', 110_000, '2026-04-05'],
  ['Nefus', 50_000, '2026-04-07'],
  ['Brook', 25_000, '2026-04-07'],
  ['Autor', 25_000, '2026-04-10'],
  ['Pingree', 200_000, '2026-04-13'],
];

export const EXISTING_NOTES: ConvertibleNoteTerm[] = NOTE_INPUTS.map(
  ([holderName, principal, issueDate], i) => ({
    id: `note-${i}-${holderName.toLowerCase()}`,
    holderName,
    principal,
    issueDate,
    interestRatePct: NOTE_RATE_PCT,
    valuationCap: NOTE_CAP,
    discountPct: NOTE_DISCOUNT_PCT,
  })
);

export const DEFAULT_NOTE_TERMS = {
  interestRatePct: NOTE_RATE_PCT,
  valuationCap: NOTE_CAP,
  discountPct: NOTE_DISCOUNT_PCT,
};

export const TOTAL_FOUNDING_SHARES = FOUNDING_HOLDERS.reduce((sum, h) => sum + h.shares, 0);
export const TOTAL_NOTE_PRINCIPAL = EXISTING_NOTES.reduce((sum, n) => sum + n.principal, 0);
