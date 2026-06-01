const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const promoController = require('../controllers/promo.controller');

const router = express.Router();

router.get('/', auth, adminAuth, promoController.list);
router.get('/products', auth, adminAuth, promoController.listProducts);
router.patch('/products/:productId', auth, adminAuth, promoController.updateProductPromo);
router.post('/products/bulk', auth, adminAuth, promoController.bulkProductPromos);
router.post('/products/clear', auth, adminAuth, promoController.clearProductPromos);
router.post('/', auth, adminAuth, promoController.create);
router.put('/:id', auth, adminAuth, promoController.update);
router.patch('/:id/toggle', auth, adminAuth, promoController.toggle);
router.delete('/:id', auth, adminAuth, promoController.remove);
router.post('/validate', auth, promoController.validate);
router.get('/active', auth, promoController.listActive);

module.exports = router;
