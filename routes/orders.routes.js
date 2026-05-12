const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getOrders,
  getStats,
  createOrder,
  createAdminOrder,
  updateOrder,
  deleteOrder
} = require('../controllers/order.controller');

const router = express.Router();

// Client & Admin list
router.get('/', auth, getOrders);

// Admin stats
router.get('/stats', auth, adminAuth, getStats);

// Client create
router.post('/', auth, createOrder);

// Admin create on behalf
router.post('/admin', auth, adminAuth, createAdminOrder);

// Admin update
router.put('/:id', auth, adminAuth, updateOrder);

// Admin / owner delete
router.delete('/:id', auth, deleteOrder);

module.exports = router;
