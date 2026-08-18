// ═══════════════════════════════════════════════════════════════════════════
// api/_shared.js — helpers used by every GarageSaleBiz server endpoint.
//
// Files under /api whose name starts with "_" are not routed by Vercel, so this
// is importable but never reachable as a URL.
//
// EVERYTHING HERE RUNS WITH THE SERVICE ROLE. gsb_tenants, gsb_client_users,
// gsb_city_claims, gsb_acceptances and gsb_billing have no insert policy for
// anon or authenticated — only service_role, which bypasses RLS, may write them.
// That is deliberate: it means an operator cannot self-provision, cannot claim a
// city, and cannot fabricate an acceptance record, no matter what they send.
//
// The caller's identity ALWAYS comes from their own JWT, never from the request
// body, so a request can only ever act on the account that sent it.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';

// ── ENVIRONMENT ─────────────────────────────────────────────────────────────
export const SUPABASE_URL       = process.env.SUPABASE_URL || '';
export const SERVICE_ROLE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const STRIPE_SECRET_KEY  = process.env.STRIPE_SECRET_KEY || '';
export const STRIPE_PRICE_ID    = process.env.STRIPE_PRICE_ID || '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
export const BREVO_API_KEY      = process.env.BREVO_API_KEY || '';
export const SITE_URL           = (process.env.PUBLIC_SITE_URL || 'https://garagesalebiz.com').replace(/\/+$/, '');

// Floor for a legitimate purchase, in cents. Sits below the $249 list price so a
// future promo code still provisions, and far above zero so a $0 or trivially
// cheap session cannot. Overridable by env so a price change needs no redeploy.
export const MIN_AMOUNT_CENTS = Number(process.env.STRIPE_MIN_AMOUNT_CENTS || '20000');

export const SUPPORT_EMAIL = 'info@kingdom-creatives.com';
export const APEX          = 'garagesalebiz.com';

// Slugs that must never be handed to an operator: they are pages, demo data, or
// reserved infrastructure labels. A buyer typing "admin" as their subdomain
// preference would otherwise get admin.garagesalebiz.com.
export const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'app', 'demo', 'mail', 'ftp', 'blog', 'help', 'support',
  'status', 'staging', 'dev', 'test', 'assets', 'static', 'cdn', 'dashboard',
  'account', 'billing', 'login', 'signup', 'intake', 'course', 'signs',
  'contracts', 'terms', 'privacy', 'owner', 'kingdom', 'garagesalebiz',
]);

// ── SUPABASE ────────────────────────────────────────────────────────────────
export function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured');
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── HTTP ────────────────────────────────────────────────────────────────────
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function preflight() {
  return new Response('ok', { headers: CORS_HEADERS });
}

// Every payment rejection returns 402 with the same recovery instruction, so a
// real buyer who trips a check always knows exactly what to do next — and is
// told plainly that they will not be charged twice.
export function paymentRequired(reason, detail) {
  console.warn('payment gate rejected:', reason, detail || '');
  return json({
    ok: false,
    error: 'payment_unverified',
    reason,
    message:
      "We couldn't verify a completed purchase for this link. " +
      `If you've already paid, email ${SUPPORT_EMAIL} and we'll finish setting up your ` +
      "account right away — you won't be charged twice.",
  }, 402);
}

// ── IDENTITY ────────────────────────────────────────────────────────────────
// Resolves the bearer token to a user via the Auth admin API. Returns
// { user } or { fail: Response }.
export async function userFromRequest(admin, request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { fail: json({ ok: false, error: 'missing_token' }, 401) };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { fail: json({ ok: false, error: 'invalid_session' }, 401) };
  return { user: data.user };
}

