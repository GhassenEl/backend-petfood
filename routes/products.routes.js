const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getRecommendations,
  getPetProductRecommendations,
  getNearbyProducts,
  adjustStock,
  getLowStock,
  bulkUpdateStock
} = require('../controllers/product.controller');

const router = express.Router();

// Public / authenticated
router.get('/', getProducts);
router.get('/recommendations/pets', auth, getPetProductRecommendations);
router.get('/recommendations', auth, getRecommendations);
router.get('/nearby', auth, getNearbyProducts);

// Admin only
router.post('/', auth, adminAuth, createProduct);
router.put('/:id', auth, adminAuth, updateProduct);
router.delete('/:id', auth, adminAuth, deleteProduct);

router.get('/low-stock', auth, adminAuth, getLowStock);
router.patch('/:id/stock/adjust', auth, adminAuth, adjustStock);
router.post('/bulk-update', auth, adminAuth, bulkUpdateStock);

module.exports = router;
