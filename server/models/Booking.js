const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    templeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Temple',
      required: true,
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DarshanSlot',
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    day: {
      type: String,
      required: true,
    },
    timeSlot: {
      type: String,
      required: true,
    },
    devoteeName: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    devotees: {
      type: [{
        fullName: { type: String, required: true, trim: true },
        age: { type: Number, required: true, min: 0, max: 120 },
        gender: { type: String, required: true, enum: ['Female', 'Male', 'Other'] },
        mobileNumber: { type: String, required: true, trim: true },
      }],
      default: undefined,
    },
    numberOfDevotees: {
      type: Number,
      required: true,
      min: 1,
    },
    entryGate: {
      type: String,
      enum: ['Gate 1', 'Gate 2', 'Gate 3'],
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled'],
      default: 'pending',
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    verificationTokenHash: {
      type: String,
      select: false,
    },
    status: {
      type: String,
      enum: ['confirmed', 'cancelled', 'completed', 'payment_pending', 'payment_failed'],
      default: 'confirmed',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