// ── CITY NORMALISATION ──────────────────────────────────────────────────────
// ⚠️ THIS IS A UX LAYER, NOT THE GUARANTEE. Do not "fix" it thinking otherwise.
//
// The authority is the BEFORE INSERT/UPDATE trigger gsb_city_claims_norm_tg,
// which overwrites city_norm with gsb_norm_city(city_label) on every write
// (SETUP.sql PART 2.2). Whatever this function returns, the stored key is
// whatever the database computes — so this can never corrupt data.
//
// What it CAN do is make a pre-check disagree with the trigger. If it drifts, a
// taken city briefly reads "available" and the atomic insert still rejects it
// with a conflict that is recorded and alerted. Bad UX, never bad data.
//
// It must nonetheless mirror gsb_norm_city EXACTLY — same operations, same
// order: lowercase → collapse whitespace → canonical comma spacing → strip
// periods → expand abbreviations → collapse → trim. Postgres \m…\M and
// JavaScript \b are equivalent word boundaries for these inputs.
//
// THE OTHER COPIES ARE IN index.html AND intake.html. Change one, change all
// three, and re-run assertion 10g in SETUP.sql.
export function normCity(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\./g, '')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bft\b/g, 'fort')
    .replace(/\bmt\b/g, 'mount')
    .replace(/\bn\b/g, 'north')
    .replace(/\bs\b/g, 'south')
    .replace(/\be\b/g, 'east')
    .replace(/\bw\b/g, 'west')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── ACCEPTANCE ──────────────────────────────────────────────────────────────
// Canonical text, SERVER-SIDE. The client sends only a version string; the text
// recorded is OURS, never theirs. A client-supplied string would record whatever
// the buyer chose to send, which is evidence of nothing.
//
// MUST MIRROR intake.html's acceptance box EXACTLY for the version it names.
//
// A MAP, not a single constant, deliberately. When the wording changes, ADD the
// new version alongside the old and retire the old only once no cached browser
// can still hold it. Replacing in place rejects buyers mid-flow — and on this
// flow the acceptance is validated at checkout creation, so a rejection there
// happens BEFORE payment. That is the whole reason territory selection moved
// ahead of Stripe: the expensive failures all became cheap ones.
export const ACCEPTANCE_TEXTS = {
  'v1-2026-08-18': [
    'You have read the Operator Agreement, Terms of Service, and Privacy Policy, and have had the opportunity to have your own attorney or accountant review them.',
    'No one has guaranteed or projected any income, revenue, profit, or number of clients — in any medium, at any time. You may lose money operating this business.',
    'This is not a franchise and not a business opportunity. You receive no license to our brand, you pay no royalty and no franchise fee, and we exercise no control over how you operate.',
    'We do not provide you with clients, leads, or sale locations.',
    'You are responsible for the legality of every sale you run, including any permit or sign ordinance your city applies to garage and yard sales.',
    'You accept full responsibility for the operation, legality, and results of your business.',
    'Your $249 purchase is ONE TIME. There is no monthly fee, no renewal, and no recurring charge of any kind. We do not keep your card on file, and we will never bill you again for this territory.',
    'Your territory is the three cities you selected. It is exclusive to you for as long as your account remains active, and no other operator can buy those cities.',
    'I have read and agree to the documents above, and I confirm each of these points.',
  ].join('\n'),
};

// The documents in force for each version, recorded alongside the text so a
// later edit to operator-agreement.html cannot silently change what a past buyer
// appears to have agreed to.
export const ACCEPTANCE_DOCS = {
  'v1-2026-08-18': {
    operator_agreement: 'operator-agreement.html',
    terms: 'terms.html',
    privacy: 'privacy.html',
    agreement_revision: '2026-08-18 — initial release. §8 states a single one-time fee with no recurring charge and no stored card.',
    pricing_revision: '2026-08-18 — $249 one-time for a three-city exclusive territory.',
  },
};

export const CURRENT_ACCEPTANCE_VERSION = 'v1-2026-08-18';

