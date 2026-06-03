const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const {
  getInsights,
  getRecommendations,
  getTopProducts,
  getHealthRecommendationsHandler,
  getSalesForecastHandler,
  getMlBenchmarkHandler,
} = require('../controllers/aiAgent.controller');

const router = express.Router();

router.get('/insights', auth, getInsights);
router.get('/recommendations', auth, getRecommendations);
router.get('/health-recommendations', auth, getHealthRecommendationsHandler);
router.get('/top-products', auth, getTopProducts);
router.get('/admin/top-products', auth, adminAuth, getTopProducts);
router.get('/admin/sales-forecast', auth, adminAuth, getSalesForecastHandler);
router.get('/admin/ml-benchmark', auth, adminAuth, getMlBenchmarkHandler);

module.exports = router;
