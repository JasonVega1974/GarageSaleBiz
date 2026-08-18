# Stripe setup — GarageSaleBiz

Everything you have to click in Stripe, in order, plus the env vars each step produces.

**Do the whole thing in Test mode first.** Section 7 is the test checklist and section 8 is
the switch to live. There is a toggle at the top of the Stripe dashboard labelled **Test
mode** — leave it ON until section 8.

**Time:** about 20 minutes, plus one test purchase.

---

## What the code expects

Three env vars come out of this document, and one more comes from Supabase:

| Env var | From | Used by |
|---|---|---|
| `STRIPE_SECRET_KEY` | §2 | verifying every session, creating checkouts |
| `STRIPE_PRICE_ID` | §1 | the line item on the checkout |
| `STRIPE_WEBHOOK_SECRET` | §4 | proving a webhook call really came from Stripe |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, not here | writing the operator rows |

All four go into Vercel (§5). Nothing in this document goes into a page, a client-side file,
or anywhere under `assets/`.

---

## 1. Create the product and price

1. Stripe dashboard → **Product catalogue** → **Add product**
2. Fill in:
   - **Name:** `GarageSaleBiz Territory — 3 Cities`
   - **Description:** `Exclusive three-city operator territory. One-time payment, no recurring fee.`
   - **Image:** optional. It shows on the checkout page, so a decent one is worth 30 seconds.
3. Under **Pricing**:
   - **Pricing model:** `Standard pricing`
   - **Price:** `249.00`
   - **Currency:** `USD`
   - **Billing period:** ⚠️ **One time.** Not recurring.
4. **Save product**

### ⚠️ "One time" is not a cosmetic choice

`verifyStripeSession()` in `api/_shared.js` rejects any session whose `mode` is not
`payment`. A recurring price produces `mode: "subscription"`, so **every purchase would be
refused after the customer had paid.** It rejects by shape rather than by keeping a list of
price IDs in sync, which is the right trade — but it means this radio button decides whether
the product works at all.

It also has to match what the Operator Agreement says. §8 of that document states there is no
recurring charge of any kind, and the acceptance text every buyer confirms says the same. A
recurring price here would make both of those statements false about a real purchase.

### Copy the price ID

1. Click into the product you just created.
2. Under **Pricing**, find the price and copy its ID. It starts **`price_`** —
   for example `price_1QxAbCDeFgHiJkLm`.
3. That is `STRIPE_PRICE_ID`.

**Not the product ID.** Product IDs start `prod_`. The checkout line item needs the `price_`
one; a `prod_` value produces `No such price` on every attempted purchase.

---

## 2. Get your secret key

1. Stripe dashboard → **Developers** → **API keys**
2. Under **Standard keys**, find the **Secret key** and click **Reveal**.
3. Copy it. In test mode it starts `sk_test_`; live, `sk_live_`.
4. That is `STRIPE_SECRET_KEY`.

### Use a full secret key, not a restricted one

You can make this work with a restricted key, but it must carry **all** of:

- `Checkout Sessions` — **Read**
- `PaymentIntents` — **Read**
- `Charges` — **Read**

The last two are for the refund gate. Stripe does **not** change `payment_status` when a
payment is refunded — a fully refunded session still reads `paid` — so refund state has to be
read off the Charge behind the PaymentIntent. That gate **fails closed**: if the key cannot
read those objects, it returns a 403 and the code refuses to provision. It would reject
**every** buyer, not just refunded ones, and the error in the logs would look like a Stripe
outage rather than a permissions problem.

Use the full secret key unless you have a specific reason not to.

### Never

- Do not put this in any HTML file, in `assets/`, or in `middleware.js`.
- Do not commit it. `.env` and `.env*.local` are gitignored; keep it that way.
- The **publishable** key (`pk_`) is not used anywhere in this project. Checkout Sessions are
  created server-side and the browser only ever receives the redirect URL, so there is nothing
  for a publishable key to do.

