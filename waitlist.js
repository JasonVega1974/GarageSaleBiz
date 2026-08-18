/* ═══════════════════════════════════════════════════════════════════════════
   waitlist.js — trade-agnostic waitlist capture

   Generalized from EstateSaleBiz's saveWaitlistEntry (index.html). That version
   hard-coded one table, one product, and a cities[] array shaped for the estate
   -sales city checker. This one takes its table, keys and labels as config, so
   the same file serves the umbrella storefront, EstateSaleBiz, or any future
   trade site without a fork.

   TWO WRITES, BOTH BEST-EFFORT
   ---------------------------
   A signup goes to Supabase (the durable record) and to Web3Forms (the email
   that actually gets noticed). Neither is allowed to throw, and neither gates
   the confirmation the visitor sees: someone who just handed over their email
   must not be told the form broke because a notification relay was down. The
   two channels are redundant on purpose — if the insert fails, the email is
   still the record that a human sees.

   submit() therefore never rejects. It resolves to {saved, notified} so a
   caller that wants to log or retry can, while the default path ignores it.

   Loaded as a plain <script> in the browser (window.Waitlist) and require()d
   in tests. No build step — that is deliberate; the site is static files.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Waitlist = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Deliberately permissive. This gate exists to catch typos and empty
  // submits, not to adjudicate RFC 5322 — over-strict patterns reject real
  // addresses, and the cost of a bad row here is one wasted email.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function clean(s) {
    return String(s == null ? '' : s).trim();
  }

  function isValidEmail(v) {
    return EMAIL_RE.test(clean(v));
  }

  /* Row for the Supabase table. city is optional: a signup with no town is
     still worth keeping — it says the trade is wanted even if it cannot say
     where. Empty string normalizes to null so "no answer" is one value in the
     data rather than two. */
  function buildRow(entry) {
    var city = clean(entry && entry.city);
    return {
      email: clean(entry && entry.email),
      trade_slug: clean(entry && entry.tradeSlug),
      city_requested: city === '' ? null : city
    };
  }

  /* Web3Forms payload. The subject carries the trade and town because that is
     what gets read at a glance in an inbox — the body is where the detail
     lives, but the subject is what decides whether it is opened. */
  function buildNotification(entry, config) {
    var city = clean(entry && entry.city);
    var label = clean(entry && entry.tradeLabel) || clean(entry && entry.tradeSlug);
    return {
      access_key: config.web3formsKey,
      subject: 'Waitlist — ' + label + (city ? ' — ' + city : ''),
      from_name: config.fromName || 'Own Your Town Waitlist',
      email: clean(entry && entry.email),
      Trade: label,
      Territory: city || '(none given)'
    };
  }

  function submit(entry, config) {
    var doFetch = config.fetch || (typeof fetch === 'function' ? fetch : null);
    var result = { saved: false, notified: false };
    if (!doFetch) return Promise.resolve(result);

    // return=minimal: there is no select policy on the table, so asking for the
    // row back would fail on a write that otherwise succeeded.
    var saving = doFetch(config.supabaseUrl + '/rest/v1/' + config.table, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: 'Bearer ' + config.anonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(buildRow(entry))
    }).then(function (res) { result.saved = !!(res && res.ok); })
      .catch(function () { /* notification is the fallback record */ });

    var notifying = !config.web3formsKey ? Promise.resolve() :
      doFetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildNotification(entry, config))
      }).then(function (res) { result.notified = !!(res && res.ok); })
        .catch(function () { /* the Supabase row is the fallback record */ });

    return Promise.all([saving, notifying]).then(function () { return result; });
  }

  return {
    isValidEmail: isValidEmail,
    buildRow: buildRow,
    buildNotification: buildNotification,
    submit: submit
  };
}));
