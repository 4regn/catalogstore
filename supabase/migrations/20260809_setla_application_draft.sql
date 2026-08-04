-- Lets an application save progress incrementally instead of only
-- persisting anything at final submit. Text-field progress (ID number,
-- address, income/expenses, banking details) lives here as a flexible
-- blob rather than forcing setla_applications/setla_bank_accounts to
-- exist half-filled -- those tables' NOT NULL columns stay exactly as
-- strict as they've always been, only ever inserted once, complete, at
-- final submit (see app/api/setla/apply/submit/route.ts). Document
-- progress needs no new column: setla_documents.application_id was
-- already nullable, so a document uploaded before the application row
-- exists just sits with application_id null until submit links it.
alter table public.setla_customers
  add column if not exists application_draft jsonb not null default '{}'::jsonb;

-- A document uploaded before the application row exists sits with
-- application_id null (see above). Re-uploading the same document_type
-- while still in draft (a retaken ID photo, a re-picked bank statement)
-- should replace that row, not pile up duplicates -- scoped to
-- application_id is null so it never constrains the real historical
-- records a customer accumulates across multiple submitted/declined/
-- reapplied applications over time.
create unique index if not exists setla_documents_draft_type_idx
  on public.setla_documents(customer_id, document_type)
  where application_id is null;
