/* Google Gemini: the AI behind practice callers and call scoring.
   Keys: the same pool as the LSH Foundational Worker, GEMINI_API_KEY5 … GEMINI_API_KEY9,
   then GEMINI_API_KEY, GEMINI_API_KEY1, GEMINI_API_KEY2. Limits are per Google Cloud project,
   so each key should come from its own project. Each request starts on the next key in turn;
   a key that hits its limit rests and the next one takes over.
   GEMINI_BASE (tests only) points the Worker at a stand-in for Google.

   🔑 The Portal's keys as the fallback: with AI_GATEWAY_SECRET set (the same secret graded calls already go to the
   Portal with), a request that every key here has failed (out of credits, at their limit, rejected) — or every
   request, when this Worker has no key of its own — goes to the LSH Training Portal's shared AI gateway
   (<PORTAL_URL>/api/ai-gateway), which answers from the Portal's own Gemini key pool. Text requests and Gemini Live
   tokens go there; scoring a recording (audio) needs a key here, as the gateway takes text only. */
const POOL = ['GEMINI_API_KEY5', 'GEMINI_API_KEY6', 'GEMINI_API_KEY7', 'GEMINI_API_KEY8', 'GEMINI_API_KEY9'];
const SPARE = ['GEMINI_API_KEY', 'GEMINI_API_KEY1', 'GEMINI_API_KEY2'];
export const TEXT_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
export const LIVE_MODELS = ['gemini-3.8-live', 'gemini-3.1-flash-live-preview', 'gemini-2.5-flash-native-audio-preview-12-2025'];
const LIVE_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

