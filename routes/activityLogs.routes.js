const express = require('express');
const { auth } = require('../middleware/auth');
const { appendActivityLog } = require('../controllers/activityLog.controller');

const router = express.Router();

router.post('/', auth, appendActivityLog);

module.exports = router;
