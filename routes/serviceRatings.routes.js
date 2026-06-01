const express = require('express');
const { auth } = require('../middleware/auth');
const {
  getRatings,
  getEligible,
  createRating,
  getStats,
  deleteRating,
} = require('../controllers/serviceRating.controller');

const router = express.Router();

router.get('/stats', getStats);
router.get('/eligible', auth, getEligible);
router.get('/', auth, getRatings);
router.post('/', auth, createRating);
router.delete('/:id', auth, deleteRating);

module.exports = router;
