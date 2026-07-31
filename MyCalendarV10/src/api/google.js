const express = require('express');
const { google } = require('googleapis');
const {
  getCredentials, setCredentials, getTokens, clearConnection,
  buildOAuthClient, generateAuthUrl,
} = require('../services/google-client');
const { getSetting, setSetting } = require('../db/settings-store');
const { runSync } = require('../services/google-sync');

const router = express.Router();

function redirectUriFor(req) {
  // Loopback redirect derived from the running server (works for web + electron).
  const host = req.headers.host; // e.g. 127.0.0.1:3400
  const proto = req.protocol || 'http';
  return `${proto}://${host}/api/google/callback`;
}

// Connection status
router.get('/status', async (req, res, next) => {
  try {
    const creds = await getCredentials();
    const tokens = await getTokens();
    res.json({
      hasCredentials: !!(creds && creds.clientId && creds.clientSecret),
      embedded: !!(creds && creds.embedded),
      connected: !!tokens,
      email: await getSetting('googleAccountEmail', null),
      lastSync: await getSetting('googleLastSync', null),
    });
  } catch (err) { next(err); }
});

// Save OAuth client credentials (from Google Cloud Console)
router.post('/credentials', async (req, res, next) => {
  try {
    const { clientId, clientSecret } = req.body || {};
    if (!clientId || !clientSecret) return res.status(400).json({ error: 'clientId, clientSecret 는 필수입니다.' });
    await setCredentials(clientId.trim(), clientSecret.trim());
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Get the consent URL the user must visit
router.get('/auth-url', async (req, res, next) => {
  try {
    const redirectUri = redirectUriFor(req);
    await setSetting('googleRedirectUri', redirectUri);
    const client = await buildOAuthClient(redirectUri);
    res.json({ url: generateAuthUrl(client) });
  } catch (err) { next(err); }
});

// OAuth redirect target — exchanges the code for tokens
router.get('/callback', async (req, res, next) => {
  try {
    const { code, error } = req.query;
    if (error) return res.send(renderResultPage(false, `인증이 취소되었습니다: ${error}`));
    if (!code) return res.send(renderResultPage(false, '인증 코드가 없습니다.'));

    const redirectUri = await getSetting('googleRedirectUri', redirectUriFor(req));
    const client = await buildOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    await setSetting('googleTokens', tokens);
    client.setCredentials(tokens);

    // Fetch account email for display
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const me = await oauth2.userinfo.get();
      if (me.data.email) await setSetting('googleAccountEmail', me.data.email);
    } catch {}

    res.send(renderResultPage(true, 'Google 계정이 연결되었습니다. 이 창을 닫아도 됩니다.'));
  } catch (err) {
    res.send(renderResultPage(false, err.message || String(err)));
  }
});

// Run bidirectional sync now
router.post('/sync', async (req, res, next) => {
  try {
    const summary = await runSync();
    res.json({ ok: true, summary, lastSync: await getSetting('googleLastSync', null) });
  } catch (err) { next(err); }
});

// Disconnect
router.post('/disconnect', async (req, res, next) => {
  try {
    await clearConnection();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

function renderResultPage(ok, message) {
  const color = ok ? '#22c55e' : '#ef4444';
  const icon = ok ? '✓' : '✕';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyCalendar — Google 연동</title>
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0}
  .card{text-align:center;padding:40px 48px;background:#1e293b;border-radius:16px;
    box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .icon{width:72px;height:72px;border-radius:50%;background:${color};color:#fff;
    font-size:40px;line-height:72px;margin:0 auto 20px}
  h1{font-size:20px;margin:0 0 8px} p{color:#94a3b8;margin:0}
</style></head><body>
  <div class="card"><div class="icon">${icon}</div>
  <h1>${ok ? '연결 완료' : '연결 실패'}</h1><p>${message}</p></div>
  <script>setTimeout(()=>{try{window.close()}catch(e){}},2500)</script>
</body></html>`;
}

module.exports = (req, res, next) => router(req, res, next);
