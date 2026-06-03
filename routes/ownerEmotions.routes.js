const express = require('express');
const { auth } = require('../middleware/auth');
const { getDashboard, postAnalyze } = require('../controllers/ownerEmotion.controller');

const router = express.Router();

router.get('/dashboard', auth, getDashboard);
router.post('/analyze', auth, postAnalyze);

module.exports = router;