---

## 3. Deploy before you create the webhook

The webhook endpoint has to exist and respond before Stripe will accept it. Push the repo to
Vercel and confirm the deployment is live, then come back.

You can check it is there with:

```
curl -i -X POST https://garagesalebiz.com/api/stripe-webhook
```

**A `400` is the correct answer.** It means the endpoint is running and rejected the call for
having no valid Stripe signature — which is exactly what should happen to anything that is not
Stripe. A `404` means the function did not deploy; a `500` means it deployed but cannot reach
Supabase, so check the env vars in §5.

---

## 4. Create the webhook endpoint

1. Stripe dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL** — exactly this:

   ```
   https://garagesalebiz.com/api/stripe-webhook
   ```

   No trailing slash. Use your real domain; if you are testing on a Vercel preview URL, use
   that host and remember to change it before going live.

3. **Listen to** → `Events on your account`
4. **Select events** — exactly two. Search for each and tick it:

   | Event | Why |
   |---|---|
   | `checkout.session.completed` | **The provisioning trigger.** Claims the cities, creates the operator, sends the welcome email. Without it, people pay and nothing happens. |
   | `charge.refunded` | Releases the territory back to the pool and takes the site offline. Without it, a refunded operator keeps three cities nobody else can ever buy. |

   **Do not select "all events".** Everything else is acknowledged and ignored, so extra
   events cost nothing in correctness — but they fill your webhook log and make a real failure
   harder to spot.

5. **Add endpoint**

### Copy the signing secret

1. Click into the endpoint you just created.
2. Find **Signing secret** → **Reveal**.
3. Copy it. It starts **`whsec_`**.
4. That is `STRIPE_WEBHOOK_SECRET`.

### ⚠️ Without this secret the endpoint is an open door

`/api/stripe-webhook` is a public URL that creates operator accounts and claims territories.
The signature check is what stops anyone who guesses the URL from POSTing a fabricated
`checkout.session.completed` and minting themselves a free territory.

If `STRIPE_WEBHOOK_SECRET` is not set, the code refuses **every** request rather than
skipping the check — the endpoint returns `400 no_secret` and no purchase provisions. That is
deliberate: an unverified webhook is worse than a broken one.

**Test mode and live mode have different signing secrets.** When you switch to live in §8 you
must create the endpoint again and copy the new secret. Forgetting this is the single most
common cause of "everything worked in test and nothing works live".

---

## 5. Set the env vars in Vercel

Vercel dashboard → your project → **Settings** → **Environment Variables**.

Add each one, ticking **Production**, **Preview**, and **Development**:

| Name | Value | Where it came from |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` → later `sk_live_…` | §2 |
| `STRIPE_PRICE_ID` | `price_…` | §1 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | §4 |
| `SUPABASE_URL` | `https://jjocmvhqeiudcwtazbwi.supabase.co` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | Supabase → Settings → API |
| `BREVO_API_KEY` | `xkeysib-…` | BREVO-SETUP.md |
| `PUBLIC_SITE_URL` | `https://garagesalebiz.com` | your domain |

Optional:

| Name | Default | When to change it |
|---|---|---|
| `STRIPE_MIN_AMOUNT_CENTS` | `20000` | If you change the price. It is a floor, set below $249 so a promo code still provisions, and far above zero so a $0 session cannot. |

### The service role key is the dangerous one

`SUPABASE_SERVICE_ROLE_KEY` bypasses every row-level security policy in the database. It is
the key that lets the webhook create operator rows and claim cities, which nothing else is
permitted to do.

- It belongs **only** in Vercel's environment variables.
- It must never appear in an HTML file, in `assets/`, in `middleware.js`, or in a commit.
- If it is ever exposed, rotate it in Supabase immediately (Settings → API → Reset) and
  update it here.

