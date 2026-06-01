const express = require('express');
const { auth, livreurAuth } = require('../middleware/auth');
const {
  dashboard,
  routePlan,
  advancedStats,
  postIssue,
  postGps,
  mission,
  claim,
  complete,
} = require('../controllers/livreur.controller');

const router = express.Router();

router.use(auth, livreurAuth);

router.get('/dashboard', dashboard);
router.get('/mission', mission);
router.get('/route', routePlan);
router.get('/stats', advancedStats);
router.post('/gps', postGps);
router.post('/orders/:orderId/claim', claim);
router.post('/orders/:orderId/complete', complete);
router.post('/orders/:orderId/issue', postIssue);

module.exports = router;
