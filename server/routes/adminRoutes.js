const express = require('express');
const {
  getDashboardStats,
  getAdminBookings,
  createTemple,
  updateTemple,
  deleteTemple,
  createSlot,
  updateSlot,
  deleteSlot,
} = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get('/stats', getDashboardStats);
router.get('/bookings', getAdminBookings);
router.post('/temples', createTemple);
router.put('/temples/:id', updateTemple);
router.delete('/temples/:id', deleteTemple);
router.post('/slots', createSlot);
router.put('/slots/:id', updateSlot);
router.delete('/slots/:id', deleteSlot);

module.exports = router;