The key that **is** safe to ship is the publishable key already in `assets/gsb.js`. Its entire
reach is enumerated in `SETUP.sql` PART 5 and verification 10c: read settings and operator
branding, insert to the waitlist, read four public views. It cannot read a client list or a
cent of revenue.

**Redeploy after adding variables.** Vercel only applies them at build time — adding a
variable to an existing deployment changes nothing until you redeploy.

---

## 6. Confirm the two documents still agree

Before taking a real payment, check that the price in Stripe matches the price in the words
buyers agree to. If you ever change it, **four** places need to change together:

1. The Stripe price (§1).
2. `ACCEPTANCE_TEXTS` in `api/_shared.js` — a **new version key** added alongside the old,
   never edited in place. A buyer with a cached page still sends the old version, and the
   server rejects a version it does not recognise.
3. `ACCEPTANCE_VERSION` in `intake.html`, bumped to the new key.
4. The visible copy: `index.html`, `intake.html`, `operator-agreement.html` §8, `terms.html`
   §6, and the welcome email in `api/stripe-webhook.js`.

EstateSaleBiz got this wrong in the other direction — its Operator Agreement described an
auto-renewing monthly fee while the text buyers actually confirmed said the opposite. Both
were live at once. Changing the price without updating the acceptance text produces the same
class of problem, and the acceptance record makes it permanent.

---

## 7. Test-mode checklist

Run every line. `▢` means unticked.

### Setup

- ▢ `SETUP.sql` has been run against **`jjocmvhqeiudcwtazbwi`** and its verification queries
  pass — in particular **10c** (seven rows, every verdict `ok`), **10c-fn** (one row),
  **10c-bis** (no grant/policy mismatch), and **10d** (no unscoped storage write).
- ▢ Your owner account exists and `select gsb_is_admin();` returns `true`.
- ▢ All seven env vars are set in Vercel and the project has been **redeployed** since.
- ▢ `curl -i -X POST https://garagesalebiz.com/api/stripe-webhook` returns **400**.

### The purchase

- ▢ Open `/` and use the availability checker on a city you know is free → **"is open"**.
- ▢ Check a city the demo operator names (Nampa, Caldwell, or Meridian, ID) → still
  **"is open"**. The demo must hold no claim; SETUP.sql check 10l asserts this.
- ▢ Go to `/intake.html`, fill in all three steps, tick the acceptance box.
- ▢ Press **Continue to payment** → Stripe Checkout opens showing **$249.00**.
- ▢ Pay with `4242 4242 4242 4242`, any future expiry, any CVC, any postcode.
- ▢ You land on `/thank-you.html?session_id=cs_test_…` and it shows **"Confirming your
  purchase…"**, then your three cities and your web address within a few seconds.

### The result

- ▢ Stripe → Webhooks → your endpoint → the `checkout.session.completed` delivery shows
  **200**.
- ▢ `https://<your-slug>.garagesalebiz.com` loads your new operator site.
- ▢ The welcome email arrived (check spam).
- ▢ Sign in at `/dashboard.html` → the dashboard opens with your business name and cities.
- ▢ Back on `/` the checker now reports your claimed city as **taken**.
- ▢ `/admin-owner.html` → the operator, the payment, and the acceptance record all appear.
- ▢ Open the acceptance record and read it. The text must be **exactly** what the intake page
  showed, with a SHA-256 and a server timestamp.

### The failure paths — these matter more than the happy one

- ▢ **Duplicate purchase.** With the same account still signed in, go to `/intake.html` and
  try again → `This account already owns a territory`, **no second charge**.
- ▢ **Taken city.** In a fresh browser, sign up with a new email and request the city you just
  claimed → blocked **before** checkout, with nothing charged.
- ▢ **Fake session.** Open `/thank-you.html?session_id=cs_test_nonsense` → *"We couldn't
  confirm a purchase"*, not a success page.
