const nodemailer = require('nodemailer');

let transporter = null;

const isMailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (transporter) return transporter;
  if (!isMailConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

const getFromAddress = () =>
  process.env.MAIL_FROM || `PetfoodTN <${process.env.SMTP_USER}>`;

const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

/**
 * Envoie l'e-mail de réinitialisation du mot de passe.
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
const sendPasswordResetEmail = async ({ to, name, resetToken }) => {
  const transport = getTransporter();
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`;

  if (!transport) {
    console.warn(`📧 SMTP non configuré — lien reset pour ${to} : ${resetUrl}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const displayName = name || 'utilisateur PetfoodTN';

  await transport.sendMail({
    from: getFromAddress(),
    to,
    subject: 'PetfoodTN — Réinitialisation de votre mot de passe',
    text: [
      `Bonjour ${displayName},`,
      '',
      'Vous avez demandé la réinitialisation de votre mot de passe PetfoodTN.',
      `Lien (valide 15 minutes) : ${resetUrl}`,
      '',
      'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail.',
      '',
      '— L\'équipe PetfoodTN',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#059669;margin:0 0 12px">PetfoodTN</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">
            Réinitialiser mon mot de passe
          </a>
        </p>
        <p style="font-size:13px;color:#64748b">Ce lien expire dans <strong>15 minutes</strong>.</p>
        <p style="font-size:12px;color:#94a3b8">Si le bouton ne fonctionne pas, copiez ce lien :<br>${resetUrl}</p>
      </div>
    `,
  });

  console.log(`📧 E-mail de reset envoyé à ${to}`);
  return { sent: true };
};

module.exports = {
  isMailConfigured,
  sendPasswordResetEmail,
};
