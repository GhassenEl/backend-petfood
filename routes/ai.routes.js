const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getInsights,
  getRecommendations,
  getPublicRecommendations,
  getVisitorIntelligenceHandler,
  getTopProducts,
  getHealthRecommendationsHandler,
  getSalesForecastHandler,
  getMlBenchmarkHandler,
} = require('../controllers/aiAgent.controller');
const advancedAi = require('../controllers/advancedAi.controller');

const router = express.Router();

router.get('/insights', auth, getInsights);
router.get('/recommendations', auth, getRecommendations);
router.get('/recommendations/public', getPublicRecommendations);
router.get('/visitor/intelligence', getVisitorIntelligenceHandler);
router.get('/health-recommendations', auth, getHealthRecommendationsHandler);
router.get('/top-products', auth, getTopProducts);
router.get('/admin/top-products', auth, adminAuth, getTopProducts);
router.get('/admin/sales-forecast', auth, adminAuth, getSalesForecastHandler);
router.get('/admin/ml-benchmark', auth, adminAuth, getMlBenchmarkHandler);
router.get('/admin/advanced-pack', auth, adminAuth, advancedAi.getAdminAdvancedPack);
router.post('/admin/copilot', auth, adminAuth, advancedAi.postAdminCopilot);
router.get('/client/advanced-pack', auth, advancedAi.getClientAdvancedPack);

module.exports = router;
