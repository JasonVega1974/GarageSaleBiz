# Launch checklist — GarageSaleBiz

Ordered. Each step assumes the ones above it are done. Nothing here can be usefully done out
of sequence, and two steps in particular (2 and 6) will waste an afternoon if taken early.

`▢` means unticked. Work down the page.

---

## 0 · Before you touch anything

- ▢ **Confirm the Supabase project.** Everything in this build targets
  **`jjocmvhqeiudcwtazbwi`** (`https://jjocmvhqeiudcwtazbwi.supabase.co`).
- ▢ ⚠️ **`cdckozujhrffobragmtm` is EstateSaleBiz production and is off-limits.** Look at the
  project ref in the Supabase URL bar before running SQL. Every object in `SETUP.sql` is
  prefixed `gsb_` so it would not collide with `esb_*` tables — but it would still create
  fifteen tables, two storage buckets, and six functions inside a live production database.
- ▢ The repo is pushed to GitHub and you can see the commit you intend to deploy.

---

## 1 · Run the schema

- ▢ Supabase → **SQL Editor** → **New query** → paste **all** of `SETUP.sql` → **Run**.
- ▢ It runs top to bottom in one pass with no errors. It is idempotent, so a re-run is a
  no-op — if something fails halfway, fix it and run the whole file again rather than the
  remainder.

### Read the verification output. Do not skip this.

`SETUP.sql` ends with fourteen checks. The Supabase editor shows only the **last** result set of
a batch, so scroll the results panel or re-run individual checks. These five are the ones that
matter:

- ▢ **10a** — fifteen `gsb_` tables, every one `rls_enabled = true`.
- ▢ **10c** — **seven rows, every verdict `ok`.** Three base grants
  (`gsb_settings` SELECT, `gsb_tenants` SELECT, `gsb_waitlist` INSERT) plus SELECT on each of
  the four public views. **Any row reading `*** UNEXPECTED ***` is a live hole.**
  Each row labels itself, so this cannot be passed by miscounting — which matters, because an
  earlier version of this check said "expect exactly three" and a first run returned **31**.
- ▢ **10c-ter** — informational. `is_updatable = YES` on the views is expected and is not a
  problem in itself; it is why 10c has to be clean. These views are writable *in principle*,
  so the only thing closing that path is the absence of an anon write grant.
- ▢ **10c-view** — **four rows, every verdict `ok`.** Asserts `security_invoker` is still
  `false` on all four public views. If one were ever flipped to `true` the view would run with
  the *caller's* rights, and since anon holds no grant on the base tables every view would
  return **zero rows to everyone, with no error** — storefronts silently blank, and any
  availability read reporting an empty registry, which reads as "every city is free".
- ▢ **10c-fn** — **exactly one row**, `gsb_check_cities`. Anything else is a function reachable
  from a browser that should not be.
- ▢ **10c-bis** — **zero rows.** Any row is a grant/policy mismatch: a grant with no policy
  returns empty results that look like "no data", and a policy with no grant returns
  "permission denied" for a policy that is actually correct.
  **Views are excluded by class**, and deliberately not by an allowlist: `CREATE POLICY` only
  accepts tables, so a view can never appear in `pg_policies` and would be flagged on every run
  forever. An earlier version did exactly that and returned four permanent false positives.
  Coverage for views moved to **10c-view** rather than being dropped.
- ▢ **10d** — **zero rows.** No storage *write* gated on a bucket name alone. This is the check
  whose absence let a cross-tenant photo-delete hole survive a "verified" migration on ESB for
  two days.
- ▢ **10d-bis** — **exactly one row**, and it must read *expected* — the public logos SELECT
  policy. It is bare on purpose: logos display on public storefronts so there is no owner to
  scope a read to, the bucket is public so RLS is never consulted for reads anyway, and no
  write policy exists on that bucket at any scope.
- ▢ **10g** — every row `true`. City normalisation collapses `St.`/`Saint` and `Ft`/`Fort`
  while keeping Portland OR and Portland ME distinct.
