const express = require('express');
const {
  getPaymentConfig,
  createPaymentOrder,
  verifyPayment,
  cancelPaymentOrder,
  getMyBookings,
  getBookingById,
  downloadPass,
  verifyPublicBooking,
  cancelBooking,
} = require('../controllers/bookingController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const wrapAsync = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

router.get('/verify/:token', wrapAsync(verifyPublicBooking));
router.use(requireAuth);
router.get('/payment/config', getPaymentConfig);
router.post('/payment/order', wrapAsync(createPaymentOrder));
router.post('/payment/verify', wrapAsync(verifyPayment));
router.post('/payment/cancel', wrapAsync(cancelPaymentOrder));
router.get('/my', wrapAsync(getMyBookings));
router.get('/:id/pass.pdf', wrapAsync(downloadPass));
router.get('/:id', wrapAsync(getBookingById));
router.patch('/:id/cancel', wrapAsync(cancelBooking));

module.exports = router;
