const express = require('express');
const { auth, adminAuth, moderatorAuth } = require('../middleware/auth');
const {
  scanText,
  scanPayloadHandler,
  scanFile,
  getThreats,
  getStatus,
  getIntrusionEvents,
  getSessions,
  revokeSessionHandler,
  getPlatformPack,
} = require('../controllers/security.controller');
const { securityScanLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/status', getStatus);
router.post('/scan', securityScanLimiter, scanText);
router.post('/scan/payload', securityScanLimiter, scanPayloadHandler);
router.post('/scan/file', auth, scanFile);
router.get('/threats', auth, moderatorAuth, getThreats);
router.get('/intrusions', auth, adminAuth, getIntrusionEvents);
router.get('/sessions', auth, adminAuth, getSessions);
router.delete('/sessions/:id', auth, adminAuth, revokeSessionHandler);
router.get('/platform-pack', auth, adminAuth, getPlatformPack);

module.exports = router;
