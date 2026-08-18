// ═══════════════════════════════════════════════════════════════════════════
// POST /api/stripe-webhook
//
// The provisioning point. Stripe calls this; the browser never does.
//
// Events handled:
//   checkout.session.completed  → claim the territory and create the operator
//   charge.refunded             → release the territory back to the pool
//
// ── WHY THE WEBHOOK AND NOT THE BROWSER ─────────────────────────────────────
// EstateSaleBiz provisioned from the buyer's own browser after the redirect
// back from Stripe. That works right up until the buyer closes the tab, loses
// signal, or gets an ad blocker in the way — at which point they have paid and
// no account exists, and the only record is inside Stripe. Provisioning here
// means the outcome does not depend on the buyer's browser surviving the round
// trip.
//
// ── STATUS CODES ARE PART OF THE DESIGN ─────────────────────────────────────
// Stripe retries a non-2xx for up to three days with backoff. That is a feature
// for transient problems and a liability for permanent ones, so the two are
// separated deliberately:
//
//   400  bad or missing signature            — never retry, nothing to fix
//   500  database or network failure         — RETRY, the next attempt may work
//   200  city conflict / already provisioned — do NOT retry; a human is needed,
//                                              and the row recording that has
//                                              already been written
//
// Returning 500 on a city conflict would retry a permanent failure hundreds of
// times and bury the one alert that matters in noise.
// ═══════════════════════════════════════════════════════════════════════════

import {
  adminClient, json, normCity, verifyStripeSession, verifyStripeSignature,
  ACCEPTANCE_TEXTS, ACCEPTANCE_DOCS, sha256Hex, sendBrevo, ownerAlert, escHtml,
  STRIPE_WEBHOOK_SECRET, SUPPORT_EMAIL, APEX, SITE_URL,
} from './_shared.js';

export const config = { runtime: 'nodejs' };

