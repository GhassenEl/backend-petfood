const express = require('express');
const { auth } = require('../middleware/auth');
const { getAccount, redeem, getOffers } = require('../controllers/loyalty.controller');

const router = express.Router();

router.get('/offers', auth, getOffers);
router.get('/', auth, getAccount);
router.post('/redeem', auth, redeem);

module.exports = router;
