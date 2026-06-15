const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { getLive, getPerformance } = require('../controllers/platform.controller');

const router = express.Router();

router.get('/live', auth, getLive);
router.get('/performance', auth, adminAuth, getPerformance);

module.exports = router;