// ── STRIPE ──────────────────────────────────────────────────────────────────
// Retrieve a Checkout Session and decide whether it represents a real,
// completed, correctly-priced, UNREFUNDED one-time purchase. Returns
// { session } or { fail: Response }.
//
// This is the single gate every provisioning and confirmation path goes through.
export async function verifyStripeSession(sessionId) {
  if (!STRIPE_SECRET_KEY) {
    // Misconfiguration, not the buyer's fault — fail closed and shout in logs.
    console.error('STRIPE_SECRET_KEY is not set; refusing to treat anything as paid.');
    return { fail: paymentRequired('stripe_not_configured') };
  }

  let res;
  try {
    // No expand[]: every field checked below is on the session itself.
    // Expanding line_items would drag in Price objects a narrowly restricted key
    // may not be allowed to read, and a 403 there would block every buyer.
    res = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
    );
  } catch (e) {
    console.error('Stripe fetch failed:', e);
    return { fail: paymentRequired('stripe_unreachable') };
  }

  if (!res.ok) {
    // 404 = no such session: fabricated, or from a different Stripe account.
    const body = await res.text().catch(() => '');
    return { fail: paymentRequired('session_not_found', `http ${res.status} ${body.slice(0, 200)}`) };
  }

  const session = await res.json();

  // One-time purchases only. Rejects by SHAPE rather than by maintaining a list
  // of price ids that could drift out of sync with Stripe.
  if (session.mode !== 'payment') {
    return { fail: paymentRequired('not_one_time_payment', `mode=${session.mode}`) };
  }
  // Rejects unpaid, expired, and 100%-off 'no_payment_required' sessions.
  if (session.payment_status !== 'paid') {
    return { fail: paymentRequired('not_paid', `payment_status=${session.payment_status}`) };
  }
  if (typeof session.amount_total !== 'number' || session.amount_total < MIN_AMOUNT_CENTS) {
    return { fail: paymentRequired('amount_too_low', `amount_total=${session.amount_total}`) };
  }
  if (session.currency && String(session.currency).toLowerCase() !== 'usd') {
    return { fail: paymentRequired('unexpected_currency', `currency=${session.currency}`) };
  }

  // ── REFUND GATE ──────────────────────────────────────────────────────────
  // STRIPE DOES NOT CHANGE payment_status WHEN A PAYMENT IS REFUNDED. A fully
  // refunded session still reads 'paid', so the check above passes it. Without
  // this block a refunded session provisions a territory, and the only thing
  // stopping it being redeemed a second time is the UNIQUE constraint on
  // gsb_client_users.stripe_session_id — which was never meant to be the refund
  // defence; it just happened to be load-bearing.
  //
  // Refund state is not on the Checkout Session: it carries no `refunded`,
  // `amount_refunded`, or `refunds` field. It lives on the Charge, which hangs
  // off the PaymentIntent. Hence the second call.
  const piId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  if (!piId) {
    // mode === 'payment' should always carry a PaymentIntent, so this is
    // anomalous. Fail closed: absence of evidence that a payment was refunded is
    // not evidence that it was not.
    return { fail: paymentRequired('no_payment_intent', `session=${sessionId}`) };
  }

  let piRes;
  try {
    // expand[]=latest_charge returns the Charge inline, so refund state arrives
    // in ONE extra call rather than two.
    //
    // PERMISSIONS: a restricted key must carry PaymentIntents: Read AND
    // Charges: Read. This gate fails closed, so a 403 here rejects EVERY buyer
    // rather than only refunded ones. Use a full secret key unless you have a
    // reason not to.
    piRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piId)}?expand[]=latest_charge`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
    );
  } catch (e) {
    console.error('Stripe payment_intent fetch failed:', e);
    return { fail: paymentRequired('stripe_pi_unreachable') };
  }
  if (!piRes.ok) {
    const body = await piRes.text().catch(() => '');
    console.error('Stripe payment_intent read failed:', piRes.status, body.slice(0, 200));
    return { fail: paymentRequired('stripe_pi_unreachable', `http ${piRes.status}`) };
  }
  const pi = await piRes.json();

  // TWO SHAPES, deliberately. No Stripe-Version header is sent, so the response
  // follows the ACCOUNT'S default API version, which is not knowable from this
  // repo:
  //   modern -> pi.latest_charge, expanded into an object by the request above
  //   legacy -> pi.charges.data[0]  (the `charges` array was removed in a major
  //             release and does not exist on current versions)
  // Reading only pi.charges.data[0] throws a TypeError on a modern account,
  // which would surface as a 500 and block every buyer, not merely refunded ones.
  const charge = (pi.latest_charge && typeof pi.latest_charge === 'object')
    ? pi.latest_charge
    : (pi.charges?.data?.[0] ?? null);

  if (!charge) {
    return { fail: paymentRequired('no_charge_on_payment_intent', `pi=${piId} status=${pi.status}`) };
  }
  if (charge.refunded === true) {
    return { fail: paymentRequired('payment_refunded', `pi=${piId} charge=${charge.id}`) };
  }
  // Belt and braces: a PARTIAL refund leaves refunded=false while
  // amount_refunded is non-zero. A partially refunded purchase must not
  // provision either — someone refunded $200 of $249 would otherwise keep a
  // full territory.
  if (typeof charge.amount_refunded === 'number' && charge.amount_refunded > 0) {
    return {
      fail: paymentRequired('payment_refunded',
        `pi=${piId} charge=${charge.id} partial amount_refunded=${charge.amount_refunded}`),
    };
  }

  console.log('verified purchase:', sessionId,
    'amount=', session.amount_total,
    'refund_status=', `refunded=${charge.refunded} amount_refunded=${charge.amount_refunded ?? 0}`);

  return { session, charge };
}

// Stripe's API is form-encoded, including nested keys like
// metadata[intake_id] and line_items[0][price]. Written out rather than pulled
// from the SDK: every Stripe call in this project is a plain fetch, so there is
// no SDK version to keep in step with the API version and nothing to install.
export function stripeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') stripeForm(item, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === 'object') {
      stripeForm(v, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

export async function stripePost(path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stripeForm(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `stripe ${res.status}`;
    const err = new Error(msg);
    err.stripeStatus = res.status;
    err.stripeCode = data?.error?.code;
    throw err;
  }
  return data;
}

// ── STRIPE WEBHOOK SIGNATURE ────────────────────────────────────────────────
// Verifies the Stripe-Signature header against the RAW request body.
//
// THE RAW BODY IS NOT OPTIONAL AND NOT INTERCHANGEABLE WITH THE PARSED ONE.
// The signature is computed over the exact bytes Stripe sent; re-serialising a
// parsed object reorders keys and changes whitespace, so JSON.stringify(req.body)
// fails verification every time. The handler therefore reads request.text()
// before touching the payload.
//
// WITHOUT THIS CHECK the webhook endpoint is an unauthenticated public URL that
// provisions territories. Anyone who guessed it could POST a fabricated
// checkout.session.completed and mint themselves an operator account. The
// endpoint re-verifies the session against the Stripe API afterwards, which is a
// second independent gate — but this is the first, and it is the cheap one.
export async function verifyStripeSignature(rawBody, sigHeader, secret, toleranceSeconds = 300) {
  if (!secret) { console.error('STRIPE_WEBHOOK_SECRET is not set'); return { ok: false, reason: 'no_secret' }; }
  if (!sigHeader) return { ok: false, reason: 'no_signature_header' };

  let timestamp = null;
  const v1s = [];
  for (const part of String(sigHeader).split(',')) {
    const [k, val] = part.split('=', 2).map(x => (x || '').trim());
    if (k === 't') timestamp = val;
    else if (k === 'v1') v1s.push(val);
  }
  if (!timestamp || v1s.length === 0) return { ok: false, reason: 'malformed_signature_header' };

  // Replay window. Without it a signature captured once stays valid forever, so
  // a single intercepted delivery could be replayed indefinitely.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    return { ok: false, reason: `timestamp_outside_tolerance (${age}s)` };
  }

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time compare against each supplied v1. Stripe sends more than one
  // during a secret rotation, so all candidates must be tried.
  const matched = v1s.some(sig => timingSafeEqualHex(sig, expected));
  return matched ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}

// Length-independent, branch-free comparison. A plain === on a secret-derived
// string leaks timing information about how many leading characters matched.
function timingSafeEqualHex(a, b) {
  const A = String(a || ''), B = String(b || '');
  if (A.length !== B.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return diff === 0;
}

// ── BREVO ───────────────────────────────────────────────────────────────────
// Every send here is BEST-EFFORT and never throws. A mail failure must not turn
// a successful purchase into an error the buyer sees, and must not turn a
// conflict into a generic 500 that hides which city blocked them.
export async function sendBrevo({ to, toName, subject, html, text }) {
  if (!BREVO_API_KEY) { console.log('Brevo not configured — skipping send:', subject); return false; }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'GarageSaleBiz', email: SUPPORT_EMAIL },
        replyTo: { email: SUPPORT_EMAIL, name: 'GarageSaleBiz Support' },
        to: [{ email: to, ...(toName ? { name: toName } : {}) }],
        subject,
        ...(html ? { htmlContent: html } : {}),
        ...(text ? { textContent: text } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Brevo send failed:', res.status, body.slice(0, 300));
      return false;
    }
    console.log('Brevo sent:', subject, '→', to);
    return true;
  } catch (e) {
    console.error('Brevo send threw:', e);
    return false;
  }
}

export function ownerAlert(subject, lines) {
  return sendBrevo({
    to: SUPPORT_EMAIL,
    subject,
    text: Array.isArray(lines) ? lines.join('\n') : String(lines),
  });
}

// ── ESCAPING ────────────────────────────────────────────────────────────────
// Used when operator- or buyer-supplied text goes into an HTML email body.
export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