- ▢ **10k** — `leaked_rows = 0` then `visible_rows = 1`. The address guard hides an address
  when asked to and shows one otherwise. **Both halves matter** — a view that never shows an
  address would make every operator's site useless, and only the second query catches that.
- ▢ **10o** — **zero rows.** No unpaid checkout is holding a city. This is the assertion the
  whole no-reservation design rests on: selecting cities reserves nothing, so an abandoned
  checkout cannot leave a territory locked with nobody owning it. A row here means something
  is writing a claim before payment.

### Optional: the retention sweeper

`SETUP.sql` PART 2.7 creates `gsb_cleanup_stale_intake()`, which marks dead checkouts
abandoned, drops their uploaded logo within about two hours, and deletes the lead record after
90 days — the periods `privacy.html` §9 now commits to.

- ▢ Read check **10n**. If it says *pg_cron not enabled*, **that is not a failure** — the file
  never tries to install the extension, because `create extension` can fail in ways this file
  cannot fix and a retention sweeper is not worth breaking the zero-error paste for.
- ▢ Either enable **Database → Extensions → pg_cron** and re-run `SETUP.sql` (it will schedule
  itself), **or** put a monthly reminder in your calendar to run:
  ```sql
  select gsb_cleanup_stale_intake();
  ```
- ▢ Whichever you choose, run it once now and read the returned counts.

**Nothing depends on this having run.** No territory is held by an abandoned checkout, so
skipping it costs you clutter in the Pipeline tab and an undischarged retention promise — not
a locked city.

### Dashboard clicks SQL cannot do

- ▢ **Authentication → Providers → Email** — enabled, and **"Confirm email" OFF.**
  `intake.html` signs the operator up and needs a session back immediately to reach checkout.
  With confirmation on, `signUp()` returns no session and the purchase flow dead-ends after
  they have filled in everything.
- ▢ **Authentication → URL Configuration** — Site URL `https://garagesalebiz.com`; redirect
  URLs include `https://garagesalebiz.com/**` and `https://*.garagesalebiz.com/**`.
- ▢ **Storage** → confirm `gsb-sale-photos` and `gsb-tenant-logos` both exist and are
  **public**. `SETUP.sql` PART 7 creates them; this is just confirming.

### Your owner account

- ▢ **Authentication → Users → Add user** → `info@kingdom-creatives.com`, strong password,
  auto-confirm.
- ▢ Copy the UID and run (`SETUP.sql` PART 9):

  ```sql
  insert into gsb_client_users (user_id, client_id, display_name, role)
  values ('<YOUR-AUTH-UID>', '__owner__', 'Jason Vega', 'admin')
  on conflict (user_id) do update set role = 'admin', client_id = '__owner__';
  ```

- ▢ `select gsb_is_admin();` returns **true**.

---

## 2 · Stripe product and keys

Follow **STRIPE-SETUP.md** §1–§2. Stay in **Test mode**.

- ▢ Product created, price **$249**, billing period **One time**. Not recurring — a recurring
  price makes `mode` come back as `subscription` and **every** purchase is refused after the
  customer has paid.
- ▢ `STRIPE_PRICE_ID` copied — the `price_…` one, not `prod_…`.
- ▢ `STRIPE_SECRET_KEY` copied (full secret key, not restricted).

**Leave the webhook for step 5.** Stripe will not accept an endpoint that does not respond
yet, so it has to come after the first deploy.

---

## 3 · Brevo key

Follow **BREVO-SETUP.md** §1–§2. Five minutes.

- ▢ `kingdom-creatives.com` shows green SPF / DKIM / DMARC in Brevo. **No new DNS records are
  needed** — authentication follows the sending domain, and every message goes out as
  `info@kingdom-creatives.com`.
- ▢ `BREVO_API_KEY` generated and copied (`xkeysib-…`).

---

## 4 · Vercel env vars, then deploy

### ⚠️ First: regenerate the lockfile

`package.json` changed — Express is gone, and `@supabase/supabase-js` and `@vercel/functions`
are in. `package-lock.json` still describes the old dependency tree, and **Vercel installs from
the lockfile**, so a build will fail with a lockfile-mismatch error before it runs a line of
code.

- ▢ ```bash
  npm install
  ```
