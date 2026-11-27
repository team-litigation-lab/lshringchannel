/* Sign-in tokens, the same shape as the other LSH platforms:
   "<role>.<subject>.<expiry>.<hmac>"  role a = trainer (subject: their name), t = trainee (subject: trainee id).
   Trainee ids match the LSH portals' generateTraineeId (name--batch slugs). */
const enc = new TextEncoder();

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const secretOf = (env) => env.SESSION_SECRET || env.ADMIN_PASSPHRASE || '';

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* 🔓 How long a sign-in lasts with nobody using it: 8 hours. Closing the tab or the browser doesn't sign anyone out (the
   token is kept in the browser); every signed-in request is answered with a fresh 8-hour token (X-Session-Token,
   src/worker.js) and an open LSH CommX page asks for one every few minutes (public/js/api.js), so a sign-in ends only
   after 8 hours with no activity, on Log out, or when a trainer archives the trainee. */
export const SESSION_IDLE_HOURS = 8;
export const SESSION_HEADER = 'X-Session-Token';

export async function makeToken(env, role, subject, hours = SESSION_IDLE_HOURS) {
  const exp = Date.now() + hours * 3600 * 1000;
  const body = `${role}.${encodeURIComponent(subject).replace(/\./g, '%2E')}.${exp}`;   // a "." in a name would split the token
  return `${body}.${await hmac(secretOf(env), body)}`;
}

export async function readTokenString(env, t) {
  if (!secretOf(env)) return null;
  const parts = String(t || '').split('.');
  if (parts.length !== 4) return null;
  const [role, subj, exp, sig] = parts;
  if (!/^[at]$/.test(role) || Date.now() > Number(exp)) return null;
  const good = await hmac(secretOf(env), `${role}.${subj}.${exp}`);
  if (!safeEqual(good, sig)) return null;
  let id; try { id = decodeURIComponent(subj); } catch (e) { return null; }
  return { role, id, exp: Number(exp) };
}

/* A fresh 8-hour token for this sign-in, or null when the one it came with already runs that long (renewed at most
   every few minutes). A token from before the 8-hour rule (30 days, 12 hours) is replaced on its next request. */
export async function renewToken(env, tok, now = Date.now()) {
  if (!tok || !tok.exp) return null;
  const full = SESSION_IDLE_HOURS * 3600 * 1000, left = tok.exp - now;
  if (left > full - 5 * 60 * 1000 && left <= full + 60 * 1000) return null;
  return makeToken(env, tok.role, tok.id);
}

export async function readToken(env, request) {
  const h = request.headers.get('Authorization') || '';
  return readTokenString(env, h.startsWith('Bearer ') ? h.slice(7) : '');
}

export function slugPart(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
export function traineeId(name, batch) {
  let slug = slugPart(name).slice(0, 40);
  if (!slug) { let h = 0; for (const c of String(name || '')) h = (h * 31 + c.codePointAt(0)) >>> 0; slug = 'trainee-' + h.toString(36); }
  const b = slugPart(batch).slice(0, 20);
  return b ? `${slug}--${b}` : slug;
}
