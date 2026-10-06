const Temple = require('../models/Temple');
const DarshanSlot = require('../models/DarshanSlot');
const Booking = require('../models/Booking');

async function getDashboardStats(req, res) {
  try {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    const [totalTemples, todaysBookings, upcomingBookings, availableSlots, completedBookings, cancelledBookings] = await Promise.all([
      Temple.countDocuments(),
      Booking.countDocuments({ date: todayISO, paymentStatus: 'paid' }),
      Booking.countDocuments({ date: { $gte: todayISO }, status: 'confirmed', paymentStatus: 'paid' }),
      DarshanSlot.aggregate([
        { $match: { date: { $gte: todayISO } } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$capacity', '$bookedCount'] } } } },
      ]),
      Booking.countDocuments({ status: 'completed', paymentStatus: 'paid' }),
      Booking.countDocuments({ status: 'cancelled', paymentStatus: 'paid' }),
    ]);

    const availableSlotCount = (availableSlots[0]?.total || 0);

    return res.status(200).json({
      stats: {
        totalTemples,
        todaysBookings,
        upcomingBookings,
        availableSlots: availableSlotCount,
        completedBookings,
        cancelledBookings,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch dashboard stats.', error: error.message });
  }
}

async function getAdminBookings(req, res) {
  try {
    const bookings = await Booking.find({})
      .select('-verificationTokenHash')
      .populate('userId')
      .populate('templeId')
      .populate('slotId')
      .sort({ createdAt: -1 });

    return res.status(200).json({ bookings });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch bookings.', error: error.message });
  }
}

async function createTemple(req, res) {
  try {
    const { name, location, description, image } = req.body || {};

    if (!name || !location || !description || !image) {
      return res.status(400).json({ message: 'Temple name, location, description, and image are required.' });
    }

    const temple = await Temple.create({ name, location, description, image });
    return res.status(201).json({ message: 'Temple added successfully.', temple });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create temple.', error: error.message });
  }
}

async function updateTemple(req, res) {
  try {
    const temple = await Temple.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!temple) {
      return res.status(404).json({ message: 'Temple not found.' });
    }
    return res.status(200).json({ message: 'Temple updated successfully.', temple });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update temple.', error: error.message });
  }
}

async function deleteTemple(req, res) {
  try {
    const temple = await Temple.findByIdAndDelete(req.params.id);
    if (!temple) {
      return res.status(404).json({ message: 'Temple not found.' });
    }

    await DarshanSlot.deleteMany({ templeId: req.params.id });
    return res.status(200).json({ message: 'Temple deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete temple.', error: error.message });
  }
}

async function createSlot(req, res) {
  try {
    const { templeId, date, day, timeLabel, timeStart, timeEnd, capacity } = req.body || {};

    if (!templeId || !date || !timeLabel || !timeStart || !timeEnd || !capacity) {
      return res.status(400).json({ message: 'Temple, date, time details, and capacity are required.' });
    }

    const temple = await Temple.findById(templeId);
    if (!temple) {
      return res.status(404).json({ message: 'Temple not found.' });
    }

    const slot = await DarshanSlot.create({
      templeId,
      date,
      day: day || new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
      timeLabel,
      timeStart,
      timeEnd,
      capacity: Number(capacity),
      bookedCount: 0,
    });

    return res.status(201).json({ message: 'Slot created successfully.', slot });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to create slot.', error: error.message });
  }
}

async function updateSlot(req, res) {
  try {
    const slot = await DarshanSlot.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found.' });
    }
    return res.status(200).json({ message: 'Slot updated successfully.', slot });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to update slot.', error: error.message });
  }
}

async function deleteSlot(req, res) {
  try {
    const slot = await DarshanSlot.findByIdAndDelete(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found.' });
    }
    return res.status(200).json({ message: 'Slot deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete slot.', error: error.message });
  }
}

module.exports = {
  getDashboardStats,
  getAdminBookings,
  createTemple,
  updateTemple,
  deleteTemple,
  createSlot,
  updateSlot,
  deleteSlot,
};
