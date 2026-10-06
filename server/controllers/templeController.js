const Temple = require('../models/Temple');

async function getTemples(req, res) {
  try {
    const temples = await Temple.find({}).sort({ createdAt: 1 });
    return res.status(200).json({ temples });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch temples.', error: error.message });
  }
}

async function getTempleById(req, res) {
  try {
    const temple = await Temple.findById(req.params.id);
    if (!temple) {
      return res.status(404).json({ message: 'Temple not found.' });
    }
    return res.status(200).json({ temple });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to fetch temple.', error: error.message });
  }
}

module.exports = {
  getTemples,
  getTempleById,
};