- ▢ Commit the regenerated `package-lock.json` along with everything else.

Both dependencies are genuinely required: `middleware.js` imports `@vercel/functions`, and
`api/_shared.js` imports `@supabase/supabase-js`. Nothing else is needed — every Stripe call is
a plain `fetch`, so there is no `stripe` package to keep in step with an API version.

### Then the environment variables

Vercel → project → **Settings** → **Environment Variables**. All seven, ticked for
**Production**, **Preview**, and **Development**:

- ▢ `SUPABASE_URL` = `https://jjocmvhqeiudcwtazbwi.supabase.co`
- ▢ `SUPABASE_SERVICE_ROLE_KEY` = the `service_role` key (Supabase → Settings → API)
- ▢ `STRIPE_SECRET_KEY`
- ▢ `STRIPE_PRICE_ID`
- ▢ `STRIPE_WEBHOOK_SECRET` — **placeholder for now**, real value in step 5
- ▢ `BREVO_API_KEY`
- ▢ `PUBLIC_SITE_URL` = `https://garagesalebiz.com`

- ▢ **Deploy.**
- ▢ ⚠️ **Vercel applies env vars at build time only.** Every time you add or change one from
  here on, **redeploy** or it has no effect. This is the single most common cause of "I set the
  variable and nothing changed".

### Sanity check the deploy

- ▢ `https://<your-vercel-url>/` loads the landing page.
- ▢ ```
  curl -i -X POST https://<your-vercel-url>/api/stripe-webhook
  ```
  returns **400**. That is correct — the endpoint is alive and refused a call with no valid
  Stripe signature. A **404** means the function did not deploy; a **500** means it deployed
  but cannot reach Supabase, so recheck the two Supabase vars.

---

## 5 · Stripe webhook

Now that the endpoint responds. **STRIPE-SETUP.md** §4.

- ▢ Endpoint URL exactly `https://garagesalebiz.com/api/stripe-webhook`, no trailing slash.
- ▢ Exactly two events: **`checkout.session.completed`** and **`charge.refunded`**.
- ▢ Signing secret (`whsec_…`) copied into `STRIPE_WEBHOOK_SECRET` in Vercel.
- ▢ **Redeployed.**

Without the correct secret the endpoint refuses **every** request rather than skipping the
check, and no purchase provisions. That is deliberate — an unverified webhook that creates
territories is worse than a broken one.

---

## 6 · Domain and wildcard subdomain

### ⚠️ Do this before your first real purchase, and expect the wildcard to be fiddly

Wildcard domain configuration was flaky on EstateSaleBiz. Budget more time than you think, and
**verify it with a real subdomain rather than assuming Vercel's green tick means it works.**

- ▢ Vercel → project → **Settings** → **Domains** → add `garagesalebiz.com`.
- ▢ Add `www.garagesalebiz.com` and let Vercel redirect it to the apex.
- ▢ Add the wildcard: **`*.garagesalebiz.com`**

### The wildcard is the part that bites

- **It needs its own DNS record.** A wildcard certificate is not implied by the apex record —
  add a separate `CNAME` for `*` pointing at Vercel, or use Vercel's nameservers and let it
  manage the zone (simpler, and the recommended route if you can move nameservers).
- **Verification can take up to an hour.** Amber is normal at first. If it is still amber after
  an hour, the DNS record is wrong — do not wait longer.
- **A wildcard cert covers exactly one level.** `boise.garagesalebiz.com` is covered;
  `north.boise.garagesalebiz.com` is not. Slugs are single-label, so this is fine — but it is
  why a nested test would fail confusingly.
- **The apex and the wildcard are separate certificates.** One can be issued while the other is
  not, and the site looks half-working: the funnel loads and every operator subdomain shows a
  TLS warning.

### Verify with a real request, not a green tick

