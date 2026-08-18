// ═══════════════════════════════════════════════════════════════════════════
// GET|POST /api/verify-session?session_id=cs_…
//
// Called by thank-you.html. Confirms server-side that the session in the URL
// represents a real, completed, UNREFUNDED purchase, and reports whether the
// webhook has finished provisioning.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// EstateSaleBiz's thank-you page was entirely static: it read session_id from
// the query string and forwarded it, trusting it completely. Anyone could open
//   thank-you.html?session_id=anything
// and be congratulated on a purchase. Worse, a REFUNDED session's id kept
// working there forever, because Stripe does not change payment_status on
// refund — the fix had to be retrofitted into the provisioning function later.
// Here that check is the first thing this endpoint does.
//
// ── WHAT IT DELIBERATELY DOES NOT RETURN ────────────────────────────────────
// No email, no amount beyond what the buyer already saw at checkout, no
// personal detail. Everything it returns (business name, slug, cities) is
// already public via gsb_tenants and the availability checker. That matters
// because this endpoint is unauthenticated by necessity: the session id is the
// only credential the buyer has when they land here, so the response must be
// safe to hand to anyone holding one.
// ═══════════════════════════════════════════════════════════════════════════

import {
  adminClient, json, preflight, verifyStripeSession, SUPPORT_EMAIL, APEX,
} from './_shared.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  let sessionId = '';
  try {
    if (request.method === 'GET') {
      sessionId = (new URL(request.url).searchParams.get('session_id') || '').trim();
    } else {
      const body = await request.json().catch(() => ({}));
      sessionId = String(body.session_id || '').trim();
    }
  } catch { /* falls through to the missing-id branch */ }

  if (!sessionId) {
    return json({
      ok: false, error: 'missing_session_id',
      message: 'This page needs the confirmation link from your purchase. Open it from your Stripe receipt, '
             + `or email ${SUPPORT_EMAIL} and we'll confirm your order.`,
    }, 400);
  }

  // Cheap shape check before spending a Stripe call on obvious junk.
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return json({ ok: false, error: 'malformed_session_id' }, 400);
  }

  let admin;
  try { admin = adminClient(); }
  catch (e) { console.error(e); return json({ ok: false, error: 'not_configured' }, 503); }

  // ── THE GATE ─────────────────────────────────────────────────────────────
  // Rejects fabricated ids, sessions from another Stripe account, unpaid and
  // expired sessions, 100%-off sessions, wrong currency, amounts below the
  // floor, and — the one that needed a retrofit on EstateSaleBiz — fully OR
  // partially refunded payments.
  const verified = await verifyStripeSession(sessionId);
  if ('fail' in verified) return verified.fail;
  const session = verified.session;

  // ── HAS THE WEBHOOK FINISHED? ────────────────────────────────────────────
  // The mapping row is the authoritative "this session provisioned an operator"
  // marker, because its stripe_session_id column carries the UNIQUE constraint
  // that made it so.
  const { data: mapping, error: mapErr } = await admin
    .from('gsb_client_users')
    .select('client_id')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  if (mapErr) {
    console.error('verify-session mapping read failed:', mapErr.message);
    return json({ ok: false, error: 'lookup_failed' }, 500);
  }

  if (mapping) {
    const { data: tenant } = await admin
      .from('gsb_tenants')
      .select('slug, business_name, cities, primary_color, is_active')
      .eq('client_id', mapping.client_id)
      .maybeSingle();

    if (tenant && tenant.is_active) {
      return json({
        ok: true,
        status: 'ready',
        slug: tenant.slug,
        business_name: tenant.business_name,
        cities: tenant.cities || [],
        primary_color: tenant.primary_color,
        subdomain: `https://${tenant.slug}.${APEX}`,
      });
    }

    // Mapped but with no active operator row. Rare, and worth being honest
    // about rather than showing a success page that links nowhere.
    return json({
      ok: true, status: 'inactive', client_id: mapping.client_id,
      message: `Your purchase is confirmed, but your account needs a hand to finish. Email ${SUPPORT_EMAIL} and we'll sort it today.`,
    });
  }

  // ── PAID, BUT NOT PROVISIONED ────────────────────────────────────────────
  // Two very different reasons, and conflating them would be the whole problem.

  // (a) Blocked on a territory conflict. Someone has to refund or reassign, and
  //     a row already exists saying so — the buyer should be told the truth and
  //     given their options, not left refreshing a spinner.
  const { data: blocked } = await admin
    .from('gsb_blocked_purchases')
    .select('conflict_city, requested_cities, amount_paid_cents')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  if (blocked) {
    return json({
      ok: true,
      status: 'blocked',
      city: blocked.conflict_city,
      requested_cities: blocked.requested_cities || [],
      amount_display: typeof blocked.amount_paid_cents === 'number'
        ? `$${(blocked.amount_paid_cents / 100).toFixed(2)}` : null,
    });
  }

  // (b) The webhook simply has not landed yet. Normal for a few seconds after
  //     checkout, so this is 'pending' and the page polls rather than declaring
  //     a failure the moment it loads.
  //
  //     The billing row tells us whether the webhook has been seen at all,
  //     which separates "processing" from "the webhook is not configured" —
  //     a distinction worth having at 2am on launch day.
  const { data: billing } = await admin
    .from('gsb_billing')
    .select('created_at')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  const ageSeconds = (Date.now() - new Date(session.created * 1000).getTime()) / 1000;

  // After two minutes this is no longer webhook lag. Say so, and tell them
  // their money is safe, rather than spinning indefinitely.
  if (ageSeconds > 120) {
    console.error('VERIFY-SESSION: paid but unprovisioned after', Math.round(ageSeconds), 's —',
      sessionId, 'webhook_seen=', !!billing);
    return json({
      ok: true,
      status: 'stalled',
      webhook_seen: !!billing,
      message: 'Your payment went through and it is safe. Setting up your account is taking longer than it should — '
             + `email ${SUPPORT_EMAIL} and we'll finish it by hand, usually within the hour. You will not be charged twice.`,
    });
  }

  return json({ ok: true, status: 'pending', webhook_seen: !!billing });
}
