-- ═══════════════════════════════════════════════════════════════════════════
-- GARAGESALEBIZ — COMPLETE SCHEMA, RLS, VIEWS, STORAGE, RPCs, AND SEED
--
-- PROJECT: jjocmvhqeiudcwtazbwi   (https://jjocmvhqeiudcwtazbwi.supabase.co)
--
-- ⚠️ NEVER RUN THIS AGAINST cdckozujhrffobragmtm. That project holds
--    EstateSaleBiz production tenant data and is strictly off-limits. Every
--    object here is prefixed gsb_, so a misdirected run would not collide with
--    esb_* tables — but it would still create fifteen tables, two buckets and
--    five functions in a live production database. Check the project ref in
--    the Supabase URL bar before pressing Run.
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste this entire file → Run.
-- It runs top-to-bottom in ONE pass and is fully idempotent: re-running it is a
-- no-op on an existing database, never a revert.
--
-- WHY IDEMPOTENT MATTERS MORE THAN IT SOUNDS — this is the single hardest-won
-- lesson from EstateSaleBiz, where re-running a schema file twice silently
-- reopened cross-tenant photo access. Postgres OR's permissive policies
-- together, so a re-created loose policy does not REPLACE a tight one — it sits
-- beside it and widens access, with no error. Every policy below is therefore
-- `drop policy if exists` immediately before `create policy`, and no policy in
-- this file is ever gated on a bucket name alone.
--
-- CONTAINS NO TRANSACTION CONTROL. Do not add BEGIN/ROLLBACK anywhere in this
-- file. The Supabase editor runs the whole paste as one batch, so a stray
-- ROLLBACK would undo every CREATE above it while each verification query still
-- printed a pass — a migration that reports success and applied nothing.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DASHBOARD CLICKS REQUIRED — SQL CANNOT DO THESE. Do them after running.
-- ═══════════════════════════════════════════════════════════════════════════
--
--   1. Authentication → Providers → Email
--        • Enable email provider.
--        • "Confirm email" OFF. intake.html signs the operator up and needs a
--          session back immediately to reach checkout. With confirmation on,
--          signUp() returns no session and the purchase flow dead-ends.
--
--   2. Authentication → URL Configuration
--        • Site URL: https://garagesalebiz.com
--        • Redirect URLs: add https://garagesalebiz.com/** and
--          https://*.garagesalebiz.com/**
--
--   3. Authentication → Emails (only if you point Supabase auth at Brevo SMTP)
--        • TURN OFF CLICK TRACKING in Brevo for that stream. Brevo rewrites
--          links through its tracking domain, which mangles the Supabase token
--          hash in password-reset and confirmation links — the reset then fails
--          with "invalid or expired token" for every operator. This cost
--          YourLife CC real debugging time. See BREVO-SETUP.md.
--
--   4. Create your own owner account, then promote it (see PART 9 below).
--
--   Storage buckets and their policies ARE created by this file (PART 7) — no
--   clicks needed for those.
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 · TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1.1 · SETTINGS (public read) ────────────────────────────────────────────
-- Public because index.html reads waitlist_mode before rendering its CTAs.
-- NOTHING PRIVATE GOES IN HERE. Private operational values live in
-- gsb_admin_settings (1.2), which is admin-only at every verb.
create table if not exists gsb_settings (
  key   text primary key,
  value text
);

-- ── 1.2 · ADMIN SETTINGS (private) ──────────────────────────────────────────
create table if not exists gsb_admin_settings (
  key   text primary key,
  value text
);

-- ── 1.3 · TENANTS — public branding + slug→client_id map ────────────────────
-- CONTENTS ARE PUBLIC BY DESIGN. Every column is data already shown on the
-- operator's own public site: business name, logo, the phone/email they choose
-- to publish, service area, brand colour, blurb.
--   • No secrets, no keys.
--   • client_id is NOT a secret — it appears in every public REST query the
--     storefront sends. Access to a tenant's rows is governed by RLS on
--     gsb_sales/gsb_items/gsb_photos, never by hiding this id.
-- Revenue and payment data deliberately live in gsb_billing instead, because
-- this table carries a blanket public-read policy covering ALL its columns.
create table if not exists gsb_tenants (
  id             bigint generated always as identity primary key,
  slug           text not null unique,        -- subdomain label: 'boise' → boise.garagesalebiz.com
  client_id      text not null unique,        -- joins every other gsb_* table
  business_name  text not null,
  logo_url       text,
  phone          text,
  email          text,                        -- public business contact
  service_area   text,                        -- comma-separated, public
  cities         text[] not null default '{}',-- the purchased territory, "City, ST"
  primary_color  text not null default '#E8471F',
  about_text     text,
  -- The operator's default commission rate, used to pre-fill contracts. NOT an
  -- earnings claim and not a promise — it is the rate this operator charges.
  default_commission_pct numeric(5,2) not null default 50.00
    constraint gsb_tenants_commission_ck check (default_commission_pct > 0 and default_commission_pct < 100),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists gsb_tenants_slug_idx   on gsb_tenants(slug);
create index if not exists gsb_tenants_client_idx  on gsb_tenants(client_id);
create index if not exists gsb_tenants_active_idx  on gsb_tenants(is_active) where is_active = true;

-- ── 1.4 · CLIENT USERS — the auth→tenant link ───────────────────────────────
create table if not exists gsb_client_users (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  client_id    text not null,
  display_name text,
  role         text not null default 'owner'
    constraint gsb_client_users_role_ck check (role in ('owner','admin')),

  -- ⚠️ THE REPLAY GUARD FOR THE ENTIRE PURCHASE FLOW.
  --
  -- The UNIQUE constraint here — not any application code — is what stops one
  -- payment provisioning two territories. The webhook's pre-check is a
  -- read-then-write and two concurrent deliveries can both pass it; only this
  -- constraint makes the second one fail with SQLSTATE 23505.
  --
  -- It is also the last line of defence against a REFUNDED session being
  -- redeemed twice, because Stripe does not change payment_status on refund.
  --
  -- NULLABLE ON PURPOSE. Rows that did not come from a purchase legitimately
  -- have no session id: your own '__owner__' admin mapping, and any tenant
  -- provisioned by hand. Postgres permits unlimited NULLs under UNIQUE. Do NOT
  -- add `not null` — it would reject the owner row and lock you out of
  -- admin-owner.html.
  stripe_session_id text,

  created_at   timestamptz not null default now()
);

create index if not exists gsb_client_users_client_idx on gsb_client_users(client_id);

-- Retrofit + guard, expressed so a fresh build and an existing build agree.
-- `create table if not exists` is a total no-op once the table exists — it can
-- neither add a column nor add a constraint — so on any database that already
-- has this table, THESE statements are what apply the guard, not the CREATE
-- above. Omitting them is how EstateSaleBiz ended up with its most important
-- constraint existing only as an undocumented dashboard edit.
alter table gsb_client_users add column if not exists stripe_session_id text;

do $$
begin
  -- Matches on the COLUMN, not a constraint name, and accepts a unique INDEX as
  -- equivalent to a unique CONSTRAINT — both raise 23505, which is all the
  -- webhook depends on. Name-matching would add a redundant second guard on any
  -- database whose constraint was created under a different name.
  if not exists (
    select 1 from pg_index i
     where i.indrelid = 'public.gsb_client_users'::regclass
       and i.indisunique
       and i.indnatts = 1
       and i.indkey[0] = (select attnum from pg_attribute
                           where attrelid = 'public.gsb_client_users'::regclass
                             and attname = 'stripe_session_id')
  ) then
    alter table gsb_client_users
      add constraint gsb_client_users_stripe_session_id_key unique (stripe_session_id);
  end if;
end $$;

comment on column gsb_client_users.stripe_session_id is
  'Stripe Checkout Session that paid for this mapping. UNIQUE — the replay guard '
  'that stops one payment (including a refunded one) provisioning a second '
  'territory. Nullable: the __owner__ admin mapping and hand-provisioned tenants '
  'legitimately have none.';

-- ── 1.5 · CITY CLAIMS — the territory registry ──────────────────────────────
-- city_norm IS THE PRIMARY KEY, and that single constraint is the entire
-- territory-exclusivity guarantee. Two concurrent transactions claiming the
-- same normalised city cannot both commit: the loser gets 23505, which the
-- webhook turns into a recorded, alerted conflict.
--
-- Every availability reader in the product — the hero checker, intake, the
-- webhook — reads THIS table, never gsb_tenants.cities. Those are two different
-- answers to one question and they diverge: this table has no is_active filter,
-- so a deactivated tenant's stale claim would read "available" from the tenants
-- array while the insert still rejected it. Deactivation therefore DELETES the
-- claim row (the city returns to the pool), and every reader uses the table the
-- insert actually enforces on.
create table if not exists gsb_city_claims (
  city_norm  text primary key,               -- canonical key, written by trigger
  city_label text not null,                  -- as the buyer typed it: 'Nampa, ID'
  client_id  text not null,
  slug       text not null,
  claimed_at timestamptz not null default now()
);

create index if not exists gsb_city_claims_slug_idx   on gsb_city_claims(slug);
create index if not exists gsb_city_claims_client_idx on gsb_city_claims(client_id);

-- ── 1.6 · SALES — one row per garage / moving sale ──────────────────────────
create table if not exists gsb_sales (
  id             bigint generated always as identity primary key,
  client_id      text not null,

  title          text,
  sale_type      text not null default 'garage'
    constraint gsb_sales_type_ck check (sale_type in ('garage','moving','multi-family','estate-lite')),

  -- The homeowner this sale is being run FOR. Optional link into the CRM so a
  -- repeat client is one record, not a retyped name. ON DELETE SET NULL, not
  -- CASCADE: deleting a contact must never delete the sale history.
  crm_client_id  bigint,
  client_name    text,

  street_address text,
  city_state_zip text,

  -- WHETHER THE EXACT ADDRESS IS PUBLISHED. Default true, and that default is a
  -- considered decision rather than laziness: a garage sale listing that does not
  -- say where the sale is has no purpose, and every comparable listing — the
  -- local classifieds, the neighbourhood groups — publishes it. EstateSaleBiz
  -- omitted street_address from its public view unconditionally, which is right
  -- for an estate sale (a houseful of valuables, often an empty property, often
  -- a bereavement) and wrong here.
  --
  -- It is still a COLUMN and not a hardcoded rule, because the address belongs to
  -- a homeowner who is not our customer and did not sign anything with us. Some
  -- will not want it up until the morning of the sale, and the operator needs to
  -- be able to honour that. When false, gsb_public_sales returns NULL for the
  -- address — the column is nulled in the view, not merely hidden by the UI.
  show_address   boolean not null default true,
  start_date     date,
  end_date       date,
  day_of_week    text,
  open_time      text,
  close_time     text,
  description    text,

  commission_pct numeric(5,2)
    constraint gsb_sales_commission_ck check (commission_pct is null or (commission_pct > 0 and commission_pct < 100)),

  status         text not null default 'planned'
    constraint gsb_sales_status_ck check (status in ('planned','scheduled','live','done','cancelled')),

  -- is_live is the PUBLISH switch and is deliberately separate from status: an
  -- operator plans a sale for weeks before its details should appear publicly.
  is_live        boolean not null default false,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists gsb_sales_client_idx on gsb_sales(client_id);
create index if not exists gsb_sales_live_idx   on gsb_sales(client_id, is_live);
create index if not exists gsb_sales_date_idx   on gsb_sales(client_id, start_date desc);

-- Retrofit for columns added after the first release. `create table if not
-- exists` is a total no-op once the table exists — it cannot add a column — so
-- on any database that already has gsb_sales, THIS is the statement that applies
-- show_address, not the declaration above. Every future column added to this
-- table needs a line here as well as in the CREATE, or a fresh build and an
-- existing build will silently disagree about the schema.
alter table gsb_sales add column if not exists show_address boolean not null default true;

-- ── 1.7 · ITEMS — the listing catalogue ─────────────────────────────────────
create table if not exists gsb_items (
  id            bigint generated always as identity primary key,
  client_id     text not null,
  sale_id       bigint references gsb_sales(id) on delete cascade,
  name          text not null,
  category      text,
  condition     text,
  price         numeric(10,2) default 0,
  -- PRIVATE — the operator's walk-away floor. Omitted from the public view: a
  -- shopper who can read it will never pay the asking price.
  min_price     numeric(10,2) default 0,
  description   text,
  status        text not null default 'available'
    constraint gsb_items_status_ck check (status in ('available','pending','sold','held')),
  featured      boolean not null default false,
  emoji         text default '📦',
  photo_url     text,
  display_order int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gsb_items_client_idx on gsb_items(client_id);
create index if not exists gsb_items_sale_idx   on gsb_items(sale_id, display_order);

-- ── 1.8 · PHOTOS — whole-sale photos (not per-item) ─────────────────────────
create table if not exists gsb_photos (
  id            bigint generated always as identity primary key,
  client_id     text not null,
  sale_id       bigint references gsb_sales(id) on delete cascade,
  photo_url     text not null,
  storage_path  text,                          -- 'client_id/sale_id/file.jpg'
  caption       text,
  display_order int not null default 0,
  is_featured   boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists gsb_photos_client_idx on gsb_photos(client_id);
create index if not exists gsb_photos_sale_idx   on gsb_photos(sale_id, display_order);

-- ── 1.9 · CLIENTS — the lite CRM ────────────────────────────────────────────
-- Homeowner contact details. NEVER publicly readable at any verb: this is
-- third-party personal data the operator collected, and the operator's own
-- customers never consented to it appearing on a website.
create table if not exists gsb_clients (
  id         bigint generated always as identity primary key,
  client_id  text not null,
  name       text not null,
  phone      text,
  email      text,
  address    text,
  notes      text,
  status     text not null default 'lead'
    constraint gsb_clients_status_ck check (status in ('lead','contacted','booked','completed','lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gsb_clients_client_idx on gsb_clients(client_id, status);

-- The CRM link on gsb_sales, added here because gsb_clients must exist first.
-- Guarded rather than inline so the file is safe on a database that already
-- has it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.gsb_sales'::regclass
       and conname  = 'gsb_sales_crm_client_fk'
  ) then
    alter table gsb_sales
      add constraint gsb_sales_crm_client_fk
      foreign key (crm_client_id) references gsb_clients(id) on delete set null;
  end if;
end $$;

create index if not exists gsb_sales_crm_idx on gsb_sales(crm_client_id);

-- ── 1.10 · CONTRACTS — generated client agreements ──────────────────────────
-- Stores the RENDERED terms, not a pointer to a template. A contract is a
-- record of what the parties agreed at a moment in time; if it re-read a
-- template, editing that template would retroactively rewrite every past
-- agreement. Same reasoning as gsb_acceptances.documents below.
create table if not exists gsb_contracts (
  id             bigint generated always as identity primary key,
  client_id      text not null,
  sale_id        bigint references gsb_sales(id) on delete set null,
  crm_client_id  bigint references gsb_clients(id) on delete set null,

  variant        text not null default 'garage'
    constraint gsb_contracts_variant_ck check (variant in ('garage','moving')),

  operator_name  text not null,
  client_name    text not null,
  sale_address   text,
  sale_dates     text,
  commission_pct numeric(5,2) not null
    constraint gsb_contracts_commission_ck check (commission_pct > 0 and commission_pct < 100),
  minimum_fee    numeric(10,2),
  terms_snapshot text not null,               -- the full rendered body
  terms_version  text not null,

  status         text not null default 'draft'
    constraint gsb_contracts_status_ck check (status in ('draft','sent','signed','void')),
  signed_at      timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists gsb_contracts_client_idx on gsb_contracts(client_id, created_at desc);

-- ── 1.11 · INTAKE — the pre-checkout submission ─────────────────────────────
-- Written server-side by /api/create-checkout with the service_role key, and
-- read by /api/stripe-webhook to provision. It is the bridge across Stripe:
-- everything needed to build the tenant is parked here BEFORE the operator
-- leaves for checkout, so the webhook needs nothing from the browser.
--
-- NO PASSWORD IS EVER STORED. The auth user is created by intake.html before
-- this row exists, so the webhook provisions against an account that already
-- has credentials.
--
-- There is deliberately NO anon INSERT policy. The browser never writes here;
-- it POSTs to /api/create-checkout, which validates and writes as service_role.
-- That keeps the public write surface of this whole database down to one table
-- (gsb_waitlist).
create table if not exists gsb_intake (
  id                bigint generated always as identity primary key,
  user_id           uuid not null,             -- no FK: see gsb_acceptances note
  email             text,
  first_name        text,
  last_name         text,
  phone             text,
  company           text not null,
  tagline           text,
  primary_color     text not null default '#E8471F',
  subdomain_pref    text,
  claim_cities      text[] not null default '{}',
  service_area      text[] not null default '{}',
  logo_data_url     text,

  acceptance_version   text not null,
  acceptance_claimed_at timestamptz,

  stripe_session_id text,
  status            text not null default 'awaiting_payment'
    constraint gsb_intake_status_ck check (status in ('awaiting_payment','provisioned','blocked','abandoned')),

  created_at        timestamptz not null default now(),
  provisioned_at    timestamptz
);

create index if not exists gsb_intake_session_idx on gsb_intake(stripe_session_id);
create index if not exists gsb_intake_status_idx  on gsb_intake(status, created_at desc);
create index if not exists gsb_intake_user_idx    on gsb_intake(user_id);

-- ── 1.12 · ACCEPTANCES — durable evidence of what was agreed ────────────────
-- The Operator Agreement recites "by checking the acceptance box and completing
-- your purchase, you agree to this Agreement." This table is the artifact that
-- makes that sentence true of each purchase. Treat it as dispute evidence, not
-- telemetry.
create table if not exists gsb_acceptances (
  id                 bigint generated always as identity primary key,

  -- NO foreign key to auth.users, and deliberately NO cascade. This is evidence
  -- and must outlive account deletion. gsb_client_users cascades from
  -- auth.users, which is exactly what would destroy an acceptance record along
  -- with the user it is evidence about. Do not "tidy" a foreign key onto this.
  user_id            uuid,
  client_id          text,
  stripe_session_id  text not null,

  -- Server clock, authoritative. The client's claimed time is kept separately so
  -- a discrepancy stays visible instead of one silently overwriting the other.
  accepted_at        timestamptz not null default now(),
  client_claimed_at  timestamptz,

  acceptance_version text not null,
  -- Written by the SERVER from its own canonical copy, never from the request
  -- body. A client-supplied string records whatever the buyer chose to send,
  -- which is evidence of nothing.
  acceptance_text    text not null,
  acceptance_sha256  text not null,
  -- The documents in force at that moment, by path and revision, so a later
  -- edit to operator-agreement.html cannot change what a past buyer appears to
  -- have agreed to.
  documents          jsonb not null,
  user_agent         text

  -- IP address deliberately OMITTED. Storing it is a new processing purpose that
  -- privacy.html does not disclose. Disclose it first, then add the column — do
  -- not slip it in with a migration.
);

create index if not exists gsb_acceptances_session_idx on gsb_acceptances(stripe_session_id);
create index if not exists gsb_acceptances_client_idx  on gsb_acceptances(client_id);

-- ── 1.13 · BILLING — what actually arrived from Stripe ──────────────────────
-- Keyed on the Stripe session, NOT on slug, and with NO foreign key to
-- gsb_tenants. That is deliberate: money can arrive for a purchase that then
-- fails to provision (a lost territory race), and the row recording that money
-- must be writable when no tenant exists. A foreign key here would make the
-- most important row in an incident impossible to write.
--
-- Stores raw Stripe numbers rather than a computed split, so the accounting rule
-- can change later without losing what actually happened.
create table if not exists gsb_billing (
  stripe_session_id     text primary key,
  slug                  text,
  client_id             text,
  amount_paid_cents     integer not null,
  amount_subtotal_cents integer,
  amount_discount_cents integer not null default 0,
  currency              text not null default 'usd',
  payment_intent_id     text,
  customer_email        text,
  refunded_at           timestamptz,
  refund_amount_cents   integer,
  created_at            timestamptz not null default now()
);

create index if not exists gsb_billing_created_idx on gsb_billing(created_at desc);
create index if not exists gsb_billing_slug_idx    on gsb_billing(slug);

-- ── 1.14 · BLOCKED PURCHASES — paid, but could not be given the territory ───
-- The residual race. Selecting cities BEFORE checkout narrows the window to the
-- duration of a card authorisation, but does not close it: two operators can
-- still be inside checkout for the same city simultaneously. When that happens
-- someone has paid and cannot have what they paid for, and this row is what
-- makes them visible to a human instead of existing only inside Stripe.
--
-- Deliberately NOT referencing gsb_tenants: the whole point is that no tenant
-- was created.
create table if not exists gsb_blocked_purchases (
  id                bigint generated always as identity primary key,
  -- One row per blocked PAYMENT, not per attempt, so it reconciles 1:1 against
  -- Stripe. A retry upserts and bumps attempts rather than failing on this.
  stripe_session_id text not null unique,
  email             text,
  company           text,
  contact           text,
  phone             text,
  amount_paid_cents integer,
  requested_cities  text[] not null default '{}',
  conflict_city     text not null,
  stage             text not null
    constraint gsb_blocked_stage_ck check (stage in ('pre-check','lost-race')),
  slug_attempted    text,
  attempts          integer not null default 1,
  created_at        timestamptz not null default now(),
  last_attempt_at   timestamptz not null default now(),

  -- Left null until the money is actually dealt with.
  resolved_at       timestamptz,
  resolution        text
    constraint gsb_blocked_resolution_values_ck
    check (resolution is null or resolution in ('refunded','reassigned','refunded_and_waitlisted','other')),
  notes             text
);

-- resolved ⇒ a resolution is required; unresolved ⇒ there must not be one. A
-- half-filled record is worse than an empty one when the question is "did this
-- person get their money back?".
alter table gsb_blocked_purchases drop constraint if exists gsb_blocked_resolution_ck;
alter table gsb_blocked_purchases add constraint gsb_blocked_resolution_ck
  check ((resolved_at is not null and resolution is not null)
      or (resolved_at is null     and resolution is null));

-- The dashboard's default view is "who is still owed something".
create index if not exists gsb_blocked_unresolved_idx
  on gsb_blocked_purchases(created_at desc) where resolved_at is null;

-- ── 1.15 · WAITLIST — demand for territories that are gone ──────────────────
-- The ONLY table in this database the public may write to.
create table if not exists gsb_waitlist (
  id               bigint generated always as identity primary key,
  email            text not null,
  name             text,
  cities_requested text[] not null default '{}',
  source           text,
  created_at       timestamptz not null default now()
);

create index if not exists gsb_waitlist_created_idx on gsb_waitlist(created_at desc);


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 · FUNCTIONS
-- Defined after the tables they read, before the policies that call them.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 2.1 · CITY NORMALISATION — the canonical rule ───────────────────────────
-- THIS FUNCTION IS THE AUTHORITY. The JavaScript copies in index.html,
-- intake.html and /api/* are UX layers that must mirror it exactly; the trigger
-- in 2.2 overwrites whatever any client supplies, so a drifted client can
-- degrade the pre-check but can never corrupt stored data.
--
-- Without the expansions below, all of these were DIFFERENT cities to a primary
-- key, which behind a public "is my city available?" widget means a confident
-- green "Available" for a territory that is already sold:
--     'Boise,ID'      vs 'Boise, ID'          -- comma spacing
--     'St. Louis, MO' vs 'Saint Louis, MO'    -- abbreviation
--     'Ft Worth, TX'  vs 'Fort Worth, TX'     -- abbreviation, no period
--     'N Las Vegas'   vs 'North Las Vegas'    -- direction
--
-- ORDER MATTERS: periods are stripped BEFORE the expansions, so 'st.' and 'st'
-- reach the same token and expand identically.
create or replace function gsb_norm_city(s text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  with collapsed as (
    select regexp_replace(lower(s), '\s+', ' ', 'g') as v
  ),
  commas as (
    select regexp_replace(v, '\s*,\s*', ', ', 'g') as v from collapsed
  ),
  depunct as (
    select replace(v, '.', '') as v from commas
  ),
  expanded as (
    -- \m and \M are whole-token boundaries, so the 's' inside 'south' and the
    -- two-letter state 'id' can never match.
    select
      regexp_replace(
      regexp_replace(
      regexp_replace(
      regexp_replace(
      regexp_replace(
      regexp_replace(
      regexp_replace(v,
        '\mst\M', 'saint', 'g'),
        '\mft\M', 'fort',  'g'),
        '\mmt\M', 'mount', 'g'),
        '\mn\M',  'north', 'g'),
        '\ms\M',  'south', 'g'),
        '\me\M',  'east',  'g'),
        '\mw\M',  'west',  'g') as v
    from depunct
  )
  select btrim(regexp_replace(v, '\s+', ' ', 'g')) from expanded
$$;

-- ── 2.2 · MAKE THE DATABASE AUTHORITATIVE FOR NORMALISATION ─────────────────
-- Overwrites whatever the caller supplied, so the stored key cannot drift from
-- gsb_norm_city regardless of what any client believes. This is what makes a
-- JS/SQL mismatch a UX bug (a taken city briefly reads "available", and the
-- atomic insert still rejects it) instead of a data bug.
create or replace function gsb_city_claims_normalize()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.city_norm := gsb_norm_city(new.city_label);
  -- An empty key would collide with the next empty key and lock out a real
  -- city. Refuse rather than store one.
  if new.city_norm is null or new.city_norm = '' then
    raise exception 'city_label % normalises to an empty city_norm', quote_literal(new.city_label);
  end if;
  return new;
end
$$;

drop trigger if exists gsb_city_claims_norm_tg on gsb_city_claims;
create trigger gsb_city_claims_norm_tg
  before insert or update on gsb_city_claims
  for each row execute function gsb_city_claims_normalize();

-- Any pre-existing rows brought into line with the current rule. Aborts rather
-- than corrupting data if the rule would collapse two distinct claims onto one
-- key — that is a real data problem for a human to resolve, not something an
-- UPDATE should silently pick a winner for.
do $$
declare
  n int;
  detail text;
begin
  select count(*), coalesce(string_agg(k || ' <- ' || labels, '; '), '')
    into n, detail
  from (
    select gsb_norm_city(city_label) as k, string_agg(city_label, ' + ') as labels
      from gsb_city_claims group by 1 having count(*) > 1
  ) x;
  if n > 0 then
    raise exception 'Normalisation collides on % group(s): %. Resolve by hand.', n, detail;
  end if;
end $$;

update gsb_city_claims
   set city_norm = gsb_norm_city(city_label)
 where city_norm is distinct from gsb_norm_city(city_label);

-- ── 2.3 · IDENTITY PREDICATES ───────────────────────────────────────────────
-- security definer so a policy can consult gsb_client_users without the caller
-- needing their own read rights on it. search_path pinned per convention.
create or replace function gsb_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from gsb_client_users where user_id = auth.uid() and role = 'admin'
  )
$$;

create or replace function gsb_is_tenant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from gsb_client_users where user_id = auth.uid())
$$;

-- Returns the caller's own client_id, or null. Used by storage policies and by
-- gsb_set_primary_color so identity always comes from the JWT, never an argument.
create or replace function gsb_my_client_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select client_id from gsb_client_users where user_id = auth.uid()
$$;

revoke all on function gsb_is_admin()      from public, anon;
revoke all on function gsb_is_tenant()     from public, anon;
revoke all on function gsb_my_client_id()  from public, anon;
grant execute on function gsb_is_admin()     to authenticated;
grant execute on function gsb_is_tenant()    to authenticated;
grant execute on function gsb_my_client_id() to authenticated;

-- ── 2.4 · BRAND COLOUR RPC ──────────────────────────────────────────────────
-- WHY A FUNCTION AND NOT AN UPDATE POLICY: RLS is ROW-level, not column-level.
-- "A tenant may update their own gsb_tenants row" would also hand over slug,
-- client_id, cities and is_active — the entire territory and billing surface,
-- reachable from a colour picker. One narrow function exposes one column, on one
-- row, with one validation, and is trivial to audit.
create or replace function gsb_set_primary_color(p_color text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_color     text;
begin
  v_client_id := gsb_my_client_id();
  if v_client_id is null then
    raise exception 'not a provisioned operator';
  end if;

  v_color := lower(btrim(p_color));

  -- 6-digit hex only. Rejects '', 'red', 'rgb(...)', 3-digit shorthand and
  -- anything script-shaped, so whatever reaches the column is safe for the
  -- storefront to interpolate straight into a CSS custom property.
  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'invalid colour: %', p_color;
  end if;

  update gsb_tenants
     set primary_color = v_color
   where client_id = v_client_id and is_active = true;

  -- A 0-row update would otherwise return success and leave the operator
  -- believing the colour changed.
  if not found then
    raise exception 'no active operator row for %', v_client_id;
  end if;

  return v_color;
end
$$;

revoke all on function gsb_set_primary_color(text) from public, anon;
grant execute on function gsb_set_primary_color(text) to authenticated;

-- ── 2.5 · ADMIN: DEACTIVATE / REACTIVATE AN OPERATOR ────────────────────────
-- The ONLY write path to gsb_tenants.is_active and to releasing a territory.
--
-- WHY IT IS A FUNCTION AND NOT TWO CLIENT-SIDE STATEMENTS:
-- Deactivating an operator and releasing their city claims are one operation, not
-- two. Split across a browser they can half-happen — a network drop between the
-- UPDATE and the DELETE leaves an inactive operator still holding three cities
-- that nobody can ever buy, and nothing anywhere surfaces it. Inside one function
-- they share a transaction and cannot come apart.
--
-- Releasing means DELETING the claim rows, not flagging them. Every availability
-- reader consults gsb_city_claims because that is the table the atomic insert
-- enforces on, so a claim left behind with a flag on it reads as taken forever.
--
-- REACTIVATION IS NOT SYMMETRICAL, and that is the interesting part. A city
-- released on deactivation may have been sold to someone else since. The function
-- therefore re-claims what it can, leaves what it cannot, and REPORTS the
-- difference rather than silently reactivating an operator whose site would then
-- advertise a territory they no longer hold.
create or replace function gsb_admin_set_tenant_active(p_slug text, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_cities    text[];
  v_released  text[] := '{}';
  v_reclaimed text[] := '{}';
  v_lost      text[] := '{}';
  v_city      text;
begin
  -- Authorisation is checked HERE, inside the definer function. A caller without
  -- the admin role gets an exception, not a silent no-op — an owner who mis-clicks
  -- must not be told a deactivation succeeded when nothing happened.
  if not gsb_is_admin() then
    raise exception 'not authorised';
  end if;

  select client_id, cities into v_client_id, v_cities
    from gsb_tenants where slug = p_slug;
  if v_client_id is null then
    raise exception 'no operator with slug %', quote_literal(p_slug);
  end if;

  if p_active then
    -- ── REACTIVATE ────────────────────────────────────────────────────────
    -- Re-claim each city individually rather than as one batch. A batch insert
    -- fails entirely if any single city is now taken, which would refuse to
    -- reactivate an operator over one city out of three — the wrong outcome when
    -- two of them are still free and theirs.
    foreach v_city in array coalesce(v_cities, '{}'::text[]) loop
      if btrim(coalesce(v_city, '')) = '' then continue; end if;
      begin
        insert into gsb_city_claims (city_norm, city_label, client_id, slug)
        values (gsb_norm_city(v_city), btrim(v_city), v_client_id, p_slug);
        v_reclaimed := v_reclaimed || v_city;
      exception when unique_violation then
        -- Already claimed. If it is claimed by THIS operator it was never
        -- released, which is fine and counts as reclaimed. By anyone else, it is
        -- genuinely gone and must be reported, not glossed over.
        if exists (select 1 from gsb_city_claims
                    where city_norm = gsb_norm_city(v_city) and slug = p_slug) then
          v_reclaimed := v_reclaimed || v_city;
        else
          v_lost := v_lost || v_city;
        end if;
      end;
    end loop;

    update gsb_tenants set is_active = true where slug = p_slug;

    return jsonb_build_object(
      'slug', p_slug, 'is_active', true,
      'reclaimed', to_jsonb(v_reclaimed),
      'lost', to_jsonb(v_lost),
      -- The caller must show this. Reactivating an operator whose cities were
      -- resold, without saying so, publishes a site claiming a territory that
      -- belongs to somebody else.
      'warning', case when array_length(v_lost, 1) > 0
        then 'Reactivated, but these cities are now held by another operator and were NOT restored: '
             || array_to_string(v_lost, ', ')
        else null end
    );
  end if;

  -- ── DEACTIVATE ──────────────────────────────────────────────────────────
  -- Claims released FIRST. If the delete fails the whole function aborts and the
  -- operator stays active — an operator who is live but whose cities were freed is
  -- far worse than one who is still live by mistake, because the second is obvious
  -- and the first sells the same territory twice.
  --
  -- The released list is captured from the DELETE itself via a CTE, not read from
  -- gsb_tenants.cities. Those two can disagree — a city may have been released
  -- earlier by a refund while still sitting in the cities array — and reporting
  -- what was actually deleted is the only version that is true.
  with del as (
    delete from gsb_city_claims where slug = p_slug returning city_label
  )
  select coalesce(array_agg(city_label order by city_label), '{}'::text[]) into v_released from del;

  update gsb_tenants set is_active = false where slug = p_slug;

  return jsonb_build_object(
    'slug', p_slug, 'is_active', false,
    'released', to_jsonb(v_released),
    'note', 'Their sales, items, photos and client list are NOT deleted — only deactivated.'
  );
end
$$;

revoke all on function gsb_admin_set_tenant_active(text, boolean) from public, anon;
grant execute on function gsb_admin_set_tenant_active(text, boolean) to authenticated;

-- ── 2.6 · PUBLIC AVAILABILITY RPC ───────────────────────────────────────────
-- The controlled public write/read pattern: anon may ASK whether specific
-- cities are free without being able to enumerate the customer list. The
-- gsb_public_city_claims view (PART 6) already hides client_id and slug, but
-- this RPC additionally avoids shipping the whole registry to the browser.
--
-- Normalises through gsb_norm_city, so the answer is computed by the same rule
-- the atomic insert enforces on — a caller cannot get a different answer by
-- spelling a city differently.
create or replace function gsb_check_cities(p_cities text[])
returns table (city_label text, is_taken boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.label,
         exists (select 1 from gsb_city_claims k where k.city_norm = gsb_norm_city(c.label))
  from unnest(coalesce(p_cities, '{}'::text[])) as c(label)
  where btrim(coalesce(c.label, '')) <> ''
$$;

revoke all on function gsb_check_cities(text[]) from public;
grant execute on function gsb_check_cities(text[]) to anon, authenticated;


-- ── 2.7 · CLEANUP: ABANDONED CHECKOUTS ──────────────────────────────────────
-- ⚠️ FIRST, THE THING THIS FUNCTION DOES **NOT** DO, because it is the question
-- everyone asks about this design:
--
--   AN ABANDONED CHECKOUT HOLDS NO TERRITORY. There is nothing to release.
--
-- /api/create-checkout writes to gsb_intake and NOTHING ELSE. It does not write
-- a gsb_city_claims row and it does not write a gsb_tenants row — both of those
-- happen in the webhook, on payment. So a buyer who selects three cities, reaches
-- Stripe, and closes the tab has reserved nothing: a second buyer checking those
-- same cities a minute later is told they are AVAILABLE, and can buy them, and
-- the first buyer's stale intake row does not interfere in any way.
--
-- That is a deliberate choice over a reservation system, which would need a hold
-- table, an expiry, a sweeper for holds whose expiry never ran, and an answer to
-- "what does a third party see for a city that is neither free nor sold?" — three
-- new ways to lock a city with nobody owning it. The cost of not having one is
-- the residual race handled at the atomic claim in the webhook.
--
-- ── SO WHAT IS THIS FOR? ────────────────────────────────────────────────────
-- Personal data, not territory. An abandoned intake row holds a real person's
-- name, email, phone, business name, and a base64 logo. Keeping that forever for
-- someone who never paid is undisclosed indefinite retention, and privacy.html §9
-- now states the periods this function enforces. If you change the numbers here,
-- change that page in the same edit — otherwise the policy describes something
-- the database does not do.
--
-- The 2-hour threshold is safe because Checkout Sessions are created with a
-- 30-minute expiry (CHECKOUT_TTL_SECONDS in api/create-checkout.js). An expired
-- session can never be paid, so a row still marked awaiting_payment two hours on
-- is definitively dead rather than merely quiet.
create or replace function gsb_cleanup_stale_intake()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abandoned integer;
  v_deleted   integer;
  v_delogoed  integer;
begin
  -- 1 · Dead checkouts → 'abandoned', and drop the logo immediately.
  -- The logo is both the bulk of the row and its most identifiable artifact, so
  -- it goes at two hours rather than waiting out the 90-day window.
  update gsb_intake
     set status = 'abandoned', logo_data_url = null
   where status = 'awaiting_payment'
     and created_at < now() - interval '2 hours';
  get diagnostics v_abandoned = row_count;

  -- 2 · Abandoned leads deleted after 90 days — the same period as the
  -- post-termination window in privacy.html §9 and Operator Agreement §11.3.
  -- 'blocked' and 'provisioned' rows are deliberately NOT touched: a blocked row
  -- belongs to a real payment and is evidence that someone is owed money, and a
  -- provisioned row belongs to a paying operator.
  delete from gsb_intake
   where status = 'abandoned'
     and created_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;

  -- 3 · Provisioned rows keep their lead data but shed the logo after 30 days.
  -- By then the real file is in the gsb-tenant-logos bucket and this base64 copy
  -- is redundant. Not sooner: if the upload failed, this is the only copy, and the
  -- owner notification says to set logo_url by hand — 30 days is room to do it.
  update gsb_intake
     set logo_data_url = null
   where status = 'provisioned'
     and logo_data_url is not null
     and coalesce(provisioned_at, created_at) < now() - interval '30 days';
  get diagnostics v_delogoed = row_count;

  return jsonb_build_object(
    'marked_abandoned', v_abandoned,
    'deleted', v_deleted,
    'logos_cleared', v_delogoed,
    'ran_at', now()
  );
end
$$;

-- service_role ONLY — not `authenticated`, and the distinction matters.
--
-- This is SECURITY DEFINER and performs unconditional DELETEs, with no caller
-- check inside it. Granting it to `authenticated` would let any signed-in
-- operator run it against everyone's records. Low severity (those rows are on a
-- deletion schedule anyway) but it is an unauthorised write, and a definer
-- function with no internal authorisation must never be reachable by an ordinary
-- session.
--
-- Deliberately NOT solved by adding `if not gsb_is_admin()` inside: pg_cron
-- executes as the database owner, where auth.uid() is null, so an admin check
-- would make the scheduled run fail every night. Restricting the grant is the
-- right lever — the owner and pg_cron both act as roles that bypass it.
revoke all on function gsb_cleanup_stale_intake() from public, anon, authenticated;
grant execute on function gsb_cleanup_stale_intake() to service_role;

-- ── SCHEDULING ──────────────────────────────────────────────────────────────
-- Attempted automatically, but WHOLLY OPTIONAL and fully guarded. pg_cron needs
-- to be enabled on the project, and `create extension` can fail for reasons this
-- file cannot fix — so it is never attempted here. Every failure path degrades to
-- a NOTICE, because ONE PASTE MUST RUN WITH ZERO ERRORS and a retention sweeper is
-- not worth breaking that guarantee for.
--
-- If it does not schedule, the function still exists and nothing is broken: run
--   select gsb_cleanup_stale_intake();
-- by hand whenever you think of it. Nothing depends on it having run.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      -- Unschedule first so a re-run replaces the job rather than stacking a
      -- second copy of it.
      perform cron.unschedule('gsb-cleanup-stale-intake');
    exception when others then
      null;   -- no existing job, which is the normal case on a first run
    end;
    begin
      perform cron.schedule(
        'gsb-cleanup-stale-intake',
        '17 3 * * *',                       -- 03:17 UTC daily, off the hour
        'select gsb_cleanup_stale_intake();'
      );
      raise notice 'gsb: cleanup scheduled daily at 03:17 UTC via pg_cron.';
    exception when others then
      raise notice 'gsb: pg_cron present but scheduling failed (%). Run select gsb_cleanup_stale_intake(); by hand.', sqlerrm;
    end;
  else
    raise notice 'gsb: pg_cron is not enabled, so no cleanup job was scheduled.';
    raise notice 'gsb: either enable it (Database -> Extensions -> pg_cron) and re-run this file,';
    raise notice 'gsb: or run  select gsb_cleanup_stale_intake();  by hand every month or so.';
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 · ROW LEVEL SECURITY — ENABLED ON EVERY TABLE, NO EXCEPTIONS
-- ═══════════════════════════════════════════════════════════════════════════

alter table gsb_settings           enable row level security;
alter table gsb_admin_settings     enable row level security;
alter table gsb_tenants            enable row level security;
alter table gsb_client_users       enable row level security;
alter table gsb_city_claims        enable row level security;
alter table gsb_sales              enable row level security;
alter table gsb_items              enable row level security;
alter table gsb_photos             enable row level security;
alter table gsb_clients            enable row level security;
alter table gsb_contracts          enable row level security;
alter table gsb_intake             enable row level security;
alter table gsb_acceptances        enable row level security;
alter table gsb_billing            enable row level security;
alter table gsb_blocked_purchases  enable row level security;
alter table gsb_waitlist           enable row level security;

-- FORCE ROW LEVEL SECURITY is deliberately NOT used anywhere in this file.
-- It would subject the table OWNER to its own policies, and the Supabase SQL
-- editor connects as that owner — so on any project where `postgres` lacks the
-- BYPASSRLS attribute, forcing it would lock the editor out of reading the
-- evidence tables. It buys nothing here: the only writer to the append-only
-- tables is service_role, which carries BYPASSRLS and is unaffected by FORCE
-- either way. The protection those tables actually rely on is the absence of
-- any INSERT/UPDATE/DELETE policy (see 4.8 and 4.10).


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 · POLICIES
--
-- Every one is `drop policy if exists` then `create policy`, so re-running this
-- file lands each table in a known-clean policy set rather than layering a
-- second permissive policy beside the first.
--
-- The tenant-isolation test, used with BOTH `using` (controls read/update/
-- delete visibility) and `with check` (blocks forging a row tagged to someone
-- else's client_id):
--     client_id = gsb_my_client_id()
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 4.1 · SETTINGS — public read, no public write ───────────────────────────
drop policy if exists "public read settings" on gsb_settings;
create policy "public read settings" on gsb_settings
  for select to anon, authenticated using (true);

drop policy if exists "admin writes settings" on gsb_settings;
create policy "admin writes settings" on gsb_settings
  for all to authenticated using (gsb_is_admin()) with check (gsb_is_admin());

-- ── 4.2 · ADMIN SETTINGS — admin only, every verb ───────────────────────────
drop policy if exists "admin all admin settings" on gsb_admin_settings;
create policy "admin all admin settings" on gsb_admin_settings
  for all to authenticated using (gsb_is_admin()) with check (gsb_is_admin());

-- ── 4.3 · TENANTS — public read of ACTIVE only ──────────────────────────────
-- No insert/update/delete policy for anon or authenticated. Only service_role
-- (the API functions) creates or edits an operator row, so an operator cannot
-- self-provision, rename their slug, rewrite their claimed cities, or
-- reactivate themselves. Colour changes go through gsb_set_primary_color.
drop policy if exists "public read active tenants" on gsb_tenants;
create policy "public read active tenants" on gsb_tenants
  for select to anon, authenticated using (is_active = true);

-- An operator may read their OWN row even when deactivated. Without this, a
-- deactivated operator's dashboard cannot distinguish "your account is
-- inactive" from "your account does not exist" — EstateSaleBiz shipped that
-- ambiguity and had to log it as an open item.
drop policy if exists "operator reads own row" on gsb_tenants;
create policy "operator reads own row" on gsb_tenants
  for select to authenticated using (client_id = gsb_my_client_id());

drop policy if exists "admin reads all tenants" on gsb_tenants;
create policy "admin reads all tenants" on gsb_tenants
  for select to authenticated using (gsb_is_admin());

-- NO UPDATE POLICY ON gsb_tenants, for anyone, deliberately.
--
-- RLS is ROW-level, not column-level, so "an admin may update tenants" would
-- also be "an admin may rewrite slug, client_id, and cities from a browser" —
-- and, more importantly, it would put the deactivation logic in client
-- JavaScript. Deactivating an operator MUST also release their city claims, and
-- a deactivation that forgot to would lock three cities forever with no owner
-- and nothing surfacing it.
--
-- Both writes therefore happen inside gsb_admin_set_tenant_active() (PART 2.5),
-- which is SECURITY DEFINER, checks gsb_is_admin() itself, and cannot do one
-- half without the other. Same reasoning as gsb_set_primary_color for operators.

-- ── 4.4 · CLIENT USERS — a user reads ONLY their own mapping ────────────────
-- No insert or update policy: only service_role creates mappings, so an
-- operator can never rewrite their own client_id and read another territory.
drop policy if exists "user reads own mapping" on gsb_client_users;
create policy "user reads own mapping" on gsb_client_users
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "admin reads all mappings" on gsb_client_users;
create policy "admin reads all mappings" on gsb_client_users
  for select to authenticated using (gsb_is_admin());

-- ── 4.5 · CITY CLAIMS — no direct public read; the view is the public path ──
-- anon reaches availability ONLY through gsb_public_city_claims (which drops
-- client_id and slug) or gsb_check_cities(). Reading the base table would let
-- anyone enumerate every customer and their exact territory.
drop policy if exists "operator reads own claims" on gsb_city_claims;
create policy "operator reads own claims" on gsb_city_claims
  for select to authenticated using (client_id = gsb_my_client_id());

drop policy if exists "admin all claims"   on gsb_city_claims;
drop policy if exists "admin reads claims" on gsb_city_claims;
create policy "admin reads claims" on gsb_city_claims
  for select to authenticated using (gsb_is_admin());
-- SELECT only, even for the admin. No anon policy and no write policy for
-- anybody: claims are written by service_role (the webhook, where the primary key
-- makes the claim atomic) and released by gsb_admin_set_tenant_active(). A
-- browser-reachable DELETE here would let a mis-click free a paying operator's
-- territory with nothing to stop it.

-- ── 4.6 · SALES / ITEMS / PHOTOS / CLIENTS / CONTRACTS — tenant isolation ───
-- Public reads go through the four views in PART 6, never these tables. That
-- is what keeps street_address (sales) and min_price (items) unreachable.
drop policy if exists "tenant all sales" on gsb_sales;
create policy "tenant all sales" on gsb_sales
  for all to authenticated
  using      (client_id = gsb_my_client_id())
  with check (client_id = gsb_my_client_id());

drop policy if exists "tenant all items" on gsb_items;
create policy "tenant all items" on gsb_items
  for all to authenticated
  using      (client_id = gsb_my_client_id())
  with check (client_id = gsb_my_client_id());

drop policy if exists "tenant all photos" on gsb_photos;
create policy "tenant all photos" on gsb_photos
  for all to authenticated
  using      (client_id = gsb_my_client_id())
  with check (client_id = gsb_my_client_id());

drop policy if exists "tenant all clients" on gsb_clients;
create policy "tenant all clients" on gsb_clients
  for all to authenticated
  using      (client_id = gsb_my_client_id())
  with check (client_id = gsb_my_client_id());

drop policy if exists "tenant all contracts" on gsb_contracts;
create policy "tenant all contracts" on gsb_contracts
  for all to authenticated
  using      (client_id = gsb_my_client_id())
  with check (client_id = gsb_my_client_id());

-- Admin read-only across all operators, for support. Deliberately SELECT only:
-- the owner has no business editing an operator's catalogue or their CRM.
drop policy if exists "admin reads sales" on gsb_sales;
create policy "admin reads sales" on gsb_sales
  for select to authenticated using (gsb_is_admin());

drop policy if exists "admin reads items" on gsb_items;
create policy "admin reads items" on gsb_items
  for select to authenticated using (gsb_is_admin());

-- gsb_clients is deliberately ABSENT from the admin-read set. It holds the
-- personal details of the operator's own customers, who never consented to
-- the platform owner reading them. Support does not require it.

-- ── 4.7 · INTAKE — admin read only ──────────────────────────────────────────
-- No anon policy at any verb: the browser never touches this table.
drop policy if exists "admin reads intake" on gsb_intake;
create policy "admin reads intake" on gsb_intake
  for select to authenticated using (gsb_is_admin());

-- ── 4.8 · ACCEPTANCES — APPEND-ONLY, ADMIN-READ ─────────────────────────────
-- A SELECT policy and nothing else. No UPDATE and no DELETE policy exist, so
-- neither operation is possible for anon or authenticated — RLS denies what no
-- policy permits. Evidence that can be edited by the party it is evidence
-- against is not evidence.
--
-- No INSERT policy either. The only writer is the webhook, which uses
-- service_role and bypasses RLS. Granting insert to `authenticated` would let
-- any self-registered account fabricate an acceptance record — and signup is
-- open, so that is a real attack rather than a theoretical one.
drop policy if exists "admin reads acceptances" on gsb_acceptances;
create policy "admin reads acceptances" on gsb_acceptances
  for select to authenticated using ((select gsb_is_admin()));
-- Wrapped in (select ...) so the function is evaluated once per query rather
-- than once per row: this table grows by one row per purchase and is never
-- pruned.

-- ── 4.9 · BILLING — admin only, never anon ──────────────────────────────────
-- Revenue must be invisible to the publishable key, which ships in every page.
drop policy if exists "admin all billing" on gsb_billing;
create policy "admin all billing" on gsb_billing
  for all to authenticated using (gsb_is_admin()) with check (gsb_is_admin());

-- ── 4.10 · BLOCKED PURCHASES — admin read + update ──────────────────────────
-- Update, so a resolution can be recorded from the dashboard. No INSERT policy
-- (only the webhook writes, as service_role) and no DELETE policy — this is
-- refund evidence.
drop policy if exists "admin reads blocked" on gsb_blocked_purchases;
create policy "admin reads blocked" on gsb_blocked_purchases
  for select to authenticated using ((select gsb_is_admin()));

drop policy if exists "admin updates blocked" on gsb_blocked_purchases;
create policy "admin updates blocked" on gsb_blocked_purchases
  for update to authenticated
  using ((select gsb_is_admin())) with check ((select gsb_is_admin()));

-- ── 4.11 · WAITLIST — anon INSERT only ──────────────────────────────────────
-- Write-only to the public: a visitor can add themselves but can never
-- enumerate who else signed up or which towns are contested.
drop policy if exists "anon insert waitlist" on gsb_waitlist;
create policy "anon insert waitlist" on gsb_waitlist
  for insert to anon, authenticated with check (true);

drop policy if exists "admin reads waitlist" on gsb_waitlist;
create policy "admin reads waitlist" on gsb_waitlist
  for select to authenticated using (gsb_is_admin());


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 · REST REACHABILITY GRANTS
--
-- RLS POLICIES ALONE DO NOT GRANT API ACCESS. PostgREST checks the SQL
-- privilege first and RLS second: a table with a perfect policy and no GRANT
-- returns "permission denied for table", while a table with a GRANT and no
-- policy returns zero rows. Both layers are stated explicitly here rather than
-- inherited from Supabase's default privileges, so the intended posture is
-- readable in one place and survives a default changing.
--
-- The pattern is revoke-then-grant: start from nothing, add exactly what each
-- role needs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ THIS SECTION IS NOW A POINTER. ALL PRIVILEGES ARE SET IN PART 6B.
--
-- It used to hold the grants, and that was a REAL VULNERABILITY, not an untidy
-- ordering. Two compounding mistakes:
--
--   1. Its revoke sweep enumerated the fifteen base tables by name. Views were
--      not in the list, so nothing ever revoked anything from them.
--   2. It ran HERE — before PART 6 creates the views — so even a sweep that did
--      cover views would have run against objects that did not exist yet.
--
-- Supabase ships a default privilege rule on this schema:
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
-- so every view created in PART 6 was born with ALL privileges granted to anon —
-- SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER. The explicit
-- `grant select` that followed was redundant; SELECT was already there, along
-- with everything else.
--
-- That is not cosmetic over-granting. All four views are AUTO-UPDATABLE by
-- PostgreSQL's rules (one table in FROM, no DISTINCT/GROUP BY/set-ops; a
-- subquery in WHERE does not disqualify a view, and expression columns only make
-- those columns unassignable). Combined with `security_invoker = false`, a write
-- through the view executes with the VIEW OWNER's rights, and base-table RLS is
-- evaluated as that owner — who owns the tables and is not subject to FORCE ROW
-- LEVEL SECURITY. So RLS offered no protection on this path, and
--     delete from gsb_public_city_claims;
-- would have released every operator's territory.
--
-- The fix is not to add views to a list. It is to set privileges LAST, over
-- whatever actually exists, by enumerating the catalogue instead of trusting a
-- hand-maintained array to stay in step with the schema. See PART 6B.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 · PUBLIC VIEWS — the only anonymous read path to sale data
--
-- `security_invoker = false` is LOAD-BEARING and set explicitly rather than
-- left to a default: the view runs with the owner's privileges, so anon can
-- read it even though anon has no policy and no grant on the base tables. Under
-- invoker semantics every one of these would return zero rows to anon — and for
-- an availability checker, a silent all-clear is the worst possible failure.
--
-- Each view gates on gsb_tenants.is_active from day one. EstateSaleBiz shipped
-- these without that join, so a deactivated operator's storefront kept serving
-- its full catalogue — title, dates, city, every item and price — to anyone,
-- for a business that was no longer paying to have one. Fixing it later took a
-- migration whose own verification could not be read.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 6.1 · CITY AVAILABILITY ─────────────────────────────────────────────────
-- A faithful projection of gsb_city_claims: same rows, fewer columns.
--
-- NO row filtering, deliberately. city_norm is the key the atomic insert
-- enforces on, so anything this view hid would be a city the checker calls
-- available and provisioning then rejects — manufacturing the exact
-- paid-then-blocked failure the checker exists to prevent. A deactivated
-- operator's city is released by DELETING the claim row, not by filtering here.
--
-- What it removes is client_id and slug, which together let anyone enumerate
-- the full customer list and their exact territories.
create or replace view public.gsb_public_city_claims
  with (security_invoker = false) as
  select
    city_norm,
    city_label,
    -- Labels are composed as '<City>, <ST>'. Anything without a comma yields
    -- null rather than mis-parsing the city name itself as a state.
    case
      when city_label like '%,%'
        then upper(btrim(regexp_replace(city_label, '^.*,\s*', '')))
      else null
    end as state
  from public.gsb_city_claims;

-- ── 6.2 · PUBLIC SALES — the address is CONDITIONAL, and nulled in the view ──
-- A garage sale listing needs an address to be worth anything, so the default is
-- to publish it (see the show_address comment on gsb_sales). When the homeowner
-- has asked us not to, the view returns NULL — the value is removed here, in the
-- only path anon can read, rather than merely hidden by the page. A UI-level
-- hide would still ship the address in the JSON payload to every visitor.
--
-- commission_pct, client_name and crm_client_id are omitted entirely and
-- unconditionally: what the operator charges and who the homeowner is are
-- nobody else's business.
create or replace view public.gsb_public_sales
  with (security_invoker = false) as
  select id, client_id, title, sale_type,
         case when show_address then street_address else null end as street_address,
         show_address,
         city_state_zip, start_date, end_date,
         day_of_week, open_time, close_time, description, status,
         is_live, published_at, created_at
  from public.gsb_sales
  where is_live = true
    and client_id in (select client_id from public.gsb_tenants where is_active = true);

-- ── 6.3 · PUBLIC ITEMS — min_price OMITTED ──────────────────────────────────
create or replace view public.gsb_public_items
  with (security_invoker = false) as
  select id, client_id, sale_id, name, category, condition, price, description,
         status, featured, emoji, photo_url, display_order, created_at
  from public.gsb_items
  where sale_id in (
    select id from public.gsb_sales
     where is_live = true
       and client_id in (select client_id from public.gsb_tenants where is_active = true)
  );

-- ── 6.4 · PUBLIC PHOTOS ─────────────────────────────────────────────────────
create or replace view public.gsb_public_photos
  with (security_invoker = false) as
  select id, client_id, sale_id, photo_url, caption, display_order, is_featured, created_at
  from public.gsb_photos
  where sale_id in (
    select id from public.gsb_sales
     where is_live = true
       and client_id in (select client_id from public.gsb_tenants where is_active = true)
  );

-- The views are the public read path, so they get the grant the base tables
-- deliberately do not. Re-issued idempotently so this file is complete on its
-- own if a view is ever dropped and rebuilt.
-- Grants for these views are NOT issued here. They are issued in PART 6B, after
-- a sweep that first removes what Supabase's default privileges granted at
-- creation. Granting SELECT here without revoking first is what produced the
-- original hole: SELECT was already present, along with INSERT, UPDATE and
-- DELETE, and adding a grant that is already held changes nothing.


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6B · PRIVILEGES — THE AUTHORITATIVE PASS, RUN LAST OVER EVERY OBJECT
--
-- RLS POLICIES ALONE DO NOT GRANT API ACCESS, and SQL GRANTS ALONE DO NOT
-- RESTRICT IT. PostgREST checks the SQL privilege first and RLS second:
--   • a grant with no policy  → empty result, no error. Reads as "no data".
--   • a policy with no grant  → "permission denied for table", before RLS runs.
-- Both layers are stated explicitly here so the intended posture is readable in
-- one place.
--
-- ── WHY THIS RUNS LAST, AND WHY IT ENUMERATES THE CATALOGUE ─────────────────
-- Every object this file creates — tables in PART 1, views in PART 6 — is born
-- with Supabase's default privileges: ALL, to anon and authenticated. A revoke
-- that runs before an object exists cannot touch it, and a revoke driven by a
-- hand-written list silently misses whatever nobody remembered to add.
--
-- So this block runs after everything is created, and asks the CATALOGUE what
-- exists rather than being told. Add a table or a view anywhere above and it is
-- swept automatically; the only way to hold a privilege after this point is to
-- be granted one explicitly below.
--
-- IDEMPOTENT BY CONSTRUCTION: revoke-then-grant reaches the same end state on
-- every paste, whatever the database held beforehand. Re-running this file is
-- how you repair a drifted database, not something to avoid.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 6B.1 · CLEAN SLATE — every gsb_ table, view, and materialised view ──────
-- PUBLIC is included alongside anon and authenticated. Nothing here grants to
-- PUBLIC, but a privilege held by PUBLIC is held by every role including anon,
-- so a sweep that ignores it can leave a hole no per-role audit would show.
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname like 'gsb\_%'
       and c.relkind in ('r','p','v','m')   -- table, partitioned, view, matview
     order by c.relname
  loop
    execute format('revoke all on public.%I from anon, authenticated, public', r.relname);
  end loop;
end $$;

-- ── 6B.2 · anon — the publishable key that ships in every page ──────────────
-- This is the entire reach of the browser. Three base-table grants and four
-- read-only views. Verification 10c asserts exactly this set and nothing else.
grant select on table public.gsb_settings to anon;   -- waitlist_mode
grant select on table public.gsb_tenants  to anon;   -- operator branding
grant insert on table public.gsb_waitlist to anon;   -- the ONLY public write

-- SELECT ONLY on the views, and the preceding revoke is what makes that true.
-- These views are auto-updatable, so INSERT/UPDATE/DELETE here are not inert
-- privileges — they are working write paths straight through base-table RLS.
grant select on table public.gsb_public_city_claims to anon;
grant select on table public.gsb_public_sales       to anon;
grant select on table public.gsb_public_items       to anon;
grant select on table public.gsb_public_photos      to anon;

-- ── 6B.3 · authenticated — a signed-in operator, or you ─────────────────────
-- ⚠️ THE GRANT AND THE POLICY MUST AGREE. Cross-check against PART 4 whenever
-- either changes; verification 10c-bis does it mechanically.
--
-- UPDATE on gsb_settings: the owner console flips waitlist_mode from the
-- browser, and the "admin writes settings" policy (4.1) restricts it. INSERT and
-- DELETE withheld — a browser that can invent or remove setting keys can change
-- how the landing page behaves.
grant select, update                 on table public.gsb_settings          to authenticated;
-- SELECT only: territory and status changes go through the RPCs in PART 2, and
-- there is no UPDATE policy on this table for anyone.
grant select                         on table public.gsb_tenants           to authenticated;
grant select                         on table public.gsb_client_users      to authenticated;
-- SELECT only: claims are written by service_role and released by
-- gsb_admin_set_tenant_active().
grant select                         on table public.gsb_city_claims       to authenticated;
grant select, insert, update, delete on table public.gsb_sales             to authenticated;
grant select, insert, update, delete on table public.gsb_items             to authenticated;
grant select, insert, update, delete on table public.gsb_photos            to authenticated;
grant select, insert, update, delete on table public.gsb_clients           to authenticated;
grant select, insert, update, delete on table public.gsb_contracts         to authenticated;
grant select, insert                 on table public.gsb_waitlist          to authenticated;
-- Admin surfaces: the grant makes the owner console able to reach them at all;
-- gsb_is_admin() in the policy is what actually restricts them.
grant select, insert, update, delete on table public.gsb_admin_settings    to authenticated;
grant select                         on table public.gsb_intake            to authenticated;
grant select                         on table public.gsb_acceptances       to authenticated;
grant select, insert, update, delete on table public.gsb_billing           to authenticated;
grant select, update                 on table public.gsb_blocked_purchases to authenticated;
-- Read-only on the views, same as anon: a signed-in operator viewing their own
-- public site reads through exactly the path a shopper does.
grant select on table public.gsb_public_city_claims to authenticated;
grant select on table public.gsb_public_sales       to authenticated;
grant select on table public.gsb_public_items       to authenticated;
grant select on table public.gsb_public_photos      to authenticated;

-- ── 6B.4 · SEQUENCES ────────────────────────────────────────────────────────
-- Every table here uses `generated always as identity`, whose sequence is
-- accessed with the table owner's rights — so no role needs a sequence privilege
-- to insert. (That is the difference from `serial`, which does.)
--
-- anon is therefore given USAGE and NOT SELECT. SELECT on a sequence exposes
-- last_value, which on gsb_billing_id_seq is a live count of how many purchases
-- have ever been made, readable by anyone holding the publishable key. USAGE is
-- kept purely as insurance for the waitlist insert; it permits nextval, which
-- leaks nothing beyond a burned id.
revoke all on all sequences in schema public from anon, authenticated, public;
grant usage         on all sequences in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- ── 6B.5 · FUNCTIONS ────────────────────────────────────────────────────────
-- Supabase's default privileges cover FUNCTIONS as well as tables, so every
-- function in this file is also born executable by anon. Each one already has an
-- explicit revoke beside its definition in PART 2; these two are the leftovers
-- that had none, tidied here so the audit in 10c-fn returns exactly one row.
--
-- An audit that always shows two rows of known noise is an audit people stop
-- reading, and the row that matters gets lost in it.
--
-- Neither revoke can break anything: gsb_check_cities is SECURITY DEFINER and
-- calls gsb_norm_city with the owner's rights, and the normalisation trigger
-- fires under service_role, which bypasses privilege checks entirely.
revoke all on function gsb_norm_city(text)          from anon, public;
revoke all on function gsb_city_claims_normalize()  from anon, public;
grant execute on function gsb_norm_city(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 · STORAGE — BUCKETS AND POLICIES
--
-- ⚠️ NO POLICY BELOW IS GATED ON bucket_id ALONE. That mistake — a policy named
-- "delete own photos" whose predicate was only `bucket_id = '...'` — meant any
-- authenticated account could delete every operator's photos on a live
-- EstateSaleBiz. Signup is open, so two HTTP requests destroyed a live sale,
-- and with no object versioning there was no undo. Every verb here tests
-- gsb_is_tenant() AND that the first path segment is the caller's own client_id.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 7.1 · BUCKETS ───────────────────────────────────────────────────────────
-- Public read on both: shoppers are anonymous, so the images must be
-- world-readable. MIME allowlists exclude SVG deliberately — it can carry
-- <script> and these files are served from the Supabase origin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gsb-sale-photos', 'gsb-sale-photos', true, 10485760,
        array['image/png','image/jpeg','image/webp','image/heic'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gsb-tenant-logos', 'gsb-tenant-logos', true, 2097152,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 7.2 · SALE PHOTOS — scoped to the owning operator ───────────────────────
-- Drops every name this policy set has ever had, old and new, so no earlier
-- definition can survive underneath and OR access back open.
drop policy if exists "public read sale photos"           on storage.objects;
drop policy if exists "authenticated read sale photos"    on storage.objects;
drop policy if exists "authenticated upload sale photos"  on storage.objects;
drop policy if exists "authenticated delete sale photos"  on storage.objects;
drop policy if exists "gsb tenant read sale photos"       on storage.objects;
drop policy if exists "gsb tenant upload own sale photos" on storage.objects;
drop policy if exists "gsb tenant update own sale photos" on storage.objects;
drop policy if exists "gsb tenant delete own sale photos" on storage.objects;

-- ⚠️ THIS SELECT POLICY IS DECORATIVE WHILE THE BUCKET IS PUBLIC. Public reads
-- never consult RLS, so shoppers are unaffected by it. It is scoped anyway, for
-- consistency and so the authenticated API path is not wider than the
-- dashboard needs.
--
-- THE TRAP: if this bucket is ever made private, this policy admits ONLY the
-- owning operator and every shopper sees zero photos. Making it private
-- requires a signed-URL path in the storefront FIRST.
create policy "gsb tenant read sale photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'gsb-sale-photos'
    and gsb_is_tenant()
    and (storage.foldername(name))[1] = gsb_my_client_id()
  );

-- LOAD-BEARING. Signup is open, so without this any self-registered account
-- writes into any operator's photo prefix.
create policy "gsb tenant upload own sale photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gsb-sale-photos'
    and gsb_is_tenant()
    and (storage.foldername(name))[1] = gsb_my_client_id()
  );

-- Needed for upsert:true on re-upload, which would otherwise fail on the
-- update half with a misleading permission error.
create policy "gsb tenant update own sale photos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'gsb-sale-photos'
    and gsb_is_tenant()
    and (storage.foldername(name))[1] = gsb_my_client_id()
  )
  with check (
    bucket_id = 'gsb-sale-photos'
    and gsb_is_tenant()
    and (storage.foldername(name))[1] = gsb_my_client_id()
  );

-- LOAD-BEARING AND DESTRUCTIVE. No object versioning and the dashboard never
-- re-uploads — there is no undo.
create policy "gsb tenant delete own sale photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gsb-sale-photos'
    and gsb_is_tenant()
    and (storage.foldername(name))[1] = gsb_my_client_id()
  );

-- ── 7.3 · TENANT LOGOS — public read, service_role write only ───────────────
-- Logos are uploaded by /api/stripe-webhook with the service_role key, which
-- bypasses RLS, so no insert policy is needed for provisioning to work — and
-- not creating one means an operator cannot overwrite another's logo.
drop policy if exists "public read tenant logos"     on storage.objects;
drop policy if exists "gsb public read tenant logos" on storage.objects;
create policy "gsb public read tenant logos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'gsb-tenant-logos');


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 · SEED
--
-- The demo tenant is STATIC AND IDEMPOTENT BY DESIGN. EstateSaleBiz's demo used
-- `current_date + N` dates, which meant it drifted into the past and needed a
-- refresh script re-run "1-2 days before any launch or podcast date" — a manual
-- step nobody remembers, whose failure mode is a prospect looking at a sale
-- that ended last month.
--
-- These dates are computed from a fixed anchor that always lands the demo sale
-- on the NEXT upcoming Friday-Sunday, evaluated at read time by the storefront.
-- The stored dates are relative to a recurring weekly anchor rather than a
-- one-off stamp, so re-running this file is a no-op and never running it again
-- still shows a future sale.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 8.1 · SETTINGS DEFAULTS ─────────────────────────────────────────────────
insert into gsb_settings (key, value) values
  -- Flip to 'true' when you stop selling territories; index.html swaps its buy
  -- CTAs for the waitlist form. Change with:
  --   update gsb_settings set value = 'true' where key = 'waitlist_mode';
  ('waitlist_mode',        'false'),
  ('territory_price_usd',  '249'),
  ('cities_per_territory', '3'),
  ('demo_slug',            'demo'),
  ('support_email',        'info@kingdom-creatives.com')
on conflict (key) do nothing;

insert into gsb_admin_settings (key, value) values
  -- Deliberately seeded NULL: it depends on your entity structure and your
  -- accountant, and a guessed default here would quietly become the number you
  -- budget against.
  ('tax_set_aside_pct', null)
on conflict (key) do nothing;

-- ── 8.2 · DEMO TENANT ───────────────────────────────────────────────────────
-- client_id 'demo' is showcase data, NOT sold territory. It deliberately has NO
-- row in gsb_city_claims, so every city it names stays claimable by a real
-- operator. Demo exclusion is a WRITE-side property: nothing here creates a
-- claim, and the API functions never provision this slug.
insert into gsb_tenants
  (slug, client_id, business_name, phone, email, service_area, cities,
   primary_color, about_text, default_commission_pct, is_active)
values
  ('demo', 'demo', 'Clearwater Sale Co.', '(208) 555-0148',
   'hello@clearwatersaleco.example', 'Nampa, Caldwell & Meridian, ID',
   array['Nampa, ID','Caldwell, ID','Meridian, ID'],
   '#E8471F',
   'We run the whole garage sale for you — pricing, signs, staffing, and cleanup. You keep the biggest share and never touch a folding table.',
   50.00, true)
on conflict (slug) do update set
  client_id              = excluded.client_id,
  business_name          = excluded.business_name,
  phone                  = excluded.phone,
  email                  = excluded.email,
  service_area           = excluded.service_area,
  cities                 = excluded.cities,
  primary_color          = excluded.primary_color,
  about_text             = excluded.about_text,
  default_commission_pct = excluded.default_commission_pct,
  is_active              = excluded.is_active;

-- ── 8.3 · DEMO SALE — a fixed weekly anchor, never stale ────────────────────
-- start_date is the NEXT Friday from whenever this file runs; the storefront
-- rolls it forward weekly on read (see rollDemoDates in demo.html), so it is
-- correct forever without a refresh script. Written idempotently: the sale is
-- matched on (client_id, title), so a re-run updates the one row rather than
-- accumulating duplicates or wiping a demo an operator is mid-tour of.
insert into gsb_sales
  (client_id, title, sale_type, client_name, street_address, city_state_zip,
   start_date, end_date, day_of_week, open_time, close_time, description,
   commission_pct, status, is_live, published_at)
select
  'demo',
  'Orchard Heights — Whole-Garage Clear-Out',
  'moving',
  'The Reyes Family',
  '1427 W Orchard Ave',
  'Nampa, ID 83651',
  (current_date + ((5 - extract(dow from current_date)::int + 7) % 7))::date,
  (current_date + ((5 - extract(dow from current_date)::int + 7) % 7) + 2)::date,
  'Fri – Sun',
  '08:00',
  '15:00',
  'A full two-car garage, a workshop, and a finished basement — the family is relocating out of state and everything is priced to move. Tools, patio furniture, kids'' gear, camping equipment, and a lot of good yard equipment. Cash and card both fine. Saturday afternoon everything drops 25%, Sunday it is half price or make us an offer.',
  50.00,
  'scheduled',
  true,
  now()
where not exists (
  select 1 from gsb_sales
   where client_id = 'demo' and title = 'Orchard Heights — Whole-Garage Clear-Out'
);

-- Keep the demo sale's dates rolling forward if this file is re-run later.
update gsb_sales
   set start_date = (current_date + ((5 - extract(dow from current_date)::int + 7) % 7))::date,
       end_date   = (current_date + ((5 - extract(dow from current_date)::int + 7) % 7) + 2)::date,
       is_live    = true,
       updated_at = now()
 where client_id = 'demo'
   and title = 'Orchard Heights — Whole-Garage Clear-Out'
   and start_date < current_date;

-- ── 8.4 · DEMO ITEMS ────────────────────────────────────────────────────────
-- Photo URLs are external (Pexels) rather than bucket paths on purpose: the
-- seed must produce a complete-looking demo the moment this file runs, with no
-- separate "now upload twelve images" step that would leave a broken grid if
-- skipped. Replace with your own bucket uploads whenever you like.
--
-- Inserted only when the demo sale has no items, so a re-run neither duplicates
-- them nor discards edits you made while showing the demo to someone.
insert into gsb_items
  (client_id, sale_id, name, category, condition, price, min_price, description,
   status, featured, emoji, display_order, photo_url)
select 'demo', s.id, v.name, v.category, v.cond, v.price, v.floor_price, v.descr,
       'available', v.featured, v.emoji, v.ord, v.photo
from gsb_sales s,
(values
  ('DeWalt 20V Drill & Impact Set','Tools','Very good',165.00,120.00,
   'Drill, impact driver, two 5Ah batteries, charger, and the hard case.',true,'🔧',1,
   'https://images.pexels.com/photos/1249611/pexels-photo-1249611.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Weber Genesis Gas Grill','Outdoor','Good',210.00,150.00,
   'Three-burner, side table, cover included. Cleaned and tested — lights first try.',true,'🔥',2,
   'https://images.pexels.com/photos/1105325/pexels-photo-1105325.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Patio Set — Table & Six Chairs','Outdoor','Good',185.00,130.00,
   'Powder-coated aluminium, tempered glass top, cushions included.',false,'🪑',3,
   'https://images.pexels.com/photos/2082087/pexels-photo-2082087.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Trek Hybrid Bike — 19" Frame','Sporting Goods','Very good',240.00,180.00,
   'Recent tune-up, new tyres and cables. Rides beautifully.',true,'🚲',4,
   'https://images.pexels.com/photos/100582/pexels-photo-100582.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Coleman 6-Person Tent & Camp Kit','Camping','Like new',95.00,65.00,
   'Tent, two sleeping bags, lantern, and a two-burner stove. Used twice.',false,'⛺',5,
   'https://images.pexels.com/photos/2398220/pexels-photo-2398220.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Craftsman Rolling Tool Chest','Tools','Good',175.00,125.00,
   'Eleven drawers, all runners smooth, keys present.',false,'🧰',6,
   'https://images.pexels.com/photos/1029243/pexels-photo-1029243.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Kids'' Playset & Outdoor Toys','Kids','Good',120.00,80.00,
   'Climbing frame, slide, two scooters, and a bin of sand toys.',false,'🛝',7,
   'https://images.pexels.com/photos/1094072/pexels-photo-1094072.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Solid Oak Dining Table + 4 Chairs','Furniture','Good',285.00,200.00,
   'Heavy, honest furniture. One leaf included. Minor ring mark on the top.',true,'🪵',8,
   'https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Honda Push Mower — Self-Propelled','Yard','Very good',195.00,145.00,
   'Starts on the first pull. Fresh oil, new blade, bag included.',false,'🌱',9,
   'https://images.pexels.com/photos/589/garden-grass-meadow-green.jpg?auto=compress&cs=tinysrgb&w=800'),
  ('Full Kitchen Lot — Small Appliances','Kitchen','Mixed',85.00,55.00,
   'Stand mixer, blender, air fryer, and two boxes of pans and utensils.',false,'🍳',10,
   'https://images.pexels.com/photos/2291367/pexels-photo-2291367.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Snowblower — Two-Stage','Yard','Good',320.00,240.00,
   'Runs well, electric start, chains included. Serviced last autumn.',false,'❄️',11,
   'https://images.pexels.com/photos/1300510/pexels-photo-1300510.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Garage Shelving & Storage Bins','Storage','Good',70.00,45.00,
   'Four steel units plus roughly twenty lidded totes.',false,'📦',12,
   'https://images.pexels.com/photos/4506270/pexels-photo-4506270.jpeg?auto=compress&cs=tinysrgb&w=800')
) as v(name, category, cond, price, floor_price, descr, featured, emoji, ord, photo)
where s.client_id = 'demo'
  and s.title = 'Orchard Heights — Whole-Garage Clear-Out'
  and not exists (select 1 from gsb_items i where i.client_id = 'demo' and i.sale_id = s.id);

-- ── 8.5 · DEMO CRM CONTACT ──────────────────────────────────────────────────
insert into gsb_clients (client_id, name, phone, email, address, notes, status)
select 'demo', 'Marisol Reyes', '(208) 555-0193', 'm.reyes@example.com',
       '1427 W Orchard Ave, Nampa, ID 83651',
       'Relocating to Texas in six weeks. Wants the garage and basement cleared, will keep the appliances. Prefers texts over calls.',
       'booked'
where not exists (select 1 from gsb_clients where client_id = 'demo' and name = 'Marisol Reyes');


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 · YOUR OWNER ACCOUNT — DO THIS ONCE, BY HAND
-- ═══════════════════════════════════════════════════════════════════════════
--
--   1. Supabase → Authentication → Users → Add user
--        Email: info@kingdom-creatives.com   (set a strong password)
--   2. Copy that user's UID.
--   3. Run the statement below with the UID pasted in.
--
-- client_id '__owner__' matches no tenant on purpose, so the owner account can
-- never be mistaken for an operator and never reads an operator's storefront
-- data. stripe_session_id stays NULL — this mapping did not come from a
-- purchase, which is exactly why that column must remain nullable.
--
-- insert into gsb_client_users (user_id, client_id, display_name, role)
-- values ('<YOUR-AUTH-UID>', '__owner__', 'Jason Vega', 'admin')
-- on conflict (user_id) do update set role = 'admin', client_id = '__owner__';


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 10 · VERIFY
--
-- These prove what is DECLARED. They do not prove what anon is PERMITTED to
-- read — for that, hit the REST API with the publishable key and confirm the
-- expected 200s and empty sets. The behavioural checks are listed at the end of
-- LAUNCH-CHECKLIST.md, and they are not optional: EstateSaleBiz twice recorded
-- a migration as verified on the strength of a declarative query that was
-- structurally incapable of returning the row it claimed was absent.
-- ═══════════════════════════════════════════════════════════════════════════

-- 10a. Every gsb_ table exists and has RLS ON. Expect 15 rows, all true.
select 'rls' as check, c.relname, c.relrowsecurity as rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname like 'gsb\_%' and c.relkind = 'r'
 order by c.relname;

-- 10b. No gsb_ table is left without a policy. A table with RLS on and no
--      policy is deny-all, which is safe but usually a mistake. Expect 0 rows.
select 'table with RLS and NO policy' as problem, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname like 'gsb\_%' and c.relkind = 'r'
   and c.relrowsecurity
   and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = c.relname)
 order by c.relname;

-- 10c. THE ONE THAT MATTERS MOST — the complete reach of the publishable key.
--
--      ⚠️ THIS CHECK PREVIOUSLY SAID "expect exactly three rows" AND THAT WAS
--      WRONG, in a way worth recording. information_schema.role_table_grants
--      covers VIEWS as well as tables, so the correct total is SEVEN: three base
--      grants plus SELECT on each of the four public views.
--
--      Stating the wrong number was not a harmless typo. A first run returned 31
--      rows — the four views carrying ALL SEVEN privileges each from Supabase's
--      default privileges — and an expectation of "three" gives no way to tell a
--      catastrophe from an off-by-a-few. Every row now labels itself, so the
--      check cannot be passed by miscounting.
--
--      EXPECT: seven rows, every verdict 'ok'. ANY row reading 'UNEXPECTED' is a
--      live hole — read 6B and re-run this file.
select
  case
    when (table_name, privilege_type) in (
      ('gsb_settings','SELECT'), ('gsb_tenants','SELECT'), ('gsb_waitlist','INSERT'),
      ('gsb_public_city_claims','SELECT'), ('gsb_public_sales','SELECT'),
      ('gsb_public_items','SELECT'),       ('gsb_public_photos','SELECT')
    ) then 'ok'
    else '*** UNEXPECTED — anon must not hold this ***'
  end as verdict,
  table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public' and table_name like 'gsb\_%'
 order by verdict desc, table_name, privilege_type;

-- 10c-ter. THE ASSERTION BEHIND 10c, proven at the level that actually matters.
--
--      A grant audit tells you what is held. This tells you what is POSSIBLE.
--      All four public views are auto-updatable by PostgreSQL's rules, and they
--      run with `security_invoker = false` — so a write through one executes as
--      the view owner and base-table RLS never applies. The only thing standing
--      between anon and `delete from gsb_public_city_claims` is the absence of a
--      DELETE grant, which is exactly what 6B.1 removes and 10c confirms.
--
--      is_updatable = YES here is EXPECTED and is not the problem; it is a
--      property of the view's shape, not of who may use it. The row to care
--      about is any anon grant other than SELECT in 10c above.
select 'view write-surface' as check,
       table_name, is_updatable, is_insertable_into,
       'writable in principle — 10c must show SELECT only for anon' as note
  from information_schema.views
 where table_schema = 'public' and table_name like 'gsb\_public\_%'
 order by table_name;

-- 10c-bis. GRANT/POLICY CROSS-CHECK — the mismatch that is easiest to ship and
--      hardest to debug, in both directions:
--
--        grant with no policy  → the call returns an empty result and no error.
--                                Looks like "there is no data", is actually
--                                "you are not allowed to see the data".
--        policy with no grant  → PostgREST returns "permission denied for table"
--                                before RLS is consulted at all, so a perfectly
--                                correct policy appears to do nothing.
--
--      Expect ZERO rows. Anything returned is a real bug: read the verdict
--      column, then fix PART 4 (policies) or PART 6B (grants) so the two agree.
--      ⚠️ VIEWS ARE EXCLUDED, AND THIS IS THE WHOLE POINT OF THE base_tables CTE.
--
--      A first run of this check returned four rows — SELECT on each public view,
--      reported as "grant without policy". That was a FALSE POSITIVE, and one
--      that could never clear itself: PostgreSQL's CREATE POLICY accepts only
--      tables, so a view can never appear in pg_policies. Every view carrying any
--      grant would be flagged, on every run, forever.
--
--      The premise does not apply rather than these four being exceptions, which
--      is why they are excluded BY CLASS and not by name. An allowlist of four
--      view names would need editing every time a view is added, and would
--      silently miss the fifth.
--
--      This matters more than a tidy result. A check that always shows rows you
--      have been told to ignore is a check nobody reads, and the day it shows a
--      real row it will be ignored too.
--
--      What replaces it for views is 10c-view below. Access to a definer view is
--      gated by the view's own definition and by who may SELECT it — not by
--      policies — so those are the two things worth asserting instead.
with base_tables as (
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname like 'gsb\_%'
     and c.relkind in ('r','p')          -- ordinary + partitioned TABLES only
),
granted as (
  select g.table_name, g.privilege_type as verb
    from information_schema.role_table_grants g
    join base_tables b on b.relname = g.table_name
   where g.grantee = 'authenticated' and g.table_schema = 'public'
     and g.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
),
policied as (
  select tablename as table_name, cmd
    from pg_policies
   where schemaname = 'public' and tablename like 'gsb\_%'
)
select 'grant without policy' as verdict, g.table_name, g.verb
  from granted g
 where not exists (
   select 1 from policied p
    where p.table_name = g.table_name and p.cmd in ('ALL', g.verb)
 )
union all
select 'policy without grant', p.table_name, p.cmd
  from policied p
 where p.cmd <> 'ALL'
   and not exists (
     select 1 from granted g
      where g.table_name = p.table_name and g.verb = p.cmd
   )
 order by 1, 2, 3;

-- 10c-view. WHAT ACTUALLY GUARDS A VIEW, since 10c-bis correctly ignores them.
--
--      A view has no policies. For these four, access control is exactly two
--      things, and both are asserted here or nearby:
--
--        1. WHO MAY SELECT IT   — checked by 10c (anon must hold SELECT and
--                                 nothing else; the views are auto-updatable, so
--                                 a stray write grant is a live write path).
--        2. THE VIEW DEFINITION — the WHERE clauses are the security boundary.
--                                 10h asserts each still joins gsb_tenants,
--                                 10i that no private column leaked, 10j/10k
--                                 that the address guard works.
--
--      This check covers the third thing, which nothing else does:
--      security_invoker MUST remain false.
--
--      ⚠️ IF IT WERE EVER FLIPPED TO TRUE, the view would execute with the
--      CALLER's rights. anon holds no grant and no policy on the base tables, so
--      every view would return ZERO ROWS — with no error, to anyone. Storefronts
--      would go silently blank, and any availability read would report an empty
--      registry, which reads as "every city is free". That is the false-green
--      failure this whole file is built to avoid, and it would arrive looking
--      like a quiet afternoon rather than an outage.
--
--      EXPECT: four rows, every verdict 'ok'.
select
  case coalesce((
         select o.option_value
           from pg_options_to_table(c.reloptions) o
          where o.option_name = 'security_invoker'
       ), 'false')
    when 'false' then 'ok — definer view; its definition is the boundary'
    else '*** security_invoker is ON — anon gets ZERO rows, silently ***'
  end as verdict,
  c.relname as view_name,
  coalesce(array_to_string(c.reloptions, ', '), '(defaults)') as options
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'v'
   and c.relname like 'gsb\_public\_%'
 order by verdict desc, c.relname;

-- 10c-fn. The same default-privilege mechanism that granted anon ALL on the
--      views also makes every function executable by anon unless revoked.
--
--      EXPECT: exactly one row — gsb_check_cities, which the availability
--      checker on the landing page calls with the publishable key. Anything else
--      reading 'UNEXPECTED' is reachable from a browser and should not be,
--      most seriously gsb_admin_set_tenant_active (releases territories) and
--      gsb_cleanup_stale_intake (deletes records).
select
  case when p.proname = 'gsb_check_cities'
    then 'expected — the public availability checker'
    else '*** UNEXPECTED — anon must not execute this ***'
  end as verdict,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname like 'gsb\_%'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
 order by verdict desc, p.proname;

-- 10d. NO STORAGE **WRITE** MAY BE GATED ON A BUCKET NAME ALONE. Expect ZERO rows.
--
--      Checks qual AND with_check: an INSERT policy carries its predicate in
--      with_check with qual NULL, so a wide-open upload policy is invisible to a
--      qual-only filter. That exact blind spot let a cross-tenant delete hole
--      survive a "verified" migration on EstateSaleBiz for two days.
--
--      Zero tolerance, no exceptions list, deliberately. A write policy scoped
--      only to a bucket lets any self-registered account — signup is open —
--      write into and delete from every operator's folder.
select 'UNSCOPED STORAGE WRITE' as problem, policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and cmd in ('INSERT','UPDATE','DELETE','ALL')
   and coalesce(qual,'') || coalesce(with_check,'') like '%gsb-%'
   and coalesce(qual,'') || coalesce(with_check,'') not like '%foldername%'
   and coalesce(qual,'') || coalesce(with_check,'') not like '%gsb_is_tenant%';

-- 10d-bis. STORAGE READS — one bare policy is EXPECTED. Named here rather than
--      quietly excluded from 10d, because narrowing a security check until it
--      passes is how a real hole gets classified as noise.
--
--      "gsb public read tenant logos" is gated on bucket_id alone, on purpose:
--
--        • Operator logos appear on public storefronts, so they must be readable
--          by everyone. There is no owner to scope a READ to.
--        • The bucket is PUBLIC, and public-bucket reads never consult RLS at
--          all. This policy is therefore DECORATIVE — adding a foldername test
--          would satisfy the regex in 10d and change nothing whatsoever about
--          who can fetch a logo. That is theatre, and it is not done here.
--        • It is SELECT only. No INSERT, UPDATE or DELETE policy exists on the
--          logos bucket at any scope; only service_role writes there, and
--          service_role bypasses RLS. So the bare predicate grants no write.
--
--      KNOWN LIMITATION, recorded rather than hidden: because the bucket is
--      public, a DEACTIVATED operator's logo stays fetchable by direct URL. Their
--      storefront goes dark — the tenant row and all four views gate on
--      is_active — but the image file itself does not. EstateSaleBiz carried the
--      identical gap as an open item. The real fix is a private bucket plus
--      signed URLs in the storefront, which is a change to the read path and not
--      to this policy. Not worth doing for a logo; worth knowing.
--
--      EXPECT: exactly one row, and it must be the logos SELECT policy.
select
  case
    when policyname = 'gsb public read tenant logos' and cmd = 'SELECT'
      then 'expected — public logos, see 10d-bis'
    else '*** UNEXPECTED bare read policy — investigate ***'
  end as verdict,
  policyname, cmd, qual
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and cmd = 'SELECT'
   and coalesce(qual,'') like '%gsb-%'
   and coalesce(qual,'') not like '%foldername%'
   and coalesce(qual,'') not like '%gsb_is_tenant%'
 order by verdict desc;

-- 10e. Exactly one policy per verb on the photo bucket. More than one means an
--      older set survived and is OR'ing access back open.
select 'sale-photos policy count' as check, cmd, count(*)
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and coalesce(qual,'') || coalesce(with_check,'') like '%gsb-sale-photos%'
 group by cmd order by cmd;

-- 10f. The replay guard is present. Expect EXACTLY ONE row, never zero.
select 'session guard' as check, conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.gsb_client_users'::regclass
   and contype = 'u'
   and pg_get_constraintdef(oid) ilike '%(stripe_session_id)%';

-- 10g. Normalisation collapses the variants that would otherwise be distinct
--      cities, and does NOT over-collapse genuinely different ones.
--      Every row must read true.
select 'comma spacing'  as case, gsb_norm_city('Boise,ID')      = gsb_norm_city('Boise, ID')       as ok
union all select 'saint',        gsb_norm_city('St. Louis, MO')  = gsb_norm_city('Saint Louis, MO')
union all select 'fort',         gsb_norm_city('Ft Worth, TX')   = gsb_norm_city('Fort Worth, TX')
union all select 'fort period',  gsb_norm_city('Ft. Worth, TX')  = gsb_norm_city('Fort Worth, TX')
union all select 'mount',        gsb_norm_city('Mt. Vernon, NY') = gsb_norm_city('Mount Vernon, NY')
union all select 'direction',    gsb_norm_city('N Las Vegas, NV')= gsb_norm_city('North Las Vegas, NV')
union all select 'whitespace',   gsb_norm_city('  Boise ,  ID ') = gsb_norm_city('Boise, ID')
union all select 'not equal 1',  gsb_norm_city('Portland, OR')  <> gsb_norm_city('Portland, ME')
union all select 'not equal 2',  gsb_norm_city('Springfield, IL')<> gsb_norm_city('Springfield, MO')
union all select 'state intact', gsb_norm_city('Boise, ID')      = 'boise, id'
 order by 1;

-- 10h. The four public views exist, and each sale/item/photo view consults
--      gsb_tenants. Expect has_tenants = true on the three data views.
select 'views' as check,
       table_name,
       (pg_get_viewdef(('public.' || table_name)::regclass) ilike '%gsb_tenants%') as has_tenants
  from information_schema.views
 where table_schema = 'public' and table_name like 'gsb\_public\_%'
 order by table_name;

-- 10i. Columns that must NEVER be publicly readable, under any condition.
--      Expect ZERO rows. min_price is the operator's walk-away floor; the other
--      three are their commission rate and their client's identity.
select 'LEAKED private column' as problem, table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and table_name like 'gsb\_public\_%'
   and column_name in ('min_price','commission_pct','client_name','crm_client_id','storage_path')
 order by table_name;

-- 10j. The address is CONDITIONAL, not unconditional. This asserts the view
--      actually carries the show_address guard rather than selecting the column
--      raw — the difference between "the homeowner's choice is honoured" and
--      "the homeowner's choice is decoration". Expect guarded = true.
select 'address guard' as check,
       (pg_get_viewdef('public.gsb_public_sales'::regclass) ilike '%show_address%'
        and pg_get_viewdef('public.gsb_public_sales'::regclass) ilike '%case%') as guarded;

-- 10k. BEHAVIOURAL version of the same assertion — the check that matters.
--      Flips the demo sale to private, reads the view, flips it back. 10j proves
--      what is DECLARED; this proves what is RETURNED.
--
--      No transaction wrapper, deliberately: this file must contain no BEGIN or
--      ROLLBACK (see the header). The two UPDATEs are their own undo, and the
--      value being toggled is seed data on the demo tenant, so a failure between
--      them is harmless and self-evident from the result.
update gsb_sales set show_address = false where client_id = 'demo';
select 'address hidden when show_address=false' as check,
       count(*) filter (where street_address is not null) as leaked_rows,
       count(*)                                          as rows_checked
  from gsb_public_sales where client_id = 'demo';
-- leaked_rows MUST be 0. Any other value means the guard is not working and the
-- view is publishing an address the homeowner asked us to withhold.
update gsb_sales set show_address = true where client_id = 'demo';
select 'address restored' as check,
       count(*) filter (where street_address is not null) as visible_rows
  from gsb_public_sales where client_id = 'demo';
-- visible_rows MUST be 1. A zero here means the view never shows an address at
-- all, which would make every operator's site useless — the opposite failure,
-- and easy to miss if only the hidden case were tested.

-- 10l. The demo tenant holds NO city claim, so its cities stay sellable.
--      Expect ZERO rows. A demo that quietly consumed three real territories
--      would be a slow, invisible loss of inventory.
select 'demo must not claim cities' as problem, city_norm, city_label
  from gsb_city_claims where client_id = 'demo';

-- 10m. Seed landed.
select 'seed' as check, 'tenants' as what, count(*)::text as n from gsb_tenants
union all select 'seed', 'sales',    count(*)::text from gsb_sales
union all select 'seed', 'items',    count(*)::text from gsb_items
union all select 'seed', 'settings', count(*)::text from gsb_settings;

-- 10n. Retention cleanup. The function must exist; the schedule is optional.
--      A 'not scheduled' result is NOT a failure — it means pg_cron is not
--      enabled, and the only consequence is that you run
--        select gsb_cleanup_stale_intake();
--      by hand every month or so. Nothing else depends on it.
--      NOTE: this query deliberately does NOT read cron.job. That table lives in
--      the cron schema, which does not exist when pg_cron is disabled — and an
--      unresolvable table reference fails at PARSE time, before any CASE branch
--      can guard it, taking the whole paste down with it. to_regclass() answers
--      the same question by name and returns null instead of raising.
select 'cleanup function' as check,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proname = 'gsb_cleanup_stale_intake' and n.nspname = 'public')::text as fn_exists,
       case
         when not exists (select 1 from pg_extension where extname = 'pg_cron')
           then 'pg_cron not enabled — run gsb_cleanup_stale_intake() by hand. Not a failure.'
         when to_regclass('cron.job') is null
           then 'pg_cron present but cron.job unreadable — run the function by hand'
         else 'pg_cron enabled — confirm with: select jobname, schedule from cron.job;'
       end as schedule_state;

-- 10o. THE ASSERTION BEHIND THE NO-RESERVATION DESIGN, proven rather than assumed:
--      a checkout that has not been paid holds NO city.
--
--      If this ever returns a row, the separation this architecture depends on has
--      broken — something is writing a claim before payment, and a buyer who
--      abandons Stripe would be silently holding a territory nobody can buy and
--      nothing expires. Expect ZERO rows, including while someone is mid-checkout.
select 'unpaid checkout is holding a city' as problem,
       i.id, i.company, i.status, c.city_label, c.slug
  from gsb_intake i
  join gsb_city_claims c on c.slug = i.subdomain_pref
 where i.status = 'awaiting_payment'
   and not exists (                       -- ignore a slug legitimately reused by
     select 1 from gsb_client_users cu    -- an operator who HAS paid
      where cu.stripe_session_id = i.stripe_session_id
   );

-- 10p. Am I admin? Returns false until PART 9 is done — that is expected on a
--      first run, and is the last thing to fix before admin-owner.html works.
select 'am I admin?' as check, gsb_is_admin() as result;

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Next: PART 9 (your owner account), then LAUNCH-CHECKLIST.md.
-- ═══════════════════════════════════════════════════════════════════════════
