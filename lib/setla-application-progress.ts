// Single source of truth for what counts as "done" on a SETLA application
// -- shared by the draft GET/PATCH route, the dashboard data route, and
// (indirectly, via the same shape) apply.html's progress bar, so the
// checklist can never drift into three slightly different lists.
//
// Ordered to match apply.html's 3-step wizard: items[0..2] are step 1
// (Identity), items[3..5] are step 2 (Affordability), the rest are step 3
// (Banking) -- setla.js slices this array by that exact grouping to know
// which step to resume a returning customer on. One checklist item per
// section-piece, not one per raw field, so "address" is a single item
// covering all 4 address sub-fields rather than 4 separate ticks.

export const DOCUMENT_TYPES = ["id_document", "live_selfie", "proof_of_address", "proof_of_banking", "bank_statement"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type ApplicationDraft = {
  idNumber?: string;
  address?: string;
  city?: string;
  province?: string;
  postal?: string;
  income?: number | string;
  expenses?: number | string;
  bank?: string;
  accountHolder?: string;
  accountNumber?: string;
  accountType?: string;
};

const DRAFT_TEXT_KEYS = ["idNumber", "address", "city", "province", "postal", "bank", "accountHolder", "accountType"] as const;
const DRAFT_NUMERIC_KEYS = ["income", "expenses"] as const;

// Whatever the client sends, only known keys/shapes make it into the
// stored draft -- same "narrow, don't trust" posture as every other SETLA
// route, just applied to a jsonb blob instead of typed columns.
export function sanitizeDraftPatch(body: any): ApplicationDraft {
  const out: ApplicationDraft = {};
  if (!body || typeof body !== "object") return out;
  for (const key of DRAFT_TEXT_KEYS) {
    if (typeof body[key] === "string") out[key] = body[key].trim().slice(0, 300);
  }
  for (const key of DRAFT_NUMERIC_KEYS) {
    if (body[key] === "" || body[key] === null) continue;
    const n = Number(body[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  if (typeof body.accountNumber === "string") out.accountNumber = body.accountNumber.trim().slice(0, 40);
  return out;
}

type ChecklistItem = { key: string; label: string; done: boolean };

export function computeProgress(draft: ApplicationDraft, uploadedDocumentTypes: Set<string>) {
  const items: ChecklistItem[] = [
    { key: "idNumber", label: "ID number", done: !!draft.idNumber },
    { key: "id_document", label: "ID document photo", done: uploadedDocumentTypes.has("id_document") },
    { key: "live_selfie", label: "Live selfie", done: uploadedDocumentTypes.has("live_selfie") },
    { key: "address", label: "Residential address", done: !!(draft.address && draft.city && draft.province && draft.postal) },
    { key: "proof_of_address", label: "Proof of address", done: uploadedDocumentTypes.has("proof_of_address") },
    { key: "affordability", label: "Income & expenses", done: draft.income != null && draft.expenses != null },
    { key: "banking", label: "Banking details", done: !!(draft.bank && draft.accountHolder && draft.accountNumber && draft.accountType) },
    // Deliberately no separate "proof of banking" item -- a bank statement
    // already covers what a proof-of-banking document would (bank, account
    // holder, account number), and admin review treats them identically
    // (both just land in the same generic document list), so asking for
    // both was pure duplicate friction. "proof_of_banking" stays a valid
    // DOCUMENT_TYPES value for backward compatibility, it's just no longer
    // part of the required checklist.
    { key: "bank_statement", label: "Bank statement", done: uploadedDocumentTypes.has("bank_statement") },
  ];
  const doneCount = items.filter((i) => i.done).length;
  // Signup already collects name/email/mobile, so a brand-new applicant
  // isn't starting from a blank slate -- the checklist below is scaled
  // into the remaining 80%, on top of a fixed 20% for the account details
  // already on file. All items done still lands exactly on 100%.
  const percent = Math.round(20 + (doneCount / items.length) * 80);
  const remaining = items.filter((i) => !i.done).map((i) => ({ key: i.key, label: i.label }));
  return { percent, items, remaining, complete: doneCount === items.length };
}
