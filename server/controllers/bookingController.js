const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const sharp = require('sharp');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const DarshanSlot = require('../models/DarshanSlot');
const PaymentAttempt = require('../models/PaymentAttempt');
const Temple = require('../models/Temple');

const PRICE_PER_DEVOTEE_INR = 100;
const MAX_DEVOTEES = 12;
const PAYMENT_HOLD_MS = 15 * 60 * 1000;
const ENTRY_GATES = ['Gate 1', 'Gate 2', 'Gate 3'];

function assignEntryGate(templeId, slotId) {
  const assignmentKey = `${templeId}:${slotId}`;
  const digest = crypto.createHash('sha256').update(assignmentKey).digest();
  return ENTRY_GATES[digest.readUInt32BE(0) % ENTRY_GATES.length];
}

async function ensureEntryGate(booking) {
  if (!booking.entryGate) {
    booking.entryGate = assignEntryGate(booking.templeId?._id || booking.templeId, booking.slotId?._id || booking.slotId);
    await booking.save();
  }
  return booking.entryGate;
}

function formatEntryTime(timeStart, timeSlot) {
  const start = typeof timeStart === 'string' ? timeStart : timeSlot?.split(/\s*[–-]\s*/)[0];
  const match = /^(\d{1,2}):(\d{2})$/.exec(start || '');
  if (!match) {
    return start || '';
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return start;
  }
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${match[2]} ${suffix}`;
}

function getBookingDevotees(booking) {
  if (booking.devotees?.length) {
    return booking.devotees;
  }
  return booking.devoteeName
    ? [{ fullName: booking.devoteeName, age: '-', gender: '-' }]
    : [];
}

function razorpayConfigured() {
  return Boolean(
    process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')
    && process.env.RAZORPAY_KEY_SECRET
  );
}

function getRazorpayClient() {
  if (!razorpayConfigured()) {
    return null;
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

function normalizeAndValidateDevotees(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DEVOTEES) {
    return { error: `Enter details for 1 to ${MAX_DEVOTEES} devotees.` };
  }

  const devotees = [];
  for (const [index, item] of value.entries()) {
    const fullName = typeof item?.fullName === 'string' ? item.fullName.trim() : '';
    const mobileNumber = typeof item?.mobileNumber === 'string' ? item.mobileNumber.trim() : '';
    const age = Number(item?.age);
    const gender = item?.gender;

    if (fullName.length < 2 || fullName.length > 100) {
      return { error: `Enter a valid full name for Devotee ${index + 1}.` };
    }
    if (!Number.isInteger(age) || age < 0 || age > 120) {
      return { error: `Enter a valid age from 0 to 120 for Devotee ${index + 1}.` };
    }
    if (!['Female', 'Male', 'Other'].includes(gender)) {
      return { error: `Select a valid gender for Devotee ${index + 1}.` };
    }
    if (!/^\+?[0-9]{10,15}$/.test(mobileNumber) || /^0+$/.test(mobileNumber.replace(/\D/g, ''))) {
      return { error: `Enter a valid mobile number for Devotee ${index + 1}.` };
    }

    devotees.push({ fullName, age, gender, mobileNumber });
  }

  return { devotees };
}

function calculateAmount(numberOfDevotees) {
  if (!Number.isInteger(numberOfDevotees) || numberOfDevotees < 1 || numberOfDevotees > MAX_DEVOTEES) {
    throw new RangeError('Devotee count must be between 1 and 12.');
  }
  return numberOfDevotees * PRICE_PER_DEVOTEE_INR;
}

function safeCompareHex(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
  if (!orderId || !paymentId || typeof signature !== 'string' || !secret) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeCompareHex(expected, signature);
}

function createPublicVerificationUrl(req, token) {
  const configuredBase = process.env.APP_BASE_URL;
  const base = configuredBase
    ? configuredBase.replace(/\/+$/, '')
    : `${req.protocol}://${req.get('host')}`;
  return `${base}/verify-booking/${encodeURIComponent(token)}`;
}

function createVerificationToken(booking) {
  return crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`${booking._id}:${booking.createdAt.toISOString()}`)
    .digest('base64url');
}

