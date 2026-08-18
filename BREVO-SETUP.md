# Brevo setup — GarageSaleBiz

**Time: about 5 minutes.** This is the shortest of the three setup documents, because the
DNS work is already done and there are no templates to build.

---

## 1. The sender is already verified — no new DNS

GarageSaleBiz sends from **`info@kingdom-creatives.com`**, which is already a verified sender
on the Kingdom Creatives Brevo account with SPF, DKIM, and DMARC in place on
`kingdom-creatives.com`.

**You do not need to add a single DNS record for GarageSaleBiz.**

Email authentication is validated against the **sending domain**, not the website domain.
Because every message goes out as `info@kingdom-creatives.com`, the existing
`kingdom-creatives.com` records authenticate it — regardless of the fact that the site lives on
`garagesalebiz.com`.

### Confirm it before you rely on it

Brevo → **Senders, Domains & Dedicated IPs** → **Domains**. `kingdom-creatives.com` should show
green ticks for **SPF**, **DKIM**, and **DMARC**. If any is amber or red, fix that first —
nothing below matters if the domain is failing authentication.

### Do not add garagesalebiz.com as a sending domain

It would need its own SPF, DKIM, and DMARC records, and it buys nothing: no mail is ever sent
`from` that domain. `SUPPORT_EMAIL` in `api/_shared.js` is the single place the sending address
is defined, and it is `info@kingdom-creatives.com`.

**Nowhere in this project sends from, or references, a Gmail address.** If you find one,
it is a bug.

---

## 2. Create an API key

1. Brevo → click your account name (top right) → **SMTP & API**
2. **API keys** tab → **Generate a new API key**
3. Name it `garagesalebiz-production` — so that if you ever have to revoke a key, you know
   which product stops working.
4. Copy the key. It starts **`xkeysib-`**.

**Copy it now.** Brevo shows it once and there is no way to read it back; you would have to
generate a replacement.

### Env var

Vercel → your project → **Settings** → **Environment Variables**:

| Name | Value |
|---|---|
| `BREVO_API_KEY` | `xkeysib-…` |

Tick **Production**, **Preview**, and **Development**, then **redeploy** — Vercel only picks up
env vars at build time.

Server-side only. It must never appear in an HTML file, in `assets/`, or in a commit.

### If it is not set

Every send is skipped with `Brevo not configured — skipping send:` in the logs, and
**nothing else breaks.** Purchases still provision, territories are still claimed, and the
dashboard still works — the buyer simply gets no welcome email and you get no owner
notification. That is deliberate: mail is best-effort throughout, and a mail outage must never
cost someone the account they just paid for.

It does mean an unset key fails quietly. Check the logs after your first test purchase.

---

## 3. No templates to build — the email lives in the repo

**Decision: every email is sent via the Brevo API with inline HTML. There are no Brevo
templates and no template IDs.** Stated explicitly because it is a real choice with
trade-offs.

**Why:**

- **The copy is version-controlled.** The welcome email sits in
  `api/stripe-webhook.js` (`sendWelcomeEmail`), next to the code that decides when to send it.
  It cannot drift out of step with the product, and a change to it shows up in a diff.
- **Setup is one API key.** No template to build, no numeric ID to copy into an env var, no
  second place to remember when the price changes.
- **Nothing breaks silently.** EstateSaleBiz sent its welcome mail via `templateId` from
  `BREVO_TEMPLATE_ID`. If that variable was unset or pointed at a deleted template, the send
  failed after the buyer had already paid — and the template's copy lived only inside Brevo,
  where nothing tracked it and no diff would ever show it changing.

**The trade-off:** you cannot edit the wording from the Brevo UI. Changing an email means
editing `api/stripe-webhook.js` and deploying. For four emails on a product this size, that is
the better side of the trade.

### What gets sent

