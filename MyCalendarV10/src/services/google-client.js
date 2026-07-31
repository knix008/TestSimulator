const { google } = require('googleapis');
const { getSetting, setSetting, deleteSetting } = require('../db/settings-store');

// OAuth scopes: full read/write access to the user's calendars.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
];

async function getCredentials() {
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
