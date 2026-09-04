export interface InvoiceItem {
  name: string;
  value: number;
  date: string;
}

export interface ExistingLaunch {
  id: string;
  name: string;
  value: number;
  date: Date | string;
}

export type MatchKind = 'same_value' | 'value_mismatch';

export interface ExistingMatchView {
  id: string;
  name: string;
  value: number;
  date: string;
}

export interface AttachedMatch {
  kind: MatchKind;
  titleSimilarity: number;
  existing: ExistingMatchView;
}

export interface MatchedInvoiceItem<T extends InvoiceItem> {
  item: T;
  match?: AttachedMatch;
}

const UNITS = [
  '',
  'um',
  'dois',
  'tres',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
];
const TEENS = [
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const TENS = [
  '',
  'dez',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];

function numberToPt(n: number): string {
  if (n === 0) return 'zero';
  if (n === 100) return 'cem';
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    return unit === 0 ? TENS[ten] : `${TENS[ten]} e ${UNITS[unit]}`;
  }
  return String(n);
}

export function normalizeTitle(name: string): string {
  const withoutInstallment = name.replace(/\s+\d+\s*\/\s*\d+\s*$/g, '');
  const spaced = withoutInstallment
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2');

  const withNumbers = spaced.replace(/\d+/g, (digits) => {
    const n = parseInt(digits, 10);
    return n >= 0 && n <= 100 ? numberToPt(n) : digits;
  });

  return withNumbers
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(name: string): string[] {
  return normalizeTitle(name)
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Acquirer/gateway prefixes Nubank prints before the merchant name */
const NOISE_TOKENS = new Set([
  'parcela',
  'parc',
  'ec',
  'mp',
  'ifd',
  'hna',
  'zp',
  'pg',
  'glx',
  'brs',
  'dl',
  'crd',
  'ipag',
  'pa',
  'htm',
  'paygo',
]);

function stripInstallmentMarkers(name: string): string {
  return name
    .replace(/\s*[-–]?\s*parcela\s+\d+\s*\/\s*\d+/gi, ' ')
    .replace(/\s*\(\s*\d+\s*\/\s*\d+\s*\)/g, ' ')
    .replace(/\s+\d+\s*\/\s*\d+\s*$/g, ' ');
}

function merchantTokens(name: string): string[] {
  return tokenize(stripInstallmentMarkers(name)).filter(
    (token) => !NOISE_TOKENS.has(token),
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const curr = new Array<number>(cols);

  for (let j = 0; j < cols; j++) prev[j] = j;

  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  if (a.includes(b) || b.includes(a)) {
    return Math.max(a.length, b.length) === 0
      ? 1
      : (Math.min(a.length, b.length) / Math.max(a.length, b.length)) * 0.15 +
          0.8;
  }
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function tokensSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 3;
  return stringSimilarity(a, b) >= 0.72;
}

function matchedTokenWeight(left: string[], right: string[]): number {
  const used = new Set<number>();
  let matched = 0;

  for (const token of left) {
    let bestIdx = -1;
    let best = 0;
    right.forEach((candidate, idx) => {
      if (used.has(idx)) return;
      const score = tokensSimilar(token, candidate)
        ? Math.max(stringSimilarity(token, candidate), 0.85)
        : 0;
      if (score > best) {
        best = score;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0 && best >= 0.72) {
      used.add(bestIdx);
      matched += best;
    }
  }

  return matched;
}

function tokenSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  return matchedTokenWeight(left, right) / Math.max(left.length, right.length);
}

export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;

  const whole = stringSimilarity(na, nb);
  const tokens = tokenSimilarity(tokenize(a), tokenize(b));
  return Math.max(whole, tokens);
}

/**
 * How much of the shorter merchant name is covered by the longer one. Unlike
 * `titleSimilarity` this does not punish the extra words users add ("Loja"
 * vs "Loja presente de aniversário"), which is what makes it usable as the
 * tie breaker when value and installment already agree.
 */
export function merchantOverlap(a: string, b: string): number {
  const left = merchantTokens(a);
  const right = merchantTokens(b);
  if (left.length === 0 || right.length === 0) return 0;

  return matchedTokenWeight(left, right) / Math.min(left.length, right.length);
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

export function toDateOnly(date: Date | string): string {
  if (typeof date === 'string') {
    return date.slice(0, 10);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysApart(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T12:00:00Z`);
  const db = Date.parse(`${b.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 99;
  return Math.abs(da - db) / 86_400_000;
}

function dateProximity(a: string, b: string): number {
  const days = daysApart(a, b);
  if (days > 14) return 0;
  return 1 - days / 14;
}

function toView(existing: ExistingLaunch): ExistingMatchView {
  return {
    id: existing.id,
    name: existing.name,
    value: existing.value,
    date: toDateOnly(existing.date),
  };
}

interface Candidate {
  invoiceIndex: number;
  existingIndex: number;
  kind: MatchKind;
  titleSimilarity: number;
  score: number;
}

export function extractInstallment(
  name: string,
): { current: number; total: number } | null {
  const match =
    name.match(/parcela\s+(\d+)\s*\/\s*(\d+)/i) ??
    name.match(/\((\d+)\s*\/\s*(\d+)\)/) ??
    name.match(/(\d+)\s*\/\s*(\d+)\s*$/);

  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (current < 1 || total < 1 || current > total) return null;
  return { current, total };
}

function uniqueValue(cents: number, values: number[]): boolean {
  return values.filter((v) => v === cents).length === 1;
}

/** Amount plus installment plan, e.g. "5000:10" for R$ 50,00 in 10x */
function installmentKey(cents: number, name: string): string {
  const installment = extractInstallment(name);
  return `${cents}:${installment ? installment.total : '-'}`;
}

type InstallmentRelation =
  | 'none'
  | 'partial'
  | 'equal'
  | 'same_plan'
  | 'conflict';

/**
 * A different number of installments means different purchases. The same
 * number with a different index does not: issuers and users disagree on when
 * a plan started, so "(8/12)" and "Parcela 4/12" of the same amount are the
 * same charge seen from two different counters.
 */
function installmentRelation(left: string, right: string): InstallmentRelation {
  const a = extractInstallment(left);
  const b = extractInstallment(right);
  if (!a && !b) return 'none';
  if (!a || !b) return 'partial';
  if (a.total !== b.total) return 'conflict';
  return a.current === b.current ? 'equal' : 'same_plan';
}

/**
 * Value and date carry more weight than the title: users often rename the
 * merchant. Candidates are already restricted to a single invoice period, so
 * the day distance only matters when there is no stronger signal:
 *
 * - Installments are dated on the invoice opening day by the issuer while the
 *   user keeps the purchase day, so the same amount on the same plan can
 *   legitimately be weeks apart inside one invoice.
 * - A single invoice cannot bill the same amount on the same plan twice, so
 *   when both sides have exactly one such charge the title is irrelevant.
 * - The same merchant name with the same amount is also enough on its own;
 *   repeated purchases are paired by date proximity when scoring.
 */
function acceptSameValue(params: {
  days: number;
  similarity: number;
  overlap: number;
  uniqueInvoice: boolean;
  uniqueExisting: boolean;
  uniquePlan: boolean;
  relation: InstallmentRelation;
}): boolean {
  const {
    days,
    similarity,
    overlap,
    uniqueInvoice,
    uniqueExisting,
    uniquePlan,
    relation,
  } = params;
  const unique = uniqueInvoice && uniqueExisting;

  if (relation === 'conflict' || relation === 'partial') return false;
  if (relation === 'equal') return overlap >= 0.4 || uniquePlan;
  if (relation === 'same_plan') return overlap >= 0.4;
  if (overlap >= 0.8) return true;
  if (days > 7) return false;
  if (days <= 1 && unique && similarity >= 0.15) return true;
  if (days <= 3 && unique && similarity >= 0.22) return true;
  if (days <= 3 && (similarity >= 0.3 || overlap >= 0.5)) return true;
  if (days <= 7 && similarity >= 0.45) return true;
  return false;
}

export function matchInvoiceToExisting<T extends InvoiceItem>(
  invoice: T[],
  existing: ExistingLaunch[],
): {
  transactions: MatchedInvoiceItem<T>[];
  unmatchedExisting: ExistingMatchView[];
} {
  const invoiceCents = invoice.map((item) => toCents(item.value));
  const existingCents = existing.map((item) => toCents(item.value));
  const existingDates = existing.map((item) => toDateOnly(item.date));
  const invoicePlans = invoice.map((item, index) =>
    installmentKey(invoiceCents[index], item.name),
  );
  const existingPlans = existing.map((item, index) =>
    installmentKey(existingCents[index], item.name),
  );

  const usedInvoice = new Set<number>();
  const usedExisting = new Set<number>();
  const assigned = new Map<number, AttachedMatch>();

  const sameValueCandidates: Candidate[] = [];

  invoice.forEach((item, invoiceIndex) => {
    existing.forEach((launch, existingIndex) => {
      if (invoiceCents[invoiceIndex] !== existingCents[existingIndex]) return;

      const relation = installmentRelation(item.name, launch.name);
      if (relation === 'conflict' || relation === 'partial') return;

      const plan = invoicePlans[invoiceIndex];
      const days = daysApart(item.date, existingDates[existingIndex]);
      const similarity = titleSimilarity(item.name, launch.name);
      const overlap = merchantOverlap(item.name, launch.name);
      if (
        !acceptSameValue({
          days,
          similarity,
          overlap,
          relation,
          uniqueInvoice: uniqueValue(invoiceCents[invoiceIndex], invoiceCents),
          uniqueExisting: uniqueValue(
            existingCents[existingIndex],
            existingCents,
          ),
          uniquePlan:
            invoicePlans.filter((key) => key === plan).length === 1 &&
            existingPlans.filter((key) => key === plan).length === 1,
        })
      ) {
        return;
      }

      const proximity = dateProximity(item.date, existingDates[existingIndex]);
      const installmentBonus = relation === 'equal' ? 1 : 0.4;
      sameValueCandidates.push({
        invoiceIndex,
        existingIndex,
        kind: 'same_value',
        titleSimilarity: similarity,
        score:
          proximity * 0.4 +
          installmentBonus * 0.25 +
          overlap * 0.25 +
          similarity * 0.1,
      });
    });
  });

  assignGreedy(
    sameValueCandidates,
    usedInvoice,
    usedExisting,
    assigned,
    existing,
  );

  const mismatchCandidates: Candidate[] = [];

  invoice.forEach((item, invoiceIndex) => {
    if (usedInvoice.has(invoiceIndex)) return;

    existing.forEach((launch, existingIndex) => {
      if (usedExisting.has(existingIndex)) return;
      if (invoiceCents[invoiceIndex] === existingCents[existingIndex]) return;
      const relation = installmentRelation(item.name, launch.name);
      if (relation === 'conflict' || relation === 'partial') return;

      const days = daysApart(item.date, existingDates[existingIndex]);
      const similarity = titleSimilarity(item.name, launch.name);
      const overlap = merchantOverlap(item.name, launch.name);
      const relatedInstallment =
        (relation === 'equal' || relation === 'same_plan') && overlap >= 0.4;
      if (!relatedInstallment && days > 3) return;
      if (!relatedInstallment && similarity < 0.5) return;

      mismatchCandidates.push({
        invoiceIndex,
        existingIndex,
        kind: 'value_mismatch',
        titleSimilarity: similarity,
        score:
          dateProximity(item.date, existingDates[existingIndex]) * 0.4 +
          (relatedInstallment ? 0.25 : 0) +
          overlap * 0.2 +
          similarity * 0.15,
      });
    });
  });

  assignGreedy(
    mismatchCandidates,
    usedInvoice,
    usedExisting,
    assigned,
    existing,
  );

  return {
    transactions: invoice.map((item, index) => ({
      item,
      match: assigned.get(index),
    })),
    unmatchedExisting: existing
      .filter((_, index) => !usedExisting.has(index))
      .map(toView),
  };
}

function assignGreedy(
  candidates: Candidate[],
  usedInvoice: Set<number>,
  usedExisting: Set<number>,
  assigned: Map<number, AttachedMatch>,
  existing: ExistingLaunch[],
) {
  candidates.sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    if (usedInvoice.has(candidate.invoiceIndex)) continue;
    if (usedExisting.has(candidate.existingIndex)) continue;

    usedInvoice.add(candidate.invoiceIndex);
    usedExisting.add(candidate.existingIndex);
    assigned.set(candidate.invoiceIndex, {
      kind: candidate.kind,
      titleSimilarity: candidate.titleSimilarity,
      existing: toView(existing[candidate.existingIndex]),
    });
  }
}
