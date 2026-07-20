const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { getLive, getPerformance, getStackHealth, getDevOpsStatus, getLiveMetrics } = require('../controllers/platform.controller');
const { getPlatformPack } = require('../controllers/security.controller');

const router = express.Router();

router.get('/stack-health', getStackHealth);
router.get('/live', auth, getLive);
router.get('/performance', auth, adminAuth, getPerformance);
router.get('/devops/status', auth, adminAuth, getDevOpsStatus);
router.get('/devops/metrics/live', auth, adminAuth, getLiveMetrics);
router.get('/security', auth, adminAuth, getPlatformPack);

module.exports = router;
