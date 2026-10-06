const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { sendEmailOtp, verifyEmailOtp } = require('../controllers/authController');

const router = express.Router();
const wrapAsync = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const sendOtpRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many OTP requests. Please try again later.' },
});

const verifyOtpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many verification attempts. Please try again later.' },
});

router.post('/send-email-otp', sendOtpRateLimit, wrapAsync(sendEmailOtp));
router.post('/verify-email-otp', verifyOtpRateLimit, wrapAsync(verifyEmailOtp));

module.exports = router;