| Email | To | When |
|---|---|---|
| **Welcome** | the new operator | On `checkout.session.completed`, after the territory is claimed. Carries their cities, their web address, how to sign in, and the three things to do first. |
| **New operator** | `info@kingdom-creatives.com` | Same moment. Business, contact, territory, slug, amount, session id. |
| **⚠️ PAID BUT BLOCKED** | `info@kingdom-creatives.com` | Someone paid and the territory could not be given. **This one means money has to move.** |
| **Refund processed** | `info@kingdom-creatives.com` | A full refund released a territory, or a partial refund did not. |

Every send is `await`ed rather than fired and forgotten. A serverless function can be torn down
the moment it returns a response, which would drop an in-flight send — and the blocked-purchase
alert is the one message that must not be lost.

All four have a plain-text part as well as HTML. Text-only clients get a readable message
instead of an empty one, and it helps deliverability.

---

## 4. ⚠️ Click tracking and auth links

**If you ever point Supabase Auth at Brevo's SMTP, turn click tracking OFF for that
stream.**

Brevo's click tracking rewrites every link in an email to route through its own tracking
domain. Supabase password-reset and email-confirmation links carry a token hash in the URL, and
the rewrite **mangles it** — the operator clicks the link and gets *"invalid or expired token"*,
every time, with nothing in any log to explain it.

This cost real debugging time on YourLife CC. It looks like a Supabase problem and it is not.

### Where this project stands today

The four emails above are **transactional API sends** and carry no auth tokens, so click
tracking cannot break them. The one auth email that exists — the password reset from
`/dashboard.html` — is sent by **Supabase's own default mail service**, not through Brevo,
so it is unaffected as configured.

### If you change that

The moment you set Brevo as a custom SMTP provider in Supabase → **Project Settings** →
**Authentication** → **SMTP Settings**:

1. Brevo → **Campaigns** → **Settings** → **Tracking** → turn **click tracking OFF** for the
   transactional stream.
2. Send yourself a password reset and **click the link**. Do not assume — check.
3. If Brevo will not let you disable click tracking on the stream you need, use **Resend** for
   Supabase auth mail instead. It does not rewrite links by default, its free tier is ample for
   this volume, and it is the documented fallback for exactly this problem. Keep Brevo for the
   four transactional sends above.

Supabase's default mailer has a low hourly rate limit, so it is fine at this volume and will
need replacing if signups ever come in bursts. When that day arrives, re-read this section
before wiring anything up.

---

## 5. Test it

After a test purchase (STRIPE-SETUP.md §7):

- ▢ The welcome email arrived at the buyer's address. **Check spam** — a brand-new sending
  pattern often lands there once before providers settle.
- ▢ The "New operator" email arrived at `info@kingdom-creatives.com`.
- ▢ The welcome email shows the **correct three cities** and the **correct subdomain**, and
  that subdomain link actually loads the operator's site.
- ▢ It says the $249 was **one-time with no monthly fee** — that has to match
  `operator-agreement.html` §8 and the acceptance text.
- ▢ Vercel → **Logs** shows `Brevo sent:` for both, not `Brevo not configured`.
- ▢ Open the email on a phone. The layout is table-based and should hold up; if it does not,
  that is a code fix, not a Brevo setting.

### If nothing arrives

1. **Vercel logs first.** `Brevo not configured` means the env var is missing or you have not
   redeployed since adding it. `Brevo send failed: 401` means the key is wrong.
2. **Brevo → Transactional → Logs.** If the send is listed there, Brevo accepted it and the
   problem is delivery, not the code. The log shows delivered / soft-bounced / blocked.
3. **Check the sender.** A `400` mentioning the sender means
   `info@kingdom-creatives.com` is not verified on the account you generated the key from.

---

## What is deliberately not built

- **No marketing list.** Buying a territory adds nobody to a mailing list. `privacy.html` §8
  says so, so building one would make that page untrue.
- **No drip sequence.** No onboarding series, no re-engagement mail. Transactional only.
- **No unsubscribe link on transactional mail.** Correct: these are the emails that make an
  account work. The one email that *is* optional — the waitlist notification — needs an
  unsubscribe link if you ever start sending it, and there is currently no code that does.

Questions: **info@kingdom-creatives.com**
