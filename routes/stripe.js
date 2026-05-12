const express = require('express');
const { auth } = require('../middleware/auth');
const {
  createPaymentIntent,
  confirmPayment,
  getConfig
} = require('../controllers/stripe.controller');

const router = express.Router();

router.post('/create-payment-intent', auth, createPaymentIntent);
router.post('/confirm-payment', auth, confirmPayment);
router.get('/config', getConfig);

module.exports = router;
