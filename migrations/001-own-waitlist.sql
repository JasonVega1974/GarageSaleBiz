-- ═══════════════════════════════════════════════════════════════════════════
-- 001 — own_waitlist: umbrella ("Own Your Town") trade + territory signups
--
-- ┌─ RUN RECORD ────────────────────────────────────────────────────────────┐
-- │ STATUS:   NOT RUN                                                       │
-- │ RUN ON:   —                                                             │
-- │ PROJECT:  cdckozujhrffobragmtm  (shared with EstateSaleBiz)             │
-- │ VERIFIED: —                                                             │
-- │                                                                         │
-- │ Apply in the Supabase SQL editor, then stamp STATUS/RUN ON/VERIFIED     │
-- │ above and commit the stamp. Every statement is idempotent and safe to   │
-- │ re-run.                                                                 │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ── WHAT THIS IS ABOUT ──────────────────────────────────────────────────────
-- The umbrella storefront lists six trades; estate-sales is live and the other
-- five are waitlist-only. Until now the waitlist was a mailto: link, so a
-- signup only counted if the visitor had a mail client configured AND pressed
-- send. Everyone else vanished silently. This table is where that demand
-- actually lands.
--
-- The point of collecting city_requested is that the whole business model is
-- territory-exclusive: two people wanting the same town is the signal that
-- decides which trade launches next, and an email address alone cannot tell
-- you that.
--
-- ── NAMING ──────────────────────────────────────────────────────────────────
-- own_* (not esb_*) on purpose. This project shares a Supabase database with
-- EstateSaleBiz's live tenant data. The prefix is what keeps "marketing
-- signups for a product that does not exist yet" visibly separate from rows
-- that govern a paying operator's territory.

create table if not exists own_waitlist (
  id             bigint generated always as identity primary key,
  email          text not null,
  trade_slug     text not null,
  city_requested text,
  created_at     timestamptz not null default now()
);

-- Query pattern is "which trades/cities are people asking for", so index the
-- two columns that get grouped.
create index if not exists own_waitlist_trade_idx on own_waitlist (trade_slug);
create index if not exists own_waitlist_created_idx on own_waitlist (created_at desc);

alter table own_waitlist enable row level security;

-- anon may INSERT only. There is deliberately NO select/update/delete policy:
-- with RLS on and no policy for an action, that action is denied. The list is
-- therefore write-only to the public — a visitor can add themselves but can
-- never enumerate who else signed up, or which towns are contested.
--
-- Only the Supabase dashboard / service_role (which bypasses RLS) can read it.
-- Do NOT add a select policy to build an admin page; use the dashboard, or
-- read it from a server-side function holding the service key.
drop policy if exists "anon insert own_waitlist" on own_waitlist;
create policy "anon insert own_waitlist" on own_waitlist
  for insert to anon with check (true);

-- ── VERIFY (run after applying) ─────────────────────────────────────────────
-- Expect: rowsecurity = true, and exactly one policy, cmd = INSERT.
--
--   select relrowsecurity from pg_class where relname = 'own_waitlist';
--   select polname, cmd from pg_policies where tablename = 'own_waitlist';
--
-- The behavioural check that actually matters is in test/rls-posture.js:
-- an anon SELECT must come back empty/denied even after a successful insert.
