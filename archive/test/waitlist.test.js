/* Unit tests for public/waitlist.js — node:test, no dependencies.
   Run: npm test

   fetch is injected, so these prove payload shape and failure behaviour
   without touching the network or the live database. The one thing they
   cannot prove is that RLS is actually enforced on the real table; that is
   test/rls-posture.js, which needs the migration applied first. */
const { test } = require('node:test');
const assert = require('node:assert');
const Waitlist = require('../public/waitlist.js');

const CONFIG = {
  supabaseUrl: 'https://example.supabase.co',
  anonKey: 'anon-key',
  table: 'own_waitlist',
  web3formsKey: 'w3f-key',
  fromName: 'Own Your Town Waitlist'
};

const ENTRY = {
  email: 'someone@example.com',
  tradeSlug: 'garage-moving',
  tradeLabel: 'Garage & Moving Sales',
  city: 'Boulder, CO'
};

/* Records calls and returns whatever each call is scripted to return, so a
   test can make one leg fail while the other succeeds. */
function stubFetch(responses) {
  const calls = [];
  const fn = (url, opts) => {
    calls.push({ url, opts });
    const r = responses[calls.length - 1];
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r === undefined ? { ok: true } : r);
  };
  fn.calls = calls;
  return fn;
}

test('isValidEmail accepts ordinary addresses and rejects junk', () => {
  for (const good of ['a@b.co', 'first.last+tag@sub.example.com', '  padded@example.com  ']) {
    assert.equal(Waitlist.isValidEmail(good), true, good);
  }
  for (const bad of ['', '   ', 'no-at-sign', 'a@b', 'a b@example.com', null, undefined]) {
    assert.equal(Waitlist.isValidEmail(bad), false, String(bad));
  }
});

test('buildRow maps to the migration column names and trims', () => {
  assert.deepEqual(
    Waitlist.buildRow({ email: '  someone@example.com ', tradeSlug: 'junk-removal', city: ' Denver ' }),
    { email: 'someone@example.com', trade_slug: 'junk-removal', city_requested: 'Denver' }
  );
});

test('buildRow normalizes a blank city to null, not empty string', () => {
  // "no answer" must be one value in the data, or grouping by town splits.
  for (const city of ['', '   ', undefined, null]) {
    assert.equal(Waitlist.buildRow({ email: 'a@b.co', tradeSlug: 't', city }).city_requested, null);
  }
});

test('buildNotification puts trade and town in the subject', () => {
  const n = Waitlist.buildNotification(ENTRY, CONFIG);
  assert.equal(n.subject, 'Waitlist — Garage & Moving Sales — Boulder, CO');
  assert.equal(n.access_key, 'w3f-key');
  assert.equal(n.email, 'someone@example.com');
  assert.equal(n.Territory, 'Boulder, CO');
});

test('buildNotification degrades to the slug and marks a missing town', () => {
  const n = Waitlist.buildNotification({ email: 'a@b.co', tradeSlug: 'auctions' }, CONFIG);
  assert.equal(n.subject, 'Waitlist — auctions');
  assert.equal(n.Territory, '(none given)');
});

test('submit writes to Supabase and Web3Forms with the right headers', async () => {
  const fetch = stubFetch([]);
  const result = await Waitlist.submit(ENTRY, { ...CONFIG, fetch });

  assert.equal(fetch.calls.length, 2);
  const [supa, w3f] = fetch.calls;

  assert.equal(supa.url, 'https://example.supabase.co/rest/v1/own_waitlist');
  assert.equal(supa.opts.method, 'POST');
  assert.equal(supa.opts.headers.apikey, 'anon-key');
  // No select policy exists on the table, so asking for the row back would
  // turn a successful write into a failed request.
  assert.equal(supa.opts.headers.Prefer, 'return=minimal');
  assert.deepEqual(JSON.parse(supa.opts.body), {
    email: 'someone@example.com', trade_slug: 'garage-moving', city_requested: 'Boulder, CO'
  });

  assert.equal(w3f.url, 'https://api.web3forms.com/submit');
  assert.deepEqual(result, { saved: true, notified: true });
});

test('submit still notifies when the Supabase insert throws', async () => {
  const fetch = stubFetch([new Error('network down')]);
  const result = await Waitlist.submit(ENTRY, { ...CONFIG, fetch });
  // The email is the fallback record of a signup the database did not get.
  assert.deepEqual(result, { saved: false, notified: true });
});

test('submit still saves when the notification throws', async () => {
  const fetch = stubFetch([{ ok: true }, new Error('relay down')]);
  const result = await Waitlist.submit(ENTRY, { ...CONFIG, fetch });
  assert.deepEqual(result, { saved: true, notified: false });
});

test('submit reports a non-ok Supabase response as unsaved', async () => {
  const fetch = stubFetch([{ ok: false, status: 401 }]);
  const result = await Waitlist.submit(ENTRY, { ...CONFIG, fetch });
  assert.equal(result.saved, false);
});

test('submit never rejects, even when both legs fail', async () => {
  const fetch = stubFetch([new Error('a'), new Error('b')]);
  // A visitor who just handed over their email must never see a broken form.
  const result = await Waitlist.submit(ENTRY, { ...CONFIG, fetch });
  assert.deepEqual(result, { saved: false, notified: false });
});
