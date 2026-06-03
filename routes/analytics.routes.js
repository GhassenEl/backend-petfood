const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { getHub, getAlerts, getCatalog, getExport } = require('../controllers/analytics.controller');

const router = express.Router();

router.get('/hub', auth, adminAuth, getHub);
router.get('/alerts', auth, adminAuth, getAlerts);
router.get('/datasets', auth, adminAuth, getCatalog);
router.get('/export/:table', auth, adminAuth, getExport);

module.exports = router;