- ▢ `https://garagesalebiz.com` → the funnel.
- ▢ `https://www.garagesalebiz.com` → redirects to the apex, **does not** show a storefront.
  (`middleware.js` excludes `www` explicitly, in JS rather than in the matcher, because
  Vercel's RE2 matcher has no lookahead.)
- ▢ `https://anything.garagesalebiz.com` → the explicit **"This site isn't here"** page,
  over **valid HTTPS with no certificate warning.**

That last one is the real test. It proves three separate things at once: the wildcard
certificate is live, `middleware.js` is routing subdomains to the storefront, and the
no-silent-fallback rule holds — an unknown subdomain gets an honest error rather than the
funnel or the demo.

- ▢ `https://demo.garagesalebiz.com` → the demo operator's site loads with a live sale on it.

---

## 7 · Full test purchase in test mode

Work **STRIPE-SETUP.md §7** end to end. Do not shorten it. Every box, including the failure
paths — those are the ones that matter, and the refunded-session check in particular is the ESB
vulnerability that needs confirming with your own eyes rather than trusting the code.

- ▢ The happy path completes and the operator site is live.
- ▢ All eight failure-path checks pass.
- ▢ Test data cleaned up, test cities available again.

---

## 8 · Go live

- ▢ **STRIPE-SETUP.md §8**, all seven steps. Recreate the product **and** the webhook in live
  mode — test-mode objects do not exist in live mode, and **the live signing secret is
  different.** Forgetting that is the most common cause of "it all worked in test".
- ▢ Update `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` in Vercel.
- ▢ **Redeploy.**
- ▢ **Buy a territory with your own card**, on a city you are content to hold. Walk the whole
  flow as a stranger would.
- ▢ Refund yourself. Confirm the operator goes inactive, the cities are released, and the site
  goes dark.
- ▢ Only now send anyone else to the site.

---

## 9 · Post-launch behavioural verification

Declarative checks prove what is **declared**. These prove what is **permitted**, and they are
not optional — EstateSaleBiz twice recorded a migration as verified on the strength of a query
that was structurally incapable of returning the row it claimed was absent.

Set `KEY` to your publishable key first:

```bash
KEY='sb_publishable_YRrK-5dWr2WNVx2hlGBOzg_099CagJH'
URL='https://jjocmvhqeiudcwtazbwi.supabase.co/rest/v1'
```

### Anon must not reach private data — every one of these must return an error or `[]`

```bash
# Revenue. MUST NOT return rows.
curl -s "$URL/gsb_billing?select=*"            -H "apikey: $KEY"
# Buyer contact details and amounts owed. MUST NOT return rows.
curl -s "$URL/gsb_blocked_purchases?select=*"  -H "apikey: $KEY"
# Agreement evidence. MUST NOT return rows.
curl -s "$URL/gsb_acceptances?select=*"        -H "apikey: $KEY"
# Operators' clients — third-party personal data. MUST NOT return rows.
curl -s "$URL/gsb_clients?select=*"            -H "apikey: $KEY"
# Base sale table — the public path is the VIEW, not this.
curl -s "$URL/gsb_sales?select=*"              -H "apikey: $KEY"
# The customer list. MUST NOT return rows (the public view hides slug/client_id).
curl -s "$URL/gsb_city_claims?select=*"        -H "apikey: $KEY"
```

- ▢ All six return `permission denied`, an empty array, or an RLS error. **A row is a leak.**

### Anon must reach exactly what it needs

```bash
curl -s "$URL/gsb_settings?select=key,value"                   -H "apikey: $KEY"
curl -s "$URL/gsb_tenants?select=slug,business_name"           -H "apikey: $KEY"
curl -s "$URL/gsb_public_city_claims?select=*"                 -H "apikey: $KEY"
curl -s "$URL/gsb_public_sales?select=*"                       -H "apikey: $KEY"
```

- ▢ All four return data.
- ▢ `gsb_public_city_claims` contains **no** `client_id` and **no** `slug`.
- ▢ `gsb_public_sales` contains **no** `min_price`, `commission_pct`, or `client_name`.

### The private-column check that is easy to get wrong

- ▢ In the dashboard, add an item with an asking price **and** a private floor.
- ▢ ```bash
  curl -s "$URL/gsb_public_items?select=*" -H "apikey: $KEY" | grep -i min_price
  ```
  **No match.** The floor is absent from the payload entirely, not merely hidden by the page.
- ▢ Untick **"Show the full address on my public site"** on a published sale, then:
  ```bash
  curl -s "$URL/gsb_public_sales?select=street_address" -H "apikey: $KEY"
  ```
  `street_address` comes back **null**. Tick it again and it returns.

### Cross-tenant isolation

The one worth doing properly, because it needs two real accounts.

- ▢ Create a second operator (a second test purchase, or a hand-provisioned row).
- ▢ Sign in as operator A. In the browser console:
  ```js
  await GSB.supa.from('gsb_sales').select('*').eq('client_id', '<OPERATOR-B-CLIENT-ID>')
  ```
  → **zero rows.** Repeat for `gsb_items`, `gsb_clients`, `gsb_contracts`.
- ▢ Still as A, try to write into B's photo folder:
  ```js
  await GSB.supa.storage.from('gsb-sale-photos')
    .upload('<OPERATOR-B-CLIENT-ID>/1/forged.jpg', new Blob(['x']))
  ```
  → **rejected.** A success here is a live incident: signup is open, so any self-registered
  account could then write into, and delete from, any operator's photos.
- ▢ As A, attempt a colour change on B:
  ```js
  await GSB.supa.from('gsb_tenants').update({ primary_color: '#000000' }).eq('slug', '<B-SLUG>')
  ```
  → **zero rows** (there is no UPDATE policy on `gsb_tenants` for anyone).

---

## 10 · The first week

- ▢ **Stripe → Webhooks**, every day for a week. Every delivery **200**. A `200` with
  `"provisioned": false` is the one to open — the payment was fine and something specific
  stopped provisioning.
- ▢ **`/admin-owner.html`** daily. The **Blocked** tab badge should stay at zero; each entry is
  a real person owed money.
- ▢ **Vercel → Logs** — search `BLOCKED PURCHASE`, `ACCEPTANCE INSERT FAILED`,
  `BILLING WRITE FAILED`. All three are logged loudly and none of them stops a purchase, so
  the log is where they surface.
- ▢ Confirm the availability checker on `/` reports every sold city as taken.
- ▢ Open one operator's site on a phone.

### The reconciliation query — run it weekly

Finds money that arrived with no operator behind it:

```sql
select b.stripe_session_id, b.created_at, b.amount_paid_cents, b.customer_email,
       case
         when bp.id is not null then 'blocked on a city conflict — refund or reassign'
         when b.refunded_at is not null then 'refunded'
         else 'PAID, NOT PROVISIONED — investigate'
       end as status
  from gsb_billing b
  left join gsb_client_users cu on cu.stripe_session_id = b.stripe_session_id
  left join gsb_blocked_purchases bp on bp.stripe_session_id = b.stripe_session_id
 where cu.user_id is null
 order by b.created_at desc;
```

- ▢ Zero rows, or every row explained. `PAID, NOT PROVISIONED` means somebody is waiting on
  you and does not know it.

### And the inverse — operators with no payment

```sql
select t.slug, t.business_name, t.created_at
  from gsb_tenants t
  left join gsb_billing b on b.slug = t.slug
 where b.stripe_session_id is null
   and t.client_id <> 'demo'
 order by t.created_at desc;
```

- ▢ Zero rows, other than any operator you provisioned by hand.

---

## Deliberately not done

Stated so nobody spends an afternoon looking for it:

- **No custom domains for operators.** Subdomains only. ESB's version needed a database lookup
  on every root request to an unrecognised host, in the routing hot path, with a fail-open
  branch. Not worth it until an operator actually asks.
- **No sitemap for operator subdomains.** Enumerating every paying operator in one public file
  would publish the customer list — the same reason `gsb_public_city_claims` drops `slug`.
- **No analytics beyond Vercel's page counts.** `privacy.html` §7 says there are no tracking
  cookies; adding any means updating that page first.
- **No additional-city purchase flow.** Handled by email on purpose, so a fourth city is a
  conversation rather than an upsell.
- **No refund automation.** Refunds are issued by hand in Stripe. The `charge.refunded` webhook
  then releases the territory automatically — the money is manual, the consequences are not.

---

Questions, or something on this list does not behave as described:
**info@kingdom-creatives.com**