const LOGO_BUCKET = 'gsb-tenant-logos';
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
// SVG is deliberately absent: it can carry <script>, and these files are served
// from the Supabase origin.
const LOGO_MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export default async function handler(request) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  // RAW BODY FIRST, before anything parses it. The signature is computed over
  // the exact bytes Stripe sent; re-serialising a parsed object reorders keys and
  // fails verification every time.
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature');

  const verdict = await verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  if (!verdict.ok) {
    // 400, not 500: a bad signature is never fixed by retrying. Logged loudly
    // because a sudden run of these means either the wrong signing secret is
    // deployed or someone is probing the endpoint.
    console.error('WEBHOOK SIGNATURE REJECTED:', verdict.reason);
    return json({ ok: false, error: 'invalid_signature', reason: verdict.reason }, 400);
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return json({ ok: false, error: 'bad_json' }, 400); }

  let admin;
  try { admin = adminClient(); }
  catch (e) {
    // 500 so Stripe retries — this is a deploy/config problem that may be fixed
    // within the retry window, and the payment must not be lost to it.
    console.error('webhook cannot reach Supabase:', e.message);
    return json({ ok: false, error: 'not_configured' }, 500);
  }

  console.log('webhook received:', event.type, event.id);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        return await provision(admin, event.data.object);
      case 'charge.refunded':
        return await handleRefund(admin, event.data.object);
      default:
        // Acknowledged and ignored. Returning 200 for unhandled types stops
        // Stripe retrying events this endpoint was never meant to act on.
        return json({ ok: true, ignored: event.type });
    }
  } catch (e) {
    // Anything unexpected gets a 500 so the delivery is retried rather than
    // silently dropped. An unhandled throw that returned 200 would lose a
    // payment permanently.
    console.error('webhook handler threw:', event.type, e);
    return json({ ok: false, error: 'handler_error' }, 500);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// PROVISION
// ═══════════════════════════════════════════════════════════════════════════
async function provision(admin, sessionObject) {
  const sessionId = sessionObject.id;

  // ── IDEMPOTENCY ─────────────────────────────────────────────────────────
  // Stripe may deliver the same event more than once, and does so routinely
  // after any 500. This read is the friendly path; the UNIQUE constraint on
  // gsb_client_users.stripe_session_id is the actual guarantee, and it catches
  // the race this read cannot.
  const { data: already, error: alreadyErr } = await admin
    .from('gsb_client_users')
    .select('client_id')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  if (alreadyErr) {
    console.error('idempotency read failed:', alreadyErr.message);
    return json({ ok: false, error: 'lookup_failed' }, 500);   // retry
  }
  if (already) {
    console.log('already provisioned, acknowledging duplicate delivery:', sessionId);
    return json({ ok: true, already_provisioned: true, client_id: already.client_id });
  }

  // ── RE-VERIFY AGAINST THE STRIPE API ────────────────────────────────────
  // The signature proves the payload came from Stripe. This proves the payment
  // is currently good: paid, one-time, correct currency, above the floor, and
  // NOT REFUNDED. The refund check matters even here — a delivery retried after
  // a 500, or replayed from the Stripe dashboard, can arrive after the charge
  // has been refunded, and payment_status still reads 'paid' when it has.
  const verified = await verifyStripeSession(sessionId);
  if ('fail' in verified) {
    // 200, not the 402 body's status: this is a permanent decision about this
    // session, so retrying cannot change it. Recorded in the log and left alone.
    console.error('webhook: session failed verification, refusing to provision:', sessionId);
    return json({ ok: true, provisioned: false, reason: 'verification_failed' });
  }
  const session = verified.session;

  // ── RECORD THE MONEY FIRST ──────────────────────────────────────────────
  // Before the tenant, before the claim, before anything that can fail. Money
  // arrived, and the row saying so must exist even if provisioning then breaks —
  // otherwise a failed provision leaves a payment visible only inside Stripe,
  // which is exactly the blind spot this design is built to avoid.
  //
  // Upserted rather than inserted so a retried delivery refreshes it instead of
  // failing on the primary key.
  const { error: billErr } = await admin.from('gsb_billing').upsert({
    stripe_session_id: sessionId,
    amount_paid_cents: session.amount_total,
    amount_subtotal_cents: session.amount_subtotal ?? null,
    amount_discount_cents: Number(session.total_details?.amount_discount ?? 0) || 0,
    currency: String(session.currency || 'usd').toLowerCase(),
    payment_intent_id: typeof session.payment_intent === 'string'
      ? session.payment_intent : (session.payment_intent?.id ?? null),
    customer_email: session.customer_details?.email ?? null,
  }, { onConflict: 'stripe_session_id' });
  if (billErr) {
    console.error('BILLING WRITE FAILED — retrying delivery:', sessionId, billErr.message);
    return json({ ok: false, error: 'billing_failed' }, 500);   // retry
  }

  // ── LOAD THE PARKED SUBMISSION ──────────────────────────────────────────
  const intakeId = sessionObject.metadata?.intake_id || sessionObject.client_reference_id;
  if (!intakeId) {
    // Cannot happen through /api/create-checkout. If it does, someone paid
    // through a link created outside this flow — real money with no submission
    // behind it, which needs a person, not a retry.
    console.error('NO INTAKE ID on session:', sessionId);
    await ownerAlert(`⚠️ PAID WITH NO SETUP FORM — ${session.customer_details?.email || 'unknown'}`, [
      'A payment completed but the Checkout Session carries no intake_id, so there is',
      'nothing to provision from. The money is recorded in gsb_billing.',
      '',
      `Stripe session: ${sessionId}`,
      `Amount:         $${((session.amount_total || 0) / 100).toFixed(2)}`,
      `Email:          ${session.customer_details?.email || '(none)'}`,
      '',
      'Most likely cause: a payment link used directly instead of the intake form.',
      'Action: contact them for their business details and provision by hand, or refund.',
    ]);
    return json({ ok: true, provisioned: false, reason: 'no_intake_id' });
  }

  const { data: intake, error: intakeErr } = await admin
    .from('gsb_intake').select('*').eq('id', intakeId).maybeSingle();
  if (intakeErr) {
    console.error('intake read failed:', intakeErr.message);
    return json({ ok: false, error: 'intake_read_failed' }, 500);   // retry
  }
  if (!intake) {
    console.error('intake row missing for id', intakeId, 'session', sessionId);
    await ownerAlert('⚠️ PAID BUT SETUP FORM MISSING', [
      `Stripe session ${sessionId} references intake id ${intakeId}, which does not exist.`,
      `Amount: $${((session.amount_total || 0) / 100).toFixed(2)}`,
      'Provision by hand or refund.',
    ]);
    return json({ ok: true, provisioned: false, reason: 'intake_missing' });
  }

  const claimCities = Array.isArray(intake.claim_cities) ? intake.claim_cities.filter(Boolean) : [];
  const slug = intake.subdomain_pref || 'operator';
  const clientId = slug;
  const contact = `${intake.first_name || ''} ${intake.last_name || ''}`.trim();

  if (!claimCities.length) {
    console.error('intake has no cities:', intakeId);
    return json({ ok: true, provisioned: false, reason: 'no_cities' });
  }

  // Best-effort. A logo is cosmetic and must never cost someone the account
  // they just paid for.
  const logoUrl = await uploadLogo(admin, slug, intake.logo_data_url);

  // ── TENANT ROW ──────────────────────────────────────────────────────────
  // The slug was de-duplicated at checkout time, but another operator may have
  // taken it in between, so a collision here is handled rather than assumed away.
  let finalSlug = slug;
  let finalClientId = clientId;
  {
    const { data: clash } = await admin.from('gsb_tenants').select('id').eq('slug', finalSlug).maybeSingle();
    if (clash) {
      for (let i = 2; i <= 60; i++) {
        const candidate = `${slug}-${i}`;
        const { data: c2 } = await admin.from('gsb_tenants').select('id').eq('slug', candidate).maybeSingle();
        if (!c2) { finalSlug = candidate; finalClientId = candidate; break; }
      }
      console.warn('slug taken between checkout and webhook; using', finalSlug);
    }
  }

  const { error: tenantErr } = await admin.from('gsb_tenants').insert({
    slug: finalSlug,
    client_id: finalClientId,
    business_name: intake.company,
    logo_url: logoUrl,
    phone: intake.phone,
    email: intake.email,
    service_area: (Array.isArray(intake.service_area) ? intake.service_area : []).join(', ') || claimCities.join(', '),
    cities: claimCities,
    primary_color: intake.primary_color || '#E8471F',
    about_text: intake.tagline,
    is_active: true,
  });
  if (tenantErr) {
    console.error('tenant insert failed:', tenantErr.message);
    return json({ ok: false, error: 'tenant_insert_failed' }, 500);   // retry
  }

  // ── ATOMIC TERRITORY CLAIM ──────────────────────────────────────────────
  // ONE statement inserting every requested city. gsb_city_claims.city_norm is
  // the PRIMARY KEY, so if ANY city in this batch is already claimed the whole
  // insert fails and a partial territory can never be written. This — not the
  // pre-check at checkout — is what makes two simultaneous claims on one city
  // impossible.
  //
  // Deduped by city_norm before the insert: two labels normalising to one key
  // would raise 23505 within this single statement, i.e. the buyer colliding
  // with themselves. create-checkout already rejects that before payment, so
  // reaching it here would mean a request that bypassed it.
  const claimRows = [...new Map(
    claimCities.map(c => [normCity(c), {
      city_norm: normCity(c),
      city_label: String(c).trim(),
      client_id: finalClientId,
      slug: finalSlug,
    }]),
  ).values()];

  const { error: claimErr } = await admin.from('gsb_city_claims').insert(claimRows);
  if (claimErr) {
    // Undo the tenant row so a lost race leaves nothing behind.
    await admin.from('gsb_tenants').delete().eq('slug', finalSlug);

    if (claimErr.code === '23505') {
      // Name the city that actually lost, so a human knows what to offer them.
      const { data: taken } = await admin
        .from('gsb_city_claims')
        .select('city_label')
        .in('city_norm', claimRows.map(r => r.city_norm));
      const takenLabel = taken?.[0]?.city_label || claimCities[0];

      console.warn('CITY CLAIM RACE LOST:', takenLabel, 'slug=', finalSlug, 'session=', sessionId);
      await recordBlockedPurchase(admin, {
        sessionId,
        conflictCity: takenLabel,
        requestedCities: claimCities,
        email: intake.email,
        company: intake.company,
        contact,
        phone: intake.phone,
        amountTotal: session.amount_total,
        slug: finalSlug,
        stage: 'lost-race',
      });
      await admin.from('gsb_intake').update({ status: 'blocked' }).eq('id', intake.id);

      // 200: permanent, recorded, and a person now has to refund or reassign.
      // Retrying would not change the outcome and would bury the alert.
      return json({ ok: true, provisioned: false, reason: 'city_conflict', city: takenLabel });
    }

    console.error('city claim insert failed:', claimErr.message);
    return json({ ok: false, error: 'city_claim_failed' }, 500);   // retry
  }

  // ── THE MAPPING — AND THE REPLAY GUARD ──────────────────────────────────
  const { error: mapErr } = await admin.from('gsb_client_users').insert({
    user_id: intake.user_id,
    client_id: finalClientId,
    display_name: contact || intake.company,
    role: 'owner',
    stripe_session_id: sessionId,
  });
  if (mapErr) {
    // Roll BOTH back. The claims must go too — otherwise a retry hits this
    // buyer's own city rows and is rejected as a conflict against itself, which
    // would look exactly like a lost race and get someone refunded for nothing.
    await admin.from('gsb_city_claims').delete().eq('slug', finalSlug);
    await admin.from('gsb_tenants').delete().eq('slug', finalSlug);

    // 23505 = this session won the race in a concurrent delivery between the
    // idempotency read at the top and here. The other delivery provisioned them
    // correctly, so this one is a duplicate, not a failure.
    if (mapErr.code === '23505') {
      console.log('mapping already exists (concurrent delivery) —', sessionId);
      return json({ ok: true, already_provisioned: true });
    }
    console.error('mapping insert failed:', mapErr.message);
    return json({ ok: false, error: 'mapping_failed' }, 500);   // retry
  }

  // ── ACCEPTANCE EVIDENCE ─────────────────────────────────────────────────
  // The text and documents come from OUR canonical maps, keyed by the version
  // the buyer's page reported. Never from a request body.
  const version = intake.acceptance_version;
  const acceptanceText = ACCEPTANCE_TEXTS[version];
  if (acceptanceText) {
    const { error: acceptErr } = await admin.from('gsb_acceptances').insert({
      user_id: intake.user_id,
      client_id: finalClientId,
      stripe_session_id: sessionId,
      client_claimed_at: intake.acceptance_claimed_at,
      acceptance_version: version,
      acceptance_text: acceptanceText,
      acceptance_sha256: await sha256Hex(acceptanceText),
      documents: ACCEPTANCE_DOCS[version] || {},
    });
    // Loud, but not fatal. The operator has paid and their account exists; a
    // bookkeeping failure must not undo that. Silent would be the real problem.
    if (acceptErr) console.error('ACCEPTANCE INSERT FAILED', sessionId, version, acceptErr.message);
  } else {
    console.error('ACCEPTANCE VERSION NOT IN MAP — no evidence recorded:', version, sessionId);
  }

  // Attach the operator to the billing row now that the slug is settled.
  await admin.from('gsb_billing')
    .update({ slug: finalSlug, client_id: finalClientId })
    .eq('stripe_session_id', sessionId);

  await admin.from('gsb_intake')
    .update({ status: 'provisioned', provisioned_at: new Date().toISOString() })
    .eq('id', intake.id);

  console.log('PROVISIONED:', finalSlug, 'cities=', claimCities.join(', '), 'session=', sessionId);

  // ── EMAILS — both best-effort, after everything durable is written ───────
  await sendWelcomeEmail({
    email: intake.email,
    firstName: intake.first_name,
    company: intake.company,
    slug: finalSlug,
    cities: claimCities,
  });

  await ownerAlert(`New operator — ${intake.company} (${claimCities.join(', ')})`, [
    'A new GarageSaleBiz operator has been provisioned.',
    '',
    `Business:  ${intake.company}`,
    `Contact:   ${contact || '(none)'}`,
    `Email:     ${intake.email || '(none)'}`,
    `Phone:     ${intake.phone || '(none)'}`,
    `Territory: ${claimCities.join(', ')}`,
    `Slug:      ${finalSlug}`,
    `Paid:      $${((session.amount_total || 0) / 100).toFixed(2)}`,
    `Logo:      ${logoUrl ? logoUrl : (intake.logo_data_url ? 'UPLOAD FAILED — set logo_url by hand' : '(none supplied)')}`,
    `Session:   ${sessionId}`,
    '',
    `Public site: https://${finalSlug}.${APEX}`,
    `Dashboard:   ${SITE_URL}/dashboard.html`,
  ]);

  return json({ ok: true, provisioned: true, slug: finalSlug });
}


// ═══════════════════════════════════════════════════════════════════════════
// REFUND — release the territory
//
// The Operator Agreement says a refunded territory returns to the available
// pool. That has to actually happen, and it has to happen by DELETING the claim
// rows rather than by filtering them out on read: every availability reader
// consults gsb_city_claims because that is the table the atomic insert enforces
// on, so a claim left behind with a flag on it would read as taken forever while
// nobody owned it.
// ═══════════════════════════════════════════════════════════════════════════
async function handleRefund(admin, charge) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return json({ ok: true, ignored: 'charge without payment_intent' });

  const { data: billing, error: bErr } = await admin
    .from('gsb_billing').select('*').eq('payment_intent_id', piId).maybeSingle();
  if (bErr) {
    console.error('refund: billing lookup failed:', bErr.message);
    return json({ ok: false, error: 'lookup_failed' }, 500);   // retry
  }
  if (!billing) {
    // A refund for a payment this system never provisioned from — nothing to
    // release. Acknowledged so Stripe stops retrying.
    console.log('refund for unknown payment_intent, nothing to release:', piId);
    return json({ ok: true, ignored: 'no matching billing row' });
  }

  await admin.from('gsb_billing').update({
    refunded_at: new Date().toISOString(),
    refund_amount_cents: charge.amount_refunded ?? null,
  }).eq('stripe_session_id', billing.stripe_session_id);

  // A PARTIAL refund is not a cancellation. Someone refunded $40 of $249 as a
  // goodwill gesture keeps their territory; deactivating them over it would be a
  // serious and very confusing error.
  const fullyRefunded = charge.refunded === true
    || (typeof charge.amount_refunded === 'number' && typeof charge.amount === 'number'
        && charge.amount_refunded >= charge.amount);
  if (!fullyRefunded) {
    console.log('partial refund recorded, territory retained:', billing.slug, charge.amount_refunded);
    await ownerAlert(`Partial refund — ${billing.slug || billing.stripe_session_id}`, [
      'A PARTIAL refund was issued. The territory has been LEFT IN PLACE.',
      '',
      `Slug:     ${billing.slug || '(not provisioned)'}`,
      `Refunded: $${((charge.amount_refunded || 0) / 100).toFixed(2)} of $${((charge.amount || 0) / 100).toFixed(2)}`,
      `Session:  ${billing.stripe_session_id}`,
      '',
      'If this was meant to be a full cancellation, refund the remainder or',
      'deactivate the operator from admin-owner.html.',
    ]);
    return json({ ok: true, partial: true });
  }

  if (!billing.slug) {
    console.log('full refund on a payment that never provisioned:', billing.stripe_session_id);
    return json({ ok: true, released: 0, note: 'never provisioned' });
  }

  // Deactivate rather than delete. The operator's own sales, items, photos and
  // CRM stay intact: a refund may be reversed, a mistake may need undoing, and
  // deleting a business's records because a payment moved is not recoverable.
  // is_active = false is enough — the public views and the tenant resolver both
  // consult it, so the storefront goes dark immediately.
  await admin.from('gsb_tenants').update({ is_active: false }).eq('slug', billing.slug);

  const { data: released, error: relErr } = await admin
    .from('gsb_city_claims').delete().eq('slug', billing.slug).select('city_label');
  if (relErr) {
    console.error('refund: claim release FAILED — cities still locked:', billing.slug, relErr.message);
    // 500 so Stripe retries: cities left locked with no owner is the worst
    // outcome here, because nobody can ever buy them and nothing surfaces it.
    return json({ ok: false, error: 'release_failed' }, 500);
  }

  const cities = (released || []).map(r => r.city_label);
  console.log('REFUNDED AND RELEASED:', billing.slug, cities.join(', '));

  await ownerAlert(`Refund processed — ${billing.slug} territory released`, [
    'A full refund was issued. The operator is deactivated and their cities are',
    'back in the available pool.',
    '',
    `Slug:     ${billing.slug}`,
    `Released: ${cities.join(', ') || '(none found)'}`,
    `Refunded: $${((charge.amount_refunded || 0) / 100).toFixed(2)}`,
    `Session:  ${billing.stripe_session_id}`,
    '',
    'Their sales, items, photos and client list are NOT deleted — only',
    'deactivated. Reactivate from admin-owner.html if this was a mistake.',
  ]);

  return json({ ok: true, released: cities.length, cities });
}


