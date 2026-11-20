// Account connection (Settings › Stream): the user's own app registration (Client ID) signs in to the
// streaming service, and the stream key is fetched into the profile. Nothing is kept but the account name:
// the sign-in token is used once and dropped.
//
//   Twitch  — device code flow (https://dev.twitch.tv/console/apps, client type "Public"): the user opens
//             the service's page and types the code shown here. Scope channel:read:stream_key.
//   YouTube — authorization code + PKCE with a 127.0.0.1 redirect (Google Cloud console, OAuth client type
//             "Desktop app", YouTube Data API v3 enabled): the browser signs in and comes back here.
//
// The calls go through `io`: { http(method, url, { headers, form }) → { status, body }, openUrl(url),
// loopback() → port, waitRedirect(port) → query string, sleep(ms), random(n) → Uint8Array, sha256(text) → bytes }.

export const ACCOUNT_SERVICES = {
  twitch: { console: 'https://dev.twitch.tv/console/apps', secret: false },
  youtube: { console: 'https://console.cloud.google.com/apis/credentials', secret: true },
};

const fail = (code, detail = '') => Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
const json = (answer) => { try { return JSON.parse(answer?.body || '{}'); } catch { return {}; } };

/** base64url without padding (PKCE). */
export function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function twitchConnect({ clientId, io, onCode = () => {}, signal = {} }) {
  if (!String(clientId || '').trim()) throw fail('no-client-id');
  const scopes = 'channel:read:stream_key';
  const device = await io.http('POST', 'https://id.twitch.tv/oauth2/device', { form: { client_id: clientId, scopes } });
  const d = json(device);
  if (device.status !== 200 || !d.device_code) throw fail('twitch-device', d.message ?? device.status);
  onCode({ code: d.user_code, url: d.verification_uri });
  await io.openUrl(d.verification_uri);
  let interval = Math.max(1, d.interval || 5);
  const end = Date.now() + (d.expires_in || 1800) * 1000;
  let token = null;
  while (!token) {
    if (signal.cancelled) throw fail('cancelled');
    if (Date.now() > end) throw fail('expired');
    await io.sleep(interval * 1000);
    if (signal.cancelled) throw fail('cancelled');
    const answer = await io.http('POST', 'https://id.twitch.tv/oauth2/token', { form: { client_id: clientId, scopes, device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } });
    const t = json(answer);
    if (answer.status === 200 && t.access_token) token = t.access_token;
    else if (t.message === 'authorization_pending') continue;
    else if (t.message === 'slow_down') interval += 5;
    else throw fail('twitch-token', t.message ?? answer.status);
  }
  const headers = { Authorization: `Bearer ${token}`, 'Client-Id': clientId };
  const user = json(await io.http('GET', 'https://api.twitch.tv/helix/users', { headers })).data?.[0];
  if (!user?.id) throw fail('twitch-user');
  const key = json(await io.http('GET', `https://api.twitch.tv/helix/streams/key?broadcaster_id=${encodeURIComponent(user.id)}`, { headers })).data?.[0]?.stream_key;
  if (!key) throw fail('twitch-key');
  return { login: user.display_name || user.login, key };
}

export async function youtubeConnect({ clientId, clientSecret = '', io, signal = {} }) {
  if (!String(clientId || '').trim()) throw fail('no-client-id');
  const verifier = base64url(io.random(32));
  const challenge = base64url(await io.sha256(verifier));
  const state = base64url(io.random(16));
  const port = await io.loopback();
  const redirect = `http://127.0.0.1:${port}`;
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.readonly', code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'consent' });
  await io.openUrl(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
  const back = new URLSearchParams(await io.waitRedirect(port, signal));
  if (signal.cancelled) throw fail('cancelled');
  if (back.get('error')) throw fail('youtube-denied', back.get('error'));
  if (back.get('state') !== state || !back.get('code')) throw fail('youtube-state');
  const form = { code: back.get('code'), client_id: clientId, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirect };
  if (clientSecret) form.client_secret = clientSecret;
  const tokenAnswer = await io.http('POST', 'https://oauth2.googleapis.com/token', { form });
  const token = json(tokenAnswer).access_token;
  if (!token) throw fail('youtube-token', json(tokenAnswer).error_description ?? tokenAnswer.status);
  const headers = { Authorization: `Bearer ${token}` };
  const streams = json(await io.http('GET', 'https://www.googleapis.com/youtube/v3/liveStreams?part=cdn,snippet&mine=true&maxResults=5', { headers })).items ?? [];
  const stream = streams.find((s) => s.cdn?.ingestionInfo?.streamName);
  if (!stream) throw fail('youtube-no-stream');
  const channel = json(await io.http('GET', 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers })).items?.[0]?.snippet?.title;
  return { login: channel || stream.snippet?.title || 'YouTube', key: stream.cdn.ingestionInfo.streamName };
}

export function connectAccount(service, options) {
  if (service === 'twitch') return twitchConnect(options);
  if (service === 'youtube') return youtubeConnect(options);
  throw fail('unsupported-service');
}
