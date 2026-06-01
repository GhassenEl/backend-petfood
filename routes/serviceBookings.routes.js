const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getCatalog,
  getSlots,
  listBookings,
  createBooking,
  payBooking,
  cancelBooking,
  estimatePrice,
} = require('../controllers/serviceBooking.controller');

const router = express.Router();

router.get('/catalog', auth, getCatalog);
router.get('/slots', auth, getSlots);
router.get('/estimate', auth, estimatePrice);
router.get('/', auth, listBookings);
router.post('/', auth, createBooking);
router.post('/:id/pay', auth, payBooking);
router.post('/:id/cancel', auth, cancelBooking);

module.exports = router;