// ═══════════════════════════════════════════════════════════════════════════
// BLOCKED PURCHASE — paid, but the territory could not be given
//
// AWAITED, not fired and forgotten: the function can be torn down the moment a
// response is returned, which would drop an in-flight send. This costs a few
// hundred milliseconds on a path that is already a bad day, and this mail plus
// the row are the only signals that someone is owed money.
//
// NEVER THROWS. A mail failure must not turn a recorded conflict into an
// unhandled 500 that Stripe then retries for three days.
// ═══════════════════════════════════════════════════════════════════════════
async function recordBlockedPurchase(admin, f) {
  console.error('BLOCKED PURCHASE — paid, city unavailable:', JSON.stringify(f));

  // DURABLE RECORD FIRST, so a mail outage cannot cost us the row, and so the
  // email can report its own failure. Upserted on stripe_session_id: a retried
  // delivery must update the existing row rather than fail on the unique
  // constraint.
  let recorded = true;
  try {
    const { error } = await admin.from('gsb_blocked_purchases').upsert({
      stripe_session_id: f.sessionId,
      email: f.email ?? null,
      company: f.company || null,
      contact: f.contact || null,
      phone: f.phone ?? null,
      amount_paid_cents: typeof f.amountTotal === 'number' ? f.amountTotal : null,
      requested_cities: f.requestedCities || [],
      conflict_city: f.conflictCity,
      stage: f.stage,
      slug_attempted: f.slug ?? null,
      last_attempt_at: new Date().toISOString(),
    }, { onConflict: 'stripe_session_id' });
    if (error) { recorded = false; console.error('BLOCKED PURCHASE record failed:', error.message); }
  } catch (e) {
    recorded = false;
    console.error('BLOCKED PURCHASE record threw:', e);
  }

  const paid = typeof f.amountTotal === 'number' ? `$${(f.amountTotal / 100).toFixed(2)}` : '(unknown)';
  await ownerAlert(
    `⚠️ PAID BUT BLOCKED — ${f.conflictCity} — ${f.company || f.email || 'unknown buyer'}`,
    [
      'SOMEONE PAID AND WAS BLOCKED. They are owed a refund or another city.',
      '',
      `Conflict city:    ${f.conflictCity}`,
      `Cities requested: ${(f.requestedCities || []).join(', ') || '(none)'}`,
      `Amount paid:      ${paid}`,
      '',
      `Business: ${f.company || '(none)'}`,
      `Contact:  ${f.contact || '(none)'}`,
      `Email:    ${f.email || '(none)'}`,
      `Phone:    ${f.phone || '(none)'}`,
      '',
      `Stripe session: ${f.sessionId || '(none)'}`,
      `Slug attempted: ${f.slug || '(not reached)'}`,
      `Blocked at:     ${f.stage === 'lost-race' ? 'the atomic claim — lost a race' : 'pre-check'}`,
      '',
      recorded
        ? 'Logged to gsb_blocked_purchases — visible in admin-owner.html.'
        : '⚠️ NOT LOGGED TO gsb_blocked_purchases — THIS EMAIL IS THE ONLY RECORD. Add it by hand.',
      '',
      'Nothing was created: no operator row, no city claim. They do have an auth',
      'account with no territory behind it, so a retry signs them back into it.',
      '',
      'Action: refund in Stripe, or contact them to choose another city.',
    ],
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// LOGO UPLOAD — best-effort, every failure path returns null
// ═══════════════════════════════════════════════════════════════════════════
async function uploadLogo(admin, slug, dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return null;
  try {
    const m = /^data:([a-z/+-]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) { console.warn('logo: not a base64 data URL, skipping'); return null; }

    const mime = m[1].toLowerCase();
    const ext = LOGO_MIME_EXT[mime];
    if (!ext) { console.warn('logo: unsupported type', mime); return null; }

    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    if (bytes.byteLength === 0) { console.warn('logo: empty file'); return null; }
    if (bytes.byteLength > LOGO_MAX_BYTES) { console.warn('logo: too large', bytes.byteLength); return null; }

    // Keyed by slug, which is unique per operator, so one cannot overwrite
    // another's logo. upsert allows a re-provision to replace it.
    const path = `${slug}/logo.${ext}`;
    const { error } = await admin.storage.from(LOGO_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true, cacheControl: '3600' });
    if (error) { console.error('logo upload failed:', error.message); return null; }

    const { data } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error('logo upload threw:', e);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// WELCOME EMAIL
//
// Sent via the Brevo API with inline HTML rather than a Brevo template. That is
// a deliberate choice and it is recorded in BREVO-SETUP.md: the copy lives in
// this repo, under version control, next to the code that decides when to send
// it — so it cannot drift out of step with the product, and setting up a new
// Brevo account needs an API key and nothing else.
//
// Table-based layout with inline styles throughout, which email clients require;
// a <style> block alone is not reliable in Outlook or Gmail.
// ═══════════════════════════════════════════════════════════════════════════
async function sendWelcomeEmail({ email, firstName, company, slug, cities }) {
  if (!email) { console.warn('no email on intake — skipping welcome'); return; }

  const site = `https://${slug}.${APEX}`;
  const name = firstName || 'there';
  const cityList = cities.join(' · ');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your territory is live</title></head>
<body style="margin:0;padding:0;background:#16130E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#16130E;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0" style="width:580px;max-width:100%;background:#F6F0E1;border:3px solid #16130E;">
    <tr><td style="height:8px;line-height:8px;font-size:0;background:#FFCE3B;">&nbsp;</td></tr>
    <tr><td align="center" style="padding:28px 32px 0;">
      <span style="font-family:Impact,'Arial Black',Arial,sans-serif;font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:#16130E;">GarageSaleBiz</span>
    </td></tr>
    <tr><td align="center" style="padding:14px 32px 0;">
      <span style="font-family:Impact,'Arial Black',Arial,sans-serif;font-size:34px;line-height:1.08;text-transform:uppercase;color:#16130E;">Your territory<br>is yours.</span>
    </td></tr>
    <tr><td style="padding:20px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#211D15;">
      Hi ${escHtml(name)},
    </td></tr>
    <tr><td style="padding:14px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#211D15;">
      <strong>${escHtml(company)}</strong> is set up and these cities are locked to you. No other operator can buy them:
    </td></tr>
    <tr><td style="padding:16px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFCE3B;border:2px solid #16130E;">
        <tr><td align="center" style="padding:14px 18px;font-family:Impact,'Arial Black',Arial,sans-serif;font-size:17px;letter-spacing:.06em;text-transform:uppercase;color:#16130E;">
          ${escHtml(cityList)}
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#211D15;">
      <strong style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#7A4B12;">Your website — already live</strong><br>
      <a href="${site}" style="color:#C0311F;font-weight:bold;">${escHtml(site)}</a><br>
      <span style="font-size:13px;color:#4A4438;">Nothing to set up. Publish a sale from your dashboard and it appears here.</span>
    </td></tr>
    <tr><td style="padding:22px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#211D15;">
      <strong style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#7A4B12;">Signing in</strong><br>
      Go to <a href="${SITE_URL}/dashboard.html" style="color:#C0311F;font-weight:bold;">${escHtml(SITE_URL)}/dashboard.html</a>
      and sign in with <strong>${escHtml(email)}</strong> and the password you chose during setup.
      Forgotten it already? Use the reset link on that page.
    </td></tr>
    <tr><td style="padding:22px 36px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#211D15;">
      <strong style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#7A4B12;">Do these three things first</strong>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
        <tr><td style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#211D15;">
          <strong>1.</strong> Read <a href="${SITE_URL}/course.html" style="color:#C0311F;">Module 1 — Finding your first client</a>. About twenty minutes.</td></tr>
        <tr><td style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#211D15;">
          <strong>2.</strong> Print your first signs with the <a href="${SITE_URL}/signs.html" style="color:#C0311F;">sign maker</a>. Arrows do more work than anything else you own.</td></tr>
        <tr><td style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#211D15;">
          <strong>3.</strong> Generate a <a href="${SITE_URL}/contracts.html" style="color:#C0311F;">client agreement</a> so it is ready before your first conversation.</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDE5D0;border-left:4px solid #1E8A4C;">
        <tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#211D15;">
          <strong>Your $249 was a one-time charge.</strong> There is no monthly fee and no renewal.
          We did not keep your card, and we will never bill you again for this territory.
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 36px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#4A4438;">
      Questions, or want a hand with your first sale? Reply to this email or write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#C0311F;">${SUPPORT_EMAIL}</a>. A real person reads it.
      <br><br>— Jason, Kingdom Creatives
    </td></tr>
    <tr><td style="background:#16130E;padding:16px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9C947F;">
      GarageSaleBiz · Kingdom Creatives LLC · ${escHtml(SUPPORT_EMAIL)}<br>
      You are receiving this because you purchased a GarageSaleBiz territory.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    `Hi ${name},`,
    '',
    `${company} is set up, and these cities are locked to you: ${cities.join(', ')}.`,
    'No other operator can buy them.',
    '',
    `YOUR WEBSITE (already live): ${site}`,
    'Nothing to set up. Publish a sale from your dashboard and it appears there.',
    '',
    `SIGNING IN: ${SITE_URL}/dashboard.html`,
    `Use ${email} and the password you chose during setup.`,
    '',
    'DO THESE THREE THINGS FIRST',
    `1. Read Module 1 — Finding your first client: ${SITE_URL}/course.html`,
    `2. Print your first signs: ${SITE_URL}/signs.html`,
    `3. Generate a client agreement: ${SITE_URL}/contracts.html`,
    '',
    'Your $249 was a one-time charge. No monthly fee, no renewal, no card kept on file.',
    '',
    `Questions? ${SUPPORT_EMAIL} — a real person reads it.`,
    '— Jason, Kingdom Creatives',
  ].join('\n');

  await sendBrevo({
    to: email,
    toName: firstName || company,
    subject: `${company} is live — ${cities.join(', ')} is yours`,
    html,
    text,
  });
}
