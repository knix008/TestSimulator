/**
 * Embedded Google OAuth client credentials (optional).
 *
 * If you (the developer) fill these in, end users only need to click
 * "Sign in with Google" — they no longer create their own Client ID.
 *
 * These are for a **Desktop app** OAuth client. For desktop apps the client
 * secret is NOT treated as confidential by Google, so bundling it is acceptable.
 *
 * Resolution order (see src/services/google-client.js):
 *   1. Environment variables  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   2. This file (below)
 *   3. <userData>/google-oauth.json   (post-install, no rebuild needed)
 *   4. In-app manual entry (fallback)
 *
 * Leave blank to keep the manual-entry fallback.
 */
module.exports = {
  clientId: '31404825614-ef1ef9a8l89gt5cgishj702h2ul6smnc.apps.googleusercontent.com',
  clientSecret: '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',
};
