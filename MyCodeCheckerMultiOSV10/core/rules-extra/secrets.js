'use strict';

// Credential formats from more providers (gitleaks-style), every language.
// They complement core/rules.js (private keys, AWS key ids, GitHub, Slack,
// generic passwords / tokens, connection strings).
//
// Sample tokens are assembled at run time from a seeded generator so that no
// real-looking credential literal sits in this file (push protection and the
// checker itself would flag it).

const { maker, entropy } = require('./util');
const base = require('../rules');

const R = maker('secrets', ['*']);

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const HEX = '0123456789abcdef';
const B64 = ALNUM + '+/';
const URLSAFE = ALNUM + '_-';
let seed = 20261022;
function gen(len, chars = ALNUM) {
  let out = '';
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out += chars[(seed >>> 12) % chars.length];
  }
  return out;
}
const j = (...parts) => parts.join('');

const PLACEHOLDER = /\$\{|\{\{|<[A-Z_ -]+>|example|placeholder|changeme|your[-_]|dummy|sample|xxxxx|\*\*\*\*|redacted/i;
const notPlaceholder = (raw) => PLACEHOLDER.test(raw);

const common = (id, sev, re, en, ko, bad, good, opts = {}) =>
  R(id, 'V', sev, opts.debt || 60, ['cwe-798', 'owasp-a07', 'secrets', ...(opts.tags || [])], re, en, ko, bad, good,
    { scope: 'any', skip: opts.skip === undefined ? notPlaceholder : opts.skip, lang: opts.lang });

common('stripe-secret-key', 'BL',
  /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/,
  ['Stripe live secret key', 'A live Stripe key can create charges and read customer data.', 'Roll the key in the Stripe dashboard and load it from a secret store.'],
  ['Stripe 운영 비밀 키', '운영 Stripe 키는 결제를 만들고 고객 데이터를 읽을 수 있습니다.', 'Stripe 대시보드에서 키를 교체하고 시크릿 저장소에서 읽으세요.'],
  j('const stripe = Stripe("sk_', 'live_', gen(32), '");'), 'const stripe = Stripe(process.env.STRIPE_KEY);');
common('google-api-key', 'CR',
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  ['Google API key', 'Google API keys are billed to the project and often allow more APIs than intended.', 'Restrict or delete the key and load it at run time.'],
  ['Google API 키', 'Google API 키는 프로젝트에 과금되며 의도보다 많은 API를 허용하는 경우가 많습니다.', '키를 제한하거나 지우고 실행 시점에 읽으세요.'],
  j('mapsKey: "AIza', gen(35, URLSAFE), '",'), 'mapsKey: window.MAPS_KEY,');
common('google-oauth-secret', 'CR',
  /\bGOCSPX-[0-9A-Za-z_-]{28}\b/,
  ['Google OAuth client secret', 'The client secret lets anyone impersonate your OAuth app.', 'Reset the secret in the Cloud console and keep it server-side.'],
  ['Google OAuth 클라이언트 시크릿', '클라이언트 시크릿이 있으면 누구나 OAuth 앱을 사칭할 수 있습니다.', 'Cloud 콘솔에서 시크릿을 재설정하고 서버 쪽에만 두세요.'],
  j('GOOGLE_CLIENT_SECRET=GOCSPX-', gen(28, URLSAFE)), 'GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}');
common('gcp-service-account', 'BL',
  /"type"\s*:\s*"service_account"/,
  ['GCP service account key file', 'A service account JSON key grants that account\'s roles to whoever holds it.', 'Delete the key, use workload identity, and never commit key files.'],
  ['GCP 서비스 계정 키 파일', '서비스 계정 JSON 키는 가진 사람에게 그 계정의 역할을 줍니다.', '키를 지우고 워크로드 ID를 쓰며 키 파일을 커밋하지 마세요.'],
  '  "type": "service_account",', '  "type": "authorized_user_template",', { skip: null, lang: 'json' });
common('azure-storage-key', 'BL',
  /\bAccountKey=[A-Za-z0-9+\/]{86}==/,
  ['Azure storage account key', 'The account key gives full control of every container in the account.', 'Rotate the key and use a managed identity or SAS with a short expiry.'],
  ['Azure 스토리지 계정 키', '계정 키는 계정의 모든 컨테이너를 완전히 제어하게 합니다.', '키를 교체하고 관리 ID나 짧은 만료의 SAS를 쓰세요.'],
  j('DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=', gen(86, B64), '==;'), 'DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=${STORAGE_KEY};');
common('azure-sas-token', 'CR',
  /[?&]sig=[A-Za-z0-9%+\/]{30,}/,
  ['Azure SAS token', 'A shared access signature grants access to storage until it expires.', 'Revoke it (rotate the key or policy) and generate SAS tokens at run time.'],
  ['Azure SAS 토큰', '공유 액세스 서명은 만료될 때까지 스토리지 접근을 허용합니다.', '키나 정책을 바꿔 폐기하고 SAS 토큰은 실행 시점에 만드세요.'],
  j('https://acct.blob.core.windows.net/c/a.txt?sv=2022-11-02&sp=r&sig=', gen(44, ALNUM), '%3D'), 'https://acct.blob.core.windows.net/c/a.txt',
  { skip: (raw) => !/[?&]s[vpert]=/.test(raw) || notPlaceholder(raw) });
common('azure-ad-client-secret', 'CR',
  /(?<![\w~.-])[a-zA-Z0-9_~.-]{3}\dQ~[a-zA-Z0-9_~.-]{31,34}(?![\w~.-])/,
  ['Azure AD client secret', 'The secret authenticates as the app registration and its granted permissions.', 'Remove it in Entra ID and use certificates or managed identities.'],
  ['Azure AD 클라이언트 시크릿', '이 시크릿은 앱 등록과 그 권한으로 인증합니다.', 'Entra ID에서 지우고 인증서나 관리 ID를 쓰세요.'],
  j('clientSecret: "', gen(3), '8Q~', gen(34, ALNUM + '_~.-'), '"'), 'clientSecret: config.clientSecret');
common('aws-secret-access-key', 'BL',
  /\baws_?secret_?access_?key\b['"]?\s*[:=]\s*['"]?[A-Za-z0-9\/+=]{40}(?![A-Za-z0-9\/+=])/i,
  ['AWS secret access key', 'With the key id, this secret signs any API call the user may make.', 'Deactivate the key in IAM and use roles or a credentials provider.'],
  ['AWS 비밀 액세스 키', '키 id와 함께 이 시크릿은 사용자가 할 수 있는 모든 API 호출에 서명합니다.', 'IAM에서 키를 비활성화하고 역할이나 자격 증명 공급자를 쓰세요.'],
  j('aws_secret_access_key = ', gen(40, B64)), 'aws_secret_access_key = ${AWS_SECRET_ACCESS_KEY}');
common('npm-token', 'BL',
  /\bnpm_[A-Za-z0-9]{36}\b|:_authToken\s*=\s*(?!\$\{)[A-Za-z0-9._-]{20,}/,
  ['npm access token', 'An npm token can publish packages under your account.', 'Revoke it on npmjs.com and use ${NPM_TOKEN} in .npmrc.'],
  ['npm 액세스 토큰', 'npm 토큰으로 내 계정 이름의 패키지를 배포할 수 있습니다.', 'npmjs.com에서 폐기하고 .npmrc에서는 ${NPM_TOKEN}을 쓰세요.'],
  j('//registry.npmjs.org/:_authToken=npm_', gen(36)), '//registry.npmjs.org/:_authToken=${NPM_TOKEN}');
common('pypi-token', 'BL',
  /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/,
  ['PyPI API token', 'The token can upload new releases of your packages.', 'Revoke it on pypi.org and use trusted publishing.'],
  ['PyPI API 토큰', '이 토큰으로 패키지의 새 버전을 올릴 수 있습니다.', 'pypi.org에서 폐기하고 신뢰할 수 있는 게시를 쓰세요.'],
  j('password = pypi-AgEIcHlwaS5vcmc', gen(64, URLSAFE)), 'password = __token_from_ci__');
common('twilio-api-key', 'CR',
  /\bSK[0-9a-fA-F]{32}\b/,
  ['Twilio API key', 'A Twilio key can send messages and calls billed to the account.', 'Delete the key in the Twilio console and load it at run time.'],
  ['Twilio API 키', 'Twilio 키로 계정에 과금되는 메시지와 통화를 보낼 수 있습니다.', 'Twilio 콘솔에서 키를 지우고 실행 시점에 읽으세요.'],
  j('TWILIO_API_KEY=SK', gen(32, HEX)), 'TWILIO_API_KEY=$TWILIO_API_KEY');
common('sendgrid-api-key', 'BL',
  /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/,
  ['SendGrid API key', 'The key can send mail as your domain, which enables phishing.', 'Revoke it in SendGrid and load it from a secret store.'],
  ['SendGrid API 키', '이 키로 내 도메인 이름의 메일을 보내 피싱을 할 수 있습니다.', 'SendGrid에서 폐기하고 시크릿 저장소에서 읽으세요.'],
  j('sendgrid.setApiKey("SG.', gen(22, URLSAFE), '.', gen(43, URLSAFE), '");'), 'sendgrid.setApiKey(process.env.SENDGRID_API_KEY);');
common('mailgun-api-key', 'CR',
  /\bkey-[0-9a-zA-Z]{32}\b/,
  ['Mailgun API key', 'The key can send mail from your domains.', 'Rotate it in Mailgun and load it at run time.'],
  ['Mailgun API 키', '이 키로 내 도메인에서 메일을 보낼 수 있습니다.', 'Mailgun에서 교체하고 실행 시점에 읽으세요.'],
  j('MAILGUN_KEY = "key-', gen(32), '"'), 'MAILGUN_KEY = os.environ["MAILGUN_KEY"]');
R('jwt-token', 'V', 'MA', 30, ['cwe-798', 'cwe-522', 'secrets', 'jwt'],
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  ['JSON Web Token in source', 'A signed token keeps working until it expires and often grants an API session.', 'Remove it; issue tokens at run time.'],
  ['소스에 JSON Web Token이 있습니다', '서명된 토큰은 만료될 때까지 동작하며 API 세션을 주는 경우가 많습니다.', '지우고 토큰은 실행 시점에 발급하세요.'],
  j('const token = "eyJ', gen(20, URLSAFE), '.eyJ', gen(40, URLSAFE), '.', gen(43, URLSAFE), '";'), 'const token = await auth.getToken();',
  { scope: 'any', skip: notPlaceholder });
common('github-fine-grained-token', 'BL',
  /\bgithub_pat_[A-Za-z0-9_]{60,}\b/,
  ['GitHub fine-grained token', 'The token grants repository access with the scopes it was created with.', 'Revoke it in GitHub settings and use GITHUB_TOKEN or an app.'],
  ['GitHub 세분화 토큰', '이 토큰은 만들 때의 범위로 저장소 접근을 허용합니다.', 'GitHub 설정에서 폐기하고 GITHUB_TOKEN이나 앱을 쓰세요.'],
  j('GH_TOKEN=github_pat_', gen(22), '_', gen(59)), 'GH_TOKEN=${{ secrets.GH_TOKEN }}');
common('gitlab-token', 'BL',
  /\bglpat-[A-Za-z0-9_-]{20}\b/,
  ['GitLab personal access token', 'The token acts as your GitLab user.', 'Revoke it in GitLab and use CI job tokens.'],
  ['GitLab 개인 액세스 토큰', '이 토큰은 내 GitLab 사용자로 동작합니다.', 'GitLab에서 폐기하고 CI 작업 토큰을 쓰세요.'],
  j('private_token = "glpat-', gen(20, URLSAFE), '"'), 'private_token = ENV["GITLAB_TOKEN"]');
common('slack-webhook', 'CR',
  /https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/T[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]{20,}/,
  ['Slack incoming webhook URL', 'Anyone with the URL can post into the channel.', 'Regenerate the webhook and keep the URL in a secret.'],
  ['Slack 수신 웹훅 URL', 'URL을 가진 누구나 채널에 글을 올릴 수 있습니다.', '웹훅을 다시 만들고 URL을 시크릿에 두세요.'],
  j('url = "https://hooks.slack.com/services/T', gen(9, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), '/B', gen(9, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), '/', gen(24), '"'), 'url = settings.SLACK_WEBHOOK_URL');
common('discord-webhook', 'CR',
  /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[\w-]{20,}/,
  ['Discord webhook URL', 'Anyone with the URL can post into the channel.', 'Delete the webhook and keep its URL in a secret.'],
  ['Discord 웹훅 URL', 'URL을 가진 누구나 채널에 글을 올릴 수 있습니다.', '웹훅을 지우고 URL을 시크릿에 두세요.'],
  j('hook = "https://discord.com/api/webhooks/', gen(18, '0123456789'), '/', gen(68, URLSAFE), '"'), 'hook = process.env.DISCORD_WEBHOOK');
common('telegram-bot-token', 'CR',
  /\b\d{8,10}:AA[0-9A-Za-z_-]{33}\b/,
  ['Telegram bot token', 'The token controls the bot and reads its messages.', 'Revoke it with @BotFather and load it at run time.'],
  ['Telegram 봇 토큰', '이 토큰은 봇을 제어하고 메시지를 읽습니다.', '@BotFather로 폐기하고 실행 시점에 읽으세요.'],
  j('BOT_TOKEN = "', gen(10, '0123456789'), ':AA', gen(33, URLSAFE), '"'), 'BOT_TOKEN = os.getenv("BOT_TOKEN")');
common('openai-api-key', 'BL',
  /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}/,
  ['OpenAI API key', 'The key is billed to your organization and can read its files and models.', 'Revoke it in the OpenAI dashboard and load it at run time.'],
  ['OpenAI API 키', '이 키는 조직에 과금되며 파일과 모델을 읽을 수 있습니다.', 'OpenAI 대시보드에서 폐기하고 실행 시점에 읽으세요.'],
  j('OPENAI_API_KEY=sk-proj-', gen(24, URLSAFE), 'T3Blbk', 'FJ', gen(24, URLSAFE)), 'OPENAI_API_KEY=${OPENAI_API_KEY}');
common('anthropic-api-key', 'BL',
  /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}/,
  ['Anthropic API key', 'The key is billed to your organization.', 'Revoke it in the Claude Console and load it at run time.'],
  ['Anthropic API 키', '이 키는 조직에 과금됩니다.', 'Claude Console에서 폐기하고 실행 시점에 읽으세요.'],
  j('ANTHROPIC_API_KEY=sk-ant-', 'api03-', gen(93, URLSAFE)), 'ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}');
common('shopify-token', 'BL',
  /\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/,
  ['Shopify access token', 'The token can read and change store data.', 'Rotate it in the Shopify admin and load it at run time.'],
  ['Shopify 액세스 토큰', '이 토큰으로 상점 데이터를 읽고 바꿀 수 있습니다.', 'Shopify 관리자에서 교체하고 실행 시점에 읽으세요.'],
  j('token: "shpat_', gen(32, HEX), '"'), 'token: env.SHOPIFY_TOKEN');
common('square-token', 'BL',
  /\bsq0(?:atp|csp)-[0-9A-Za-z_-]{22,43}\b/,
  ['Square access token or secret', 'The credential can take payments on the Square account.', 'Revoke it in the Square dashboard and load it at run time.'],
  ['Square 액세스 토큰 또는 시크릿', '이 자격 증명으로 Square 계정에서 결제를 받을 수 있습니다.', 'Square 대시보드에서 폐기하고 실행 시점에 읽으세요.'],
  j('SQUARE_TOKEN=sq0atp-', gen(22, URLSAFE)), 'SQUARE_TOKEN=$SQUARE_TOKEN');
common('digitalocean-token', 'BL',
  /\bdo[opr]_v1_[a-f0-9]{64}\b/,
  ['DigitalOcean token', 'The token manages droplets, DNS and storage.', 'Revoke it in the control panel and load it at run time.'],
  ['DigitalOcean 토큰', '이 토큰으로 droplet, DNS, 스토리지를 관리합니다.', '제어판에서 폐기하고 실행 시점에 읽으세요.'],
  j('DO_TOKEN=dop_v1_', gen(64, HEX)), 'DO_TOKEN=${DO_TOKEN}');
common('vault-token', 'BL',
  /\bhvs\.[A-Za-z0-9_-]{24,}\b/,
  ['HashiCorp Vault token', 'The token reads every secret its policies allow.', 'Revoke it with vault token revoke and use short-lived auth.'],
  ['HashiCorp Vault 토큰', '이 토큰은 정책이 허용하는 모든 시크릿을 읽습니다.', 'vault token revoke로 폐기하고 수명이 짧은 인증을 쓰세요.'],
  j('VAULT_TOKEN=hvs.', gen(90, URLSAFE)), 'VAULT_TOKEN=$(vault login -token-only -method=oidc)');
common('docker-registry-auth', 'CR',
  /"auth"\s*:\s*"[A-Za-z0-9+\/]{20,}={0,2}"/,
  ['Docker registry credentials', 'The auth field is base64 of user:password for the registry.', 'Use a credential helper instead of config.json auth entries.'],
  ['Docker 레지스트리 자격 증명', 'auth 필드는 레지스트리 user:password의 base64입니다.', 'config.json auth 항목 대신 자격 증명 도우미를 쓰세요.'],
  j('      "auth": "', gen(40, B64), '="'), '      "credsStore": "desktop"', { lang: 'json' });
common('basic-auth-url', 'CR',
  /\bhttps?:\/\/[^\s:@\/'"]+:[^\s:@\/'"]{3,}@[\w.-]+/,
  ['Credentials embedded in a URL', 'user:password@host in a URL ends up in logs, history and referrers.', 'Pass credentials in a header from a secret store.'],
  ['URL에 자격 증명이 들어 있습니다', 'URL의 user:password@host는 로그, 기록, 리퍼러에 남습니다.', '시크릿 저장소에서 읽어 헤더로 넘기세요.'],
  j('const feed = "https://deploy:', gen(16), '@repo.internal.net/feed";'), 'const feed = "https://repo.internal.net/feed";',
  { skip: (raw) => notPlaceholder(raw) || /:\/\/[^\s:@\/'"]+:(?:password|pass|pwd|secret|token|\$\w+|%[\w]+%)@/i.test(raw) });
common('putty-private-key', 'BL',
  /PuTTY-User-Key-File-\d+:/,
  ['PuTTY private key', 'A .ppk file holds an SSH private key.', 'Remove it from history and keep keys in an agent or vault.'],
  ['PuTTY 개인 키', '.ppk 파일에는 SSH 개인 키가 들어 있습니다.', '이력에서 지우고 키는 에이전트나 금고에 두세요.'],
  'PuTTY-User-Key-File-3: ssh-ed25519', 'Public-Lines: 2', { skip: null });
common('age-secret-key', 'BL',
  /\bAGE-SECRET-KEY-1[0-9A-Z]{58}\b/,
  ['age secret key', 'The key decrypts every file encrypted to its recipient.', 'Remove it and re-encrypt to a new key.'],
  ['age 비밀 키', '이 키는 받는 사람에게 암호화된 모든 파일을 복호화합니다.', '지우고 새 키로 다시 암호화하세요.'],
  j('AGE-SECRET-KEY-1', gen(58, 'ACDEFGHJKLMNPQRSTUVWXYZ023456789')), '# public key: age1qyqszqgpqyqszqgp');
common('mapbox-secret-token', 'CR',
  /\bsk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  ['Mapbox secret token', 'Secret tokens can change account resources and are billed.', 'Rotate it and use public pk. tokens in clients.'],
  ['Mapbox 비밀 토큰', '비밀 토큰은 계정 리소스를 바꾸고 과금됩니다.', '교체하고 클라이언트에는 공개 pk. 토큰을 쓰세요.'],
  j('MAPBOX=sk.eyJ', gen(40, URLSAFE), '.', gen(22, URLSAFE)), 'MAPBOX=pk.public-token-from-config');
common('new-relic-key', 'CR',
  /\bNRAK-[A-Z0-9]{27}\b/,
  ['New Relic user API key', 'The key reads and changes account data.', 'Delete it in New Relic and load it at run time.'],
  ['New Relic 사용자 API 키', '이 키로 계정 데이터를 읽고 바꿉니다.', 'New Relic에서 지우고 실행 시점에 읽으세요.'],
  j('NEW_RELIC_API_KEY=NRAK-', gen(27, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')), 'NEW_RELIC_API_KEY=$NEW_RELIC_API_KEY');
common('huggingface-token', 'CR',
  /\bhf_[A-Za-z0-9]{34,}\b/,
  ['Hugging Face access token', 'The token can read private models and push to your repositories.', 'Revoke it in your Hugging Face settings and load it at run time.'],
  ['Hugging Face 액세스 토큰', '이 토큰으로 비공개 모델을 읽고 저장소에 푸시할 수 있습니다.', 'Hugging Face 설정에서 폐기하고 실행 시점에 읽으세요.'],
  j('HF_TOKEN = "hf_', gen(34), '"'), 'HF_TOKEN = os.environ.get("HF_TOKEN")');
common('databricks-token', 'CR',
  /\bdapi[a-f0-9]{32}(?:-\d)?\b/,
  ['Databricks personal access token', 'The token runs jobs and reads data in the workspace.', 'Revoke it in the workspace and use a service principal.'],
  ['Databricks 개인 액세스 토큰', '이 토큰으로 작업을 실행하고 워크스페이스 데이터를 읽습니다.', '워크스페이스에서 폐기하고 서비스 주체를 쓰세요.'],
  j('DATABRICKS_TOKEN=dapi', gen(32, HEX)), 'DATABRICKS_TOKEN=${DATABRICKS_TOKEN}');

// Values that look random and sit next to a credential-like name. Tokens
// already caught by the base catalog are left to it.
const GENERIC = /(?:key|secret|token|passwd|password|credential|auth|apikey|signature)\w*['"]?\s*[:=]\s*['"]([A-Za-z0-9+\/=_-]{32,})['"]/i;
const baseToken = base.RULES.find((r) => r.key === 'secrets:hardcoded-token');
const basePassword = base.RULES.find((r) => r.key === 'secrets:hardcoded-password');
R('generic-high-entropy', 'V', 'CR', 30, ['cwe-798', 'owasp-a07', 'secrets'],
  GENERIC,
  ['High-entropy secret next to a credential name', 'A long random value assigned to a key / secret / token name is very likely a real credential.', 'Move the value to a secret store and rotate it.'],
  ['자격 증명 이름 옆의 무작위성 높은 값', 'key / secret / token 이름에 대입한 길고 무작위한 값은 실제 자격 증명일 가능성이 높습니다.', '값을 시크릿 저장소로 옮기고 교체하세요.'],
  j('const signingKey = "', gen(44, B64), '";'),
  ['const cacheKey = "d41d8cd98f00b204e9800998ecf8427ed41d8cd9";', 'const tokenName = "ACCESS_TOKEN_FOR_THE_PUBLIC_DOCUMENTATION";', j('api_key = "', gen(40, B64), '"')],
  {
    scope: 'any',
    skip: (raw) => {
      if (notPlaceholder(raw)) return true;
      for (const r of [baseToken, basePassword]) {
        if (!r) continue;
        r.re.lastIndex = 0;
        if (r.re.test(raw) && !(r.skip && r.skip(raw, raw))) return true;
      }
      const m = GENERIC.exec(raw);
      if (!m) return true;
      const v = m[1];
      const classes = [/[a-z]/, /[A-Z]/, /\d/].filter((c) => c.test(v)).length;
      return entropy(v) < 4.2 || classes < 3;
    },
  });

module.exports = { RULES: R.rules };
