/* ═══════════════════════════════════════════════════════════════════════════
   GARAGESALEBIZ — SHARED CLIENT RUNTIME  (window.GSB)

   Loaded as a plain <script> after the Supabase UMD bundle. No build step: the
   site is static files, deliberately.

   WHAT LIVES HERE AND WHY:
     • config + the Supabase client        — one place to change a key
     • esc()                              — the XSS boundary, used at EVERY render
     • normCity()                         — must mirror gsb_norm_city() exactly
     • the three-layer session guard       — ported from EstateSaleBiz whole
     • checkAuth()                        — the operator gate
     • resolveTenant()                    — hostname → operator, with NO fallback

   EstateSaleBiz duplicated all of this into each page, which is how one page
   ended up escaping item fields and another not, and how a sign creator kept
   printing a stranger's phone number. One copy, imported everywhere.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (window) {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────────────────
  // The publishable key is SAFE TO SHIP. It is the browser's identity as the
  // `anon` role, and anon's entire reach is enumerated in SETUP.sql PART 5:
  // SELECT on gsb_settings and gsb_tenants, INSERT on gsb_waitlist, and SELECT
  // on the four public views. It cannot read a sale's street address, an item's
  // floor price, a client list, an acceptance record, or a cent of revenue.
  //
  // NEVER put the service-role key in this file, or in any file under /assets.
  var SUPABASE_URL = 'https://jjocmvhqeiudcwtazbwi.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_YRrK-5dWr2WNVx2hlGBOzg_099CagJH';
  var APEX = 'garagesalebiz.com';

  var supa = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  // ── ESCAPING — THE XSS BOUNDARY ───────────────────────────────────────────
  // Every value that originated from a person — an operator's item name, a
  // homeowner's address, a city typed into the availability checker — passes
  // through here before it reaches innerHTML. No exceptions, including strings
  // that "obviously" cannot contain markup: the operator's own business name is
  // attacker-controlled from the perspective of a shopper reading their site.
  //
  // EstateSaleBiz had to patch this into two separate render paths after the
  // fact. Built in here from the start.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // For values landing inside a quoted HTML attribute.
  function escAttr(s) { return esc(s); }

  // ── CITY NORMALISATION ────────────────────────────────────────────────────
  // ⚠️ A UX LAYER, NOT THE GUARANTEE. The authority is the trigger
  // gsb_city_claims_norm_tg, which overwrites city_norm on every write
  // (SETUP.sql PART 2.2), so nothing here can reach stored data.
  //
  // It must nonetheless mirror gsb_norm_city EXACTLY — same operations, same
  // order. The other copy is normCity() in api/_shared.js. Change one, change
  // both, and re-run assertion 10g in SETUP.sql.
  function normCity(s) {
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

  function slugify(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  // ── FORMATTERS ────────────────────────────────────────────────────────────
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // Dates from Postgres arrive as 'YYYY-MM-DD'. Parsed at NOON local rather than
  // via new Date('YYYY-MM-DD'), which JavaScript reads as UTC midnight — that
  // silently shifts the date back a day for every user west of Greenwich, so a
  // Friday sale advertises as Thursday across all of the Americas.
  function parseDate(d) {
    if (!d) return null;
    var s = String(d).slice(0, 10);
    return new Date(s + 'T12:00:00');
  }

  function fmtDate(d, opts) {
    var dt = parseDate(d);
    if (!dt || isNaN(dt)) return '';
    return dt.toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric' });
  }

  function fmtDateRange(a, b) {
    if (!a) return '';
    if (!b || String(a).slice(0, 10) === String(b).slice(0, 10)) {
      return fmtDate(a, { weekday: 'short', month: 'long', day: 'numeric' });
    }
    return fmtDate(a, { weekday: 'short', month: 'long', day: 'numeric' }) + ' – ' +
           fmtDate(b, { weekday: 'short', month: 'long', day: 'numeric' });
  }

  function fmtTime(t) {
    if (!t) return '';
    var parts = String(t).split(':');
    var h = Number(parts[0]); var m = Number(parts[1] || 0);
    if (!isFinite(h)) return String(t);
    var ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return m ? (h + ':' + String(m).padStart(2, '0') + ap) : (h + ap);
  }

  // ── TENANT RESOLUTION ─────────────────────────────────────────────────────
  // Returns the subdomain label, or the ?tenant= override on hosts where there
  // is no subdomain to read (local dev, preview deployments, the apex).
  function resolveSlug() {
    var host = location.hostname.toLowerCase();
    var q = null;
    try { q = new URLSearchParams(location.search).get('tenant'); } catch (e) {}
    if (host === 'localhost' || host === '127.0.0.1' || /\.vercel\.app$/.test(host)) return q;
    if (host === APEX || host === 'www.' + APEX) return q;
    if (host.length > APEX.length + 1 && host.slice(-(APEX.length + 1)) === '.' + APEX) {
      return host.slice(0, -(APEX.length + 1));
    }
    return q;
  }

  // Resolves the visitor's hostname to an operator row.
  //
  // ⚠️ THERE IS NO FALLBACK, AND THAT IS THE POINT. An unknown, misspelled or
  // deactivated subdomain returns null and the caller shows an explicit
  // "site not found" state. It must NEVER fall back to a default operator (that
  // publishes one business's sales under another's name) and never to the funnel
  // (EstateSaleBiz did exactly that, so a shopper who mistyped an operator's
  // subdomain landed on the page selling the system to that operator's
  // competitors).
  //
  // Returns { tenant } | { notFound: true } | { error: true }. The three are kept
  // distinct because a network failure must not be rendered as "this business
  // does not exist".
  async function resolveTenant() {
    var slug = resolveSlug();
    if (!slug) return { notFound: true };
    try {
      var res = await supa
        .from('gsb_tenants')
        .select('slug, client_id, business_name, logo_url, phone, email, service_area, cities, primary_color, about_text, default_commission_pct')
        .eq('slug', slug)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (res.error) { console.error('[gsb] tenant read failed:', res.error.message); return { error: true }; }
      if (!res.data) return { notFound: true };
      return { tenant: res.data };
    } catch (e) {
      console.error('[gsb] tenant read threw:', e);
      return { error: true };
    }
  }

  // Applies an operator's brand colour. The value has already been validated to
  // a 6-digit hex by gsb_set_primary_color, and is re-checked here so a value
  // written by some other path can never be interpolated into a style.
  function applyBrand(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(color || ''))) return;
    document.documentElement.style.setProperty('--brand', color);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE THREE-LAYER SESSION GUARD  (ported from EstateSaleBiz whole)
  //
  // Why it exists: with no session, supabase-js still sends the publishable key,
  // so requests execute as `anon` rather than failing. Under RLS an UPDATE or
  // DELETE then matches zero rows and PostgREST returns 200 with []. No error.
  // A dashboard reading that as success lets an operator publish a sale, see no
  // error, and find their public site empty.
  //
  // Three layers, because each one alone has a hole:
  //   A. onAuthStateChange — reacts the moment auth is lost
  //   B. requireSession()  — refuses to attempt a write without a session
  //   C. assertWrote()     — treats a 0-row write as the failure it is
  //
  // C is the one that would catch the original bug unaided: it does not care WHY
  // nothing was written. B can be fooled by a token that looks valid locally but
  // is rejected server-side; A never fires if a refresh fails without emitting an
  // event. Keep all three.
  // ═══════════════════════════════════════════════════════════════════════════
  var SESSION_LOST = false;
  var currentUser = null;
  var currentClientId = null;
  var currentTenant = null;

  // Deliberately does NOT reload. A half-filled sale form is still in the DOM,
  // and reloading to re-authenticate destroys it — which on a long form is
  // nearly as bad as the silent failure this replaces.
  function showSessionExpired(what) {
    SESSION_LOST = true;
    var g = document.getElementById('gsb-session-gate');
    if (!g) {
      g = document.createElement('div');
      g.id = 'gsb-session-gate';
      g.style.cssText = 'position:fixed;inset:0;z-index:1200;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(22,19,14,.94);padding:1.5rem;';
      g.innerHTML =
        '<div class="paper-surface" style="max-width:440px;width:100%;padding:2rem;text-align:center;">' +
          '<div style="font-size:2rem;">🔑</div>' +
          '<h3 class="display" style="margin:.5rem 0;">You were signed out</h3>' +
          '<p id="gsb-sg-what" class="small" style="color:var(--stamp);font-weight:600;margin-bottom:.75rem;"></p>' +
          '<p class="small" style="color:var(--on-paper-dim);margin-bottom:1rem;">Sign in again to carry on. ' +
            '<b>Nothing you have typed is lost</b> — this page stays exactly as you left it.</p>' +
          '<div class="field"><input type="email" id="gsb-sg-email" placeholder="you@email.com" autocomplete="username"></div>' +
          '<div class="field"><input type="password" id="gsb-sg-pw" placeholder="Password" autocomplete="current-password"></div>' +
          '<p class="err" id="gsb-sg-err"></p>' +
          '<button class="btn btn-block" id="gsb-sg-btn" type="button">Sign in and continue</button>' +
          '<p style="margin-top:.9rem;"><button class="btn-link" type="button" id="gsb-sg-out">Sign out instead</button></p>' +
        '</div>';
      document.body.appendChild(g);
      document.getElementById('gsb-sg-btn').addEventListener('click', resumeSession);
      document.getElementById('gsb-sg-out').addEventListener('click', signOut);
      document.getElementById('gsb-sg-pw').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') resumeSession();
      });
    }
    var w = document.getElementById('gsb-sg-what');
    if (w) {
      w.textContent = what
        ? '"' + what + '" was not saved. Nothing was written.'
        : 'Your last action was not saved. Nothing was written.';
    }
    var pre = document.getElementById('gsb-sg-email');
    if (pre && !pre.value && currentUser && currentUser.email) pre.value = currentUser.email;
    g.style.display = 'flex';
  }

  // Re-authenticates IN PLACE. No location.reload() — see showSessionExpired.
  async function resumeSession() {
    var email = (document.getElementById('gsb-sg-email') || {}).value || '';
    var pw = (document.getElementById('gsb-sg-pw') || {}).value || '';
    var err = document.getElementById('gsb-sg-err');
    var btn = document.getElementById('gsb-sg-btn');
    if (err) { err.textContent = ''; err.classList.remove('show'); }
    if (!email.trim() || !pw) {
      if (err) { err.textContent = 'Email and password required.'; err.classList.add('show'); }
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

    var out = await supa.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in and continue'; }
    if (out.error || !(out.data && out.data.session)) {
      if (err) { err.textContent = (out.error && out.error.message) || 'Could not sign in.'; err.classList.add('show'); }
      return;
    }

    // Identity is RE-READ, never trusted from before. Signing in as a DIFFERENT
    // account must not leave the previous operator's client_id attached to this
    // page's writes — otherwise the next save lands on someone else's data.
    currentUser = out.data.session.user;
    var m = await supa.from('gsb_client_users').select('client_id').eq('user_id', currentUser.id).maybeSingle();
    if (!m.data) {
      if (err) { err.textContent = 'That account has no territory attached.'; err.classList.add('show'); }
      return;
    }
    currentClientId = m.data.client_id;

    // GATE 2 — account status. checkAuth() applies two gates in sequence
    // (provisioned? then active?) and this path must apply both, or a
    // deactivated operator whose session lapsed mid-visit could sign back in
    // here and land inside the dashboard, past the block every fresh page load
    // enforces. EstateSaleBiz shipped exactly that hole.
    var t = await supa.from('gsb_tenants')
      .select('slug, business_name, phone, email, service_area, cities, primary_color, default_commission_pct, is_active')
      .eq('client_id', currentClientId).limit(1).maybeSingle();

    // A failed READ is not a deactivation. Never tell a paying operator their
    // account lapsed because the network blipped.
    if (t.error) {
      if (err) { err.textContent = 'Could not verify your account status. Check your connection and try again.'; err.classList.add('show'); }
      return;
    }
    if (!t.data || !t.data.is_active) {
      // SESSION_LOST stays TRUE: this re-auth authenticated the user but did not
      // restore them to a working dashboard. The gate is hidden anyway, because
      // it sits above the deactivated block and would otherwise bury it behind a
      // live "Sign in and continue" button that silently does nothing.
      var sg = document.getElementById('gsb-session-gate');
      if (sg) sg.style.display = 'none';
      if (typeof window.gsbShowDeactivated === 'function') window.gsbShowDeactivated();
      return;
    }

    currentTenant = t.data;
    SESSION_LOST = false;
    var gate = document.getElementById('gsb-session-gate');
    if (gate) gate.style.display = 'none';
    var pw2 = document.getElementById('gsb-sg-pw');
    if (pw2) pw2.value = '';
  }

  // LAYER B — refuse to attempt a write without a session. getSession() is local
  // and refreshes when it can, so this is cheap enough to call on every write.
  async function requireSession(what) {
    var session = null;
    try { var r = await supa.auth.getSession(); session = r.data && r.data.session; }
    catch (e) { session = null; }
    if (!session) { showSessionExpired(what); return false; }
    if (!currentClientId) { showSessionExpired(what); return false; }
    return true;
  }

  // LAYER C — the backstop. A write that reports no error but touched no rows has
  // NOT succeeded, whatever the reason: no session, a revoked token, a row that
  // is not yours, or an RLS change. Callers must not update the UI unless this
  // returns true.
  //
  // expectRows=false is for inserts, where PostgREST returns the new row and an
  // RLS refusal surfaces as a real error rather than an empty result.
  function assertWrote(opts) {
    var data = opts.data, error = opts.error, what = opts.what;
    var expectRows = opts.expectRows !== false;
    if (error) {
      console.error('[write] ' + what + ' failed:', error.message || error);
      // 42501 is RLS refusing the row. Under a lost session that is what an
      // INSERT looks like, so route it to the same gate as a 0-row update.
      if (error.code === '42501' || /row-level security/i.test(error.message || '')) {
        showSessionExpired(what);
      } else {
        toast(what + ' failed: ' + (error.message || 'unknown error'), true);
      }
      return false;
    }
    if (expectRows && (!data || (Array.isArray(data) && data.length === 0))) {
      console.error('[write] ' + what + ' matched 0 rows — nothing was saved');
      showSessionExpired(what);
      return false;
    }
    return true;
  }

  async function signOut() {
    try { await supa.auth.signOut(); } catch (e) {}
    location.href = '/dashboard.html';
  }

  // ── THE OPERATOR GATE ─────────────────────────────────────────────────────
  // Two gates in sequence, and the order matters:
  //   1. Is this user mapped to an operator at all?  → no: show the "no
  //      territory" block. NEVER fall back to a default client_id; that would
  //      read and write another operator's data.
  //   2. Is that operator ACTIVE?                    → no: show the deactivated
  //      block, not a broken dashboard.
  //
  // Returns { ok:true } or { ok:false, reason }. The caller renders the state.
  async function checkAuth() {
    var s = null;
    try { var r = await supa.auth.getSession(); s = r.data && r.data.session; } catch (e) {}
    if (!s) return { ok: false, reason: 'no_session' };
    currentUser = s.user;

    var m;
    try { m = await supa.from('gsb_client_users').select('client_id, display_name, role').eq('user_id', currentUser.id).maybeSingle(); }
    catch (e) { return { ok: false, reason: 'read_error' }; }
    if (m.error) return { ok: false, reason: 'read_error', error: m.error };
    if (!m.data) {
      currentClientId = null;
      return { ok: false, reason: 'not_provisioned' };
    }
    currentClientId = m.data.client_id;

    var t;
    try {
      t = await supa.from('gsb_tenants')
        .select('slug, business_name, logo_url, phone, email, service_area, cities, primary_color, about_text, default_commission_pct, is_active, created_at')
        .eq('client_id', currentClientId).limit(1).maybeSingle();
    } catch (e) { return { ok: false, reason: 'read_error' }; }

    // A failed read must never be shown as "your account is inactive". An
    // operator being told their account lapsed because of a network blip is a
    // support ticket and a scare, not a status.
    if (t.error) return { ok: false, reason: 'read_error', error: t.error };

    // gsb_tenants carries an "operator reads own row" policy (SETUP.sql 4.3), so
    // a deactivated operator still gets their row back and this can distinguish
    // deactivated from deleted — the ambiguity EstateSaleBiz had to log as an
    // open item because its only policy filtered on is_active.
    if (!t.data) {
      console.error('[gsb] mapping exists but no operator row for', currentClientId, '— row deleted?');
      return { ok: false, reason: 'no_tenant_row' };
    }
    if (!t.data.is_active) {
      currentTenant = t.data;
      return { ok: false, reason: 'deactivated', tenant: t.data };
    }

    currentTenant = t.data;
    applyBrand(t.data.primary_color);
    return { ok: true, tenant: t.data, mapping: m.data };
  }

  // LAYER A — react the moment auth is lost, wherever it happens.
  if (supa) {
    supa.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        supa.auth.getSession().then(function (r) {
          var live = r && r.data && r.data.session;
          if (!live && !SESSION_LOST && currentClientId) showSessionExpired(null);
        });
      }
    });
  }

  // ── TOAST ─────────────────────────────────────────────────────────────────
  // Used instead of alert() throughout. alert() blocks the browser event loop,
  // which in a page driven by automation tooling wedges everything until it is
  // dismissed by hand.
  function toast(msg, isError) {
    var t = document.getElementById('gsb-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gsb-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:1300;' +
        'max-width:min(560px,92vw);padding:13px 18px;border:3px solid var(--ink);' +
        'font-weight:600;font-size:15px;box-shadow:var(--hard);display:none;';
      document.body.appendChild(t);
    }
    t.style.background = isError ? '#C0311F' : '#1E8A4C';
    t.style.color = '#fff';
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.display = 'none'; }, isError ? 7000 : 3800);
  }

  // ── US STATES ─────────────────────────────────────────────────────────────
  var STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
    ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
    ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
    ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
    ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
    ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
    ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
    ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
    ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
    ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
    ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
  ];

  function stateOptions(placeholder) {
    return '<option value="">' + esc(placeholder || 'State…') + '</option>' +
      STATES.map(function (s) { return '<option value="' + s[0] + '">' + esc(s[1]) + '</option>'; }).join('');
  }

  // ── SALE TYPE LABELS ──────────────────────────────────────────────────────
  var SALE_TYPES = {
    'garage': 'Garage Sale',
    'moving': 'Moving Sale',
    'multi-family': 'Multi-Family Sale',
    'estate-lite': 'Downsizing Sale'
  };

  // ── EXPORT ────────────────────────────────────────────────────────────────
  window.GSB = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_KEY: SUPABASE_KEY,
    APEX: APEX,
    supa: supa,
    esc: esc, escAttr: escAttr,
    normCity: normCity, slugify: slugify,
    money: money, parseDate: parseDate, fmtDate: fmtDate, fmtDateRange: fmtDateRange, fmtTime: fmtTime,
    resolveSlug: resolveSlug, resolveTenant: resolveTenant, applyBrand: applyBrand,
    checkAuth: checkAuth, requireSession: requireSession, assertWrote: assertWrote,
    showSessionExpired: showSessionExpired, resumeSession: resumeSession, signOut: signOut,
    toast: toast,
    STATES: STATES, stateOptions: stateOptions, SALE_TYPES: SALE_TYPES,
    // Live identity. Read through the getters — the module-level variables are
    // reassigned by checkAuth() and resumeSession(), so a page that captured
    // them once would keep using a stale client_id after a re-auth as a
    // different account.
    get user() { return currentUser; },
    get clientId() { return currentClientId; },
    get tenant() { return currentTenant; },
    get sessionLost() { return SESSION_LOST; }
  };
})(window);
