/* ═══════════════════════════════════════════════════════════════════════════
   GARAGESALEBIZ — THE OPERATOR STOREFRONT

   ONE file renders every operator's public site. The tenant is resolved from
   location.hostname at page load, so adding an operator never touches this
   deployment and there is no per-operator build step.

   This file RENDERS THE PAGE BODY rather than decorating existing markup. That
   is deliberate: storefront.html and demo.html are then ~30-line shells that
   cannot drift apart. EstateSaleBiz kept two hardcoded marketing pages beside
   its real storefront, and both accumulated fabricated statistics and a
   non-functional "remind me" button that captured no email — because nothing
   forced them to stay in step with the page that actually worked.

   THREE RULES THIS FILE EXISTS TO ENFORCE:

   1. NO SILENT FALLBACK. An unknown, misspelled, or deactivated subdomain shows
      an explicit "site not found" and fetches NO sale data. Never a default
      operator (that publishes one business's sales under another's name), and
      never the funnel (EstateSaleBiz did that, so a shopper who mistyped an
      operator's subdomain landed on the page selling the system to that
      operator's competitors).

   2. "NOT FOUND" AND "COULDN'T LOAD" ARE DIFFERENT PAGES. Telling a paying
      operator's customers that the business does not exist because of a network
      blip is the worst output this file can produce.

   3. EVERY OPERATOR-SUPPLIED STRING IS ESCAPED AT RENDER. Item names, captions,
      descriptions, the business name itself. No exceptions.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var esc = GSB.esc;
  var mount = document.getElementById('sf-root');
  var IS_DEMO = !!window.GSB_DEMO;

  // ── SHELLS ────────────────────────────────────────────────────────────────
  function shell(inner) { mount.innerHTML = inner; }

  function renderLoading() {
    shell('<div class="sf-center"><p class="eyebrow">Loading…</p></div>');
  }

  // RULE 1. No data has been fetched at this point and none will be.
  function renderNotFound() {
    document.title = 'Site not found — GarageSaleBiz';
    shell(
      '<div class="sf-center">' +
        '<div class="paper-surface sf-msg">' +
          '<div class="sf-msg-mark">🔍</div>' +
          '<h1 class="display" style="font-size:clamp(1.8rem,5vw,2.6rem);">This site isn\'t here.</h1>' +
          '<p class="small" style="color:var(--on-paper-dim);margin-top:10px;">' +
            'There is no active GarageSaleBiz operator at <b class="mono">' + esc(location.hostname) + '</b>. ' +
            'The address may be mistyped, or the operator may no longer be running sales.' +
          '</p>' +
          '<p class="small" style="color:var(--on-paper-dim);margin-top:14px;">' +
            'Looking for a sale? Check the address on the sign or listing that sent you here.' +
          '</p>' +
          '<a class="btn btn-sm" href="https://garagesalebiz.com" style="margin-top:20px;">' +
            'What is GarageSaleBiz?</a>' +
        '</div>' +
      '</div>'
    );
  }

  // RULE 2. Deliberately NOT the page above.
  function renderError() {
    document.title = 'Temporarily unavailable';
    shell(
      '<div class="sf-center">' +
        '<div class="paper-surface sf-msg">' +
          '<div class="sf-msg-mark">⚠️</div>' +
          '<h1 class="display" style="font-size:clamp(1.8rem,5vw,2.6rem);">We couldn\'t load this site.</h1>' +
          '<p class="small" style="color:var(--on-paper-dim);margin-top:10px;">' +
            'Something went wrong at our end — this is not a problem with the address you used. ' +
            'Please try again in a moment.' +
          '</p>' +
          '<button class="btn btn-sm" type="button" style="margin-top:20px;" ' +
            'onclick="location.reload()">Try again</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ── SALE HELPERS ──────────────────────────────────────────────────────────
  // "Is this sale happening today?" computed in the visitor's own timezone from
  // date-only values, which is why GSB.parseDate anchors at noon — parsing
  // 'YYYY-MM-DD' directly would read as UTC midnight and shift the day backwards
  // for every visitor in the Americas, advertising a Friday sale as Thursday.
  function saleState(sale) {
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var start = GSB.parseDate(sale.start_date);
    var end = GSB.parseDate(sale.end_date) || start;
    if (!start) return 'unknown';
    if (today < start) return 'upcoming';
    if (today > end) return 'past';
    return 'now';
  }

  function daysUntil(sale) {
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var start = GSB.parseDate(sale.start_date);
    if (!start) return null;
    return Math.round((start - today) / 86400000);
  }

  function saleTypeLabel(t) { return GSB.SALE_TYPES[t] || 'Sale'; }

  function mapsHref(sale) {
    var q = [sale.street_address, sale.city_state_zip].filter(Boolean).join(', ');
    if (!q) return null;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  function renderSite(t, sales, itemsBySale, photosBySale) {
    document.title = t.business_name + (t.service_area ? ' — ' + t.service_area : '');
    GSB.applyBrand(t.primary_color);

    var live = sales.filter(function (s) { return saleState(s) === 'now'; });
    var soon = sales.filter(function (s) { return saleState(s) === 'upcoming'; });
    var past = sales.filter(function (s) { return saleState(s) === 'past'; });

    var html = '';

    // ── NAV ──
    html += '<nav class="nav sf-nav"><div class="nav-in">' +
      '<a class="brand" href="/">' +
        (t.logo_url
          ? '<img src="' + esc(t.logo_url) + '" alt="" class="sf-logo">'
          : '<span class="brand-mark" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M2 9h11V4l9 8-9 8v-5H2z" fill="currentColor"/></svg>' +
            '</span>') +
        '<span>' + esc(t.business_name) + '</span>' +
      '</a>' +
      '<div class="nav-links">' +
        (sales.length ? '<a href="#sales">Sales</a>' : '') +
        '<a href="#contact">Contact</a>' +
      '</div>' +
    '</div></nav>';

    // ── HERO ──
    // service_area and about_text are BLANKED when absent rather than skipped.
    // Skipping the assignment is how EstateSaleBiz's sign creator kept printing
    // a stranger's phone number: the element held a hardcoded default and the
    // guard just declined to overwrite it.
    html += '<header class="sf-hero"><div class="shell">';
    if (live.length) {
      html += '<div class="sf-flag"><span class="sf-dot"></span>Sale on right now</div>';
    } else if (soon.length) {
      var d = daysUntil(soon[0]);
      html += '<div class="sf-flag sf-flag-soon">' +
        (d === 0 ? 'Sale starts today' : d === 1 ? 'Sale starts tomorrow' : 'Next sale in ' + d + ' days') +
      '</div>';
    }
    html += '<h1 class="display sf-h1">' + esc(t.business_name) + '</h1>';
    if (t.about_text) html += '<p class="sf-about">' + esc(t.about_text) + '</p>';
    if (t.service_area) {
      html += '<p class="sf-area mono">' + esc(t.service_area) + '</p>';
    }
    html += '</div></header>';

    // ── SALES ──
    html += '<main class="shell" id="sales">';

    if (!sales.length) {
      html += '<div class="paper-surface sf-empty">' +
        '<h2 class="display" style="font-size:1.5rem;">No sale listed right now.</h2>' +
        '<p class="small" style="color:var(--on-paper-dim);margin-top:8px;">' +
          esc(t.business_name) + ' has no sale published at the moment. Check back, or get in touch below ' +
          'if you have a garage, basement, or whole house you need cleared.' +
        '</p></div>';
    }

    live.concat(soon).forEach(function (s) {
      html += renderSaleCard(s, itemsBySale[s.id] || [], photosBySale[s.id] || [], saleState(s));
    });

    if (past.length) {
      html += '<section class="sf-past"><h2 class="display sf-h2">Recent sales</h2><div class="sf-past-grid">';
      past.slice(0, 6).forEach(function (s) {
        html += '<div class="sf-past-item">' +
          '<div class="tag tag-draft">' + esc(saleTypeLabel(s.sale_type)) + '</div>' +
          '<h3 class="sf-past-title">' + esc(s.title || 'Sale') + '</h3>' +
          '<p class="tiny muted">' + esc(GSB.fmtDateRange(s.start_date, s.end_date)) + '</p>' +
          (s.city_state_zip ? '<p class="tiny muted">' + esc(s.city_state_zip) + '</p>' : '') +
        '</div>';
      });
      html += '</div></section>';
    }

    html += '</main>';

    // ── CONTACT ──
    html += '<section class="sf-contact" id="contact"><div class="shell">' +
      '<h2 class="display sf-h2">Got a sale you need run?</h2>' +
      '<p class="lede" style="margin-top:8px;">' +
        esc(t.business_name) + ' runs the whole thing — pricing, signs, staffing, and cleanup — and you ' +
        'take the biggest share of what sells.' +
      '</p><div class="sf-contact-rows">';
    if (t.phone) {
      html += '<a class="sf-contact-row" href="tel:' + esc(String(t.phone).replace(/[^\d+]/g, '')) + '">' +
        '<span class="sf-ci">📞</span><span>' + esc(t.phone) + '</span></a>';
    }
    if (t.email) {
      html += '<a class="sf-contact-row" href="mailto:' + esc(t.email) + '">' +
        '<span class="sf-ci">✉️</span><span>' + esc(t.email) + '</span></a>';
    }
    if (!t.phone && !t.email) {
      html += '<p class="small muted">Contact details coming soon.</p>';
    }
    html += '</div></div></section>';

    // ── FOOTER ──
    // Carries the operator's own name and copyright, NOT ours. This is their
    // business's website; the platform's branding does not belong in their
    // footer, and a "powered by" line here would advertise the system to their
    // competitors on their own site.
    html += '<footer class="foot"><div class="shell">' +
      '<div class="small">© ' + new Date().getFullYear() + ' ' + esc(t.business_name) +
        (t.service_area ? ' · ' + esc(t.service_area) : '') + '</div>' +
      '<p class="tiny" style="margin-top:10px;max-width:78ch;">' +
        'All items are sold as-is, where-is. Prices and availability change during a sale and items ' +
        'listed here may already be gone. ' + esc(t.business_name) + ' is an independent business.' +
      '</p></div></footer>';

    shell(html);
  }

  function renderSaleCard(s, items, photos, state) {
    var featured = items.filter(function (i) { return i.featured; });
    var rest = items.filter(function (i) { return !i.featured; });
    var ordered = featured.concat(rest);

    var h = '<article class="sign-surface stapled sf-sale">';

    h += '<div class="sf-sale-top">' +
      '<span class="tag ' + (state === 'now' ? 'tag-live' : 'tag-taken') + '">' +
        (state === 'now' ? 'Happening now' : esc(saleTypeLabel(s.sale_type))) +
      '</span>' +
      (state === 'now' ? '<span class="tag tag-taken">' + esc(saleTypeLabel(s.sale_type)) + '</span>' : '') +
    '</div>';

    h += '<h2 class="display sf-sale-title">' + esc(s.title || saleTypeLabel(s.sale_type)) + '</h2>';

    // ── WHEN & WHERE ──
    h += '<div class="sf-when">';
    h += '<div class="sf-when-block"><div class="sf-wl">When</div>' +
      '<div class="sf-wv">' + esc(GSB.fmtDateRange(s.start_date, s.end_date)) + '</div>' +
      (s.open_time || s.close_time
        ? '<div class="sf-wv-sub">' + esc(GSB.fmtTime(s.open_time)) +
          (s.close_time ? ' – ' + esc(GSB.fmtTime(s.close_time)) : '') + '</div>'
        : '') +
      (s.day_of_week ? '<div class="sf-wv-sub">' + esc(s.day_of_week) + '</div>' : '') +
    '</div>';

    // The address is present only when the homeowner agreed to publish it. When
    // show_address is false the view returns NULL, so there is nothing here to
    // leak — and the copy explains the absence rather than leaving a blank gap
    // that reads as a broken page.
    h += '<div class="sf-when-block"><div class="sf-wl">Where</div>';
    if (s.street_address) {
      var maps = mapsHref(s);
      h += '<div class="sf-wv">' + esc(s.street_address) + '</div>';
      if (s.city_state_zip) h += '<div class="sf-wv-sub">' + esc(s.city_state_zip) + '</div>';
      if (maps) {
        h += '<a class="sf-maps" href="' + esc(maps) + '" target="_blank" rel="noopener">Open in Maps →</a>';
      }
    } else if (s.city_state_zip) {
      h += '<div class="sf-wv">' + esc(s.city_state_zip) + '</div>' +
        '<div class="sf-wv-sub">Full address released on the morning of the sale.</div>';
    } else {
      h += '<div class="sf-wv-sub">Location to be announced.</div>';
    }
    h += '</div></div>';

    if (s.description) {
      h += '<p class="sf-desc">' + esc(s.description) + '</p>';
    }

    // ── PHOTOS ──
    if (photos.length) {
      h += '<div class="sf-photos">';
      photos.slice(0, 8).forEach(function (p) {
        h += '<figure class="sf-photo">' +
          '<img src="' + esc(p.photo_url) + '" alt="' + esc(p.caption || 'Sale photo') + '" loading="lazy" ' +
            'onerror="this.closest(\'figure\').remove()">' +
          (p.caption ? '<figcaption>' + esc(p.caption) + '</figcaption>' : '') +
        '</figure>';
      });
      h += '</div>';
    }

    // ── ITEMS ──
    if (ordered.length) {
      h += '<div class="sf-items-head">' +
        '<h3 class="display" style="font-size:1.15rem;">What\'s in this sale</h3>' +
        '<span class="tiny mono">' + ordered.length + ' listed · more on the day</span>' +
      '</div><div class="sf-items">';

      ordered.forEach(function (i) {
        var sold = i.status === 'sold';
        var pending = i.status === 'pending';
        h += '<div class="sf-item' + (sold ? ' sf-item-sold' : '') + '">';

        // The image falls back to the emoji tile on error rather than showing a
        // broken-image icon. A dead photo URL is a cosmetic problem and must not
        // make an operator's whole catalogue look abandoned.
        h += '<div class="sf-item-img">';
        if (i.photo_url) {
          h += '<img src="' + esc(i.photo_url) + '" alt="' + esc(i.name) + '" loading="lazy" ' +
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'">' +
            '<div class="sf-item-emoji" style="display:none;">' + esc(i.emoji || '📦') + '</div>';
        } else {
          h += '<div class="sf-item-emoji" style="display:grid;">' + esc(i.emoji || '📦') + '</div>';
        }
        if (sold) h += '<span class="sf-stamp">Sold</span>';
        else if (pending) h += '<span class="sf-stamp sf-stamp-pending">On hold</span>';
        h += '</div>';

        h += '<div class="sf-item-body">' +
          '<div class="sf-item-name">' + esc(i.name) + '</div>' +
          (i.category || i.condition
            ? '<div class="tiny muted">' +
              [i.category, i.condition].filter(Boolean).map(esc).join(' · ') + '</div>'
            : '') +
          (i.description ? '<div class="sf-item-desc">' + esc(i.description) + '</div>' : '') +
          '<div class="sf-item-price">' + (Number(i.price) > 0 ? esc(GSB.money(i.price)) : 'Make an offer') + '</div>' +
        '</div></div>';
      });
      h += '</div>';
      h += '<p class="tiny sf-item-note">Prices are asking prices and items sell as-is. ' +
        'Everything listed is subject to being sold before you arrive.</p>';
    }

    h += '</article>';
    return h;
  }

  // ── BOOT ──────────────────────────────────────────────────────────────────
  (async function () {
    renderLoading();

    var slug;
    if (IS_DEMO) {
      // The demo page forces its tenant rather than resolving one. It is a
      // marketing page on the apex, where there is no subdomain to read.
      slug = 'demo';
    } else {
      slug = GSB.resolveSlug();
      if (!slug) { renderNotFound(); return; }
    }

    var t, readFailed = false;
    try {
      var r = await GSB.supa
        .from('gsb_tenants')
        .select('slug, client_id, business_name, logo_url, phone, email, service_area, cities, primary_color, about_text')
        .eq('slug', slug)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (r.error) { readFailed = true; console.error('[sf] tenant read failed:', r.error.message); }
      t = r.data;
    } catch (e) {
      readFailed = true;
      console.error('[sf] tenant read threw:', e);
    }

    // RULE 2 in force: a failed read is an error page, a missing row is a
    // not-found page. Collapsing these would tell a live operator's customers
    // that the business does not exist every time the network hiccups.
    if (readFailed) { renderError(); return; }
    if (!t) { renderNotFound(); return; }

    // From here, every read is scoped to this operator's client_id and goes
    // through the public views — which additionally re-check that the operator is
    // active and that the sale is published, so even a crafted client_id cannot
    // pull an unpublished sale or a deactivated operator's catalogue.
    var sales = [], items = [], photos = [];
    try {
      var out = await Promise.all([
        GSB.supa.from('gsb_public_sales').select('*').eq('client_id', t.client_id).order('start_date', { ascending: false }),
        GSB.supa.from('gsb_public_items').select('*').eq('client_id', t.client_id).order('display_order', { ascending: true }),
        GSB.supa.from('gsb_public_photos').select('*').eq('client_id', t.client_id).order('display_order', { ascending: true })
      ]);
      // A failed sale read is an error; failed items or photos are cosmetic and
      // the sale still renders without them.
      if (out[0].error) { renderError(); return; }
      sales = out[0].data || [];
      items = out[1].data || [];
      photos = out[2].data || [];
    } catch (e) {
      renderError();
      return;
    }

    var itemsBySale = {}, photosBySale = {};
    items.forEach(function (i) { (itemsBySale[i.sale_id] = itemsBySale[i.sale_id] || []).push(i); });
    photos.forEach(function (p) { (photosBySale[p.sale_id] = photosBySale[p.sale_id] || []).push(p); });

    renderSite(t, sales, itemsBySale, photosBySale);
  })();
})();
