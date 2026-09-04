const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    const err = new Error('Email is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env.');
    err.statusCode = 500;
    throw err;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  await t.sendMail({
    from: `Invigilo <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { sendMail, generateCode };
