const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getMyPlans,
  createPlan,
  deletePlan,
  syncLocalPlans,
} = require('../controllers/nutrition.controller');

const router = express.Router();

router.get('/plans', auth, getMyPlans);
router.post('/plans', auth, createPlan);
router.post('/plans/sync-local', auth, syncLocalPlans);
router.delete('/plans/:id', auth, deletePlan);

module.exports = router;
