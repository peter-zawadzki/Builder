import type {
  CapTableHolder,
  CapTableResult,
  CapTableRowResult,
  ConvertibleNoteTerm,
  PendingNoteInput,
  PendingRoundInput,
} from './types';

// Ported from dilution/yullr_dilution_tool_4.html's solveSeriesA() (damped fixed-point
// iteration for the circular note-conversion-price / share-count relationship) and
// generalized to take the real founder/note lists instead of hardcoded constants.

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function noteBalance(principal: number, ratePct: number, issueDate: Date, asOfDate: Date): number {
  const days = Math.max(0, (asOfDate.getTime() - issueDate.getTime()) / MS_PER_DAY);
  return principal * (1 + (ratePct / 100) * (days / 365));
}

interface SolvedNote {
  id: string;
  holderName: string;
  balance: number;
  cap: number;
  discountPct: number;
  price: number;
  shares: number;
}

interface RoundSolution {
  pricePerShare: number;
  newPoolShares: number;
  notes: SolvedNote[];
}

function solveRound(
  foundingShares: number,
  existingPoolShares: number,
  preMoneyValuation: number,
  newMoneyAmount: number,
  notes: SolvedNote[],
  poolRefresh: { enabled: boolean; targetPct: number }
): RoundSolution {
  let noteShares = 0;
  let newPoolShares = 0;

  for (let iter = 0; iter < 300; iter++) {
    const preMoneyShares = foundingShares + newPoolShares + noteShares;
    const pricePerShare = preMoneyValuation / preMoneyShares;
    let nextNoteShares = 0;
    for (const nt of notes) {
      const capPrice = nt.cap / foundingShares;
      const discountPrice = pricePerShare * (1 - nt.discountPct / 100);
      nt.price = Math.min(capPrice, discountPrice);
      nt.shares = nt.balance / nt.price;
      nextNoteShares += nt.shares;
    }
    let targetNewPool = 0;
    if (poolRefresh.enabled) {
      const newInvestorSharesEst = newMoneyAmount / pricePerShare;
      const totalPostEst = preMoneyShares + newInvestorSharesEst;
      targetNewPool = Math.max(0, poolRefresh.targetPct * totalPostEst - existingPoolShares);
    }
    newPoolShares = (newPoolShares + targetNewPool) / 2;
    noteShares = (noteShares + nextNoteShares) / 2;
  }

  const finalPreMoneyShares = foundingShares + newPoolShares + noteShares;
  const finalPricePerShare = preMoneyValuation / finalPreMoneyShares;
  for (const nt of notes) {
    const capPrice = nt.cap / foundingShares;
    const discountPrice = finalPricePerShare * (1 - nt.discountPct / 100);
    nt.price = Math.min(capPrice, discountPrice);
    nt.shares = nt.balance / nt.price;
  }

  return { pricePerShare: finalPricePerShare, newPoolShares, notes };
}

export interface CapTableInput {
  founders: CapTableHolder[];
  existingNotes: ConvertibleNoteTerm[];
  pendingNote?: PendingNoteInput;
  pendingRound?: PendingRoundInput;
  /** Only used when no round is pending — the date used to display accrued note balances. */
  viewingDate: string;
}

