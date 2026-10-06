const DarshanSlot = require('../models/DarshanSlot');

async function getSlots(req, res) {
  try {
    const { templeId, date } = req.query;

    const query = {};
    if (templeId) query.templeId = templeId;
    if (date) query.date = date;

    const slots = await DarshanSlot.find(query)
      .sort({ date: 1, timeStart: 1 })
      .populate('templeId');

    return res.status(200).json({ slots });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch slots.', error: error.message });
  }
}

async function getSlotById(req, res) {
  try {
    const slot = await DarshanSlot.findById(req.params.id).populate('templeId');
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found.' });
    }
    return res.status(200).json({ slot });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch slot.', error: error.message });
  }
}

module.exports = {
  getSlots,
  getSlotById,
};
