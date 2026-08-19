// ═══════════════════════════════════════════════════════════════════════════
// POST /api/create-checkout
//
// Called by intake.html after the operator has signed up, chosen their three
// cities, and ticked the acceptance box. Validates everything that can be
// validated, parks the submission in gsb_intake, and returns a Stripe Checkout
// URL for the browser to redirect to.
//
// WHY THIS ENDPOINT EXISTS AT ALL — a plain Stripe payment link would be simpler
// and is what EstateSaleBiz used. It also meant the buyer chose their cities
// AFTER paying, which is the direct cause of every paid-but-blocked operator
// there: four commits, a dedicated table, and an alert email exist purely to
// survive that ordering.
//
// Here, every rejection that used to happen after payment happens before it:
//   • city already claimed        → they pick another, having spent nothing
//   • stale page / unknown terms  → they reload, having spent nothing
//   • reserved or taken subdomain → they pick another, having spent nothing
//   • already owns a territory    → told plainly, not double-charged
//
// ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
// IT DOES NOT RESERVE ANYTHING. No city claim and no tenant row is written here;
// both happen in the webhook, on payment. The availability check below is a
// read, and two people can pass it for the same city and both proceed to pay.
//
// That is a deliberate choice over a real reservation system, which would need a
// hold table, an expiry, a sweeper for holds whose expiry never ran, and a
// decision about what a second buyer sees for a city that is neither free nor
// sold. The residual race is handled at the atomic claim in the webhook and is
// recorded and alerted when it fires.
//
// The window is NOT "a few seconds" — it is however long the buyer spends on
// Stripe's page, bounded by CHECKOUT_TTL_SECONDS. What changed versus
// EstateSaleBiz is not that the race is gone but that the COMMON case is free:
// a city that was already sold when someone starts is caught here, before money
// moves, instead of after.
//
// THE BROWSER NEVER WRITES TO gsb_intake DIRECTLY. This endpoint does, with the
// service role, which is why gsb_intake needs no anon insert policy and the
// public write surface of the whole database stays at one table.
// ═══════════════════════════════════════════════════════════════════════════

import {
  adminClient, json, preflight, userFromRequest,
  normCity, slugify, stripePost,
  ACCEPTANCE_TEXTS, RESERVED_SLUGS, SITE_URL, STRIPE_PRICE_ID, STRIPE_SECRET_KEY,
  SUPPORT_EMAIL, APEX,
} from './_shared.js';

export const config = { runtime: 'nodejs' };

const MAX_CITIES = 3;
const LOGO_MAX_CHARS = 2 * 1024 * 1024 * 1.4; // ~2 MB of bytes as base64

// How long a Checkout Session stays payable. Stripe allows 30 minutes to 24
// hours and DEFAULTS TO 24 HOURS, which is the wrong default for this product.
//
// NOTHING IS RESERVED WHILE SOMEONE IS IN CHECKOUT — no city claim and no tenant
// row is written until the webhook fires. That is deliberate (a reservation
// system needs its own expiry, its own cleanup, and its own way of going wrong),
// but it means the availability check below and the atomic claim in the webhook
// are separated by however long the buyer spends on Stripe's page.
//
// At the default, that gap is up to a day: someone opens checkout, walks away,
// pays six hours later, and by then the city has been sold to somebody else —
// which lands them in exactly the paid-but-blocked path this ordering exists to
// avoid. Thirty minutes is the floor Stripe permits and caps the exposure.
//
// It also makes abandonment deterministic: an intake row still marked
// awaiting_payment more than an hour later can never be paid, which is what
// gsb_cleanup_stale_intake() relies on.
const CHECKOUT_TTL_SECONDS = 30 * 60;

export default { fetch: handler };

