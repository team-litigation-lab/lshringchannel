/* =========================================================
   🏠 Opening Ring Channel from the LSH Training Portal
   ---------------------------------------------------------
   The Portal (cm-training-activity.pages.dev) signs a trainee in once and
   opens Ring Channel through /api/launch?tool=ringchannel, which sends them
   here with a short-lived ticket: ?ticket=<payload>.<signature>.
     payload   = base64url(JSON { first, last, b: batch, exp })   (an admin's is { r: 'a', exp })
     signature = base64url(HMAC-SHA256("portal-sso:" + PORTAL_SSO_SECRET, payload))
   This checks the ticket one of two ways:
     • with PORTAL_SSO_SECRET, when it's set on this Worker (the same secret as the Portal's);
     • otherwise by asking the Portal itself (POST /api/verify-ticket), as the CMS does, so it
       works with no secret to copy.
   A trainee's ticket signs them in (their Ring Channel id is name--batch, as on every LSH
   platform). An administrator's never does: they type the trainer passphrase here.
   ========================================================= */
export const PORTAL_URL = 'https://cm-training-activity.pages.dev';
const MAX_AHEAD_MS = 10 * 60 * 1000;
const enc = new TextEncoder();

const portalUrl = (env) => String((env && env.PORTAL_URL) || PORTAL_URL).replace(/\/+$/, '');
export const portalHome = (env) => portalUrl(env) + '/programs.html';

function b64url(bytes) {
  let s = '';
  new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function who(t) {
  if (t.r === 's') return { ok: true, system: true };
  if (t.r === 'a') return { ok: true, admin: true };
  const first = String(t.first || '').trim(), last = String(t.last || '').trim(), batch = String(t.b != null ? t.b : t.batch || '').trim();
  if (!first || !last) return { ok: false, code: 'format' };
  return { ok: true, first, last, batch };
}

// Checks a ticket with the shared secret. → { ok, first, last, batch } | { ok, admin } | { ok, system } | { ok: false, code }
export async function verifyLocal(secret, ticket, now = Date.now()) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: 'format' };
  const key = await crypto.subtle.importKey('raw', enc.encode('portal-sso:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  if (!same(b64url(await crypto.subtle.sign('HMAC', key, enc.encode(parts[0]))), parts[1])) return { ok: false, code: 'signature' };
  let t;
  try { t = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch (e) { return { ok: false, code: 'format' }; }
  const exp = Number(t && t.exp);
  if (!exp || now > exp || exp - now > MAX_AHEAD_MS) return { ok: false, code: 'expired' };
  return who(t);
}

export async function readPortalTicket(env, ticket) {
  const t = String(ticket || '').trim();
  if (!t || t.length > 2000) return { ok: false, code: 'format' };
  const secret = String(env.PORTAL_SSO_SECRET || '').trim();
  if (secret) return verifyLocal(secret, t);
  // No secret here: the Portal says whether it signed the ticket (and who it's for).
  try {
    const r = await fetch(portalUrl(env) + '/api/verify-ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: t }) });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) return { ok: false, code: j && j.code === 'expired' ? 'expired' : 'refused' };   // the Portal didn't sign it, or not for now
    return who({ r: j.system ? 's' : j.admin ? 'a' : undefined, first: j.first, last: j.last, b: j.batch });
  } catch (e) {
    return { ok: false, code: 'unreachable' };
  }
}
