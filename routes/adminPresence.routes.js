const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { getAdminLive } = require('../controllers/presence.controller');

const router = express.Router();

router.get('/live', auth, adminAuth, getAdminLive);

module.exports = router;
