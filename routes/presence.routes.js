const express = require('express');
const { postHeartbeat } = require('../controllers/presence.controller');

const router = express.Router();

router.post('/heartbeat', postHeartbeat);

module.exports = router;
