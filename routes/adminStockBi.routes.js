const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { getStockBiPack } = require('../controllers/adminStockBi.controller');

const router = express.Router();

router.get('/pack', auth, adminAuth, getStockBiPack);

module.exports = router;
