const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getMessages,
  sendMessage,
  getUnreadCount
} = require('../controllers/message.controller');

const router = express.Router();

router.get('/', auth, getMessages);
router.post('/', auth, sendMessage);
router.get('/unread', auth, getUnreadCount);

module.exports = router;
