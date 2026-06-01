const express = require('express');
const { auth } = require('../middleware/auth');
const { getWallet, topUp } = require('../controllers/wallet.controller');

const router = express.Router();

router.get('/', auth, getWallet);
router.post('/topup', auth, topUp);

module.exports = router;
