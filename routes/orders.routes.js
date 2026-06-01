const express = require('express');
const { auth, adminAuth, adminOrLivreurAuth } = require('../middleware/auth');
const {
  getOrders,
  getStats,
  createOrder,
  createAdminOrder,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  getOrderTracking,
} = require('../controllers/order.controller');

const router = express.Router();

// Client & Admin list
router.get('/', auth, getOrders);

// Admin stats
router.get('/stats', auth, adminAuth, getStats);

// Client create
router.post('/', auth, createOrder);

// Suivi livraison (client propriétaire)
router.get('/:id/tracking', auth, getOrderTracking);

// Admin create on behalf
router.post('/admin', auth, adminAuth, createAdminOrder);

// Livreur / admin — mise à jour statut livraison uniquement
router.patch('/:id/status', auth, adminOrLivreurAuth, updateOrderStatus);

// Admin update (champs complets)
router.put('/:id', auth, adminAuth, updateOrder);

// Admin / owner delete
router.delete('/:id', auth, deleteOrder);

module.exports = router;
