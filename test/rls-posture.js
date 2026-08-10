#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   rls-posture.js — proves own_waitlist is write-only to the public.

   This is the check the unit tests cannot make. test/waitlist.test.js stubs
   fetch, so it proves the request we SEND is shaped right; it says nothing
   about what the database DOES with it. The security claim in
   migrations/001-own-waitlist.sql — "anon can insert but can never read the
   list back" — is a property of the live database, and the only honest way to
   verify it is to point an anon key at the real table and try.

   Run AFTER applying the migration:   node test/rls-posture.js
   Writes one real row to own_waitlist, tagged so you can find and delete it.

   Not part of `npm test` on purpose: it hits the network and mutates data.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const SUPABASE_URL = 'https://cdckozujhrffobragmtm.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkY2tvenVqaHJmZm9icmFnbXRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzUzMjgsImV4cCI6MjA5MTc1MTMyOH0.2LWNOCcncwlxYw3EyRajnGGW8YM3108Oa-8ydOdnwJ0';
const TABLE = 'own_waitlist';

const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };
const marker = 'rls-check-' + process.pid + '@example.invalid';

let failures = 0;
function check(name, passed, detail) {
  console.log((passed ? '  PASS  ' : '  FAIL  ') + name + (detail ? '\n          ' + detail : ''));
  if (!passed) failures++;
}

(async function main() {
  console.log('\nRLS posture — ' + TABLE + '\n');

  // 1. anon INSERT must succeed, or the form is broken for everyone.
  let insertStatus;
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ email: marker, trade_slug: 'rls-check', city_requested: 'Nowhere' })
    });
    insertStatus = res.status;
    check('anon can INSERT', res.ok, res.ok ? '' : 'HTTP ' + res.status + ' — ' + (await res.text()).slice(0, 200));
  } catch (e) {
    check('anon can INSERT', false, e.message);
  }

  // 2. anon SELECT must NOT return rows. With RLS on and no select policy,
  //    PostgREST returns 200 with an empty array rather than an error — an
  //    empty array here is a pass, and any row at all is a leak.
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?select=email&limit=50', { headers: H });
    const body = await res.text();
    let rows = null;
    try { rows = JSON.parse(body); } catch (_) { /* non-JSON = denied = fine */ }
    const leaked = Array.isArray(rows) && rows.length > 0;
    check('anon CANNOT read the list back', !leaked,
      leaked ? 'LEAK: ' + rows.length + ' row(s) visible to the public anon key' : 'HTTP ' + res.status + ', no rows visible');
  } catch (e) {
    check('anon CANNOT read the list back', true, 'request rejected: ' + e.message);
  }

  // 3. anon DELETE must not remove anything. PostgREST reports 200 even when
  //    RLS filtered every row, so a 2xx here is not proof of deletion — the
  //    check is that the endpoint does not report rows removed.
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + TABLE + '?trade_slug=eq.rls-check', {
      method: 'DELETE',
      headers: { ...H, Prefer: 'return=representation' }
    });
    const body = await res.text();
    let rows = null;
    try { rows = JSON.parse(body); } catch (_) {}
    const deleted = Array.isArray(rows) && rows.length > 0;
    check('anon CANNOT delete rows', !deleted,
      deleted ? 'LEAK: anon deleted ' + rows.length + ' row(s)' : 'HTTP ' + res.status + ', nothing removed');
  } catch (e) {
    check('anon CANNOT delete rows', true, 'request rejected: ' + e.message);
  }

  console.log('\n' + (failures === 0
    ? 'All posture checks passed.'
    : failures + ' check(s) FAILED — do not ship the form until this is green.'));

  if (insertStatus && insertStatus < 300) {
    console.log('\nCleanup: one test row was written. Remove it in the Supabase SQL editor:');
    console.log("  delete from " + TABLE + " where trade_slug = 'rls-check';\n");
  }

  process.exit(failures === 0 ? 0 : 1);
})();
