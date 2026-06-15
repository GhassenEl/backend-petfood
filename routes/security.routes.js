const express = require('express');
const { auth, adminAuth, moderatorAuth } = require('../middleware/auth');
const {
  scanText,
  scanPayloadHandler,
  scanFile,
  getThreats,
  getStatus,
  getIntrusionEvents,
} = require('../controllers/security.controller');

const router = express.Router();

router.get('/status', getStatus);
router.post('/scan', scanText);
router.post('/scan/payload', scanPayloadHandler);
router.post('/scan/file', auth, scanFile);
router.get('/threats', auth, moderatorAuth, getThreats);
router.get('/intrusions', auth, adminAuth, getIntrusionEvents);

module.exports = router;