async function persistVerificationTokenHash(booking) {
  const token = createVerificationToken(booking);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  if (booking.verificationTokenHash !== hash) {
    booking.verificationTokenHash = hash;
    await booking.save();
  }
  return token;
}

async function createBookingPresentation(booking, temple, req, token) {
  const verificationUrl = createPublicVerificationUrl(req, token);
  const qrCode = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'H', margin: 2 });
  const bookingData = booking.toObject();
  delete bookingData.verificationTokenHash;
  return {
    ...bookingData,
    templeId: temple || booking.templeId,
    qrCode,
    verificationUrl,
  };
}

async function releaseReservation(attempt, status) {
  const updated = await PaymentAttempt.findOneAndUpdate(
    { _id: attempt._id, status: 'pending' },
    { $set: { status } },
    { new: true }
  );
  if (updated) {
    await DarshanSlot.updateOne(
      { _id: updated.slotId, bookedCount: { $gte: updated.numberOfDevotees } },
      { $inc: { bookedCount: -updated.numberOfDevotees } }
    );
  }
  return Boolean(updated);
}

async function expirePendingPayments() {
  const expired = await PaymentAttempt.find({ status: 'pending', expiresAt: { $lte: new Date() } })
    .select('_id slotId numberOfDevotees')
    .limit(100)
    .lean();

  for (const attempt of expired) {
    const claimed = await PaymentAttempt.findOneAndUpdate(
      { _id: attempt._id, status: 'pending', expiresAt: { $lte: new Date() } },
      { $set: { status: 'expired' } },
      { new: true }
    );
    if (claimed) {
      await DarshanSlot.updateOne(
        { _id: claimed.slotId, bookedCount: { $gte: claimed.numberOfDevotees } },
        { $inc: { bookedCount: -claimed.numberOfDevotees } }
      );
    }
  }
}

function getPaymentConfig(req, res) {
  const configured = razorpayConfigured();
  return res.status(200).json({
    configured,
    keyId: configured ? process.env.RAZORPAY_KEY_ID : null,
    pricePerDevotee: PRICE_PER_DEVOTEE_INR,
    currency: 'INR',
  });
}

async function createPaymentOrder(req, res) {
  const client = getRazorpayClient();
  if (!client) {
    return res.status(503).json({ message: 'Razorpay Test Mode credentials are not configured.' });
  }

  const { templeId, date, slotId } = req.body || {};
  const validated = normalizeAndValidateDevotees(req.body?.devotees);
  if (!validated.devotees) {
    return res.status(400).json({ message: validated.error });
  }
  if (!mongooseObjectId(templeId) || !mongooseObjectId(slotId) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ message: 'Select a valid temple, date, and time slot.' });
  }
  const dateValue = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ message: 'Select a valid darshan date.' });
  }

  const temple = await Temple.findById(templeId);
  if (!temple) {
    return res.status(404).json({ message: 'Temple not found.' });
  }
  const slot = await DarshanSlot.findOne({ _id: slotId, templeId, date });
  if (!slot) {
    return res.status(404).json({ message: 'Selected slot was not found for this date.' });
  }

  await expirePendingPayments();
  const count = validated.devotees.length;
  const amount = calculateAmount(count);
  let order;
  try {
    order = await client.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: `td_${crypto.randomBytes(12).toString('hex')}`,
      notes: {
        templeId: String(temple._id),
        slotId: String(slot._id),
        devoteeCount: String(count),
      },
    });
  } catch (error) {
    console.error('Razorpay order creation failed:', error.code || error.name || 'RAZORPAY_ERROR');
    return res.status(502).json({ message: 'Payment could not be started. Please try again.' });
  }

  const reservedSlot = await DarshanSlot.findOneAndUpdate(
    {
      _id: slot._id,
      $expr: { $gte: [{ $subtract: ['$capacity', '$bookedCount'] }, count] },
    },
    { $inc: { bookedCount: count } },
    { new: true }
  );
  if (!reservedSlot) {
    const current = await DarshanSlot.findById(slot._id).select('capacity bookedCount').lean();
    const remaining = Math.max(0, (current?.capacity || 0) - (current?.bookedCount || 0));
    return res.status(409).json({ message: `Only ${remaining} slots are available for this time.` });
  }

  let attempt;
  try {
    attempt = await PaymentAttempt.create({
      userId: req.user.id,
      templeId: temple._id,
      slotId: reservedSlot._id,
      date,
      day: reservedSlot.day,
      timeSlot: reservedSlot.timeLabel,
      devotees: validated.devotees,
      numberOfDevotees: count,
      amount,
      currency: 'INR',
      razorpayOrderId: order.id,
      expiresAt: new Date(Date.now() + PAYMENT_HOLD_MS),
      status: 'pending',
    });
  } catch (error) {
    await DarshanSlot.updateOne(
      { _id: reservedSlot._id, bookedCount: { $gte: count } },
      { $inc: { bookedCount: -count } }
    );
    console.error('Payment attempt persistence failed:', error.code || error.name || 'DATABASE_ERROR');
    return res.status(500).json({ message: 'Payment could not be started. Please try again.' });
  }

  return res.status(201).json({
    orderId: order.id,
    amount: attempt.amount,
    amountInPaise: order.amount,
    currency: attempt.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    expiresAt: attempt.expiresAt,
  });
}

function mongooseObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

async function finalizePaidAttempt(attempt, paymentId, temple, req) {
  let booking = await Booking.findOne({ razorpayOrderId: attempt.razorpayOrderId });
  if (!booking) {
    const bookingId = `TD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const firstDevotee = attempt.devotees[0];
    const bookingData = {
      bookingId,
      userId: attempt.userId,
      templeId: attempt.templeId,
      slotId: attempt.slotId,
      date: attempt.date,
      day: attempt.day,
      timeSlot: attempt.timeSlot,
      devoteeName: firstDevotee.fullName,
      mobileNumber: firstDevotee.mobileNumber,
      devotees: attempt.devotees,
      numberOfDevotees: attempt.numberOfDevotees,
      entryGate: assignEntryGate(attempt.templeId, attempt.slotId),
      amount: attempt.amount,
      currency: attempt.currency,
      paymentStatus: 'paid',
      razorpayOrderId: attempt.razorpayOrderId,
      razorpayPaymentId: paymentId,
      status: 'confirmed',
    };
    try {
      booking = await Booking.create(bookingData);
    } catch (error) {
      if (error.code === 11000) {
        booking = await Booking.findOne({ razorpayOrderId: attempt.razorpayOrderId });
      }
      if (!booking) {
        console.error('Paid booking persistence failed:', error.code || error.name || 'DATABASE_ERROR');
        throw new Error('Payment was received, but booking confirmation needs retry. Please contact support with your payment ID.');
      }
    }
  }

  await ensureEntryGate(booking);
  const verificationToken = await persistVerificationTokenHash(booking);
  await PaymentAttempt.updateOne(
    { _id: attempt._id, status: { $in: ['pending', 'paid'] } },
    { $set: { status: 'confirmed', razorpayPaymentId: paymentId, bookingId: booking._id } }
  );
  return createBookingPresentation(booking, temple, req, verificationToken);
}

async function verifyPayment(req, res) {
  const client = getRazorpayClient();
  if (!client) {
    return res.status(503).json({ message: 'Razorpay Test Mode credentials are not configured.' });
  }

  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  if (![orderId, paymentId, signature].every((value) => typeof value === 'string' && value.length > 0)) {
    return res.status(400).json({ message: 'Payment verification details are incomplete.' });
  }
  if (!verifyRazorpaySignature(orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET)) {
    return res.status(400).json({ message: 'Payment verification failed. No booking was confirmed.' });
  }

  const attempt = await PaymentAttempt.findOne({ razorpayOrderId: orderId, userId: req.user.id });
  if (!attempt) {
    return res.status(404).json({ message: 'Payment order not found.' });
  }
  if (attempt.status === 'confirmed' && attempt.bookingId) {
    const booking = await Booking.findById(attempt.bookingId).populate('templeId').populate('slotId');
    if (!booking) {
      return res.status(500).json({ message: 'Confirmed booking record could not be loaded.' });
    }
    await ensureEntryGate(booking);
    const token = await persistVerificationTokenHash(booking);
    return res.status(200).json({
      message: 'Payment and booking are already confirmed.',
      booking: await createBookingPresentation(booking, booking.templeId, req, token),
    });
  }
  if (attempt.status === 'cancelled' || attempt.status === 'expired' || attempt.status === 'failed') {
    return res.status(409).json({ message: 'This payment order is no longer active. Please start a new payment.' });
  }
  if (attempt.expiresAt <= new Date()) {
    await releaseReservation(attempt, 'expired');
    return res.status(410).json({ message: 'Payment session expired. Please try booking again.' });
  }

  let payment;
  try {
    payment = await client.payments.fetch(paymentId);
    if (payment.order_id !== orderId || payment.amount !== attempt.amount * 100 || payment.currency !== attempt.currency) {
      return res.status(400).json({ message: 'Payment details do not match this booking.' });
    }
    if (payment.status === 'authorized') {
      payment = await client.payments.capture(paymentId, attempt.amount * 100, attempt.currency);
    }
    if (payment.status !== 'captured') {
      await releaseReservation(attempt, 'failed');
      return res.status(402).json({ message: 'Payment was not captured. You can retry payment.' });
    }
  } catch (error) {
    console.error('Razorpay payment verification failed:', error.code || error.name || 'RAZORPAY_ERROR');
    return res.status(502).json({ message: 'Payment verification is temporarily unavailable. Please retry.' });
  }

  await PaymentAttempt.updateOne(
    { _id: attempt._id, status: 'pending' },
    { $set: { status: 'paid', razorpayPaymentId: paymentId } }
  );

  const temple = await Temple.findById(attempt.templeId);
  if (!temple) {
    return res.status(500).json({ message: 'Payment succeeded, but the temple record could not be loaded. Please contact support.' });
  }
  const paidAttempt = await PaymentAttempt.findById(attempt._id);
  const booking = await finalizePaidAttempt(paidAttempt, paymentId, temple, req);
  return res.status(200).json({ message: 'Payment verified and booking confirmed.', booking });
}

async function cancelPaymentOrder(req, res) {
  const { orderId, status } = req.body || {};
  if (typeof orderId !== 'string' || !orderId) {
    return res.status(400).json({ message: 'Payment order is required.' });
  }
  const attempt = await PaymentAttempt.findOne({ razorpayOrderId: orderId, userId: req.user.id });
  if (!attempt) {
    return res.status(404).json({ message: 'Payment order not found.' });
  }
  if (attempt.status === 'pending') {
    await releaseReservation(attempt, status === 'failed' ? 'failed' : 'cancelled');
  }
  return res.status(200).json({ message: 'Payment attempt closed.' });
}

async function getMyBookings(req, res) {
  const bookings = await Booking.find({ userId: req.user.id, paymentStatus: 'paid' })
    .populate('templeId')
    .populate('slotId')
    .sort({ createdAt: -1 });
  for (const booking of bookings) {
    await ensureEntryGate(booking);
  }
  return res.status(200).json({ bookings });
}

async function getBookingById(req, res) {
  const booking = await Booking.findById(req.params.id).populate('templeId').populate('slotId');
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }
  if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized access to booking.' });
  }
  if (booking.paymentStatus !== 'paid' || booking.status !== 'confirmed') {
    return res.status(409).json({ message: 'Only paid and confirmed bookings have a darshan pass.' });
  }

  await ensureEntryGate(booking);
  const verificationToken = await persistVerificationTokenHash(booking);
  const qrCode = await QRCode.toDataURL(createPublicVerificationUrl(req, verificationToken), { errorCorrectionLevel: 'H', margin: 2 });
  return res.status(200).json({
    booking: {
      ...booking.toObject(),
      qrCode,
    },
  });
}

async function downloadPass(req, res) {
  const booking = await Booking.findById(req.params.id).populate('templeId').populate('slotId');
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }
  if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized access to booking.' });
  }
  if (booking.paymentStatus !== 'paid' || booking.status !== 'confirmed') {
    return res.status(409).json({ message: 'Only paid and confirmed bookings have a downloadable pass.' });
  }

  await ensureEntryGate(booking);
  const verificationToken = await persistVerificationTokenHash(booking);
  const qrBuffer = await QRCode.toBuffer(createPublicVerificationUrl(req, verificationToken), { errorCorrectionLevel: 'H', margin: 2, width: 220 });
  const imagePath = booking.templeId?.image;
  if (!imagePath?.startsWith('/assets/')) {
    return res.status(500).json({ message: 'The temple image is unavailable for this pass. Please contact support.' });
  }
  const assetsRoot = path.resolve(__dirname, '../../assets');
  const imageFile = path.resolve(assetsRoot, imagePath.slice('/assets/'.length));
  const relativeImagePath = path.relative(assetsRoot, imageFile);
  if (relativeImagePath.startsWith('..') || path.isAbsolute(relativeImagePath)) {
    return res.status(500).json({ message: 'The temple image is unavailable for this pass. Please contact support.' });
  }
  let templeImage;
  try {
    templeImage = await sharp(await fs.readFile(imageFile)).jpeg({ quality: 85 }).toBuffer();
  } catch (error) {
    console.error('Pass temple image embedding failed:', error.code || error.name || 'IMAGE_ERROR');
    return res.status(500).json({ message: 'The temple image could not be prepared for this pass. Please try again.' });
  }
  const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `Temple Darshan Pass ${booking.bookingId}` } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Temple-Darshan-Pass-${booking.bookingId}.pdf"`);
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 170).fill('#fff2d8');
  doc.fillColor('#4b0d1c').font('Helvetica-Bold').fontSize(24).text('TEMPLE DARSHAN PASS', 42, 42);
  doc.fontSize(17).text(booking.templeId?.name || 'Temple Darshan', 42, 82, { width: 330 });
  doc.fillColor('#6d5f66').font('Helvetica').fontSize(12).text(booking.templeId?.location || '', 42, 112);
  doc.image(qrBuffer, doc.page.width - 160, 32, { fit: [110, 110] });

  let y = 178;
  const field = (label, value) => {
    doc.fillColor('#94858b').font('Helvetica-Bold').fontSize(8).text(label.toUpperCase(), 42, y);
    doc.fillColor('#4b0d1c').font('Helvetica-Bold').fontSize(12).text(String(value || '-'), 42, y + 13, { width: 250 });
    y += 26;
  };

  field('Booking ID', booking.bookingId);
  field('Darshan date', new Date(`${booking.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }));
  field('Darshan slot', booking.timeSlot);
  field('Entry time', formatEntryTime(booking.slotId?.timeStart, booking.timeSlot));
  field('Number of devotees', booking.numberOfDevotees);
  field('Entry gate', booking.entryGate);
  field('Total amount', `${booking.currency} ${booking.amount}`);
  field('Payment status', 'PAID');
  field('Booking status', 'CONFIRMED');
  field('QR verification', 'VERIFIED');
  field('Pass status', 'VALID ENTRY PASS');

  const gateX = 335;
  const gateY = 178;
  const gateWidth = doc.page.width - gateX - 42;
  doc.roundedRect(gateX, gateY, gateWidth, 190, 12).fillAndStroke('#fff2d8', '#e7d5b5');
  doc.fillColor('#94858b').font('Helvetica-Bold').fontSize(9).text('YOUR ENTRY GATE', gateX + 14, gateY + 14, { width: gateWidth - 28, align: 'center' });
  doc.fillColor('#4b0d1c').font('Helvetica-Bold').fontSize(24).text(booking.entryGate.toUpperCase(), gateX + 12, gateY + 32, { width: gateWidth - 24, align: 'center' });
  const archX = gateX + (gateWidth - 100) / 2;
  const archY = gateY + 70;
  doc.rect(archX, archY + 42, 100, 49).fill('#4b0d1c');
  doc.path(`M ${archX} ${archY + 44} Q ${archX + 50} ${archY - 18} ${archX + 100} ${archY + 44} Z`).fill('#b7772e');
  doc.path(`M ${archX + 18} ${archY + 91} L ${archX + 18} ${archY + 52} Q ${archX + 50} ${archY + 12} ${archX + 82} ${archY + 52} L ${archX + 82} ${archY + 91} Z`).fill('#fff8ee');
  doc.fillColor('#6d5f66').font('Helvetica').fontSize(8).text('ENTRY POINT', gateX + 14, gateY + 165, { width: gateWidth - 28, align: 'center' });

  doc.moveTo(42, 470).lineTo(doc.page.width - 42, 470).strokeColor('#e7d5b5').stroke();
  y = 486;
  doc.fillColor('#4b0d1c').font('Helvetica-Bold').fontSize(15).text('Devotees', 42, y);
  y += 24;
  for (const [index, devotee] of getBookingDevotees(booking).entries()) {
    const details = `Age ${devotee.age} · ${devotee.gender}`;
    const nameHeight = doc.font('Helvetica-Bold').fontSize(10).heightOfString(`${index + 1}. ${devotee.fullName}`, { width: 470 });
    if (y + nameHeight + 28 > doc.page.height - 44) {
      doc.addPage();
      y = 54;
    }
    doc.fillColor('#4b0d1c').font('Helvetica-Bold').fontSize(10)
      .text(`${index + 1}. ${devotee.fullName}`, 42, y, { width: 470 });
    doc.fillColor('#6d5f66').font('Helvetica').fontSize(9)
      .text(details, 58, y + nameHeight + 2, { width: 450 });
    y += nameHeight + 24;
  }

  if (y + 125 > doc.page.height - 35) {
    doc.addPage();
    y = 48;
  }
  doc.image(templeImage, 42, y + 10, { fit: [220, 115] });
  doc.end();
}

async function verifyPublicBooking(req, res) {
  const token = req.params.token;
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    return res.status(404).json({ message: 'Booking verification link is invalid.' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const booking = await Booking.findOne({ verificationTokenHash: tokenHash, paymentStatus: 'paid', status: 'confirmed' })
    .populate('templeId')
    .populate('slotId')
    .lean();
  if (!booking) {
    return res.status(404).json({ message: 'No paid confirmed booking matches this verification link.' });
  }
  const entryGate = booking.entryGate || assignEntryGate(booking.templeId?._id || booking.templeId, booking.slotId?._id || booking.slotId);
  if (!booking.entryGate) {
    await Booking.updateOne({ _id: booking._id, entryGate: { $exists: false } }, { $set: { entryGate } });
  }
  return res.status(200).json({
    verified: true,
    qrVerificationStatus: 'VERIFIED',
    bookingId: booking.bookingId,
    temple: booking.templeId?.name || 'Temple Darshan',
    location: booking.templeId?.location || '',
    date: booking.date,
    time: booking.timeSlot,
    entryTime: formatEntryTime(booking.slotId?.timeStart, booking.timeSlot),
    entryGate,
    numberOfDevotees: booking.numberOfDevotees,
    devotees: getBookingDevotees(booking).map(({ fullName }) => fullName),
    paymentStatus: 'PAID',
    bookingStatus: 'CONFIRMED',
  });
}

async function cancelBooking(req, res) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found.' });
  }
  if (booking.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Unauthorized to cancel this booking.' });
  }
  if (booking.status !== 'confirmed' || booking.paymentStatus !== 'paid') {
    return res.status(400).json({ message: 'Only confirmed paid bookings can be cancelled.' });
  }
  await ensureEntryGate(booking);
  booking.status = 'cancelled';
  await booking.save();
  await DarshanSlot.updateOne(
    { _id: booking.slotId, bookedCount: { $gte: booking.numberOfDevotees } },
    { $inc: { bookedCount: -booking.numberOfDevotees } }
  );
  return res.status(200).json({ message: 'Booking cancelled successfully.', booking });
}

module.exports = {
  getPaymentConfig,
  createPaymentOrder,
  verifyPayment,
  cancelPaymentOrder,
  getMyBookings,
  getBookingById,
  downloadPass,
  verifyPublicBooking,
  cancelBooking,
  normalizeAndValidateDevotees,
  calculateAmount,
  verifyRazorpaySignature,
  assignEntryGate,
  formatEntryTime,
};
