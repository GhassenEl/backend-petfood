const express = require('express');
const { auth } = require('../middleware/auth');
const { getMethods, getConfig } = require('../controllers/payments.controller');
const {
  createOrder: paypalCreate,
  captureOrder: paypalCapture,
  getConfig: paypalConfig,
} = require('../controllers/paypal.controller');

const router = express.Router();

router.get('/methods', auth, getMethods);
router.get('/config', auth, getConfig);
router.post('/paypal/create-order', auth, paypalCreate);
router.post('/paypal/capture-order', auth, paypalCapture);
router.get('/paypal/config', auth, paypalConfig);

module.exports = router;
