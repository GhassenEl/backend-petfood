const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getOverview,
  getMovements,
  updateThresholds,
  adjustStock,
  bulkReorder,
} = require('../controllers/adminStock.controller');

const router = express.Router();

router.get('/overview', auth, adminAuth, getOverview);
router.get('/movements', auth, adminAuth, getMovements);
router.patch('/products/:id/thresholds', auth, adminAuth, updateThresholds);
router.patch('/products/:id/adjust', auth, adminAuth, adjustStock);
router.post('/reorder', auth, adminAuth, bulkReorder);

module.exports = router;
