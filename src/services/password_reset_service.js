const crypto = require('crypto');
const nodemailer = require('nodemailer');

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getResetConfig = () => ({
  expiresMinutes: parseNumber(process.env.OTP_EXPIRES_MIN, 10),
  maxAttempts: parseNumber(process.env.OTP_MAX_ATTEMPTS, 5),
  resendCooldownSeconds: parseNumber(process.env.OTP_RESEND_COOLDOWN_SEC, 60),
});

const generateResetCode = () => {
  const code = crypto.randomInt(0, 1000000);
  return String(code).padStart(6, '0');
};

const hashResetCode = (code) => {
  return crypto.createHash('sha256').update(code).digest('hex');
};

const getSmtpConfig = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL, SMTP_FROM_NAME } = process.env;

  return {
    host: SMTP_HOST,
    port: parseNumber(SMTP_PORT, 587),
    user: SMTP_USER,
    pass: SMTP_PASS,
    fromEmail: SMTP_FROM_EMAIL,
    fromName: SMTP_FROM_NAME || 'TeamTask',
  };
};

const createTransport = () => {
  const { host, port, user, pass } = getSmtpConfig();

  if (!host || !user || !pass) {
    const error = new Error('SMTP is not configured');
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
};

const sendPasswordResetEmail = async ({ toEmail, username, code, expiresMinutes }) => {
  const { fromEmail, fromName } = getSmtpConfig();
  const transporter = createTransport();
  const subject = 'Your TeamTask password reset code';
  const greeting = username ? `Hi ${username},` : 'Hi,';

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: toEmail,
    subject,
    text: `${greeting}\n\nYour password reset code is: ${code}\nThis code expires in ${expiresMinutes} minutes.\n\nIf you did not request this, please ignore this email.`,
  });
};

module.exports = {
  generateResetCode,
  hashResetCode,
  getResetConfig,
  sendPasswordResetEmail,
};