async function handler(request) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    console.error('Stripe is not configured: STRIPE_SECRET_KEY / STRIPE_PRICE_ID missing');
    return json({
      ok: false, error: 'not_configured',
      message: `Checkout isn't available right now. Email ${SUPPORT_EMAIL} and we'll set you up by hand.`,
    }, 503);
  }

  let admin;
  try { admin = adminClient(); }
  catch (e) {
    console.error(e);
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  // Identity from the JWT, never from the body. A caller can only ever create a
  // checkout for their own account.
  const who = await userFromRequest(admin, request);
  if ('fail' in who) return who.fail;
  const user = who.user;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'bad_json' }, 400); }

  const company     = String(body.company || '').trim();
  const firstName   = String(body.firstName || '').trim();
  const lastName    = String(body.lastName || '').trim();
  const phone       = String(body.phone || '').trim() || null;
  const tagline     = String(body.tagline || '').trim() || null;
  const color       = String(body.color || '#E8471F').trim().toLowerCase();
  const subPref     = String(body.subdomainPref || '').trim();
  const serviceArea = Array.isArray(body.serviceArea) ? body.serviceArea.map(s => String(s).trim()).filter(Boolean) : [];
  const claimCities = Array.isArray(body.claimCities) ? body.claimCities.map(s => String(s).trim()).filter(Boolean) : [];
  const acceptanceVersion = String(body.acceptanceVersion || '').trim();
  const acceptedAt  = String(body.acceptedAt || '').trim() || null;
  const logoDataUrl = typeof body.logoDataUrl === 'string' ? body.logoDataUrl : null;

  // ── FIELD VALIDATION ─────────────────────────────────────────────────────
  if (!company || !firstName || !lastName) {
    return json({ ok: false, error: 'missing_fields', message: 'Business name and your name are required.' }, 400);
  }
  if (claimCities.length === 0) {
    return json({ ok: false, error: 'no_cities', message: 'Choose at least one city for your territory.' }, 400);
  }
  // The 3-city cap is enforced HERE, where it is a guarantee. In the browser it
  // is only a render loop, and a crafted request could post thirty cities —
  // each one a finite, exclusive territory being claimed for a single $249.
  if (claimCities.length > MAX_CITIES) {
    return json({ ok: false, error: 'too_many_cities', message: `A territory covers up to ${MAX_CITIES} cities.` }, 400);
  }
  // Same rule as gsb_set_primary_color: 6-digit hex only, so whatever reaches
  // the column is safe to interpolate into a CSS custom property downstream.
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    return json({ ok: false, error: 'bad_color', message: 'Pick a colour from the swatches.' }, 400);
  }
  if (logoDataUrl && logoDataUrl.length > LOGO_MAX_CHARS) {
    return json({ ok: false, error: 'logo_too_large', message: 'That logo is over 2 MB — please use a smaller one.' }, 400);
  }

  // Acceptance is required, and an UNRECOGNISED version is rejected rather than
  // defaulted: recording the wrong text is worse than recording none. Because
  // this runs before checkout, a stale cached page costs the buyer a reload
  // instead of a support ticket about a payment that provisioned nothing.
  if (!acceptanceVersion || !ACCEPTANCE_TEXTS[acceptanceVersion]) {
    console.error('acceptance version unknown:', acceptanceVersion || '(none)',
      '— stale client, or intake.html and _shared.js have drifted');
    return json({
      ok: false, error: 'acceptance_required',
      message: 'This page is out of date. Reload it and tick the agreement box again — nothing has been charged.',
    }, 409);
  }

  // ── ALREADY AN OPERATOR? ─────────────────────────────────────────────────
  // Ahead of everything else so someone who already paid is never sent to
  // checkout a second time.
  const { data: existingMapping, error: mapReadErr } = await admin
    .from('gsb_client_users')
    .select('client_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (mapReadErr) {
    console.error('mapping read failed:', mapReadErr.message);
    return json({ ok: false, error: 'lookup_failed' }, 500);
  }
  if (existingMapping) {
    return json({
      ok: false, error: 'already_provisioned', client_id: existingMapping.client_id,
      message: 'This account already owns a territory. Sign in to your dashboard instead — you have not been charged again.',
    }, 409);
  }

  // ── CITY AVAILABILITY ────────────────────────────────────────────────────
  // A read-then-write, so NOT the guarantee — the primary key on
  // gsb_city_claims.city_norm is. This exists so the ordinary case gets a clear
  // message naming the city, before any money moves.
  //
  // Reads gsb_city_claims, never gsb_tenants.cities: those are two different
  // answers to one question and they diverge, because a released city is deleted
  // from the claims table while it may linger in a tenants array.
  const requestedNorms = claimCities.map(normCity);

  // Self-collision check. normCity is deliberately aggressive — "St. Louis" and
  // "Saint Louis" are one key — so a careful buyer listing both spellings would
  // otherwise pass here and then collide with THEMSELVES inside the atomic
  // insert, after paying. Caught before checkout instead.
  const seen = new Set();
  for (let i = 0; i < requestedNorms.length; i++) {
    if (seen.has(requestedNorms[i])) {
      return json({
        ok: false, error: 'duplicate_city', city: claimCities[i],
        message: `You've listed ${claimCities[i]} twice (we treat spellings like "St." and "Saint" as the same city). Pick three different cities.`,
      }, 400);
    }
    seen.add(requestedNorms[i]);
  }

  const { data: takenRows, error: takenErr } = await admin
    .from('gsb_city_claims')
    .select('city_norm, city_label')
    .in('city_norm', requestedNorms);
  if (takenErr) {
    // Fail CLOSED here, unlike the equivalent read in the webhook. The
    // asymmetry is intentional: at this point nobody has paid, so refusing
    // costs a retry. Failing open would send someone to checkout for a city we
    // could not confirm was free — trading a retry for a refund.
    console.error('availability read failed:', takenErr.message);
    return json({
      ok: false, error: 'availability_unavailable',
      message: "We couldn't confirm those cities are available just now. Try again in a moment — nothing has been charged.",
    }, 503);
  }

  if (takenRows && takenRows.length) {
    const takenNorms = new Set(takenRows.map(r => r.city_norm));
    const conflicts = claimCities.filter((_, i) => takenNorms.has(requestedNorms[i]));
    return json({
      ok: false, error: 'city_conflict', cities: conflicts,
      message: conflicts.length === 1
        ? `${conflicts[0]} is already taken — one operator per city. Choose another and you can carry on.`
        : `${conflicts.join(' and ')} are already taken — one operator per city. Choose others and you can carry on.`,
    }, 409);
  }

  // ── SUBDOMAIN ────────────────────────────────────────────────────────────
  // Resolved now so a buyer learns their URL before paying rather than being
  // silently renamed to something-2 afterwards.
  const wanted = slugify(subPref) || slugify(company) || 'operator';
  if (RESERVED_SLUGS.has(wanted)) {
    return json({
      ok: false, error: 'reserved_slug', slug: wanted,
      message: `"${wanted}" is reserved. Pick a different web address.`,
    }, 409);
  }
  let slug = wanted;
  for (let i = 2; i <= 50; i++) {
    const { data: clash } = await admin.from('gsb_tenants').select('id').eq('slug', slug).maybeSingle();
    if (!clash) break;
    slug = `${wanted}-${i}`;
  }

  // ── PARK THE SUBMISSION ──────────────────────────────────────────────────
  // Everything the webhook needs to provision, stored before the operator leaves
  // for Stripe. The webhook then needs nothing from the browser — which matters,
  // because the browser may never come back: a buyer who pays and closes the tab
  // still gets fully provisioned and still gets their welcome email.
  //
  // No password is stored, ever. The auth user already exists (intake.html
  // signed them up before calling this), so the webhook provisions against an
  // account that already has credentials.
  const { data: intake, error: intakeErr } = await admin
    .from('gsb_intake')
    .insert({
      user_id: user.id,
      email: user.email,
      first_name: firstName,
      last_name: lastName,
      phone,
      company,
      tagline,
      primary_color: color,
      subdomain_pref: slug,
      claim_cities: claimCities,
      service_area: serviceArea,
      logo_data_url: logoDataUrl,
      acceptance_version: acceptanceVersion,
      acceptance_claimed_at: acceptedAt,
      status: 'awaiting_payment',
    })
    .select('id')
    .single();
  if (intakeErr || !intake) {
    console.error('intake insert failed:', intakeErr?.message);
    return json({ ok: false, error: 'intake_failed' }, 500);
  }

  // ── STRIPE CHECKOUT SESSION ──────────────────────────────────────────────
  let session;
  try {
    session = await stripePost('checkout/sessions', {
      mode: 'payment',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} is substituted by Stripe on redirect. thank-you.html
      // needs it to confirm the purchase server-side.
      success_url: `${SITE_URL}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/intake.html?cancelled=1`,
      customer_email: user.email || undefined,
      client_reference_id: String(intake.id),
      // The webhook reads intake_id from here. Everything else in metadata is
      // for legibility in the Stripe dashboard when reconciling by hand — the
      // webhook trusts the gsb_intake row, not these strings.
      metadata: {
        intake_id: String(intake.id),
        user_id: user.id,
        cities: claimCities.join(' | ').slice(0, 480),
        slug,
        company: company.slice(0, 200),
      },
      payment_intent_data: {
        description: `GarageSaleBiz territory — ${claimCities.join(', ')}`.slice(0, 350),
      },
      allow_promotion_codes: true,
      // Caps the window between the availability check above and the atomic claim
      // in the webhook. See CHECKOUT_TTL_SECONDS.
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
    });
  } catch (e) {
    console.error('Stripe checkout session failed:', e.message, e.stripeCode || '');
    // The intake row is left behind on purpose rather than deleted. It is the
    // only record that someone got this far, and an abandoned row costs nothing;
    // a deleted one loses a lead who hit a Stripe outage.
    await admin.from('gsb_intake').update({ status: 'abandoned' }).eq('id', intake.id);
    return json({
      ok: false, error: 'checkout_failed',
      message: `We couldn't open checkout. Try again, or email ${SUPPORT_EMAIL} and we'll take it from here.`,
    }, 502);
  }

  await admin.from('gsb_intake').update({ stripe_session_id: session.id }).eq('id', intake.id);

  console.log('checkout created:', session.id, 'intake=', intake.id, 'slug=', slug, 'cities=', claimCities.join(', '));

  return json({
    ok: true,
    url: session.url,
    session_id: session.id,
    slug,
    subdomain: `${slug}.${APEX}`,
  });
}
