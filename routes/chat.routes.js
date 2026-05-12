const express = require('express');
const { auth } = require('../middleware/auth');
const {
  sendMessage,
  getHistory,
  clearHistory
} = require('../controllers/chat.controller');

const router = express.Router();

router.post('/message', auth, sendMessage);
router.get('/history', auth, getHistory);
router.delete('/history', auth, clearHistory);

module.exports = router;
