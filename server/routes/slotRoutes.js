const express = require('express');
const { getSlots, getSlotById } = require('../controllers/slotController');

const router = express.Router();

router.get('/', getSlots);
router.get('/:id', getSlotById);

module.exports = router;