- ▢ **Refunded session.** In Stripe, refund the test payment in full. Then:
  - Reload the same `/thank-you.html?session_id=…` → it must now **refuse** the session.
    This is the ESB vulnerability; confirm it with your own eyes rather than trusting it.
  - The `charge.refunded` webhook fires and shows **200**.
  - `/admin-owner.html` shows the operator **inactive** and their cities **released**.
  - Check `/` — those cities are **available** again.
  - `https://<slug>.garagesalebiz.com` shows **"This site isn't here"**, not a live site.
- ▢ **Unknown subdomain.** Open `https://notanoperator.garagesalebiz.com` → the explicit
  "site isn't here" page. **Not the funnel, and not the demo.**
- ▢ **Webhook retry.** In Stripe, click **Resend** on the `checkout.session.completed` event →
  returns **200** and creates **no** second operator. The unique constraint on
  `stripe_session_id` is what guarantees this.

### Clean up

- ▢ In Supabase, delete the test operator: remove their `gsb_city_claims` rows, their
  `gsb_tenants` row, their `gsb_client_users` row, and the auth user. Leave
  `gsb_acceptances` and `gsb_billing` alone — those are records of what happened, and the
  billing row is what stops a test session being reused.
- ▢ Confirm the test cities read as available again on `/`.

---

## 8. Going live

Only after every box in §7 is ticked.

1. **Turn off Test mode** in the Stripe dashboard.
2. **Recreate the product and price in live mode.** Test-mode objects do not exist in live
   mode. Same name, same $249, same **one-time**. Copy the new `price_…`.
3. **Copy the live secret key** (`sk_live_…`).
4. **Create the webhook endpoint again in live mode** — same URL, same two events — and copy
   the new `whsec_…`. ⚠️ This is a different secret from the test one.
5. **Update all three vars in Vercel** and **redeploy**.
6. **Make one real purchase with your own card**, on a city you are willing to hold. Walk the
   whole flow. Then refund yourself and confirm the territory is released.
7. Only now send anyone else to the site.

### The one thing to check afterwards

Stripe → **Webhooks** → your live endpoint, once a week for the first month. Every delivery
should be **200**. A `400` means the signing secret is wrong. A `500` means Supabase was
unreachable and Stripe is retrying — it will keep trying for up to three days, so a payment is
not lost, but find out why.

A `200` with `"provisioned": false` in the response body is the one to look at closely: the
payment was fine and something specific stopped provisioning. `/admin-owner.html` will show
either a blocked purchase or a payment with no operator behind it, and both mean somebody is
waiting on you.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `No such price` | Used the `prod_` ID | Use the `price_` ID (§1) |
| Every purchase → *"couldn't verify"* | Price is recurring, not one-time | Recreate as one-time (§1) |
| Webhook 400 `invalid_signature` | Wrong `STRIPE_WEBHOOK_SECRET`, or test secret in live | Recopy from the right mode (§4) |
| Webhook 400 `no_secret` | `STRIPE_WEBHOOK_SECRET` not set | Add it and redeploy (§5) |
| Webhook 500 | Supabase unreachable, or `SUPABASE_SERVICE_ROLE_KEY` wrong | Check §5; Stripe retries for 3 days |
| Webhook 404 | Function did not deploy | Confirm `api/stripe-webhook.js` is committed |
| Paid, site never appeared | Webhook never fired | Check the URL in §4; Stripe → Webhooks shows attempts |
| thank-you spins then stalls | Webhook is failing | Read the webhook log; `/admin-owner.html` shows the payment |
| Every buyer gets 402 | Restricted key missing Charges/PaymentIntents read | Use a full secret key (§2) |
| Checkout opens at the wrong price | Stale `STRIPE_PRICE_ID` | Update and redeploy |

Anything not on this list: check the Vercel function logs first (Vercel → your project →
**Logs**), then the Stripe webhook log. The code logs loudly on every failure path, including
the ones it deliberately swallows.

Questions: **info@kingdom-creatives.com**
