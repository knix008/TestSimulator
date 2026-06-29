import nodemailer from 'nodemailer';

function isDeliverableEmail(to) {
  const trimmed = (to || '').trim();
  return trimmed.length > 0 && /^[^\s@]+@[^\s@]+/.test(trimmed);
}

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' }
      : undefined,
  };
}

export function isMailConfigured() {
  const { host, auth } = getSmtpConfig();
  return !!(host && auth?.user);
}

function getFromAddress() {
  return process.env.SMTP_FROM || 'Req Tracking Board <noreply@reqtracking.local>';
}

function formatTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function buildPasswordChangedContent({ username, displayName, changedBy, actorUsername, at, ip }) {
  const time = formatTimestamp(at);
  const selfChange = changedBy === 'self';
  const actorLineEn = selfChange
    ? 'Changed by: yourself (account settings)'
    : `Changed by: administrator (${actorUsername || 'admin'})`;
  const actorLineKo = selfChange
    ? '변경 주체: 본인 (계정 설정)'
    : `변경 주체: 관리자 (${actorUsername || 'admin'})`;

  const subject = '[Req Tracking Board] Password changed / 비밀번호 변경 알림';

  const text = [
    'Req Tracking Board — Password Change Notification',
    'Req Tracking Board — 비밀번호 변경 알림',
    '',
    `User / 사용자: ${displayName || username} (${username})`,
    actorLineEn,
    actorLineKo,
    `Time / 시간: ${time}`,
    ip ? `IP: ${ip}` : '',
    '',
    'Your password was changed successfully.',
    '비밀번호가 변경되었습니다.',
    '',
    'If you did not make this change, contact your administrator immediately.',
    '본인이 변경하지 않았다면 즉시 관리자에게 문의하세요.',
    '',
    'This email does not contain your new password.',
    '이 메일에는 새 비밀번호가 포함되지 않습니다.',
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;line-height:1.6;color:#1e293b">
      <h2 style="color:#1e3a5f;margin-bottom:8px">Password Change Notification</h2>
      <p style="color:#64748b;margin-top:0">비밀번호 변경 알림</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:8px 0;color:#64748b">User / 사용자</td><td><strong>${displayName || username}</strong> (${username})</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Changed by / 변경 주체</td><td>${selfChange ? 'Yourself / 본인' : `Administrator / 관리자 (${actorUsername || 'admin'})`}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Time / 시간</td><td>${time}</td></tr>
        ${ip ? `<tr><td style="padding:8px 0;color:#64748b">IP</td><td>${ip}</td></tr>` : ''}
      </table>
      <p>Your password was changed successfully.<br/>비밀번호가 변경되었습니다.</p>
      <p style="color:#b45309">If you did not make this change, contact your administrator immediately.<br/>본인이 변경하지 않았다면 즉시 관리자에게 문의하세요.</p>
      <p style="font-size:12px;color:#94a3b8">This email does not contain your new password.<br/>이 메일에는 새 비밀번호가 포함되지 않습니다.</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendPasswordChangedNotification({
  to,
  username,
  displayName,
  changedBy = 'self',
  actorUsername,
  at = new Date(),
  ip,
}) {
  if (!isDeliverableEmail(to)) {
    console.warn(`Password change notification skipped: invalid email for ${username}`);
    return { sent: false, reason: 'invalid_email' };
  }

  const { subject, text, html } = buildPasswordChangedContent({
    username,
    displayName,
    changedBy,
    actorUsername,
    at,
    ip,
  });

  if (!isMailConfigured()) {
    console.log('--- Password change notification (SMTP not configured) ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('--------------------------------------------------------');
    return { sent: true, mode: 'console' };
  }

  const transporter = nodemailer.createTransport(getSmtpConfig());
  await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
  });

  return { sent: true, mode: 'smtp' };
}

function buildVerificationCodeContent({ username, displayName, code, expiresMinutes = 10 }) {
  const subject = '[Req Tracking Board] Password change verification / 비밀번호 변경 인증';
  const text = [
    'Req Tracking Board — Password Change Verification',
    'Req Tracking Board — 비밀번호 변경 이메일 인증',
    '',
    `User / 사용자: ${displayName || username} (${username})`,
    `Verification code / 인증 코드: ${code}`,
    `Valid for / 유효 시간: ${expiresMinutes} minutes / 분`,
    '',
    'Enter this code to enable password change.',
    '이 코드를 입력해야 비밀번호 변경이 가능합니다.',
    '',
    'If you did not request this, ignore this email.',
    '본인이 요청하지 않았다면 이 메일을 무시하세요.',
  ].join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;line-height:1.6;color:#1e293b">
      <h2 style="color:#1e3a5f;margin-bottom:8px">Password Change Verification</h2>
      <p style="color:#64748b;margin-top:0">비밀번호 변경 이메일 인증</p>
      <p>User / 사용자: <strong>${displayName || username}</strong> (${username})</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#1e3a5f;margin:24px 0">${code}</p>
      <p>Valid for ${expiresMinutes} minutes / ${expiresMinutes}분간 유효</p>
      <p>Enter this code to enable password change.<br/>이 코드를 입력해야 비밀번호 변경이 가능합니다.</p>
      <p style="font-size:12px;color:#94a3b8">If you did not request this, ignore this email.<br/>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendPasswordChangeVerificationCode({
  to,
  username,
  displayName,
  code,
}) {
  if (!isDeliverableEmail(to)) {
    console.warn(`Verification email skipped: invalid address for ${username}`);
    return { sent: false, reason: 'invalid_email' };
  }

  const { subject, text, html } = buildVerificationCodeContent({ username, displayName, code });

  if (!isMailConfigured()) {
    console.log('--- Password change verification code (SMTP not configured) ---');
    console.log(`To: ${to}`);
    console.log(`Code: ${code}`);
    console.log(text);
    console.log('---------------------------------------------------------------');
    return { sent: true, mode: 'console', code };
  }

  const transporter = nodemailer.createTransport(getSmtpConfig());
  await transporter.sendMail({ from: getFromAddress(), to, subject, text, html });
  return { sent: true, mode: 'smtp' };
}
