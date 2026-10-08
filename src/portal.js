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
   A trainee's ticket signs them in as a trainee (their Ring Channel id is name--batch, as on
   every LSH platform); an administrator's signs them in as a trainer, under their Portal name
   ({ r: 'a', n: name }: the Portal makes those for Ring Channel only). There's no sign-in form:
   Ring Channel opens from the Portal. Each ticket works once (the Switchboard keeps the used ones).
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
  if (t.r === 'a') return { ok: true, admin: true, name: String(t.n || '').trim().replace(/\s+/g, ' ').slice(0, 60) };
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
  return Object.assign(who(t), { sig: parts[1], exp });
}
// The ticket's own expiry (to keep a used ticket on file until then), read without trusting it.
function expOf(payload) {
  try { return Number(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))).exp) || 0; } catch (e) { return 0; }
}

/* A ticket of our own, for sending someone on to another LSH platform signed in: 🔎 Case lookup
   opens a case file in the CMS Training Library as the trainee who is on the call, instead of
   dropping them on its sign-in page. It needs PORTAL_SSO_SECRET here (the same secret the Portal
   signs with, which the CMS checks); without it there's no ticket to make and the plain link is used.
   who: { admin, name } for a trainer, or { first, last, batch } for a trainee. */
export async function mintTicket(env, who, minutes) {
  const secret = String(env.PORTAL_SSO_SECRET || '').trim();
  if (!secret) return '';
  const exp = Date.now() + Math.min(10, Math.max(1, Number(minutes) || 5)) * 60000;
  const t = who && who.admin ? { r: 'a', n: String(who.name || '').slice(0, 60), exp }
    : { first: String((who && who.first) || '').slice(0, 40), last: String((who && who.last) || '').slice(0, 40), b: String((who && who.batch) || '').slice(0, 20), exp };
  if (!t.r && (!t.first || !t.last)) return '';
  const payload = b64url(enc.encode(JSON.stringify(t)));
  const key = await crypto.subtle.importKey('raw', enc.encode('portal-sso:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return payload + '.' + b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
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
    const [payload, sig] = t.split('.');
    return Object.assign(who({ r: j.system ? 's' : j.admin ? 'a' : undefined, n: j.name, first: j.first, last: j.last, b: j.batch }), { sig: sig || '', exp: expOf(payload || '') || Date.now() + MAX_AHEAD_MS });
  } catch (e) {
    return { ok: false, code: 'unreachable' };
  }
}