export function computeCapTable(input: CapTableInput): CapTableResult {
  const { founders, existingNotes, pendingNote, pendingRound, viewingDate } = input;

  const foundingShares = founders.reduce((sum, h) => sum + h.shares, 0);
  const existingPoolShares = founders
    .filter((h) => h.category === 'option-pool')
    .reduce((sum, h) => sum + h.shares, 0);
  const founderShares = founders
    .filter((h) => h.category === 'founder')
    .reduce((sum, h) => sum + h.shares, 0);

  const allNoteTerms: ConvertibleNoteTerm[] = pendingNote
    ? [
        ...existingNotes,
        {
          id: 'pending-note',
          holderName: pendingNote.holderName || 'New Note Holder',
          principal: pendingNote.principal,
          issueDate: pendingNote.issueDate,
          interestRatePct: pendingNote.interestRatePct,
          valuationCap: pendingNote.valuationCap,
          discountPct: pendingNote.discountPct,
        },
      ]
    : existingNotes;

  const founderPctBefore = founderShares / foundingShares;

  if (pendingRound) {
    const closeDate = new Date(pendingRound.closeDate);
    const activeTerms = allNoteTerms.filter((nt) => new Date(nt.issueDate) <= closeDate);
    const inactiveTerms = allNoteTerms.filter((nt) => new Date(nt.issueDate) > closeDate);
    const solvedInputs: SolvedNote[] = activeTerms.map((nt) => ({
      id: nt.id,
      holderName: nt.holderName,
      balance: noteBalance(nt.principal, nt.interestRatePct, new Date(nt.issueDate), closeDate),
      cap: nt.valuationCap,
      discountPct: nt.discountPct,
      price: 0,
      shares: 0,
    }));

    const solved = solveRound(
      foundingShares,
      existingPoolShares,
      pendingRound.preMoneyValuation,
      pendingRound.amountRaised,
      solvedInputs,
      { enabled: pendingRound.optionPoolRefreshEnabled, targetPct: pendingRound.optionPoolTargetPct }
    );

    const noteSharesTotal = solved.notes.reduce((sum, nt) => sum + nt.shares, 0);
    const newInvestorShares = pendingRound.amountRaised / solved.pricePerShare;
    const totalSharesAfter = foundingShares + solved.newPoolShares + noteSharesTotal + newInvestorShares;

    const rows: CapTableRowResult[] = [];
    for (const h of founders) {
      const sharesAfter = h.category === 'option-pool' ? h.shares + solved.newPoolShares : h.shares;
      rows.push({
        id: h.id,
        name: h.name,
        category: h.category,
        sharesBefore: h.shares,
        pctBefore: h.shares / foundingShares,
        sharesAfter,
        pctAfter: sharesAfter / totalSharesAfter,
        note:
          h.category === 'option-pool' && solved.newPoolShares > 1
            ? `Topped up +${Math.round(solved.newPoolShares).toLocaleString('en-US')} sh pre-money`
            : undefined,
      });
    }
    for (const nt of solved.notes) {
      rows.push({
        id: nt.id,
        name: nt.holderName,
        category: 'note-holder',
        sharesBefore: 0,
        pctBefore: 0,
        sharesAfter: nt.shares,
        pctAfter: nt.shares / totalSharesAfter,
        note: `Converts @ $${nt.price.toFixed(3)}/sh, balance $${Math.round(nt.balance).toLocaleString('en-US')}`,
      });
    }
    for (const nt of inactiveTerms) {
      rows.push({
        id: nt.id,
        name: nt.holderName,
        category: 'note-holder',
        sharesBefore: 0,
        pctBefore: 0,
        sharesAfter: 0,
        pctAfter: 0,
        note: 'Issued after this round’s close date — not participating, still outstanding',
      });
    }
    rows.push({
      id: 'new-investor',
      name: 'New Round Investor',
      category: 'new-investor',
      sharesBefore: 0,
      pctBefore: 0,
      sharesAfter: newInvestorShares,
      pctAfter: newInvestorShares / totalSharesAfter,
      note: `Buys @ $${solved.pricePerShare.toFixed(3)}/sh for $${Math.round(pendingRound.amountRaised).toLocaleString('en-US')}`,
    });

    const founderSharesAfter = founderShares;
    const founderPctAfter = founderSharesAfter / totalSharesAfter;

    return {
      totalSharesBefore: foundingShares,
      totalSharesAfter,
      rows,
      roundActive: true,
      pricePerShare: solved.pricePerShare,
      postMoneyValuation: pendingRound.preMoneyValuation + pendingRound.amountRaised,
      newSharesIssued: noteSharesTotal + newInvestorShares,
      founderPctBefore,
      founderPctAfter,
      founderDilutionPts: (founderPctBefore - founderPctAfter) * 100,
    };
  }

  // No round pending — notes just accrue as outstanding debt, nothing converts.
  const asOf = new Date(viewingDate);
  const rows: CapTableRowResult[] = founders.map((h) => ({
    id: h.id,
    name: h.name,
    category: h.category,
    sharesBefore: h.shares,
    pctBefore: h.shares / foundingShares,
    sharesAfter: h.shares,
    pctAfter: h.shares / foundingShares,
  }));
  for (const nt of allNoteTerms) {
    const balance = noteBalance(nt.principal, nt.interestRatePct, new Date(nt.issueDate), asOf);
    rows.push({
      id: nt.id,
      name: nt.holderName,
      category: 'note-holder',
      sharesBefore: 0,
      pctBefore: 0,
      sharesAfter: 0,
      pctAfter: 0,
      note: `Outstanding, unconverted — balance ~$${Math.round(balance).toLocaleString('en-US')} as of viewing date`,
    });
  }

  return {
    totalSharesBefore: foundingShares,
    totalSharesAfter: foundingShares,
    rows,
    roundActive: false,
    pricePerShare: null,
    postMoneyValuation: null,
    newSharesIssued: 0,
    founderPctBefore,
    founderPctAfter: founderPctBefore,
    founderDilutionPts: 0,
  };
}
