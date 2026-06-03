const express = require('express');
const { auth, adminAuth, livreurAuth, vetAuth } = require('../middleware/auth');
const {
  getAdminInsights,
  getMlHealth,
  postSeniorDogRank,
  getOrderRisk,
  getClientPack,
  getAdminOrdersRisk,
  getAdminPack,
  getLivreurPack,
  getVetPack,
} = require('../controllers/mlPlatform.controller');

const router = express.Router();

router.get('/health', auth, adminAuth, getMlHealth);
router.get('/admin/insights', auth, adminAuth, getAdminInsights);
router.get('/admin/orders-risk', auth, adminAuth, getAdminOrdersRisk);
router.get('/client/pack', auth, getClientPack);
router.get('/admin/pack', auth, adminAuth, getAdminPack);
router.get('/livreur/pack', auth, livreurAuth, getLivreurPack);
router.get('/vet/pack', auth, vetAuth, getVetPack);
router.get('/rank/senior-dog', auth, postSeniorDogRank);
router.get('/orders/:orderId/cancel-risk', auth, adminAuth, getOrderRisk);

module.exports = router;
