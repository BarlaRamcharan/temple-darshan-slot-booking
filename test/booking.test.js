const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  normalizeAndValidateDevotees,
  calculateAmount,
  verifyRazorpaySignature,
  assignEntryGate,
  formatEntryTime,
} = require('../server/controllers/bookingController');
const { getDatabaseConfig, isRailwayEnvironment } = require('../server/config/db');
const { createTransporter, sendEmailOtp } = require('../server/controllers/authController');

const validDevotee = {
  fullName: 'Aarav Devotee',
  age: 32,
  gender: 'Other',
  mobileNumber: '9876543210',
};

test('validates and normalizes each devotee record', () => {
  const result = normalizeAndValidateDevotees([
    { ...validDevotee, fullName: '  Aarav Devotee  ' },
    { ...validDevotee, fullName: 'Meera Devotee', age: '12', gender: 'Female' },
  ]);

  assert.equal(result.error, undefined);
  assert.equal(result.devotees.length, 2);
  assert.equal(result.devotees[0].fullName, 'Aarav Devotee');
  assert.equal(result.devotees[1].age, 12);
});

test('rejects missing and invalid devotee details', () => {
  assert.match(normalizeAndValidateDevotees([]).error, /1 to 12 devotees/);
  assert.match(normalizeAndValidateDevotees([{ ...validDevotee, age: 121 }]).error, /age/);
  assert.match(normalizeAndValidateDevotees([{ ...validDevotee, mobileNumber: '0000000000' }]).error, /mobile/);
  assert.match(normalizeAndValidateDevotees([{ ...validDevotee, gender: 'unknown' }]).error, /gender/);
});

test('calculates fixed INR pricing on the server', () => {
  assert.equal(calculateAmount(1), 100);
  assert.equal(calculateAmount(2), 200);
  assert.equal(calculateAmount(12), 1200);
  assert.throws(() => calculateAmount(0), RangeError);
  assert.throws(() => calculateAmount(13), RangeError);
});

test('validates Razorpay HMAC signature without timing-sensitive comparison', () => {
  const orderId = 'order_test_123';
  const paymentId = 'pay_test_456';
  const secret = 'test-only-signing-key';
  const signature = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  assert.equal(verifyRazorpaySignature(orderId, paymentId, signature, secret), true);
  assert.equal(verifyRazorpaySignature(orderId, paymentId, `${signature.slice(0, -2)}00`, secret), false);
  assert.equal(verifyRazorpaySignature(orderId, paymentId, 'not-a-signature', secret), false);
});

test('assigns the same supported entry gate for the same temple and slot', () => {
  const firstAssignment = assignEntryGate('temple-1', 'slot-10am');
  assert.equal(assignEntryGate('temple-1', 'slot-10am'), firstAssignment);
  assert.ok(['Gate 1', 'Gate 2', 'Gate 3'].includes(firstAssignment));
  assert.ok(['Gate 1', 'Gate 2', 'Gate 3'].includes(assignEntryGate('temple-2', 'slot-11am')));
});

test('formats slot start as the entry time without changing an existing label', () => {
  assert.equal(formatEntryTime('10:00', '10:00 AM – 11:00 AM'), '10:00 AM');
  assert.equal(formatEntryTime('14:30', '02:30 PM – 03:30 PM'), '2:30 PM');
  assert.equal(formatEntryTime(undefined, '10:00 AM – 11:00 AM'), '10:00 AM');
});

test('uses MONGODB_URI and never enables local MongoDB startup in production', () => {
  const config = getDatabaseConfig({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://example.invalid/temple',
  }, 'linux');

  assert.equal(config.mongoUri, 'mongodb+srv://example.invalid/temple');
  assert.equal(config.canStartLocalMongo, false);

  const railwayConfig = getDatabaseConfig({
    RAILWAY_ENVIRONMENT: 'production',
    MONGODB_URI: 'mongodb+srv://example.invalid/temple',
  }, 'win32');
  assert.equal(railwayConfig.mongoUri, 'mongodb+srv://example.invalid/temple');
  assert.equal(railwayConfig.canStartLocalMongo, false);
});

test('requires MONGODB_URI on Railway and detects Railway environment variables', () => {
  assert.equal(isRailwayEnvironment({ RAILWAY_ENVIRONMENT: 'production' }), true);
  assert.throws(
    () => getDatabaseConfig({ RAILWAY_PROJECT_ID: 'project-id' }, 'linux'),
    /MONGODB_URI is required in production/
  );
  assert.throws(
    () => getDatabaseConfig({ RAILWAY_SERVICE_ID: 'service-id', MONGO_URI: 'mongodb://localhost/example' }, 'linux'),
    /MONGODB_URI is required in production/
  );
});

test('keeps the default local database on Windows development only', () => {
  const localConfig = getDatabaseConfig({ NODE_ENV: 'development' }, 'win32');
  const linuxConfig = getDatabaseConfig({ NODE_ENV: 'development' }, 'linux');
  const explicitUriConfig = getDatabaseConfig({
    NODE_ENV: 'development',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/custom',
  }, 'win32');

  assert.equal(localConfig.mongoUri, 'mongodb://127.0.0.1:27017/temple-darshan');
  assert.equal(localConfig.canStartLocalMongo, true);
  assert.equal(linuxConfig.canStartLocalMongo, false);
  assert.equal(explicitUriConfig.canStartLocalMongo, false);
});

test('configures Gmail SMTP with bounded connection and socket timeouts', () => {
  const originalEmailUser = process.env.EMAIL_USER;
  const originalEmailPassword = process.env.EMAIL_APP_PASSWORD;
  const originalConsoleInfo = console.info;
  let smtpDiagnostic;
  process.env.EMAIL_USER = 'smtp-test@example.invalid';
  process.env.EMAIL_APP_PASSWORD = 'test-only-password';
  console.info = (message, config) => {
    if (message === 'SMTP configuration:') smtpDiagnostic = config;
  };

  try {
    const transporter = createTransporter();
    assert.equal(transporter.options.host, 'smtp.gmail.com');
    assert.equal(transporter.options.port, 465);
    assert.equal(transporter.options.secure, true);
    assert.equal(transporter.options.connectionTimeout, 10_000);
    assert.equal(transporter.options.greetingTimeout, 10_000);
    assert.equal(transporter.options.socketTimeout, 20_000);
    assert.deepEqual(smtpDiagnostic, {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      EMAIL_USER: true,
      EMAIL_APP_PASSWORD: true,
    });
    transporter.close();
  } finally {
    console.info = originalConsoleInfo;
    if (originalEmailUser === undefined) delete process.env.EMAIL_USER;
    else process.env.EMAIL_USER = originalEmailUser;
    if (originalEmailPassword === undefined) delete process.env.EMAIL_APP_PASSWORD;
    else process.env.EMAIL_APP_PASSWORD = originalEmailPassword;
  }
});

test('email OTP endpoint responds immediately to invalid email input', async () => {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await sendEmailOtp({ body: { email: 'not-an-email' } }, response);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /valid email address/i);
});
