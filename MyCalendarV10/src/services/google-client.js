const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { getSetting, setSetting, deleteSetting } = require('../db/settings-store');

// OAuth scopes: full read/write access to the user's calendars.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
];

// Developer-provided credentials so end users only need to sign in (no per-user setup).
function getEmbeddedCredentials() {
  // 1) environment variables
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  }
  // 2) bundled config module
  try {
    const cfg = require('../config/google-oauth');
    if (cfg && cfg.clientId && cfg.clientSecret) {
      return { clientId: cfg.clientId, clientSecret: cfg.clientSecret };
    }
  } catch {}
  // 3) JSON file in the user-data folder (configurable after install, no rebuild)
  try {
    const { getDataPath } = require('../db/connection');
    const p = path.join(getDataPath(), 'google-oauth.json');
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.clientId && j.clientSecret) return { clientId: j.clientId, clientSecret: j.clientSecret };
    }
  } catch {}
  return null;
}

async function getCredentials() {
  const embedded = getEmbeddedCredentials();
  if (embedded) return { ...embedded, embedded: true };
  return await getSetting('googleCredentials', null); // { clientId, clientSecret }
}

async function setCredentials(clientId, clientSecret) {
  await setSetting('googleCredentials', { clientId, clientSecret });
}

async function getTokens() {
  return await getSetting('googleTokens', null);
}

async function clearConnection() {
  await deleteSetting('googleTokens');
  await deleteSetting('googleSyncToken');
  await deleteSetting('googleAccountEmail');
}

/**
 * Build an OAuth2 client. redirectUri is required for the auth-code exchange
 * (loopback URI derived from the running server, e.g. http://127.0.0.1:3400/api/google/callback).
 */
async function buildOAuthClient(redirectUri) {
  const creds = await getCredentials();
  if (!creds || !creds.clientId || !creds.clientSecret) {
    throw new Error('Google OAuth 자격 증명이 설정되지 않았습니다. 설정에서 Client ID/Secret 을 입력하세요.');
  }
  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);

  // Persist refreshed tokens automatically
  client.on('tokens', async (tokens) => {
    const current = (await getTokens()) || {};
    await setSetting('googleTokens', { ...current, ...tokens });
  });

  const tokens = await getTokens();
  if (tokens) client.setCredentials(tokens);
  return client;
}

function generateAuthUrl(client) {
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',        // force refresh_token issuance
    scope: SCOPES,
  });
}

async function getAuthedCalendar() {
  const tokens = await getTokens();
  if (!tokens) throw new Error('Google 계정이 연결되지 않았습니다.');
  const client = await buildOAuthClient(); // redirect not needed once tokens exist
  return google.calendar({ version: 'v3', auth: client });
}

module.exports = {
  SCOPES,
  getCredentials,
  setCredentials,
  getTokens,
  clearConnection,
  buildOAuthClient,
  generateAuthUrl,
  getAuthedCalendar,
};
