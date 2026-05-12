const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getNotifications,
  markAsRead,
  getUnreadCount
} = require('../controllers/notification.controller');

const router = express.Router();

router.get('/', auth, getNotifications);
router.put('/:id/read', auth, markAsRead);
router.get('/count', auth, getUnreadCount);

module.exports = router;
