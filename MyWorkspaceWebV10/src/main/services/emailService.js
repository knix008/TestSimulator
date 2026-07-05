const nodemailer = require('nodemailer');
const { loadConfig, saveLocalConfig } = require('../config');

function getEmailConfig() {
  const config = loadConfig();
  return config?.Email || {};
}

function saveEmailConfig(partial) {
  const current = getEmailConfig();
  const merged = { ...current, ...partial };
  saveLocalConfig({ Email: merged });
  return merged;
}

function createTransport(config = getEmailConfig()) {
  if (!config?.SmtpHost) {
    throw new Error('SMTP 호스트를 설정하세요.');
  }

  return nodemailer.createTransport({
    host: config.SmtpHost,
    port: Number(config.Port || 587),
    secure: Boolean(config.EnableSsl) && Number(config.Port) === 465,
    auth: config.Username
      ? {
          user: config.Username,
          pass: config.Password || ''
        }
      : undefined
  });
}

async function testEmailConnection(config) {
  const transport = createTransport(config);
  await transport.verify();
}

async function sendEmail({ to, subject, text, html }) {
  const config = getEmailConfig();
  if (!config.Enabled) {
    throw new Error('이메일 알림이 비활성화되어 있습니다.');
  }

  const transport = createTransport(config);
  await transport.sendMail({
    from: config.FromDisplayName
      ? `"${config.FromDisplayName}" <${config.FromAddress || config.Username}>`
      : config.FromAddress || config.Username,
    to,
    subject,
    text,
    html
  });
}

module.exports = {
  getEmailConfig,
  saveEmailConfig,
  testEmailConnection,
  sendEmail
};
