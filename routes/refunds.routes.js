const express = require('express');
const { auth, adminAuth, vendorAuth, moderatorAuth } = require('../middleware/auth');
const c = require('../controllers/refund.controller');

const router = express.Router();

router.post('/request', auth, c.postRequest);

module.exports = router;