const base = (env) => (env.GEMINI_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
export const liveWsUrl = (env) => env.LIVE_WS_URL || LIVE_WS;

export function keyNames(env) {
  const seen = new Set();
  return [...POOL, ...SPARE].filter((n) => { const v = String(env[n] || '').trim(); if (!v || seen.has(v)) return false; seen.add(v); return true; });
}
const GATEWAY_URL = 'https://cm-training-activity.pages.dev';
const gatewayKey = (env) => String((env && env.AI_GATEWAY_SECRET) || '').trim();
const gatewayUrl = (env) => String((env && env.PORTAL_URL) || GATEWAY_URL).replace(/\/+$/, '') + '/api/ai-gateway';
export const hasGateway = (env) => !!gatewayKey(env);
export const hasAI = (env) => keyNames(env).length > 0 || hasGateway(env);

// One request to the Portal's AI gateway → its JSON answer (or { success: false, error }).
async function viaGateway(env, body) {
  let r, data;
  try {
    r = await fetch(gatewayUrl(env), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gateway-Key': gatewayKey(env) }, body: JSON.stringify(Object.assign({ module: 'ringchannel' }, body)) });
    data = await r.json().catch(() => ({}));
  } catch (e) { return { success: false, status: 502, error: 'The Portal\'s AI gateway couldn\'t be reached: ' + (e.message || e) }; }
  if (!r.ok || !data.success) return { success: false, status: r.status, error: data.error || `The Portal's AI gateway answered ${r.status}` };
  return data;
}
// The conversation as the gateway takes it ({ role, text }), or null when a part isn't text (a recording).
function asMessages(contents) {
  const out = [];
  for (const c of contents || []) {
    const parts = c.parts || [];
    if (parts.some((x) => x.text == null)) return null;
    out.push({ role: c.role === 'model' ? 'model' : 'user', text: parts.map((x) => x.text).join('\n') });
  }
  return out.length ? out : null;
}

let turn = Math.floor(Math.random() * 1000);
const rest = new Map();   // "<key>|<model>" → rest until
const resting = (k, m) => Math.max(rest.get(k + '|*') || 0, rest.get(k + '|' + m) || 0) > Date.now();
function keyOrder(env) {
  const names = keyNames(env);
  const pool = names.filter((n) => POOL.includes(n)), spare = names.filter((n) => !POOL.includes(n));
  const s = pool.length ? turn++ % pool.length : 0;
  return [...pool.slice(s), ...pool.slice(0, s), ...spare];
}

/* One generateContent request, tried model by model and key by key.
   parts: the user turn's parts ([{text}] or [{inlineData}, {text}]). Returns { text, model } or throws. */
export async function generate(env, opts) {
  let own = null;
  if (keyNames(env).length) { try { return await generateHere(env, opts); } catch (e) { own = e; } }
  const messages = hasGateway(env) ? asMessages(opts.contents || [{ role: 'user', parts: opts.parts }]) : null;
  if (!messages) throw own || new Error('No AI key is set on this Worker (add GEMINI_API_KEY5 as a secret, or AI_GATEWAY_SECRET to use the Portal\'s keys).');
  const g = await viaGateway(env, { user: opts.user || 'ringchannel', system: opts.system || '', messages, json: !!opts.json, maxTokens: Math.min(opts.maxTokens || 1024, 4096) });
  if (g.success && g.text) return { text: g.text, model: g.model || 'portal', via: 'portal' };
  console.error('gemini: the Portal\'s AI gateway failed too:', g.error);
  throw own || new Error(g.error || 'The AI couldn\'t answer.');
}

async function generateHere(env, { system, parts, json, maxTokens, temperature, contents }) {
  const keys = keyOrder(env);
  const models = [env.GEMINI_MODEL, ...TEXT_MODELS].filter((v, i, a) => v && a.indexOf(v) === i);
  const payload = {
    contents: contents || [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: Math.min(Math.max((maxTokens || 1024) * 2, 2048), 16384), temperature: temperature == null ? 0.4 : temperature }
  };
  if (json) payload.generationConfig.responseMimeType = 'application/json';
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  let last = null, limit = null;
  for (const model of models) {
    for (const name of keys.filter((n) => !resting(n, model))) {
      const p = JSON.parse(JSON.stringify(payload));
      p.generationConfig.thinkingConfig = /2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
      const send = (body) => fetch(`${base(env)}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env[name] }, body: JSON.stringify(body)
      });
      let r, data;
      try { r = await send(p); data = await r.json().catch(() => ({})); } catch (e) { last = { status: 502, msg: String(e.message || e) }; continue; }
      if (r.status === 400 && /thinking/i.test((data.error && data.error.message) || '')) {
        delete p.generationConfig.thinkingConfig; r = await send(p); data = await r.json().catch(() => ({}));
      }
      if (r.ok) {
        const cand = (data.candidates || [])[0] || {};
        const text = ((cand.content && cand.content.parts) || []).filter((x) => !x.thought).map((x) => x.text || '').join('');
        if (!text) { last = { status: 502, msg: `Gemini returned no text (${cand.finishReason || 'blocked'})` }; break; }
        return { text, model };
      }
      const msg = (data.error && data.error.message) || `Gemini error ${r.status}`;
      last = { status: r.status, msg };
      if (r.status === 429) { limit = last; rest.set(name + '|' + model, Date.now() + (/per.?day|daily/i.test(msg) ? 3600000 : 60000)); continue; }
      if ((r.status === 400 && /API key/i.test(msg)) || r.status === 401 || r.status === 403) { rest.set(name + '|*', Date.now() + 600000); continue; }
      if (r.status === 404) break;
      if ([500, 503].includes(r.status)) continue;
      throw new Error(msg);
    }
  }
  if (limit) last = limit;
  throw new Error(last ? (last.status === 429 ? 'The AI is at its free-tier limit right now; try again in a minute. ' : '') + last.msg : 'Every AI key is resting after reaching its limit; try again in a minute.');
}

export function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

/* A single-use Gemini Live token with the caller's script locked in (the browser talks straight
   to Google with it; the key never leaves the Worker). Tries keys, then models. `skip` lists
   "<key>|<model>" pairs an earlier try couldn't open. */
export async function liveToken(env, setupFor, maxMinutes, skip, user) {
  const here = keyNames(env).length ? await liveTokenHere(env, setupFor, maxMinutes, skip) : null;
  if (here && (here.ok || here.code === 'REGION' || !hasGateway(env))) return here;
  if (!hasGateway(env)) return { ok: false, code: 'NOT_CONFIGURED', error: 'AI callers aren\'t set up on this site yet (no GEMINI_API_KEY secrets).' };
  // The Portal mints the token with its own keys (and counts the call against its shared budget).
  const models = [env.LIVE_MODEL, ...LIVE_MODELS].filter((v, i, a) => v && a.indexOf(v) === i);
  let last = null;
  for (const model of models) {
    const pair = 'portal|' + model;
    if ((skip || []).includes(pair)) continue;
    const g = await viaGateway(env, { action: 'live-token', user: user || 'ringchannel', setup: setupFor(model), model, maxMinutes });
    if (g.success && g.token) return { ok: true, token: g.token, model, pair, url: liveWsUrl(env), via: 'portal' };
    last = g;
    if (g.status === 429) break;   // the shared budget says wait: another model won't help
  }
  return here || { ok: false, code: last && last.status === 429 ? 'BUSY' : 'TOKEN_FAILED', error: last ? 'Live voice couldn\'t start: ' + last.error : 'Live voice couldn\'t start.' };
}

async function liveTokenHere(env, setupFor, maxMinutes, skip) {
  const keys = keyOrder(env);
  const models = [env.LIVE_MODEL, ...LIVE_MODELS].filter((v, i, a) => v && a.indexOf(v) === i);
  let last = null;
  for (const model of models) {
    for (const name of keys) {
      const pair = name + '|' + model;
      if ((skip || []).includes(pair) || resting(name, 'live:' + model)) continue;
      const now = Date.now();
      let r, data;
      try {
        r = await fetch(`${base(env)}/v1beta/auth_tokens`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env[name] },
          body: JSON.stringify({ uses: 1, expireTime: new Date(now + (maxMinutes + 2) * 60000).toISOString(), newSessionExpireTime: new Date(now + 2 * 60000).toISOString(), bidiGenerateContentSetup: setupFor(model) })
        });
        data = await r.json().catch(() => ({}));
      } catch (e) { last = { status: 502, error: String(e.message || e) }; continue; }
      if (r.ok && data.name) return { ok: true, token: data.name, model, pair, url: liveWsUrl(env) };
      last = { status: r.status, error: (data.error && data.error.message) || `error ${r.status}` };
      if (/location is not supported/i.test(last.error)) return { ok: false, code: 'REGION', error: 'Gemini Live isn\'t available from this region yet.' };
      if (r.status === 429) { rest.set(name + '|live:' + model, Date.now() + 60000); continue; }
      if (r.status === 401 || r.status === 403 || (r.status === 400 && /API key/i.test(last.error))) { rest.set(name + '|*', Date.now() + 600000); continue; }
      break;   // anything else: the next model
    }
  }
  return { ok: false, code: last && last.status === 429 ? 'BUSY' : 'TOKEN_FAILED', error: last ? (last.status === 429 ? 'The voice service is busy right now.' : 'Live voice couldn\'t start: ' + last.error) : 'Every AI key is resting; try again in a minute.' };
}
