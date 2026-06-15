const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  listActivityLogs,
  appendActivityLog,
  exportActivityLogs,
} = require('../controllers/activityLog.controller');

const router = express.Router();

router.get('/', auth, adminAuth, listActivityLogs);
router.get('/export.json', auth, adminAuth, exportActivityLogs);
router.get('/export.csv', auth, adminAuth, exportActivityLogs);

module.exports = router;
