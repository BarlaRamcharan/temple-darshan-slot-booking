const mongoose = require('mongoose');

const devoteeSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 0, max: 120 },
    gender: { type: String, required: true, enum: ['Female', 'Male', 'Other'] },
    mobileNumber: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const paymentAttemptSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    templeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Temple', required: true },
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'DarshanSlot', required: true },
    date: { type: String, required: true },
    day: { type: String, required: true },
    timeSlot: { type: String, required: true },
    devotees: { type: [devoteeSchema], required: true, validate: (value) => value.length > 0 },
    numberOfDevotees: { type: Number, required: true, min: 1 },
    amount: { type: Number, required: true, min: 100 },
    currency: { type: String, required: true, enum: ['INR'], default: 'INR' },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'confirmed', 'failed', 'cancelled', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentAttempt', paymentAttemptSchema);
