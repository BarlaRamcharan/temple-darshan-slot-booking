const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const OTP = require('../models/OTP');
const User = require('../models/User');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return process.env.JWT_SECRET;
}

function hashOtp(email, otp) {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${email}:${otp}`)
    .digest('hex');
}

function createOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function createTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error('Gmail SMTP credentials are not configured.');
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function createOtpEmail(otp, email) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#fff7ee;font-family:Arial,sans-serif;color:#2d0712">
    <div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #f0e2d2;border-radius:20px">
      <div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#b7772e;text-transform:uppercase">Temple Darshan</div>
      <h1 style="margin:16px 0 8px;font-size:24px">Verify your email</h1>
      <p style="line-height:1.6;color:#6d5f66">Hello,</p>
      <p style="line-height:1.6;color:#6d5f66">Your Temple Darshan verification code is:</p>
      <div style="margin:24px 0;padding:18px;text-align:center;background:#fff7ee;border-radius:12px;color:#4b0d1c;font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</div>
      <p style="line-height:1.6;color:#6d5f66">This OTP is valid for 5 minutes. Do not share this OTP with anyone.</p>
      <p style="line-height:1.6;color:#6d5f66">If you did not request this code, you can safely ignore this email.</p>
      <p style="margin-top:28px;line-height:1.6;color:#6d5f66">Regards,<br><strong>Temple Darshan Team</strong></p>
      <p style="margin-top:24px;font-size:12px;color:#94858b">Sent to ${escapeHtml(email)}</p>
    </div>
  </body>
</html>`;
}

async function sendEmailOtp(req, res) {
  const email = normalizeEmail(req.body && req.body.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Email verification is temporarily unavailable. Please try again later.' });
  }

  const existingOtp = await OTP.findOne({ email });
  const now = Date.now();
  if (existingOtp && existingOtp.resendAvailableAt.getTime() > now) {
    const retryAfterSeconds = Math.ceil((existingOtp.resendAvailableAt.getTime() - now) / 1000);
    return res.status(429).json({
      message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP.`,
      retryAfterSeconds,
    });
  }

  let transporter;
  try {
    transporter = createTransporter();
  } catch (error) {
    console.error('OTP email delivery failed:', error.code || error.name || 'SMTP_ERROR');
    return res.status(503).json({
      message: 'Unable to send OTP right now. Please check your email address and try again.',
    });
  }

  const otp = createOtp();
  const nowDate = new Date(now);

  await OTP.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        otpHash: hashOtp(email, otp),
        expiresAt: new Date(now + OTP_EXPIRY_MS),
        resendAvailableAt: new Date(now + RESEND_COOLDOWN_MS),
        blockedUntil: null,
        attempts: 0,
        createdAt: nowDate,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  try {
    await transporter.sendMail({
      from: `"Temple Darshan" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Temple Darshan - Your Verification Code',
      text: `Hello,\n\nYour Temple Darshan verification code is: ${otp}\n\nThis OTP is valid for 5 minutes.\nDo not share this OTP with anyone.\n\nIf you did not request this code, you can safely ignore this email.\n\nRegards,\nTemple Darshan Team`,
      html: createOtpEmail(otp, email),
    });
  } catch (error) {
    await OTP.deleteOne({ email });
    console.error('OTP email delivery failed:', error.code || error.name || 'SMTP_ERROR');
    return res.status(503).json({
      message: 'Unable to send OTP right now. Please check your email address and try again.',
    });
  }

  return res.status(200).json({
    message: 'A verification code has been sent to your email.',
    expiresInSeconds: OTP_EXPIRY_MS / 1000,
    resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
  });
}

async function verifyEmailOtp(req, res) {
  const email = normalizeEmail(req.body && req.body.email);
  const otp = typeof (req.body && req.body.otp) === 'string' ? req.body.otp.trim() : '';

  if (!isValidEmail(email) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: 'Enter a valid email address and 6-digit OTP.' });
  }

  const jwtSecret = getJwtSecret();
  const otpRecord = await OTP.findOne({ email });
  if (!otpRecord) {
    return res.status(400).json({ message: 'No active OTP was found. Please request a new OTP.' });
  }

  const now = new Date();
  if (otpRecord.blockedUntil && otpRecord.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((otpRecord.blockedUntil.getTime() - now.getTime()) / 1000);
    return res.status(429).json({
      message: `Too many incorrect attempts. Try again in ${retryAfterSeconds} seconds.`,
      retryAfterSeconds,
    });
  }

  if (otpRecord.expiresAt <= now) {
    return res.status(400).json({ message: 'This OTP has expired. Please request a new OTP.' });
  }

  const attempt = await OTP.findOneAndUpdate(
    {
      _id: otpRecord._id,
      attempts: { $lt: MAX_VERIFICATION_ATTEMPTS },
      $or: [{ blockedUntil: null }, { blockedUntil: { $lte: now } }],
    },
    { $inc: { attempts: 1 } },
    { new: true }
  );

  if (!attempt) {
    await OTP.updateOne(
      { _id: otpRecord._id },
      { $set: { blockedUntil: new Date(now.getTime() + BLOCK_DURATION_MS) } }
    );
    return res.status(429).json({
      message: 'Too many incorrect attempts. Please request a new OTP later.',
      retryAfterSeconds: BLOCK_DURATION_MS / 1000,
    });
  }

  const submittedHash = Buffer.from(hashOtp(email, otp), 'hex');
  const savedHash = Buffer.from(attempt.otpHash, 'hex');
  const isMatch = submittedHash.length === savedHash.length
    && crypto.timingSafeEqual(submittedHash, savedHash);

  if (!isMatch) {
    const attemptsLeft = MAX_VERIFICATION_ATTEMPTS - attempt.attempts;
    if (attemptsLeft <= 0) {
      await OTP.updateOne(
        { _id: attempt._id },
        { $set: { blockedUntil: new Date(now.getTime() + BLOCK_DURATION_MS) } }
      );
      return res.status(429).json({
        message: 'Too many incorrect attempts. Please request a new OTP later.',
        retryAfterSeconds: BLOCK_DURATION_MS / 1000,
      });
    }
    return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
  }

  const normalizedAdminEmail = normalizeEmail(process.env.ADMIN_EMAIL || '');
  const role = normalizedAdminEmail && email === normalizedAdminEmail ? 'admin' : 'user';
  const user = await User.findOneAndUpdate(
    { email },
    {
      $setOnInsert: { email, name: '' },
      $set: { emailVerified: true, role },
    },
    { upsert: true, new: true, runValidators: true }
  );

  await OTP.deleteOne({ _id: attempt._id });

  const token = jwt.sign(
    { id: user._id, email: user.email, role: user.role, authMethod: 'email-otp' },
    jwtSecret,
    { expiresIn: '7d' }
  );

  return res.status(200).json({
    message: 'Email verified successfully.',
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
  });
}

module.exports = {
  sendEmailOtp,
  verifyEmailOtp,
  normalizeEmail,
  isValidEmail,
};
