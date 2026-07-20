const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { threatScanMiddleware } = require('../middleware/threatScan.middleware');
const {
  sendMessage,
  sendPetMessage,
  sendPublicMessage,
  getHistory,
  clearHistory,
  getEnrichedHistoryHandler,
  analyzeChatImageHandler,
  getAdminChatHistoryHandler,
} = require('../controllers/chat.controller');

const router = express.Router();

router.post('/public', threatScanMiddleware({ source: 'chat_public' }), sendPublicMessage);
router.post('/message', auth, threatScanMiddleware({ source: 'chat_message' }), sendMessage);
router.post('/pet', auth, threatScanMiddleware({ source: 'chat_pet' }), sendPetMessage);
router.get('/history', auth, getHistory);
router.get('/history/enriched', auth, getEnrichedHistoryHandler);
router.get('/history/admin', auth, adminAuth, getAdminChatHistoryHandler);
router.post('/analyze-image', auth, threatScanMiddleware({ source: 'chat_image' }), analyzeChatImageHandler);
router.delete('/history', auth, clearHistory);

module.exports = router;
