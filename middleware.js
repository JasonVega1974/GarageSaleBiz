// ═══════════════════════════════════════════════════════════════════════════
// Routing Middleware — subdomain → operator storefront, apex/www → the funnel.
//
// WHY MIDDLEWARE AND NOT vercel.json REWRITES: rewrites are fallback-only. They
// apply solely when no file matches the path, so a rewrite whose source is "/"
// is silently skipped because "/" already serves index.html. Middleware runs
// BEFORE the filesystem, so it can override the site root and branch on the
// request host. This is not a preference — the vercel.json version simply does
// not work, and it fails quietly, which is worse.
//
// The matcher is deliberately narrow: only "/" is intercepted. Every other path
// on a subdomain (dashboard.html, signs.html, /api/*, assets) is served
// unchanged, which is what makes the operator's dashboard reachable from their
// own subdomain as well as from the apex.
// ═══════════════════════════════════════════════════════════════════════════

import { rewrite, next } from '@vercel/functions';

export const config = {
  matcher: '/',
};

const APEX = 'garagesalebiz.com';

// The storefront file. One page serves every operator: it resolves the tenant
// from location.hostname at runtime, so adding an operator never touches this
// deployment.
const STOREFRONT = '/storefront.html';

export default function middleware(request) {
  const host = (request.headers.get('host') || '').toLowerCase().split(':')[0];

  // Apex, www, preview deployments and local dev all serve the funnel.
  // Checked FIRST so www.garagesalebiz.com can never be mistaken for an
  // operator subdomain named "www".
  //
  // The www exclusion is done here in JavaScript rather than in the matcher
  // regex on purpose: Vercel's matcher uses RE2, which has no lookahead, so
  // "any single-label subdomain except www" is not expressible there.
  if (
    host === APEX ||
    host === `www.${APEX}` ||
    host.endsWith('.vercel.app') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return next();
  }

  // Any other subdomain of the apex is an operator's site. The tenant may not
  // exist — that is resolved in the page, which shows an explicit "site not
  // found" state rather than silently falling back to a demo or to the funnel.
  //
  // EstateSaleBiz got this wrong in the opposite direction for a while: an
  // unknown subdomain fell through to the funnel, so a shopper who mistyped an
  // operator's name landed on the page selling the system to that operator's
  // competitors.
  if (host.endsWith(`.${APEX}`)) {
    return rewrite(new URL(STOREFRONT, request.url));
  }

  // An unrecognised host entirely — a custom domain pointed here that we know
  // nothing about, or a host header we did not expect. Serve the funnel. Custom
  // domains are deliberately NOT supported in this build: EstateSaleBiz's
  // version required a Supabase lookup on every root request to a non-apex host,
  // which is a database round trip in the routing hot path and a fail-open
  // branch to reason about. Subdomains only, until there is a reason otherwise.
  return next();
}
