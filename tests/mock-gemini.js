// Run by tests/run.sh. // A stand-in for Google's Gemini API: generateContent (caller lines and scorecards), auth_tokens, and a Live WebSocket.
const http = require('http');
const { WebSocketServer } = require('ws');
const log = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = (() => { try { return JSON.parse(body); } catch (e) { return {}; } })();
    log.push({ url: req.url, key: req.headers['x-goog-api-key'], size: body.length });
    if (req.url === '/log') { res.end(JSON.stringify(log)); return; }
    if (req.url.startsWith('/v1beta/auth_tokens')) {
      const sys = JSON.stringify(j.bidiGenerateContentSetup || {});
      res.end(JSON.stringify({ name: 'auth_tokens/fake-' + (/Greg Hollis|Maria Santos|Derek/.test(sys) ? 'ok' : 'other') }));
      return;
    }
    const m = /models\/([^:]+):generateContent/.exec(req.url);
    if (m) {
      const json = j.generationConfig && j.generationConfig.responseMimeType === 'application/json';
      const hasAudio = JSON.stringify(j.contents || []).includes('inlineData');
      const prompt = JSON.stringify(j.contents || []);
      let text;
      if (json) {
        const names = [...prompt.matchAll(/- ([A-Z][A-Za-z &]+): /g)].map((x) => x[1]).slice(0, 4);
        text = JSON.stringify({
          transcript: hasAudio ? [{ who: 'trainee', text: 'Thank you for calling LSH Training Law Group, this is Jamie.' }, { who: 'caller', text: 'Greg Hollis, Liberty Crest.' }] : undefined,
          verdict: 'Good, with Improvements Needed.',
          summary: 'Good, with Improvements Needed. Demonstrated a good understanding of the greeting. However, improvement is needed in verification.',
          criteria: names.map((n, i) => ({ name: n, score: 3 + (i % 2), evaluation: 'Specific evaluation for ' + n + '.' })),
          goals: [{ goal: 'x', met: 'yes', evidence: '"this is Jamie"' }, { goal: 'y', met: 'no', evidence: 'not asked' }],
          note: 'The callback number is missing.', tips: ['Verify first.', 'Read the number back.']
        });
      } else text = 'Hi, this is Maria Santos. When is my next chiropractor visit?';
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }));
      return;
    }
    res.statusCode = 404; res.end('{}');
  });
});
const wss = new WebSocketServer({ server, path: '/live' });
wss.on('connection', (ws, req) => {
  let audioIn = 0, said = 0;
  const tone = (secs) => { const n = 24000 * secs, b = Buffer.alloc(n * 2); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 24000 * 2 * Math.PI * 330) * 8000), i * 2); return b.toString('base64'); };
  const speak = (text) => {
    ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: tone(0.6) } }] }, outputTranscription: { text } } }));
    ws.send(JSON.stringify({ serverContent: { turnComplete: true } }));
  };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.setup) { log.push({ live: 'setup', token: /access_token=([^&]+)/.exec(req.url)[1] }); ws.send(JSON.stringify({ setupComplete: {} })); return; }
    if (m.realtimeInput && m.realtimeInput.audio) {
      audioIn++;
      if (audioIn === 15) { ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Thank you for calling LSH Training Law Group, this is Jamie.' } } })); speak('Hi, this is Maria Santos. When is my next chiropractor visit?'); }
      if (audioIn === 45) { ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Can I have your date of birth?' } } })); speak('March 22, 1988.'); }
    }
    if (m.realtimeInput && m.realtimeInput.text) { log.push({ live: 'text', text: m.realtimeInput.text }); if (!/hold|transferring/.test(m.realtimeInput.text) && said++ < 3) speak('Okay.'); }
  });
});
server.listen(9911, '127.0.0.1', () => console.log('mock gemini on 9911'));
